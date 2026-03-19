---
title: "Zenn と dev.to に同時公開するブログ基盤を作った"
emoji: "🏗️"
type: "tech"
topics: ["Zenn", "devto", "ClaudeCode", "GitHubActions"]
published: false
scheduled_publish_date: "2026-03-21"
---

この記事は、Zenn（日本語）と dev.to（英語）の 2 つのプラットフォームに、1 回の `git push` で同時に公開されています。その仕組みを紹介します。

[Zenn](https://zenn.dev/) は日本で人気のある技術ブログプラットフォームで、dev.to に似ています。Zenn で日本語記事を書きつつ、同じ内容を英語に翻訳して dev.to にも公開したいと考えました。しかし、手動で翻訳するのは面倒ですし、2 つのプラットフォームは Markdown の方言が微妙に異なります。そこで、ワークフロー全体を自動化しました。ソースコードは以下のリポジトリで公開しています。

https://github.com/asherish/blog

## やりたかったこと

- 日本語で記事を書いたら、英語版が自動生成される（逆も可）
- Zenn と dev.to の Markdown 構文差異を自動変換する
- `git push` するだけで両方のプラットフォームに公開される
- ローカルで両プラットフォームのプレビューができる

## 全体のアーキテクチャ

```
記事を書く（日本語 or 英語）
  ↓
/sync                    ← Claude Code が翻訳・構文変換・状態更新を実行
  ↓
articles/ + articles_en/ が更新される
  ↓
ローカルプレビュー        ← Zenn (localhost:18000) + dev.to (localhost:13000)
  ↓
git push
  ├→ Zenn 自動公開       （GitHub 連携）
  └→ GitHub Actions      → バリデーション → dev.to API で英語版を公開
```

記事を書いて `/sync` を実行し、`git push` するだけで 2 つのプラットフォームに公開できます。

## ディレクトリ構成

```
blog/
├── .claude/
│   ├── settings.json               # 同期スクリプトの権限自動許可
│   └── skills/
│       ├── zenn-syntax.md          # Zenn 記法リファレンス
│       ├── devto-syntax.md         # dev.to 記法リファレンス
│       └── sync/SKILL.md           # 双方向翻訳同期スキル (/sync)
├── .github/workflows/
│   ├── publish-to-devto.yml        # dev.to 自動公開ワークフロー
│   └── scheduled-publish.yml       # 予約公開 cron ワークフロー
├── articles/                       # Zenn 記事（日本語）
├── articles_en/                    # dev.to 記事（英語、翻訳生成）
├── books/                          # Zenn books
├── scripts/
│   ├── sync-detect.ts              # 変更検出スクリプト（JSON 出力）
│   ├── sync-apply.ts               # 翻訳後処理スクリプト
│   ├── sync/
│   │   ├── convert.ts              # Zenn ↔ dev.to 構文変換
│   │   └── state.ts                # 同期状態の永続化
│   ├── publish-to-devto.ts         # dev.to 公開スクリプト
│   ├── process-scheduled.ts        # 予約公開処理スクリプト
│   ├── validate-published.ts       # 公開前バリデーション
│   └── preview-devto.ts            # dev.to プレビューサーバー
├── .sync-state.json                # 記事ごとのハッシュ追跡
├── .devto-mapping.json             # dev.to 記事 ID の対応表
├── package.json
└── tsconfig.json
```

## 双方向翻訳同期

このリポジトリの中心は `/sync` コマンドです。これは [Claude Code](https://docs.anthropic.com/en/docs/claude-code) のカスタムスキルで、変更検出・翻訳・構文変換・状態更新をワンコマンドで実行します。

### 変更検出

各記事は SHA-256 でハッシュ化され、`.sync-state.json` で追跡されています。`/sync` を実行すると、現在のハッシュと保存済みハッシュを比較して、どちら側が変更されたかを判定します。

| 状態 | アクション |
|------|-----------|
| 日本語のみ存在 | 全文翻訳 JP → EN |
| 英語のみ存在 | 全文翻訳 EN → JP |
| 日本語が変更された | 差分同期 JP → EN |
| 英語が変更された | 差分同期 EN → JP |
| 両方変更された | コンフリクト → `--prefer ja` or `--prefer en` で解決 |
| 変更なし | スキップ |

### 3 ステップのパイプライン

**Step 1 — 検出**（`sync-detect.ts`）: ハッシュを比較し、翻訳が必要な記事とその方向を JSON で出力します。

**Step 2 — 翻訳**（Claude Code）: ソース記事を読み、翻訳した本文をターゲットファイルに書き出します。コードブロック・インラインコード・URL・コマンド名はそのまま保持します。プラットフォーム固有の構文（`:::message`、`$$` など）も変換せずに残します。構文変換は次のステップで行うためです。

**Step 3 — 後処理**（`sync-apply.ts`）: Zenn ↔ dev.to の構文を正規表現で変換し、ターゲット側のフロントマターを生成し、`.sync-state.json` を更新します。

翻訳と構文変換を分離することで、翻訳プロンプトがシンプルになり、機械的な変換は正規表現で確実に処理できます。

### 使い方

```bash
/sync                    # 全記事を同期
/sync my-article         # 特定の記事だけ同期
/sync --prefer ja        # コンフリクトを日本語優先で解決
/sync --prefer en        # コンフリクトを英語優先で解決
```

変更検出だけを行うこともできます。

```bash
npm run sync                    # 全記事（JSON 出力）
npm run sync -- my-article      # 特定の記事
```

### なぜ Claude API ではなく Claude Code なのか

初期バージョンでは TypeScript（`sync.ts` + `api.ts`）から直接 Claude API を呼び出していました。Claude Code のスキルに切り替えた理由は以下の通りです。

- **API キー不要** — Claude Code 自身が翻訳するため、`.env` に `ANTHROPIC_API_KEY` を設定する必要がありません
- **翻訳品質の向上** — 記事全体のコンテキストを把握した翻訳が可能で、プロンプト長の制約を回避できます
- **インタラクティブなデバッグ** — 翻訳結果をその場で確認・修正でき、`/sync` で再実行できます
- **並列実行** — Claude Code のバックグラウンドエージェントで複数記事を同時に翻訳できます

## Zenn ↔ dev.to の構文変換

両プラットフォームとも Markdown ベースですが、独自の拡張構文が異なります。コンバーターは以下の変換を自動で処理します。

| 機能 | Zenn | dev.to |
|------|------|--------|
| 情報ボックス | `:::message ... :::` | `> ℹ️ ...` |
| 警告ボックス | `:::message alert ... :::` | `> ⚠️ ...` |
| アコーディオン | `:::details Title ... :::` | `{% details Title %} ... {% enddetails %}` |
| ブロック数式 | `$$ ... $$` | `{% katex %} ... {% endkatex %}` |
| インライン数式 | `$...$` | `{% katex inline %}...{% endkatex %}` |
| コードファイル名 | `` ```js:app.js `` | `` ```js `` + `// app.js` コメント |
| 画像幅指定 | `![alt](url =500x)` | `<img src="url" alt="alt" width="500">` |
| 脚注 | `[^1]: text` | `**Notes:** 1. text` セクション |

すべての変換は正規表現ベースで、双方向に対応しています。

### フロントマター

フロントマターもプラットフォームごとに形式が異なります。

```yaml
# Zenn
---
title: "記事タイトル"
emoji: "🐙"
type: "tech"
topics: ["topic1", "topic2"]
published: true
---

# dev.to
---
title: "Article Title"
published: true
tags: topic1, topic2
canonical_url: https://zenn.dev/asherish/articles/slug
---
```

dev.to 側には `canonical_url` が自動で付与され、Zenn 記事を正規 URL として指定します。これにより SEO の重複コンテンツ問題を回避できます。dev.to のタグは最大 4 つのため、Zenn の topics から先頭 4 つのみ使用します。

## ローカルプレビュー

両プラットフォームをローカルでプレビューできます。

```bash
npm run preview        # Zenn  → localhost:18000
npm run preview:devto  # dev.to → localhost:13000
```

Zenn プレビューは公式の Zenn CLI を使用します。dev.to プレビューは `articles_en/` の Markdown を `marked` でレンダリングする軽量 HTTP サーバーです。ポート番号は通常の 8000 / 3000 に 10,000 を足して、Next.js や Express の開発サーバーとの衝突を避けています。

## GitHub Actions による公開

**Zenn** には公開 API がありません。連携した GitHub リポジトリをポーリングし、`articles/` を自動で取り込みます。`git push` するだけで完了です。

**dev.to** は REST API があるため、GitHub Actions で処理します。`main` ブランチへの push で `articles_en/` が変更された場合に起動します。

```yaml
on:
  push:
    branches: [main]
    paths: ['articles_en/**']
```

ワークフローは 3 つのステップで構成されています。

1. **バリデーション** — 日本語記事と英語記事の `published` ステータスが一致しているかチェックします。不一致（片方が `true`、もう片方が `false`）は公開事故の原因になるため、ワークフローを停止します。
2. **公開** — dev.to API で `POST /api/articles`（初回）または `PUT /api/articles/{id}`（更新）を呼び出します。
3. **マッピング保存** — slug と dev.to 記事 ID の対応を `.devto-mapping.json` にコミットし、次回以降の更新に使用します。

## 予約公開

特定の日付に公開したい場合は、両方の記事のフロントマターに `scheduled_publish_date` を追加します。

```yaml
published: false
scheduled_publish_date: "2026-03-15"
```

GitHub Actions の cron が毎日 00:05 JST に起動し、予約日を過ぎた記事の `published` を `true` に書き換え、dev.to API で英語版を公開し、コミットします。Zenn 側は自動で変更を取り込みます。

```
scheduled-publish.yml (毎日 00:05 JST cron)
  ↓
process-scheduled.ts
  ├─ 予約日 ≤ 今日 → published: true に変更
  ↓
publish-to-devto.ts
  ├─ dev.to API で英語版を公開
  ↓
コミット & プッシュ
  └→ Zenn 自動公開（GitHub 連携）
```

ローカルで予約状況を確認するには `npm run schedule:check` を使います。

### なぜ Zenn ネイティブの予約投稿を使わないのか

Zenn には `published: true` と `published_at` を組み合わせた予約投稿機能がありますが、Zenn 側で先に `published: true` にする必要があります。一方、dev.to には同等の機能がなく、`published: true` にした瞬間に即公開されます。Zenn のネイティブ予約を使うと 2 つのプラットフォームの状態が不一致になり、バリデーションスクリプトがエラーを出します。そこで、独自の `scheduled_publish_date` フィールドで統一管理し、cron で両方同時に公開する方式を採用しました。

## Claude Code スキル

リポジトリには 3 つの Claude Code スキルファイルが含まれています。

| スキル | トリガー | 機能 |
|--------|----------|------|
| `sync` | `/sync` コマンド | 双方向翻訳同期 |
| `zenn-syntax` | `articles/` の編集時 | Zenn 記法リファレンスを読み込み |
| `devto-syntax` | `articles_en/` の編集時 | dev.to 記法リファレンスを読み込み |

構文スキルは対応するディレクトリのファイルを編集するときに自動的に読み込まれ、Claude Code が常に正しいプラットフォームの Markdown を使えるようにします。`.claude/settings.json` でスクリプト実行とファイル I/O の権限を事前に許可しており、バックグラウンドエージェントで並列翻訳する際にも承認プロンプトで止まりません。

## まとめ

普段のワークフローはこのようになっています。

1. `articles/` に日本語で記事を書く
2. `/sync` で英語版を生成する
3. `npm run preview` / `npm run preview:devto` でプレビューする
4. `git push` で Zenn と dev.to の両方に公開される

Claude Code が翻訳を直接担当するため、API キーの管理が不要で、翻訳結果をその場で確認・修正できます。差分同期の仕組みにより、翻訳結果を手動で微調整しても次の同期で上書きされません。日本語で記事を書くだけで、あとはすべて自動化されています。
