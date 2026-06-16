// --- Zenn → dev.to syntax conversion ---
//
// Localization is one-way (JP/Zenn → EN/dev.to), so only the forward
// conversion is implemented here.

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

// --- Frontmatter builder ---

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
