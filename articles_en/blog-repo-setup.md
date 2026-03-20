---
title: "Building a Dual-Publishing Blog Platform for Zenn and dev.to"
published: true
tags: Zenn, devto, ClaudeCode, GitHubActions
canonical_url: https://zenn.dev/asherish/articles/blog-repo-setup
---

This very article was published to two platforms at once — [Zenn](https://zenn.dev/) (in Japanese) and dev.to (the English version you're reading now) — from a single `git push`. Here's how I built the system that makes it possible.

[Zenn](https://zenn.dev/) is a popular tech blogging platform in Japan, similar to dev.to. I write articles in Japanese on Zenn and want the same content available in English on dev.to. But translating by hand is tedious, and the two platforms have subtly different Markdown dialects. So I automated the entire workflow. The source code is public:

{% github asherish/blog %}

## Goals

- Write in Japanese, get the English version auto-generated (and vice versa)
- Convert Markdown syntax differences between Zenn and dev.to automatically
- Publish to both platforms with a single `git push`
- Preview both platforms locally

## How It Works (The Big Picture)

```
Write an article (Japanese or English)
  ↓
/sync                    ← Claude Code translates + converts syntax + updates state
  ↓
articles/ + articles_en/ are updated
  ↓
Local preview            ← Zenn (localhost:18000) + dev.to (localhost:13000)
  ↓
git push
  ├→ Zenn auto-publish   (GitHub integration)
  └→ GitHub Actions      → Validate → Publish to dev.to via API
```

That's it: write, `/sync`, `git push` — published on two platforms.

## Directory Structure

```
blog/
├── .claude/
│   ├── settings.json               # Auto-allow permissions for sync scripts
│   └── skills/
│       ├── zenn-syntax.md          # Zenn syntax reference
│       ├── devto-syntax.md         # dev.to syntax reference
│       └── sync/SKILL.md           # Bidirectional translation sync skill (/sync)
├── .github/workflows/
│   ├── publish-to-devto.yml        # dev.to auto-publish workflow
│   └── scheduled-publish.yml       # Scheduled publish cron workflow
├── articles/                       # Zenn articles (Japanese)
├── articles_en/                    # dev.to articles (English, translated)
├── books/                          # Zenn books
├── scripts/
│   ├── sync-detect.ts              # Change detection script (JSON output)
│   ├── sync-apply.ts               # Post-translation processing script
│   ├── sync/
│   │   ├── convert.ts              # Zenn ↔ dev.to syntax conversion
│   │   └── state.ts                # Sync state persistence
│   ├── publish-to-devto.ts         # dev.to publishing script
│   ├── process-scheduled.ts        # Scheduled publish processor
│   ├── validate-published.ts       # Pre-publish validation
│   └── preview-devto.ts            # dev.to preview server
├── .sync-state.json                # Per-article hash tracking
├── .devto-mapping.json             # dev.to article ID mapping
├── package.json
└── tsconfig.json
```

## Bidirectional Translation Sync

The heart of this repo is the `/sync` command — a custom [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill that detects changes, translates articles, converts syntax, and updates state in one shot.

### Change Detection

Every article is SHA-256 hashed and tracked in `.sync-state.json`. When you run `/sync`, the script compares current hashes against stored ones to figure out what changed:

| State | Action |
|-------|--------|
| Only Japanese exists | Full translation JP → EN |
| Only English exists | Full translation EN → JP |
| Japanese was modified | Diff sync JP → EN |
| English was modified | Diff sync EN → JP |
| Both were modified | Conflict → resolve with `--prefer ja` or `--prefer en` |
| No changes | Skip |

### The Three-Step Pipeline

**Step 1 — Detect** (`sync-detect.ts`): Compares hashes and outputs which articles need translation (and in which direction) as JSON.

**Step 2 — Translate** (Claude Code): Reads the source article and writes the translated body to the target file. Code blocks, inline code, URLs, and command names are preserved as-is. Platform-specific syntax (`:::message`, `$$`, etc.) is also left untouched — syntax conversion happens in the next step.

**Step 3 — Post-process** (`sync-apply.ts`): Converts Zenn ↔ dev.to syntax via regex, generates the target-side frontmatter, and updates `.sync-state.json`.

Separating translation from syntax conversion keeps the translation prompt clean and lets regex handle the mechanical conversions reliably.

### Usage

```bash
/sync                    # Sync all articles
/sync my-article         # Sync a specific article only
/sync --prefer ja        # Resolve conflicts — Japanese wins
/sync --prefer en        # Resolve conflicts — English wins
```

You can also run change detection alone:

```bash
npm run sync                    # All articles (JSON output)
npm run sync -- my-article      # Single article
```

### Why Claude Code Instead of the Claude API?

The first version called the Claude API directly from TypeScript (`sync.ts` + `api.ts`). I switched to a Claude Code skill because:

- **No API key needed** — Claude Code handles the translation itself; no `ANTHROPIC_API_KEY` in `.env`
- **Better quality** — full article context in every translation, no prompt-length workarounds
- **Interactive debugging** — review and fix translations on the spot, re-run with `/sync`
- **Parallel execution** — Claude Code's background agents can translate multiple articles at once

## Zenn ↔ dev.to Syntax Conversion

Both platforms use Markdown, but each has its own extensions. The converter handles these automatically — here's what it translates:

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

All conversions are regex-based and work in both directions.

### Frontmatter

Frontmatter differs too:

```yaml
# Zenn
---
title: "記事タイトル"
emoji: "🐙"
type: "tech"
topics: ["topic1", "topic2"]
published: true
---

# dev.to
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

The Zenn preview uses the official Zenn CLI. The dev.to preview is a lightweight HTTP server that renders `articles_en/` Markdown with `marked` in a dev.to-like layout. Ports are offset by 10,000 from the usual 8000/3000 to avoid clashing with Next.js or Express dev servers.

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
| `sync` | `/sync` command | Bidirectional translation sync |
| `zenn-syntax` | Editing `articles/` | Loads Zenn syntax reference |
| `devto-syntax` | Editing `articles_en/` | Loads dev.to syntax reference |

The syntax skills auto-load when you're editing in the corresponding directory, so Claude Code always knows which platform's Markdown to use. Permissions for script execution and file I/O are pre-approved in `.claude/settings.json` so background agents can translate in parallel without blocking on approval prompts.

## Wrapping Up

My daily workflow now looks like this:

1. Write an article in Japanese in `articles/`
2. Run `/sync` to generate the English version
3. Preview with `npm run preview` / `npm run preview:devto`
4. `git push` — published on both Zenn and dev.to

Since Claude Code handles the translation directly, there's no API key to manage, and I can review and tweak translations on the spot. The diff sync mechanism means manual edits to translations survive the next sync. The result: I just write in Japanese and everything else is automated.
