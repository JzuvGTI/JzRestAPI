import { NextResponse } from "next/server";

import { getApiHealthSnapshots, getSingleApiHealthSnapshot } from "@/lib/api-health-monitor";
import { getMarketplaceApis } from "@/lib/api-endpoints";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const slug = (url.searchParams.get("slug") || "").trim();
  const apis = await getMarketplaceApis();

  if (slug) {
    const target = apis.find((api) => api.slug === slug);
    if (!target) {
      return NextResponse.json({ message: "API endpoint not found." }, { status: 404 });
    }

    const snapshot = force
      ? await getSingleApiHealthSnapshot({ api: target, baseOrigin: url.origin })
      : (await getApiHealthSnapshots({ apis, baseOrigin: url.origin, force: false })).snapshots[target.slug];

    return NextResponse.json(
      {
        apis: [
          {
            id: target.id,
            slug: target.slug,
            path: target.path,
            operationalStatus: target.status,
            healthStatus: snapshot?.healthStatus ?? "CHECKING",
            responseTimeMs: snapshot?.responseTimeMs ?? null,
            httpStatus: snapshot?.httpStatus ?? null,
            lastCheckedAt: snapshot?.lastCheckedAt ?? null,
            healthError: snapshot?.error ?? null,
          },
        ],
        checkedAt: snapshot?.lastCheckedAt || new Date().toISOString(),
      },
      { status: 200 },
    );
  }

  const health = await getApiHealthSnapshots({
    apis,
    baseOrigin: url.origin,
    force,
  });

  return NextResponse.json(
    {
      apis: apis.map((api) => ({
        id: api.id,
        slug: api.slug,
        path: api.path,
        operationalStatus: api.status,
        healthStatus: health.snapshots[api.slug]?.healthStatus ?? "CHECKING",
        responseTimeMs: health.snapshots[api.slug]?.responseTimeMs ?? null,
        httpStatus: health.snapshots[api.slug]?.httpStatus ?? null,
        lastCheckedAt: health.snapshots[api.slug]?.lastCheckedAt ?? null,
        healthError: health.snapshots[api.slug]?.error ?? null,
      })),
      checkedAt: health.checkedAt,
    },
    { status: 200 },
  );
}
