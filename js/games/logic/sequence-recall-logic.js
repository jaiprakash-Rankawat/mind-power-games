/* Sequence Recall - pure logic (no DOM), unit-tested in tests/games.test.mjs.

   A digit-span task. Digits appear one at a time; the player types them back in
   the same order (or backwards on Hard). A correct answer adds one digit to the
   next sequence; a miss retries the same length with new digits, and two misses
   in a row end the round - the classic span procedure, so a round always ends
   and never grinds on at a length the player cannot manage.

   Sequences avoid the easiest shortcuts: no digit twice in a row (it would look
   like one long flash) and no runs of three consecutive numbers (1-2-3 is one
   chunk, not three items). */

import { median, mean, round } from '../../core/stats.js';

export const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const MISSES_TO_END = 2;

const isRun = (a, b, c) => (b - a === 1 && c - b === 1) || (a - b === 1 && b - c === 1);

/** A sequence of `length` digits, fixed by the rng. */
export function makeSequence(rng, length) {
  const seq = [];
  while (seq.length < length) {
    const d = rng.pick(DIGITS);
    const n = seq.length;
    if (n >= 1 && seq[n - 1] === d) continue;
    if (n >= 2 && isRun(seq[n - 2], seq[n - 1], d)) continue;
    seq.push(d);
  }
  return seq;
}

/** What the player has to type: the sequence, or the sequence backwards. */
export const expectedAnswer = (seq, reverse) => (reverse ? seq.slice().reverse() : seq.slice());

export const positionsRight = (response, expected) =>
  expected.reduce((n, d, i) => n + (response[i] === d ? 1 : 0), 0);

export const isCorrect = (response, expected) =>
  response.length === expected.length && positionsRight(response, expected) === expected.length;

/**
 * Onset and offset of every item, relative to the first onset. Every time is
 * computed from the same start rather than from the previous item, so timer
 * jitter can never accumulate into drift across a long sequence.
 */
export function schedule(length, { on, off }) {
  const period = on + off;
  return {
    items: Array.from({ length }, (_, i) => ({ show: i * period, hide: i * period + on })),
    end: length * period
  };
}

/** Time allowed to type an answer - generous, it only stops a round stalling. */
export const inputLimit = (length) => 4000 + 1500 * length;

/**
 * The staircase. state: { length, misses }. Correct: one digit longer. Miss: same
 * length again; two misses in a row, or passing maxLength, ends the round.
 */
export function step(state, correct, { maxLength }) {
  if (correct) {
    const length = state.length + 1;
    return { length, misses: 0, done: length > maxLength };
  }
  const misses = state.misses + 1;
  return { length: state.length, misses, done: misses >= MISSES_TO_END };
}

/** Points: length-weighted for a clean recall, a little partial credit otherwise. */
export function pointsFor({ correct, length, rt, right, reverse }) {
  if (!correct) return 10 * right;
  const base = 100 * length * (reverse ? 1.5 : 1);
  const bonus = typeof rt === 'number' ? Math.max(0, Math.round((inputLimit(length) - rt) / 40)) : 0;
  return Math.round(base + bonus);
}

/**
 * trials: { length, correct, right, rt, firstRt }. Span is the longest sequence
 * recalled perfectly; response times come from correct trials only.
 */
export function summarize(trials) {
  const ok = trials.filter((t) => t.correct);
  const timed = ok.filter((t) => typeof t.rt === 'number');
  const items = trials.reduce((n, t) => n + t.length, 0);
  const itemsRight = trials.reduce((n, t) => n + (t.right || 0), 0);
  const med = median(timed.map((t) => t.rt));
  return {
    span: ok.length ? Math.max(...ok.map((t) => t.length)) : 0,
    levelReached: trials.length ? Math.max(...trials.map((t) => t.length)) : 0,
    correct: ok.length,
    wrong: trials.length - ok.length,
    total: trials.length,
    accuracy: trials.length ? Math.round((ok.length / trials.length) * 100) : 0,
    itemAccuracy: items ? Math.round((itemsRight / items) * 100) : 0,
    medianRt: round(med),
    meanRt: round(mean(timed.map((t) => t.rt))),
    msPerItem: round(median(timed.map((t) => t.rt / t.length))),
    medianFirstRt: round(median(timed.filter((t) => typeof t.firstRt === 'number').map((t) => t.firstRt))),
    timeouts: trials.filter((t) => t.timedOut).length
  };
}
