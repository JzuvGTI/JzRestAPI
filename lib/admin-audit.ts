import type { Prisma, PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

type AuditPayload = {
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function sanitizeForJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

export function getAdminRequestMeta(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const realIp = request.headers.get("x-real-ip") || "";
  const ipAddress = forwardedFor.split(",")[0]?.trim() || realIp.trim() || null;
  const userAgent = request.headers.get("user-agent") || null;

  return {
    ipAddress,
    userAgent,
  };
}

export async function writeAdminAuditLog(
  db: DbClient,
  actorUserId: string,
  payload: AuditPayload,
) {
  await db.adminAuditLog.create({
    data: {
      actorUserId,
      action: payload.action,
      targetType: payload.targetType,
      targetId: payload.targetId,
      reason: payload.reason,
      beforeJson: sanitizeForJson(payload.before),
      afterJson: sanitizeForJson(payload.after),
      ipAddress: payload.ipAddress || null,
      userAgent: payload.userAgent || null,
    },
  });
}
