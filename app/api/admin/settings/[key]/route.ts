import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSuperAdmin } from "@/lib/access";
import { getAdminRequestMeta, writeAdminAuditLog } from "@/lib/admin-audit";
import { actionReasonSchema } from "@/lib/admin-helpers";
import { checkAdminRateLimit } from "@/lib/admin-rate-limit";
import { prisma } from "@/lib/prisma";
import {
  SYSTEM_SETTING_KEYS,
  getSystemSettings,
  normalizeSystemSettingValue,
  type SystemSettingKey,
  upsertSystemSetting,
} from "@/lib/system-settings";

export const runtime = "nodejs";

const updateSettingSchema = z.object({
  value: z.any(),
  reason: actionReasonSchema,
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ key: string }> },
) {
  const adminUser = await requireSuperAdmin();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const rate = checkAdminRateLimit({
    userId: adminUser.id,
    scope: "admin-system-setting-patch",
    maxHits: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Too many setting updates. Retry in ${rate.retryAfterSec}s.` },
      { status: 429 },
    );
  }

  const { key } = await context.params;
  if (!SYSTEM_SETTING_KEYS.includes(key as SystemSettingKey)) {
    return NextResponse.json({ error: "Unknown setting key." }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = updateSettingSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request data." }, { status: 400 });
  }

  const normalized = normalizeSystemSettingValue(key as SystemSettingKey, parsed.data.value);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const beforeMerged = await getSystemSettings();
  const beforeRow = await prisma.systemSetting.findUnique({
    where: { key },
    select: {
      id: true,
      key: true,
      valueJson: true,
      updatedById: true,
      updatedAt: true,
    },
  });

  const updated = await upsertSystemSetting(key as SystemSettingKey, normalized.value, adminUser.id);

  const requestMeta = getAdminRequestMeta(request);
  await writeAdminAuditLog(prisma, adminUser.id, {
    action: "ADMIN_SYSTEM_SETTING_UPDATE",
    targetType: "SYSTEM_SETTING",
    targetId: key,
    reason: parsed.data.reason,
    before: {
      mergedValue: beforeMerged[key as SystemSettingKey],
      record: beforeRow,
    },
    after: {
      key: updated.key,
      valueJson: updated.valueJson,
      updatedById: updated.updatedById,
      updatedAt: updated.updatedAt,
    },
    ipAddress: requestMeta.ipAddress,
    userAgent: requestMeta.userAgent,
  });

  return NextResponse.json(
    {
      message: "Setting updated.",
      setting: {
        key: updated.key,
        value: updated.valueJson,
        updatedAt: updated.updatedAt.toISOString(),
      },
    },
    { status: 200 },
  );
}
