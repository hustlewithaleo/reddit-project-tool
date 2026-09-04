import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const defaults = {
  subreddits: ['entrepreneur', 'smallbusiness'],
  keywords: [],
  courseChannelId: null,
};

function load() {
  if (!existsSync(config.storeFilePath)) return { ...defaults };
  try {
    return { ...defaults, ...JSON.parse(readFileSync(config.storeFilePath, 'utf-8')) };
  } catch {
    return { ...defaults };
  }
}

let state = load();

function persist() {
  mkdirSync(path.dirname(config.storeFilePath), { recursive: true });
  writeFileSync(config.storeFilePath, JSON.stringify(state, null, 2));
}

export const store = {
  getSubreddits: () => [...state.subreddits],
  addSubreddit(name) {
    const clean = name.trim().toLowerCase().replace(/^r\//, '');
    if (state.subreddits.includes(clean)) return false;
    state.subreddits.push(clean);
    persist();
    return true;
  },
  removeSubreddit(name) {
    const clean = name.trim().toLowerCase().replace(/^r\//, '');
    const before = state.subreddits.length;
    state.subreddits = state.subreddits.filter((s) => s !== clean);
    persist();
    return state.subreddits.length < before;
  },

  getKeywords: () => [...state.keywords],
  addKeyword(word) {
    const clean = word.trim().toLowerCase();
    if (state.keywords.includes(clean)) return false;
    state.keywords.push(clean);
    persist();
    return true;
  },
  removeKeyword(word) {
    const clean = word.trim().toLowerCase();
    const before = state.keywords.length;
    state.keywords = state.keywords.filter((k) => k !== clean);
    persist();
    return state.keywords.length < before;
  },

  getCourseChannelId: () => state.courseChannelId,
  setCourseChannelId(id) {
    state.courseChannelId = id;
    persist();
  },
};
