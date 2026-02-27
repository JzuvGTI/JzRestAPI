import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/access";
import { getAdminApiEndpoints } from "@/lib/api-endpoints";

export const runtime = "nodejs";

export async function GET() {
  const adminUser = await requireSuperAdmin();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const endpoints = await getAdminApiEndpoints();
  const normalized = endpoints.map((endpoint) => ({
    id: endpoint.id,
    slug: endpoint.slug,
    name: endpoint.name,
    path: endpoint.path,
    description: endpoint.description,
    sampleQuery: endpoint.sampleQuery,
    status: endpoint.status,
    maintenanceNote: endpoint.maintenanceNote || null,
    updatedAt: endpoint.updatedAt.toISOString(),
  }));

  return NextResponse.json(
    {
      endpoints: normalized,
      summary: {
        total: normalized.length,
        active: normalized.filter((item) => item.status === "ACTIVE").length,
        maintenance: normalized.filter((item) => item.status === "MAINTENANCE").length,
        nonActive: normalized.filter((item) => item.status === "NON_ACTIVE").length,
      },
    },
    { status: 200 },
  );
}
