/* Pure-logic tests for the newer games: every stimulus must have exactly one
   objectively correct answer, plans must be reproducible from their seed, and
   metrics must be computed from the raw trials correctly. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import * as RX from '../js/games/logic/reaction-logic.js';

/* ------------------------------------------------------------ reaction */

test('reaction: plan is reproducible from its seed and within bounds', () => {
  const cfg = { simple: 8, choice: 16, choices: 4 };
  const a = RX.planTrials(createRng(99), cfg);
  const b = RX.planTrials(createRng(99), cfg);
  assert.deepEqual(a, b);
  assert.equal(a.simple.length, 8);
  for (const t of a.simple) assert.ok(t.foreperiod >= 900 && t.foreperiod <= 2600);
  for (const t of a.choice) assert.ok(t.foreperiod >= 700 && t.foreperiod <= 1800);
});

test('reaction: choice targets are balanced across slots', () => {
  for (const choices of [2, 4]) {
    const plan = RX.planTrials(createRng(5), { simple: 0, choice: 16, choices });
    const counts = Array(choices).fill(0);
    for (const t of plan.choice) counts[t.target] += 1;
    assert.ok(counts.every((c) => c === 16 / choices), `balanced for ${choices}: ${counts}`);
  }
});

test('reaction: keys map to exactly one slot', () => {
  assert.equal(RX.slotForKey('F', 2), 0);
  assert.equal(RX.slotForKey('ArrowRight', 2), 1);
  assert.equal(RX.slotForKey('k', 4), 3);
  assert.equal(RX.slotForKey('x', 4), -1);
});

test('reaction: outcomes - anticipation, error, timeout, hit', () => {
  assert.equal(RX.outcomeOf({ block: 'simple', rt: 60, target: null, response: null }), 'anticipation');
  assert.equal(RX.outcomeOf({ block: 'simple', rt: 250, target: null, response: null }), 'hit');
  assert.equal(RX.outcomeOf({ block: 'choice', rt: 400, target: 1, response: 0 }), 'error');
  assert.equal(RX.outcomeOf({ block: 'choice', rt: null, target: 1, response: null }), 'timeout');
  assert.equal(RX.outcomeOf({ block: 'choice', rt: 400, target: 1, response: 1 }), 'hit');
});

test('reaction: summary metrics come from valid trials only', () => {
  const trials = [
    { block: 'simple', rt: 250, outcome: 'hit', falseStarts: 1 },
    { block: 'simple', rt: 300, outcome: 'hit', falseStarts: 0 },
    { block: 'simple', rt: 40, outcome: 'anticipation', falseStarts: 0 },
    { block: 'simple', rt: 350, outcome: 'hit', falseStarts: 0 },
    { block: 'choice', rt: 400, outcome: 'hit' },
    { block: 'choice', rt: 500, outcome: 'hit' },
    { block: 'choice', rt: 450, outcome: 'error' },
    { block: 'choice', rt: null, outcome: 'timeout' }
  ];
  const m = RX.summarize(trials, { simple: 4, choice: 4, choices: 2 });
  assert.equal(m.simpleMedianRt, 300);
  assert.equal(m.simpleValid, 3);
  assert.equal(m.choiceMedianRt, 450);
  assert.equal(m.choiceAccuracy, 50);           // 2 hits of 4 scored choice trials
  assert.equal(m.choiceErrors, 1);
  assert.equal(m.timeouts, 1);
  assert.equal(m.anticipations, 1);
  assert.equal(m.falseStarts, 1);
  assert.equal(m.accuracy, 71);                 // 5 hits / 7 scored
});

/* --------------------------------------------------------- task switch */

import * as TS from '../js/games/logic/task-switch-logic.js';

test('task switch: every digit has exactly one answer under each rule; 5 never appears', () => {
  assert.ok(!TS.DIGITS.includes(5));
  assert.throws(() => TS.answerFor(5, 'magnitude'));
  for (const d of TS.DIGITS) {
    assert.equal(TS.answerFor(d, 'parity'), d % 2 ? 'left' : 'right');
    assert.equal(TS.answerFor(d, 'magnitude'), d < 5 ? 'left' : 'right');
  }
  assert.equal(TS.isCongruent(3), true);   // odd + low -> both left
  assert.equal(TS.isCongruent(4), false);  // even (right) + low (left)
});

test('task switch: sequences are reproducible, well-formed, and labelled correctly', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const cfg = { count: 36, pSwitch: 0.35 };
    const a = TS.makeSequence(createRng(seed), cfg);
    assert.deepEqual(a, TS.makeSequence(createRng(seed), cfg));
    assert.equal(a.length, 36);
    assert.equal(a[0].type, 'first');
    let run = 1;
    for (let i = 1; i < a.length; i++) {
      assert.notEqual(a[i].digit, a[i - 1].digit, 'no immediate digit repeat');
      assert.equal(a[i].type, a[i].rule === a[i - 1].rule ? 'repeat' : 'switch');
      assert.equal(a[i].answer, TS.answerFor(a[i].digit, a[i].rule));
      run = a[i].type === 'repeat' ? run + 1 : 1;
      assert.ok(run <= 5, 'no run longer than 5');
    }
    assert.ok(a.filter((t) => t.type === 'switch').length >= Math.floor(36 * 0.35 * 0.7), 'enough switches to measure');
  }
});

test('task switch: predictable mode switches exactly every 4 trials', () => {
  const a = TS.makeSequence(createRng(7), { count: 32, predictable: true, runLength: 4 });
  for (let i = 1; i < a.length; i++) assert.equal(a[i].type, i % 4 === 0 ? 'switch' : 'repeat');
});

test('task switch: switch cost = median correct switch RT - median correct repeat RT', () => {
  const t = (type, correct, rt) => ({ type, correct, rt });
  const m = TS.summarize([
    t('first', true, 900),
    t('repeat', true, 500), t('repeat', true, 600), t('repeat', false, 400),
    t('switch', true, 700), t('switch', true, 800), t('switch', false, 300), t('switch', false, null)
  ]);
  assert.equal(m.rtRepeat, 550);
  assert.equal(m.rtSwitch, 750);
  assert.equal(m.switchCost, 200);
  assert.equal(m.switchErrors, 2);
  assert.equal(m.repeatErrors, 1);
  assert.equal(m.switchAccuracy, 50);
  assert.equal(m.timeouts, 1);
  assert.equal(m.correct, 5);
  assert.equal(m.accuracy, 63);
});

/* ------------------------------------------------------- number pattern */

import * as NP from '../js/games/logic/number-pattern-logic.js';

test('number pattern: fitters recognise their own families', () => {
  assert.deepEqual(NP.FITTERS.arithmetic([3, 7, 11, 15, 19, 23]), [27]);
  assert.deepEqual(NP.FITTERS.geometric([2, 6, 18, 54, 162, 486]), [1458]);
  assert.deepEqual(NP.FITTERS.secondOrder([1, 3, 7, 13, 21, 31]), [43]);
  assert.deepEqual(NP.FITTERS.fibonacci([2, 3, 5, 8, 13, 21]), [34]);
  assert.deepEqual(NP.FITTERS.alternating([2, 50, 5, 46, 8, 42]), [11]);
  assert.deepEqual(NP.FITTERS.diffsGeometric([1, 2, 4, 8, 16, 32]), [64]);
  assert.deepEqual(NP.FITTERS.affine([1, 3, 7, 15, 31, 63]), [127]);
  assert.ok(NP.FITTERS.altOps([1, 3, 6, 8, 16, 18]).includes(36));
  assert.deepEqual(NP.FITTERS.arithmetic([1, 2, 4, 8, 16, 32]), []);
});

test('number pattern: every item at every level has exactly one defensible answer', () => {
  const families = new Set();
  for (let level = 1; level <= NP.LEVELS; level++) {
    for (let seed = 1; seed <= 2000; seed++) {
      const item = NP.generateItem(createRng(seed * 31 + level), level);
      const where = `level ${level} seed ${seed}: ${item.terms} -> ${item.answer}`;
      families.add(item.family);
      assert.equal(item.terms.length, NP.SHOWN, where);
      assert.ok(Number.isInteger(item.answer) && item.answer >= 0 && item.answer <= NP.MAX_VALUE, where);
      assert.ok(item.terms.every((v) => Number.isInteger(v) && v >= 0), where);
      // four distinct options, containing the answer exactly once
      assert.equal(item.options.length, 4, where);
      assert.equal(new Set(item.options).size, 4, where);
      assert.equal(item.options.filter((o) => o === item.answer).length, 1, where);
      // every rule family that explains the shown numbers agrees on the answer...
      const found = NP.explain(item.terms);
      assert.ok(found.some((e) => e.family === item.family), where);
      assert.ok(found.every((e) => e.next === item.answer), where + ' is ambiguous');
      // ...and no family explains any distractor
      for (const o of item.options) if (o !== item.answer) assert.ok(!found.some((e) => e.next === o), where + ' distractor ' + o);
    }
  }
  assert.equal(families.size, 8, 'all eight families are actually generated');
});

test('number pattern: items are reproducible from the seed', () => {
  assert.deepEqual(NP.generateItem(createRng(4242), 4), NP.generateItem(createRng(4242), 4));
});

test('number pattern: staircase - two right to climb, one wrong to drop, bounded 1..5', () => {
  assert.deepEqual(NP.nextLevel(2, 0, true), { level: 2, streak: 1 });
  assert.deepEqual(NP.nextLevel(2, 1, true), { level: 3, streak: 0 });
  assert.deepEqual(NP.nextLevel(3, 1, false), { level: 2, streak: 0 });
  assert.deepEqual(NP.nextLevel(1, 0, false), { level: 1, streak: 0 });
  assert.deepEqual(NP.nextLevel(5, 1, true), { level: 5, streak: 0 });
});

test('number pattern: summary - level estimate from the second half', () => {
  const m = NP.summarize([
    { level: 2, correct: true, rt: 5000 }, { level: 2, correct: true, rt: 7000 },
    { level: 3, correct: false, rt: 9000 }, { level: 2, correct: true, rt: 4000 },
    { level: 2, correct: true, rt: 6000 }, { level: 3, correct: false, rt: null }
  ]);
  assert.equal(m.correct, 4);
  assert.equal(m.levelReached, 2);
  assert.equal(m.levelEstimate, 2.3);        // mean of 2, 2, 3
  assert.equal(m.avgRt, 5500);
  assert.equal(m.timeouts, 1);
});

/* ---------------------------------------------------- spatial rotation */

import * as SP from '../js/games/logic/spatial-logic.js';

test('spatial: symmetry checks on known shapes', () => {
  const L = [[0, 0], [0, 1], [0, 2], [1, 2]];            // L tetromino: chiral, no rotational symmetry
  const T = [[0, 0], [1, 0], [2, 0], [1, 1]];            // T tetromino: mirror-symmetric
  const S = [[1, 0], [2, 0], [0, 1], [1, 1]];            // S tetromino: 180-degree symmetric
  assert.equal(SP.isValidShape(L), true);
  assert.equal(SP.isValidShape(T), false);
  assert.equal(SP.isValidShape(S), false);
  assert.equal(SP.shapeKey(SP.rotate90(SP.rotate90(SP.rotate90(SP.rotate90(L))))), SP.shapeKey(L));
});

test('spatial: every trial has exactly one correct answer (same vs mirror never coincide)', () => {
  for (const cfg of [
    { count: 16, size: 5, angles: [45, 90] },
    { count: 16, size: 6, angles: [45, 90, 135, 180] },
    { count: 24, size: 7, angles: [45, 90, 135, 180] }
  ]) {
    for (let seed = 1; seed <= 150; seed++) {
      const trials = SP.makeTrials(createRng(seed), cfg);
      assert.equal(trials.length, cfg.count);
      for (const t of trials) {
        assert.equal(t.cells.length, cfg.size);
        assert.ok(SP.isValidShape(t.cells), 'chiral, no rotational symmetry');
        const rotKeys = SP.rotations(t.cells).map(SP.shapeKey);
        if (t.mirrored) {
          assert.equal(t.answer, 'mirror');
          assert.ok(!rotKeys.includes(SP.shapeKey(t.probe)), 'a mirror trial cannot be matched by rotation');
        } else {
          assert.equal(t.answer, 'same');
          assert.equal(SP.shapeKey(t.probe), SP.shapeKey(t.cells));
        }
        assert.ok(cfg.angles.includes(t.angle) && t.angle > 0, 'never shown unrotated');
      }
      // balanced: each angle appears equally often as same and as mirror
      for (const a of cfg.angles) for (const m of [false, true]) {
        assert.equal(trials.filter((t) => t.angle === a && t.mirrored === m).length, cfg.count / (cfg.angles.length * 2));
      }
    }
  }
});

test('spatial: trials are reproducible from the seed', () => {
  const cfg = { count: 16, size: 6, angles: [45, 90, 135, 180] };
  assert.deepEqual(SP.makeTrials(createRng(31337), cfg), SP.makeTrials(createRng(31337), cfg));
});

test('spatial: summary - median RT by angle and the per-degree slope', () => {
  const t = (angle, correct, rt) => ({ angle, correct, rt });
  const m = SP.summarize([
    t(45, true, 1000), t(45, true, 1200), t(90, true, 1400), t(90, true, 1600),
    t(180, true, 2000), t(180, false, 900), t(90, false, null)
  ]);
  assert.equal(m.correct, 5);
  assert.equal(m.accuracy, 71);
  assert.equal(m.medianRt, 1400);
  assert.deepEqual(m.rtByAngle, { 45: 1100, 90: 1500, 180: 2000 });
  assert.ok(m.rtSlope > 5 && m.rtSlope < 8, 'about 6.5 ms per degree');
  assert.equal(m.timeouts, 1);
});

/* ----------------------------------------------------- sequence recall */

import * as SQ from '../js/games/logic/sequence-recall-logic.js';
import { abilityFor } from '../js/core/profile.js';

test('sequence recall: sequences are reproducible, the right length, and free of shortcuts', () => {
  assert.deepEqual(SQ.makeSequence(createRng(7), 8), SQ.makeSequence(createRng(7), 8));
  for (let seed = 1; seed <= 400; seed++) {
    const rng = createRng(seed);
    for (let len = 2; len <= 12; len++) {
      const s = SQ.makeSequence(rng, len);
      assert.equal(s.length, len);
      for (let i = 0; i < s.length; i++) {
        assert.ok(SQ.DIGITS.includes(s[i]), 'digits 1-9 only');
        if (i >= 1) assert.notEqual(s[i], s[i - 1], 'no digit twice in a row');
        if (i >= 2) {
          const up = s[i - 1] - s[i - 2] === 1 && s[i] - s[i - 1] === 1;
          const down = s[i - 2] - s[i - 1] === 1 && s[i - 1] - s[i] === 1;
          assert.ok(!up && !down, `no run of three in ${s}`);
        }
      }
    }
  }
});

test('sequence recall: forward and reverse answers, exact-order checking', () => {
  const seq = [7, 2, 9, 4];
  assert.deepEqual(SQ.expectedAnswer(seq, false), [7, 2, 9, 4]);
  assert.deepEqual(SQ.expectedAnswer(seq, true), [4, 9, 2, 7]);
  assert.deepEqual(seq, [7, 2, 9, 4], 'the shown sequence is not mutated');
  assert.equal(SQ.isCorrect([7, 2, 9, 4], [7, 2, 9, 4]), true);
  assert.equal(SQ.isCorrect([7, 9, 2, 4], [7, 2, 9, 4]), false, 'same digits, wrong order');
  assert.equal(SQ.isCorrect([7, 2, 9], [7, 2, 9, 4]), false, 'incomplete');
  assert.equal(SQ.positionsRight([7, 9, 2, 4], [7, 2, 9, 4]), 2);
});

test('sequence recall: presentation times come from one start, so they never drift', () => {
  const plan = SQ.schedule(10, { on: 750, off: 250 });
  plan.items.forEach((it, i) => {
    assert.equal(it.show, i * 1000);
    assert.equal(it.hide - it.show, 750);
  });
  assert.equal(plan.end, 10000);
});

test('sequence recall: staircase - longer after a hit, two misses in a row end the round', () => {
  const cfg = { maxLength: 12 };
  let s = { length: 3, misses: 0 };
  s = SQ.step(s, true, cfg);
  assert.deepEqual(s, { length: 4, misses: 0, done: false });
  s = SQ.step(s, false, cfg);
  assert.deepEqual(s, { length: 4, misses: 1, done: false }, 'a miss retries the same length');
  s = SQ.step(s, true, cfg);
  assert.deepEqual(s, { length: 5, misses: 0, done: false }, 'a hit clears the miss');
  s = SQ.step(SQ.step(s, false, cfg), false, cfg);
  assert.equal(s.done, true);
  assert.equal(SQ.step({ length: 12, misses: 0 }, true, cfg).done, true, 'passing the cap ends the round');
});

test('sequence recall: a round always ends - worst case is bounded', () => {
  // alternate miss / hit forever: the length still climbs, so the cap is reached
  let s = { length: 3, misses: 0 };
  let trials = 0;
  for (let hit = false; !s.done; hit = !hit) { s = SQ.step(s, hit, { maxLength: 12 }); trials += 1; }
  assert.ok(trials <= 2 * (12 - 3 + 1) + 1, `ended after ${trials} trials`);
});

test('sequence recall: summary - span, accuracy and times from correct trials', () => {
  const t = (length, correct, right, rt, firstRt = 500) => ({ length, correct, right, rt, firstRt });
  const m = SQ.summarize([
    t(3, true, 3, 2000), t(4, true, 4, 3000), t(5, false, 3, 4000), t(5, true, 5, 4500), t(6, false, 2, 5200), t(6, false, 4, null)
  ]);
  assert.equal(m.span, 5);
  assert.equal(m.levelReached, 6);
  assert.equal(m.correct, 3);
  assert.equal(m.wrong, 3);
  assert.equal(m.total, 6);
  assert.equal(m.accuracy, 50);
  assert.equal(m.itemAccuracy, Math.round((21 / 29) * 100));
  assert.equal(m.medianRt, 3000);
  assert.equal(SQ.summarize([t(3, false, 1, 2000), t(3, false, 0, 1800)]).span, 0);
});

test('sequence recall: ability score - longer spans score higher, backwards is credited', () => {
  const a = abilityFor('sequence-recall');
  assert.equal(a.score({ mode: 'medium', total: 1, span: 4 }), null, 'one trial is not a measurement');
  const at = (span, mode = 'medium', reverse = false) => a.score({ mode, span, reverse, total: 8 });
  for (let s = 1; s < 12; s++) assert.ok(at(s + 1) >= at(s), 'monotonic in span');
  assert.equal(at(6.5), 50);
  assert.ok(at(5, 'hard', true) > at(5), 'a backward span of 5 beats a forward span of 5');
  assert.ok(at(6, 'easy') < at(6), 'the slower Easy pace earns a little less');
});
