/* Attention Storm - pure logic (no DOM), unit-tested in tests/games.test.mjs.

   A continuous-performance task. Shapes flash one at a time; the player responds
   to the target star only. About a quarter are targets, some are look-alike lures
   (a six-point star, an outline star, an upside-down star) and the rest are plain
   shapes. It measures sustained attention (catching every target over a long
   stream) and inhibitory control (not pressing for a look-alike).

   Scoring never leans on speed alone: sensitivity (d-prime) separates real
   detection from pressing at everything, and misses and false alarms are counted
   separately.

   Timing: each stimulus is shown for `on` ms, then a blank gap of `off` ms. A
   response belongs to stimulus k from 100 ms after its onset until 100 ms after the
   next onset, so a slow-but-genuine response that lands in the gap, or just after
   the next shape appears, still counts for the shape it was aimed at. Nothing
   under 100 ms can be a reaction to what is on screen. */

import { mean, median, sd, round } from '../../core/stats.js';

export const GRACE_MS = 100;

/** Speed levels: display time and blank gap. The fastest is 400 ms on, 700 ms per shape. */
export const LEVELS = [
  { on: 800, off: 400 },
  { on: 700, off: 380 },
  { on: 600, off: 350 },
  { on: 520, off: 330 },
  { on: 450, off: 310 },
  { on: 400, off: 300 }
];
export const MAX_LEVEL = LEVELS.length;
export const timingFor = (level) => LEVELS[Math.max(1, Math.min(MAX_LEVEL, level)) - 1];

export const TARGET = 'star5';

/* ---- shapes: drawn as SVG (not emoji), so they look identical on every system ---- */

function starPoints(points, outer, inner, turn = 0) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const a = ((-90 + turn + (i * 180) / points) * Math.PI) / 180;
    const rad = i % 2 ? inner : outer;
    pts.push((50 + rad * Math.cos(a)).toFixed(1) + ',' + (50 + rad * Math.sin(a)).toFixed(1));
  }
  return pts.join(' ');
}

function polygonPoints(sides, radius, turn = 0) {
  return Array.from({ length: sides }, (_, i) => {
    const a = ((turn + (i * 360) / sides) * Math.PI) / 180;
    return (50 + radius * Math.cos(a)).toFixed(1) + ',' + (50 + radius * Math.sin(a)).toFixed(1);
  }).join(' ');
}

const GEOMETRY = {
  star5: (c) => `<polygon points="${starPoints(5, 46, 19)}" fill="${c}"/>`,
  'star5-inverted': (c) => `<polygon points="${starPoints(5, 46, 19, 180)}" fill="${c}"/>`,
  'star5-outline': (c) => `<polygon points="${starPoints(5, 42, 18)}" fill="none" stroke="${c}" stroke-width="7" stroke-linejoin="round"/>`,
  star6: (c) => `<polygon points="${starPoints(6, 46, 23)}" fill="${c}"/>`,
  star4: (c) => `<polygon points="${starPoints(4, 46, 16)}" fill="${c}"/>`,
  circle: (c) => `<circle cx="50" cy="50" r="38" fill="${c}"/>`,
  triangle: (c) => `<polygon points="50,10 92,84 8,84" fill="${c}"/>`,
  square: (c) => `<rect x="16" y="16" width="68" height="68" rx="6" fill="${c}"/>`,
  diamond: (c) => `<polygon points="50,6 94,50 50,94 6,50" fill="${c}"/>`,
  hexagon: (c) => `<polygon points="${polygonPoints(6, 42, 30)}" fill="${c}"/>`,
  plus: (c) => `<polygon points="37,10 63,10 63,37 90,37 90,63 63,63 63,90 37,90 37,63 10,63 10,37 37,37" fill="${c}"/>`
};

export const SHAPES = Object.keys(GEOMETRY);
export const SHAPE_COLOR = '#fbbf24';

/** SVG markup for a shape - a string built from constants, safe to insert as HTML. */
export function shapeMarkup(shape, color = SHAPE_COLOR, cls = 'as-svg') {
  return `<svg viewBox="0 0 100 100" class="${cls}" aria-hidden="true">${GEOMETRY[shape](color)}</svg>`;
}

/**
 * One block of stimuli, fixed by the rng: exact counts of targets, lures and
 * others; never a target first; never more than two targets in a row; never the
 * same shape twice in a row (each change is visible).
 */
export function makeBlock(rng, { size, targets, lures, lureShapes, otherShapes }) {
  const items = [
    ...Array.from({ length: targets }, () => ({ kind: 'target', shape: TARGET })),
    ...Array.from({ length: lures }, (_, i) => ({ kind: 'lure', shape: lureShapes[i % lureShapes.length] })),
    ...Array.from({ length: size - targets - lures }, (_, i) => ({ kind: 'other', shape: otherShapes[i % otherShapes.length] }))
  ];
  for (let attempt = 0; attempt < 2000; attempt++) {
    const list = rng.shuffle(items);
    if (isWellFormed(list)) return list.map((s) => ({ ...s }));
  }
  throw new Error('could not build a well-formed block');
}

export function isWellFormed(list) {
  if (!list.length || list[0].kind === 'target') return false;
  for (let i = 1; i < list.length; i++) {
    if (list[i].shape === list[i - 1].shape && list[i].kind !== 'target') return false;
    if (i >= 2 && list[i].kind === 'target' && list[i - 1].kind === 'target' && list[i - 2].kind === 'target') return false;
  }
  return true;
}

/**
 * Which stimulus a response at time t belongs to, given the onset times so far.
 * Returns -1 for a press before the first window opens.
 */
export function windowFor(onsets, t, grace = GRACE_MS) {
  for (let k = onsets.length - 1; k >= 0; k--) {
    if (typeof onsets[k] === 'number' && t >= onsets[k] + grace) return k;
  }
  return -1;
}

export function outcomeOf({ kind, responded }) {
  if (kind === 'target') return responded ? 'hit' : 'miss';
  return responded ? 'false-alarm' : 'correct-rejection';
}

export function pointsFor(outcome, kind, rt) {
  if (outcome === 'hit') return 50 + Math.max(0, Math.round((700 - rt) / 10));
  if (outcome === 'false-alarm') return kind === 'lure' ? -40 : -25;
  if (outcome === 'miss') return -20;
  return 0;
}

/** Between blocks: speed up after a clean block, ease off after a poor one. */
export function nextLevel(level, { hitRate, faRate }) {
  if (hitRate >= 0.85 && faRate <= 0.1) return Math.min(MAX_LEVEL, level + 1);
  if (hitRate < 0.6 || faRate > 0.3) return Math.max(1, level - 1);
  return level;
}

/** Inverse of the standard normal CDF (Acklam's approximation, error < 1.2e-9). */
export function probit(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Sensitivity with the log-linear correction, so perfect blocks stay finite. */
export function dPrime(hits, targets, falseAlarms, nonTargets) {
  if (!targets || !nonTargets) return null;
  return probit((hits + 0.5) / (targets + 1)) - probit((falseAlarms + 0.5) / (nonTargets + 1));
}

/** Hit rate and false-alarm rate of a set of stimuli (voided ones excluded). */
export function rates(stimuli) {
  const s = stimuli.filter((x) => !x.voided);
  const targets = s.filter((x) => x.kind === 'target');
  const others = s.filter((x) => x.kind !== 'target');
  return {
    hitRate: targets.length ? targets.filter((x) => x.responded).length / targets.length : 0,
    faRate: others.length ? others.filter((x) => x.responded).length / others.length : 0
  };
}

/** stimuli: { block, level, kind, responded, rt, voided }. */
export function summarize(stimuli) {
  const s = stimuli.filter((x) => !x.voided);
  const count = (fn) => s.filter(fn).length;
  const hits = count((x) => x.kind === 'target' && x.responded);
  const misses = count((x) => x.kind === 'target' && !x.responded);
  const lureFalseAlarms = count((x) => x.kind === 'lure' && x.responded);
  const otherFalseAlarms = count((x) => x.kind === 'other' && x.responded);
  const falseAlarms = lureFalseAlarms + otherFalseAlarms;
  const nonTargets = count((x) => x.kind !== 'target');
  const correctRejections = nonTargets - falseAlarms;
  const rts = s.filter((x) => x.kind === 'target' && x.responded && typeof x.rt === 'number').map((x) => x.rt);
  const blocks = [...new Set(s.map((x) => x.block))].sort((a, b) => a - b);
  const blockLevels = blocks.map((b) => s.find((x) => x.block === b).level);
  const dp = dPrime(hits, hits + misses, falseAlarms, nonTargets);
  return {
    hits,
    misses,
    falseAlarms,
    lureFalseAlarms,
    otherFalseAlarms,
    correctRejections,
    correct: hits + correctRejections,
    total: s.length,
    accuracy: s.length ? Math.round(((hits + correctRejections) / s.length) * 100) : 0,
    hitRate: hits + misses ? Math.round((hits / (hits + misses)) * 100) : 0,
    falseAlarmRate: nonTargets ? Math.round((falseAlarms / nonTargets) * 100) : 0,
    dprime: dp === null ? null : round(dp, 2),
    medianRt: round(median(rts)),
    meanRt: round(mean(rts)),
    rtSd: round(sd(rts)),
    levelReached: blockLevels.length ? Math.max(...blockLevels) : 0,
    // the first block is where the player starts; later blocks are where they settled
    levelEstimate: blockLevels.length ? round(mean(blockLevels.length > 1 ? blockLevels.slice(1) : blockLevels), 1) : null,
    voided: stimuli.length - s.length
  };
}
