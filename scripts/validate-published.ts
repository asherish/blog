import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const ARTICLES_DIR = path.resolve(import.meta.dirname, "../articles");
const ARTICLES_EN_DIR = path.resolve(import.meta.dirname, "../articles_en");

function main(): void {
  interface ArticleMeta {
    published: boolean;
    scheduledDate: string | null;
  }

  const jaSlugs = new Map<string, ArticleMeta>();
  const enSlugs = new Map<string, ArticleMeta>();

  if (fs.existsSync(ARTICLES_DIR)) {
    for (const f of fs.readdirSync(ARTICLES_DIR)) {
      if (!f.endsWith(".md")) continue;
      const slug = path.basename(f, ".md");
      const { data } = matter(fs.readFileSync(path.join(ARTICLES_DIR, f), "utf-8"));
      jaSlugs.set(slug, {
        published: data.published === true,
        scheduledDate: data.scheduled_publish_date ? String(data.scheduled_publish_date) : null,
      });
    }
  }

  if (fs.existsSync(ARTICLES_EN_DIR)) {
    for (const f of fs.readdirSync(ARTICLES_EN_DIR)) {
      if (!f.endsWith(".md")) continue;
      const slug = path.basename(f, ".md");
      const { data } = matter(fs.readFileSync(path.join(ARTICLES_EN_DIR, f), "utf-8"));
      enSlugs.set(slug, {
        published: data.published === true,
        scheduledDate: data.scheduled_publish_date ? String(data.scheduled_publish_date) : null,
      });
    }
  }

  let hasError = false;

  for (const [slug, jaMeta] of jaSlugs) {
    if (!enSlugs.has(slug)) continue;
    const enMeta = enSlugs.get(slug)!;

    if (jaMeta.published !== enMeta.published) {
      console.error(
        `❌ ${slug}: published mismatch — JP=${jaMeta.published}, EN=${enMeta.published}`
      );
      hasError = true;
    }

    if (jaMeta.scheduledDate !== enMeta.scheduledDate) {
      console.error(
        `❌ ${slug}: scheduled_publish_date mismatch — JP=${jaMeta.scheduledDate}, EN=${enMeta.scheduledDate}`
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
