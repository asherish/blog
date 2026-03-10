import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import {
  loadSyncState,
  saveSyncState,
  computeHash,
} from "./sync/state.js";
import {
  convertZennToDevto,
  convertDevtoToZenn,
  buildDevtoFrontmatter,
  buildZennFrontmatter,
} from "./sync/convert.js";

const ARTICLES_DIR = path.resolve(import.meta.dirname, "../articles");
const ARTICLES_EN_DIR = path.resolve(import.meta.dirname, "../articles_en");

function main() {
  const args = process.argv.slice(2);

  const titleIdx = args.indexOf("--title");
  const translatedTitle = titleIdx !== -1 ? args[titleIdx + 1] : undefined;
  const positional = args.filter(
    (a, i) => !a.startsWith("--") && args[i - 1] !== "--title"
  );
  const slug = positional[0];
  const direction = positional[1] as "ja-to-en" | "en-to-ja" | undefined;

  if (!slug || !direction || !translatedTitle) {
    console.error(
      "Usage: npx tsx scripts/sync-apply.ts <slug> <direction> --title \"translated title\""
    );
    process.exit(1);
  }
  if (direction !== "ja-to-en" && direction !== "en-to-ja") {
    console.error('direction must be "ja-to-en" or "en-to-ja"');
    process.exit(1);
  }

  const jaPath = path.join(ARTICLES_DIR, `${slug}.md`);
  const enPath = path.join(ARTICLES_EN_DIR, `${slug}.md`);

  // Ensure output directories exist before writing
  fs.mkdirSync(ARTICLES_DIR, { recursive: true });
  fs.mkdirSync(ARTICLES_EN_DIR, { recursive: true });

  if (direction === "ja-to-en") {
    // Read source (JP) for frontmatter
    const jaContent = fs.readFileSync(jaPath, "utf-8");
    const { data: jaFrontmatter } = matter(jaContent);

    // Read translated body (already written by Claude Code)
    const rawTranslated = fs.readFileSync(enPath, "utf-8");

    // Strip any frontmatter from the translated content
    const { content: translatedBody } = matter(rawTranslated);

    // Apply syntax conversion (Zenn → dev.to)
    const convertedBody = convertZennToDevto(translatedBody);

    // Build dev.to frontmatter from JP source
    const frontmatter = buildDevtoFrontmatter(
      jaFrontmatter,
      slug,
      translatedTitle
    );

    // Write final file
    const finalContent = frontmatter + "\n\n" + convertedBody.trim() + "\n";
    fs.writeFileSync(enPath, finalContent);

    // Update sync state
    const state = loadSyncState();
    state[slug] = {
      jaHash: computeHash(jaContent),
      enHash: computeHash(finalContent),
    };
    saveSyncState(state);

    console.log(`Applied ja-to-en for "${slug}": ${enPath}`);
  } else {
    // en-to-ja
    // Read source (EN) for frontmatter
    const enContent = fs.readFileSync(enPath, "utf-8");
    const { data: enFrontmatter } = matter(enContent);

    // Read translated body (already written by Claude Code)
    const rawTranslated = fs.readFileSync(jaPath, "utf-8");

    // Strip any frontmatter from the translated content
    const { content: translatedBody } = matter(rawTranslated);

    // Apply syntax conversion (dev.to → Zenn)
    const convertedBody = convertDevtoToZenn(translatedBody);

    // Build Zenn frontmatter from EN source
    const frontmatter = buildZennFrontmatter(enFrontmatter, translatedTitle);

    // Write final file
    const finalContent = frontmatter + "\n\n" + convertedBody.trim() + "\n";
    fs.writeFileSync(jaPath, finalContent);

    // Update sync state
    const state = loadSyncState();
    state[slug] = {
      jaHash: computeHash(finalContent),
      enHash: computeHash(enContent),
    };
    saveSyncState(state);

    console.log(`Applied en-to-ja for "${slug}": ${jaPath}`);
  }
}

main();
