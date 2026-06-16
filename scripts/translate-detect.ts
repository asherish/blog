import fs from "node:fs";
import path from "node:path";
import { loadSyncState, computeHash } from "./sync/state.js";

const ARTICLES_DIR = path.resolve(import.meta.dirname, "../articles");
const ARTICLES_EN_DIR = path.resolve(import.meta.dirname, "../articles_en");

interface TranslateAction {
  slug: string;
  // "new": no English article exists yet — full rewrite.
  // "update": English exists but the Japanese source changed — revise or rewrite.
  reason: "new" | "update";
  sourcePath: string;
  targetPath: string;
}

interface TranslatePlan {
  actions: TranslateAction[];
  skipped: string[];
  // English files with no Japanese source. One-way localization never writes
  // back to Japanese, so these are reported but not acted upon.
  orphans: string[];
}

// Collect slugs from a directory (*.md files without extension)
function collectSlugs(dir: string): Set<string> {
  const slugs = new Set<string>();
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return slugs;
  }
  for (const file of files) {
    if (file.endsWith(".md")) {
      slugs.add(file.replace(/\.md$/, ""));
    }
  }
  return slugs;
}

function main() {
  const args = process.argv.slice(2);
  const slugFilter = args.find((a) => !a.startsWith("--"));

  const jaSlugs = collectSlugs(ARTICLES_DIR);
  const enSlugs = collectSlugs(ARTICLES_EN_DIR);

  const orphans = [...enSlugs].filter((s) => !jaSlugs.has(s)).sort();

  let slugs = [...jaSlugs].sort();
  if (slugFilter) {
    if (!jaSlugs.has(slugFilter)) {
      console.error(
        `Error: slug "${slugFilter}" not found in articles/ (Japanese is the source of truth)`
      );
      process.exit(1);
    }
    slugs = [slugFilter];
  }

  const state = loadSyncState();
  const plan: TranslatePlan = {
    actions: [],
    skipped: [],
    orphans: slugFilter ? [] : orphans,
  };

  for (const slug of slugs) {
    const jaPath = path.join(ARTICLES_DIR, `${slug}.md`);
    const enPath = path.join(ARTICLES_EN_DIR, `${slug}.md`);
    const hasEn = enSlugs.has(slug);
    const jaHash = computeHash(fs.readFileSync(jaPath, "utf-8"));
    const entry = state[slug];

    if (!hasEn) {
      plan.actions.push({ slug, reason: "new", sourcePath: jaPath, targetPath: enPath });
    } else if (!entry || entry.jaHash !== jaHash) {
      plan.actions.push({ slug, reason: "update", sourcePath: jaPath, targetPath: enPath });
    } else {
      plan.skipped.push(slug);
    }
  }

  console.log(JSON.stringify(plan, null, 2));
}

main();
