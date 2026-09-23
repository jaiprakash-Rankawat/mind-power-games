/* The Daily Brain Check: five short games, about five minutes, once a day.

   The first check of each local day counts. It uses the day's seed, so everyone
   who plays that day gets the same stimuli; it earns XP toward the Brain Level;
   and it can set personal bests. Any further check that day is practice: fresh
   stimuli, no XP, no bests.

   Brain Level is a progression level, not a measurement. It only goes up, and it
   rises by coming back and by beating your own bests. The measurement is the
   check's 0-100 score: the mean of its five ability scores, on the same curves
   as everywhere else.

   Sessions reuse the Brain Test's state transitions (core/session.js), so a
   refresh or a closed tab resumes at the next game, and an interrupted game
   restarts from its beginning. */

import { get, set, localDay } from './storage.js';
import { abilityFor } from './profile.js';
import { randomSeed, hashSeed } from './rng.js';
import { SCORING_VERSION } from './result.js';
import { track } from './analytics.js';
import { beginGame, finishGame, interruptions } from './session.js';

/* Bump when the games or their settings change: the day's seed changes with it,
   and older checks stay comparable only with their own version. */
export const DAILY_VERSION = 1;

/* Medium settings, shortened where a game has trials to spare. Each still clears
   the minimum its score needs (see the curves in profile.js): Color Clash 8+
   answers, Reaction Speed 4+ valid trials per part, Attention Storm 40+ shapes
   with 8+ stars, Visual Tracking 6 rounds (paused rounds are replayed). Sequence
   Recall keeps its normal start - starting longer would score a span of 3 as 0. */
export const DAILY_GAMES = [
  { id: 'stroop',          settings: { difficulty: 'medium', overrides: { seconds: 40 } },          minutes: 0.8 },
  { id: 'reaction',        settings: { difficulty: 'medium', overrides: { simple: 6, choice: 10 } }, minutes: 0.9 },
  { id: 'sequence-recall', settings: { difficulty: 'medium' },                                      minutes: 1.2 },
  { id: 'attention-storm', settings: { difficulty: 'medium', overrides: { blocks: 2 } },            minutes: 1.2 },
  { id: 'visual-tracking', settings: { difficulty: 'medium', overrides: { trials: 6 } },            minutes: 1 }
];

export const dailyOrder = () => DAILY_GAMES.map((g) => g.id);
export const dailyMinutes = () => Math.round(DAILY_GAMES.reduce((a, g) => a + g.minutes, 0));

export function dailySettings(gameId) {
  const g = DAILY_GAMES.find((x) => x.id === gameId);
  return g ? { ...g.settings } : null;
}

/** The same seed for everyone on a given local day. */
export const daySeed = (day) => hashSeed('daily-check', DAILY_VERSION, day);

/** Time until the next local day, when a new check unlocks - e.g. "5h 12m". */
export function untilNextCheck(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.max(1, Math.ceil((next - now) / 60000));
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : `${mins}m`;
}

/* ------------------------------------------------------------ Brain Level */

export const XP = { finish: 100, gameBest: 25, scoreBest: 50 };

/** XP to climb from level n to n + 1: 150 for the first step, 50 more for each after. */
export const stepXp = (n) => 100 + 50 * n;

/** Level from total XP, with progress into the current level. */
export function levelFor(xp) {
  let left = Math.max(0, Math.floor(xp || 0));
  let level = 1;
  while (left >= stepXp(level)) { left -= stepXp(level); level += 1; }
  return { level, into: left, need: stepXp(level), xp: Math.max(0, Math.floor(xp || 0)) };
}

/* ------------------------------------------------ pure transitions (tested) */

export function createCheck({ id, day, counted, seed, now }) {
  const at = new Date(now).toISOString();
  return {
    id,
    kind: 'daily-check',
    version: DAILY_VERSION,
    seed,
    order: dailyOrder(),
    index: 0,
    status: 'in_progress',
    createdAt: at,
    updatedAt: at,
    completedAt: null,
    localDay: day,
    counted,
    attempts: {},
    results: {},
    summary: null
  };
}

/** A check left unfinished on an earlier day can't be resumed: the day's seed has moved on. */
export const isStale = (s, day) => s.status === 'in_progress' && s.localDay !== day;

const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const isNum = (v) => typeof v === 'number' && !Number.isNaN(v);

/**
 * The results of one finished check, compared with earlier counted checks.
 * prior: completed counted checks before this one, oldest first (list entries).
 */
export function summarizeCheck(s, prior) {
  const abilities = s.order.map((gameId) => {
    const a = abilityFor(gameId);
    const r = s.results[gameId];
    const score = r && isNum(r.score) ? r.score : null;
    const past = prior.map((p) => p.abilities && p.abilities[gameId]).filter(isNum);
    const best = past.length ? Math.max(...past) : null;
    const last = past.length ? past[past.length - 1] : null;
    return {
      gameId,
      id: a ? a.id : gameId,
      name: a ? a.name : gameId,
      score,
      best,
      last,
      delta: score !== null && last !== null ? score - last : null,
      // a best needs something to beat, and only a counted check can set one
      isBest: s.counted && score !== null && best !== null && score > best
    };
  });

  const scored = abilities.filter((a) => a.score !== null);
  const score = scored.length ? Math.round(mean(scored.map((a) => a.score))) : null;
  const pastScores = prior.map((p) => p.score).filter(isNum);
  const bestScore = pastScores.length ? Math.max(...pastScores) : null;
  const lastScore = pastScores.length ? pastScores[pastScores.length - 1] : null;
  const isBestScore = s.counted && score !== null && bestScore !== null && score > bestScore;

  const xpParts = [];
  if (s.counted) {
    xpParts.push({ label: 'Check complete', xp: XP.finish });
    if (score !== null) xpParts.push({ label: `Score ${score}`, xp: score });
    for (const a of abilities) if (a.isBest) xpParts.push({ label: `New best: ${a.name}`, xp: XP.gameBest });
    if (isBestScore) xpParts.push({ label: 'New best score', xp: XP.scoreBest });
  }

  return {
    score,
    lastScore,
    bestScore,
    delta: score !== null && lastScore !== null ? score - lastScore : null,
    isBestScore,
    abilities,
    measured: scored.length,
    total: s.order.length,
    interruptions: interruptions(s),
    counted: s.counted,
    xp: xpParts.reduce((sum, p) => sum + p.xp, 0),
    xpParts,
    scoringVersion: SCORING_VERSION
  };
}

/** Per-game best and most recent score across completed counted checks. */
export function gameRecords(checks) {
  const records = {};
  for (const id of dailyOrder()) {
    const past = checks.map((c) => c.abilities && c.abilities[id]).filter(isNum);
    records[id] = { best: past.length ? Math.max(...past) : null, last: past.length ? past[past.length - 1] : null };
  }
  return records;
}

/* ------------------------------------------------------------ persistence */

const CURRENT_KEY = 'daily:current';
const LIST_KEY = 'daily:list';
const checkKey = (id) => `daily:check:${id}`;

function listEntry(s) {
  const abilities = {};
  for (const [gameId, r] of Object.entries(s.results)) abilities[gameId] = r && isNum(r.score) ? r.score : null;
  return {
    id: s.id,
    localDay: s.localDay,
    status: s.status,
    counted: s.counted,
    createdAt: s.createdAt,
    completedAt: s.completedAt,
    gamesCompleted: s.index,
    score: s.summary ? s.summary.score : null,
    abilities,
    xp: s.summary ? s.summary.xp : 0
  };
}

async function save(s) {
  await set(checkKey(s.id), s);
  const list = await get(LIST_KEY, []);
  const i = list.findIndex((x) => x.id === s.id);
  if (i >= 0) list[i] = listEntry(s); else list.push(listEntry(s));
  await set(LIST_KEY, list);
}

export const listChecks = () => get(LIST_KEY, []);
export const getCheck = (id) => get(checkKey(id), null);

/** Completed counted checks, oldest first. */
const countedDone = (list) => list.filter((x) => x.counted && x.status === 'completed')
  .sort((a, b) => a.completedAt.localeCompare(b.completedAt));

/** The check in progress, if it can still be resumed today. */
export async function getCurrentCheck() {
  const id = await get(CURRENT_KEY, null);
  if (!id) return null;
  const s = await getCheck(id);
  if (!s || s.status !== 'in_progress') return null;
  if (isStale(s, localDay())) {
    s.status = 'abandoned';
    s.updatedAt = new Date().toISOString();
    await save(s);
    await set(CURRENT_KEY, null);
    track('daily_check_abandoned', { session_id: s.id, games_completed: s.index, reason: 'day_ended' });
    return null;
  }
  return s;
}

/** Everything the popup, profile and runner show about the daily check. */
export async function dailyState() {
  const day = localDay();
  const current = await getCurrentCheck();
  const list = await listChecks();
  const done = countedDone(list);
  const today = list.find((x) => x.localDay === day && x.counted) || null;
  const scores = done.map((x) => x.score).filter(isNum);
  return {
    day,
    current,
    today,                                   // today's counted check, finished or not
    doneToday: !!today && today.status === 'completed',
    level: levelFor(done.reduce((sum, x) => sum + (x.xp || 0), 0)),
    bestScore: scores.length ? Math.max(...scores) : null,
    lastScore: scores.length ? scores[scores.length - 1] : null,
    records: gameRecords(done),
    history: done
  };
}

export async function startCheck() {
  const day = localDay();
  const list = await listChecks();
  const counted = !list.some((x) => x.localDay === day && x.counted);
  const s = createCheck({
    id: 'dc_' + Date.now().toString(36) + '_' + randomSeed().toString(36),
    day,
    counted,
    seed: counted ? daySeed(day) : randomSeed(),
    now: Date.now()
  });
  await save(s);
  await set(CURRENT_KEY, s.id);
  track('daily_check_started', { session_id: s.id, counted, daily_version: DAILY_VERSION });
  return s;
}

export async function markCheckGameStarted(s, gameId) {
  beginGame(s, gameId, Date.now());
  await save(s);
  track('game_started', {
    game_id: gameId, session_id: s.id, source: 'daily', attempt: s.attempts[gameId],
    difficulty: dailySettings(gameId)?.difficulty ?? null, start_time: new Date().toISOString()
  });
}

export async function recordCheckResult(s, gameId, result) {
  finishGame(s, gameId, result, Date.now());
  if (s.status === 'completed') {
    const prior = countedDone(await listChecks()).filter((x) => x.id !== s.id);
    s.summary = summarizeCheck(s, prior);         // replaces the Brain Test summary finishGame wrote
  }
  await save(s);
  if (s.status === 'completed') {
    await set(CURRENT_KEY, null);
    track('daily_check_completed', {
      session_id: s.id, counted: s.counted, score: s.summary.score, xp: s.summary.xp,
      completion_time: s.completedAt
    });
  }
  return s;
}
