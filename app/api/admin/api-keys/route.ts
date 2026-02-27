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
  const userId = searchParams.get("userId")?.trim() || "";
  const blocked = parseBooleanFilter(searchParams.get("blocked"));
  const status = searchParams.get("status");

  const andFilters: Prisma.ApiKeyWhereInput[] = [];

  if (status === "ACTIVE" || status === "REVOKED") {
    andFilters.push({ status });
  }

  if (userId) {
    andFilters.push({ userId });
  }

  if (blocked !== undefined) {
    andFilters.push({
      user: {
        isBlocked: blocked,
      },
    });
  }

  if (q) {
    andFilters.push({
      OR: [
        { label: { contains: q } },
        { key: { contains: q } },
        { user: { email: { contains: q } } },
        { user: { name: { contains: q } } },
      ],
    });
  }

  const where: Prisma.ApiKeyWhereInput = andFilters.length > 0 ? { AND: andFilters } : {};
  const today = getUtcDateOnly(new Date());

  const [total, rows] = await Promise.all([
    prisma.apiKey.count({ where }),
    prisma.apiKey.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: sortOrder },
      select: {
        id: true,
        userId: true,
        key: true,
        label: true,
        status: true,
        dailyLimit: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            plan: true,
            role: true,
            isBlocked: true,
            banUntil: true,
          },
        },
        usageLogs: {
          where: { date: today },
          select: { requestsCount: true },
          take: 1,
        },
      },
    }),
  ]);

  return NextResponse.json(
    {
      apiKeys: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        key: row.key,
        label: row.label,
        status: row.status,
        dailyLimit: row.dailyLimit,
        createdAt: row.createdAt.toISOString(),
        requestsToday: row.usageLogs[0]?.requestsCount || 0,
        user: {
          id: row.user.id,
          name: row.user.name,
          email: row.user.email,
          plan: row.user.plan,
          role: row.user.role,
          isBlocked: row.user.isBlocked,
          banUntil: row.user.banUntil ? row.user.banUntil.toISOString() : null,
        },
      })),
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
