import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/access";
import { parseBooleanFilter, parsePagination, parseSortOrder } from "@/lib/admin-helpers";
import { getUtcDateOnly } from "@/lib/dashboard-user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const adminUser = await requireSuperAdmin();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip, take } = parsePagination(searchParams);
  const sortOrder = parseSortOrder(searchParams.get("order"));
  const q = searchParams.get("q")?.trim() || "";
  const role = searchParams.get("role");
  const plan = searchParams.get("plan");
  const blocked = parseBooleanFilter(searchParams.get("blocked"));

  const andFilters: Prisma.UserWhereInput[] = [];

  if (role === "USER" || role === "SUPERADMIN") {
    andFilters.push({ role });
  }

  if (plan === "FREE" || plan === "PAID" || plan === "RESELLER") {
    andFilters.push({ plan });
  }

  if (blocked !== undefined) {
    andFilters.push({ isBlocked: blocked });
  }

  if (q) {
    andFilters.push({
      OR: [
        { name: { contains: q } },
        { email: { contains: q } },
        { referralCode: { contains: q } },
      ],
    });
  }

  const where: Prisma.UserWhereInput = andFilters.length > 0 ? { AND: andFilters } : {};
  const today = getUtcDateOnly(new Date());

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take,
      orderBy: [{ createdAt: sortOrder }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        plan: true,
        isBlocked: true,
        blockedAt: true,
        banUntil: true,
        banReason: true,
        referralCode: true,
        referralCount: true,
        referralBonusDaily: true,
        createdAt: true,
        updatedAt: true,
        apiKeys: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            key: true,
            label: true,
            status: true,
            dailyLimit: true,
            createdAt: true,
            usageLogs: {
              where: { date: today },
              select: {
                requestsCount: true,
              },
            },
          },
        },
        subscriptions: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            id: true,
            plan: true,
            status: true,
            startAt: true,
            endAt: true,
            autoDowngradeTo: true,
            updatedAt: true,
          },
        },
      },
    }),
  ]);

  const normalized = users.map((user) => {
    const requestsToday = user.apiKeys.reduce((sum, apiKey) => {
      const keyToday = apiKey.usageLogs.reduce((inner, log) => inner + log.requestsCount, 0);
      return sum + keyToday;
    }, 0);

    const activeApiKeys = user.apiKeys.filter((key) => key.status === "ACTIVE").length;
    const latestSubscription = user.subscriptions[0] || null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan,
      isBlocked: user.isBlocked,
      blockedAt: user.blockedAt ? user.blockedAt.toISOString() : null,
      banUntil: user.banUntil ? user.banUntil.toISOString() : null,
      banReason: user.banReason,
      referralCode: user.referralCode,
      referralCount: user.referralCount,
      referralBonusDaily: user.referralBonusDaily,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      stats: {
        requestsToday,
        activeApiKeys,
        totalApiKeys: user.apiKeys.length,
      },
      latestSubscription: latestSubscription
        ? {
            id: latestSubscription.id,
            plan: latestSubscription.plan,
            status: latestSubscription.status,
            startAt: latestSubscription.startAt.toISOString(),
            endAt: latestSubscription.endAt ? latestSubscription.endAt.toISOString() : null,
            autoDowngradeTo: latestSubscription.autoDowngradeTo,
            updatedAt: latestSubscription.updatedAt.toISOString(),
          }
        : null,
      apiKeys: user.apiKeys.map((apiKey) => ({
        id: apiKey.id,
        key: apiKey.key,
        label: apiKey.label,
        status: apiKey.status,
        dailyLimit: apiKey.dailyLimit,
        createdAt: apiKey.createdAt.toISOString(),
        requestsToday: apiKey.usageLogs[0]?.requestsCount || 0,
      })),
    };
  });

  return NextResponse.json(
    {
      users: normalized,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    },
    { status: 200 },
  );
}
