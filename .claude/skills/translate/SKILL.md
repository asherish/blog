---
description: One-way JP→EN localization. Reads the Japanese (Zenn) article and rewrites it as a natural, native-quality English (dev.to) article. Japanese is the source of truth; the English article is a generated artifact.
user-invocable: true
argument-hint: "[slug]"
---

# /translate — JP→EN Native Localization

Generate the English (`articles_en/`, dev.to) version from the Japanese (`articles/`, Zenn) source.

This is **one-way only**: Japanese is the single source of truth, and the English article is a regenerated artifact. Never edit the Japanese based on the English — make all content fixes in the Japanese article and re-run this command.

## Workflow

### Step 1: Detect what needs localizing

Run the detection script, passing through any argument the user provided:

```bash
npx tsx scripts/translate-detect.ts $ARGUMENTS
```

Parse the JSON plan:

- `actions` — each has a `slug` and a `reason`:
  - `new`: no English article exists yet.
  - `update`: an English article exists but the Japanese source changed.
- `skipped` — up to date; nothing to do.
- `orphans` — English files with no Japanese source. Report them as a warning and do **not** touch them (we never write back to Japanese).

If there are no `actions`, report "Everything is up to date." and stop.

### Step 2: Localize each article

For each action:

1. **Read the Japanese source** (`articles/<slug>.md`) with the Read tool.
2. **If `reason` is `update`, also read the existing English** (`articles_en/<slug>.md`).
3. **Decide the editing strategy before writing:**
   - **Revise** the existing English when it is still largely valid and the Japanese changes are localized — keep the good prose and adjust only what changed. Prefer this to keep the diff small and the quality stable.
   - **Full rewrite** when there is no English yet (`new`), or when the Japanese changed enough that revising would leave an awkward patchwork.
4. **Write the English body** to `articles_en/<slug>.md` with the Write tool — body only, **no frontmatter**.
5. **Run post-processing:**
   ```bash
   npx tsx scripts/translate-apply.ts <slug> --title "<English title>"
   ```
   `<English title>` is the natural English rendering of the Japanese title.

### Step 3: Report results

Summarize: number of articles localized, each slug with its strategy (revised / full rewrite), and any orphans skipped.

## Localization Rules

You are **not** a literal translator. You are rewriting the article so it reads as if a native English-speaking engineer wrote it for dev.to.

### Rewrite freely for natural English

- Do NOT translate sentence-by-sentence. Restructure sentences, merge or split paragraphs, and choose idiomatic phrasing the way a native technical writer would.
- Follow the conventions of English technical blogging: directness, active voice, natural connectives.
- Keep the same tone and technical level as the Japanese.

### Never change the facts (hard constraints)

- Preserve every technical fact, claim, number, version, command, and step exactly. Add nothing, drop nothing.
- Code blocks and inline code — keep content exactly as-is.
- URLs, file paths, command names, CLI arguments, emoji — keep as-is.
- Platform-specific syntax (Zenn `:::` blocks, `$$` math) — leave as-is; the post-processing script converts it to dev.to syntax.
- Image references and HTML tags — keep as-is.

### Output format

- Output ONLY the rewritten markdown body — no frontmatter (the script generates it).
- Preserve heading structure and overall document flow.
