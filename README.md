# blog

Zenn (Japanese) + dev.to (English) dual-publishing blog platform.

Write articles in either language, bidirectionally sync translations with Claude API, and publish to both platforms.

## Architecture

```
Write/edit article (JP or EN)
  ↓
npm run sync             ← Claude API syncs translations bidirectionally
  ↓
articles/ + articles_en/ updated
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
- [Anthropic API key](https://console.anthropic.com/)
- [dev.to API key](https://dev.to/settings/extensions)

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
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

Edit the generated file in `articles/` (Japanese) or `articles_en/` (English). Set `published: true` in the frontmatter when ready.

### 3. Sync translations

```bash
npm run sync                    # Sync all articles
npm run sync -- my-article      # Sync a specific slug
npm run sync -- --dry-run       # Preview what would be synced
npm run sync -- --prefer ja     # Resolve conflicts using JP as source
```

The sync script detects which side changed and translates accordingly:

| Scenario | Action |
|---|---|
| JP only exists | Full translate JP → EN |
| EN only exists | Full translate EN → JP |
| JP changed | Diff sync JP → EN |
| EN changed | Diff sync EN → JP |
| Both changed | Conflict — use `--prefer ja` or `--prefer en` to resolve |
| Neither changed | Skip |

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

## Directory Structure

```
blog/
├── .claude/skills/
│   ├── zenn-syntax.md            # Zenn Markdown syntax skill
│   └── devto-syntax.md           # dev.to Markdown syntax skill
├── .github/workflows/
│   └── publish-to-devto.yml      # Validate + publish to dev.to on push
├── articles/                     # Zenn articles (Japanese)
├── articles_en/                  # Translated articles (English, for dev.to)
├── books/                        # Zenn books
├── scripts/
│   ├── sync.ts                   # Bidirectional sync script
│   ├── sync/
│   │   ├── api.ts                # Claude API translation functions
│   │   ├── convert.ts            # Zenn ↔ dev.to syntax conversion
│   │   └── state.ts              # Sync state & mapping persistence
│   ├── publish-to-devto.ts       # dev.to publishing script
│   ├── validate-published.ts     # Pre-publish validation
│   └── preview-devto.ts          # dev.to preview server
├── .sync-state.json              # Per-article hash tracking for sync
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
| `npm run sync` | Bidirectionally sync translations between JP ↔ EN |
| `npm run validate` | Validate published status consistency |
| `npm run publish:devto` | Manually publish to dev.to |

## Claude Code Skills

This project includes custom Claude Code skills for platform-specific Markdown syntax:

| Skill | Trigger | Description |
|---|---|---|
| `zenn-syntax` | Editing `articles/**/*.md` | Zenn Markdown syntax reference (message boxes, accordions, embeds, etc.) |
| `devto-syntax` | Editing `articles_en/**/*.md` | dev.to Liquid tag syntax reference (details, katex, embeds, etc.) |

Skills are automatically activated when working with files in the corresponding directories.

## Notes

- Articles with `published: false` are skipped during publishing (sync works regardless of published status)
- Sync uses SHA-256 hashing for change detection — unchanged articles are not re-translated
- Diff sync only updates changed sections, preserving manual edits in the target language
- `canonical_url` is automatically set to the Zenn article URL
- dev.to tags are limited to 4 (dev.to platform restriction)
- Images should use absolute URLs for cross-platform compatibility
