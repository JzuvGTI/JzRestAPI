import type { Plan, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type AnnouncementTone = "INFO" | "UPDATE" | "WARNING" | "CRITICAL";
type AnnouncementStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type AnnouncementAudience = "ALL" | "FREE" | "PAID" | "RESELLER" | "SUPERADMIN";

type AnnouncementRecord = {
  id: string;
  title: string;
  message: string;
  tone: AnnouncementTone;
  status: AnnouncementStatus;
  audience: AnnouncementAudience;
  badgeLabel: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  priority: number;
  isPinned: boolean;
  isDismissible: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    email: string;
    name: string | null;
  };
};

export type DashboardAnnouncement = {
  id: string;
  title: string;
  message: string;
  tone: AnnouncementTone;
  badgeLabel: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  isDismissible: boolean;
  version: number;
};

export type AdminAnnouncementRecord = {
  id: string;
  title: string;
  message: string;
  tone: AnnouncementTone;
  status: AnnouncementStatus;
  audience: AnnouncementAudience;
  badgeLabel: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  priority: number;
  isPinned: boolean;
  isDismissible: boolean;
  startsAt: string | null;
  endsAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    email: string;
    name: string | null;
  };
};

export type AdminAnnouncementSummary = {
  total: number;
  active: number;
  scheduled: number;
  expired: number;
  pinned: number;
};

function matchesAudience(
  audience: AnnouncementAudience,
  userPlan: Plan,
  userRole: UserRole,
) {
  if (audience === "ALL") {
    return true;
  }

  if (audience === "SUPERADMIN") {
    return userRole === "SUPERADMIN";
  }

  return audience === userPlan;
}

function isCurrentlyActive(
  status: AnnouncementStatus,
  startsAt: Date | null,
  endsAt: Date | null,
  now: Date,
) {
  if (status !== "PUBLISHED") {
    return false;
  }

  if (startsAt && startsAt.getTime() > now.getTime()) {
    return false;
  }

  if (endsAt && endsAt.getTime() < now.getTime()) {
    return false;
  }

  return true;
}

export function serializeAdminAnnouncement(record: AnnouncementRecord): AdminAnnouncementRecord {
  return {
    id: record.id,
    title: record.title,
    message: record.message,
    tone: record.tone,
    status: record.status,
    audience: record.audience,
    badgeLabel: record.badgeLabel || null,
    ctaLabel: record.ctaLabel || null,
    ctaHref: record.ctaHref || null,
    priority: record.priority,
    isPinned: record.isPinned,
    isDismissible: record.isDismissible,
    startsAt: record.startsAt ? record.startsAt.toISOString() : null,
    endsAt: record.endsAt ? record.endsAt.toISOString() : null,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    createdBy: {
      id: record.createdBy.id,
      email: record.createdBy.email,
      name: record.createdBy.name,
    },
  };
}

export function summarizeAnnouncements(records: AnnouncementRecord[]): AdminAnnouncementSummary {
  const now = new Date();

  return {
    total: records.length,
    active: records.filter((record) => isCurrentlyActive(record.status, record.startsAt, record.endsAt, now)).length,
    scheduled: records.filter(
      (record) =>
        record.status === "PUBLISHED" &&
        Boolean(record.startsAt && record.startsAt.getTime() > now.getTime()),
    ).length,
    expired: records.filter((record) => Boolean(record.endsAt && record.endsAt.getTime() < now.getTime())).length,
    pinned: records.filter((record) => record.isPinned).length,
  };
}

export async function getDashboardAnnouncementsForUser(input: {
  plan: Plan;
  role: UserRole;
  limit?: number;
}) {
  const limit = input.limit ?? 2;
  const now = new Date();

  const rows = await prisma.announcement.findMany({
    where: {
      status: "PUBLISHED",
      audience: {
        in: input.role === "SUPERADMIN"
          ? ["ALL", "FREE", "PAID", "RESELLER", "SUPERADMIN"]
          : ["ALL", input.plan],
      },
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    orderBy: [{ isPinned: "desc" }, { priority: "desc" }, { updatedAt: "desc" }],
    take: Math.max(1, Math.min(limit, 5)),
  });

  return rows
    .filter((row) => matchesAudience(row.audience, input.plan, input.role))
    .slice(0, limit)
    .map<DashboardAnnouncement>((row) => ({
      id: row.id,
      title: row.title,
      message: row.message,
      tone: row.tone,
      badgeLabel: row.badgeLabel || null,
      ctaLabel: row.ctaLabel || null,
      ctaHref: row.ctaHref || null,
      isDismissible: row.isDismissible,
      version: row.version,
    }));
}
