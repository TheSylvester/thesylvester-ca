# Repository article contract

Read the current implementation before editing: this reference records the
intended invariants, while `lib/articles.ts` and a recent article are the source
of truth for exact TypeScript fields.

## Files and URLs

- Article modules: `content/blog/<slug>.mdx`
- Article registry and loaders: `lib/articles.ts`
- Canonical URL: `/blog/<slug>`
- Blog index: `/blog`
- Curated guide: `/guide`
- Private working notes: `.ai-reference/blog/<slug>/`

Use a stable, lowercase, hyphenated slug. Renaming a published slug changes a
public URL; do not do it as incidental title editing.

Each MDX file exports `const article` with the metadata accepted by
`lib/articles.ts`. Preserve existing field names and types. At minimum, expect:

- `title` and `description`;
- `publishedAt` and `updatedAt` as `YYYY-MM-DD`;
- `status`: `draft`, `unlisted`, or `published`;
- `kind` and `topics`;
- `readingMinutes`, rounded up from the current draft;
- guide ordering and featured state when applicable.

Keep `publishedAt` stable after publication. Change `updatedAt` only for a
material reader-facing revision, not punctuation or formatting. Guide order is
curation, so inspect neighboring articles rather than choosing a number in
isolation.

For a draft, `publishedAt` is the planned release date and may be corrected
before sharing. For unlisted or published content, it is the date the article
first became public by URL; promoting an already shared unlisted article does
not silently rewrite it. Set `updatedAt` to the same date for a new article.

If the registry uses explicit loaders, add the new slug there. Do not create a
second metadata source or hand-maintained blog/guide list.

## Writing MDX

- The route renders the article title and description; follow the convention in
  existing MDX before adding a duplicate top-level heading.
- Use semantic headings in order, descriptive link text, fenced code blocks with
  a language when known, and alt text that conveys an image's purpose.
- Prefer repository MDX components and existing visual patterns over raw HTML or
  one-off inline styles.
- Keep private source markers and editorial notes in `.ai-reference/`, not in the
  published MDX.
- Do not edit `out/`, `.next/`, feed XML, or sitemap artifacts by hand.

## Visibility checks

- `draft`: available for local authoring but excluded from a production export.
- `unlisted`: production route exists, but it must be absent from blog/guide
  listings, featured links, feeds, and sitemaps, and it must emit `noindex`.
- `published`: may appear in discovery surfaces according to its metadata.

An unlisted article must still pass the public privacy review. Verify behavior in
the built output when changing status logic; metadata alone is not sufficient.
A draft is local-only on the rendered site, not secret storage: once committed,
its source may be readable in the repository. Keep private evidence in the
ignored `.ai-reference/` tree.

## Validation

For an ordinary content edit:

```bash
pnpm blog:check
```

Before committing a new article, a status promotion, or a registry/layout change:

```bash
pnpm lint
pnpm blog:check
pnpm build
pnpm blog:check-export
```

Then inspect the rendered route. Follow the repository's browser-QA instructions
when browser automation is needed. For `unlisted`, also inspect discovery
surfaces and the page's robots metadata. For `draft`, confirm the production
build does not contain its route or text.

Before staging, run `git check-ignore -v .ai-reference/blog/<slug>/evidence.md`
when an evidence brief exists. Before committing, inspect both
`git diff --cached --name-status` and `git diff --cached`; stage only the intended
public files. Never use `git add -f` on `.ai-reference/`.
