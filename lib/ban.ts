import type { Prisma, PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type UserBanSnapshot = {
  id: string;
  isBlocked: boolean;
  blockedAt: Date | null;
  banUntil: Date | null;
  banReason: string | null;
};

function formatRemainingBan(remainingMs: number) {
  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const chunks: string[] = [];
  if (days > 0) {
    chunks.push(`${days} hari`);
  }
  if (hours > 0) {
    chunks.push(`${hours} jam`);
  }
  if (minutes > 0) {
    chunks.push(`${minutes} menit`);
  }

  return chunks.slice(0, 2).join(" ");
}

export async function normalizeUserBanState(db: DbClient, user: UserBanSnapshot) {
  if (!user.isBlocked) {
    return user;
  }

  if (user.banUntil && user.banUntil.getTime() <= Date.now()) {
    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        isBlocked: false,
        blockedAt: null,
        banUntil: null,
        banReason: null,
      },
      select: {
        id: true,
        isBlocked: true,
        blockedAt: true,
        banUntil: true,
        banReason: true,
      },
    });

    return updated;
  }

  return user;
}

export function buildBanInfo(user: Omit<UserBanSnapshot, "id">) {
  if (!user.isBlocked) {
    return {
      blocked: false,
      permanent: false,
      reason: null as string | null,
      until: null as string | null,
      remainingText: null as string | null,
      message: null as string | null,
    };
  }

  if (!user.banUntil) {
    const reasonText = user.banReason ? ` Reason: ${user.banReason}.` : "";
    return {
      blocked: true,
      permanent: true,
      reason: user.banReason,
      until: null,
      remainingText: "permanen",
      message: `Akun telah diblokir permanen.${reasonText}`,
    };
  }

  const remainingMs = Math.max(1, user.banUntil.getTime() - Date.now());
  const remainingText = formatRemainingBan(remainingMs);
  const endText = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(user.banUntil);
  const reasonText = user.banReason ? ` Reason: ${user.banReason}.` : "";

  return {
    blocked: true,
    permanent: false,
    reason: user.banReason,
    until: user.banUntil.toISOString(),
    remainingText,
    message: `Akun telah diblokir selama ${remainingText} lagi (sampai ${endText}).${reasonText}`,
  };
}
