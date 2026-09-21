/* Reaction Speed - pure logic (no DOM), unit-tested in tests/games.test.mjs.

   Part 1, simple reaction: respond the instant a light appears.
   Part 2, choice reaction: respond with the key/slot matching where it appears.
   Simple reaction is mostly motor speed; adding the choice part makes the
   measure one of processing speed (a decision has to be made). */

import { median, mean, sd, round } from '../../core/stats.js';

export const ANTICIPATION_MS = 100;   // faster than perception allows - a guess
export const SIMPLE_FOREPERIOD = [900, 2600];
export const CHOICE_FOREPERIOD = [700, 1800];

/** Keys per slot, left to right. Arrow keys also work for 2 choices. */
export const CHOICE_KEYS = {
  2: [['f', 'arrowleft'], ['j', 'arrowright']],
  4: [['d'], ['f'], ['j'], ['k']]
};

/** Which slot a key selects, or -1. */
export function slotForKey(key, choices) {
  const k = String(key).toLowerCase();
  return (CHOICE_KEYS[choices] || []).findIndex((keys) => keys.includes(k));
}

/**
 * The trial plan, fixed by the seed: foreperiods, and choice targets balanced so
 * every slot appears equally often (in a shuffled order).
 */
export function planTrials(rng, cfg) {
  const simple = Array.from({ length: cfg.simple }, () => ({
    block: 'simple', foreperiod: Math.round(rng.range(...SIMPLE_FOREPERIOD)), target: null
  }));
  const targets = Array.from({ length: cfg.choice }, (_, i) => i % cfg.choices);
  const choice = rng.shuffle(targets).map((target) => ({
    block: 'choice', foreperiod: Math.round(rng.range(...CHOICE_FOREPERIOD)), target
  }));
  return { simple, choice };
}

/**
 * Classify a response. rt is ms from onset; target/response are slot indexes
 * (null for the simple part). Presses before onset are false starts and are
 * handled by the game before this is called.
 */
export function outcomeOf({ block, rt, target, response }) {
  if (rt === null) return 'timeout';
  if (rt < ANTICIPATION_MS) return 'anticipation';
  if (block === 'choice' && response !== target) return 'error';
  return 'hit';
}

/**
 * Summary metrics from the trial log.
 * trial: { block, target, response, rt, outcome, falseStarts }
 */
export function summarize(trials, cfg) {
  const rts = (block) => trials.filter((t) => t.block === block && t.outcome === 'hit').map((t) => t.rt);
  const scored = (block) => trials.filter((t) => t.block === block && t.outcome !== 'anticipation');
  const simpleRts = rts('simple');
  const choiceRts = rts('choice');
  const choiceScored = scored('choice');
  const allScored = trials.filter((t) => t.outcome !== 'anticipation');
  const hits = trials.filter((t) => t.outcome === 'hit').length;

  return {
    choices: cfg.choice ? cfg.choices : 0,
    simpleValid: simpleRts.length,
    simpleMedianRt: round(median(simpleRts)),
    simpleMeanRt: round(mean(simpleRts)),
    simpleSdRt: round(sd(simpleRts)),
    choiceValid: choiceRts.length,
    choiceMedianRt: round(median(choiceRts)),
    choiceAccuracy: choiceScored.length ? Math.round((choiceRts.length / choiceScored.length) * 100) : null,
    choiceErrors: trials.filter((t) => t.outcome === 'error').length,
    timeouts: trials.filter((t) => t.outcome === 'timeout').length,
    anticipations: trials.filter((t) => t.outcome === 'anticipation').length,
    falseStarts: trials.reduce((a, t) => a + (t.falseStarts || 0), 0),
    accuracy: allScored.length ? Math.round((hits / allScored.length) * 100) : 0,
    avgRt: round(median(choiceRts.length ? choiceRts : simpleRts)),
    trials: trials.length
  };
}

/** Points for the arcade score: faster is worth more, mistakes cost. */
export function pointsFor({ block, outcome, rt }) {
  if (outcome === 'hit') return Math.max(10, Math.round((block === 'simple' ? 400 : 600) - rt));
  if (outcome === 'error' || outcome === 'timeout') return -40;
  return 0;
}
