import cron from 'node-cron';
import { config } from './config.js';
import { fetchNewPosts, fetchNewComments } from './arcticshift.js';
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

async function processRedditPosts(posts, keywords) {
  for (const post of posts) {
    const id = `reddit_post_${post.id}`;
    if (hasSeen(id)) continue;

    const matched = findMatches(`${post.title || ''} ${post.selftext || ''}`, keywords);
    if (matched.length === 0) {
      markSeen(id);
      continue;
    }

    try {
      const posted = await postEmbed({
        title: (post.title || '').slice(0, 256),
        url: `https://www.reddit.com${post.permalink}`,
        description: (post.selftext || '').slice(0, 300),
        color: 0xff4500,
        fields: [
          { name: 'Source', value: 'Reddit post', inline: true },
          { name: 'Subreddit', value: `r/${post.subreddit}`, inline: true },
          { name: 'Author', value: `u/${post.author}`, inline: true },
          { name: 'Matched', value: matched.join(', '), inline: true },
        ],
        timestamp: new Date(post.created_utc * 1000).toISOString(),
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

async function checkReddit(keywords) {
  const subreddits = store.getSubreddits();
  if (subreddits.length === 0) return;

  console.log(`[${new Date().toISOString()}] Checking r/${subreddits.join(', r/')}...`);

  try {
    const posts = await fetchNewPosts(subreddits);
    await processRedditPosts(posts, keywords);
  } catch (err) {
    console.error('Failed to fetch Reddit posts:', err.message);
  }

  try {
    const comments = await fetchNewComments(subreddits);
    await processRedditComments(comments, keywords);
  } catch (err) {
    console.error('Failed to fetch Reddit comments:', err.message);
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
  console.log(`Scheduling Reddit checks with cron: ${config.redditCron}`);
  console.log(`Scheduling Twitter/X checks with cron: ${config.twitterCron}`);
  runRedditCheck();
  runTwitterCheck();
  cron.schedule(config.redditCron, runRedditCheck);
  cron.schedule(config.twitterCron, runTwitterCheck);
}
