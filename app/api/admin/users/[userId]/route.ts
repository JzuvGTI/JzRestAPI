import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSuperAdmin } from "@/lib/access";
import { getAdminRequestMeta, writeAdminAuditLog } from "@/lib/admin-audit";
import { actionReasonSchema } from "@/lib/admin-helpers";
import { checkAdminRateLimit } from "@/lib/admin-rate-limit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const updateUserSchema = z.object({
  plan: z.enum(["FREE", "PAID", "RESELLER"]).optional(),
  role: z.enum(["USER", "SUPERADMIN"]).optional(),
  isBlocked: z.boolean().optional(),
  banTimeMinutes: z.coerce
    .number()
    .int()
    .refine((value) => value === -1 || value > 0)
    .optional(),
  banReason: z.string().trim().max(180).optional(),
  referralBonusDaily: z.coerce.number().int().min(0).max(100000).optional(),
  reason: actionReasonSchema,
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const adminUser = await requireSuperAdmin();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const rate = checkAdminRateLimit({
    userId: adminUser.id,
    scope: "admin-user-patch",
    maxHits: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Too many admin actions. Retry in ${rate.retryAfterSec}s.` },
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

  const parsed = updateUserSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request data." }, { status: 400 });
  }

  if (userId === adminUser.id && parsed.data.isBlocked === true) {
    return NextResponse.json({ error: "You cannot block your own account." }, { status: 400 });
  }

  if (userId === adminUser.id && parsed.data.role === "USER") {
    return NextResponse.json({ error: "You cannot remove your own SUPERADMIN role." }, { status: 400 });
  }

  if (parsed.data.isBlocked === true && parsed.data.banTimeMinutes === undefined) {
    return NextResponse.json({ error: "banTimeMinutes is required when blocking a user." }, { status: 400 });
  }

  if (parsed.data.isBlocked !== true && parsed.data.banTimeMinutes !== undefined) {
    return NextResponse.json(
      { error: "banTimeMinutes can only be set when isBlocked is true." },
      { status: 400 },
    );
  }

  const targetBefore = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      plan: true,
      isBlocked: true,
      blockedAt: true,
      banUntil: true,
      banReason: true,
      referralBonusDaily: true,
    },
  });

  if (!targetBefore) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const nextData: {
    plan?: "FREE" | "PAID" | "RESELLER";
    role?: "USER" | "SUPERADMIN";
    isBlocked?: boolean;
    blockedAt?: Date | null;
    banUntil?: Date | null;
    banReason?: string | null;
    referralBonusDaily?: number;
  } = {};

  if (parsed.data.plan) {
    nextData.plan = parsed.data.plan;
  }

  if (parsed.data.role) {
    nextData.role = parsed.data.role;
  }

  if (parsed.data.referralBonusDaily !== undefined) {
    nextData.referralBonusDaily = parsed.data.referralBonusDaily;
  }

  if (parsed.data.isBlocked === false) {
    nextData.isBlocked = false;
    nextData.blockedAt = null;
    nextData.banUntil = null;
    nextData.banReason = null;
  }

  if (parsed.data.isBlocked === true) {
    const banTimeMinutes = parsed.data.banTimeMinutes!;
    const now = new Date();

    nextData.isBlocked = true;
    nextData.blockedAt = now;
    nextData.banReason = parsed.data.banReason?.trim() || null;
    nextData.banUntil =
      banTimeMinutes === -1 ? null : new Date(now.getTime() + banTimeMinutes * 60 * 1000);
  }

  const targetAfter = await prisma.user.update({
    where: { id: userId },
    data: nextData,
    select: {
      id: true,
      email: true,
      role: true,
      plan: true,
      isBlocked: true,
      blockedAt: true,
      banUntil: true,
      banReason: true,
      referralBonusDaily: true,
    },
  });

  const requestMeta = getAdminRequestMeta(request);
  await writeAdminAuditLog(prisma, adminUser.id, {
    action: "ADMIN_USER_UPDATE",
    targetType: "USER",
    targetId: userId,
    reason: parsed.data.reason,
    before: targetBefore,
    after: targetAfter,
    ipAddress: requestMeta.ipAddress,
    userAgent: requestMeta.userAgent,
  });

  return NextResponse.json({ message: "User updated." }, { status: 200 });
}
