import { request } from 'undici';

const BASE = 'https://arctic-shift.photon-reddit.com/api';

/**
 * Arctic Shift (arctic-shift.photon-reddit.com) is a free, unauthenticated
 * Reddit archive — confirmed live (posts/comments appear within minutes of
 * posting; only vote/comment counts take up to ~36h to finalize, which we
 * don't use). No per-request cost, so we fetch broadly per subreddit and
 * match keywords locally, same pattern as the original design — just no
 * query param needed since there's no cost pressure to filter server-side.
 * It's a small free service with no uptime guarantee, so treat fetch
 * failures as expected/recoverable, not something to alert on loudly.
 */

async function fetchOne(path, subreddit) {
  const url = `${BASE}/${path}?subreddit=${encodeURIComponent(subreddit)}&sort=desc&limit=25`;
  const res = await request(url);
  if (res.statusCode !== 200) {
    throw new Error(`Arctic Shift ${path} error for r/${subreddit}: ${res.statusCode}`);
  }
  const body = await res.body.json();
  return body.data || [];
}

export async function fetchNewPosts(subreddits) {
  const results = await Promise.all(subreddits.map((s) => fetchOne('posts/search', s)));
  return results.flat();
}

export async function fetchNewComments(subreddits) {
  const results = await Promise.all(subreddits.map((s) => fetchOne('comments/search', s)));
  return results.flat();
}
