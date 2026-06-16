---
description: dev.to Markdown syntax reference for writing/editing articles in articles_en/ directory. Use when creating or editing dev.to articles.
globs: articles_en/**/*.md
---

# dev.to Markdown Syntax Reference

## Frontmatter

```yaml
---
title: "Article Title"
published: true
tags: ["tag1", "tag2", "tag3", "tag4"]
canonical_url: "https://example.com/original-article"
---
```

- **tags**: Maximum 4 tags allowed.

## dev.to-specific Liquid Tag Syntax

### Collapsible / Details

```markdown
{% details Title %}
Content that can be collapsed/expanded.
{% enddetails %}

{% collapsible Title %}
Alternative collapsible syntax.
{% endcollapsible %}
```

### Math (KaTeX)

Block math:

```markdown
{% katex %}
e^{i\pi} + 1 = 0
{% endkatex %}
```

Inline math:

```markdown
This is {% katex inline %}e^{i\pi} + 1 = 0{% endkatex %} inline math.
```

### Embeds

```markdown
{% embed URL %}
{% youtube VIDEO_ID %}
{% codepen URL %}
{% codesandbox SANDBOX_ID %}
{% stackblitz STACK_ID %}
{% github URL %}
{% link URL %}
```

### Message-style Blockquotes

dev.to does not have dedicated message boxes. Use blockquotes with emoji icons:

```markdown
> ℹ️ This is an informational note.

> ⚠️ This is a warning.
```

### Image with Width

Use HTML `<img>` tag for width control:

```html
<img src="URL" alt="alt text" width="500">
```

## Translation Pipeline

Articles in `articles_en/` are generated one-way from the Japanese Zenn articles via the `/translate` Claude Code skill:

```
/translate               # Localize all changed articles
/translate slug-name     # Localize a specific article
```

Japanese is the single source of truth and English is a generated artifact: make all content fixes in `articles/` and re-run `/translate`. Do not hand-edit `articles_en/`, since the next run regenerates it.
