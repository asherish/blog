// --- Zenn → dev.to syntax conversion ---

export function convertDetails(markdown: string): string {
  return markdown.replace(
    /^:::details\s+(.+)\n([\s\S]*?)^:::/gm,
    (_match, title: string, content: string) =>
      `{% details ${title.trim()} %}\n${content}{% enddetails %}`
  );
}

export function convertMessages(markdown: string): string {
  return markdown.replace(
    /^:::message(?:\s+(alert))?\n([\s\S]*?)^:::/gm,
    (_match, type: string | undefined, content: string) => {
      const icon = type === "alert" ? "⚠️" : "ℹ️";
      const lines = content.trimEnd().split("\n");
      return lines
        .map((line, i) => (i === 0 ? `> ${icon} ${line}` : `> ${line}`))
        .join("\n");
    }
  );
}

export function convertBlockMath(markdown: string): string {
  return markdown.replace(
    /^\$\$\n([\s\S]*?)^\$\$/gm,
    (_match, content: string) => `{% katex %}\n${content}{% endkatex %}`
  );
}

export function convertInlineMath(markdown: string): string {
  return markdown.replace(
    /(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g,
    (_match, content: string) => `{% katex inline %}${content}{% endkatex %}`
  );
}

export function convertCodeFilenames(markdown: string): string {
  return markdown.replace(
    /^```(\w+):(.+)$/gm,
    (_match, lang: string, filename: string) => `\`\`\`${lang}\n// ${filename}`
  );
}

export function convertImageWidth(markdown: string): string {
  return markdown.replace(
    /!\[([^\]]*)\]\((\S+?)\s+=(\d+)x\)/g,
    (_match, alt: string, url: string, width: string) =>
      `<img src="${url}" alt="${alt}" width="${width}">`
  );
}

export function convertFootnotes(markdown: string): string {
  const footnotes: { num: string; text: string }[] = [];
  const withoutDefs = markdown.replace(
    /^\[\^(\d+)\]:\s*(.+)$/gm,
    (_match, num: string, text: string) => {
      footnotes.push({ num, text });
      return "";
    }
  );

  if (footnotes.length === 0) return markdown;

  footnotes.sort((a, b) => Number(a.num) - Number(b.num));
  const notesSection = [
    "",
    "---",
    "**Notes:**",
    ...footnotes.map((f) => `${f.num}. ${f.text}`),
  ].join("\n");

  return withoutDefs.trimEnd() + "\n" + notesSection + "\n";
}

export function convertZennToDevto(markdown: string): string {
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

// --- dev.to → Zenn syntax conversion ---

function revertDetails(markdown: string): string {
  return markdown.replace(
    /\{% details (.+?) %\}\n([\s\S]*?)\{% enddetails %\}/gm,
    (_match, title: string, content: string) =>
      `:::details ${title.trim()}\n${content}:::`
  );
}

function revertMessages(markdown: string): string {
  // Match consecutive blockquote lines starting with ℹ️ or ⚠️
  return markdown.replace(
    /^(?:> (?:ℹ️|⚠️) .*\n?)(?:> .*\n?)*/gm,
    (block) => {
      const isAlert = block.startsWith("> ⚠️");
      const lines = block.trimEnd().split("\n");
      const content = lines
        .map((line, i) => {
          if (i === 0) {
            // Remove "> ℹ️ " or "> ⚠️ " prefix
            return line.replace(/^> (?:ℹ️|⚠️) /, "");
          }
          // Remove "> " prefix
          return line.replace(/^> /, "");
        })
        .join("\n");
      const tag = isAlert ? ":::message alert" : ":::message";
      return `${tag}\n${content}\n:::`;
    }
  );
}

function revertBlockMath(markdown: string): string {
  return markdown.replace(
    /\{% katex %\}\n([\s\S]*?)\{% endkatex %\}/gm,
    (_match, content: string) => `$$\n${content}$$`
  );
}

function revertInlineMath(markdown: string): string {
  return markdown.replace(
    /\{% katex inline %\}(.+?)\{% endkatex %\}/g,
    (_match, content: string) => `$${content}$`
  );
}

function revertCodeFilenames(markdown: string): string {
  // Match ```lang followed by a // filename comment on the next line
  return markdown.replace(
    /^```(\w+)\n\/\/ (.+)$/gm,
    (_match, lang: string, filename: string) => `\`\`\`${lang}:${filename}`
  );
}

function revertImageWidth(markdown: string): string {
  return markdown.replace(
    /<img src="([^"]+)" alt="([^"]*)" width="(\d+)">/g,
    (_match, url: string, alt: string, width: string) =>
      `![${alt}](${url} =${width}x)`
  );
}

function revertFootnotes(markdown: string): string {
  // Match "**Notes:**" section with numbered list at the end
  const notesPattern =
    /\n---\n\*\*Notes:\*\*\n((?:\d+\. .+\n?)+)$/;
  const notesMatch = markdown.match(notesPattern);
  if (!notesMatch) return markdown;

  const noteLines = notesMatch[1].trim().split("\n");
  const footnoteDefs = noteLines
    .map((line) => {
      const m = line.match(/^(\d+)\. (.+)$/);
      if (!m) return "";
      return `[^${m[1]}]: ${m[2]}`;
    })
    .filter(Boolean)
    .join("\n");

  const withoutNotes = markdown.replace(notesPattern, "").trimEnd();
  return withoutNotes + "\n\n" + footnoteDefs + "\n";
}

export function convertDevtoToZenn(markdown: string): string {
  let result = markdown;
  result = revertDetails(result);
  result = revertMessages(result);
  result = revertBlockMath(result);
  result = revertInlineMath(result);
  result = revertCodeFilenames(result);
  result = revertImageWidth(result);
  result = revertFootnotes(result);
  return result;
}

// --- Frontmatter builders ---

const ZENN_USERNAME = "asherish";

export function buildDevtoFrontmatter(
  zennFrontmatter: Record<string, unknown>,
  slug: string,
  translatedTitle: string
): string {
  const tags: string[] = [];
  const topics = zennFrontmatter.topics;
  if (Array.isArray(topics)) {
    tags.push(...topics.slice(0, 4).map((t: unknown) => String(t)));
  }

  const canonicalUrl = `https://zenn.dev/${ZENN_USERNAME}/articles/${slug}`;

  const lines = [
    "---",
    `title: "${translatedTitle.replace(/"/g, '\\"')}"`,
    `published: ${zennFrontmatter.published === true}`,
    `tags: ${tags.join(", ")}`,
    `canonical_url: ${canonicalUrl}`,
  ];
  if (zennFrontmatter.scheduled_publish_date) {
    lines.push(`scheduled_publish_date: "${zennFrontmatter.scheduled_publish_date}"`);
  }
  lines.push("---");

  return lines.join("\n");
}

export function buildZennFrontmatter(
  devtoFrontmatter: Record<string, unknown>,
  translatedTitle: string
): string {
  const tags: string[] = [];
  if (typeof devtoFrontmatter.tags === "string") {
    tags.push(
      ...devtoFrontmatter.tags
        .split(",")
        .map((t: string) => t.trim())
        .filter(Boolean)
    );
  } else if (Array.isArray(devtoFrontmatter.tags)) {
    tags.push(...devtoFrontmatter.tags.map((t: unknown) => String(t)));
  }

  const lines = [
    "---",
    `title: "${translatedTitle.replace(/"/g, '\\"')}"`,
    `emoji: "📝"`,
    `type: "tech"`,
    `topics: [${tags.map((t) => `"${t}"`).join(", ")}]`,
    `published: ${devtoFrontmatter.published === true}`,
  ];
  if (devtoFrontmatter.scheduled_publish_date) {
    lines.push(`scheduled_publish_date: "${devtoFrontmatter.scheduled_publish_date}"`);
  }
  lines.push("---");

  return lines.join("\n");
}
