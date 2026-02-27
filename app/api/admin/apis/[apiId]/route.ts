import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSuperAdmin } from "@/lib/access";
import { getAdminRequestMeta, writeAdminAuditLog } from "@/lib/admin-audit";
import { actionReasonSchema } from "@/lib/admin-helpers";
import { checkAdminRateLimit } from "@/lib/admin-rate-limit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const updateApiSchema = z.object({
  status: z.enum(["ACTIVE", "NON_ACTIVE", "MAINTENANCE"]),
  maintenanceNote: z.string().trim().max(500).optional(),
  reason: actionReasonSchema,
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ apiId: string }> },
) {
  const adminUser = await requireSuperAdmin();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const rate = checkAdminRateLimit({
    userId: adminUser.id,
    scope: "admin-api-endpoint-patch",
    maxHits: 40,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Too many endpoint updates. Retry in ${rate.retryAfterSec}s.` },
      { status: 429 },
    );
  }

  const { apiId } = await context.params;
  if (!apiId) {
    return NextResponse.json({ error: "API id is required." }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = updateApiSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request data." }, { status: 400 });
  }

  const targetBefore = await prisma.apiEndpoint.findUnique({
    where: { id: apiId },
    select: {
      id: true,
      slug: true,
      name: true,
      path: true,
      status: true,
      maintenanceNote: true,
    },
  });

  if (!targetBefore) {
    return NextResponse.json({ error: "API endpoint not found." }, { status: 404 });
  }

  const nextMaintenanceNote =
    parsed.data.status === "MAINTENANCE"
      ? parsed.data.maintenanceNote?.trim() || targetBefore.maintenanceNote || "Maintenance in progress."
      : parsed.data.maintenanceNote?.trim() || null;

  const targetAfter = await prisma.apiEndpoint.update({
    where: { id: apiId },
    data: {
      status: parsed.data.status,
      maintenanceNote: nextMaintenanceNote,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      path: true,
      status: true,
      maintenanceNote: true,
    },
  });

  const requestMeta = getAdminRequestMeta(request);
  await writeAdminAuditLog(prisma, adminUser.id, {
    action: "ADMIN_API_ENDPOINT_UPDATE",
    targetType: "API_ENDPOINT",
    targetId: apiId,
    reason: parsed.data.reason,
    before: targetBefore,
    after: targetAfter,
    ipAddress: requestMeta.ipAddress,
    userAgent: requestMeta.userAgent,
  });

  return NextResponse.json({ message: "API endpoint updated." }, { status: 200 });
}
