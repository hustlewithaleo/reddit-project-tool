import cron from 'node-cron';
import { config } from './config.js';
import { fetchNewPosts } from './reddit.js';
import { fetchNewTweets } from './twitter.js';
import { hasSeen, markSeen, persist } from './state.js';
import { store } from './store.js';
import { client, startBot } from './bot.js';

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection (ignored, bot stays up):', err);
});

function findMatches(text, keywords) {
  const haystack = text.toLowerCase();
  return keywords.filter((kw) => haystack.includes(kw));
}

async function postEmbed(embed) {
  const channelId = store.getChannelId();
  if (!channelId) {
    console.warn('No alert channel set. Run /set-channel in Discord first.');
    return false;
  }
  const channel = await client.channels.fetch(channelId);
  await channel.send({ embeds: [embed] });
  return true;
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

    const matched = findMatches(`${post.title} ${post.selftext || ''}`, keywords);
    if (matched.length === 0) {
      markSeen(id);
      continue;
    }

    try {
      const posted = await postEmbed({
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
      if (posted) {
        markSeen(id);
        console.log(`Posted Reddit match: "${post.title}" (${matched.join(', ')})`);
      }
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

    const matched = findMatches(tweet.text || '', keywords);
    if (matched.length === 0) {
      markSeen(id);
      continue;
    }

    try {
      const posted = await postEmbed({
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
      if (posted) {
        markSeen(id);
        console.log(`Posted Twitter/X match: "${tweet.text}" (${matched.join(', ')})`);
      }
    } catch (err) {
      console.error('Failed to post Twitter/X match to Discord:', err.message);
    }
  }
}

async function runRedditCheck() {
  const keywords = store.getKeywords();
  if (keywords.length === 0) return;
  await checkReddit(keywords);
  persist();
}

async function runTwitterCheck() {
  const keywords = store.getKeywords();
  if (keywords.length === 0) return;
  await checkTwitter(keywords);
  persist();
}

function currentRedditIntervalMs() {
  const subredditCount = Math.max(store.getSubreddits().length, 1);
  const minutes = config.redditMinutesPerSubreddit * subredditCount;
  return minutes * 60 * 1000;
}

// Reddit's interval scales with subreddit count (see config.js), so it's a
// self-rescheduling loop rather than a fixed cron pattern — each run picks
// the delay based on the subreddit count *at that time*, so /subreddit-add
// and /subreddit-remove take effect on the next cycle automatically.
function scheduleNextRedditCheck() {
  const delayMs = currentRedditIntervalMs();
  console.log(`Next Reddit check in ${Math.round(delayMs / 60000)} min.`);
  setTimeout(async () => {
    await runRedditCheck();
    scheduleNextRedditCheck();
  }, delayMs);
}

const runOnce = process.argv.includes('--once');

await startBot();

if (runOnce) {
  if (store.getKeywords().length === 0) {
    console.log('No keywords configured yet — skipping check.');
  } else {
    await runRedditCheck();
    await runTwitterCheck();
  }
  client.destroy();
} else {
  console.log(`Scheduling Twitter/X checks with cron: ${config.twitterCron}`);
  runRedditCheck();
  runTwitterCheck();
  scheduleNextRedditCheck();
  cron.schedule(config.twitterCron, runTwitterCheck);
}
