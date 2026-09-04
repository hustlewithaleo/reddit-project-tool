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
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || null,
  },
  redditCron: process.env.REDDIT_CHECK_CRON || '*/5 * * * *',
  twitterCron: process.env.TWITTER_CHECK_CRON || '*/5 * * * *',
  seenFilePath: path.join(__dirname, '..', 'data', 'seen.json'),
  storeFilePath: path.join(__dirname, '..', 'data', 'store.json'),
};
