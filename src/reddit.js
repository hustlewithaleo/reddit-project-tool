import { request } from 'undici';
import { config } from './config.js';

async function pullpushRequest(path, params) {
  const query = new URLSearchParams({
    key: config.pullpush.apiKey,
    size: '25',
    sort: 'desc',
    sort_type: 'created_utc',
    ...params,
  });
  const url = `https://api.pullpush.io/${path}?${query.toString()}`;

  const res = await request(url);
  if (res.statusCode !== 200) {
    throw new Error(`PullPush ${path} error: ${res.statusCode}`);
  }
  const data = await res.body.json();
  return data.data || [];
}

/**
 * Fetches the newest posts for each subreddit via PullPush's /topic
 * endpoint. One request per subreddit — PullPush's `subreddit` param
 * only accepts a single value.
 */
export async function fetchNewPosts(subreddits) {
  const results = await Promise.all(
    subreddits.map((subreddit) => pullpushRequest('topic', { subreddit }))
  );
  return results.flat();
}

/**
 * Fetches the newest comments for each subreddit via PullPush's /comment
 * endpoint. Same one-request-per-subreddit constraint as posts.
 */
export async function fetchNewComments(subreddits) {
  const results = await Promise.all(
    subreddits.map((subreddit) => pullpushRequest('comment', { subreddit }))
  );
  return results.flat();
}
