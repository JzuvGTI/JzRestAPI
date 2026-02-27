import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "@/lib/access";
import { getUtcDateOnly } from "@/lib/dashboard-user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const updateProfileSchema = z.object({
  name: z.string().trim().max(60, "Name must be 60 characters or fewer.").optional(),
});

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const today = getUtcDateOnly(new Date());

  const [user, totalApiKeys, activeApiKeys, totalRequestsAgg, requestsTodayAgg] = await Promise.all([
    prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        plan: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.apiKey.count({
      where: {
        userId: sessionUser.id,
      },
    }),
    prisma.apiKey.count({
      where: {
        userId: sessionUser.id,
        status: "ACTIVE",
      },
    }),
    prisma.usageLog.aggregate({
      where: {
        apiKey: {
          userId: sessionUser.id,
        },
      },
      _sum: {
        requestsCount: true,
      },
    }),
    prisma.usageLog.aggregate({
      where: {
        apiKey: {
          userId: sessionUser.id,
        },
        date: today,
      },
      _sum: {
        requestsCount: true,
      },
    }),
  ]);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return NextResponse.json(
    {
      profile: user,
      stats: {
        totalApiKeys,
        activeApiKeys,
        totalRequests: totalRequestsAgg._sum.requestsCount || 0,
        requestsToday: requestsTodayAgg._sum.requestsCount || 0,
      },
    },
    { status: 200 },
  );
}

export async function PATCH(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = updateProfileSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message || "Invalid profile data.",
      },
      { status: 400 },
    );
  }

  const nextName = parsed.data.name?.trim() || null;

  const updated = await prisma.user.update({
    where: { id: sessionUser.id },
    data: {
      name: nextName,
    },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      plan: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(
    {
      message: "Profile updated successfully.",
      profile: updated,
    },
    { status: 200 },
  );
}
