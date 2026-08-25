import type { MetadataRoute } from "next";
import { publishedArticles } from "@/lib/articles";

const siteUrl = "https://thesylvester.ca";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: new Date("2026-08-24T00:00:00Z"),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${siteUrl}/guide`,
      lastModified: new Date("2026-08-24T00:00:00Z"),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/blog`,
      lastModified: new Date("2026-08-24T00:00:00Z"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];

  const articles: MetadataRoute.Sitemap = publishedArticles.map((article) => ({
    url: `${siteUrl}${article.href}`,
    lastModified: new Date(`${article.updatedAt}T00:00:00Z`),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticPages, ...articles];
}
