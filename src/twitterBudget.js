import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const budgetFilePath = path.join(__dirname, '..', 'data', 'twitter-budget.json');

const MONTHLY_CAP_USD = Number(process.env.TWITTER_MONTHLY_BUDGET_USD || 20);
const COST_PER_TWEET_USD = 0.15 / 1000;

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

function load() {
  if (!existsSync(budgetFilePath)) return { month: currentMonthKey(), spentUsd: 0 };
  try {
    const data = JSON.parse(readFileSync(budgetFilePath, 'utf-8'));
    if (data.month !== currentMonthKey()) return { month: currentMonthKey(), spentUsd: 0 };
    return data;
  } catch {
    return { month: currentMonthKey(), spentUsd: 0 };
  }
}

let state = load();

function persist() {
  mkdirSync(path.dirname(budgetFilePath), { recursive: true });
  writeFileSync(budgetFilePath, JSON.stringify(state, null, 2));
}

function refreshMonth() {
  const key = currentMonthKey();
  if (state.month !== key) {
    state = { month: key, spentUsd: 0 };
    persist();
  }
}

export const twitterBudget = {
  hasBudget() {
    refreshMonth();
    return state.spentUsd < MONTHLY_CAP_USD;
  },
  recordTweets(count) {
    refreshMonth();
    state.spentUsd += count * COST_PER_TWEET_USD;
    persist();
  },
  getStatus() {
    refreshMonth();
    return { spentUsd: state.spentUsd, capUsd: MONTHLY_CAP_USD, month: state.month };
  },
};
