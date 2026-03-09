import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import matter from "gray-matter";
import {
  loadSyncState,
  saveSyncState,
  computeHash,
  type SyncState,
} from "./sync/state.js";
import {
  convertZennToDevto,
  convertDevtoToZenn,
  buildDevtoFrontmatter,
  buildZennFrontmatter,
} from "./sync/convert.js";
import {
  translateBody,
  translateTitle,
  diffSync,
} from "./sync/api.js";

const ARTICLES_DIR = path.resolve(import.meta.dirname, "../articles");
const ARTICLES_EN_DIR = path.resolve(import.meta.dirname, "../articles_en");

type Preference = "ja" | "en" | null;

interface CliOptions {
  slugFilter: string | null;
  prefer: Preference;
  dryRun: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let slugFilter: string | null = null;
  let prefer: Preference = null;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--prefer" && args[i + 1]) {
      const val = args[i + 1];
      if (val !== "ja" && val !== "en") {
        console.error(`Error: --prefer must be "ja" or "en", got "${val}"`);
        process.exit(1);
      }
      prefer = val;
      i++;
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (!args[i].startsWith("-")) {
      slugFilter = args[i];
    }
  }

  return { slugFilter, prefer, dryRun };
}

// Collect all slugs from both directories
function collectSlugs(slugFilter: string | null): string[] {
  const jaSlugs = new Set<string>();
  const enSlugs = new Set<string>();

  if (fs.existsSync(ARTICLES_DIR)) {
    for (const f of fs.readdirSync(ARTICLES_DIR)) {
      if (f.endsWith(".md")) jaSlugs.add(path.basename(f, ".md"));
    }
  }

  if (fs.existsSync(ARTICLES_EN_DIR)) {
    for (const f of fs.readdirSync(ARTICLES_EN_DIR)) {
      if (f.endsWith(".md")) enSlugs.add(path.basename(f, ".md"));
    }
  }

  const allSlugs = new Set([...jaSlugs, ...enSlugs]);

  if (slugFilter) {
    if (!allSlugs.has(slugFilter)) {
      console.error(`Error: slug "${slugFilter}" not found in either directory`);
      process.exit(1);
    }
    return [slugFilter];
  }

  return [...allSlugs].sort();
}

async function main(): Promise<void> {
  const opts = parseArgs();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Error: ANTHROPIC_API_KEY is not set. Create a .env file or export the variable."
    );
    process.exit(1);
  }

  const client = new Anthropic();
  const syncState = loadSyncState();
  const slugs = collectSlugs(opts.slugFilter);

  if (slugs.length === 0) {
    console.log("No articles found.");
    return;
  }

  // Ensure output directories exist
  if (!opts.dryRun) {
    if (!fs.existsSync(ARTICLES_DIR)) fs.mkdirSync(ARTICLES_DIR, { recursive: true });
    if (!fs.existsSync(ARTICLES_EN_DIR)) fs.mkdirSync(ARTICLES_EN_DIR, { recursive: true });
  }

  let synced = 0;
  let skipped = 0;
  let baselined = 0;

  for (const slug of slugs) {
    const jaPath = path.join(ARTICLES_DIR, `${slug}.md`);
    const enPath = path.join(ARTICLES_EN_DIR, `${slug}.md`);
    const jaExists = fs.existsSync(jaPath);
    const enExists = fs.existsSync(enPath);

    const jaRaw = jaExists ? fs.readFileSync(jaPath, "utf-8") : null;
    const enRaw = enExists ? fs.readFileSync(enPath, "utf-8") : null;
    const jaHash = jaRaw ? computeHash(jaRaw) : null;
    const enHash = enRaw ? computeHash(enRaw) : null;

    const stored = syncState[slug];

    // Case 1: JP only → full translate JP→EN
    if (jaRaw && !enRaw) {
      console.log(`🔄 [JP→EN] Full translate: ${slug}`);
      if (opts.dryRun) { skipped++; continue; }

      try {
        const { data: fm, content: body } = matter(jaRaw);
        const [translatedBody, translatedTitleText] = await Promise.all([
          translateBody(client, body, "ja-to-en"),
          translateTitle(client, String(fm.title || slug), "ja-to-en"),
        ]);

        const convertedBody = convertZennToDevto(translatedBody);
        const devtoFm = buildDevtoFrontmatter(fm, slug, translatedTitleText);
        const output = `${devtoFm}\n\n${convertedBody}\n`;

        fs.writeFileSync(enPath, output, "utf-8");

        syncState[slug] = {
          jaHash: jaHash!,
          enHash: computeHash(output),
        };
        saveSyncState(syncState);

        console.log(`✅ ${slug} → articles_en/${slug}.md`);
        synced++;
      } catch (err) {
        console.error(`❌ Failed to sync ${slug}:`, err);
      }
      continue;
    }

    // Case 2: EN only → full translate EN→JP
    if (!jaRaw && enRaw) {
      console.log(`🔄 [EN→JP] Full translate: ${slug}`);
      if (opts.dryRun) { skipped++; continue; }

      try {
        const { data: fm, content: body } = matter(enRaw);
        const [translatedBody, translatedTitleText] = await Promise.all([
          translateBody(client, body, "en-to-ja"),
          translateTitle(client, String(fm.title || slug), "en-to-ja"),
        ]);

        const convertedBody = convertDevtoToZenn(translatedBody);
        const zennFm = buildZennFrontmatter(fm, translatedTitleText);
        const output = `${zennFm}\n\n${convertedBody}\n`;

        fs.writeFileSync(jaPath, output, "utf-8");

        syncState[slug] = {
          jaHash: computeHash(output),
          enHash: enHash!,
        };
        saveSyncState(syncState);

        console.log(`✅ ${slug} → articles/${slug}.md`);
        synced++;
      } catch (err) {
        console.error(`❌ Failed to sync ${slug}:`, err);
      }
      continue;
    }

    // Case 3+: Both exist
    if (!jaRaw || !enRaw) continue;

    // No stored state → baseline
    if (!stored) {
      console.log(`📌 Baseline: ${slug}`);
      if (opts.dryRun) { baselined++; continue; }

      syncState[slug] = { jaHash: jaHash!, enHash: enHash! };
      saveSyncState(syncState);
      baselined++;
      continue;
    }

    const jaChanged = jaHash !== stored.jaHash;
    const enChanged = enHash !== stored.enHash;

    // No changes
    if (!jaChanged && !enChanged) {
      console.log(`⏭  ${slug} (unchanged)`);
      skipped++;
      continue;
    }

    // Conflict: both changed
    if (jaChanged && enChanged) {
      if (!opts.prefer) {
        console.error(
          `⚠️  Conflict: ${slug} — both JP and EN changed. Use --prefer ja or --prefer en to resolve.`
        );
        skipped++;
        continue;
      }

      // Resolve conflict using preference
      const direction = opts.prefer === "ja" ? "ja-to-en" : "en-to-ja";
      console.log(`🔄 [Conflict → prefer ${opts.prefer}] Diff sync: ${slug}`);
      if (opts.dryRun) { skipped++; continue; }

      try {
        const { data: sourceFm, content: sourceBody } = matter(opts.prefer === "ja" ? jaRaw : enRaw);
        const { content: targetBody } = matter(opts.prefer === "ja" ? enRaw : jaRaw);

        const [updatedBody, newTitle] = await Promise.all([
          diffSync(client, sourceBody, targetBody, direction),
          translateTitle(client, String(sourceFm.title || slug), direction),
        ]);

        if (direction === "ja-to-en") {
          const devtoFm = buildDevtoFrontmatter(sourceFm, slug, newTitle);
          const output = `${devtoFm}\n\n${updatedBody}\n`;
          fs.writeFileSync(enPath, output, "utf-8");
          syncState[slug] = { jaHash: jaHash!, enHash: computeHash(output) };
        } else {
          const zennFm = buildZennFrontmatter(sourceFm, newTitle);
          const output = `${zennFm}\n\n${updatedBody}\n`;
          fs.writeFileSync(jaPath, output, "utf-8");
          syncState[slug] = { jaHash: computeHash(output), enHash: enHash! };
        }
        saveSyncState(syncState);

        console.log(`✅ ${slug} (conflict resolved → prefer ${opts.prefer})`);
        synced++;
      } catch (err) {
        console.error(`❌ Failed to sync ${slug}:`, err);
      }
      continue;
    }

    // JP only changed → update EN
    if (jaChanged) {
      console.log(`🔄 [JP→EN] Diff sync: ${slug}`);
      if (opts.dryRun) { skipped++; continue; }

      try {
        const { data: jaFm, content: jaBody } = matter(jaRaw);
        const { content: enBody } = matter(enRaw);

        const [updatedBody, newTitle] = await Promise.all([
          diffSync(client, jaBody, enBody, "ja-to-en"),
          translateTitle(client, String(jaFm.title || slug), "ja-to-en"),
        ]);

        const devtoFm = buildDevtoFrontmatter(jaFm, slug, newTitle);
        const output = `${devtoFm}\n\n${updatedBody}\n`;
        fs.writeFileSync(enPath, output, "utf-8");

        syncState[slug] = { jaHash: jaHash!, enHash: computeHash(output) };
        saveSyncState(syncState);

        console.log(`✅ ${slug} → articles_en/${slug}.md`);
        synced++;
      } catch (err) {
        console.error(`❌ Failed to sync ${slug}:`, err);
      }
      continue;
    }

    // EN only changed → update JP
    if (enChanged) {
      console.log(`🔄 [EN→JP] Diff sync: ${slug}`);
      if (opts.dryRun) { skipped++; continue; }

      try {
        const { data: enFm, content: enBody } = matter(enRaw);
        const { content: jaBody } = matter(jaRaw);

        const [updatedBody, newTitle] = await Promise.all([
          diffSync(client, enBody, jaBody, "en-to-ja"),
          translateTitle(client, String(enFm.title || slug), "en-to-ja"),
        ]);

        const zennFm = buildZennFrontmatter(enFm, newTitle);
        const output = `${zennFm}\n\n${updatedBody}\n`;
        fs.writeFileSync(jaPath, output, "utf-8");

        syncState[slug] = { jaHash: computeHash(output), enHash: enHash! };
        saveSyncState(syncState);

        console.log(`✅ ${slug} → articles/${slug}.md`);
        synced++;
      } catch (err) {
        console.error(`❌ Failed to sync ${slug}:`, err);
      }
      continue;
    }
  }

  console.log(
    `\nDone: ${synced} synced, ${baselined} baselined, ${skipped} skipped`
  );
}

main();
