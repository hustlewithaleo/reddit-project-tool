import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const MAX_SEEN = 5000;

function load() {
  if (!existsSync(config.seenFilePath)) return [];
  try {
    return JSON.parse(readFileSync(config.seenFilePath, 'utf-8'));
  } catch {
    return [];
  }
}

let seen = new Set(load());

export function hasSeen(id) {
  return seen.has(id);
}

export function markSeen(id) {
  seen.add(id);
  if (seen.size > MAX_SEEN) {
    const trimmed = Array.from(seen).slice(-MAX_SEEN);
    seen = new Set(trimmed);
  }
}

export function persist() {
  mkdirSync(path.dirname(config.seenFilePath), { recursive: true });
  writeFileSync(config.seenFilePath, JSON.stringify(Array.from(seen)));
}
