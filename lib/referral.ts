import type { Prisma, PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

type DbClient = PrismaClient | Prisma.TransactionClient;

const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REFERRAL_CODE_LENGTH = 8;
const MAX_REFERRAL_RETRY = 30;

function createReferralCodeCandidate() {
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  let value = "";

  for (let index = 0; index < REFERRAL_CODE_LENGTH; index += 1) {
    value += REFERRAL_CODE_ALPHABET[bytes[index] % REFERRAL_CODE_ALPHABET.length];
  }

  return value;
}

export async function generateUniqueReferralCode(db: DbClient) {
  for (let attempt = 0; attempt < MAX_REFERRAL_RETRY; attempt += 1) {
    const code = createReferralCodeCandidate();
    const existing = await db.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });

    if (!existing) {
      return code;
    }
  }

  throw new Error("Failed to generate a unique referral code.");
}
