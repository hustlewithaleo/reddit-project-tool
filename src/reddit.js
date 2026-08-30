import { request } from 'undici';
import { config } from './config.js';

/**
 * Fetches the newest comments for each subreddit via PullPush's /comment
 * endpoint (one request per subreddit — its `subreddit` param only accepts
 * a single value). PullPush's post-search dataset is currently frozen at
 * May 2025 (per their own admin), so posts come from Apify instead — this
 * stays comments-only until/unless PullPush's live dataset comes back.
 */
export async function fetchNewComments(subreddits) {
  if (!config.pullpush.apiKey) return [];

  const results = await Promise.all(
    subreddits.map(async (subreddit) => {
      const query = new URLSearchParams({
        key: config.pullpush.apiKey,
        subreddit,
        size: '25',
        sort: 'desc',
        sort_type: 'created_utc',
      });
      const res = await request(`https://api.pullpush.io/comment?${query.toString()}`);
      if (res.statusCode !== 200) {
        throw new Error(`PullPush comment error: ${res.statusCode}`);
      }
      const data = await res.body.json();
      return data.data || [];
    })
  );
  return results.flat();
}
