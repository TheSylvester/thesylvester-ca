import Link from "next/link";
import type { ReactNode } from "react";
import { formatArticleDate, formatArticleKind, type Article } from "@/lib/articles";
import PublicationShell from "@/components/publication-shell";

type ArticleLayoutProps = {
  article: Article;
  children: ReactNode;
  previous?: Article;
  next?: Article;
};

export default function ArticleLayout({ article, children, previous, next }: ArticleLayoutProps) {
  const wasUpdated = article.updatedAt !== article.publishedAt;

  return (
    <PublicationShell active="blog">
      <article className="article-page">
        <header className="article-header">
          {article.status !== "published" ? (
            <div className="article-visibility" role="note">
              {article.status} preview — not listed publicly
            </div>
          ) : null}
          <div className="article-eyebrow">
            <span>{formatArticleKind(article.kind)}</span>
            <span aria-hidden="true">/</span>
            <time dateTime={article.publishedAt}>{formatArticleDate(article.publishedAt)}</time>
            <span aria-hidden="true">/</span>
            <span>{article.readingMinutes} min read</span>
            {wasUpdated ? (
              <>
                <span aria-hidden="true">/</span>
                <span>updated {formatArticleDate(article.updatedAt)}</span>
              </>
            ) : null}
          </div>
          <h1>{article.title}</h1>
          <p className="article-dek">{article.description}</p>
          <div className="article-topics" aria-label="Topics">
            {article.topics.map((topic) => (
              <span key={topic}>{topic}</span>
            ))}
          </div>
        </header>

        <div className="article-prose">{children}</div>

        <footer className="article-end">
          <div>
            <span className="article-end-label">last reviewed</span>
            <time dateTime={article.updatedAt}>{formatArticleDate(article.updatedAt)}</time>
          </div>
          <Link href="/guide">continue through the guide →</Link>
        </footer>
      </article>

      {previous || next ? (
        <nav className="article-pagination" aria-label="More articles">
          <div>
            {previous ? (
              <Link href={previous.href}>
                <span>← previous</span>
                <strong>{previous.title}</strong>
              </Link>
            ) : null}
          </div>
          <div>
            {next ? (
              <Link href={next.href}>
                <span>next →</span>
                <strong>{next.title}</strong>
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </PublicationShell>
  );
}
