# reddit-scraper

A Discord bot that watches Reddit (posts + comments) and (optionally) Twitter/X for content matching keywords you manage with slash commands, and posts matches to a channel.

## Setup

1. `npm install`
2. Create a Discord application + bot at https://discord.com/developers/applications:
   - "Bot" tab: create a bot, copy its token
   - "OAuth2" tab: copy the Application (client) ID
   - "OAuth2 > URL Generator": check `bot` and `applications.commands` scopes, and under Bot Permissions check `Send Messages` and `Embed Links`. Open the generated URL to invite it to your server.
3. Copy `.env.example` to `.env` and fill in the Discord values.
4. (Optional, for Twitter/X) Sign up at https://twitterapi.io, get an API key, and set `TWITTERAPI_KEY` in `.env`. Billed per tweet read (~$0.15/1,000) — leave blank to run Reddit-only.
5. `npm start`

Reddit itself needs no API key or paid service — it uses a free public archive (see below).

## Commands (in Discord)

- `/keyword-add word:<text>` — start watching a keyword (used for both Reddit and Twitter/X)
- `/keyword-remove word:<text>` — stop watching a keyword
- `/keyword-list` — show watched keywords
- `/subreddit-add name:<sub>` — monitor a subreddit (Reddit only — Twitter/X search isn't scoped to a subforum)
- `/subreddit-remove name:<sub>` — stop monitoring a subreddit
- `/subreddit-list` — show monitored subreddits
- `/set-channel` — run this in the channel where you want match alerts posted
- `/status` — show current config

Defaults to monitoring r/entrepreneur and r/smallbusiness on first run (changeable anytime). Nothing is posted to Discord until you've added at least one keyword and run `/set-channel`. Twitter/X checks only run if `TWITTERAPI_KEY` is set.

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

- **Reddit**: fetches posts and comments per subreddit from [Arctic Shift](https://arctic-shift.photon-reddit.com) (`arctic-shift.photon-reddit.com`), a free, unauthenticated Reddit archive. New content appears within minutes of posting (only vote/comment counts take up to ~36h to finalize, which this bot doesn't use). It's a small free service with no uptime guarantee, so occasional fetch failures are logged and skipped rather than treated as fatal.
- **Twitter/X**: uses TwitterAPI.io's advanced search, combining all your keywords into a single `OR` query per check (one page, up to 20 results, per check — this is also the practical cost cap since billing is per tweet returned).
- Both sources check against the same keyword list. Matches from either are posted to the same Discord channel, tagged with which source and subreddit/account they came from.
- Watched subreddits/keywords and the alert channel are stored in `data/store.json`, managed entirely through the slash commands above.
- Seen post/comment/tweet IDs are stored in `data/seen.json` so restarts don't re-post old matches.
