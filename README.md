# reddit-scraper

A Discord bot built for shipex.courses lead generation. Watches Reddit (posts + comments) and Twitter/X for keyword matches, then uses Claude to classify each match as a real lead (or discard it) and posts qualifying ones — with a short AI-written summary — to one of two channels.

## Lead categories

- **Course lead**: someone asking about, looking for, or wanting access to a specific paid course (any course) — a direct fit for shipex.courses' $29/month all-access to 41 courses.
- **Ecommerce lead**: someone interested in starting/growing an ecommerce or dropshipping business generally, without asking for a specific course.
- Everything else that merely contains a keyword but isn't a real lead gets silently discarded — nothing is posted for it.

## Setup

1. `npm install`
2. Create a Discord application + bot at https://discord.com/developers/applications:
   - "Bot" tab: create a bot, copy its token
   - "OAuth2" tab: copy the Application (client) ID
   - "OAuth2 > URL Generator": check `bot` and `applications.commands` scopes, and under Bot Permissions check `Send Messages` and `Embed Links`. Open the generated URL to invite it to your server.
3. Copy `.env.example` to `.env` and fill in the Discord values.
4. Get an Anthropic API key at https://console.anthropic.com and set `ANTHROPIC_API_KEY` — required for lead classification; without it, matches are found but nothing gets posted.
5. (Optional, for Twitter/X) Sign up at https://twitterapi.io, get an API key, and set `TWITTERAPI_KEY` in `.env`. Billed per tweet read (~$0.15/1,000) — leave blank to run Reddit-only.
6. `npm start`

Reddit itself needs no API key or paid service — it uses a free public archive (see below).

## Commands (in Discord)

- `/keyword-add word:<text>` — start watching a keyword (used for both Reddit and Twitter/X)
- `/keyword-remove word:<text>` — stop watching a keyword
- `/keyword-list` — show watched keywords
- `/subreddit-add name:<sub>` — monitor a subreddit (Reddit only — Twitter/X search isn't scoped to a subforum)
- `/subreddit-remove name:<sub>` — stop monitoring a subreddit
- `/subreddit-list` — show monitored subreddits
- `/set-course-channel` — run this in the channel where course leads should post
- `/set-ecommerce-channel` — run this in the channel where ecommerce leads should post
- `/status` — show current config

Defaults to monitoring r/entrepreneur and r/smallbusiness on first run (changeable anytime). Nothing is posted until you've added at least one keyword, set both channels, and set `ANTHROPIC_API_KEY`. Twitter/X checks only run if `TWITTERAPI_KEY` is set.

## Run

```bash
npm start
```

Logs the bot in, registers slash commands, and checks for new content on a schedule (default every 5 minutes for both Reddit and Twitter/X, set via `REDDIT_CHECK_CRON`/`TWITTER_CHECK_CRON` in `.env`).

```bash
npm run once
```

Runs a single check and exits — useful for testing your config/credentials.

## How it works

1. **Fetch**: Reddit posts/comments per subreddit come from [Arctic Shift](https://arctic-shift.photon-reddit.com), a free, unauthenticated Reddit archive — new content appears within minutes of posting. Twitter/X comes from TwitterAPI.io's advanced search (all keywords combined into one `OR` query per check).
2. **Keyword pre-filter**: each fetched item is checked against your keyword list locally — this is free and cheap, and most items get discarded here without ever reaching Claude.
3. **Classification**: only keyword matches get sent to Claude (`claude-opus-5`), which decides `course` / `ecommerce` / `none` and writes a one-sentence summary explaining why.
4. **Post**: `course` and `ecommerce` leads go to their respective Discord channel with the summary attached; `none` is dropped. If a lead's channel isn't set yet, it's retried on the next check instead of being lost.
5. Watched subreddits/keywords/channels are stored in `data/store.json`, managed entirely through the slash commands above. Seen post/comment/tweet IDs are stored in `data/seen.json` so restarts don't re-post old matches.
