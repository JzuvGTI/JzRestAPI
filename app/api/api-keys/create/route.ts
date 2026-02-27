import { NextResponse } from "next/server";
import { z } from "zod";

import { generateUniqueApiKey } from "@/lib/api-key";
import { getApiKeyCreateRuleWithSettings, getBaseDailyLimitByPlanWithSettings } from "@/lib/api-key-rules";
import { getSessionUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/lib/system-settings";

export const runtime = "nodejs";

const createApiKeySchema = z.object({
  label: z.string().trim().max(40).optional(),
  dailyLimit: z.coerce.number().int().positive().optional(),
});

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const settings = await getSystemSettings();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = createApiKeySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request data." }, { status: 400 });
  }

  const createRule = getApiKeyCreateRuleWithSettings(sessionUser.plan, sessionUser.role, settings);
  if (!createRule.canCreate) {
    return NextResponse.json(
      { error: "Your role/plan is not allowed to create additional API keys." },
      { status: 403 },
    );
  }

  const [activeKeysCount, totalKeysCount] = await Promise.all([
    prisma.apiKey.count({
      where: { userId: sessionUser.id, status: "ACTIVE" },
    }),
    prisma.apiKey.count({
      where: { userId: sessionUser.id },
    }),
  ]);

  if (activeKeysCount >= createRule.maxKeys) {
    return NextResponse.json(
      { error: `Maximum active API keys reached (${createRule.maxKeys}).` },
      { status: 400 },
    );
  }

  const baseLimit = getBaseDailyLimitByPlanWithSettings(sessionUser.plan, settings);
  const requestedLimit = parsed.data.dailyLimit ?? baseLimit;
  const finalDailyLimit = Math.min(requestedLimit, createRule.maxLimitPerKey);

  if (finalDailyLimit <= 0) {
    return NextResponse.json({ error: "Invalid daily limit." }, { status: 400 });
  }

  const keyValue = await generateUniqueApiKey(prisma);
  const created = await prisma.apiKey.create({
    data: {
      userId: sessionUser.id,
      key: keyValue,
      label: parsed.data.label?.trim() || `API Key #${totalKeysCount + 1}`,
      status: "ACTIVE",
      dailyLimit: finalDailyLimit,
    },
    select: {
      id: true,
      label: true,
      dailyLimit: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ message: "API key created.", apiKey: created }, { status: 201 });
}
