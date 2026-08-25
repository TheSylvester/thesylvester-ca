import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArticleLayout from "@/components/article-layout";
import { allArticles, canRenderArticle, getArticle, publishedArticles } from "@/lib/articles";

type ArticlePageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return allArticles.filter(canRenderArticle).map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);

  if (!article || !canRenderArticle(article)) return {};

  const shouldIndex = article.status === "published";
  const socialImage = {
    url: "/blog/opengraph-image",
    width: 1200,
    height: 630,
    alt: "Sylvester Wong — Coding Agent Field Notes",
  };

  return {
    title: `${article.title} — Sylvester Wong`,
    description: article.description,
    alternates: { canonical: article.href },
    robots: shouldIndex ? undefined : { index: false, follow: false, noarchive: true },
    openGraph: {
      title: article.title,
      description: article.description,
      url: article.href,
      type: "article",
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt,
      authors: ["Sylvester Wong"],
      tags: article.topics,
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description,
      images: [socialImage],
    },
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = getArticle(slug);

  if (!article || !canRenderArticle(article)) notFound();

  const publishedIndex = publishedArticles.findIndex((entry) => entry.slug === article.slug);
  const previous = publishedIndex >= 0 ? publishedArticles[publishedIndex + 1] : undefined;
  const next = publishedIndex > 0 ? publishedArticles[publishedIndex - 1] : undefined;
  const { Content } = article;

  return (
    <ArticleLayout article={article} previous={previous} next={next}>
      <Content />
    </ArticleLayout>
  );
}
