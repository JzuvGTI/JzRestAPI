import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSuperAdmin } from "@/lib/access";
import { getAdminRequestMeta, writeAdminAuditLog } from "@/lib/admin-audit";
import { actionReasonSchema } from "@/lib/admin-helpers";
import { checkAdminRateLimit } from "@/lib/admin-rate-limit";
import { generateUniqueApiKey } from "@/lib/api-key";
import { getApiKeyCreateRuleWithSettings, getBaseDailyLimitByPlanWithSettings } from "@/lib/api-key-rules";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/lib/system-settings";

export const runtime = "nodejs";

const createSchema = z.object({
  label: z.string().trim().max(40).optional(),
  dailyLimit: z.coerce.number().int().positive().optional(),
  reason: actionReasonSchema,
});

export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const adminUser = await requireSuperAdmin();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const rate = checkAdminRateLimit({
    userId: adminUser.id,
    scope: "admin-user-api-key-create",
    maxHits: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Too many API key create actions. Retry in ${rate.retryAfterSec}s.` },
      { status: 429 },
    );
  }

  const { userId } = await context.params;
  if (!userId) {
    return NextResponse.json({ error: "User id is required." }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request data." }, { status: 400 });
  }

  const settings = await getSystemSettings();
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, plan: true, role: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const rule = getApiKeyCreateRuleWithSettings(targetUser.plan, targetUser.role, settings);
  const existingKeyCount = await prisma.apiKey.count({
    where: { userId: targetUser.id },
  });

  if (existingKeyCount >= rule.maxKeys) {
    return NextResponse.json({ error: `Maximum API keys reached (${rule.maxKeys}).` }, { status: 400 });
  }

  const baseLimit = getBaseDailyLimitByPlanWithSettings(targetUser.plan, settings);
  const requestedLimit = parsed.data.dailyLimit ?? baseLimit;
  const finalDailyLimit = Math.min(requestedLimit, rule.maxLimitPerKey);

  const keyValue = await generateUniqueApiKey(prisma);
  const apiKey = await prisma.apiKey.create({
    data: {
      userId: targetUser.id,
      key: keyValue,
      label: parsed.data.label?.trim() || `Admin Key #${existingKeyCount + 1}`,
      status: "ACTIVE",
      dailyLimit: finalDailyLimit,
    },
    select: {
      id: true,
      userId: true,
      key: true,
      label: true,
      status: true,
      dailyLimit: true,
      createdAt: true,
    },
  });

  const requestMeta = getAdminRequestMeta(request);
  await writeAdminAuditLog(prisma, adminUser.id, {
    action: "ADMIN_API_KEY_CREATE",
    targetType: "API_KEY",
    targetId: apiKey.id,
    reason: parsed.data.reason,
    before: {
      userId: targetUser.id,
      userEmail: targetUser.email,
      existingKeyCount,
      maxKeys: rule.maxKeys,
      maxLimitPerKey: rule.maxLimitPerKey,
    },
    after: apiKey,
    ipAddress: requestMeta.ipAddress,
    userAgent: requestMeta.userAgent,
  });

  return NextResponse.json({ message: "API key created.", apiKey }, { status: 201 });
}
