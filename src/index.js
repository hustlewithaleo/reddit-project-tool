import cron from 'node-cron';
import { config } from './config.js';
import { fetchNewPosts } from './reddit.js';
import { fetchNewTweets } from './twitter.js';
import { hasSeen, markSeen, persist } from './state.js';
import { store } from './store.js';
import { client, startBot } from './bot.js';

function findMatches(text, keywords) {
  const haystack = text.toLowerCase();
  return keywords.filter((kw) => haystack.includes(kw));
}

async function postEmbed(embed) {
  const channelId = store.getChannelId();
  if (!channelId) {
    console.warn('No alert channel set. Run /set-channel in Discord first.');
    return;
  }
  const channel = await client.channels.fetch(channelId);
  await channel.send({ embeds: [embed] });
}

async function checkReddit(keywords) {
  const subreddits = store.getSubreddits();
  if (subreddits.length === 0) return;

  console.log(`[${new Date().toISOString()}] Checking r/${subreddits.join(', r/')}...`);

  let posts;
  try {
    posts = await fetchNewPosts(subreddits);
  } catch (err) {
    console.error('Failed to fetch Reddit posts:', err.message);
    return;
  }

  for (const post of posts) {
    const id = `reddit_${post.id}`;
    if (hasSeen(id)) continue;
    markSeen(id);

    const matched = findMatches(`${post.title} ${post.selftext || ''}`, keywords);
    if (matched.length === 0) continue;

    try {
      await postEmbed({
        title: post.title.slice(0, 256),
        url: `https://www.reddit.com${post.permalink}`,
        description: (post.selftext || '').slice(0, 300),
        color: 0xff4500,
        fields: [
          { name: 'Source', value: 'Reddit', inline: true },
          { name: 'Subreddit', value: `r/${post.subreddit}`, inline: true },
          { name: 'Author', value: `u/${post.author}`, inline: true },
          { name: 'Matched', value: matched.join(', '), inline: true },
        ],
        timestamp: new Date(post.created_utc * 1000).toISOString(),
      });
      console.log(`Posted Reddit match: "${post.title}" (${matched.join(', ')})`);
    } catch (err) {
      console.error('Failed to post Reddit match to Discord:', err.message);
    }
  }
}

async function checkTwitter(keywords) {
  if (!config.twitter.apiKey) return;

  console.log(`[${new Date().toISOString()}] Checking Twitter/X for ${keywords.length} keywords...`);

  let tweets;
  try {
    tweets = await fetchNewTweets(keywords);
  } catch (err) {
    console.error('Failed to fetch tweets:', err.message);
    return;
  }

  for (const tweet of tweets) {
    const id = `twitter_${tweet.id}`;
    if (hasSeen(id)) continue;
    markSeen(id);

    const matched = findMatches(tweet.text || '', keywords);
    if (matched.length === 0) continue;

    try {
      await postEmbed({
        title: (tweet.text || '').slice(0, 256),
        url: `https://x.com/${tweet.author?.userName}/status/${tweet.id}`,
        color: 0x1d9bf0,
        fields: [
          { name: 'Source', value: 'Twitter/X', inline: true },
          { name: 'Author', value: `@${tweet.author?.userName}`, inline: true },
          { name: 'Matched', value: matched.join(', '), inline: true },
        ],
        timestamp: new Date(tweet.createdAt).toISOString(),
      });
      console.log(`Posted Twitter/X match: "${tweet.text}" (${matched.join(', ')})`);
    } catch (err) {
      console.error('Failed to post Twitter/X match to Discord:', err.message);
    }
  }
}

async function runCheck() {
  const keywords = store.getKeywords();
  if (keywords.length === 0) {
    console.log('No keywords configured yet — skipping check.');
    return;
  }

  await checkReddit(keywords);
  await checkTwitter(keywords);

  persist();
}

const runOnce = process.argv.includes('--once');

await startBot();

if (runOnce) {
  await runCheck();
  client.destroy();
} else {
  console.log(`Scheduling checks with cron: ${config.cron}`);
  runCheck();
  cron.schedule(config.cron, runCheck);
}
