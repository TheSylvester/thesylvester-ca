# Evidence, privacy, and voice

Use this reference when source material is conversational, private, or too large
to draft from safely in one pass.

## Select cheaply before interpreting deeply

Prefer an existing export such as `.ai-reference/discord-pilot/messages.md`.
Do not retrieve more private data merely because a corpus exists. If capture is
part of the request, require an explicit account/channel/time scope, collect at
a human pace, and preserve the platform's access boundaries.

Use deterministic filtering first: author, channel, date range, thread, and
literal terms. Give the language model only the selected passages needed for the
article. This keeps cost and accidental disclosure down without pretending the
selection itself understands meaning.

Establish the author's Discord identity from trusted export metadata or the
user's explicit statement before filtering by author. Do not guess from writing
style, display names, or conversational context. If identity is unresolved, ask
or restrict the brief to source ownership that can be proven.

For every article, create or update a brief under
`.ai-reference/blog/<slug>/evidence.md` with:

```markdown
# Evidence brief: <working title>

## Reader and recurring question
## Thesis
## Supported claims
| claim | source location | confidence | public transformation |
| --- | --- | --- | --- |
## Safe examples
## Details withheld or generalized
## Gaps and cautions
```

The brief is working material, not a citation dump. Source locations may be a
timestamp, local line range, thread marker, or file. Record enough to re-check a
claim without copying whole conversations.

## Privacy transformation

Default to paraphrase and synthesis. A Discord message being visible to channel
members does not make it publication-ready.

Remove or generalize:

- other people's names, handles, quotes, opinions, and identifying roles;
- private repository, customer, employer, and product details;
- internal URLs, invite links, message IDs, filenames, and unique error text;
- secrets, credentials, account details, and operational security information;
- distinctive combinations of timing, team size, and incident details that can
  re-identify a person or project.

Direct quotes from the author are also optional. Paraphrase them unless the exact
wording materially matters and has been checked in context. Never quote another
person without specific permission.

Do not take another participant's distinctive idea, claim, or experience and
recast it as the author's insight. Replies may supply context for interpreting
the author's messages, but they are not publishable evidence of the author's
practice unless the user explicitly clears that use and attribution.

If removing an identifier destroys the lesson, keep the article as a draft and
ask for an editorial decision. Do not solve the problem by marking it unlisted.

## First-person voice

The article should sound like an experienced practitioner explaining how they
work, not a neutral encyclopedia or a generated content template.

- Lead with the practical tension or recurring question.
- Use “I” for observed practice and choices the author can honestly own.
- Use “you” sparingly for a concrete action the reader can try.
- Separate “this worked in my workflow” from “this is universally correct.”
- Preserve sharp opinions when evidence supports them; include the tradeoff or
  failure mode that defines their boundary.
- Prefer a specific mechanism and small example over orchestration jargon.
- Write for a beginner on the first pass through each idea, while leaving enough
  operational detail for advanced readers to disagree productively.

Do not announce that an LLM helped draft the article unless the drafting process
is itself relevant. Also do not let polished prose imply experiences, tests, or
certainty absent from the source. Assistance stays in the workflow; authorship
claims stay grounded.

## Argument review

Before implementation, be able to answer:

1. What sentence would the author otherwise repeat on Discord?
2. What changes in the reader's next working session after reading this?
3. Which claim is directly supported, which is interpretation, and which is
   advice?
4. What important limitation would a skeptical advanced reader raise?
5. Could any excerpt identify or embarrass someone who did not choose to publish?
