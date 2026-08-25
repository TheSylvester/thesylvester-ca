import type { ComponentType } from "react";
import BigPrompt, {
  article as bigPromptMetadata,
} from "@/content/blog/the-big-prompt-still-exists.mdx";
import JsonlJira, {
  article as jsonlJiraMetadata,
} from "@/content/blog/jsonl-became-jira-for-agents.mdx";
import LastResponsibleHandoff, {
  article as lastResponsibleHandoffMetadata,
} from "@/content/blog/handoffs-at-the-last-responsible-moment.mdx";

export const articleStatuses = ["draft", "unlisted", "published"] as const;
export const articleKinds = ["guide", "field-note", "case-study"] as const;

export type ArticleStatus = (typeof articleStatuses)[number];
export type ArticleKind = (typeof articleKinds)[number];

export type ArticleMetadata = {
  title: string;
  description: string;
  publishedAt: string;
  updatedAt: string;
  status: ArticleStatus;
  kind: ArticleKind;
  topics: string[];
  readingMinutes: number;
  guideOrder?: number;
  featured?: boolean;
};

export type Article = ArticleMetadata & {
  slug: string;
  href: `/blog/${string}`;
  Content: ComponentType;
};

type ArticleModule = {
  slug: string;
  metadata: unknown;
  Content: ComponentType;
};

const modules: ArticleModule[] = [
  {
    slug: "the-big-prompt-still-exists",
    metadata: bigPromptMetadata,
    Content: BigPrompt,
  },
  {
    slug: "jsonl-became-jira-for-agents",
    metadata: jsonlJiraMetadata,
    Content: JsonlJira,
  },
  {
    slug: "handoffs-at-the-last-responsible-moment",
    metadata: lastResponsibleHandoffMetadata,
    Content: LastResponsibleHandoff,
  },
];

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function parseMetadata(slug: string, value: unknown): ArticleMetadata {
  if (!value || typeof value !== "object") {
    throw new Error(`Article ${slug} must export an article metadata object.`);
  }

  const candidate = value as Record<string, unknown>;
  const requiredStrings = ["title", "description", "publishedAt", "updatedAt"] as const;

  for (const field of requiredStrings) {
    if (typeof candidate[field] !== "string" || candidate[field].trim() === "") {
      throw new Error(`Article ${slug} is missing a valid ${field}.`);
    }
  }

  if (!articleStatuses.includes(candidate.status as ArticleStatus)) {
    throw new Error(`Article ${slug} has an invalid status.`);
  }

  if (!articleKinds.includes(candidate.kind as ArticleKind)) {
    throw new Error(`Article ${slug} has an invalid kind.`);
  }

  if (!isStringArray(candidate.topics) || candidate.topics.length === 0) {
    throw new Error(`Article ${slug} must have at least one topic.`);
  }

  if (typeof candidate.readingMinutes !== "number" || candidate.readingMinutes < 1) {
    throw new Error(`Article ${slug} has an invalid readingMinutes value.`);
  }

  if (candidate.guideOrder !== undefined && typeof candidate.guideOrder !== "number") {
    throw new Error(`Article ${slug} has an invalid guideOrder.`);
  }

  if (candidate.featured !== undefined && typeof candidate.featured !== "boolean") {
    throw new Error(`Article ${slug} has an invalid featured flag.`);
  }

  return candidate as ArticleMetadata;
}

export const allArticles: Article[] = modules
  .map(({ slug, metadata, Content }) => ({
    ...parseMetadata(slug, metadata),
    slug,
    href: `/blog/${slug}` as const,
    Content,
  }))
  .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.title.localeCompare(b.title));

export const publishedArticles = allArticles.filter((article) => article.status === "published");

export const guideArticles = publishedArticles
  .filter((article) => article.guideOrder !== undefined)
  .sort((a, b) => (a.guideOrder ?? Number.MAX_SAFE_INTEGER) - (b.guideOrder ?? Number.MAX_SAFE_INTEGER));

export function canRenderArticle(article: Article): boolean {
  if (article.status !== "draft") return true;

  return process.env.NODE_ENV === "development" || process.env.BLOG_INCLUDE_DRAFTS === "1";
}

export function getArticle(slug: string): Article | undefined {
  return allArticles.find((article) => article.slug === slug);
}

export function formatArticleDate(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function formatArticleKind(kind: ArticleKind): string {
  return kind.replace("-", " ");
}
