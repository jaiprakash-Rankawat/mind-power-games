/* Task Switch - pure logic (no DOM), unit-tested in tests/games.test.mjs.

   A digit appears with a question: ODD or EVEN? / LOW or HIGH? The question
   changes between trials. The key measure is the switch cost: how much slower
   (and less accurate) responses are right after the rule changes than when it
   repeats. Left answers ODD or LOW; right answers EVEN or HIGH. */

import { median, round } from '../../core/stats.js';

/** 5 is excluded: it is neither low nor high, so it would have no correct answer. */
export const DIGITS = [1, 2, 3, 4, 6, 7, 8, 9];

export const RULES = {
  parity: { question: 'ODD or EVEN?', left: 'ODD', right: 'EVEN' },
  magnitude: { question: 'LOW or HIGH?', left: 'LOW', right: 'HIGH' }
};

export function answerFor(digit, rule) {
  if (!DIGITS.includes(digit)) throw new Error(`digit ${digit} has no single correct answer`);
  if (rule === 'parity') return digit % 2 === 1 ? 'left' : 'right';
  if (rule === 'magnitude') return digit < 5 ? 'left' : 'right';
  throw new Error(`unknown rule ${rule}`);
}

/** Congruent digits get the same answer under both rules (e.g. 3: odd and low). */
export const isCongruent = (digit) => answerFor(digit, 'parity') === answerFor(digit, 'magnitude');

const otherRule = (r) => (r === 'parity' ? 'magnitude' : 'parity');

function generate(rng, { count, pSwitch, predictable, runLength, maxRun }) {
  const trials = [];
  let rule = rng.chance(0.5) ? 'parity' : 'magnitude';
  let run = 0;
  let prev = null;
  for (let i = 0; i < count; i++) {
    if (i > 0) {
      const change = predictable ? run >= runLength : run >= maxRun || rng.chance(pSwitch);
      if (change) { rule = otherRule(rule); run = 0; }
    }
    run += 1;
    let digit = rng.pick(DIGITS);
    while (digit === prev) digit = rng.pick(DIGITS);          // never the same digit twice running
    prev = digit;
    trials.push({
      i,
      digit,
      rule,
      type: i === 0 ? 'first' : rule === trials[i - 1].rule ? 'repeat' : 'switch',
      answer: answerFor(digit, rule),
      congruent: isCongruent(digit)
    });
  }
  return trials;
}

/**
 * Trial sequence fixed by the seed. Predictable mode switches every `runLength`
 * trials; otherwise switches are random (probability pSwitch), no run longer than
 * maxRun, and regenerated until there are enough switches to measure a cost.
 */
export function makeSequence(rng, { count, pSwitch = 0.35, predictable = false, runLength = 4, maxRun = 5 }) {
  const need = predictable ? 0 : Math.floor(count * pSwitch * 0.7);
  let trials = generate(rng, { count, pSwitch, predictable, runLength, maxRun });
  for (let tries = 0; tries < 30 && trials.filter((t) => t.type === 'switch').length < need; tries++) {
    trials = generate(rng, { count, pSwitch, predictable, runLength, maxRun });
  }
  return trials;
}

/**
 * Metrics from answered trials: { type, correct, rt (null on timeout) }.
 * The first trial is neither a switch nor a repeat and is left out of both.
 */
export function summarize(trials) {
  const scored = trials.filter((t) => t.type !== 'first');
  const okRts = (type) => scored.filter((t) => t.type === type && t.correct && typeof t.rt === 'number').map((t) => t.rt);
  const accOf = (list) => (list.length ? Math.round((list.filter((t) => t.correct).length / list.length) * 100) : null);
  const repeats = scored.filter((t) => t.type === 'repeat');
  const switches = scored.filter((t) => t.type === 'switch');
  const rtRepeat = median(okRts('repeat'));
  const rtSwitch = median(okRts('switch'));
  const correct = trials.filter((t) => t.correct).length;
  const allOk = trials.filter((t) => t.correct && typeof t.rt === 'number').map((t) => t.rt);

  return {
    correct,
    total: trials.length,
    accuracy: trials.length ? Math.round((correct / trials.length) * 100) : 0,
    rtRepeat: round(rtRepeat),
    rtSwitch: round(rtSwitch),
    switchCost: rtRepeat === null || rtSwitch === null ? null : round(rtSwitch - rtRepeat),
    repeatAccuracy: accOf(repeats),
    switchAccuracy: accOf(switches),
    switchErrors: switches.filter((t) => !t.correct).length,
    repeatErrors: repeats.filter((t) => !t.correct).length,
    validRepeat: okRts('repeat').length,
    validSwitch: okRts('switch').length,
    timeouts: trials.filter((t) => t.rt === null).length,
    avgRt: round(median(allOk))
  };
}

export const pointsFor = (correct, rt, limit) =>
  (correct ? 50 + Math.max(0, Math.round((limit - rt) / 20)) : -30);
