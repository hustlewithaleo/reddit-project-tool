import { request } from 'undici';

const BASE = 'https://arctic-shift.photon-reddit.com/api';

/**
 * Arctic Shift (arctic-shift.photon-reddit.com) is a free, unauthenticated
 * Reddit archive — confirmed live (posts/comments appear within minutes of
 * posting; only vote/comment counts take up to ~36h to finalize, which we
 * don't use). No per-request cost, so we fetch broadly per subreddit and
 * match keywords locally, same pattern as the original design — just no
 * query param needed since there's no cost pressure to filter server-side.
 * It's a small free service with no uptime guarantee and does rate-limit
 * (429) under load — with many subreddits configured, requests are sent
 * a few at a time with a small delay rather than all at once, and one
 * subreddit failing never blocks the others in the same check.
 */

const CONCURRENCY = 5;
const DELAY_BETWEEN_BATCHES_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOne(path, subreddit) {
  const url = `${BASE}/${path}?subreddit=${encodeURIComponent(subreddit)}&sort=desc&limit=25`;
  const res = await request(url);
  if (res.statusCode !== 200) {
    throw new Error(`Arctic Shift ${path} error for r/${subreddit}: ${res.statusCode}`);
  }
  const body = await res.body.json();
  return body.data || [];
}

/**
 * Fetches `path` for every subreddit in small concurrent batches (not all
 * at once), and never lets one subreddit's failure block the rest —
 * failures are logged and skipped rather than aborting the whole check.
 */
async function fetchAll(path, subreddits) {
  const results = [];
  for (let i = 0; i < subreddits.length; i += CONCURRENCY) {
    const batch = subreddits.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(batch.map((s) => fetchOne(path, s)));
    for (let j = 0; j < settled.length; j++) {
      const outcome = settled[j];
      if (outcome.status === 'fulfilled') {
        results.push(...outcome.value);
      } else {
        console.error(`Arctic Shift fetch failed for r/${batch[j]}:`, outcome.reason.message);
      }
    }
    if (i + CONCURRENCY < subreddits.length) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }
  return results;
}

export async function fetchNewPosts(subreddits) {
  return fetchAll('posts/search', subreddits);
}

export async function fetchNewComments(subreddits) {
  return fetchAll('comments/search', subreddits);
}
