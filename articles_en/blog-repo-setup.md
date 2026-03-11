---
title: "Building a Dual-Publishing Blog Platform for Zenn and dev.to"
published: false
tags: Zenn, devto, ClaudeCode, GitHubActions
canonical_url: https://zenn.dev/asherish/articles/blog-repo-setup
---

This article is about the very infrastructure behind the blog you are reading right now.

I wanted to write articles in Japanese on Zenn while also publishing the same content translated into English on dev.to. Translating manually is tedious, and each platform has slightly different Markdown dialects. So I built a blog repository that automates all of this, and here I'll introduce how it works. The source code is available in the following repository.

https://github.com/asherish/blog

## What I Wanted to Achieve

- Write an article in Japanese and have the English version auto-generated (and vice versa)
- Automatically convert Markdown syntax differences between Zenn and dev.to
- Publish to both platforms just by running `git push`
- Preview both platforms locally

## Overall Architecture

```
Write an article (Japanese or English)
  ↓
/sync                    ← Claude Code handles translation, syntax conversion, and state updates
  ↓
articles/ + articles_en/ are updated
  ↓
Local preview            ← Zenn (localhost:18000) + dev.to (localhost:13000)
  ↓
git push
  ├→ Zenn auto-publish   (GitHub integration)
  └→ GitHub Actions      → Validation → Publish English version via dev.to API
```

Write an article, run `/sync`, run `git push`, and you're published on two platforms.

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

The core feature of this repository is the bidirectional translation sync triggered by the `/sync` command. It is implemented as a custom Claude Code skill that performs change detection, translation, syntax conversion, and state updates in a single command.

### How Change Detection Works

Each article's content is hashed with SHA-256 and stored in `.sync-state.json`. When `/sync` is executed, `sync-detect.ts` first compares the current hash with the stored hash to determine which side has changed.

| State | Action |
|-------|--------|
| Only Japanese exists | Full translation JP → EN |
| Only English exists | Full translation EN → JP |
| Japanese was modified | Diff sync JP → EN |
| English was modified | Diff sync EN → JP |
| Both were modified | Conflict → resolve with `--prefer ja` or `--prefer en` |
| No changes | Skip |

### Translation Pipeline

Translation is performed in three steps.

**Step 1: Change Detection** (`sync-detect.ts`)

Compares file hashes and outputs the articles that need translation along with their direction as JSON.

**Step 2: Translation** (Claude Code itself)

Claude Code reads the source article and translates the body content into the target file. Translation rules dictate that code blocks, inline code, URLs, and command names are preserved as-is, and platform-specific Markdown syntax (`:::message`, `$$`, etc.) is left unconverted. This is because syntax conversion is handled in the next step.

**Step 3: Post-processing** (`sync-apply.ts`)

Performs the following operations on the translated body:

1. Zenn ↔ dev.to syntax conversion (described below)
2. Target-side frontmatter generation
3. `.sync-state.json` update

By separating translation and syntax conversion into different steps, the translation prompt stays simple, and syntax conversion logic can be handled reliably with regular expressions.

### Usage

```
/sync                    # Sync all articles
/sync my-article         # Sync a specific article only
/sync --prefer ja        # Resolve conflicts with Japanese as source
/sync --prefer en        # Resolve conflicts with English as source
```

If you only want to run the change detection, you can execute the npm script directly.

```bash
npm run sync                    # Change detection for all articles (JSON output)
npm run sync -- my-article      # Change detection for a specific article
```

### Evolution from Initial Design: Claude API to Claude Code

The initial design used TypeScript scripts (`sync.ts` + `api.ts`) that called the Claude API directly for translation. However, I migrated to a Claude Code skill for the following reasons:

- **No API key management**: Since Claude Code itself handles the translation, there's no need to configure `ANTHROPIC_API_KEY` in `.env`
- **Improved translation quality**: Claude Code can translate with full context of the entire article. With the API approach, prompt length constraints and token cost optimization had to be considered
- **Easier debugging**: Translation results can be reviewed and corrected on the spot, and re-running is just a `/sync` away
- **Parallel execution**: Using Claude Code's background agents, multiple articles can be translated in parallel

With this migration, `sync.ts` and `api.ts` were removed and restructured into a change detection script (`sync-detect.ts`) and a post-processing script (`sync-apply.ts`).

## Zenn ↔ dev.to Syntax Conversion

Zenn and dev.to are both Markdown-based, but their custom extension syntax differs. Here are the key conversions.

### Message Boxes

```markdown
<!-- Zenn -->
> ℹ️ Info message

<!-- dev.to -->
> ℹ️ Info message
```

### Accordions

```markdown
<!-- Zenn -->
{% details Title %}
Collapsible content
{% enddetails %}

<!-- dev.to -->
{% details Title %}
Collapsible content
{% enddetails %}
```

### Math Equations

```markdown
<!-- Zenn: Block math -->
{% katex %}
e^{i\pi} + 1 = 0
{% endkatex %}

<!-- dev.to: Block math -->
{% katex %}
e^{i\pi} + 1 = 0
{% endkatex %}
```

```markdown
<!-- Zenn: Inline math -->
{% katex inline %}e^{i\pi} + 1 = 0{% endkatex %}

<!-- dev.to: Inline math -->
{% katex inline %}e^{i\pi} + 1 = 0{% endkatex %}
```

### Code Block Filenames

````markdown
<!-- Zenn -->
```js
// filename.js
const x = 1;
```

<!-- dev.to -->
```js
// filename.js
const x = 1;
```
````

### Image Width

```markdown
<!-- Zenn -->
<img src="url" alt="alt" width="500">

<!-- dev.to -->
<img src="url" alt="alt" width="500">
```

### Footnotes

```markdown
<!-- Zenn -->
Body text[^1].


<!-- dev.to -->
Body text[^1].
---
**Notes:**
1. Footnote content
```

These conversions are implemented with regular expressions and support both directions (Zenn → dev.to and dev.to → Zenn).

### Frontmatter Conversion

Frontmatter also differs between platforms.

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

The `canonical_url` is automatically added to the dev.to side, pointing to the Zenn article as the canonical URL. This avoids duplicate content issues for SEO. Also, since dev.to has a limit of 4 tags maximum, only the first 4 topics from Zenn are used.

## Preview

### Zenn Preview

Uses Zenn CLI's built-in preview server.

```bash
npm run preview  # localhost:18000
```

### dev.to Preview

To preview dev.to articles, I implemented a simple HTTP server. It renders Markdown files in `articles_en/` using the `marked` library and displays them with a dev.to-like appearance.

```bash
npm run preview:devto  # localhost:13000
```

The port numbers are 18000 / 13000, which are the conventional 8000 / 3000 plus 10000. This prevents port conflicts with development servers like Next.js or Express.

## Automated Publishing with GitHub Actions

Zenn does not have an API for publishing articles. Zenn's publishing mechanism is a pull-based system where Zenn polls the linked GitHub repository and directly imports content from `articles/`. Therefore, no Zenn publishing logic is included in this repository. Just `git push` and Zenn picks it up automatically.

On the other hand, dev.to exposes a REST API (`POST /api/articles`, `PUT /api/articles/{id}`), so GitHub Actions can proactively create and update articles. When files under `articles_en/` are pushed to the `main` branch, GitHub Actions triggers.

```yaml
on:
  push:
    branches: [main]
    paths: ['articles_en/**']
```

The workflow consists of the following steps:

1. **Validation**: Checks that the `published` status matches between the Japanese and English articles. If only one side has `published: true`, it could cause an accidental publication, so the workflow stops upon detecting this inconsistency
2. **Publish via dev.to API**: Publishes the English article via the dev.to API. First time uses `POST /articles` for creation, subsequent times use `PUT /articles/{id}` for updates
3. **Update mapping**: Saves the mapping between article slugs and dev.to article IDs in `.devto-mapping.json` and commits it. This allows updating the same article in future runs

## Scheduled Publishing

A mechanism for automatically publishing articles on a specific date is also provided. Add `scheduled_publish_date` to the frontmatter of both articles.

```yaml
published: false
scheduled_publish_date: "2026-03-15"
```

A GitHub Actions cron job runs daily at 00:05 JST, and when an article's scheduled date has passed, it automatically rewrites `published: false` to `published: true`, publishes the English version via the dev.to API, commits, and pushes. Zenn picks up the change automatically via GitHub integration.

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

To check the scheduling status locally:

```bash
npm run schedule:check
```

### Why Not Use Zenn's Native Scheduled Publishing?

Zenn has a native scheduled publishing feature that combines `published: true` with `published_at`. However, this mechanism requires setting `published: true` on the Zenn side first. Meanwhile, dev.to has no equivalent feature — setting `published: true` immediately publishes the article.

This means that using Zenn's native scheduling would create an inconsistent state where the Zenn article has `published: true` while the dev.to article has `published: false`, causing the validation script (`validate-published.ts`) to throw an error. To maintain the design principle of always keeping the `published` status consistent across both platforms, we adopted a unified approach using a custom `scheduled_publish_date` field, with a cron job that publishes both sides simultaneously.

## Claude Code Skills

This repository includes skill files for Claude Code.

| Skill | Trigger | Description |
|-------|---------|-------------|
| `sync` | `/sync` command | Bidirectional translation sync (change detection, translation, syntax conversion, state updates) |
| `zenn-syntax` | When editing files under `articles/` | Zenn Markdown syntax reference |
| `devto-syntax` | When editing files under `articles_en/` | dev.to Liquid tag syntax reference |

`zenn-syntax` and `devto-syntax` are automatically loaded when editing files in their corresponding directories. This allows using platform-specific syntax correctly when writing articles with Claude Code.

Additionally, `.claude/settings.json` auto-allows permissions for sync script execution and article file read/write operations. This ensures that background agents don't get blocked by permission approval prompts when translating multiple articles in parallel.

## Summary

By building this repository, the following workflow was achieved:

1. Write an article in Japanese in `articles/`
2. Generate the English version with `/sync`
3. Preview with `npm run preview` / `npm run preview:devto`
4. Publish to both Zenn and dev.to with `git push`

By implementing translation as a Claude Code skill, API key management became unnecessary, and translation results can be reviewed and corrected on the spot. Thanks to the diff sync mechanism, manual adjustments to translations won't be overwritten in the next sync. Overall, I can now focus on what matters most — writing articles in Japanese.

---
**Notes:**
1. Footnote content
