import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { buildBanInfo, normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      isBlocked: true,
      blockedAt: true,
      banUntil: true,
      banReason: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const normalized = await normalizeUserBanState(prisma, user);
  const banInfo = buildBanInfo({
    isBlocked: normalized.isBlocked,
    blockedAt: normalized.blockedAt,
    banUntil: normalized.banUntil,
    banReason: normalized.banReason,
  });

  return NextResponse.json(
    {
      blocked: banInfo.blocked,
      permanent: banInfo.permanent,
      reason: banInfo.reason,
      until: banInfo.until,
      remainingText: banInfo.remainingText,
      message: banInfo.message,
      checkedAt: new Date().toISOString(),
    },
    { status: 200 },
  );
}
