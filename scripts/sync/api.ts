import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-20250514";

// Extract text from Claude API response
function extractText(response: Anthropic.Message): string {
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude API");
  }
  return textBlock.text;
}

// Translate full article body in either direction
export async function translateBody(
  client: Anthropic,
  body: string,
  direction: "ja-to-en" | "en-to-ja"
): Promise<string> {
  const fromLang = direction === "ja-to-en" ? "Japanese" : "English";
  const toLang = direction === "ja-to-en" ? "English" : "Japanese";
  const platformNote =
    direction === "ja-to-en"
      ? "- Preserve Zenn-specific syntax exactly as-is (e.g. `:::message`, `:::details`, `$$` math blocks, `$` inline math, code block filenames like ```lang:filename). These will be converted in post-processing."
      : "- Preserve dev.to-specific syntax exactly as-is (e.g. `{% details %}`, `{% katex %}`, blockquote messages). These will be converted in post-processing.";

  const prompt = `You are a professional technical translator. Translate the following ${fromLang} Markdown article into natural, fluent ${toLang}.

Rules:
- Translate the body text, headings, and any ${fromLang} text naturally into ${toLang}
- Do NOT translate or modify: code blocks, inline code, URLs, file paths, emoji, command names
- Keep the Markdown formatting intact
${platformNote}
- Do not add any explanation or commentary — only output the translated Markdown body (no frontmatter)

---

${body}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  return extractText(response);
}

// Translate article title in either direction
export async function translateTitle(
  client: Anthropic,
  title: string,
  direction: "ja-to-en" | "en-to-ja"
): Promise<string> {
  const instruction =
    direction === "ja-to-en"
      ? "Translate the following Japanese article title into English."
      : "Translate the following English article title into Japanese.";

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: `${instruction} Output only the translated title, nothing else.\n\n${title}`,
      },
    ],
  });

  return extractText(response).trim();
}

// Diff sync: update translation to match changed source
export async function diffSync(
  client: Anthropic,
  currentSource: string,
  currentTranslation: string,
  direction: "ja-to-en" | "en-to-ja"
): Promise<string> {
  const sourceLanguage = direction === "ja-to-en" ? "日本語" : "英語";
  const targetLanguage = direction === "ja-to-en" ? "英語" : "日本語";

  const prompt = `以下の日本語記事と英語記事は対訳関係にあります。
${sourceLanguage}記事が更新されました。
${targetLanguage}記事を更新後の${sourceLanguage}記事に合わせて修正してください。
変更が必要な箇所だけ修正し、それ以外は一切変えないでください。
翻訳本文だけを出力してください（frontmatter は不要）。

【${sourceLanguage}記事】
${currentSource}

【${targetLanguage}記事】
${currentTranslation}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  return extractText(response);
}
