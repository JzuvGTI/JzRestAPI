import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/access";
import { deleteManagedPaymentProofByUrl } from "@/lib/payment-proof-storage";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { invoiceId } = await context.params;
  if (!invoiceId) {
    return NextResponse.json({ error: "Invoice id is required." }, { status: 400 });
  }

  const invoice = await prisma.billingInvoice.findFirst({
    where: {
      id: invoiceId,
      userId: sessionUser.id,
    },
    select: {
      id: true,
      status: true,
      paymentProofUrl: true,
      notes: true,
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  if (invoice.status !== "UNPAID") {
    return NextResponse.json({ error: "Only unpaid invoice can be canceled." }, { status: 400 });
  }

  await prisma.billingInvoice.update({
    where: { id: invoice.id },
    data: {
      status: "CANCELED",
      paymentProofUrl: null,
      paymentMethod: null,
      notes: invoice.notes?.trim()
        ? `${invoice.notes.trim()}\nCanceled by user at ${new Date().toISOString()}.`
        : `Canceled by user at ${new Date().toISOString()}.`,
    },
  });

  await deleteManagedPaymentProofByUrl(invoice.paymentProofUrl);

  return NextResponse.json({ message: "Invoice canceled." }, { status: 200 });
}
