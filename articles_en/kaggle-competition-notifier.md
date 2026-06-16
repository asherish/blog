---
title: "Building a Kaggle Competition Notification Bot"
published: true
tags: Kaggle, Python, GitHubActions, Discord
canonical_url: https://zenn.dev/asherish/articles/kaggle-competition-notifier
---

I built a tool called "kaggle-dingdong" that automatically fetches Kaggle competition information and sends notifications to Email, Slack, and Discord. It runs daily on a schedule via GitHub Actions, and you get notified whenever a new competition is published.

https://github.com/asherish/kaggle-dingdong

## Why I Built This

Checking the Kaggle competitions page every day is tedious. Featured competitions in particular have entry deadlines, so missing them means losing the opportunity. While RSS feeds and official notification features exist, I wanted notifications delivered directly to the channels I actually use (Discord and Slack), so I built my own.

## Tech Stack

- **Python 3.13**
- **uv** — Package manager and build tool (by Astral)
- **Kaggle Python SDK v2.0.0** — Fetching competition info
- **GitHub Actions** — Automated daily execution at 09:00 UTC
- **pytest** — Testing

Three notification channels are supported:

| Channel | Method | Format |
|---|---|---|
| Email | SMTP | HTML (card layout) |
| Slack | Incoming Webhook | Block Kit |
| Discord | Webhook | Rich Embed |

## Architecture

```
GitHub Actions (cron: daily at 09:00 UTC)
  ↓
Fetch competition list via Kaggle API
  ↓
Filter by conditions in config.json
  ↓
Compare with sent history to extract unnotified competitions
  ↓
Send notifications to configured channels
  ↓
Update sent history (max 200 entries)
```

The project structure is as follows:

```
kaggle-dingdong/
├── src/kaggle_dingdong/
│   ├── __main__.py        # Entry point
│   ├── config.py          # Configuration loading
│   ├── competitions.py    # Fetch & filter competitions from Kaggle API
│   ├── email_sender.py    # Email notifications
│   ├── slack_sender.py    # Slack notifications
│   ├── discord_sender.py  # Discord notifications
│   └── history.py         # Sent history management
├── tests/                 # pytest tests
├── config.json            # Filter configuration
└── .github/workflows/
    └── notify.yml         # GitHub Actions workflow
```

## Implementation Highlights

### Fetching and Filtering Competitions

The Kaggle SDK is used to fetch the competition list. In addition to the default sort order, it also fetches with `recentlyCreated` (newest first) and deduplicates by title. With the default order alone, freshly launched competitions can end up buried on later pages and get missed.

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

The fetched competitions are then narrowed down by a separate `filter_competitions` function using three conditions: category, tags, and sent history.

Filter conditions are specified in `config.json`:

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

Listing category names in `category` limits notifications to competitions in those categories (the default is `Featured` and `Research`). An empty array `[]` targets all categories. `tags` works similarly — setting `["tabular", "nlp"]` limits notifications to competitions containing any of those tags.

### Preventing Duplicates with Sent History

Notified competition titles are saved to a JSON file to prevent duplicate notifications in subsequent runs.

```python
def save_history(existing: list[str], new_titles: list[str], path: Path, limit: int = 200):
    combined = existing + new_titles
    trimmed = combined[-limit:]
    path.write_text(json.dumps(trimmed, indent=2, ensure_ascii=False))
```

The history is limited to 200 entries, with older ones automatically removed. In GitHub Actions, the cache feature is used to persist `sent_competitions.json` between runs.

### Handling Discord's Embed Limit

Discord's Webhook API allows a maximum of 10 embeds per message. When there are more than 10 competitions, they're automatically chunked into multiple messages.

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

Slack has a similar limit (50 blocks per message), so competitions are chunked every 24 entries.

### Auto-Detection of Notification Channels

Only channels with configured environment variables are activated. For example, if only `DISCORD_WEBHOOK_URL` is set, notifications are sent only to Discord. You can configure all three channels or just one.

## Scheduled Execution with GitHub Actions

`.github/workflows/notify.yml` is configured to run automatically every day at 09:00 UTC.

```yaml
on:
  schedule:
    - cron: "0 9 * * *"
  workflow_dispatch:
```

The key point is caching the sent history. Since GitHub Actions runs each job in a clean environment, `actions/cache` is used to carry over the history from the previous run. To split restore and save into separate steps, `actions/cache/restore` and `actions/cache/save` are used. The save step has `if: always()` so that the history is preserved even if the job fails midway through sending notifications.

```yaml
# Before the run: restore the most recent history
- name: Restore history cache
  uses: actions/cache/restore@v5.0.3
  with:
    path: sent_competitions.json
    key: sent-competitions-${{ github.run_id }}
    restore-keys: sent-competitions-

# ... (uv sync and running the notifier) ...

# After the run: save the updated history (even on failure)
- name: Save history cache
  uses: actions/cache/save@v5.0.3
  if: always()
  with:
    path: sent_competitions.json
    key: sent-competitions-${{ github.run_id }}
```

Including the run ID in the `key` creates a new cache each time, and the prefix match in `restore-keys` restores the most recent cache. Note that all third-party actions referenced in the workflow are pinned by commit SHA to guard against supply-chain attacks via tag rewriting.

## Gotchas During Development

### Kaggle SDK v2.0.0 Response Format Change

When the Kaggle SDK was updated to v2.0.0, the response data structure changed. Fields that were previously accessible as dictionary keys became object attributes, requiring code modifications.

### 403 Errors on Webhook Requests

When POSTing to Slack and Discord webhooks using `urllib.request`, the default `User-Agent` header is `Python-urllib`. Some services block this, so an explicit `User-Agent` had to be set.

### Discord URL Change

Discord webhook URLs come in two forms: `discordapp.com` and `discord.com`. To handle cases where the old URL is used, automatic normalization to `discord.com` was added.

## Setup Guide

### 1. Clone the Repository

```bash
git clone https://github.com/asherish/kaggle-dingdong.git
cd kaggle-dingdong
```

### 2. Install Dependencies

```bash
uv sync
```

### 3. Configure Environment Variables

Copy `.env.example` to create `.env` and set the required values.

```bash
cp .env.example .env
```

At minimum, you need Kaggle credentials and at least one notification channel configured.

### 4. Run Locally

```bash
uv run kaggle-dingdong
```

### 5. Automate with GitHub Actions

Register the environment variables in the repository's Settings > Secrets and variables > Actions, and it will run automatically every day at 09:00 UTC.

## Summary

kaggle-dingdong is a simple notification tool to prevent missing Kaggle competitions. It's a lightweight implementation centered around the standard library, and runs comfortably within GitHub Actions' free tier.

Give it a try if you're interested. Issues and PRs are welcome.

https://github.com/asherish/kaggle-dingdong
