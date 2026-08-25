import Link from "next/link";
import { formatArticleDate, formatArticleKind, type Article } from "@/lib/articles";

type ArticleCardProps = {
  article: Article;
  index?: number;
  showIndex?: boolean;
};

export default function ArticleCard({ article, index, showIndex = false }: ArticleCardProps) {
  return (
    <article className="article-card">
      <Link href={article.href} className="article-card-link" aria-label={`Read ${article.title}`}>
        <div className="article-card-meta">
          {showIndex && index !== undefined ? <span>{String(index + 1).padStart(2, "0")}</span> : null}
          <span>{formatArticleKind(article.kind)}</span>
          <time dateTime={article.publishedAt}>{formatArticleDate(article.publishedAt)}</time>
          <span>{article.readingMinutes} min</span>
        </div>
        <h2>{article.title}</h2>
        <p>{article.description}</p>
        <div className="article-card-footer">
          <span>{article.topics.join(" · ")}</span>
          <span aria-hidden="true">read →</span>
        </div>
      </Link>
    </article>
  );
}
