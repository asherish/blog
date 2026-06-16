---
title: "Building a Dual-Publishing Blog Platform for Zenn and dev.to"
published: true
tags: Zenn, devto, ClaudeCode, GitHubActions
canonical_url: https://zenn.dev/asherish/articles/blog-repo-setup
---

This very article was published to two platforms at once — [Zenn](https://zenn.dev/) (in Japanese) and dev.to (the English version you're reading now) — from a single `git push`. Here's how I built the system that makes it possible.

[Zenn](https://zenn.dev/) is a popular tech blogging platform in Japan, similar to dev.to. I write articles in Japanese on Zenn and want the same content available in English on dev.to. But translating by hand is tedious, and machine translation always leaves that stiff "this was translated" feel. On top of that, the two platforms have subtly different Markdown dialects. So I automated the whole workflow. The source code is public:

{% github asherish/blog %}

## Goals

- Write in Japanese and get the English version generated automatically
- Make it read like a native English speaker wrote it — not a word-for-word translation
- Convert the Markdown syntax differences between Zenn and dev.to automatically
- Publish to both platforms with a single `git push`
- Preview both platforms locally

## How It Works (The Big Picture)

```
Write an article in Japanese
  ↓
/translate               ← Claude Code rewrites the Japanese into native English + converts syntax + updates state
  ↓
articles_en/ is generated
  ↓
Local preview            ← Zenn (localhost:18000) + dev.to (localhost:13000)
  ↓
git push
  ├→ Zenn auto-publish   (GitHub integration)
  └→ GitHub Actions      → Validate → Publish to dev.to via API
```

That's it: write, `/translate`, `git push` — published on two platforms.

## Directory Structure

```
blog/
├── .claude/
│   ├── settings.json               # Auto-allow permissions for translate scripts
│   └── skills/
│       ├── zenn-syntax.md          # Zenn syntax reference
│       ├── devto-syntax.md         # dev.to syntax reference
│       └── translate/SKILL.md      # One-way JP→EN localization skill (/translate)
├── .github/workflows/
│   ├── publish-to-devto.yml        # dev.to auto-publish workflow
│   └── scheduled-publish.yml       # Scheduled publish cron workflow
├── articles/                       # Zenn articles (Japanese, the source)
├── articles_en/                    # dev.to articles (English, generated)
├── books/                          # Zenn books
├── scripts/
│   ├── translate-detect.ts         # Change detection script (JSON output)
│   ├── translate-apply.ts          # Post-localization processing script
│   ├── sync/
│   │   ├── convert.ts              # Zenn → dev.to syntax conversion
│   │   └── state.ts                # State persistence
│   ├── publish-to-devto.ts         # dev.to publishing script
│   ├── process-scheduled.ts        # Scheduled publish processor
│   ├── validate-published.ts       # Pre-publish validation
│   └── preview-devto.ts            # dev.to preview server
├── .sync-state.json                # Per-article hash tracking of the Japanese source
├── .devto-mapping.json             # dev.to article ID mapping
├── package.json
└── tsconfig.json
```

## Localizing Japanese to English

The heart of this repo is the `/translate` command — a custom [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill that detects changes, rewrites the article into native English, converts syntax, and updates state in one shot. The design is deliberately **one-way**: the Japanese article is the single source of truth, and the English article is a generated artifact.

### Change Detection

Each article's Japanese source is SHA-256 hashed and tracked in `.sync-state.json`. When you run `/translate`, the script compares the current hash against the stored one to decide whether the English version needs regenerating:

| State | Action |
|-------|--------|
| No English version yet | Full rewrite JP → EN |
| Japanese was modified | Revise the existing English (full rewrite if the change is large) |
| Japanese unchanged | Skip |
| English with no Japanese source | Reported as an orphan (never touched) |

### The Three-Step Pipeline

**Step 1 — Detect** (`translate-detect.ts`): Hashes the Japanese sources, compares them, and outputs which articles need localizing — along with a reason (`new` or `update`) — as JSON.

**Step 2 — Localize** (Claude Code): Reads the Japanese source (and the existing English, if any), decides whether revising the current English is enough or a full rewrite is warranted, then writes the English body to the target file. This is a rewrite, not a literal translation — the prose is restructured to read the way a native English-speaking engineer would write it. Code, commands, numbers, and facts are never changed. Platform-specific syntax (`:::message`, `$$`, and the like) is left as-is and converted in the next step.

**Step 3 — Post-process** (`translate-apply.ts`): Converts Zenn → dev.to syntax via regex, generates the dev.to frontmatter, and updates `.sync-state.json`.

Separating the rewrite from the syntax conversion keeps the localization prompt focused on the content while regex handles the mechanical conversions reliably.

### Native Rewrite, Not Literal Translation

The first version did bidirectional sync between Japanese and English, matching sentence-for-sentence — basically a literal translation. The meaning was accurate, but the result carried that telltale stiffness of translated prose. So I changed the approach: the English version now starts from the Japanese and gets **rewritten into natural English**. It doesn't preserve a one-to-one mapping of sentences; paragraph breaks and phrasing are adapted to the conventions of English technical writing.

The trade-off is that the English version is treated as a build artifact. Any content fix goes into the Japanese article, and `/translate` regenerates the English — editing the English directly would just get overwritten on the next run. I gave up the flexibility of editing in both directions, but in exchange there are no conflicts to resolve, and the design is far simpler.

### Usage

```bash
/translate               # Localize every article that changed
/translate my-article    # Localize a specific article only
```

You can also run change detection on its own:

```bash
npm run translate                    # All articles (JSON output)
npm run translate -- my-article      # Single article
```

### Why Claude Code Instead of the Claude API?

The first version called the Claude API directly from TypeScript (`sync.ts` + `api.ts`). I switched to a Claude Code skill because:

- **No API key needed** — Claude Code does the localization itself; no `ANTHROPIC_API_KEY` in `.env`
- **Better quality** — it sees the whole article's context and can rewrite it into natural English, with no prompt-length workarounds
- **Interactive debugging** — review and fix the result on the spot, then re-run with `/translate`
- **Parallel execution** — Claude Code's background agents can localize multiple articles at once

## Zenn → dev.to Syntax Conversion

Both platforms use Markdown, but each has its own extensions. The converter rewrites Zenn syntax into dev.to syntax automatically:

| Feature | Zenn | dev.to |
|---------|------|--------|
| Info box | `:::message ... :::` | `> ℹ️ ...` |
| Warning box | `:::message alert ... :::` | `> ⚠️ ...` |
| Accordion | `:::details Title ... :::` | `{% details Title %} ... {% enddetails %}` |
| Block math | `$$ ... $$` | `{% katex %} ... {% endkatex %}` |
| Inline math | `$...$` | `{% katex inline %}...{% endkatex %}` |
| Code filename | `` ```js:app.js `` | `` ```js `` + `// app.js` comment |
| Image width | `![alt](url =500x)` | `<img src="url" alt="alt" width="500">` |
| Footnotes | `[^1]: text` | `**Notes:** 1. text` section |

All conversions are regex-based and run one-way, Zenn → dev.to.

### Frontmatter

Frontmatter differs too, and the dev.to side is generated automatically from the Japanese source:

```yaml
# Zenn (source)
---
title: "記事タイトル"
emoji: "🐙"
type: "tech"
topics: ["topic1", "topic2"]
published: true
---

# dev.to (generated)
---
title: "Article Title"
published: true
tags: topic1, topic2
canonical_url: https://zenn.dev/asherish/articles/slug
---
```

A `canonical_url` pointing to the Zenn article is added automatically to avoid SEO duplicate-content issues. dev.to limits tags to 4, so only the first 4 Zenn topics are carried over.

## Local Preview

Both platforms can be previewed locally:

```bash
npm run preview        # Zenn  → localhost:18000
npm run preview:devto  # dev.to → localhost:13000
```

The Zenn preview uses the official Zenn CLI. The dev.to preview is a lightweight HTTP server that renders `articles_en/` Markdown with `marked`. Ports are offset by 10,000 from the usual 8000/3000 to avoid clashing with Next.js or Express dev servers.

## Publishing with GitHub Actions

**Zenn** has no publish API — it polls your linked GitHub repo and imports `articles/` automatically. Just `git push` and you're done.

**dev.to** has a REST API, so a GitHub Actions workflow handles it. It triggers on pushes to `main` that touch `articles_en/`:

```yaml
on:
  push:
    branches: [main]
    paths: ['articles_en/**']
```

The workflow runs three steps:

1. **Validate** — Checks that `published` status matches between the JP and EN articles. A mismatch (one side `true`, the other `false`) would cause an accidental publish, so the workflow stops.
2. **Publish** — Calls `POST /api/articles` (first time) or `PUT /api/articles/{id}` (updates) on the dev.to API.
3. **Save mapping** — Commits the slug → dev.to article ID mapping to `.devto-mapping.json` so future runs can update the same article.

## Scheduled Publishing

Want to publish on a specific date? Add `scheduled_publish_date` to both articles' frontmatter:

```yaml
published: false
scheduled_publish_date: "2026-03-15"
```

A GitHub Actions cron runs daily at 00:05 JST. When the date arrives, it flips `published` to `true`, publishes the EN version via the dev.to API, and commits. Zenn picks up the change automatically.

```
scheduled-publish.yml (daily cron at 00:05 JST)
  ↓
process-scheduled.ts
  ├─ scheduled date ≤ today → set published: true
  ↓
publish-to-devto.ts
  ├─ publish English version via dev.to API
  ↓
commit & push
  └→ Zenn auto-publish (GitHub integration)
```

Check scheduling status locally with `npm run schedule:check`.

### Why Not Zenn's Built-in Scheduling?

Zenn supports scheduling via `published: true` + `published_at`, but it requires `published: true` upfront. dev.to has no equivalent — `published: true` goes live immediately. Using Zenn's native scheduling would leave the two platforms out of sync, which trips the validation script. Instead, a custom `scheduled_publish_date` field keeps both sides in sync, and the cron publishes them simultaneously.

## Claude Code Skills

The repo ships three Claude Code skill files:

| Skill | Trigger | What it does |
|-------|---------|--------------|
| `translate` | `/translate` command | One-way JP→EN localization |
| `zenn-syntax` | Editing `articles/` | Loads Zenn syntax reference |
| `devto-syntax` | Editing `articles_en/` | Loads dev.to syntax reference |

The syntax skills auto-load when you're editing in the corresponding directory, so Claude Code always knows which platform's Markdown to use. Permissions for script execution and file I/O are pre-approved in `.claude/settings.json` so background agents can localize in parallel without blocking on approval prompts.

## Wrapping Up

My daily workflow now looks like this:

1. Write an article in Japanese in `articles/`
2. Run `/translate` to generate the English version
3. Preview with `npm run preview` / `npm run preview:devto`
4. `git push` — published on both Zenn and dev.to

Since Claude Code handles the localization directly, there's no API key to manage, and I can review and tweak the result on the spot. The English version is treated as an artifact generated from the Japanese, so every content fix goes into the Japanese source. The result: I just write in Japanese and everything else is automated.
