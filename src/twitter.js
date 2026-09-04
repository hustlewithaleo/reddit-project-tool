import { request } from 'undici';
import { config } from './config.js';
import { twitterBudget } from './twitterBudget.js';

// TwitterAPI.io's advanced search silently returns zero results once too
// many terms are OR'd into one query (confirmed: ~24 terms works, ~40
// doesn't — no error, just an empty result). 20 keeps a safety margin.
const BATCH_SIZE = 20;
// Firing all batches back-to-back hits TwitterAPI.io's requests-per-second
// limit (confirmed: 9 batches with no delay all came back 429). Spacing
// them out avoids that.
const DELAY_BETWEEN_BATCHES_MS = 1500;

function buildQuery(keywords) {
  return keywords.map((k) => `"${k}"`).join(' OR ');
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBatch(keywords) {
  const query = buildQuery(keywords);
  const url = `https://api.twitterapi.io/twitter/tweet/advanced_search?query=${encodeURIComponent(query)}&queryType=Latest&cursor=`;

  const res = await request(url, {
    headers: { 'X-API-Key': config.twitter.apiKey },
  });

  if (res.statusCode !== 200) {
    throw new Error(`TwitterAPI.io error: ${res.statusCode}`);
  }

  const data = await res.body.json();
  return data.tweets || [];
}

/**
 * Fetches the latest tweets matching any of the given keywords, batching
 * them (see BATCH_SIZE) since a single combined query silently breaks
 * past a certain length. Stops issuing further batches once the monthly
 * spend cap (see twitterBudget.js) is reached, since billing is per tweet
 * returned and more batches means more possible tweets billed.
 */
export async function fetchNewTweets(keywords) {
  if (!config.twitter.apiKey) return [];

  const batches = chunk(keywords, BATCH_SIZE);
  const results = [];

  for (let i = 0; i < batches.length; i++) {
    if (!twitterBudget.hasBudget()) {
      console.warn(
        `Twitter/X monthly budget cap reached — skipping remaining keyword batches this check.`
      );
      break;
    }
    try {
      const tweets = await fetchBatch(batches[i]);
      twitterBudget.recordTweets(tweets.length);
      results.push(...tweets);
    } catch (err) {
      console.error('Twitter/X batch failed:', err.message);
    }
    if (i < batches.length - 1) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  return results;
}
