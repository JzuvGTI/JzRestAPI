import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSuperAdmin } from "@/lib/access";
import { getAdminRequestMeta, writeAdminAuditLog } from "@/lib/admin-audit";
import { actionReasonSchema } from "@/lib/admin-helpers";
import { serializeAdminAnnouncement } from "@/lib/announcements";
import { checkAdminRateLimit } from "@/lib/admin-rate-limit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const toneSchema = z.enum(["INFO", "UPDATE", "WARNING", "CRITICAL"]);
const statusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
const audienceSchema = z.enum(["ALL", "FREE", "PAID", "RESELLER", "SUPERADMIN"]);

function optionalTrimmedString(maxLength: number) {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      const trimmed = typeof value === "string" ? value.trim() : "";
      return trimmed ? trimmed.slice(0, maxLength) : null;
    });
}

function optionalDateSchema() {
  return z
    .union([z.string().datetime({ offset: true }), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" ? new Date(value) : null));
}

const updateAnnouncementSchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    message: z.string().trim().min(8).max(3000).optional(),
    tone: toneSchema.optional(),
    status: statusSchema.optional(),
    audience: audienceSchema.optional(),
    badgeLabel: optionalTrimmedString(24).optional(),
    ctaLabel: optionalTrimmedString(40).optional(),
    ctaHref: optionalTrimmedString(300).optional(),
    priority: z.coerce.number().int().min(-100).max(100).optional(),
    isPinned: z.coerce.boolean().optional(),
    isDismissible: z.coerce.boolean().optional(),
    startsAt: optionalDateSchema().optional(),
    endsAt: optionalDateSchema().optional(),
    reason: actionReasonSchema,
  })
  .superRefine((value, context) => {
    if (value.startsAt && value.endsAt && value.endsAt.getTime() <= value.startsAt.getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End date must be after start date.",
        path: ["endsAt"],
      });
    }
  });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ announcementId: string }> },
) {
  const adminUser = await requireSuperAdmin();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const rate = checkAdminRateLimit({
    userId: adminUser.id,
    scope: "admin-announcement-patch",
    maxHits: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Too many announcement updates. Retry in ${rate.retryAfterSec}s.` },
      { status: 429 },
    );
  }

  const { announcementId } = await context.params;
  if (!announcementId) {
    return NextResponse.json({ error: "Announcement id is required." }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = updateAnnouncementSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid announcement data." }, { status: 400 });
  }

  const existing = await prisma.announcement.findUnique({
    where: { id: announcementId },
    include: {
      createdBy: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
  }

  const startsAt = parsed.data.startsAt === undefined ? existing.startsAt : parsed.data.startsAt;
  const endsAt = parsed.data.endsAt === undefined ? existing.endsAt : parsed.data.endsAt;
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    return NextResponse.json({ error: "End date must be after start date." }, { status: 400 });
  }

  const updated = await prisma.announcement.update({
    where: { id: announcementId },
    data: {
      title: parsed.data.title ?? existing.title,
      message: parsed.data.message ?? existing.message,
      tone: parsed.data.tone ?? existing.tone,
      status: parsed.data.status ?? existing.status,
      audience: parsed.data.audience ?? existing.audience,
      badgeLabel: parsed.data.badgeLabel === undefined ? existing.badgeLabel : parsed.data.badgeLabel,
      ctaLabel: parsed.data.ctaLabel === undefined ? existing.ctaLabel : parsed.data.ctaLabel,
      ctaHref: parsed.data.ctaHref === undefined ? existing.ctaHref : parsed.data.ctaHref,
      priority: parsed.data.priority ?? existing.priority,
      isPinned: parsed.data.isPinned ?? existing.isPinned,
      isDismissible: parsed.data.isDismissible ?? existing.isDismissible,
      startsAt,
      endsAt,
      version: { increment: 1 },
    },
    include: {
      createdBy: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  const requestMeta = getAdminRequestMeta(request);
  await writeAdminAuditLog(prisma, adminUser.id, {
    action: "ADMIN_ANNOUNCEMENT_UPDATE",
    targetType: "ANNOUNCEMENT",
    targetId: announcementId,
    reason: parsed.data.reason,
    before: serializeAdminAnnouncement(existing),
    after: serializeAdminAnnouncement(updated),
    ipAddress: requestMeta.ipAddress,
    userAgent: requestMeta.userAgent,
  });

  return NextResponse.json(
    {
      message: "Announcement updated.",
      announcement: serializeAdminAnnouncement(updated),
    },
    { status: 200 },
  );
}

const deleteAnnouncementSchema = z.object({
  reason: actionReasonSchema,
});

export async function DELETE(
  request: Request,
  context: { params: Promise<{ announcementId: string }> },
) {
  const adminUser = await requireSuperAdmin();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const rate = checkAdminRateLimit({
    userId: adminUser.id,
    scope: "admin-announcement-delete",
    maxHits: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Too many announcement deletes. Retry in ${rate.retryAfterSec}s.` },
      { status: 429 },
    );
  }

  const { announcementId } = await context.params;
  if (!announcementId) {
    return NextResponse.json({ error: "Announcement id is required." }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = deleteAnnouncementSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request data." }, { status: 400 });
  }

  const existing = await prisma.announcement.findUnique({
    where: { id: announcementId },
    include: {
      createdBy: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
  }

  await prisma.announcement.delete({
    where: { id: announcementId },
  });

  const requestMeta = getAdminRequestMeta(request);
  await writeAdminAuditLog(prisma, adminUser.id, {
    action: "ADMIN_ANNOUNCEMENT_DELETE",
    targetType: "ANNOUNCEMENT",
    targetId: announcementId,
    reason: parsed.data.reason,
    before: serializeAdminAnnouncement(existing),
    ipAddress: requestMeta.ipAddress,
    userAgent: requestMeta.userAgent,
  });

  return NextResponse.json({ message: "Announcement deleted." }, { status: 200 });
}
