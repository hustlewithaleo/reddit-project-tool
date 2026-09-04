import { request } from 'undici';
import { config } from './config.js';
import { twitterBudget } from './twitterBudget.js';

// TwitterAPI.io's advanced search silently returns zero results once too
// many terms are OR'd into one query (confirmed: ~24 terms works, ~40
// doesn't — no error, just an empty result). 20 keeps a safety margin.
const BATCH_SIZE = 20;

function buildQuery(keywords) {
  return keywords.map((k) => `"${k}"`).join(' OR ');
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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

  for (const batch of batches) {
    if (!twitterBudget.hasBudget()) {
      console.warn(
        `Twitter/X monthly budget cap reached — skipping remaining keyword batches this check.`
      );
      break;
    }
    try {
      const tweets = await fetchBatch(batch);
      twitterBudget.recordTweets(tweets.length);
      results.push(...tweets);
    } catch (err) {
      console.error('Twitter/X batch failed:', err.message);
    }
  }

  return results;
}
