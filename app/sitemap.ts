import type { MetadataRoute } from "next";

const SITE_URL = "https://api.jzuv.my.id";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 1,
    },
  ];
}
