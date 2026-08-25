---
name: blog
description: >-
  Turn ideas or private source material into privacy-safe, first-person articles
  for this repository, manage draft/unlisted/published visibility, and validate
  blog or living-guide content. Use when asked to plan, draft, edit, preview,
  promote, or publish a thesylvester.ca article; not for unrelated site copy.
---

# Blog

Maintain one body of writing with two public views: `/blog` is chronological;
`/guide` is the curated learning path. Articles live at `/blog/<slug>` and may
appear in either or both views according to their metadata.

## Load only what the task needs

- Read [references/evidence-and-voice.md](references/evidence-and-voice.md) when
  turning Discord exports, notes, transcripts, or other private material into
  an article, or when the draft's claims or voice need review.
- Read [references/repo-contract.md](references/repo-contract.md) before adding,
  changing, previewing, validating, or changing the visibility of an article.

## Start from the request

Inspect `git status`, the relevant files in `content/blog/`, and
`lib/articles.ts`. Preserve unrelated work in a dirty tree.

Identify the requested operation separately from its delivery gate:

1. research or make an evidence brief;
2. outline or draft;
3. implement or edit MDX;
4. preview or validate;
5. change visibility;
6. commit;
7. push or deploy.

Do only the gates the user authorized. Editing an article does not imply a
commit, and a commit does not imply a push. If the user did not choose a
visibility for new work, use `draft`.

## Article workflow

1. **Frame one reusable answer.** State the recurring question, the intended
   reader, the practical outcome, and one defensible thesis. Split unrelated
   lessons into separate articles.
2. **Ground the claims.** For private or conversational sources, make a compact
   evidence brief under `.ai-reference/blog/<slug>/`. Retain source locations
   there; publish generalized lessons, not private context.
3. **Draft in the author's voice.** Write first person, distinguish experience
   from recommendation, explain tradeoffs, and give the reader a method they can
   try. Never invent a result, metric, quote, or personal experience to smooth
   the prose.
4. **Run a privacy pass before MDX.** Remove or generalize identities, private
   project details, internal links, message IDs, access tokens, and distinctive
   anecdotes. Do not treat `unlisted` as protection for sensitive content.
5. **Implement the repository contract.** Add or edit the MDX module and its
   article metadata. Keep the title/description useful out of context because
   they appear in cards, metadata, feeds, and search results.
6. **Validate proportionally.** Run the deterministic article check for content
   edits. Run lint and a production build before committing a publishable change.
   Preview the actual route when layout, navigation, code blocks, or status
   behavior changed.
7. **Review the rendered argument.** Check that the opening earns attention,
   headings form a useful outline, examples support the thesis, and the ending
   gives a concrete next move. Check privacy again after rendering.

## Visibility is a publication boundary

| status | intended behavior | use it for |
| --- | --- | --- |
| `draft` | local-site only; absent from production output | incomplete or unreviewed work |
| `unlisted` | deployed at its direct URL, omitted from discovery, marked `noindex` | shareable previews containing no secrets |
| `published` | eligible for blog, guide, feed, and sitemap discovery | reviewed public work |

Changing `draft` or `unlisted` to `published` is an editorial decision, not a
formatting cleanup. Make that change only when the user asks to publish or
approves the promotion. An unlisted URL is obscurity only: anyone with the URL
can read and share it.

No status makes secrets safe. A committed draft may still be readable in the
Git repository even though it is absent from the built site; keep private source
material in the ignored `.ai-reference/` workspace.

## Commit and push deliberately

- Before a commit, show the effective status and run `pnpm check`.
- Review the staged diff by name and content. Confirm `.ai-reference/` is ignored;
  never force-add evidence briefs or raw source material.
- Use the repository's conventional commit style, for example
  `docs: publish agent handoff guide`.
- Push only when the user explicitly asks to push or publish. That request also
  authorizes the necessary scoped commit unless the user says otherwise. State
  the target branch and deployment effect first. If it is `main` or triggers a
  live deployment and the request did not explicitly name that effect, confirm
  before proceeding; never push `main` as a hidden side effect.
- When the requested outcome is a public or unlisted URL, verify the deployed
  page and its visibility behavior after pushing before claiming it is ready.
- If validation or privacy review fails, keep the article non-public and report
  the concrete blocker. Do not weaken the checks to make publication pass.
