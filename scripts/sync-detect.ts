import fs from "node:fs";
import path from "node:path";
import { loadSyncState, saveSyncState, computeHash } from "./sync/state.js";

const ARTICLES_DIR = path.resolve(import.meta.dirname, "../articles");
const ARTICLES_EN_DIR = path.resolve(import.meta.dirname, "../articles_en");

interface SyncAction {
  slug: string;
  action: "full-translate" | "diff-sync";
  direction: "ja-to-en" | "en-to-ja";
  sourcePath: string;
  targetPath: string;
}

interface Conflict {
  slug: string;
  message: string;
}

interface SyncPlan {
  actions: SyncAction[];
  skipped: string[];
  baselined: string[];
  conflicts: Conflict[];
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
  const preferFlag = args.find((_, i) => args[i - 1] === "--prefer");
  const slugFilter = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--prefer");

  const jaSlugs = collectSlugs(ARTICLES_DIR);
  const enSlugs = collectSlugs(ARTICLES_EN_DIR);
  const allSlugs = new Set([...jaSlugs, ...enSlugs]);

  if (slugFilter) {
    if (!allSlugs.has(slugFilter)) {
      console.error(`Error: slug "${slugFilter}" not found in articles/ or articles_en/`);
      process.exit(1);
    }
    allSlugs.clear();
    allSlugs.add(slugFilter);
  }

  const state = loadSyncState();
  const plan: SyncPlan = { actions: [], skipped: [], baselined: [], conflicts: [] };
  let stateChanged = false;

  for (const slug of [...allSlugs].sort()) {
    const jaPath = path.join(ARTICLES_DIR, `${slug}.md`);
    const enPath = path.join(ARTICLES_EN_DIR, `${slug}.md`);
    const hasJa = jaSlugs.has(slug);
    const hasEn = enSlugs.has(slug);
    const entry = state[slug];

    if (hasJa && !hasEn) {
      // JP only — translate to EN
      plan.actions.push({
        slug,
        action: "full-translate",
        direction: "ja-to-en",
        sourcePath: jaPath,
        targetPath: enPath,
      });
    } else if (!hasJa && hasEn) {
      // EN only — translate to JP
      plan.actions.push({
        slug,
        action: "full-translate",
        direction: "en-to-ja",
        sourcePath: enPath,
        targetPath: jaPath,
      });
    } else if (hasJa && hasEn) {
      // Both exist
      const jaContent = fs.readFileSync(jaPath, "utf-8");
      const enContent = fs.readFileSync(enPath, "utf-8");
      const jaHash = computeHash(jaContent);
      const enHash = computeHash(enContent);

      if (!entry) {
        // No state entry — baseline both
        state[slug] = { jaHash, enHash };
        stateChanged = true;
        plan.baselined.push(slug);
      } else {
        const jaChanged = jaHash !== entry.jaHash;
        const enChanged = enHash !== entry.enHash;

        if (!jaChanged && !enChanged) {
          plan.skipped.push(slug);
        } else if (jaChanged && !enChanged) {
          plan.actions.push({
            slug,
            action: "diff-sync",
            direction: "ja-to-en",
            sourcePath: jaPath,
            targetPath: enPath,
          });
        } else if (!jaChanged && enChanged) {
          plan.actions.push({
            slug,
            action: "diff-sync",
            direction: "en-to-ja",
            sourcePath: enPath,
            targetPath: jaPath,
          });
        } else {
          // Both changed — conflict
          if (preferFlag === "ja") {
            plan.actions.push({
              slug,
              action: "diff-sync",
              direction: "ja-to-en",
              sourcePath: jaPath,
              targetPath: enPath,
            });
          } else if (preferFlag === "en") {
            plan.actions.push({
              slug,
              action: "diff-sync",
              direction: "en-to-ja",
              sourcePath: enPath,
              targetPath: jaPath,
            });
          } else {
            plan.conflicts.push({
              slug,
              message: `Both JP and EN changed. Use --prefer ja or --prefer en to resolve.`,
            });
          }
        }
      }
    }
  }

  if (stateChanged) {
    saveSyncState(state);
  }

  console.log(JSON.stringify(plan, null, 2));
}

main();
