---
title: "Zenn と dev.to に同時公開するブログ基盤を作った"
emoji: "🏗️"
type: "tech"
topics: ["Zenn", "devto", "ClaudeCode", "GitHubActions"]
published: false
---

この記事は、いま読んでいるこのブログの基盤そのものについての記事である。

Zenn で日本語記事を書きつつ、同じ内容を英語に翻訳して dev.to にも公開したい。手動で翻訳するのは面倒だし、プラットフォームごとに Markdown の方言が微妙に違う。それを全部自動化するブログリポジトリを作ったので、仕組みを紹介する。ソースコードは以下のリポジトリで公開している。

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

記事を書いて `/sync` を実行し、`git push` するだけで 2 つのプラットフォームに公開できる。

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

このリポジトリの中心となる機能が `/sync` コマンドで動く双方向翻訳同期だ。これは Claude Code のカスタムスキルとして実装されており、変更検出・翻訳・構文変換・状態更新をワンコマンドで行う。

### 変更検出の仕組み

各記事の内容を SHA-256 でハッシュ化し、`.sync-state.json` に保存している。`/sync` を実行すると、まず `sync-detect.ts` が現在のハッシュと保存済みハッシュを比較して、どちら側が変更されたかを判定する。

| 状態 | アクション |
|------|-----------|
| 日本語のみ存在 | 全文翻訳 JP → EN |
| 英語のみ存在 | 全文翻訳 EN → JP |
| 日本語が変更された | 差分同期 JP → EN |
| 英語が変更された | 差分同期 EN → JP |
| 両方変更された | コンフリクト → `--prefer ja` or `--prefer en` で解決 |
| 変更なし | スキップ |

### 翻訳パイプライン

翻訳は 3 ステップで行われる。

**Step 1: 変更検出**（`sync-detect.ts`）

ファイルのハッシュを比較し、翻訳が必要な記事とその方向を JSON で出力する。

**Step 2: 翻訳**（Claude Code 自身）

Claude Code がソース記事を読み、本文を翻訳してターゲットファイルに書き出す。翻訳時のルールとして、コードブロック・インラインコード・URL・コマンド名はそのまま保持し、プラットフォーム固有の Markdown 構文（`:::message`、`$$` など）も変換せずに残す。構文変換は次のステップで行うためだ。

**Step 3: 後処理**（`sync-apply.ts`）

翻訳された本文に対して以下の処理を行う。

1. Zenn ↔ dev.to の構文変換（後述）
2. ターゲット側のフロントマター生成
3. `.sync-state.json` の更新

翻訳と構文変換を別ステップに分離したことで、翻訳プロンプトがシンプルになり、構文変換のロジックを正規表現で確実に処理できるようになった。

### 使い方

```
/sync                    # 全記事を同期
/sync my-article         # 特定の記事だけ同期
/sync --prefer ja        # コンフリクトを日本語優先で解決
/sync --prefer en        # コンフリクトを英語優先で解決
```

変更検出だけを行いたい場合は npm スクリプトを直接実行できる。

```bash
npm run sync                    # 全記事の変更検出（JSON 出力）
npm run sync -- my-article      # 特定の記事の変更検出
```

### 初期設計との違い：Claude API から Claude Code へ

初期設計では Claude API を直接呼び出す TypeScript スクリプト（`sync.ts` + `api.ts`）で翻訳を行っていた。しかし、以下の理由で Claude Code のスキルに移行した。

- **API キー管理が不要**: Claude Code 自身が翻訳するため、`.env` に `ANTHROPIC_API_KEY` を設定する必要がない
- **翻訳品質の向上**: Claude Code は記事全体のコンテキストを把握した上で翻訳できる。API 経由だとプロンプトの長さ制約やトークンコストの最適化を考慮する必要があった
- **デバッグが容易**: 翻訳結果をその場で確認・修正でき、再実行も `/sync` 一発で済む
- **並列実行**: Claude Code のバックグラウンドエージェントを使えば、複数記事の翻訳を並列実行できる

移行に伴い、`sync.ts` と `api.ts` は削除され、変更検出（`sync-detect.ts`）と後処理（`sync-apply.ts`）のスクリプトに再構成された。

## Zenn ↔ dev.to の構文変換

Zenn と dev.to は同じ Markdown ベースだが、独自拡張の構文が異なる。以下に主要な変換を示す。

### メッセージボックス

```markdown
<!-- Zenn -->
:::message
情報メッセージ
:::

<!-- dev.to -->
> ℹ️ 情報メッセージ
```

### アコーディオン

```markdown
<!-- Zenn -->
:::details タイトル
折りたたみコンテンツ
:::

<!-- dev.to -->
{% details タイトル %}
折りたたみコンテンツ
{% enddetails %}
```

### 数式

```markdown
<!-- Zenn：ブロック数式 -->
$$
e^{i\pi} + 1 = 0
$$

<!-- dev.to：ブロック数式 -->
{% katex %}
e^{i\pi} + 1 = 0
{% endkatex %}
```

```markdown
<!-- Zenn：インライン数式 -->
$e^{i\pi} + 1 = 0$

<!-- dev.to：インライン数式 -->
{% katex inline %}e^{i\pi} + 1 = 0{% endkatex %}
```

### コードブロックのファイル名

````markdown
<!-- Zenn -->
```js:filename.js
const x = 1;
```

<!-- dev.to -->
```js
// filename.js
const x = 1;
```
````

### 画像の幅指定

```markdown
<!-- Zenn -->
![alt](url =500x)

<!-- dev.to -->
<img src="url" alt="alt" width="500">
```

### 脚注

```markdown
<!-- Zenn -->
本文[^1]。
[^1]: 脚注の内容

<!-- dev.to -->
本文[^1]。
---
**Notes:**
1. 脚注の内容
```

これらの変換は正規表現ベースで実装しており、双方向（Zenn → dev.to、dev.to → Zenn）に対応している。

### フロントマターの変換

フロントマターもプラットフォームごとに形式が異なる。

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

dev.to 側には `canonical_url` を自動で付与し、Zenn の記事を正規 URL として指定している。これにより SEO 上の重複コンテンツ問題を回避できる。また、dev.to のタグは最大 4 つという制限があるため、Zenn の topics から先頭 4 つを切り出して使っている。

## プレビュー

### Zenn プレビュー

Zenn CLI の組み込みプレビューサーバーを使う。

```bash
npm run preview  # localhost:18000
```

### dev.to プレビュー

dev.to 向けの記事をプレビューするために、シンプルな HTTP サーバーを自前で実装した。`articles_en/` 内の Markdown を `marked` ライブラリでレンダリングし、dev.to 風の見た目で表示する。

```bash
npm run preview:devto  # localhost:13000
```

ポート番号は従来の 8000 / 3000 に 10000 を足した 18000 / 13000 を使っている。Next.js や Express などの開発サーバーとポートが衝突しないようにするためだ。

## GitHub Actions による自動公開

Zenn には記事を公開するための API が存在しない。Zenn の公開メカニズムは、連携した GitHub リポジトリを Zenn 側がポーリングし、`articles/` の内容を直接取り込むというプル型の仕組みだ。そのため、Zenn 側の公開処理はこのリポジトリには一切含まれていない。`git push` すれば Zenn が勝手に拾ってくれる。

一方、dev.to は REST API（`POST /api/articles`、`PUT /api/articles/{id}`）を公開しているため、GitHub Actions から能動的に記事を作成・更新できる。`articles_en/` 配下のファイルが `main` ブランチに push されると、GitHub Actions が起動する。

```yaml
on:
  push:
    branches: [main]
    paths: ['articles_en/**']
```

ワークフローは以下のステップで構成される。

1. **バリデーション**: 日本語記事と英語記事の `published` ステータスが一致しているかチェックする。片方だけ `published: true` になっていると公開事故になるため、この不整合を検出してワークフローを停止する
2. **dev.to API で公開**: 英語記事を dev.to API で公開する。初回は `POST /articles` で新規作成し、2 回目以降は `PUT /articles/{id}` で更新する
3. **マッピング更新**: 記事の slug と dev.to の記事 ID の対応を `.devto-mapping.json` に保存し、コミットする。これにより次回以降は同じ記事を更新できる

## 予約公開

特定の日付に記事を自動公開する仕組みも用意した。両方の記事のフロントマターに `scheduled_publish_date` を追加する。

```yaml
published: false
scheduled_publish_date: "2026-03-15"
```

GitHub Actions の cron ジョブが毎日 00:05 JST に起動し、予約日を過ぎた記事を自動で `published: true` に書き換え、dev.to API で英語版を公開し、コミット・プッシュする。Zenn 側は GitHub からの自動取り込みで公開される。

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

ローカルで予約状況を確認するには以下のコマンドを使う。

```bash
npm run schedule:check
```

### なぜ Zenn ネイティブの予約投稿を使わないのか

Zenn には `published: true` と `published_at` を組み合わせたネイティブの予約投稿機能がある。しかし、この仕組みは Zenn 側で `published: true` を先に設定する必要がある。一方、dev.to には同等の機能がなく、`published: true` にした瞬間に即座に公開されてしまう。

つまり、Zenn のネイティブ予約を使うと、Zenn 側は `published: true`、dev.to 側は `published: false` という不一致状態になり、バリデーションスクリプト（`validate-published.ts`）がエラーを出す。両プラットフォームの `published` ステータスを常に一致させるという設計原則を維持するため、独自の `scheduled_publish_date` フィールドで統一管理し、cron で両方同時に公開する方式を採用した。

## Claude Code スキル

このリポジトリには Claude Code 用のスキルファイルが含まれている。

| スキル | トリガー | 説明 |
|--------|----------|------|
| `sync` | `/sync` コマンド | 双方向翻訳同期（変更検出・翻訳・構文変換・状態更新） |
| `zenn-syntax` | `articles/` 配下のファイル編集時 | Zenn Markdown 記法リファレンス |
| `devto-syntax` | `articles_en/` 配下のファイル編集時 | dev.to Liquid タグ記法リファレンス |

`zenn-syntax` と `devto-syntax` は、対応するディレクトリのファイルを編集するときに自動的に読み込まれる。これにより、Claude Code で記事を書くときにプラットフォーム固有の構文を間違えることなく使える。

また、`.claude/settings.json` で同期スクリプトの実行と記事ファイルの読み書きの権限を自動許可している。これにより、バックグラウンドエージェントで複数記事を並列翻訳する際にも、権限の承認プロンプトで止まることがない。

## まとめ

このリポジトリを作ったことで、以下のワークフローが実現できた。

1. `articles/` に日本語で記事を書く
2. `/sync` で英語版を生成する
3. `npm run preview` / `npm run preview:devto` でプレビューする
4. `git push` で Zenn と dev.to の両方に公開される

翻訳を Claude Code のスキルとして実装したことで、API キーの管理が不要になり、翻訳結果をその場で確認・修正できるようになった。差分同期の仕組みがあるので、翻訳結果を手動で微調整しても次の同期で上書きされない。全体として、日本語で記事を書くという本来の作業に集中できるようになった。
