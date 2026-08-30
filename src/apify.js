import { request } from 'undici';
import { config } from './config.js';

/**
 * Fetches new posts matching any of the given keywords, one Apify run per
 * subreddit (using `withinCommunity` to scope the search). `maxPostsCount`
 * is applied per keyword, not per run, so this actually finds subreddit-
 * scoped matches — unlike an unscoped combined search, where a fixed
 * result cap gets consumed by whichever subreddits are most active and
 * starves smaller/target subreddits entirely.
 *
 * This actor bills a flat $0.02 per run plus $0.002/result, so cost scales
 * with (subreddits x checks), which is why this runs on a longer, fixed
 * hourly cron rather than the tighter adaptive interval used for PullPush.
 */
export async function fetchNewPosts(keywords, subreddits) {
  const results = await Promise.all(
    subreddits.map(async (subreddit) => {
      const url = `https://api.apify.com/v2/acts/harshmaur~reddit-scraper/run-sync-get-dataset-items?token=${config.apify.apiToken}`;
      const res = await request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchTerms: keywords,
          withinCommunity: `r/${subreddit}`,
          searchSort: 'new',
          searchPosts: true,
          maxPostsCount: 5,
        }),
      });
      if (res.statusCode !== 201 && res.statusCode !== 200) {
        throw new Error(`Apify error for r/${subreddit}: ${res.statusCode}`);
      }
      const items = await res.body.json();
      return items.filter((item) => item.dataType === 'post');
    })
  );
  return results.flat();
}
