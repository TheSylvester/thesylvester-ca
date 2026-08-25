import { publishedArticles } from "@/lib/articles";

export const dynamic = "force-static";

const siteUrl = "https://thesylvester.ca";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function GET() {
  const items = publishedArticles
    .map(
      (article) => `
    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${siteUrl}${article.href}</link>
      <guid isPermaLink="true">${siteUrl}${article.href}</guid>
      <description>${escapeXml(article.description)}</description>
      <pubDate>${new Date(`${article.publishedAt}T12:00:00Z`).toUTCString()}</pubDate>
    </item>`,
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>Sylvester Wong — Coding Agent Field Notes</title>
    <link>${siteUrl}/blog</link>
    <description>Notes on orchestrating Claude Code, Codex, and software-engineering agents.</description>
    <language>en-ca</language>${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
