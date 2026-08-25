import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentDirectory = path.join(root, "content", "blog");
const registryPath = path.join(root, "lib", "articles.ts");
const errors = [];
const statuses = new Set(["draft", "unlisted", "published"]);
const kinds = new Set(["guide", "field-note", "case-study"]);
const guideOrders = new Map();

function field(source, name) {
  return source.match(new RegExp(`${name}:\\s*"([^"]+)"`))?.[1];
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

const registry = await readFile(registryPath, "utf8");
const files = (await readdir(contentDirectory)).filter((name) => name.endsWith(".mdx")).sort();

if (files.length === 0) errors.push("content/blog contains no MDX articles.");

for (const file of files) {
  const source = await readFile(path.join(contentDirectory, file), "utf8");
  const slug = file.slice(0, -4);
  const label = `content/blog/${file}`;
  const title = field(source, "title");
  const description = field(source, "description");
  const publishedAt = field(source, "publishedAt");
  const updatedAt = field(source, "updatedAt");
  const status = field(source, "status");
  const kind = field(source, "kind");
  const topics = source.match(/topics:\s*\[([^\]]+)\]/)?.[1]?.match(/"[^"]+"/g) ?? [];
  const guideOrderMatch = source.match(/guideOrder:\s*(\d+)/);
  const readingMinutesMatch = source.match(/readingMinutes:\s*(\d+)/);
  const body = source.slice(source.indexOf("};") + 2);
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.push(`${label}: filename is not a URL-safe slug.`);
  if (!source.startsWith("export const article = {") || source.indexOf("};") === -1) {
    errors.push(`${label}: must begin with an exported article metadata object.`);
  }
  if (!title) errors.push(`${label}: title is required.`);
  if (!description) errors.push(`${label}: description is required.`);
  if (description && (description.length < 80 || description.length > 190)) {
    errors.push(`${label}: description must be 80–190 characters (found ${description.length}).`);
  }
  if (!validDate(publishedAt)) errors.push(`${label}: publishedAt must be YYYY-MM-DD.`);
  if (!validDate(updatedAt)) errors.push(`${label}: updatedAt must be YYYY-MM-DD.`);
  if (publishedAt && updatedAt && updatedAt < publishedAt) errors.push(`${label}: updatedAt precedes publishedAt.`);
  if (!statuses.has(status)) errors.push(`${label}: status must be draft, unlisted, or published.`);
  if (!kinds.has(kind)) errors.push(`${label}: kind must be guide, field-note, or case-study.`);
  if (topics.length === 0) errors.push(`${label}: at least one topic is required.`);
  if (!readingMinutesMatch || Number(readingMinutesMatch[1]) < 1) {
    errors.push(`${label}: readingMinutes must be a positive integer.`);
  }
  if (wordCount < 500) errors.push(`${label}: body is too short for an article (${wordCount} words).`);

  if (guideOrderMatch) {
    const order = Number(guideOrderMatch[1]);
    const previous = guideOrders.get(order);
    if (previous) errors.push(`${label}: guideOrder ${order} is already used by ${previous}.`);
    guideOrders.set(order, label);
  }

  const reviewMarkers = [
    "[NEEDS VERIFICATION]",
    "discord.com/channels/",
    "BEGIN PRIVATE",
    "PRIVATE SOURCE",
  ];
  for (const marker of reviewMarkers) {
    if (source.includes(marker)) errors.push(`${label}: unresolved review/privacy marker ${JSON.stringify(marker)}.`);
  }

  if (!registry.includes(`@/content/blog/${slug}.mdx`)) {
    errors.push(`${label}: article is not imported by lib/articles.ts.`);
  }
  if (!registry.includes(`slug: "${slug}"`)) {
    errors.push(`${label}: article slug is not registered by lib/articles.ts.`);
  }
}

const registeredSlugs = [...registry.matchAll(/slug: "([a-z0-9-]+)"/g)].map((match) => match[1]);
for (const slug of registeredSlugs) {
  if (!files.includes(`${slug}.mdx`)) errors.push(`lib/articles.ts: registered article ${slug} has no MDX file.`);
}

if (new Set(registeredSlugs).size !== registeredSlugs.length) {
  errors.push("lib/articles.ts: duplicate registered slug.");
}

if (errors.length > 0) {
  console.error(`Blog validation failed with ${errors.length} error${errors.length === 1 ? "" : "s"}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Blog validation passed: ${files.length} articles, ${guideOrders.size} guide chapters.`);
}
