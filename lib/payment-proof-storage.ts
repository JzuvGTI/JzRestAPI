import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const PAYMENT_PROOF_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "payment-proofs");
const MAX_PAYMENT_PROOF_SIZE = 4 * 1024 * 1024;

const allowedMimeMap: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export function getPaymentProofConstraints() {
  return {
    maxSizeBytes: MAX_PAYMENT_PROOF_SIZE,
    allowedMimeTypes: Object.keys(allowedMimeMap),
  };
}

export function isManagedPaymentProofUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return value.startsWith("/uploads/payment-proofs/");
}

function resolveManagedPaymentProofAbsolutePath(proofUrl: string) {
  const relativePath = proofUrl.replace(/^\//, "");
  return path.join(process.cwd(), "public", relativePath);
}

export async function deleteManagedPaymentProofByUrl(proofUrl: string | null | undefined) {
  if (!proofUrl || !isManagedPaymentProofUrl(proofUrl)) {
    return;
  }

  const filePath = resolveManagedPaymentProofAbsolutePath(proofUrl);
  try {
    await rm(filePath, { force: true });
  } catch {
    // Ignore delete failures.
  }
}

function normalizeFileExtension(file: File) {
  const byMime = allowedMimeMap[file.type];
  if (byMime) {
    return byMime;
  }

  const name = file.name.toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return ".jpg";
  }
  if (name.endsWith(".png")) {
    return ".png";
  }
  if (name.endsWith(".webp")) {
    return ".webp";
  }

  return null;
}

export async function savePaymentProofFile(invoiceId: string, file: File) {
  if (!(file instanceof File)) {
    throw new Error("Payment proof file is required.");
  }

  if (file.size <= 0) {
    throw new Error("Payment proof file is empty.");
  }

  if (file.size > MAX_PAYMENT_PROOF_SIZE) {
    throw new Error("Payment proof exceeds the 4MB limit.");
  }

  const extension = normalizeFileExtension(file);
  if (!extension) {
    throw new Error("Payment proof must be JPG, PNG, or WEBP.");
  }

  await mkdir(PAYMENT_PROOF_UPLOAD_DIR, { recursive: true });

  const safeInvoiceId = invoiceId.replace(/[^a-zA-Z0-9_-]/g, "");
  const filename = `${safeInvoiceId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
  const absolutePath = path.join(PAYMENT_PROOF_UPLOAD_DIR, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absolutePath, buffer);

  return `/uploads/payment-proofs/${filename}`;
}
