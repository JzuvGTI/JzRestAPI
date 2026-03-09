import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSuperAdmin } from "@/lib/access";
import { getAdminRequestMeta, writeAdminAuditLog } from "@/lib/admin-audit";
import { actionReasonSchema } from "@/lib/admin-helpers";
import {
  serializeAdminAnnouncement,
  summarizeAnnouncements,
} from "@/lib/announcements";
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

const createAnnouncementSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    message: z.string().trim().min(8).max(3000),
    tone: toneSchema,
    status: statusSchema,
    audience: audienceSchema,
    badgeLabel: optionalTrimmedString(24),
    ctaLabel: optionalTrimmedString(40),
    ctaHref: optionalTrimmedString(300),
    priority: z.coerce.number().int().min(-100).max(100),
    isPinned: z.coerce.boolean(),
    isDismissible: z.coerce.boolean(),
    startsAt: optionalDateSchema(),
    endsAt: optionalDateSchema(),
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

export async function GET() {
  const adminUser = await requireSuperAdmin();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const rows = await prisma.announcement.findMany({
    orderBy: [{ isPinned: "desc" }, { priority: "desc" }, { updatedAt: "desc" }],
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

  return NextResponse.json(
    {
      announcements: rows.map(serializeAdminAnnouncement),
      summary: summarizeAnnouncements(rows),
      updatedAt: new Date().toISOString(),
    },
    { status: 200 },
  );
}

export async function POST(request: Request) {
  const adminUser = await requireSuperAdmin();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const rate = checkAdminRateLimit({
    userId: adminUser.id,
    scope: "admin-announcement-create",
    maxHits: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Too many announcement updates. Retry in ${rate.retryAfterSec}s.` },
      { status: 429 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = createAnnouncementSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid announcement data." }, { status: 400 });
  }

  const created = await prisma.announcement.create({
    data: {
      title: parsed.data.title,
      message: parsed.data.message,
      tone: parsed.data.tone,
      status: parsed.data.status,
      audience: parsed.data.audience,
      badgeLabel: parsed.data.badgeLabel,
      ctaLabel: parsed.data.ctaLabel,
      ctaHref: parsed.data.ctaHref,
      priority: parsed.data.priority,
      isPinned: parsed.data.isPinned,
      isDismissible: parsed.data.isDismissible,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      createdById: adminUser.id,
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
    action: "ADMIN_ANNOUNCEMENT_CREATE",
    targetType: "ANNOUNCEMENT",
    targetId: created.id,
    reason: parsed.data.reason,
    after: serializeAdminAnnouncement(created),
    ipAddress: requestMeta.ipAddress,
    userAgent: requestMeta.userAgent,
  });

  return NextResponse.json(
    {
      message: "Announcement created.",
      announcement: serializeAdminAnnouncement(created),
    },
    { status: 201 },
  );
}
