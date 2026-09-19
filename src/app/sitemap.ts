import type { MetadataRoute } from "next";

import { DOCS_BASE_URL, DOCS_SECTIONS } from "@/docs/content";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      changeFrequency: "weekly",
      lastModified: new Date("2026-07-14T00:00:00.000Z"),
      priority: 1,
      url: "https://wzrd.tech",
    },
    {
      changeFrequency: "weekly",
      lastModified: new Date(),
      priority: 0.8,
      url: DOCS_BASE_URL,
    },
    {
      changeFrequency: "yearly",
      lastModified: new Date("2026-09-19T00:00:00.000Z"),
      priority: 0.3,
      url: "https://wzrd.tech/terms",
    },
    {
      changeFrequency: "yearly",
      lastModified: new Date("2026-09-19T00:00:00.000Z"),
      priority: 0.3,
      url: "https://wzrd.tech/privacy",
    },
    ...DOCS_SECTIONS.map((s) => ({
      changeFrequency: "weekly" as const,
      lastModified: new Date(),
      priority: 0.7,
      url: `${DOCS_BASE_URL}/${s.id}`,
    })),
  ];
}
