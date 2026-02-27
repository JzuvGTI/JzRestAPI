import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSuperAdmin } from "@/lib/access";
import { getAdminRequestMeta, writeAdminAuditLog } from "@/lib/admin-audit";
import { actionReasonSchema } from "@/lib/admin-helpers";
import { checkAdminRateLimit } from "@/lib/admin-rate-limit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const subscriptionPatchSchema = z.object({
  plan: z.enum(["FREE", "PAID", "RESELLER"]).optional(),
  status: z.enum(["ACTIVE", "EXPIRED", "CANCELED"]).optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.union([z.coerce.date(), z.null()]).optional(),
  autoDowngradeTo: z.enum(["FREE", "PAID", "RESELLER"]).optional(),
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
    scope: "admin-user-subscription-patch",
    maxHits: 25,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Too many subscription updates. Retry in ${rate.retryAfterSec}s.` },
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

  const parsed = subscriptionPatchSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request data." }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      plan: true,
    },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "Target user not found." }, { status: 404 });
  }

  const latest = await prisma.userSubscription.findFirst({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      userId: true,
      plan: true,
      status: true,
      startAt: true,
      endAt: true,
      autoDowngradeTo: true,
      updatedById: true,
      updatedAt: true,
    },
  });

  const before = latest
    ? {
        ...latest,
        startAt: latest.startAt.toISOString(),
        endAt: latest.endAt ? latest.endAt.toISOString() : null,
        updatedAt: latest.updatedAt.toISOString(),
      }
    : null;

  const now = new Date();
  const baseStart = parsed.data.startAt || latest?.startAt || now;
  const baseEnd = parsed.data.endAt !== undefined ? parsed.data.endAt : latest?.endAt || null;
  if (baseEnd && baseEnd.getTime() <= baseStart.getTime()) {
    return NextResponse.json({ error: "endAt must be later than startAt." }, { status: 400 });
  }

  const nextPlan = parsed.data.plan || latest?.plan || targetUser.plan;
  const nextStatus = parsed.data.status || latest?.status || "ACTIVE";
  const nextAutoDowngrade = parsed.data.autoDowngradeTo || latest?.autoDowngradeTo || "FREE";

  const updated = await prisma.$transaction(async (tx) => {
    const subscription = latest
      ? await tx.userSubscription.update({
          where: { id: latest.id },
          data: {
            plan: nextPlan,
            status: nextStatus,
            startAt: baseStart,
            endAt: baseEnd,
            autoDowngradeTo: nextAutoDowngrade,
            updatedById: adminUser.id,
          },
          select: {
            id: true,
            userId: true,
            plan: true,
            status: true,
            startAt: true,
            endAt: true,
            autoDowngradeTo: true,
            updatedById: true,
            updatedAt: true,
            createdAt: true,
          },
        })
      : await tx.userSubscription.create({
          data: {
            userId,
            plan: nextPlan,
            status: nextStatus,
            startAt: baseStart,
            endAt: baseEnd,
            autoDowngradeTo: nextAutoDowngrade,
            updatedById: adminUser.id,
          },
          select: {
            id: true,
            userId: true,
            plan: true,
            status: true,
            startAt: true,
            endAt: true,
            autoDowngradeTo: true,
            updatedById: true,
            updatedAt: true,
            createdAt: true,
          },
        });

    if (nextStatus === "ACTIVE") {
      await tx.user.update({
        where: { id: userId },
        data: { plan: nextPlan },
      });
    } else {
      await tx.user.update({
        where: { id: userId },
        data: { plan: nextAutoDowngrade },
      });
    }

    return subscription;
  });

  const requestMeta = getAdminRequestMeta(request);
  await writeAdminAuditLog(prisma, adminUser.id, {
    action: "ADMIN_SUBSCRIPTION_UPDATE",
    targetType: "USER_SUBSCRIPTION",
    targetId: updated.id,
    reason: parsed.data.reason,
    before,
    after: {
      ...updated,
      startAt: updated.startAt.toISOString(),
      endAt: updated.endAt ? updated.endAt.toISOString() : null,
      updatedAt: updated.updatedAt.toISOString(),
      createdAt: updated.createdAt.toISOString(),
    },
    ipAddress: requestMeta.ipAddress,
    userAgent: requestMeta.userAgent,
  });

  return NextResponse.json(
    {
      message: "Subscription updated.",
      subscription: {
        ...updated,
        startAt: updated.startAt.toISOString(),
        endAt: updated.endAt ? updated.endAt.toISOString() : null,
        updatedAt: updated.updatedAt.toISOString(),
        createdAt: updated.createdAt.toISOString(),
      },
    },
    { status: 200 },
  );
}
