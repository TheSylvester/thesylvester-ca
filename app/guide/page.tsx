import type { Metadata } from "next";
import Link from "next/link";
import ArticleCard from "@/components/article-card";
import PublicationShell from "@/components/publication-shell";
import { guideArticles } from "@/lib/articles";

export const metadata: Metadata = {
  title: "My Coding Agent Guide — Sylvester Wong",
  description:
    "A living, opinionated guide to using Claude Code, Codex, and coding agents for serious software engineering.",
  alternates: { canonical: "/guide" },
  openGraph: {
    title: "My Coding Agent Guide — Sylvester Wong",
    description: "A living guide to context, delegation, handoffs, verification, and engineering judgment.",
    url: "/guide",
    images: [
      {
        url: "/blog/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Sylvester Wong — Coding Agent Field Notes",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "My Coding Agent Guide — Sylvester Wong",
    description: "A living guide to context, delegation, handoffs, verification, and engineering judgment.",
    images: ["/blog/opengraph-image"],
  },
};

export default function Guide() {
  return (
    <PublicationShell active="guide">
      <section className="publication-hero guide-hero">
        <div className="publication-kicker">MY CODING AGENT GUIDE / LIVING DOCUMENT</div>
        <h1>How I actually use AI to build software.</h1>
        <p>
          This is the durable version of what I usually explain in conversations: an opinionated path from intent to
          implementation, with context isolation, agent handoffs, verification, and human merge authority.
        </p>
        <div className="guide-pipeline" aria-label="Workflow">
          {["intent", "deliberate", "retain", "handoff", "implement", "verify"].map((step, index) => (
            <span key={step}>
              <b>{step}</b>
              {index < 5 ? <i aria-hidden="true">→</i> : null}
            </span>
          ))}
        </div>
      </section>

      <section className="guide-intro" aria-labelledby="how-to-read">
        <div>
          <span className="guide-intro-number">00</span>
          <h2 id="how-to-read">How to read this</h2>
        </div>
        <p>
          Start at the top if you are building your first repeatable workflow. If you already run multiple agents,
          jump to the failure mode you recognize. These chapters change as the method changes; dated field notes stay
          in the <Link href="/blog">blog</Link>.
        </p>
      </section>

      <section className="article-list guide-list" aria-labelledby="guide-chapters-heading">
        <div className="section-heading">
          <h2 id="guide-chapters-heading">The method</h2>
          <span>{guideArticles.length} chapters</span>
        </div>
        {guideArticles.map((article, index) => (
          <ArticleCard article={article} index={index} key={article.slug} showIndex />
        ))}
      </section>

      <aside className="guide-note">
        <span>NOTE</span>
        <p>
          This is a working guide, not a universal recipe. I keep the parts that survive real use, revise the parts
          that do not, and write down the tradeoffs so you can decide what fits your own work.
        </p>
      </aside>
    </PublicationShell>
  );
}
