import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, hashSeed, randomSeed } from '../js/core/rng.js';
import { median, slope, sd } from '../js/core/stats.js';
import { makeResult } from '../js/core/result.js';
import { createSession, beginGame, finishGame, currentGameId, interruptions, summarize } from '../js/core/session.js';

/* ------------------------------------------------------------------ rng */

test('rng: same seed gives the same sequence, different seeds differ', () => {
  const a = createRng(42), b = createRng(42), c = createRng(43);
  const sa = Array.from({ length: 50 }, () => a.next());
  assert.deepEqual(sa, Array.from({ length: 50 }, () => b.next()));
  assert.notDeepEqual(sa, Array.from({ length: 50 }, () => c.next()));
});

test('rng: values stay in range and cover it', () => {
  const r = createRng(7);
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const v = r.between(1, 9);
    assert.ok(v >= 1 && v <= 9 && Number.isInteger(v));
    seen.add(v);
    const f = r.next();
    assert.ok(f >= 0 && f < 1);
  }
  assert.equal(seen.size, 9);
});

test('rng: shuffle keeps every element exactly once', () => {
  const r = createRng(1);
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = r.shuffle(src);
  assert.deepEqual([...out].sort(), [...src].sort());
  assert.deepEqual(src, [1, 2, 3, 4, 5, 6, 7, 8], 'input untouched');
});

test('rng: hashSeed is deterministic and separates games', () => {
  assert.equal(hashSeed(123, 'stroop'), hashSeed(123, 'stroop'));
  assert.notEqual(hashSeed(123, 'stroop'), hashSeed(123, 'n-back'));
  const s = randomSeed();
  assert.ok(Number.isInteger(s) && s >= 0 && s < 2 ** 32);
});

/* ---------------------------------------------------------------- stats */

test('stats: median, sd and slope', () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
  assert.equal(Math.round(sd([2, 4, 4, 4, 5, 5, 7, 9]) * 1000) / 1000, 2.138);
  assert.equal(slope([45, 90, 135, 180], [1000, 1200, 1400, 1600]), 400 / 90);
});

/* ------------------------------------------------------ result envelope */

test('result: envelope keeps native metrics and raw data untouched', () => {
  const native = { mode: 'medium', score: 3100, correct: 40, wrong: 2, accuracy: 95, avgRt: 760,
    startedAt: '2026-09-21T10:00:00.000Z', raw: { trials: [{ rt: 700 }], pauses: 0 } };
  const r = makeResult({ gameId: 'stroop', mode: 'official', difficulty: 'medium', native, protocolVersion: 1 });
  assert.equal(r.points, 3100);
  assert.equal(typeof r.score, 'number');
  assert.equal(r.totalQuestions, 42);
  assert.equal(r.reactionTimeMs, 760);
  assert.equal(r.startedAt, native.startedAt);
  assert.deepEqual(r.raw, native.raw);
  assert.equal(r.metrics.correct, 40);
  assert.equal('raw' in r.metrics, false, 'raw lives in one place only');
});

/* ------------------------------------------------------------- sessions */

const envelope = (score) => ({ score });

function playThrough(s, scores, now = 1000) {
  for (const g of s.order) {
    beginGame(s, g, now);
    finishGame(s, g, envelope(scores[g]), now);
  }
  return s;
}

test('session: plays through in order and completes', () => {
  const s = createSession({ id: 'x', seed: 1, order: ['stroop', 'memory-grid', 'n-back'], now: 0, day: '2026-09-21', attemptOfDay: 1 });
  assert.equal(currentGameId(s), 'stroop');
  assert.throws(() => beginGame(s, 'n-back', 1), /expected stroop/);
  playThrough(s, { stroop: 60, 'memory-grid': 70, 'n-back': 80 });
  assert.equal(s.status, 'completed');
  assert.equal(currentGameId(s), null);
  assert.equal(s.summary.overall, 70);
  assert.equal(s.summary.eligible, true);
});

test('session: a restarted game is counted and removes ranking eligibility', () => {
  const s = createSession({ id: 'y', seed: 1, order: ['stroop', 'memory-grid'], now: 0, day: '2026-09-21', attemptOfDay: 1 });
  beginGame(s, 'stroop', 1);
  beginGame(s, 'stroop', 2);            // refresh mid-game -> replay
  finishGame(s, 'stroop', envelope(50), 3);
  beginGame(s, 'memory-grid', 4);
  finishGame(s, 'memory-grid', envelope(50), 5);
  assert.equal(interruptions(s), 1);
  assert.equal(s.summary.eligible, false);
  assert.match(s.summary.reasons.join(' '), /restarted/);
});

test('session: only the first test of the day is eligible', () => {
  const s = createSession({ id: 'z', seed: 1, order: ['stroop'], now: 0, day: '2026-09-21', attemptOfDay: 2 });
  playThrough(s, { stroop: 90 });
  assert.equal(s.summary.eligible, false);
  assert.match(s.summary.reasons.join(' '), /first Brain Test of the day/);
});

test('session: a game with no valid score is excluded from the overall, not counted as zero', () => {
  const s = createSession({ id: 'w', seed: 1, order: ['stroop', 'memory-grid'], now: 0, day: '2026-09-21', attemptOfDay: 1 });
  playThrough(s, { stroop: 80, 'memory-grid': null });
  assert.equal(s.summary.overall, 80);
  assert.equal(s.summary.measured, 1);
  assert.equal(s.summary.eligible, false);
});

test('session: an in-progress session summary is never eligible', () => {
  const s = createSession({ id: 'v', seed: 1, order: ['stroop', 'memory-grid'], now: 0, day: '2026-09-21', attemptOfDay: 1 });
  beginGame(s, 'stroop', 1);
  finishGame(s, 'stroop', envelope(80), 2);
  assert.equal(summarize(s).eligible, false);
});

/* ------------------------------------------------- migration regression */

test('profile: first round on a fresh install is stored once, not twice', async () => {
  // In-memory stand-in for localStorage, so storage.js's fallback path runs in Node.
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    clear: () => mem.clear()
  };
  const { saveBest } = await import('../js/core/storage.js');
  const { logRun, getHistory } = await import('../js/core/profile.js');

  // what every game's finish() does, in this order, with no prior migration
  const result = { mode: 'easy', score: 900, span: 5, level: 5, accuracy: 80, taps: 20, seconds: 40,
    startedAt: new Date().toISOString(), raw: { attempts: [] } };
  await saveBest('memory-grid', 'easy', result);
  await logRun('memory-grid', result);
  assert.equal((await getHistory('memory-grid')).length, 1);

  // and a genuinely old best (no startedAt) is still imported for players upgrading
  mem.clear();
  mem.set('best:stroop:easy', JSON.stringify({ mode: 'easy', score: 3100, correct: 40, wrong: 2, accuracy: 95, avgRt: 760, date: '2026-09-10' }));
  await logRun('stroop', { mode: 'easy', score: 100, correct: 10, wrong: 0, accuracy: 100, avgRt: 700, startedAt: new Date().toISOString() });
  const h = await getHistory('stroop');
  assert.equal(h.length, 2);
  assert.equal(h[0].imported, true);
  delete globalThis.localStorage;
});
