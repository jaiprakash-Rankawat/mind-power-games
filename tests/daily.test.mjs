/* The Daily Brain Check: five shortened games, a seed shared by everyone each day,
   and XP toward the Brain Level. Every shortened game must still produce a score,
   and XP must reward a counted check and its bests - never a practice run. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abilityFor } from '../js/core/profile.js';
import { createRng } from '../js/core/rng.js';
import { officialConfig } from '../js/core/game-kit.js';
import { beginGame, finishGame } from '../js/core/session.js';
import {
  DAILY_GAMES, dailyOrder, dailyMinutes, dailySettings, daySeed, levelFor, XP,
  createCheck, summarizeCheck, isStale, gameRecords, untilNextCheck
} from '../js/core/daily.js';
import * as reaction from '../js/games/logic/reaction-logic.js';
import * as storm from '../js/games/logic/attention-storm-logic.js';
import * as tracking from '../js/games/logic/visual-tracking-logic.js';

const MODES = {};
for (const id of dailyOrder()) MODES[id] = (await import(`../js/games/${id}.js`)).MODES;
const cfgFor = (id) => officialConfig(MODES[id], dailySettings(id));

/* ------------------------------------------------------------- settings */

test('daily check: five games in the chosen order, about five minutes', () => {
  assert.deepEqual(dailyOrder(), ['stroop', 'reaction', 'sequence-recall', 'attention-storm', 'visual-tracking']);
  assert.equal(dailyMinutes(), 5);
  for (const id of dailyOrder()) {
    assert.ok(abilityFor(id), `${id} has a scoring curve`);
    assert.equal(dailySettings(id).difficulty, 'medium');
  }
});

test('daily check: every shortened setting is a real setting of its game, and only ever shorter', () => {
  for (const g of DAILY_GAMES) {
    const medium = MODES[g.id].medium;
    for (const [key, value] of Object.entries(g.settings.overrides || {})) {
      assert.ok(key in medium, `${g.id} has a "${key}" setting`);
      assert.ok(value < medium[key], `${g.id}.${key} is shorter than the Brain Test's`);
    }
    assert.equal(cfgFor(g.id).key, 'medium');
  }
  // the Brain Test passes no overrides, so it still plays the full Medium round
  assert.deepEqual(officialConfig(MODES.reaction, { difficulty: 'medium' }), MODES.reaction.medium);
});

test('daily check: a shortened Reaction Speed round is scored, even with two guesses', () => {
  const cfg = cfgFor('reaction');
  const { simple, choice } = reaction.planTrials(createRng(7), cfg);
  const log = (t, rt, response) => ({ ...t, response, rt, outcome: reaction.outcomeOf({ ...t, rt, response }), falseStarts: 0 });
  const trials = [
    ...simple.map((t, i) => log(t, i < 2 ? 60 : 290, null)),          // two anticipations
    ...choice.map((t) => log(t, 460, t.target))
  ];
  const native = { mode: cfg.key, ...reaction.summarize(trials, cfg) };
  assert.equal(native.simpleValid, cfg.simple - 2);
  assert.equal(typeof abilityFor('reaction').score(native), 'number');
});

test('daily check: a shortened Attention Storm round is scored', () => {
  const cfg = cfgFor('attention-storm');
  const rng = createRng(11);
  const stimuli = [];
  for (let block = 1; block <= cfg.blocks; block++) {
    for (const s of storm.makeBlock(rng, cfg)) {
      const responded = s.kind === 'target';
      stimuli.push({ ...s, block, level: cfg.startLevel, responded, rt: responded ? 450 : null });
    }
  }
  const native = { mode: cfg.key, ...storm.summarize(stimuli) };
  assert.ok(native.total >= 40 && native.hits + native.misses >= 8);
  assert.equal(typeof abilityFor('attention-storm').score(native), 'number');
});

test('daily check: a shortened Visual Tracking round is scored', () => {
  const cfg = cfgFor('visual-tracking');
  const trials = Array.from({ length: cfg.trials }, (_, i) =>
    ({ level: 3, speed: tracking.speedFor(3), correct: i % 3 !== 2, rt: 1300 }));
  const native = { mode: cfg.key, objects: cfg.n, ...tracking.summarize(trials) };
  assert.equal(typeof abilityFor('visual-tracking').score(native), 'number');
});

test('daily check: everyone gets the same seed on the same day, and a new one the next day', () => {
  assert.equal(daySeed('2026-09-22'), daySeed('2026-09-22'));
  assert.notEqual(daySeed('2026-09-22'), daySeed('2026-09-23'));
});

/* ---------------------------------------------------------- Brain Level */

test('brain level: 150 XP reaches level 2, and each level after needs 50 more', () => {
  assert.deepEqual(levelFor(0), { level: 1, into: 0, need: 150, xp: 0 });
  assert.equal(levelFor(149).level, 1);
  assert.deepEqual(levelFor(150), { level: 2, into: 0, need: 200, xp: 150 });
  assert.deepEqual(levelFor(150 + 200 + 250 + 10), { level: 4, into: 10, need: 300, xp: 610 });
  let prev = 1;
  for (let xp = 0; xp < 20000; xp += 37) {
    const { level } = levelFor(xp);
    assert.ok(level >= prev, 'more XP never lowers the level');
    prev = level;
  }
});

/* ---------------------------------------------------------- the results */

let n = 0;
function playCheck({ counted = true, day = '2026-09-20', scores }) {
  const s = createCheck({ id: 'c' + (++n), day, counted, seed: daySeed(day), now: n * 1000 });
  s.order.forEach((id, i) => { beginGame(s, id, i); finishGame(s, id, { gameId: id, score: scores[i] }, n * 1000 + i); });
  return s;
}
const entry = (s) => ({
  id: s.id, localDay: s.localDay, counted: s.counted, status: s.status, completedAt: s.completedAt,
  score: s.summary.score, xp: s.summary.xp,
  abilities: Object.fromEntries(s.order.map((id) => [id, s.results[id].score]))
});

test('xp: the first check earns completion plus its score, and sets a baseline rather than bests', () => {
  const s = playCheck({ scores: [50, 60, 40, 70, 30] });
  const sum = summarizeCheck(s, []);
  assert.equal(sum.score, 50);
  assert.equal(sum.lastScore, null);
  assert.equal(sum.delta, null);
  assert.ok(sum.abilities.every((a) => !a.isBest && a.best === null));
  assert.equal(sum.xp, XP.finish + 50);
});

test('xp: beating a game best, and then the best score, earns extra', () => {
  const first = playCheck({ scores: [50, 60, 40, 70, 30] });
  first.summary = summarizeCheck(first, []);

  // Color Clash and Sequence Recall beat their bests; the score only ties
  const second = playCheck({ day: '2026-09-21', scores: [55, 60, 45, 70, 20] });
  const sum = summarizeCheck(second, [entry(first)]);
  assert.deepEqual(sum.abilities.filter((a) => a.isBest).map((a) => a.gameId), ['stroop', 'sequence-recall']);
  assert.equal(sum.abilities[0].delta, 5);
  assert.equal(sum.abilities[4].delta, -10);
  assert.equal(sum.delta, 0);
  assert.equal(sum.isBestScore, false);
  assert.equal(sum.xp, XP.finish + 50 + 2 * XP.gameBest);
  second.summary = sum;

  const third = playCheck({ day: '2026-09-22', scores: [56, 61, 46, 71, 31] });
  const top = summarizeCheck(third, [entry(first), entry(second)]);
  assert.equal(top.score, 53);
  assert.equal(top.isBestScore, true);
  assert.equal(top.abilities.filter((a) => a.isBest).length, 5);
  assert.equal(top.xp, XP.finish + 53 + 5 * XP.gameBest + XP.scoreBest);
});

test('xp: a practice run earns nothing and never sets a best, but still compares', () => {
  const today = playCheck({ scores: [50, 60, 40, 70, 30] });
  today.summary = summarizeCheck(today, []);
  const practice = playCheck({ counted: false, scores: [90, 90, 90, 90, 90] });
  const sum = summarizeCheck(practice, [entry(today)]);
  assert.equal(sum.xp, 0);
  assert.deepEqual(sum.xpParts, []);
  assert.equal(sum.isBestScore, false);
  assert.ok(sum.abilities.every((a) => !a.isBest));
  assert.equal(sum.delta, 40);
});

test('daily check: a game with no valid score is left out of the check score, not counted as zero', () => {
  const s = playCheck({ scores: [60, null, 40, 80, 20] });
  const sum = summarizeCheck(s, []);
  assert.equal(sum.measured, 4);
  assert.equal(sum.score, 50);
});

test('daily check: records keep each game best and most recent score', () => {
  const a = playCheck({ scores: [50, 60, 40, 70, 30] });
  a.summary = summarizeCheck(a, []);
  const b = playCheck({ day: '2026-09-21', scores: [45, null, 55, 70, 35] });
  b.summary = summarizeCheck(b, [entry(a)]);
  const r = gameRecords([entry(a), entry(b)]);
  assert.deepEqual(r.stroop, { best: 50, last: 45 });
  assert.deepEqual(r.reaction, { best: 60, last: 60 }, 'a missing score falls back to the one before');
  assert.deepEqual(r['sequence-recall'], { best: 55, last: 55 });
});

test('daily check: an unfinished check from an earlier day cannot be resumed', () => {
  const s = createCheck({ id: 'x', day: '2026-09-21', counted: true, seed: 1, now: 0 });
  assert.equal(isStale(s, '2026-09-21'), false);
  assert.equal(isStale(s, '2026-09-22'), true);
  s.status = 'completed';
  assert.equal(isStale(s, '2026-09-22'), false);
});

test('daily check: the countdown runs to local midnight', () => {
  assert.equal(untilNextCheck(new Date(2026, 8, 22, 18, 30)), '5h 30m');
  assert.equal(untilNextCheck(new Date(2026, 8, 22, 23, 59, 30)), '1m');
});
