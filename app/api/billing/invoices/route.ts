import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "@/lib/access";
import { BILLING_PLAN_PRICE_IDR, getInvoicePeriodRange, isPlanOwnedOrIncluded } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/lib/system-settings";

export const runtime = "nodejs";

const createInvoiceSchema = z.object({
  plan: z.enum(["PAID", "RESELLER"]),
});

function serializeInvoice(invoice: {
  id: string;
  plan: "FREE" | "PAID" | "RESELLER";
  amount: number;
  currency: string;
  status: "UNPAID" | "PAID" | "EXPIRED" | "CANCELED";
  periodStart: Date;
  periodEnd: Date;
  paymentMethod: string | null;
  paymentProofUrl: string | null;
  notes: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: invoice.id,
    plan: invoice.plan,
    amount: invoice.amount,
    currency: invoice.currency,
    status: invoice.status,
    periodStart: invoice.periodStart.toISOString(),
    periodEnd: invoice.periodEnd.toISOString(),
    paymentMethod: invoice.paymentMethod,
    paymentProofUrl: invoice.paymentProofUrl,
    notes: invoice.notes,
    approvedAt: invoice.approvedAt ? invoice.approvedAt.toISOString() : null,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    awaitingReview: invoice.status === "UNPAID" && Boolean(invoice.paymentProofUrl),
  };
}

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const invoices = await prisma.billingInvoice.findMany({
    where: { userId: sessionUser.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      plan: true,
      amount: true,
      currency: true,
      status: true,
      periodStart: true,
      periodEnd: true,
      paymentMethod: true,
      paymentProofUrl: true,
      notes: true,
      approvedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(
    {
      invoices: invoices.map((invoice) => serializeInvoice(invoice)),
      paymentGuide: {
        title: "Manual payment verification",
        steps: [
          "Create invoice sesuai plan yang ingin dibeli.",
          "Transfer sesuai nominal invoice, lalu upload bukti pembayaran.",
          "Superadmin akan verifikasi dan upgrade plan setelah pembayaran valid.",
        ],
      },
    },
    { status: 200 },
  );
}

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = createInvoiceSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request data." }, { status: 400 });
  }

  if (isPlanOwnedOrIncluded(sessionUser.plan, parsed.data.plan)) {
    return NextResponse.json({ error: "Plan already owned or included in your account." }, { status: 400 });
  }

  const recentUnpaid = await prisma.billingInvoice.findFirst({
    where: {
      userId: sessionUser.id,
      plan: parsed.data.plan,
      status: "UNPAID",
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      plan: true,
      amount: true,
      currency: true,
      status: true,
      periodStart: true,
      periodEnd: true,
      paymentMethod: true,
      paymentProofUrl: true,
      notes: true,
      approvedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (recentUnpaid) {
    return NextResponse.json(
      {
        error: "You still have an unpaid invoice for this plan.",
        invoice: serializeInvoice(recentUnpaid),
      },
      { status: 409 },
    );
  }

  const settings = await getSystemSettings();
  const currency = String(settings.BILLING_DEFAULT_CURRENCY || "IDR");
  const { startAt, endAt } = getInvoicePeriodRange(30);

  const created = await prisma.billingInvoice.create({
    data: {
      userId: sessionUser.id,
      plan: parsed.data.plan,
      amount: BILLING_PLAN_PRICE_IDR[parsed.data.plan],
      currency,
      status: "UNPAID",
      periodStart: startAt,
      periodEnd: endAt,
      notes: "Awaiting payment proof upload.",
    },
    select: {
      id: true,
      plan: true,
      amount: true,
      currency: true,
      status: true,
      periodStart: true,
      periodEnd: true,
      paymentMethod: true,
      paymentProofUrl: true,
      notes: true,
      approvedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(
    {
      message: "Invoice created. Please complete manual payment and upload proof.",
      invoice: serializeInvoice(created),
    },
    { status: 201 },
  );
}
