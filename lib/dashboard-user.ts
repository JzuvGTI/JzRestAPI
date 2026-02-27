import { normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";
import { generateUniqueReferralCode } from "@/lib/referral";

export type DashboardUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  plan: "FREE" | "PAID" | "RESELLER";
  role: "USER" | "SUPERADMIN";
  isBlocked: boolean;
  blockedAt: Date | null;
  banUntil: Date | null;
  banReason: string | null;
  referralCode: string;
  referralCount: number;
  referralBonusDaily: number;
  apiKeys: Array<{
    id: string;
    key: string;
    label: string | null;
    dailyLimit: number;
    status: "ACTIVE" | "REVOKED";
    createdAt: Date;
  }>;
};

export async function getOrProvisionDashboardUser(userId: string): Promise<DashboardUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      createdAt: true,
      plan: true,
      role: true,
      isBlocked: true,
      blockedAt: true,
      banUntil: true,
      banReason: true,
      referralCode: true,
      referralCount: true,
      referralBonusDaily: true,
      apiKeys: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          key: true,
          label: true,
          dailyLimit: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  const normalizedBan = await normalizeUserBanState(prisma, {
    id: user.id,
    isBlocked: user.isBlocked,
    blockedAt: user.blockedAt,
    banUntil: user.banUntil,
    banReason: user.banReason,
  });

  if (normalizedBan.isBlocked) {
    return null;
  }

  let referralCode = user.referralCode;
  if (!referralCode) {
    referralCode = await generateUniqueReferralCode(prisma);
    await prisma.user.update({
      where: { id: user.id },
      data: { referralCode },
    });
  }

  const allApiKeys = user.apiKeys;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    plan: user.plan,
    role: user.role,
    isBlocked: normalizedBan.isBlocked,
    blockedAt: normalizedBan.blockedAt,
    banUntil: normalizedBan.banUntil,
    banReason: normalizedBan.banReason,
    referralCode,
    referralCount: user.referralCount,
    referralBonusDaily: user.referralBonusDaily,
    apiKeys: allApiKeys,
  };
}

export function getUtcDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function getEffectiveDailyLimit(baseLimit: number, referralBonusDaily: number) {
  return baseLimit + referralBonusDaily;
}
