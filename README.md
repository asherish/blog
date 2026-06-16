# blog

Zenn (Japanese) + dev.to (English) dual-publishing blog platform.

Write articles in Japanese, generate native-quality English versions one-way with the Claude Code `/translate` skill, and publish to both platforms.

## Architecture

```
Write/edit article (Japanese)
  ↓
/translate               ← Claude Code rewrites JP → native English (dev.to)
  ↓
articles_en/ regenerated
  ↓
Preview both             ← Zenn (JP) localhost:18000 + dev.to (EN) localhost:13000
  ↓
git push
  ├→ Zenn auto-publish   (GitHub integration)
  └→ GitHub Actions      → validate → dev.to API publishes EN version
```

## Setup

### Prerequisites

- Node.js 20+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (for translation sync)
- [dev.to API key](https://dev.to/settings/extensions)

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```
DEV_TO_API_KEY=...
```

### GitHub Secrets

Add `DEV_TO_API_KEY` to your repository's GitHub Secrets for the GitHub Actions workflow.

### Zenn Integration

Link this repository (`asherish/blog`, `main` branch) at [Zenn deploy settings](https://zenn.dev/dashboard/deploys).

## Usage

### 1. Create a new article

```bash
npm run new:article
```

### 2. Write the article

Edit the generated file in `articles/` (Japanese). Japanese is the single source of truth — the English version is generated from it. Set `published: true` in the frontmatter when ready.

### 3. Localize to English

Use the Claude Code `/translate` skill:

```
/translate               # Localize all changed articles
/translate my-article    # Localize a specific slug
```

`/translate` reads the Japanese source (and the existing English, if any), then rewrites the article as native-quality English — not a literal translation. It detects what needs work via SHA-256 hashing of the Japanese source:

| Scenario | Action |
|---|---|
| No English exists | Full rewrite JP → EN |
| Japanese changed | Revise the existing English, or full rewrite if changes are large |
| Japanese unchanged | Skip |
| English with no Japanese source | Reported as an orphan (never touched) |

The English article is a generated artifact: make all content fixes in `articles/` and re-run `/translate`. Do not hand-edit `articles_en/`.

You can also run detection only (without localizing) via:

```bash
npm run translate                    # Detect changes (JSON output)
npm run translate -- my-article      # Detect for a specific slug
```

### 4. Preview

```bash
npm run preview          # Zenn preview at localhost:18000
npm run preview:devto    # dev.to preview at localhost:13000
```

Port 18000 and 13000 are used instead of the conventional 8000 / 3000 to avoid conflicts with other dev servers (Next.js, Express, Django, etc.). The rule is simple: original port + 10000.

### 5. Publish

```bash
git add -A && git commit -m "Add new article" && git push
```

- Zenn publishes automatically via GitHub integration (Zenn does not provide a publishing API — it polls the linked repository and picks up articles directly)
- GitHub Actions validates published status, then publishes the English version to dev.to via the dev.to REST API

### 6. Scheduled publishing

Add `scheduled_publish_date` to frontmatter of both JP and EN articles:

```yaml
published: false
scheduled_publish_date: "2026-03-15"
```

A GitHub Actions cron job runs daily at 00:05 JST. When the current date reaches the scheduled date, it sets `published: true` in both articles, removes `scheduled_publish_date`, publishes the English version to dev.to, commits, and pushes. Zenn picks up the change automatically via GitHub integration.

To check scheduled status locally:

```bash
npm run schedule:check
```

**Design note:** Zenn natively supports scheduled publishing via `published: true` + `published_at`, but this requires setting `published: true` in the Zenn article upfront. Since dev.to has no equivalent — setting `published: true` would publish immediately — using Zenn's native scheduling would break the JP/EN `published` status consistency that our validation enforces. Instead, we use a unified `scheduled_publish_date` field (kept `false` on both sides until the cron flips them simultaneously).

## Directory Structure

```
blog/
├── .claude/
│   ├── settings.json               # Permission auto-allow for translate scripts
│   └── skills/
│       ├── zenn-syntax.md          # Zenn Markdown syntax skill
│       ├── devto-syntax.md         # dev.to Markdown syntax skill
│       └── translate/SKILL.md      # One-way JP→EN localization skill (/translate)
├── .github/workflows/
│   ├── publish-to-devto.yml      # Validate + publish to dev.to on push
│   └── scheduled-publish.yml     # Daily cron to publish scheduled articles
├── articles/                     # Zenn articles (Japanese)
├── articles_en/                  # Translated articles (English, for dev.to)
├── books/                        # Zenn books
├── scripts/
│   ├── translate-detect.ts       # Change detection script (JSON output)
│   ├── translate-apply.ts        # Post-localization processing script
│   ├── sync/
│   │   ├── convert.ts            # Zenn → dev.to syntax conversion
│   │   └── state.ts              # Localization state & mapping persistence
│   ├── publish-to-devto.ts       # dev.to publishing script
│   ├── process-scheduled.ts      # Scheduled publish processor
│   ├── validate-published.ts     # Pre-publish validation
│   └── preview-devto.ts          # dev.to preview server
├── .sync-state.json              # Per-article Japanese-source hash tracking
├── .devto-mapping.json           # dev.to article ID tracking
├── package.json
└── tsconfig.json
```

## npm Scripts

| Script | Description |
|---|---|
| `npm run new:article` | Create a new Zenn article scaffold |
| `npm run preview` | Start Zenn preview server (localhost:18000) |
| `npm run preview:devto` | Start dev.to preview server (localhost:13000) |
| `npm run translate` | Detect localization changes (JSON output) |
| `npm run translate:apply` | Apply post-localization processing |
| `npm run schedule:check` | Check and process scheduled articles |
| `npm run validate` | Validate published status consistency |
| `npm run publish:devto` | Manually publish to dev.to |

## Claude Code Skills

This project includes custom Claude Code skills for platform-specific Markdown syntax and localization:

| Skill | Trigger | Description |
|---|---|---|
| `translate` | `/translate` command | One-way JP→EN native localization |
| `zenn-syntax` | Editing `articles/**/*.md` | Zenn Markdown syntax reference (message boxes, accordions, embeds, etc.) |
| `devto-syntax` | Editing `articles_en/**/*.md` | dev.to Liquid tag syntax reference (details, katex, embeds, etc.) |

Skills are automatically activated when working with files in the corresponding directories. The `translate` skill is invoked manually via `/translate`.

## Notes

- Scheduled publishing uses `scheduled_publish_date` in frontmatter — a daily cron job auto-publishes when the date arrives
- Articles with `published: false` are skipped during publishing (localization works regardless of published status)
- Localization uses SHA-256 hashing of the Japanese source for change detection — unchanged articles are not re-localized
- The English article is a generated artifact; make all content fixes in the Japanese source and re-run `/translate`
- `canonical_url` is automatically set to the Zenn article URL
- dev.to tags are limited to 4 (dev.to platform restriction)
- Images should use absolute URLs for cross-platform compatibility
