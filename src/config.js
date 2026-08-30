import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  pullpush: {
    apiKey: process.env.PULLPUSH_API_KEY || null,
  },
  discord: {
    botToken: required('DISCORD_BOT_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    // Optional: registering commands to a single guild makes them show up
    // instantly. Without it, global commands can take up to an hour to propagate.
    guildId: process.env.DISCORD_GUILD_ID || null,
  },
  twitter: {
    apiKey: process.env.TWITTERAPI_KEY || null,
  },
  apify: {
    apiToken: process.env.APIFY_API_TOKEN || null,
    cron: process.env.APIFY_CHECK_CRON || '0 * * * *',
  },
  // Reddit's check interval scales with subreddit count (and now request
  // type — posts and comments are separate PullPush requests) to hold
  // total monthly requests roughly fixed against the quoted pricing:
  // ~8,640 requests/month for 2 subreddits x 1 request type at 10 min.
  redditMinutesPerSubreddit: Number(process.env.REDDIT_MINUTES_PER_SUBREDDIT || 5),
  redditRequestTypesPerSubreddit: 1, // comments only — posts now come from Apify
  twitterCron: process.env.TWITTER_CHECK_CRON || '*/5 * * * *',
  seenFilePath: path.join(__dirname, '..', 'data', 'seen.json'),
  storeFilePath: path.join(__dirname, '..', 'data', 'store.json'),
};
