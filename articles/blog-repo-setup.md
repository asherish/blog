---
title: "Zenn と dev.to に同時公開するブログ基盤を作った"
emoji: "🏗️"
type: "tech"
topics: ["Zenn", "devto", "ClaudeCode", "GitHubActions"]
published: true
---

この記事は、Zenn（日本語）と dev.to（英語）の 2 つのプラットフォームに、1 回の `git push` で同時に公開されています。その仕組みを紹介します。

[Zenn](https://zenn.dev/) は日本で人気のある技術ブログプラットフォームで、dev.to に似ています。Zenn で日本語記事を書きつつ、同じ内容を英語に翻訳して dev.to にも公開したいと考えました。しかし、手動で翻訳するのは面倒ですし、機械翻訳では「翻訳された文章」の硬さが残ります。さらに、2 つのプラットフォームは Markdown の方言が微妙に異なります。そこで、ワークフロー全体を自動化しました。ソースコードは以下のリポジトリで公開しています。

https://github.com/asherish/blog

## やりたかったこと

- 日本語で記事を書いたら、英語版が自動生成される
- 単なる逐語訳ではなく、英語ネイティブが書いたような自然な記事にする
- Zenn と dev.to の Markdown 構文差異を自動変換する
- `git push` するだけで両方のプラットフォームに公開される
- ローカルで両プラットフォームのプレビューができる

## 全体のアーキテクチャ

```
日本語で記事を書く
  ↓
/translate               ← Claude Code が日本語版を英語にネイティブ・リライト＋構文変換＋状態更新
  ↓
articles_en/ が生成される
  ↓
ローカルプレビュー        ← Zenn (localhost:18000) + dev.to (localhost:13000)
  ↓
git push
  ├→ Zenn 自動公開       （GitHub 連携）
  └→ GitHub Actions      → バリデーション → dev.to API で英語版を公開
```

記事を書いて `/translate` を実行し、`git push` するだけで 2 つのプラットフォームに公開できます。

## ディレクトリ構成

```
blog/
├── .claude/
│   ├── settings.json               # translate スクリプトの権限自動許可
│   └── skills/
│       ├── zenn-syntax.md          # Zenn 記法リファレンス
│       ├── devto-syntax.md         # dev.to 記法リファレンス
│       └── translate/SKILL.md      # 片方向 JP→EN ローカライズスキル (/translate)
├── .github/workflows/
│   ├── publish-to-devto.yml        # dev.to 自動公開ワークフロー
│   └── scheduled-publish.yml       # 予約公開 cron ワークフロー
├── articles/                       # Zenn 記事（日本語、ソース）
├── articles_en/                    # dev.to 記事（英語、生成物）
├── books/                          # Zenn books
├── scripts/
│   ├── translate-detect.ts         # 変更検出スクリプト（JSON 出力）
│   ├── translate-apply.ts          # ローカライズ後処理スクリプト
│   ├── sync/
│   │   ├── convert.ts              # Zenn → dev.to 構文変換
│   │   └── state.ts                # 状態の永続化
│   ├── publish-to-devto.ts         # dev.to 公開スクリプト
│   ├── process-scheduled.ts        # 予約公開処理スクリプト
│   ├── validate-published.ts       # 公開前バリデーション
│   └── preview-devto.ts            # dev.to プレビューサーバー
├── .sync-state.json                # 記事ごとの日本語ソースのハッシュ追跡
├── .devto-mapping.json             # dev.to 記事 ID の対応表
├── package.json
└── tsconfig.json
```

## 日本語から英語へのローカライズ

このリポジトリの中心は `/translate` コマンドです。これは [Claude Code](https://docs.anthropic.com/en/docs/claude-code) のカスタムスキルで、変更検出・ネイティブ・リライト・構文変換・状態更新をワンコマンドで実行します。日本語版を唯一のソース・オブ・トゥルースとし、英語版はそこから生成される成果物として扱う**片方向**の設計です。

### 変更検出

各記事は日本語版を SHA-256 でハッシュ化し、`.sync-state.json` で追跡しています。`/translate` を実行すると、現在のハッシュと保存済みハッシュを比較して、英語版を作り直す必要があるかを判定します。

| 状態 | アクション |
|------|-----------|
| 英語版がまだ無い | 全面リライト JP → EN |
| 日本語版が変更された | 既存の英語版を改修（変更が大きければ全面リライト） |
| 日本語版が変更なし | スキップ |
| 日本語ソースの無い英語版 | orphan として警告（書き換えない） |

### 3 ステップのパイプライン

**Step 1 — 検出**（`translate-detect.ts`）: 日本語版のハッシュを比較し、ローカライズが必要な記事とその理由（`new` / `update`）を JSON で出力します。

**Step 2 — ローカライズ**（Claude Code）: 日本語ソース（と既存の英語版があればそれも）を読み、既存英語の改修で済むか全面リライトすべきかを判断してから、英語の本文をターゲットファイルに書き出します。逐語訳ではなく、英語ネイティブの技術ブロガーが書いたように再構成します。ただしコード・コマンド・数値・事実は一切変えません。プラットフォーム固有の構文（`:::message`、`$$` など）はそのまま残し、変換は次のステップで行います。

**Step 3 — 後処理**（`translate-apply.ts`）: Zenn → dev.to の構文を正規表現で変換し、dev.to 側のフロントマターを生成し、`.sync-state.json` を更新します。

リライトと構文変換を分離することで、リライトのプロンプトはコンテンツに集中でき、機械的な変換は正規表現で確実に処理できます。

### 逐語訳ではなくネイティブ・リライト

初期バージョンは日本語と英語の双方向同期で、文単位で対応づける逐語訳に近いものでした。しかしそれだと、意味は正確でも「翻訳された文章」特有の硬さが残ります。そこで、英語版は日本語版を起点に**自然な英語へ書き直す**方針に変えました。一文一義の対応にはこだわらず、段落の切り方や言い回しを英語技術ブログの作法に寄せます。

その代わり、英語版は成果物と割り切ります。内容の修正は必ず日本語版で行い、`/translate` で英語版を作り直します。英語版を直接手で編集しても次回の実行で上書きされるためです。双方向に編集できる柔軟さは失いますが、コンフリクト解決が不要になり、設計はずっとシンプルになりました。

### 使い方

```bash
/translate               # 変更のあった記事をすべてローカライズ
/translate my-article    # 特定の記事だけローカライズ
```

変更検出だけを行うこともできます。

```bash
npm run translate                    # 全記事（JSON 出力）
npm run translate -- my-article      # 特定の記事
```

### なぜ Claude API ではなく Claude Code なのか

初期バージョンでは TypeScript（`sync.ts` + `api.ts`）から直接 Claude API を呼び出していました。Claude Code のスキルに切り替えた理由は以下の通りです。

- **API キー不要** — Claude Code 自身がローカライズするため、`.env` に `ANTHROPIC_API_KEY` を設定する必要がありません
- **品質の向上** — 記事全体のコンテキストを把握した上で自然な英語に書き直せ、プロンプト長の制約も回避できます
- **インタラクティブなデバッグ** — 結果をその場で確認・修正でき、`/translate` で再実行できます
- **並列実行** — Claude Code のバックグラウンドエージェントで複数記事を同時にローカライズできます

## Zenn → dev.to の構文変換

両プラットフォームとも Markdown ベースですが、独自の拡張構文が異なります。コンバーターは Zenn 記法を dev.to 記法へ自動変換します。

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

すべての変換は正規表現ベースで、Zenn → dev.to の片方向に対応しています。

### フロントマター

フロントマターもプラットフォームごとに形式が異なります。dev.to 側は日本語ソースのフロントマターから自動生成されます。

```yaml
# Zenn（ソース）
---
title: "記事タイトル"
emoji: "🐙"
type: "tech"
topics: ["topic1", "topic2"]
published: true
---

# dev.to（生成物）
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
| `translate` | `/translate` コマンド | 片方向 JP→EN ローカライズ |
| `zenn-syntax` | `articles/` の編集時 | Zenn 記法リファレンスを読み込み |
| `devto-syntax` | `articles_en/` の編集時 | dev.to 記法リファレンスを読み込み |

構文スキルは対応するディレクトリのファイルを編集するときに自動的に読み込まれ、Claude Code が常に正しいプラットフォームの Markdown を使えるようにします。`.claude/settings.json` でスクリプト実行とファイル I/O の権限を事前に許可しており、バックグラウンドエージェントで並列ローカライズする際にも承認プロンプトで止まりません。

## まとめ

普段のワークフローはこのようになっています。

1. `articles/` に日本語で記事を書く
2. `/translate` で英語版を生成する
3. `npm run preview` / `npm run preview:devto` でプレビューする
4. `git push` で Zenn と dev.to の両方に公開される

Claude Code がローカライズを直接担当するため、API キーの管理が不要で、結果をその場で確認・修正できます。英語版は日本語版から生成される成果物として扱い、修正は常に日本語版で行います。日本語で記事を書くだけで、あとはすべて自動化されています。
