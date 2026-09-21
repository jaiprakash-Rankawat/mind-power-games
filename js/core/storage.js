/* Thin wrapper over chrome.storage.local with a localStorage fallback,
   so pages still work when opened directly during development. */

const hasChromeStorage =
  typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

export async function get(key, fallback = null) {
  if (hasChromeStorage) {
    const res = await chrome.storage.local.get(key);
    return key in res ? res[key] : fallback;
  }
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function set(key, value) {
  if (hasChromeStorage) return chrome.storage.local.set({ [key]: value });
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota / private mode - scores are not critical */ }
}

export async function clearAll() {
  if (hasChromeStorage) return chrome.storage.local.clear();
  try { localStorage.clear(); } catch { /* ignore */ }
}

/* ---------- profile: cross-game totals + daily streak ---------- */

const PROFILE_KEY = 'profile';
const EMPTY_PROFILE = {
  rounds: 0,
  bestScore: 0,
  dayStreak: 0,
  lastPlayedDay: null
};

/** Local calendar day, YYYY-MM-DD. Streaks and daily tests follow the player's
    own clock, not UTC (UTC would move early-morning play to the previous day). */
export function localDay(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const today = () => localDay();

export async function getProfile() {
  return { ...EMPTY_PROFILE, ...(await get(PROFILE_KEY, {})) };
}

/** Call once per finished round. Returns the updated profile. */
export async function recordRound(score) {
  const p = await getProfile();
  const day = today();

  if (p.lastPlayedDay !== day) {
    const yesterday = localDay(Date.now() - 864e5);
    p.dayStreak = p.lastPlayedDay === yesterday ? p.dayStreak + 1 : 1;
    p.lastPlayedDay = day;
  }
  p.rounds += 1;
  p.bestScore = Math.max(p.bestScore, score);

  await set(PROFILE_KEY, p);
  return p;
}

/* ---------- per-game high scores ---------- */

export const bestKey = (gameId, mode) => `best:${gameId}:${mode}`;

/** Saves the run if it beats the stored best. Returns true when it is a new record. */
export async function saveBest(gameId, mode, run) {
  const key = bestKey(gameId, mode);
  const prev = await get(key, null);
  if (prev && prev.score >= run.score) return false;
  await set(key, { ...run, date: today() });
  return true;
}

export const getBest = (gameId, mode) => get(bestKey(gameId, mode), null);
