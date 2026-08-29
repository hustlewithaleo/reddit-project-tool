import { request } from 'undici';
import { config } from './config.js';

let token = null;
let tokenExpiresAt = 0;

async function getToken() {
  if (token && Date.now() < tokenExpiresAt) return token;

  const basicAuth = Buffer.from(
    `${config.reddit.clientId}:${config.reddit.clientSecret}`
  ).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'password',
    username: config.reddit.username,
    password: config.reddit.password,
  });

  const res = await request('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': config.reddit.userAgent,
    },
    body: body.toString(),
  });

  if (res.statusCode !== 200) {
    throw new Error(`Failed to get Reddit token: ${res.statusCode}`);
  }

  const data = await res.body.json();
  if (!data.access_token) {
    throw new Error(`Reddit token response missing access_token: ${JSON.stringify(data)}`);
  }
  token = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return token;
}

/**
 * Fetches newest posts across the configured subreddits via the official
 * OAuth API.
 */
export async function fetchNewPosts(subreddits, limit = 25) {
  const accessToken = await getToken();
  const multi = subreddits.join('+');
  const url = `https://oauth.reddit.com/r/${multi}/new?limit=${limit}`;

  const res = await request(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': config.reddit.userAgent,
    },
  });

  if (res.statusCode !== 200) {
    throw new Error(`Reddit API error: ${res.statusCode}`);
  }

  const data = await res.body.json();
  return data.data.children.map((c) => c.data);
}
