import { unstable_cache } from "next/cache";

import { API_CATALOG_DEFINITIONS } from "@/lib/api-catalog";
import { prisma } from "@/lib/prisma";

export type LandingStats = {
  activeApis: number;
  registeredUsers: number;
  activeApiKeys: number;
};

const FALLBACK_ACTIVE_APIS = API_CATALOG_DEFINITIONS.filter(
  (definition) => definition.defaultStatus === "ACTIVE",
).length;

const getCachedLandingStats = unstable_cache(
  async (): Promise<LandingStats> => {
    const [apiEndpointTotal, activeApisCount, registeredUsers, activeApiKeys] = await Promise.all([
      prisma.apiEndpoint.count(),
      prisma.apiEndpoint.count({
        where: { status: "ACTIVE" },
      }),
      prisma.user.count(),
      prisma.apiKey.count({
        where: { status: "ACTIVE" },
      }),
    ]);

    return {
      activeApis: apiEndpointTotal === 0 ? FALLBACK_ACTIVE_APIS : activeApisCount,
      registeredUsers,
      activeApiKeys,
    };
  },
  ["landing-stats-v1"],
  {
    revalidate: 60,
  },
);

export async function getLandingStats(): Promise<LandingStats> {
  try {
    return await getCachedLandingStats();
  } catch {
    return {
      activeApis: FALLBACK_ACTIVE_APIS,
      registeredUsers: 0,
      activeApiKeys: 0,
    };
  }
}
