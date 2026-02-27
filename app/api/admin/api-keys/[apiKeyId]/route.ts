import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSuperAdmin } from "@/lib/access";
import { getAdminRequestMeta, writeAdminAuditLog } from "@/lib/admin-audit";
import { actionReasonSchema } from "@/lib/admin-helpers";
import { checkAdminRateLimit } from "@/lib/admin-rate-limit";
import { getApiKeyCreateRuleWithSettings } from "@/lib/api-key-rules";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/lib/system-settings";

export const runtime = "nodejs";

const updateApiKeySchema = z.object({
  status: z.enum(["ACTIVE", "REVOKED"]).optional(),
  dailyLimit: z.coerce.number().int().positive().optional(),
  label: z.string().trim().max(40).optional(),
  reason: actionReasonSchema,
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ apiKeyId: string }> },
) {
  const adminUser = await requireSuperAdmin();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const rate = checkAdminRateLimit({
    userId: adminUser.id,
    scope: "admin-api-key-patch",
    maxHits: 50,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Too many API key actions. Retry in ${rate.retryAfterSec}s.` },
      { status: 429 },
    );
  }

  const { apiKeyId } = await context.params;
  if (!apiKeyId) {
    return NextResponse.json({ error: "API key id is required." }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = updateApiKeySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request data." }, { status: 400 });
  }

  const targetBefore = await prisma.apiKey.findUnique({
    where: { id: apiKeyId },
    select: {
      id: true,
      key: true,
      label: true,
      status: true,
      dailyLimit: true,
      userId: true,
      user: {
        select: {
          id: true,
          plan: true,
          role: true,
        },
      },
    },
  });

  if (!targetBefore) {
    return NextResponse.json({ error: "API key not found." }, { status: 404 });
  }

  let nextDailyLimit: number | undefined;
  if (parsed.data.dailyLimit !== undefined) {
    const settings = await getSystemSettings();
    const rule = getApiKeyCreateRuleWithSettings(targetBefore.user.plan, targetBefore.user.role, settings);
    nextDailyLimit = Math.min(parsed.data.dailyLimit, rule.maxLimitPerKey);
  }

  const targetAfter = await prisma.apiKey.update({
    where: { id: apiKeyId },
    data: {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(nextDailyLimit !== undefined ? { dailyLimit: nextDailyLimit } : {}),
      ...(parsed.data.label !== undefined ? { label: parsed.data.label || null } : {}),
    },
    select: {
      id: true,
      key: true,
      label: true,
      status: true,
      dailyLimit: true,
      userId: true,
    },
  });

  const requestMeta = getAdminRequestMeta(request);
  await writeAdminAuditLog(prisma, adminUser.id, {
    action: "ADMIN_API_KEY_UPDATE",
    targetType: "API_KEY",
    targetId: apiKeyId,
    reason: parsed.data.reason,
    before: targetBefore,
    after: targetAfter,
    ipAddress: requestMeta.ipAddress,
    userAgent: requestMeta.userAgent,
  });

  return NextResponse.json({ message: "API key updated." }, { status: 200 });
}
