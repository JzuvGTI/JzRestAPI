import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSuperAdmin } from "@/lib/access";
import { getAdminRequestMeta, writeAdminAuditLog } from "@/lib/admin-audit";
import { actionReasonSchema } from "@/lib/admin-helpers";
import { checkAdminRateLimit } from "@/lib/admin-rate-limit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const invoicePatchSchema = z.object({
  plan: z.enum(["FREE", "PAID", "RESELLER"]).optional(),
  amount: z.coerce.number().int().positive().max(1_000_000_000).optional(),
  currency: z.string().trim().max(10).optional(),
  status: z.enum(["UNPAID", "PAID", "EXPIRED", "CANCELED"]).optional(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  paymentMethod: z.string().trim().max(80).nullable().optional(),
  paymentProofUrl: z.string().trim().url().max(500).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  reason: actionReasonSchema,
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const adminUser = await requireSuperAdmin();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const rate = checkAdminRateLimit({
    userId: adminUser.id,
    scope: "admin-billing-invoice-patch",
    maxHits: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Too many invoice updates. Retry in ${rate.retryAfterSec}s.` },
      { status: 429 },
    );
  }

  const { invoiceId } = await context.params;
  if (!invoiceId) {
    return NextResponse.json({ error: "Invoice id is required." }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = invoicePatchSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request data." }, { status: 400 });
  }

  const before = await prisma.billingInvoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      userId: true,
      plan: true,
      amount: true,
      currency: true,
      status: true,
      periodStart: true,
      periodEnd: true,
      paymentMethod: true,
      paymentProofUrl: true,
      notes: true,
      approvedById: true,
      approvedAt: true,
    },
  });

  if (!before) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const nextPeriodStart = parsed.data.periodStart || before.periodStart;
  const nextPeriodEnd = parsed.data.periodEnd || before.periodEnd;
  if (nextPeriodEnd.getTime() <= nextPeriodStart.getTime()) {
    return NextResponse.json({ error: "periodEnd must be later than periodStart." }, { status: 400 });
  }

  const nextStatus = parsed.data.status || before.status;
  const nextPlan = parsed.data.plan || before.plan;

  const updated = await prisma.$transaction(async (tx) => {
    const invoice = await tx.billingInvoice.update({
      where: { id: invoiceId },
      data: {
        ...(parsed.data.plan ? { plan: parsed.data.plan } : {}),
        ...(parsed.data.amount !== undefined ? { amount: parsed.data.amount } : {}),
        ...(parsed.data.currency ? { currency: parsed.data.currency.trim().toUpperCase() } : {}),
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
        ...(parsed.data.periodStart ? { periodStart: parsed.data.periodStart } : {}),
        ...(parsed.data.periodEnd ? { periodEnd: parsed.data.periodEnd } : {}),
        ...(parsed.data.paymentMethod !== undefined
          ? { paymentMethod: parsed.data.paymentMethod || null }
          : {}),
        ...(parsed.data.paymentProofUrl !== undefined
          ? { paymentProofUrl: parsed.data.paymentProofUrl || null }
          : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes || null } : {}),
        ...(nextStatus === "PAID" && before.status !== "PAID"
          ? { approvedById: adminUser.id, approvedAt: new Date() }
          : {}),
      },
      select: {
        id: true,
        userId: true,
        plan: true,
        amount: true,
        currency: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        paymentMethod: true,
        paymentProofUrl: true,
        notes: true,
        approvedById: true,
        approvedAt: true,
        updatedAt: true,
      },
    });

    if (nextStatus === "PAID" && before.status !== "PAID") {
      await tx.userSubscription.updateMany({
        where: {
          userId: invoice.userId,
          status: "ACTIVE",
        },
        data: {
          status: "EXPIRED",
          updatedById: adminUser.id,
        },
      });

      await tx.userSubscription.create({
        data: {
          userId: invoice.userId,
          plan: nextPlan,
          status: "ACTIVE",
          startAt: nextPeriodStart,
          endAt: nextPeriodEnd,
          autoDowngradeTo: "FREE",
          updatedById: adminUser.id,
        },
      });
    }

    if (nextStatus === "PAID") {
      await tx.user.update({
        where: { id: invoice.userId },
        data: { plan: nextPlan },
      });
    }

    if ((nextStatus === "EXPIRED" || nextStatus === "CANCELED") && before.status !== nextStatus) {
      await tx.userSubscription.updateMany({
        where: {
          userId: invoice.userId,
          status: "ACTIVE",
        },
        data: {
          status: nextStatus === "EXPIRED" ? "EXPIRED" : "CANCELED",
          updatedById: adminUser.id,
        },
      });

      await tx.userSubscription.create({
        data: {
          userId: invoice.userId,
          plan: nextPlan,
          status: nextStatus === "EXPIRED" ? "EXPIRED" : "CANCELED",
          startAt: nextPeriodStart,
          endAt: nextPeriodEnd,
          autoDowngradeTo: "FREE",
          updatedById: adminUser.id,
        },
      });

      await tx.user.update({
        where: { id: invoice.userId },
        data: { plan: "FREE" },
      });
    }

    return invoice;
  });

  const requestMeta = getAdminRequestMeta(request);
  await writeAdminAuditLog(prisma, adminUser.id, {
    action: "ADMIN_BILLING_INVOICE_UPDATE",
    targetType: "BILLING_INVOICE",
    targetId: invoiceId,
    reason: parsed.data.reason,
    before,
    after: updated,
    ipAddress: requestMeta.ipAddress,
    userAgent: requestMeta.userAgent,
  });

  return NextResponse.json(
    {
      message: "Invoice updated.",
      invoice: {
        ...updated,
        periodStart: updated.periodStart.toISOString(),
        periodEnd: updated.periodEnd.toISOString(),
        approvedAt: updated.approvedAt ? updated.approvedAt.toISOString() : null,
        updatedAt: updated.updatedAt.toISOString(),
      },
    },
    { status: 200 },
  );
}
