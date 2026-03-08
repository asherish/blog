---
description: Zenn Markdown syntax reference for writing/editing articles in articles/ directory. Use when creating or editing Zenn articles.
globs: articles/**/*.md
---

# Zenn Markdown Syntax Reference

## Frontmatter

```yaml
---
title: "Article Title"
emoji: "🐙"
type: "tech" # tech or idea
topics: ["topic1", "topic2", "topic3"]
published: true
---
```

## Zenn-specific Markdown Extensions

### Message Boxes

```markdown
:::message
This is an info message box.
:::

:::message alert
This is a warning/alert message box.
:::
```

### Accordion (Collapsible)

```markdown
:::details Title
Content that can be collapsed/expanded.
:::
```

### Math (KaTeX)

Block math:

```markdown
$$
e^{i\pi} + 1 = 0
$$
```

Inline math:

```markdown
This is $e^{i\pi} + 1 = 0$ inline math.
```

### Code Blocks with Filename

````markdown
```js:filename.js
const x = 1;
```
````

### Diff with Syntax Highlighting

````markdown
```diff js
- const old = "before";
+ const updated = "after";
```
````

### Image with Width

```markdown
![alt text](url =250x)
![alt text](url =500x)
```

Width is specified after `=`, height is omitted (auto).

### Footnotes

```markdown
This has a footnote[^1].

[^1]: Footnote content here.
```

### Embeds

```markdown
@[youtube](VIDEO_ID)
@[slideshare](SLIDE_KEY)
@[speakerdeck](SLIDE_ID)
@[jsfiddle](URL)
@[codepen](URL)
@[codesandbox](EMBED_URL)
@[stackblitz](EMBED_URL)
```

## Zenn CLI Commands

```bash
npx zenn new:article          # Create new article
npx zenn new:article --slug my-article  # Create with specific slug
npx zenn preview              # Start local preview server

# Shortcuts via package.json scripts:
npm run new:article
npm run preview
```
