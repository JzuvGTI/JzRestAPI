import type { ApiEndpointStatus } from "@prisma/client";

import { API_CATALOG_DEFINITIONS, type MarketplaceApi } from "@/lib/api-catalog";
import { prisma } from "@/lib/prisma";

type ApiEndpointRow = {
  id: string;
  slug: string;
  name: string;
  path: string;
  description: string;
  sampleQuery: string;
  status: ApiEndpointStatus;
  maintenanceNote: string | null;
  updatedAt: Date;
};

export async function ensureApiCatalogSeeded() {
  await Promise.all(
    API_CATALOG_DEFINITIONS.map((definition) =>
      prisma.apiEndpoint.upsert({
        where: { slug: definition.slug },
        create: {
          slug: definition.slug,
          name: definition.name,
          path: definition.path,
          description: definition.description,
          sampleQuery: definition.sampleQuery,
          status: definition.defaultStatus,
        },
        update: {
          name: definition.name,
          path: definition.path,
          description: definition.description,
          sampleQuery: definition.sampleQuery,
        },
      }),
    ),
  );
}

export async function getMarketplaceApis(): Promise<MarketplaceApi[]> {
  await ensureApiCatalogSeeded();

  const rows = await prisma.apiEndpoint.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      path: true,
      description: true,
      sampleQuery: true,
      status: true,
    },
  });

  const bySlug = new Map(rows.map((row) => [row.slug, row]));

  return API_CATALOG_DEFINITIONS.map((definition) => {
    const row = bySlug.get(definition.slug);
    return {
      id: row?.id || definition.id,
      slug: definition.slug,
      name: definition.name,
      category: definition.category,
      path: definition.path,
      description: definition.description,
      sampleQuery: definition.sampleQuery,
      status: row?.status || definition.defaultStatus,
      docs: definition.docs,
    };
  });
}

export async function getApiEndpointStatusBySlug(slug: string) {
  await ensureApiCatalogSeeded();

  return prisma.apiEndpoint.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      path: true,
      status: true,
      updatedAt: true,
    },
  });
}

export async function getAdminApiEndpoints(): Promise<ApiEndpointRow[]> {
  await ensureApiCatalogSeeded();

  return prisma.apiEndpoint.findMany({
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      path: true,
      description: true,
      sampleQuery: true,
      status: true,
      maintenanceNote: true,
      updatedAt: true,
    },
  });
}
