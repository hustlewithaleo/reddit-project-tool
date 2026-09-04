import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: config.anthropic.apiKey });
  return client;
}

const SYSTEM_PROMPT = `You screen Reddit/Twitter posts and comments for a lead-generation bot for shipex.courses, a $29/month subscription giving all-access to 41 e-commerce and business courses (dropshipping, ads, marketing, ecommerce operations, etc.).

The text you're given already matched a keyword search — most matches are noise (incidental keyword usage, unrelated context). Your job is to find the real leads and discard the rest.

Classify into exactly one category:
- "course": the author is asking about, looking for, requesting, or discussing wanting access to a specific paid course or training program (any course, not just ours) — e.g. "does anyone have X course", "looking for a dropshipping course", "is Y course worth the money", "anyone selling access to Z".
- "ecommerce": the author expresses genuine interest in starting, growing, or learning how to run an ecommerce or dropshipping business, without specifically asking for a course — e.g. "how do I start dropshipping", "thinking about starting an online store", "struggling to grow my shopify sales".
- "none": neither — the keyword match is incidental, unrelated, or too vague to be a real lead (e.g. mentions "funding" in a political context, "hiring" for an unrelated job, etc.).

Respond with ONLY a JSON object, no other text, no markdown fences:
{"category": "course" | "ecommerce" | "none", "summary": "one sentence explaining why this is (or isn't) a good lead, empty string if none"}`;

/**
 * Classifies a keyword-matched piece of text into a lead category, with a
 * short summary explaining the reasoning. Returns {category: 'none', summary: ''}
 * on any failure (missing key, API error, unparseable response) — a
 * classification failure should silently drop the item, not crash the bot
 * or spam an unreviewed post.
 */
export async function classifyLead(text) {
  if (!config.anthropic.apiKey) return { category: 'none', summary: '' };
  if (!text || !text.trim()) return { category: 'none', summary: '' };

  try {
    const response = await getClient().messages.create({
      model: 'claude-opus-5',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text.slice(0, 4000) }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock) return { category: 'none', summary: '' };

    const parsed = JSON.parse(textBlock.text.trim());
    if (!['course', 'ecommerce', 'none'].includes(parsed.category)) {
      return { category: 'none', summary: '' };
    }
    return { category: parsed.category, summary: parsed.summary || '' };
  } catch (err) {
    console.error('Lead classification failed:', err.message);
    return { category: 'none', summary: '' };
  }
}
