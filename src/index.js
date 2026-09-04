import cron from 'node-cron';
import { config } from './config.js';
import { fetchNewPosts, fetchNewComments } from './arcticshift.js';
import { fetchNewTweets } from './twitter.js';
import { classifyLead } from './classify.js';
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

const CATEGORY_LABEL = { course: 'Course lead' };

/**
 * Runs the full pipeline for one fetched item: keyword pre-filter, then
 * (only for actual matches) Claude classification into a lead category
 * with a summary, then posting to the matching lead channel. Items that
 * don't keyword-match, or that Claude classifies as "none", are marked
 * seen and dropped — nothing gets posted for them. Items that DO
 * classify as a lead but have no channel configured yet are deliberately
 * NOT marked seen, so they're retried once the channel is set.
 */
async function handleItem({ id, text, keywords, buildEmbed }) {
  if (hasSeen(id)) return;

  const matched = findMatches(text, keywords);
  if (matched.length === 0) {
    markSeen(id);
    return;
  }

  const { category, summary } = await classifyLead(text);
  if (category === 'none') {
    markSeen(id);
    return;
  }

  const channelId = store.getCourseChannelId();
  if (!channelId) {
    console.warn(`${CATEGORY_LABEL[category]} found but no channel set — run /set-course-channel in Discord.`);
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    await channel.send({ embeds: [buildEmbed(matched, summary, category)] });
    markSeen(id);
    console.log(`Posted ${CATEGORY_LABEL[category]}: "${text.slice(0, 80)}"`);
  } catch (err) {
    console.error(`Failed to post ${category} lead to Discord:`, err.message);
  }
}

async function checkReddit(keywords) {
  const subreddits = store.getSubreddits();
  if (subreddits.length === 0) return;

  console.log(`[${new Date().toISOString()}] Checking r/${subreddits.join(', r/')}...`);

  try {
    const posts = await fetchNewPosts(subreddits);
    for (const post of posts) {
      await handleItem({
        id: `reddit_post_${post.id}`,
        text: `${post.title || ''} ${post.selftext || ''}`,
        keywords,
        buildEmbed: (matched, summary, category) => ({
          title: (post.title || '').slice(0, 256),
          url: `https://www.reddit.com${post.permalink}`,
          description: (post.selftext || '').slice(0, 300),
          color: 0xff4500,
          fields: [
            { name: 'Source', value: 'Reddit post', inline: true },
            { name: 'Subreddit', value: `r/${post.subreddit}`, inline: true },
            { name: 'Author', value: `u/${post.author}`, inline: true },
            { name: 'Category', value: CATEGORY_LABEL[category], inline: true },
            { name: 'Matched', value: matched.join(', '), inline: true },
            { name: 'Why', value: summary || 'n/a' },
          ],
          timestamp: new Date(post.created_utc * 1000).toISOString(),
        }),
      });
    }
  } catch (err) {
    console.error('Failed to fetch Reddit posts:', err.message);
  }

  try {
    const comments = await fetchNewComments(subreddits);
    for (const comment of comments) {
      await handleItem({
        id: `reddit_comment_${comment.id}`,
        text: comment.body || '',
        keywords,
        buildEmbed: (matched, summary, category) => ({
          title: (comment.body || '').slice(0, 256),
          url: `https://www.reddit.com${comment.permalink}`,
          color: 0xff4500,
          fields: [
            { name: 'Source', value: 'Reddit comment', inline: true },
            { name: 'Subreddit', value: `r/${comment.subreddit}`, inline: true },
            { name: 'Author', value: `u/${comment.author}`, inline: true },
            { name: 'Category', value: CATEGORY_LABEL[category], inline: true },
            { name: 'Matched', value: matched.join(', '), inline: true },
            { name: 'Why', value: summary || 'n/a' },
          ],
          timestamp: new Date(comment.created_utc * 1000).toISOString(),
        }),
      });
    }
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
    await handleItem({
      id: `twitter_${tweet.id}`,
      text: tweet.text || '',
      keywords,
      buildEmbed: (matched, summary, category) => ({
        title: (tweet.text || '').slice(0, 256),
        url: `https://x.com/${tweet.author?.userName}/status/${tweet.id}`,
        color: 0x1d9bf0,
        fields: [
          { name: 'Source', value: 'Twitter/X', inline: true },
          { name: 'Author', value: `@${tweet.author?.userName}`, inline: true },
          { name: 'Category', value: CATEGORY_LABEL[category], inline: true },
          { name: 'Matched', value: matched.join(', '), inline: true },
          { name: 'Why', value: summary || 'n/a' },
        ],
        timestamp: new Date(tweet.createdAt).toISOString(),
      }),
    });
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

if (!config.anthropic.apiKey) {
  console.warn('ANTHROPIC_API_KEY not set — lead classification is disabled, nothing will be posted.');
}

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
