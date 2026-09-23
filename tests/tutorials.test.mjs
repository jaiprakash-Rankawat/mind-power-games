/* The how-to-play tutorials: every game has one, and every practice question has
   exactly the answer the tutorial says it has - a tutorial that teaches a wrong
   answer is worse than none. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../js/core/games.js';
import { ICON_IDS, iconSvg } from '../js/core/icons.js';
import {
  TUTORIALS, INK, STROOP_ITEMS, GRID_ITEMS, NBACK_SEQ, SWITCH_ITEMS, PATTERN_ITEMS,
  ROTATION_ITEMS, RECALL_ITEMS, STORM_STREAM, MAZE
} from '../js/core/tutorials.js';
import { shapeKey, rotations, mirror } from '../js/games/logic/spatial-logic.js';
import { SHAPES, TARGET } from '../js/games/logic/attention-storm-logic.js';
import { cheapestRoute } from '../js/games/logic/path-finder-logic.js';

const games = GAMES.filter((g) => !g.locked);

test('tutorials: every game has a goal, a worked example, practice and controls', () => {
  for (const g of games) {
    const t = TUTORIALS[g.id];
    assert.ok(t, `${g.id} has a tutorial`);
    assert.ok(t.goal && t.explain, `${g.id} states the rule`);
    assert.equal(typeof t.learn, 'function', `${g.id} has an example`);
    assert.equal(typeof t.practice.start, 'function', `${g.id} has practice`);
    assert.ok(t.practice.goal >= 1 && t.practice.intro, `${g.id} practice has a target`);
    assert.ok(t.ready.length >= 2, `${g.id} explains the controls`);
  }
  assert.deepEqual(Object.keys(TUTORIALS).sort(), games.map((g) => g.id).sort(), 'no tutorial without a game');
});

test('icons: every game has its own icon', () => {
  assert.deepEqual([...ICON_IDS].sort(), games.map((g) => g.id).sort());
  assert.equal(new Set(games.map((g) => iconSvg(g.id))).size, games.length);
  for (const g of games) assert.match(iconSvg(g.id), /^<svg viewBox="0 0 32 32"/);
});

test('tutorial answers: Color Clash words never match their ink', () => {
  for (const [word, ink] of STROOP_ITEMS) {
    assert.ok(INK[word] && INK[ink], 'both are colours on the buttons');
    assert.notEqual(word, ink);
  }
});

test('tutorial answers: Memory Grid paths use distinct tiles on the 3x3 grid', () => {
  for (const path of GRID_ITEMS) {
    assert.equal(new Set(path).size, path.length);
    assert.ok(path.every((t) => t >= 0 && t < 9));
  }
});

test('tutorial answers: the N-Back practice has matches and non-matches to decide', () => {
  const decisions = NBACK_SEQ.slice(2).map((p, i) => p === NBACK_SEQ[i]);
  assert.equal(decisions.length, TUTORIALS['n-back'].practice.goal);
  assert.ok(decisions.includes(true) && decisions.includes(false));
});

test('tutorial answers: Task Switch cards never show 5 and use both questions', () => {
  assert.ok(SWITCH_ITEMS.every(([d]) => d >= 1 && d <= 9 && d !== 5));
  assert.deepEqual([...new Set(SWITCH_ITEMS.map(([, rule]) => rule))].sort(), ['magnitude', 'parity']);
});

test('tutorial answers: each Number Pattern has one option that continues its rule', () => {
  const [add3, double, alternate] = PATTERN_ITEMS;
  const next = [add3.seq.at(-1) + 3, double.seq.at(-1) * 2, alternate.seq.at(-2) + 1];
  PATTERN_ITEMS.forEach((it, i) => {
    assert.equal(it.answer, next[i]);
    assert.equal(it.options.filter((o) => o === it.answer).length, 1);
    assert.equal(new Set(it.options).size, it.options.length);
  });
});

test('tutorial answers: every Spatial Rotation mirror really cannot be turned into its shape', () => {
  for (const it of ROTATION_ITEMS) {
    const turns = rotations(it.cells).map(shapeKey);
    assert.equal(turns.includes(shapeKey(mirror(it.cells))), false, 'the shape is chiral');
  }
  assert.ok(ROTATION_ITEMS.some((it) => it.mirror) && ROTATION_ITEMS.some((it) => !it.mirror));
});

test('tutorial answers: Sequence Recall sequences never repeat a digit twice in a row', () => {
  for (const seq of RECALL_ITEMS) {
    assert.ok(seq.every((d) => d >= 1 && d <= 9));
    assert.ok(seq.every((d, i) => i === 0 || d !== seq[i - 1]));
  }
});

test('tutorial answers: the Attention Storm stream has stars and every kind of look-alike', () => {
  assert.ok(STORM_STREAM.every((s) => SHAPES.includes(s)));
  assert.equal(STORM_STREAM[0] === TARGET, false, 'never opens with the star');
  assert.equal(STORM_STREAM.filter((s) => s === TARGET).length, TUTORIALS['attention-storm'].practice.goal);
  for (const lure of ['star6', 'star5-outline', 'star5-inverted']) assert.ok(STORM_STREAM.includes(lure));
});

test('tutorial answers: the Path Finder maze is solvable in 8 steps and has a dead end', () => {
  const best = cheapestRoute(MAZE, [0, 0], [4, 4]);
  assert.equal(best.steps, 8);
  assert.equal(MAZE[0][0], 'S');
  assert.equal(MAZE[4][4], 'F');
  // the open corridor down the left side reaches the bottom row but not the flag
  assert.equal(cheapestRoute(MAZE, [4, 0], [4, 4]).steps > 4, true);
});
