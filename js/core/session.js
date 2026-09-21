/* Official Brain Test sessions.

   A session is saved after every game starts and every game ends, so a refresh,
   a closed tab or a browser restart never costs more than the game in progress.
   A timed game cannot be fairly resumed halfway through, so an interrupted game
   restarts from its beginning, and the restart is recorded.

   Ranking rule: a session is leaderboard-eligible only if it was the player's
   first Brain Test of that local day and no game had to be restarted. Practice
   rounds never enter a session. */

import { get, set, localDay } from './storage.js';
import { GAMES } from './games.js';
import { abilityFor } from './profile.js';
import { randomSeed, hashSeed } from './rng.js';
import { SCORING_VERSION } from './result.js';
import { track } from './analytics.js';

export const PROTOCOL_VERSION = 1;

const CURRENT_KEY = 'session:current';
const LIST_KEY = 'sessions:list';
const sessionKey = (id) => `session:${id}`;
const iso = (ts) => new Date(ts).toISOString();

/** The official games, in test order (the registry order). */
export function officialOrder() {
  return GAMES.filter((g) => !g.locked && g.official).map((g) => g.id);
}

/** Rough length of the whole test, from each game's typical official duration. */
export function testMinutes() {
  return Math.round(GAMES.filter((g) => !g.locked && g.official).reduce((a, g) => a + (g.minutes || 1.5), 0));
}

/** Fixed settings a game is played at in the official test. */
export function officialSettings(gameId) {
  const g = GAMES.find((x) => x.id === gameId);
  return g && g.official ? { ...g.official } : null;
}

/** Per-game seed derived from the session seed: same session, same stimuli. */
export const gameSeed = (session, gameId) => hashSeed(session.seed, gameId);

/* ------------------------------------------------ pure transitions (tested) */

export function createSession({ id, seed, order, now, day, attemptOfDay }) {
  return {
    id,
    kind: 'brain-test',
    protocolVersion: PROTOCOL_VERSION,
    seed,
    order: order.slice(),
    index: 0,
    status: 'in_progress',
    createdAt: iso(now),
    updatedAt: iso(now),
    completedAt: null,
    localDay: day,
    attemptOfDay,
    attempts: {},
    results: {},
    summary: null
  };
}

export const currentGameId = (s) => (s.status === 'in_progress' ? s.order[s.index] ?? null : null);

/** Games started more than once were interrupted and replayed. */
export function interruptions(s) {
  return Object.values(s.attempts).reduce((sum, n) => sum + Math.max(0, n - 1), 0);
}

export function beginGame(s, gameId, now) {
  if (gameId !== currentGameId(s)) throw new Error(`expected ${currentGameId(s)}, got ${gameId}`);
  s.attempts[gameId] = (s.attempts[gameId] || 0) + 1;
  s.updatedAt = iso(now);
  return s;
}

export function finishGame(s, gameId, result, now) {
  if (gameId !== currentGameId(s)) throw new Error(`expected ${currentGameId(s)}, got ${gameId}`);
  s.results[gameId] = result;
  s.index += 1;
  s.updatedAt = iso(now);
  if (s.index >= s.order.length) {
    s.status = 'completed';
    s.completedAt = iso(now);
    s.summary = summarize(s);
  }
  return s;
}

/** The Brain Profile for one session: per-ability scores and the overall score. */
export function summarize(s) {
  const abilities = s.order.map((gameId) => {
    const a = abilityFor(gameId);
    const r = s.results[gameId];
    return {
      gameId,
      id: a ? a.id : gameId,
      name: a ? a.name : gameId,
      icon: a ? a.icon : '',
      score: r && typeof r.score === 'number' ? r.score : null
    };
  });
  const scored = abilities.filter((a) => a.score !== null);
  const reasons = [];
  if (scored.length < s.order.length) reasons.push('Not every game produced a valid score.');
  if (interruptions(s) > 0) reasons.push('A game was restarted after an interruption.');
  if (s.attemptOfDay > 1) reasons.push('Only the first Brain Test of the day counts toward rankings.');
  return {
    overall: scored.length ? Math.round(scored.reduce((a, b) => a + b.score, 0) / scored.length) : null,
    abilities,
    measured: scored.length,
    total: s.order.length,
    interruptions: interruptions(s),
    eligible: s.status === 'completed' && reasons.length === 0,
    reasons,
    scoringVersion: SCORING_VERSION
  };
}

/* ------------------------------------------------------------ persistence */

function listEntry(s) {
  return {
    id: s.id,
    localDay: s.localDay,
    status: s.status,
    createdAt: s.createdAt,
    completedAt: s.completedAt,
    gamesCompleted: s.index,
    overall: s.summary ? s.summary.overall : null,
    eligible: s.summary ? s.summary.eligible : false
  };
}

async function save(s) {
  await set(sessionKey(s.id), s);
  const list = await get(LIST_KEY, []);
  const i = list.findIndex((x) => x.id === s.id);
  if (i >= 0) list[i] = listEntry(s); else list.push(listEntry(s));
  await set(LIST_KEY, list);
}

export async function getSession(id) {
  return get(sessionKey(id), null);
}

export async function listSessions() {
  return get(LIST_KEY, []);
}

export async function getCurrentSession() {
  const id = await get(CURRENT_KEY, null);
  if (!id) return null;
  const s = await getSession(id);
  return s && s.status === 'in_progress' ? s : null;
}

export async function startSession() {
  const day = localDay();
  const list = await listSessions();
  const s = createSession({
    id: 'bt_' + Date.now().toString(36) + '_' + randomSeed().toString(36),
    seed: randomSeed(),
    order: officialOrder(),
    now: Date.now(),
    day,
    attemptOfDay: list.filter((x) => x.localDay === day).length + 1
  });
  await save(s);
  await set(CURRENT_KEY, s.id);
  track('brain_test_started', { session_id: s.id, protocol_version: PROTOCOL_VERSION, attempt_of_day: s.attemptOfDay });
  return s;
}

export async function markGameStarted(s, gameId) {
  beginGame(s, gameId, Date.now());
  await save(s);
  track('game_started', {
    game_id: gameId, session_id: s.id, attempt: s.attempts[gameId],
    difficulty: officialSettings(gameId)?.difficulty ?? null, start_time: new Date().toISOString()
  });
}

export async function recordGameResult(s, gameId, result) {
  finishGame(s, gameId, result, Date.now());
  await save(s);
  if (s.status === 'completed') {
    await set(CURRENT_KEY, null);
    track('brain_test_completed', {
      session_id: s.id, overall: s.summary.overall, eligible: s.summary.eligible,
      completion_time: s.completedAt
    });
  }
  return s;
}

export async function abandonSession(s) {
  s.status = 'abandoned';
  s.updatedAt = iso(Date.now());
  await save(s);
  await set(CURRENT_KEY, null);
  track('brain_test_abandoned', { session_id: s.id, games_completed: s.index });
}
