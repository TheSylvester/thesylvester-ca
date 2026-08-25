import type { Metadata } from "next";
import Link from "next/link";
import ArticleCard from "@/components/article-card";
import PublicationShell from "@/components/publication-shell";
import { publishedArticles } from "@/lib/articles";

export const metadata: Metadata = {
  title: "Blog — Sylvester Wong",
  description:
    "Field notes on orchestrating Claude Code, Codex, and software-engineering agents: context, handoffs, verification, and the systems around them.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Blog — Sylvester Wong",
    description: "Field notes on building software with coding agents.",
    url: "/blog",
  },
};

export default function BlogIndex() {
  return (
    <PublicationShell active="blog">
      <section className="publication-hero">
        <div className="publication-kicker">BLOG / FIELD NOTES</div>
        <h1>What I learn while building with coding agents.</h1>
        <p>
          Concrete notes on orchestration, context, handoffs, verification, and the failures that changed how I work.
          Newest first; the <Link href="/guide">living guide</Link> arranges the durable ideas into a path.
        </p>
      </section>

      <section className="article-list" aria-labelledby="all-articles-heading">
        <div className="section-heading">
          <h2 id="all-articles-heading">All articles</h2>
          <span>{publishedArticles.length} entries</span>
        </div>
        {publishedArticles.map((article) => (
          <ArticleCard article={article} key={article.slug} />
        ))}
      </section>
    </PublicationShell>
  );
}
