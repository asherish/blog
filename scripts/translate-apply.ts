import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { loadSyncState, saveSyncState, computeHash } from "./sync/state.js";
import { convertZennToDevto, buildDevtoFrontmatter } from "./sync/convert.js";

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

  if (!slug || !translatedTitle) {
    console.error(
      'Usage: npx tsx scripts/translate-apply.ts <slug> --title "English title"'
    );
    process.exit(1);
  }

  const jaPath = path.join(ARTICLES_DIR, `${slug}.md`);
  const enPath = path.join(ARTICLES_EN_DIR, `${slug}.md`);

  fs.mkdirSync(ARTICLES_EN_DIR, { recursive: true });

  // Read the Japanese source for frontmatter (title, tags, published, schedule).
  const jaContent = fs.readFileSync(jaPath, "utf-8");
  const { data: jaFrontmatter } = matter(jaContent);

  // Read the localized body (already written by Claude Code) and strip any
  // frontmatter that may have slipped in.
  const rawLocalized = fs.readFileSync(enPath, "utf-8");
  const { content: localizedBody } = matter(rawLocalized);

  // Apply syntax conversion (Zenn → dev.to).
  const convertedBody = convertZennToDevto(localizedBody);

  // Build dev.to frontmatter from the Japanese source.
  const frontmatter = buildDevtoFrontmatter(jaFrontmatter, slug, translatedTitle);

  const finalContent = frontmatter + "\n\n" + convertedBody.trim() + "\n";
  fs.writeFileSync(enPath, finalContent);

  // Track the source hash so the next run can detect whether a re-localize is needed.
  const state = loadSyncState();
  state[slug] = { jaHash: computeHash(jaContent) };
  saveSyncState(state);

  console.log(`Localized "${slug}": ${enPath}`);
}

main();
