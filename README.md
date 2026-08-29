# reddit-scraper

A Discord bot that watches subreddits for new posts matching keywords you manage with slash commands, and posts matches to a channel.

Uses only the official Reddit OAuth API — no scraping, no proxies, nothing that circumvents Reddit's rate limits or terms.

## Setup

1. `npm install`
2. Create a Discord application + bot at https://discord.com/developers/applications:
   - "Bot" tab: create a bot, copy its token
   - "OAuth2" tab: copy the Application (client) ID
   - "OAuth2 > URL Generator": check `bot` and `applications.commands` scopes, and under Bot Permissions check `Send Messages` and `Embed Links`. Open the generated URL to invite it to your server.
3. Create a Reddit "script" app at https://www.reddit.com/prefs/apps for API credentials, using a dedicated automated account (not your personal one).
4. Copy `.env.example` to `.env` and fill in the Reddit and Discord values.
5. `npm start`

## Commands (in Discord)

- `/keyword-add word:<text>` — start watching a keyword
- `/keyword-remove word:<text>` — stop watching a keyword
- `/keyword-list` — show watched keywords
- `/subreddit-add name:<sub>` — monitor a subreddit
- `/subreddit-remove name:<sub>` — stop monitoring a subreddit
- `/subreddit-list` — show monitored subreddits
- `/set-channel` — run this in the channel where you want match alerts posted
- `/status` — show current config

Nothing is monitored until you've set at least one subreddit, one keyword, and run `/set-channel`.

## Run

```bash
npm start
```

Logs the bot in, registers slash commands, and checks for new posts on a schedule (default every 5 minutes, set via `CHECK_CRON` in `.env`).

```bash
npm run once
```

Runs a single check and exits — useful for testing your config/credentials.

## How it works

- Authenticates with Reddit via the official OAuth password grant (client ID/secret + a dedicated automated account), and pulls `/r/<subs>/new`.
- No scraping, no proxy rotation, no bypassing of rate limits — every request goes through Reddit's supported API.
- Watched subreddits/keywords and the alert channel are stored in `data/store.json`, managed entirely through the slash commands above.
- Seen post IDs are stored in `data/seen.json` so restarts don't re-post old matches.
