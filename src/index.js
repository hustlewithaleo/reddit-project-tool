import cron from 'node-cron';
import { config } from './config.js';
import { fetchNewPosts } from './redditApi.js';
import { hasSeen, markSeen, persist } from './state.js';
import { store } from './store.js';
import { client, startBot } from './bot.js';

function matchKeywords(post, keywords) {
  const haystack = `${post.title} ${post.selftext || ''}`.toLowerCase();
  return keywords.filter((kw) => haystack.includes(kw));
}

async function postMatch(post, matched) {
  const channelId = store.getChannelId();
  if (!channelId) {
    console.warn('No alert channel set. Run /set-channel in Discord first.');
    return;
  }
  const channel = await client.channels.fetch(channelId);
  const url = `https://www.reddit.com${post.permalink}`;

  await channel.send({
    embeds: [
      {
        title: post.title.slice(0, 256),
        url,
        description: (post.selftext || '').slice(0, 300),
        color: 0xff4500,
        fields: [
          { name: 'Subreddit', value: `r/${post.subreddit}`, inline: true },
          { name: 'Author', value: `u/${post.author}`, inline: true },
          { name: 'Matched', value: matched.join(', '), inline: true },
        ],
        timestamp: new Date(post.created_utc * 1000).toISOString(),
      },
    ],
  });
}

async function runCheck() {
  const subreddits = store.getSubreddits();
  const keywords = store.getKeywords();

  if (subreddits.length === 0 || keywords.length === 0) {
    console.log('No subreddits or keywords configured yet — skipping check.');
    return;
  }

  console.log(`[${new Date().toISOString()}] Checking r/${subreddits.join(', r/')}...`);

  let posts;
  try {
    posts = await fetchNewPosts(subreddits);
  } catch (err) {
    console.error('Failed to fetch posts:', err.message);
    return;
  }

  for (const post of posts) {
    if (hasSeen(post.id)) continue;
    markSeen(post.id);

    const matched = matchKeywords(post, keywords);
    if (matched.length === 0) continue;

    try {
      await postMatch(post, matched);
      console.log(`Posted match to Discord: "${post.title}" (${matched.join(', ')})`);
    } catch (err) {
      console.error('Failed to post to Discord:', err.message);
    }
  }

  persist();
}

const runOnce = process.argv.includes('--once');

await startBot();

if (runOnce) {
  await runCheck();
  process.exit(0);
} else {
  console.log(`Scheduling checks with cron: ${config.cron}`);
  runCheck();
  cron.schedule(config.cron, runCheck);
}
