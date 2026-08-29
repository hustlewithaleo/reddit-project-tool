import { request, ProxyAgent } from 'undici';
import { config } from './config.js';

let proxyIndex = 0;

function nextProxy() {
  if (config.proxies.length === 0) return null;
  const proxy = config.proxies[proxyIndex % config.proxies.length];
  proxyIndex += 1;
  return proxy;
}

/**
 * Fetches newest posts across the given subreddits from Reddit's public
 * JSON endpoint, rotating through the configured proxy list (if any) to
 * spread requests across IPs.
 */
export async function fetchNewPosts(subreddits, limit = 25) {
  const multi = subreddits.join('+');
  const url = `https://www.reddit.com/r/${multi}/new.json?limit=${limit}`;
  const proxyUrl = nextProxy();

  const res = await request(url, {
    headers: { 'User-Agent': config.userAgent },
    dispatcher: proxyUrl ? new ProxyAgent(proxyUrl) : undefined,
  });

  if (res.statusCode !== 200) {
    throw new Error(`Reddit endpoint error: ${res.statusCode}`);
  }

  const data = await res.body.json();
  return data.data.children.map((c) => c.data);
}
