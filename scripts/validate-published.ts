import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const ARTICLES_DIR = path.resolve(import.meta.dirname, "../articles");
const ARTICLES_EN_DIR = path.resolve(import.meta.dirname, "../articles_en");

function main(): void {
  const jaSlugs = new Map<string, boolean>();
  const enSlugs = new Map<string, boolean>();

  if (fs.existsSync(ARTICLES_DIR)) {
    for (const f of fs.readdirSync(ARTICLES_DIR)) {
      if (!f.endsWith(".md")) continue;
      const slug = path.basename(f, ".md");
      const { data } = matter(fs.readFileSync(path.join(ARTICLES_DIR, f), "utf-8"));
      jaSlugs.set(slug, data.published === true);
    }
  }

  if (fs.existsSync(ARTICLES_EN_DIR)) {
    for (const f of fs.readdirSync(ARTICLES_EN_DIR)) {
      if (!f.endsWith(".md")) continue;
      const slug = path.basename(f, ".md");
      const { data } = matter(fs.readFileSync(path.join(ARTICLES_EN_DIR, f), "utf-8"));
      enSlugs.set(slug, data.published === true);
    }
  }

  let hasError = false;

  for (const [slug, jaPublished] of jaSlugs) {
    if (!enSlugs.has(slug)) continue;
    const enPublished = enSlugs.get(slug)!;

    if (jaPublished !== enPublished) {
      console.error(
        `❌ ${slug}: published mismatch — JP=${jaPublished}, EN=${enPublished}`
      );
      hasError = true;
    }
  }

  if (hasError) {
    console.error("\nValidation failed: published status must match between JP and EN.");
    process.exit(1);
  }

  console.log("✅ All published statuses are consistent.");
}

main();
