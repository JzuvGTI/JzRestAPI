import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSuperAdmin } from "@/lib/access";
import { getAdminRequestMeta, writeAdminAuditLog } from "@/lib/admin-audit";
import { actionReasonSchema, parsePagination, parseSortOrder } from "@/lib/admin-helpers";
import { checkAdminRateLimit } from "@/lib/admin-rate-limit";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/lib/system-settings";

export const runtime = "nodejs";

const invoiceCreateSchema = z
  .object({
    userId: z.string().min(1),
    plan: z.enum(["FREE", "PAID", "RESELLER"]),
    amount: z.coerce.number().int().positive().max(1_000_000_000),
    currency: z.string().trim().max(10).optional(),
    status: z.enum(["UNPAID", "PAID", "EXPIRED", "CANCELED"]).optional(),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    paymentMethod: z.string().trim().max(80).optional(),
    paymentProofUrl: z.string().trim().url().max(500).optional(),
    notes: z.string().trim().max(1000).optional(),
    reason: actionReasonSchema,
  })
  .refine((data) => data.periodEnd.getTime() > data.periodStart.getTime(), {
    message: "periodEnd must be later than periodStart.",
    path: ["periodEnd"],
  });

export async function GET(request: Request) {
  const adminUser = await requireSuperAdmin();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip, take } = parsePagination(searchParams);
  const sortOrder = parseSortOrder(searchParams.get("order"));
  const q = searchParams.get("q")?.trim() || "";
  const userId = searchParams.get("userId")?.trim() || "";
  const status = searchParams.get("status");
  const plan = searchParams.get("plan");

  const andFilters: Prisma.BillingInvoiceWhereInput[] = [];

  if (userId) {
    andFilters.push({ userId });
  }

  if (status === "UNPAID" || status === "PAID" || status === "EXPIRED" || status === "CANCELED") {
    andFilters.push({ status });
  }

  if (plan === "FREE" || plan === "PAID" || plan === "RESELLER") {
    andFilters.push({ plan });
  }

  if (q) {
    andFilters.push({
      OR: [
        { id: { contains: q } },
        { notes: { contains: q } },
        { user: { email: { contains: q } } },
        { user: { name: { contains: q } } },
      ],
    });
  }

  const where: Prisma.BillingInvoiceWhereInput = andFilters.length > 0 ? { AND: andFilters } : {};

  const [total, invoices] = await Promise.all([
    prisma.billingInvoice.count({ where }),
    prisma.billingInvoice.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: sortOrder },
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
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            plan: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    }),
  ]);

  return NextResponse.json(
    {
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        userId: invoice.userId,
        plan: invoice.plan,
        amount: invoice.amount,
        currency: invoice.currency,
        status: invoice.status,
        periodStart: invoice.periodStart.toISOString(),
        periodEnd: invoice.periodEnd.toISOString(),
        paymentMethod: invoice.paymentMethod,
        paymentProofUrl: invoice.paymentProofUrl,
        notes: invoice.notes,
        approvedById: invoice.approvedById,
        approvedAt: invoice.approvedAt ? invoice.approvedAt.toISOString() : null,
        createdAt: invoice.createdAt.toISOString(),
        updatedAt: invoice.updatedAt.toISOString(),
        user: {
          id: invoice.user.id,
          name: invoice.user.name,
          email: invoice.user.email,
          plan: invoice.user.plan,
        },
        approvedBy: invoice.approvedBy
          ? {
              id: invoice.approvedBy.id,
              name: invoice.approvedBy.name,
              email: invoice.approvedBy.email,
            }
          : null,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    },
    { status: 200 },
  );
}

export async function POST(request: Request) {
  const adminUser = await requireSuperAdmin();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const rate = checkAdminRateLimit({
    userId: adminUser.id,
    scope: "admin-billing-invoice-create",
    maxHits: 15,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Too many invoice actions. Retry in ${rate.retryAfterSec}s.` },
      { status: 429 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = invoiceCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request data." }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: {
      id: true,
      email: true,
    },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "Target user not found." }, { status: 404 });
  }

  const settings = await getSystemSettings();
  const currencyInput = parsed.data.currency?.trim().toUpperCase();
  const currency = currencyInput || String(settings.BILLING_DEFAULT_CURRENCY || "IDR");

  const created = await prisma.$transaction(async (tx) => {
    const invoice = await tx.billingInvoice.create({
      data: {
        userId: parsed.data.userId,
        plan: parsed.data.plan,
        amount: parsed.data.amount,
        currency,
        status: parsed.data.status || "UNPAID",
        periodStart: parsed.data.periodStart,
        periodEnd: parsed.data.periodEnd,
        paymentMethod: parsed.data.paymentMethod || null,
        paymentProofUrl: parsed.data.paymentProofUrl || null,
        notes: parsed.data.notes || null,
        approvedById: parsed.data.status === "PAID" ? adminUser.id : null,
        approvedAt: parsed.data.status === "PAID" ? new Date() : null,
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
        createdAt: true,
        updatedAt: true,
      },
    });

    if (invoice.status === "PAID") {
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
          plan: invoice.plan,
          status: "ACTIVE",
          startAt: invoice.periodStart,
          endAt: invoice.periodEnd,
          autoDowngradeTo: "FREE",
          updatedById: adminUser.id,
        },
      });

      await tx.user.update({
        where: { id: invoice.userId },
        data: { plan: invoice.plan },
      });
    }

    return invoice;
  });

  const requestMeta = getAdminRequestMeta(request);
  await writeAdminAuditLog(prisma, adminUser.id, {
    action: "ADMIN_BILLING_INVOICE_CREATE",
    targetType: "BILLING_INVOICE",
    targetId: created.id,
    reason: parsed.data.reason,
    before: {
      userId: targetUser.id,
      userEmail: targetUser.email,
    },
    after: created,
    ipAddress: requestMeta.ipAddress,
    userAgent: requestMeta.userAgent,
  });

  return NextResponse.json(
    {
      message: "Invoice created.",
      invoice: {
        ...created,
        periodStart: created.periodStart.toISOString(),
        periodEnd: created.periodEnd.toISOString(),
        approvedAt: created.approvedAt ? created.approvedAt.toISOString() : null,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
