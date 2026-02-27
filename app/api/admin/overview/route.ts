import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/access";
import { getUtcDateOnly } from "@/lib/dashboard-user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const adminUser = await requireSuperAdmin();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const now = new Date();
  const today = getUtcDateOnly(now);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    blockedUsers,
    superAdmins,
    totalApiKeys,
    activeApiKeys,
    revokedApiKeys,
    totalApis,
    activeApis,
    maintenanceApis,
    nonActiveApis,
    totalInvoices,
    unpaidInvoices,
    paidInvoices,
    requestsTodayAgg,
    revenueThisMonthAgg,
    activeSubscriptions,
    expiringSoonSubscriptions,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isBlocked: true } }),
    prisma.user.count({ where: { role: "SUPERADMIN" } }),
    prisma.apiKey.count(),
    prisma.apiKey.count({ where: { status: "ACTIVE" } }),
    prisma.apiKey.count({ where: { status: "REVOKED" } }),
    prisma.apiEndpoint.count(),
    prisma.apiEndpoint.count({ where: { status: "ACTIVE" } }),
    prisma.apiEndpoint.count({ where: { status: "MAINTENANCE" } }),
    prisma.apiEndpoint.count({ where: { status: "NON_ACTIVE" } }),
    prisma.billingInvoice.count(),
    prisma.billingInvoice.count({ where: { status: "UNPAID" } }),
    prisma.billingInvoice.count({ where: { status: "PAID" } }),
    prisma.usageLog.aggregate({
      where: { date: today },
      _sum: { requestsCount: true },
    }),
    prisma.billingInvoice.aggregate({
      where: {
        status: "PAID",
        createdAt: { gte: monthStart },
      },
      _sum: { amount: true },
    }),
    prisma.userSubscription.count({ where: { status: "ACTIVE" } }),
    prisma.userSubscription.count({
      where: {
        status: "ACTIVE",
        endAt: {
          gte: now,
          lte: sevenDaysFromNow,
        },
      },
    }),
  ]);

  return NextResponse.json(
    {
      snapshotAt: new Date().toISOString(),
      users: {
        total: totalUsers,
        blocked: blockedUsers,
        superAdmins,
      },
      apiKeys: {
        total: totalApiKeys,
        active: activeApiKeys,
        revoked: revokedApiKeys,
      },
      apiEndpoints: {
        total: totalApis,
        active: activeApis,
        maintenance: maintenanceApis,
        nonActive: nonActiveApis,
      },
      usage: {
        requestsToday: requestsTodayAgg._sum.requestsCount || 0,
      },
      billing: {
        totalInvoices,
        unpaidInvoices,
        paidInvoices,
        revenueThisMonth: revenueThisMonthAgg._sum.amount || 0,
      },
      subscriptions: {
        active: activeSubscriptions,
        expiringSoon: expiringSoonSubscriptions,
      },
    },
    { status: 200 },
  );
}
