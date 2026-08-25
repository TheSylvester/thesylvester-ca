import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "out");
const contentDirectory = path.join(root, "content", "blog");
const errors = [];

function field(source, name) {
  return source.match(new RegExp(`${name}:\\s*"([^"]+)"`))?.[1];
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(out))) {
  console.error("Blog export validation requires a completed `pnpm build`.");
  process.exit(1);
}

const [blogHtml, guideHtml, feedXml, sitemapXml] = await Promise.all([
  readFile(path.join(out, "blog.html"), "utf8"),
  readFile(path.join(out, "guide.html"), "utf8"),
  readFile(path.join(out, "feed.xml"), "utf8"),
  readFile(path.join(out, "sitemap.xml"), "utf8"),
]);

const surfaces = [
  ["blog index", blogHtml],
  ["guide", guideHtml],
  ["RSS feed", feedXml],
  ["sitemap", sitemapXml],
];
const files = (await readdir(contentDirectory)).filter((name) => name.endsWith(".mdx"));

for (const file of files) {
  const source = await readFile(path.join(contentDirectory, file), "utf8");
  const slug = file.slice(0, -4);
  const title = field(source, "title");
  const status = field(source, "status");
  const guideOrder = /guideOrder:\s*\d+/.test(source);
  const route = path.join(out, "blog", `${slug}.html`);
  const routeExists = await exists(route);

  if (status === "draft") {
    if (routeExists) errors.push(`${slug}: draft route exists in the production export.`);
    for (const [name, body] of surfaces) {
      if (title && body.includes(title)) errors.push(`${slug}: draft title leaked into ${name}.`);
    }
    continue;
  }

  if (!routeExists) {
    errors.push(`${slug}: ${status} route is missing from the production export.`);
    continue;
  }

  const routeHtml = await readFile(route, "utf8");
  if (!routeHtml.includes(`<link rel="canonical" href="https://thesylvester.ca/blog/${slug}"`)) {
    errors.push(`${slug}: exported route is missing its canonical URL.`);
  }
  if (!routeHtml.includes('property="og:image"') || !routeHtml.includes('name="twitter:image"')) {
    errors.push(`${slug}: exported route is missing its social sharing image metadata.`);
  }

  if (status === "unlisted") {
    for (const [name, body] of surfaces) {
      if (title && body.includes(title)) errors.push(`${slug}: unlisted title leaked into ${name}.`);
    }
    if (!routeHtml.includes('name="robots" content="noindex, nofollow, noarchive"')) {
      errors.push(`${slug}: unlisted route is missing noindex/nofollow/noarchive.`);
    }
    continue;
  }

  if (title && !blogHtml.includes(title)) errors.push(`${slug}: published title is missing from the blog index.`);
  if (title && guideOrder && !guideHtml.includes(title)) errors.push(`${slug}: guide chapter is missing from /guide.`);
  if (title && !feedXml.includes(title)) errors.push(`${slug}: published title is missing from RSS.`);
  if (!sitemapXml.includes(`https://thesylvester.ca/blog/${slug}`)) {
    errors.push(`${slug}: published URL is missing from the sitemap.`);
  }
}

if (errors.length > 0) {
  console.error(`Blog export validation failed with ${errors.length} error${errors.length === 1 ? "" : "s"}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Blog export validation passed: ${files.length} article visibility boundaries verified.`);
}
