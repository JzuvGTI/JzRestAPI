import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import {
  deleteManagedPaymentProofByUrl,
  getPaymentProofConstraints,
  savePaymentProofFile,
} from "@/lib/payment-proof-storage";

export const runtime = "nodejs";

function mergeInvoiceNotes(previousNotes: string | null, userNote: string) {
  const lines: string[] = [];
  if (previousNotes?.trim()) {
    lines.push(previousNotes.trim());
  }

  const trimmedUserNote = userNote.trim();
  if (trimmedUserNote) {
    lines.push(`User note: ${trimmedUserNote}`);
  }

  lines.push(`Proof submitted at ${new Date().toISOString()}.`);
  return lines.join("\n");
}

export async function POST(
  request: Request,
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const rawProof = formData.get("paymentProof");
  if (!(rawProof instanceof File)) {
    return NextResponse.json({ error: "Payment proof file is required." }, { status: 400 });
  }

  const constraints = getPaymentProofConstraints();
  if (rawProof.size > constraints.maxSizeBytes) {
    return NextResponse.json({ error: "Payment proof exceeds the 4MB limit." }, { status: 400 });
  }
  if (!constraints.allowedMimeTypes.includes(rawProof.type)) {
    return NextResponse.json({ error: "Payment proof must be JPG, PNG, or WEBP." }, { status: 400 });
  }

  const paymentMethod = String(formData.get("paymentMethod") || "")
    .trim()
    .slice(0, 80);
  const note = String(formData.get("note") || "")
    .trim()
    .slice(0, 300);

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
    return NextResponse.json({ error: "Payment proof can only be submitted for unpaid invoice." }, { status: 400 });
  }

  let nextProofUrl: string | null = null;
  try {
    nextProofUrl = await savePaymentProofFile(invoice.id, rawProof);

    const updated = await prisma.billingInvoice.update({
      where: { id: invoice.id },
      data: {
        paymentMethod: paymentMethod || "MANUAL_TRANSFER",
        paymentProofUrl: nextProofUrl,
        notes: mergeInvoiceNotes(invoice.notes, note),
      },
      select: {
        id: true,
        status: true,
        paymentMethod: true,
        paymentProofUrl: true,
        notes: true,
        updatedAt: true,
      },
    });

    await deleteManagedPaymentProofByUrl(invoice.paymentProofUrl);

    return NextResponse.json(
      {
        message: "Payment proof submitted. Waiting for admin review.",
        invoice: {
          id: updated.id,
          status: updated.status,
          paymentMethod: updated.paymentMethod,
          paymentProofUrl: updated.paymentProofUrl,
          notes: updated.notes,
          updatedAt: updated.updatedAt.toISOString(),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    await deleteManagedPaymentProofByUrl(nextProofUrl);

    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to submit payment proof.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
