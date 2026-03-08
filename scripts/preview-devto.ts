import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { marked } from "marked";
import matter from "gray-matter";

const ARTICLES_EN_DIR = path.resolve(import.meta.dirname, "../articles_en");
// Use port 13000 to avoid conflicts with common dev servers (3000 is used by
// Next.js, Express, Vite, etc.). Derived by adding 10000 to the conventional
// port, so it stays easy to remember.
const PORT = Number(process.env.DEVTO_PREVIEW_PORT) || 13000;

const CSS = `
  body {
    max-width: 720px;
    margin: 40px auto;
    padding: 0 20px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    line-height: 1.6;
    color: #1a1a1a;
    background: #fafafa;
  }
  h1 { border-bottom: 2px solid #3b49df; padding-bottom: 8px; }
  a { color: #3b49df; }
  pre { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 6px; overflow-x: auto; }
  code { background: #e8e8e8; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
  pre code { background: none; padding: 0; }
  .tag { display: inline-block; background: #e0e0ff; color: #3b49df; padding: 2px 8px; border-radius: 4px; margin-right: 4px; font-size: 0.85em; }
  .meta { color: #666; font-size: 0.9em; margin-bottom: 24px; }
  .article-list { list-style: none; padding: 0; }
  .article-list li { margin: 12px 0; padding: 12px; background: white; border-radius: 6px; border: 1px solid #e0e0e0; }
  .badge { font-size: 0.75em; padding: 2px 6px; border-radius: 3px; margin-left: 8px; }
  .badge-published { background: #d4edda; color: #155724; }
  .badge-draft { background: #fff3cd; color: #856404; }
`;

function getArticles(): Array<{
  slug: string;
  title: string;
  published: boolean;
  tags: string[];
}> {
  if (!fs.existsSync(ARTICLES_EN_DIR)) return [];

  return fs
    .readdirSync(ARTICLES_EN_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const raw = fs.readFileSync(path.join(ARTICLES_EN_DIR, f), "utf-8");
      const { data } = matter(raw);
      return {
        slug: path.basename(f, ".md"),
        title: String(data.title || path.basename(f, ".md")),
        published: data.published === true,
        tags: data.tags
          ? String(data.tags)
              .split(",")
              .map((t: string) => t.trim())
          : [],
      };
    });
}

function renderIndex(): string {
  const articles = getArticles();
  const items = articles
    .map(
      (a) =>
        `<li>
          <a href="/articles/${a.slug}">${a.title}</a>
          <span class="badge ${a.published ? "badge-published" : "badge-draft"}">${a.published ? "published" : "draft"}</span>
          <br><span class="meta">${a.tags.map((t) => `<span class="tag">#${t}</span>`).join(" ")}</span>
        </li>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>dev.to Preview</title><style>${CSS}</style></head>
<body>
  <h1>dev.to Preview</h1>
  <p class="meta">${articles.length} article(s) in articles_en/</p>
  <ul class="article-list">${items || "<li>No articles found. Run <code>npm run translate</code> first.</li>"}</ul>
</body></html>`;
}

async function renderArticle(slug: string): Promise<string | null> {
  const filePath = path.join(ARTICLES_EN_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  const html = await marked(content);

  const tags = data.tags
    ? String(data.tags)
        .split(",")
        .map((t: string) => `<span class="tag">#${t.trim()}</span>`)
        .join(" ")
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${data.title || slug} - dev.to Preview</title><style>${CSS}</style></head>
<body>
  <p><a href="/">&larr; Back to list</a></p>
  <h1>${data.title || slug}</h1>
  <div class="meta">
    ${tags}
    ${data.canonical_url ? `<br>Canonical: <a href="${data.canonical_url}">${data.canonical_url}</a>` : ""}
  </div>
  ${html}
</body></html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderIndex());
    return;
  }

  const match = url.pathname.match(/^\/articles\/(.+)$/);
  if (match) {
    const html = await renderArticle(match[1]);
    if (html) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`dev.to preview server running at http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop");
});
