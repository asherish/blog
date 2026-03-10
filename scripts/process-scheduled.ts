import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const ARTICLES_DIR = path.resolve(import.meta.dirname, "../articles");
const ARTICLES_EN_DIR = path.resolve(import.meta.dirname, "../articles_en");
const TIMEZONE = "Asia/Tokyo";

function getCurrentDate(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

function setPublished(filePath: string): void {
  let raw = fs.readFileSync(filePath, "utf-8");
  raw = raw.replace(/^published:\s*false$/m, "published: true");
  raw = raw.replace(/^scheduled_publish_date:.*\n/m, "");
  fs.writeFileSync(filePath, raw);
}

interface ArticleInfo {
  slug: string;
  jaPath: string | null;
  enPath: string | null;
  scheduledDate: string | null;
}

function collectArticles(): ArticleInfo[] {
  const slugs = new Map<string, ArticleInfo>();

  const readDir = (dir: string, lang: "ja" | "en") => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".md")) continue;
      const slug = path.basename(f, ".md");
      const filePath = path.join(dir, f);
      const { data } = matter(fs.readFileSync(filePath, "utf-8"));

      if (data.published === true) continue;
      if (!data.scheduled_publish_date) continue;

      let info = slugs.get(slug);
      if (!info) {
        info = { slug, jaPath: null, enPath: null, scheduledDate: null };
        slugs.set(slug, info);
      }

      if (lang === "ja") {
        info.jaPath = filePath;
      } else {
        info.enPath = filePath;
      }
      info.scheduledDate = String(data.scheduled_publish_date);
    }
  };

  readDir(ARTICLES_DIR, "ja");
  readDir(ARTICLES_EN_DIR, "en");

  return [...slugs.values()];
}

function main(): void {
  const today = getCurrentDate();
  console.log(`Checking scheduled articles (${TIMEZONE}: ${today})...\n`);

  const articles = collectArticles();

  if (articles.length === 0) {
    console.log("No scheduled articles found.");
    return;
  }

  const published: string[] = [];

  for (const article of articles) {
    const { slug, jaPath, enPath, scheduledDate } = article;

    if (!scheduledDate) continue;

    // Validate date consistency between JP and EN when both exist
    if (jaPath && enPath) {
      const jaData = matter(fs.readFileSync(jaPath, "utf-8")).data;
      const enData = matter(fs.readFileSync(enPath, "utf-8")).data;
      const jaDate = String(jaData.scheduled_publish_date);
      const enDate = String(enData.scheduled_publish_date);
      if (jaDate !== enDate) {
        console.log(
          `  ${slug}: ⚠️ scheduled_publish_date mismatch (JP=${jaDate}, EN=${enDate}) — skipped`
        );
        continue;
      }
    }

    if (today < scheduledDate) {
      console.log(`  ${slug}: scheduled for ${scheduledDate} — not yet`);
      continue;
    }

    // Publish
    if (jaPath) setPublished(jaPath);
    if (enPath) setPublished(enPath);
    published.push(slug);

    if (!jaPath || !enPath) {
      const missing = !jaPath ? "JP" : "EN";
      console.log(
        `  ${slug}: scheduled for ${scheduledDate} → published (⚠️ ${missing} file not found)`
      );
    } else {
      console.log(
        `  ${slug}: scheduled for ${scheduledDate} → published`
      );
    }
  }

  console.log(
    `\nPublished ${published.length} article(s)${published.length > 0 ? ": " + published.join(", ") : ""}`
  );
}

main();
