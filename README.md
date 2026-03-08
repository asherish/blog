# blog

Zenn (Japanese) + dev.to (English) dual-publishing blog platform.

Write articles in Japanese on Zenn, auto-translate to English with Claude API, and publish to dev.to via GitHub Actions.

## Architecture

```
Write article (JP)
  ↓
npm run translate        ← Claude API translates JP → EN locally
  ↓
articles_en/ saved
  ↓
Preview both             ← Zenn (JP) localhost:18000 + dev.to (EN) localhost:13000
  ↓
git push
  ├→ Zenn auto-publish   (GitHub integration)
  └→ GitHub Actions      → dev.to API publishes EN version
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

Edit the generated file in `articles/` in Japanese. Set `published: true` in the frontmatter when ready.

### 3. Translate to English

```bash
npm run translate
```

Translates articles in `articles/` → `articles_en/` using Claude API. Only changed and published articles are translated (tracked via SHA-256 hash).

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

- Zenn publishes automatically via GitHub integration
- GitHub Actions publishes the English version to dev.to

## Directory Structure

```
blog/
├── .claude/skills/
│   ├── zenn-syntax.md          # Zenn Markdown syntax skill
│   └── devto-syntax.md         # dev.to Markdown syntax skill
├── .github/workflows/
│   └── publish-to-devto.yml   # Publish to dev.to on push
├── articles/                   # Zenn articles (Japanese)
├── articles_en/                # Translated articles (English, for dev.to)
├── books/                      # Zenn books
├── scripts/
│   ├── translate.ts            # Claude API translation script
│   ├── publish-to-devto.ts     # dev.to publishing script
│   └── preview-devto.ts        # dev.to preview server
├── .devto-mapping.json         # dev.to article ID & hash tracking
├── package.json
└── tsconfig.json
```

## npm Scripts

| Script | Description |
|---|---|
| `npm run new:article` | Create a new Zenn article scaffold |
| `npm run preview` | Start Zenn preview server (localhost:18000) |
| `npm run preview:devto` | Start dev.to preview server (localhost:13000) |
| `npm run translate` | Translate changed articles JP → EN |
| `npm run publish:devto` | Manually publish to dev.to |

## Claude Code Skills

This project includes custom Claude Code skills for platform-specific Markdown syntax:

| Skill | Trigger | Description |
|---|---|---|
| `zenn-syntax` | Editing `articles/**/*.md` | Zenn Markdown syntax reference (message boxes, accordions, embeds, etc.) |
| `devto-syntax` | Editing `articles_en/**/*.md` | dev.to Liquid tag syntax reference (details, katex, embeds, etc.) |

Skills are automatically activated when working with files in the corresponding directories.

## Notes

- Articles with `published: false` are skipped during translation and publishing
- Translation uses SHA-256 hashing for change detection — unchanged articles are not re-translated
- `canonical_url` is automatically set to the Zenn article URL
- dev.to tags are limited to 4 (dev.to platform restriction)
- Images should use absolute URLs for cross-platform compatibility
