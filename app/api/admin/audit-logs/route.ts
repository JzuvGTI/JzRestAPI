import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/access";
import { parsePagination, parseSortOrder } from "@/lib/admin-helpers";
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
  const action = searchParams.get("action")?.trim() || "";
  const targetType = searchParams.get("targetType")?.trim() || "";
  const actorUserId = searchParams.get("actorUserId")?.trim() || "";

  const andFilters: Prisma.AdminAuditLogWhereInput[] = [];

  if (action) {
    andFilters.push({ action: { contains: action } });
  }

  if (targetType) {
    andFilters.push({ targetType: { contains: targetType } });
  }

  if (actorUserId) {
    andFilters.push({ actorUserId });
  }

  if (q) {
    andFilters.push({
      OR: [
        { action: { contains: q } },
        { targetType: { contains: q } },
        { targetId: { contains: q } },
        { reason: { contains: q } },
        { actorUser: { email: { contains: q } } },
        { actorUser: { name: { contains: q } } },
      ],
    });
  }

  const where: Prisma.AdminAuditLogWhereInput = andFilters.length > 0 ? { AND: andFilters } : {};
  const [total, rows] = await Promise.all([
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: sortOrder },
      select: {
        id: true,
        actorUserId: true,
        action: true,
        targetType: true,
        targetId: true,
        reason: true,
        beforeJson: true,
        afterJson: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        actorUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
  ]);

  return NextResponse.json(
    {
      logs: rows.map((row) => ({
        id: row.id,
        actorUserId: row.actorUserId,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        reason: row.reason,
        before: row.beforeJson,
        after: row.afterJson,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
        actorUser: row.actorUser,
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
