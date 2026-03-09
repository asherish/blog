import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { loadMapping, saveMapping } from "./sync/state.js";

const ARTICLES_EN_DIR = path.resolve(import.meta.dirname, "../articles_en");
const DEVTO_API_BASE = "https://dev.to/api";

interface DevtoArticlePayload {
  article: {
    title: string;
    body_markdown: string;
    published: boolean;
    tags: string[];
    canonical_url?: string;
  };
}

async function devtoRequest(
  method: string,
  endpoint: string,
  apiKey: string,
  body?: DevtoArticlePayload
): Promise<{ id: number; url: string }> {
  const res = await fetch(`${DEVTO_API_BASE}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`dev.to API error ${res.status}: ${text}`);
  }

  return (await res.json()) as { id: number; url: string };
}

async function main(): Promise<void> {
  const apiKey = process.env.DEV_TO_API_KEY;
  if (!apiKey) {
    console.error(
      "Error: DEV_TO_API_KEY is not set."
    );
    process.exit(1);
  }

  const mapping = loadMapping();

  const files = fs
    .readdirSync(ARTICLES_EN_DIR)
    .filter((f) => f.endsWith(".md"));

  if (files.length === 0) {
    console.log("No articles found in articles_en/");
    return;
  }

  let published = 0;
  let updated = 0;
  let skipped = 0;

  for (const file of files) {
    const slug = path.basename(file, ".md");
    const filePath = path.join(ARTICLES_EN_DIR, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data: frontmatter, content } = matter(raw);

    // Skip drafts
    if (frontmatter.published !== true) {
      console.log(`⏭  ${slug} (draft)`);
      skipped++;
      continue;
    }

    const tags = frontmatter.tags
      ? String(frontmatter.tags)
          .split(",")
          .map((t: string) => t.trim())
          .filter(Boolean)
          .slice(0, 4)
      : [];

    const payload: DevtoArticlePayload = {
      article: {
        title: String(frontmatter.title || slug),
        body_markdown: content.trim(),
        published: true,
        tags,
        canonical_url: frontmatter.canonical_url
          ? String(frontmatter.canonical_url)
          : undefined,
      },
    };

    try {
      const existingId = mapping[slug]?.devtoId;

      if (existingId) {
        // Update existing article
        const result = await devtoRequest(
          "PUT",
          `/articles/${existingId}`,
          apiKey,
          payload
        );
        console.log(`🔄 Updated: ${slug} → ${result.url}`);
        updated++;
      } else {
        // Create new article
        const result = await devtoRequest(
          "POST",
          "/articles",
          apiKey,
          payload
        );
        mapping[slug] = {
          ...mapping[slug],
          devtoId: result.id,
        };
        saveMapping(mapping);
        console.log(`✅ Published: ${slug} → ${result.url}`);
        published++;
      }
    } catch (err) {
      console.error(`❌ Failed to publish ${slug}:`, err);
    }
  }

  console.log(
    `\nDone: ${published} published, ${updated} updated, ${skipped} skipped`
  );
}

main();
