import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import matter from "gray-matter";

const ARTICLES_DIR = path.resolve(import.meta.dirname, "../articles");
const ARTICLES_EN_DIR = path.resolve(import.meta.dirname, "../articles_en");
const MAPPING_PATH = path.resolve(
  import.meta.dirname,
  "../.devto-mapping.json"
);
const ZENN_USERNAME = "asherish";
const MODEL = "claude-sonnet-4-20250514";

interface MappingEntry {
  hash: string;
  devtoId?: number;
}

type Mapping = Record<string, MappingEntry>;

function loadMapping(): Mapping {
  try {
    return JSON.parse(fs.readFileSync(MAPPING_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveMapping(mapping: Mapping): void {
  fs.writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2) + "\n");
}

function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

// Map Zenn emoji to a readable tag for dev.to
function emojiToTag(emoji: string): string | undefined {
  const map: Record<string, string> = {
    "💡": "idea",
    "🔥": "hot",
    "📝": "writing",
    "🎉": "celebrate",
    "🐛": "bug",
    "⚡": "performance",
    "🔧": "tooling",
    "🚀": "launch",
  };
  return map[emoji];
}

// --- Zenn → dev.to syntax conversion ---

function convertDetails(markdown: string): string {
  return markdown.replace(
    /^:::details\s+(.+)\n([\s\S]*?)^:::/gm,
    (_match, title: string, content: string) =>
      `{% details ${title.trim()} %}\n${content}{% enddetails %}`
  );
}

function convertMessages(markdown: string): string {
  return markdown.replace(
    /^:::message(?:\s+(alert))?\n([\s\S]*?)^:::/gm,
    (_match, type: string | undefined, content: string) => {
      const icon = type === "alert" ? "⚠️" : "ℹ️";
      const lines = content.trimEnd().split("\n");
      return lines.map((line, i) => (i === 0 ? `> ${icon} ${line}` : `> ${line}`)).join("\n");
    }
  );
}

function convertBlockMath(markdown: string): string {
  return markdown.replace(
    /^\$\$\n([\s\S]*?)^\$\$/gm,
    (_match, content: string) => `{% katex %}\n${content}{% endkatex %}`
  );
}

function convertInlineMath(markdown: string): string {
  // Match $...$ but not $$...$$, and not inside code spans
  return markdown.replace(
    /(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g,
    (_match, content: string) => `{% katex inline %}${content}{% endkatex %}`
  );
}

function convertCodeFilenames(markdown: string): string {
  return markdown.replace(
    /^```(\w+):(.+)$/gm,
    (_match, lang: string, filename: string) => `\`\`\`${lang}\n// ${filename}`
  );
}

function convertImageWidth(markdown: string): string {
  return markdown.replace(
    /!\[([^\]]*)\]\((\S+?)\s+=(\d+)x\)/g,
    (_match, alt: string, url: string, width: string) =>
      `<img src="${url}" alt="${alt}" width="${width}">`
  );
}

function convertFootnotes(markdown: string): string {
  // Collect footnote definitions
  const footnotes: { num: string; text: string }[] = [];
  const withoutDefs = markdown.replace(
    /^\[\^(\d+)\]:\s*(.+)$/gm,
    (_match, num: string, text: string) => {
      footnotes.push({ num, text });
      return "";
    }
  );

  if (footnotes.length === 0) return markdown;

  // Build Notes section
  footnotes.sort((a, b) => Number(a.num) - Number(b.num));
  const notesSection = [
    "",
    "---",
    "**Notes:**",
    ...footnotes.map((f) => `${f.num}. ${f.text}`),
  ].join("\n");

  // Remove trailing blank lines left by removed definitions, then append notes
  return withoutDefs.trimEnd() + "\n" + notesSection + "\n";
}

function convertZennToDevto(markdown: string): string {
  let result = markdown;
  result = convertDetails(result);
  result = convertMessages(result);
  result = convertBlockMath(result);
  result = convertInlineMath(result);
  result = convertCodeFilenames(result);
  result = convertImageWidth(result);
  result = convertFootnotes(result);
  return result;
}

async function translateArticle(
  client: Anthropic,
  content: string,
  frontmatter: Record<string, unknown>
): Promise<string> {
  const prompt = `You are a professional technical translator. Translate the following Japanese Markdown article into natural, fluent English.

Rules:
- Translate the body text, headings, and any Japanese text naturally into English
- Do NOT translate or modify: code blocks, inline code, URLs, file paths, emoji, command names
- Keep the Markdown formatting intact
- Preserve Zenn-specific syntax exactly as-is (e.g. \`:::message\`, \`:::details\`, \`$$\` math blocks, \`$\` inline math, code block filenames like \`\`\`lang:filename). These will be converted in post-processing.
- Do not add any explanation or commentary — only output the translated Markdown body (no frontmatter)

---

${content}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude API");
  }

  return textBlock.text;
}

function buildDevtoFrontmatter(
  zennFrontmatter: Record<string, unknown>,
  slug: string,
  translatedTitle: string
): string {
  const tags: string[] = [];
  const topics = zennFrontmatter.topics;
  if (Array.isArray(topics)) {
    // dev.to allows max 4 tags
    tags.push(...topics.slice(0, 4).map((t: unknown) => String(t)));
  }

  const canonicalUrl = `https://zenn.dev/${ZENN_USERNAME}/articles/${slug}`;

  const lines = [
    "---",
    `title: "${translatedTitle}"`,
    `published: ${zennFrontmatter.published === true}`,
    `tags: ${tags.join(", ")}`,
    `canonical_url: ${canonicalUrl}`,
    "---",
  ];

  return lines.join("\n");
}

async function translateTitle(
  client: Anthropic,
  title: string
): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: `Translate the following Japanese article title into English. Output only the translated title, nothing else.\n\n${title}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude API");
  }

  return textBlock.text.trim();
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Error: ANTHROPIC_API_KEY is not set. Create a .env file or export the variable."
    );
    process.exit(1);
  }

  const client = new Anthropic();
  const mapping = loadMapping();

  if (!fs.existsSync(ARTICLES_EN_DIR)) {
    fs.mkdirSync(ARTICLES_EN_DIR, { recursive: true });
  }

  const files = fs
    .readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".md"));

  if (files.length === 0) {
    console.log("No articles found in articles/");
    return;
  }

  let translated = 0;
  let skipped = 0;

  for (const file of files) {
    const slug = path.basename(file, ".md");
    const filePath = path.join(ARTICLES_DIR, file);
    const rawContent = fs.readFileSync(filePath, "utf-8");
    const hash = computeHash(rawContent);

    // Skip if unchanged
    if (mapping[slug]?.hash === hash) {
      console.log(`⏭  ${slug} (unchanged)`);
      skipped++;
      continue;
    }

    const { data: frontmatter, content: body } = matter(rawContent);

    // Skip unpublished articles
    if (frontmatter.published !== true) {
      console.log(`⏭  ${slug} (not published)`);
      skipped++;
      continue;
    }

    console.log(`🔄 Translating: ${slug}...`);

    try {
      const [translatedBody, translatedTitle] = await Promise.all([
        translateArticle(client, body, frontmatter),
        translateTitle(client, String(frontmatter.title || slug)),
      ]);

      const convertedBody = convertZennToDevto(translatedBody);
      const devtoFrontmatter = buildDevtoFrontmatter(
        frontmatter,
        slug,
        translatedTitle
      );
      const output = `${devtoFrontmatter}\n\n${convertedBody}\n`;

      const outPath = path.join(ARTICLES_EN_DIR, file);
      fs.writeFileSync(outPath, output, "utf-8");

      mapping[slug] = {
        ...mapping[slug],
        hash,
      };
      saveMapping(mapping);

      console.log(`✅ ${slug} → articles_en/${file}`);
      translated++;
    } catch (err) {
      console.error(`❌ Failed to translate ${slug}:`, err);
      // Skip this article, will retry next run
    }
  }

  console.log(
    `\nDone: ${translated} translated, ${skipped} skipped`
  );
}

main();
