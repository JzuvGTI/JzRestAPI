import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSuperAdmin } from "@/lib/access";
import { getAdminRequestMeta, writeAdminAuditLog } from "@/lib/admin-audit";
import { actionReasonSchema } from "@/lib/admin-helpers";
import { checkAdminRateLimit } from "@/lib/admin-rate-limit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const bulkRevokeSchema = z.object({
  apiKeyIds: z.array(z.string().min(1)).min(1).max(200),
  reason: actionReasonSchema,
});

export async function POST(request: Request) {
  const adminUser = await requireSuperAdmin();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const rate = checkAdminRateLimit({
    userId: adminUser.id,
    scope: "admin-api-key-bulk-revoke",
    maxHits: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Too many bulk actions. Retry in ${rate.retryAfterSec}s.` },
      { status: 429 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = bulkRevokeSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request data." }, { status: 400 });
  }

  const uniqueIds = Array.from(new Set(parsed.data.apiKeyIds));
  const beforeRows = await prisma.apiKey.findMany({
    where: {
      id: {
        in: uniqueIds,
      },
    },
    select: {
      id: true,
      userId: true,
      key: true,
      label: true,
      status: true,
      dailyLimit: true,
    },
  });

  if (beforeRows.length === 0) {
    return NextResponse.json({ error: "No API keys found for selected ids." }, { status: 404 });
  }

  const updated = await prisma.apiKey.updateMany({
    where: {
      id: { in: beforeRows.map((row) => row.id) },
      status: { not: "REVOKED" },
    },
    data: {
      status: "REVOKED",
    },
  });

  const requestMeta = getAdminRequestMeta(request);
  const bulkId = `bulk-revoke-${Date.now()}`;
  await writeAdminAuditLog(prisma, adminUser.id, {
    action: "ADMIN_API_KEY_BULK_REVOKE",
    targetType: "API_KEY_BULK",
    targetId: bulkId,
    reason: parsed.data.reason,
    before: beforeRows,
    after: {
      selectedCount: beforeRows.length,
      revokedCount: updated.count,
      keyIds: beforeRows.map((row) => row.id),
    },
    ipAddress: requestMeta.ipAddress,
    userAgent: requestMeta.userAgent,
  });

  return NextResponse.json(
    {
      message: "Bulk revoke completed.",
      selectedCount: beforeRows.length,
      revokedCount: updated.count,
    },
    { status: 200 },
  );
}
