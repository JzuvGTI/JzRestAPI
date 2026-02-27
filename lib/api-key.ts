import type { Prisma, PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

type DbClient = PrismaClient | Prisma.TransactionClient;

const MAX_KEY_RETRY = 30;

function createApiKeyCandidate() {
  return `jz_${randomBytes(24).toString("hex")}`;
}

export async function generateUniqueApiKey(db: DbClient) {
  for (let attempt = 0; attempt < MAX_KEY_RETRY; attempt += 1) {
    const value = createApiKeyCandidate();
    const existing = await db.apiKey.findUnique({
      where: { key: value },
      select: { id: true },
    });

    if (!existing) {
      return value;
    }
  }

  throw new Error("Failed to generate a unique API key.");
}
