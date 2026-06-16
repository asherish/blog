---
title: "Kaggle コンペ通知ボットを作った"
emoji: "🔔"
type: "tech"
topics: ["Kaggle", "Python", "GitHubActions", "Discord"]
published: false
---

Kaggle のコンペティション情報を自動で取得し、Email・Slack・Discord に通知するツール「kaggle-dingdong」を作りました。GitHub Actions で毎日定時に実行され、新しいコンペが公開されると通知が届く仕組みです。

https://github.com/asherish/kaggle-dingdong

## なぜ作ったか

Kaggle のコンペティションページを毎日チェックするのは面倒です。特に Featured コンペは参加期限があるため、見逃すと機会を失います。RSSフィードや公式の通知機能もありますが、自分が使っている通知チャネル（Discord や Slack）に直接届いてほしいと思い、自作しました。

## 技術スタック

- **Python 3.13**
- **uv** — パッケージマネージャー兼ビルドツール（Astral製）
- **Kaggle Python SDK v2.0.0** — コンペ情報の取得
- **GitHub Actions** — 毎日 09:00 UTC に自動実行
- **pytest** — テスト

通知チャネルは3種類に対応しています。

| チャネル | 方式 | フォーマット |
|---|---|---|
| Email | SMTP | HTML（カード形式） |
| Slack | Incoming Webhook | Block Kit |
| Discord | Webhook | Rich Embed |

## アーキテクチャ

```
GitHub Actions (cron: 毎日 09:00 UTC)
  ↓
Kaggle API でコンペ一覧を取得
  ↓
config.json のフィルタ条件で絞り込み
  ↓
送信済み履歴と突合し、未通知のコンペを抽出
  ↓
設定済みのチャネルに通知を送信
  ↓
送信済み履歴を更新（最大200件）
```

プロジェクト構成は以下のとおりです。

```
kaggle-dingdong/
├── src/kaggle_dingdong/
│   ├── __main__.py        # エントリポイント
│   ├── config.py          # 設定読み込み
│   ├── competitions.py    # Kaggle API からコンペ取得・フィルタ
│   ├── email_sender.py    # Email 通知
│   ├── slack_sender.py    # Slack 通知
│   ├── discord_sender.py  # Discord 通知
│   └── history.py         # 送信済み履歴管理
├── tests/                 # pytest テスト
├── config.json            # フィルタ設定
└── .github/workflows/
    └── notify.yml         # GitHub Actions ワークフロー
```

## 実装のポイント

### コンペの取得とフィルタリング

Kaggle SDK を使ってコンペ一覧を取得します。このとき、デフォルトの並び順に加えて `recentlyCreated`（新着順）でも取得し、タイトルで重複排除しています。デフォルトの並び順だけだと、公開直後のコンペが後ろのページに埋もれて取りこぼすことがあるためです。

```python
from kaggle.api.kaggle_api_extended import KaggleApi

def fetch_competitions(max_pages: int = 3) -> list[dict]:
    api = KaggleApi()
    api.authenticate()

    seen_titles: set[str] = set()
    competitions: list[dict] = []
    # Fetch with both the default and 'recentlyCreated' sort orders so that
    # newly launched competitions are not missed.
    for sort_by in ["", "recentlyCreated"]:
        for page in range(1, max_pages + 1):
            kwargs: dict = {"page": page}
            if sort_by:
                kwargs["sort_by"] = sort_by
            response = api.competitions_list(**kwargs)
            if response is None or not response.competitions:
                break
            for c in response.competitions:
                if c.title in seen_titles:
                    continue
                seen_titles.add(c.title)
                competitions.append({
                    "title": c.title,
                    "url": c.url or f"https://www.kaggle.com/competitions/{c.ref}",
                    "category": c.category,
                    "reward": c.reward,
                    "deadline": str(c.deadline),
                    "tags": [t.name for t in (c.tags or [])],
                })
    return competitions
```

取得したコンペは、別関数 `filter_competitions` でカテゴリ・タグ・送信済み履歴の3条件で絞り込みます。

`config.json` でフィルタ条件を指定します。

```json
{
  "filters": {
    "category": ["Featured", "Research"],
    "tags": []
  },
  "max_pages": 3,
  "history_limit": 200
}
```

`category` にカテゴリ名を並べると、それらに該当するコンペだけが通知されます（既定では `Featured` と `Research`）。空配列 `[]` にするとすべてのカテゴリが対象になります。`tags` も同様で、`["tabular", "nlp"]` のように指定すると、いずれかのタグを含むコンペだけが通知されます。

### 送信済み履歴で重複を防止

通知済みのコンペタイトルを JSON ファイルに保存し、次回以降の実行で重複通知を防ぎます。

```python
def save_history(existing: list[str], new_titles: list[str], path: Path, limit: int = 200):
    combined = existing + new_titles
    trimmed = combined[-limit:]
    path.write_text(json.dumps(trimmed, indent=2, ensure_ascii=False))
```

履歴は最大200件に制限しており、古いものから自動的に削除されます。GitHub Actions ではキャッシュ機能を使って `sent_competitions.json` を実行間で永続化しています。

### Discord の Embed 制限への対応

Discord の Webhook API は1メッセージあたり最大10個の Embed しか送信できません。コンペ数が10を超える場合は、自動的にチャンク分割して複数メッセージとして送信します。

```python
def send_discord(competitions: list[dict], webhook_url: str):
    embeds = build_discord_embeds(competitions)
    # Discord allows max 10 embeds per message
    for i in range(0, len(embeds), 10):
        chunk = embeds[i:i + 10]
        payload = {"embeds": chunk}
        if i == 0:
            payload["content"] = "**New Kaggle Competitions**"
        # send via webhook...
```

Slack にも同様の制限（1メッセージ50ブロック）があるため、24コンペごとにチャンク分割しています。

### 通知チャネルの自動検出

環境変数が設定されているチャネルだけが有効化されます。例えば、`DISCORD_WEBHOOK_URL` だけ設定すれば Discord のみに通知されます。3チャネルすべてを設定することも、1つだけ設定することも可能です。

## GitHub Actions でのスケジュール実行

`.github/workflows/notify.yml` で毎日 09:00 UTC に自動実行されるように設定しています。

```yaml
on:
  schedule:
    - cron: "0 9 * * *"
  workflow_dispatch:
```

ポイントは送信済み履歴のキャッシュです。GitHub Actions はジョブごとにクリーンな環境で実行されるため、前回の履歴を引き継ぐために `actions/cache` を使っています。ここでは復元と保存を別ステップに分けるため、`actions/cache/restore` と `actions/cache/save` を使い分けています。通知の送信中にジョブが失敗しても履歴を必ず残せるよう、保存側は `if: always()` を付けています。

```yaml
# 実行前: 直近の履歴を復元
- name: Restore history cache
  uses: actions/cache/restore@v5.0.3
  with:
    path: sent_competitions.json
    key: sent-competitions-${{ github.run_id }}
    restore-keys: sent-competitions-

# ...（uv sync と通知ジョブの実行）...

# 実行後: 更新した履歴を保存（失敗時も保存する）
- name: Save history cache
  uses: actions/cache/save@v5.0.3
  if: always()
  with:
    path: sent_competitions.json
    key: sent-competitions-${{ github.run_id }}
```

`key` にランIDを含めることで毎回新しいキャッシュが作成され、`restore-keys` のプレフィックスマッチで直近のキャッシュが復元されます。なお、ワークフロー内で参照しているサードパーティ製アクションはすべてコミット SHA でピン留めしており、タグ書き換えによるサプライチェーン攻撃に備えています。

## 開発中にハマったこと

### Kaggle SDK v2.0.0 のレスポンス形式の変更

Kaggle SDK が v2.0.0 にアップデートされた際、レスポンスのデータ構造が変わりました。以前は辞書形式でアクセスできていたフィールドが、オブジェクトの属性としてアクセスする形式に変更されていたため、コードの修正が必要でした。

### Webhook リクエストの 403 エラー

Slack と Discord の Webhook に `urllib.request` で POST すると、`User-Agent` ヘッダーがデフォルトの `Python-urllib` になります。一部のサービスではこれがブロックされるため、明示的に `User-Agent` を設定する必要がありました。

### Discord の URL 変更

Discord の Webhook URL は `discordapp.com` と `discord.com` の2種類が存在します。古い URL を使っている場合に備えて、自動的に `discord.com` に正規化する処理を追加しました。

## セットアップ方法

### 1. リポジトリをクローン

```bash
git clone https://github.com/asherish/kaggle-dingdong.git
cd kaggle-dingdong
```

### 2. 依存関係をインストール

```bash
uv sync
```

### 3. 環境変数を設定

`.env.example` をコピーして `.env` を作成し、必要な値を設定します。

```bash
cp .env.example .env
```

最低限必要なのは Kaggle の認証情報と、いずれか1つの通知チャネルの設定です。

### 4. ローカルで実行

```bash
uv run kaggle-dingdong
```

### 5. GitHub Actions で自動実行

リポジトリの Settings > Secrets and variables > Actions に環境変数を登録すると、毎日 09:00 UTC に自動実行されます。

## まとめ

kaggle-dingdong は、Kaggle コンペの見逃しを防ぐためのシンプルな通知ツールです。標準ライブラリ中心の軽量な実装で、GitHub Actions の無料枠内で十分に運用できます。

興味のある方はぜひ使ってみてください。Issue や PR も歓迎です。

https://github.com/asherish/kaggle-dingdong
