import cron from 'node-cron';
import { config } from './config.js';
import { fetchNewComments } from './reddit.js';
import { fetchNewPosts as fetchNewPostsApify } from './apify.js';
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

async function processApifyPosts(posts, keywords) {
  for (const post of posts) {
    // Normalize to the bare Reddit base36 id so this shares dedup state
    // with PullPush's post ids, should that source ever come back — post
    // ids are the same underlying Reddit ids regardless of source.
    const rawId = (post.parsedId || post.id || '').replace(/^t3_/, '');
    const id = `reddit_post_${rawId}`;
    if (hasSeen(id)) continue;

    const matched = findMatches(`${post.title || ''} ${post.body || ''}`, keywords);
    if (matched.length === 0) {
      markSeen(id);
      continue;
    }

    try {
      const posted = await postEmbed({
        title: (post.title || '').slice(0, 256),
        url: post.postUrl || post.contentUrl,
        description: (post.body || '').slice(0, 300),
        color: 0xff4500,
        fields: [
          { name: 'Source', value: 'Reddit post', inline: true },
          { name: 'Subreddit', value: post.communityName || 'unknown', inline: true },
          { name: 'Author', value: `u/${post.authorName}`, inline: true },
          { name: 'Matched', value: matched.join(', '), inline: true },
        ],
        timestamp: post.createdAt,
      });
      if (posted) {
        markSeen(id);
        console.log(`Posted Reddit post match: "${post.title}" (${matched.join(', ')})`);
      }
    } catch (err) {
      console.error('Failed to post Reddit post match to Discord:', err.message);
    }
  }
}

async function processRedditComments(comments, keywords) {
  for (const comment of comments) {
    const id = `reddit_comment_${comment.id}`;
    if (hasSeen(id)) continue;

    const matched = findMatches(comment.body || '', keywords);
    if (matched.length === 0) {
      markSeen(id);
      continue;
    }

    try {
      const posted = await postEmbed({
        title: (comment.body || '').slice(0, 256),
        url: `https://www.reddit.com${comment.permalink}`,
        color: 0xff4500,
        fields: [
          { name: 'Source', value: 'Reddit comment', inline: true },
          { name: 'Subreddit', value: `r/${comment.subreddit}`, inline: true },
          { name: 'Author', value: `u/${comment.author}`, inline: true },
          { name: 'Matched', value: matched.join(', '), inline: true },
        ],
        timestamp: new Date(comment.created_utc * 1000).toISOString(),
      });
      if (posted) {
        markSeen(id);
        console.log(`Posted Reddit comment match: "${comment.body}" (${matched.join(', ')})`);
      }
    } catch (err) {
      console.error('Failed to post Reddit comment match to Discord:', err.message);
    }
  }
}

async function checkRedditComments(keywords) {
  const subreddits = store.getSubreddits();
  if (subreddits.length === 0) return;

  console.log(`[${new Date().toISOString()}] Checking r/${subreddits.join(', r/')} comments (PullPush)...`);

  try {
    const comments = await fetchNewComments(subreddits);
    await processRedditComments(comments, keywords);
  } catch (err) {
    console.error('Failed to fetch Reddit comments:', err.message);
  }
}

async function checkRedditPosts(keywords) {
  if (!config.apify.apiToken) return;
  const subreddits = store.getSubreddits();
  if (subreddits.length === 0) return;

  console.log(`[${new Date().toISOString()}] Checking r/${subreddits.join(', r/')} posts (Apify)...`);

  try {
    const posts = await fetchNewPostsApify(keywords, subreddits);
    await processApifyPosts(posts, keywords);
  } catch (err) {
    console.error('Failed to fetch Reddit posts via Apify:', err.message);
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

async function runRedditCommentsCheck() {
  const keywords = store.getKeywords();
  if (keywords.length === 0) return;
  await checkRedditComments(keywords);
  persist();
}

async function runRedditPostsCheck() {
  const keywords = store.getKeywords();
  if (keywords.length === 0) return;
  await checkRedditPosts(keywords);
  persist();
}

async function runTwitterCheck() {
  const keywords = store.getKeywords();
  if (keywords.length === 0) return;
  await checkTwitter(keywords);
  persist();
}

function currentRedditCommentsIntervalMs() {
  const subredditCount = Math.max(store.getSubreddits().length, 1);
  const minutes =
    config.redditMinutesPerSubreddit * subredditCount * config.redditRequestTypesPerSubreddit;
  return minutes * 60 * 1000;
}

// Reddit comments' interval scales with subreddit count (see config.js), so
// it's a self-rescheduling loop rather than a fixed cron pattern — each run
// picks the delay based on the subreddit count *at that time*, so
// /subreddit-add and /subreddit-remove take effect on the next cycle
// automatically. Posts (Apify) use a fixed hourly cron instead, since their
// cost is dominated by a flat per-run fee rather than scaling with subreddit
// count the same way.
function scheduleNextRedditCommentsCheck() {
  const delayMs = currentRedditCommentsIntervalMs();
  console.log(`Next Reddit comments check in ${Math.round(delayMs / 60000)} min.`);
  setTimeout(async () => {
    await runRedditCommentsCheck();
    scheduleNextRedditCommentsCheck();
  }, delayMs);
}

const runOnce = process.argv.includes('--once');

await startBot();

if (runOnce) {
  if (store.getKeywords().length === 0) {
    console.log('No keywords configured yet — skipping check.');
  } else {
    await runRedditCommentsCheck();
    await runRedditPostsCheck();
    await runTwitterCheck();
  }
  client.destroy();
} else {
  console.log(`Scheduling Twitter/X checks with cron: ${config.twitterCron}`);
  console.log(`Scheduling Reddit posts (Apify) checks with cron: ${config.apify.cron}`);
  runRedditCommentsCheck();
  runRedditPostsCheck();
  runTwitterCheck();
  scheduleNextRedditCommentsCheck();
  cron.schedule(config.twitterCron, runTwitterCheck);
  cron.schedule(config.apify.cron, runRedditPostsCheck);
}
