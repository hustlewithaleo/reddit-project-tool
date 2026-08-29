import { request } from 'undici';
import { config } from './config.js';

function buildQuery(keywords) {
  return keywords.map((k) => `"${k}"`).join(' OR ');
}

/**
 * Fetches the latest tweets matching any of the given keywords via
 * TwitterAPI.io's advanced search. Pulls a single page per call (up to
 * 20 tweets) — that's the natural cap on both request volume and cost,
 * since billing is per tweet returned.
 */
export async function fetchNewTweets(keywords) {
  if (!config.twitter.apiKey) return [];

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
