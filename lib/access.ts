import { auth } from "@/auth";
import { normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

export async function getSessionUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      plan: true,
      role: true,
      isBlocked: true,
      blockedAt: true,
      banUntil: true,
      banReason: true,
    },
  });

  if (!user) {
    return null;
  }

  const normalized = await normalizeUserBanState(prisma, user);
  if (normalized.isBlocked) {
    return null;
  }

  return {
    id: normalized.id,
    email: user.email,
    plan: user.plan,
    role: user.role,
    authProvider: session.user.authProvider ?? "credentials",
    isBlocked: normalized.isBlocked,
    blockedAt: normalized.blockedAt,
    banUntil: normalized.banUntil,
    banReason: normalized.banReason,
  };
}

export async function requireSuperAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "SUPERADMIN") {
    return null;
  }
  return user;
}
