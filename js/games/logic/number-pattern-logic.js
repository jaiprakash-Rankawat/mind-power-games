/* Number Pattern - pure logic (no DOM), unit-tested in tests/games.test.mjs.

   Six numbers are shown; the player picks the seventh from four options.

   "Exactly one right answer" is enforced, not assumed. Every generated series is
   run through a set of rule families ("fitters"). Any family that explains all
   six shown numbers makes a prediction; if ANY of those predictions differs from
   the intended answer, the series is ambiguous and is thrown away. Distractors
   are never predicted by any fitting family. The guarantee is relative to these
   eight families - they are the rule set the game teaches. */

export const SHOWN = 6;
export const MAX_VALUE = 999;
export const LEVELS = 5;

const isInt = Number.isInteger;
const diffs = (t) => t.slice(1).map((v, i) => v - t[i]);
const close = (a, b) => Math.abs(a - b) < 1e-9;

/* ------------------------------------------------------------- fitters */
/* Each returns the predicted next term(s) if its family explains every shown
   term exactly, or [] if it does not. */

function fitArithmetic(t) {
  const d = t[1] - t[0];
  for (let i = 2; i < t.length; i++) if (t[i] - t[i - 1] !== d) return [];
  return [t[t.length - 1] + d];
}

function fitGeometric(t) {
  if (t[0] === 0) return [];
  for (let i = 1; i < t.length - 1; i++) if (t[i + 1] * t[0] !== t[i] * t[1]) return [];
  return [(t[t.length - 1] * t[1]) / t[0]];
}

/** x -> a*x + b (covers arithmetic a=1 and geometric b=0 as special cases). */
function fitAffine(t) {
  const d0 = t[1] - t[0];
  if (d0 === 0) return [];
  const a = (t[2] - t[1]) / d0;
  const b = t[1] - a * t[0];
  for (let i = 1; i < t.length; i++) if (!close(a * t[i - 1] + b, t[i])) return [];
  return [a * t[t.length - 1] + b];
}

/** Differences change by a constant step: +2, +4, +6, ... */
function fitSecondOrder(t) {
  const d = diffs(t);
  const k = d[1] - d[0];
  for (let i = 2; i < d.length; i++) if (d[i] - d[i - 1] !== k) return [];
  return [t[t.length - 1] + d[d.length - 1] + k];
}

/** Differences multiply by a constant: +1, +2, +4, +8, ... */
function fitDiffsGeometric(t) {
  const d = diffs(t);
  if (d[0] === 0) return [];
  for (let i = 1; i < d.length - 1; i++) if (d[i + 1] * d[0] !== d[i] * d[1]) return [];
  return [t[t.length - 1] + (d[d.length - 1] * d[1]) / d[0]];
}

/** Two arithmetic series interleaved: a, x, a+d, x+e, a+2d, x+2e, ... */
function fitAlternating(t) {
  const even = t.filter((_, i) => i % 2 === 0);
  const odd = t.filter((_, i) => i % 2 === 1);
  const pe = fitArithmetic(even);
  const po = fitArithmetic(odd);
  if (!pe.length || !po.length) return [];
  return [t.length % 2 === 0 ? pe[0] : po[0]];
}

/** Each term is the sum of the two before it. */
function fitFibonacci(t) {
  for (let i = 2; i < t.length; i++) if (t[i] !== t[i - 1] + t[i - 2]) return [];
  return [t[t.length - 1] + t[t.length - 2]];
}

/** Alternating operations: +a then *b (or *b then +a). */
function fitAltOps(t) {
  const out = [];
  for (const addFirst of [true, false]) {
    let a;
    let b;
    if (addFirst) { if (t[1] === 0) continue; a = t[1] - t[0]; b = t[2] / t[1]; }
    else { if (t[0] === 0) continue; b = t[1] / t[0]; a = t[2] - t[1]; }
    const isAdd = (i) => (addFirst ? i % 2 === 1 : i % 2 === 0);
    let ok = true;
    for (let i = 1; i < t.length && ok; i++) ok = close(isAdd(i) ? t[i - 1] + a : t[i - 1] * b, t[i]);
    if (ok) {
      const i = t.length;
      out.push(isAdd(i) ? t[i - 1] + a : t[i - 1] * b);
    }
  }
  return out;
}

export const FITTERS = {
  arithmetic: fitArithmetic,
  geometric: fitGeometric,
  affine: fitAffine,
  secondOrder: fitSecondOrder,
  diffsGeometric: fitDiffsGeometric,
  alternating: fitAlternating,
  fibonacci: fitFibonacci,
  altOps: fitAltOps
};

/** Every (family, prediction) pair whose family explains the shown terms. */
export function explain(terms) {
  const out = [];
  for (const [family, fit] of Object.entries(FITTERS)) {
    for (const next of fit(terms)) out.push({ family, next });
  }
  return out;
}

/* ---------------------------------------------------------- generators */
/* Each returns SHOWN + 1 terms (the last one is the answer). */

const series = (n, f) => Array.from({ length: n }, (_, i) => f(i));

const GENERATORS = {
  arithmetic(rng, level) {
    const d = level === 1 ? rng.between(2, 9) : rng.between(11, 25);
    if (level === 1 && rng.chance(0.3)) {                   // a gentle descending series
      const start = rng.between(d * SHOWN + 3, d * SHOWN + 40);
      return series(SHOWN + 1, (i) => start - d * i);
    }
    const start = rng.between(1, 40);
    return series(SHOWN + 1, (i) => start + d * i);
  },
  geometric(rng) {
    const r = rng.pick([2, 3]);
    const start = r === 2 ? rng.between(1, 7) : rng.between(1, 3);
    return series(SHOWN + 1, (i) => start * r ** i);
  },
  alternating(rng) {
    const a0 = rng.between(1, 20);
    const da = rng.between(2, 7);
    const b0 = rng.between(40, 80);
    const db = rng.pick([-1, 1]) * rng.between(2, 6);
    return series(SHOWN + 1, (i) => (i % 2 === 0 ? a0 + da * (i / 2) : b0 + db * ((i - 1) / 2)));
  },
  secondOrder(rng) {
    const start = rng.between(1, 20);
    const d0 = rng.between(1, 5);
    const k = rng.between(1, 3);
    const out = [start];
    for (let i = 1; i <= SHOWN; i++) out.push(out[i - 1] + d0 + k * (i - 1));
    return out;
  },
  affine(rng) {
    const a = rng.pick([2, 3]);
    const b = rng.pick([-2, -1, 1, 2, 3]);
    const out = [rng.between(1, 4)];
    for (let i = 1; i <= SHOWN; i++) out.push(a * out[i - 1] + b);
    return out;
  },
  diffsGeometric(rng) {
    const start = rng.between(1, 20);
    const d0 = rng.between(1, 3);
    const out = [start];
    for (let i = 1; i <= SHOWN; i++) out.push(out[i - 1] + d0 * 2 ** (i - 1));
    return out;
  },
  fibonacci(rng) {
    const t0 = rng.between(1, 6);
    const out = [t0, rng.between(t0, t0 + 6)];
    for (let i = 2; i <= SHOWN; i++) out.push(out[i - 1] + out[i - 2]);
    return out;
  },
  altOps(rng) {
    const a = rng.between(1, 5);
    const b = rng.pick([2, 3]);
    const addFirst = rng.chance(0.5);
    const out = [rng.between(1, 5)];
    for (let i = 1; i <= SHOWN; i++) {
      const add = addFirst ? i % 2 === 1 : i % 2 === 0;
      out.push(add ? out[i - 1] + a : out[i - 1] * b);
    }
    return out;
  }
};

/** Rule families per difficulty level, easiest first. */
export const LEVEL_FAMILIES = {
  1: ['arithmetic'],
  2: ['arithmetic', 'geometric'],
  3: ['alternating', 'secondOrder'],
  4: ['affine', 'diffsGeometric'],
  5: ['fibonacci', 'altOps']
};

/** Plausible wrong answers - none of them explained by any fitting family. */
function makeOptions(rng, terms, answer, predicted) {
  const last = terms[terms.length - 1];
  const dLast = last - terms[terms.length - 2];
  const dFirst = terms[1] - terms[0];
  const candidates = [
    last + dLast, answer + dLast, answer - dLast, last + dFirst, answer + dFirst,
    answer + 1, answer - 1, answer + 2, answer - 2, answer + 3, answer - 3,
    answer * 2, Math.round(answer / 2), answer + 10, answer - 10
  ];
  const seen = new Set([answer]);
  const pool = [];
  for (const c of rng.shuffle(candidates)) {
    if (!isInt(c) || c < 0 || c > MAX_VALUE * 2 || seen.has(c) || predicted.has(c)) continue;
    seen.add(c);
    pool.push(c);
  }
  if (pool.length < 3) return null;
  return rng.shuffle([answer, ...pool.slice(0, 3)]);
}

/**
 * One unambiguous item at a level: { level, family, terms, answer, options }.
 * Retries until the generated series has exactly one explanation for its answer.
 */
export function generateItem(rng, level) {
  const families = LEVEL_FAMILIES[level];
  for (let attempt = 0; attempt < 500; attempt++) {
    const family = rng.pick(families);
    const seq = GENERATORS[family](rng, level);
    if (seq.some((v) => !isInt(v) || v < 0 || v > MAX_VALUE)) continue;
    const terms = seq.slice(0, SHOWN);
    const answer = seq[SHOWN];
    const found = explain(terms);
    if (!found.some((e) => e.family === family && close(e.next, answer))) continue;   // sanity
    if (found.some((e) => !close(e.next, answer))) continue;                           // ambiguous
    const predicted = new Set(found.map((e) => e.next));
    const options = makeOptions(rng, terms, answer, predicted);
    if (!options) continue;
    return { level, family, terms, answer, options };
  }
  throw new Error(`no unambiguous item found at level ${level}`);
}

/* ----------------------------------------------------------- staircase */

/** 2 right in a row -> harder; 1 wrong -> easier. Settles near 70% correct. */
export function nextLevel(level, streak, correct) {
  if (!correct) return { level: Math.max(1, level - 1), streak: 0 };
  if (streak + 1 >= 2) return { level: Math.min(LEVELS, level + 1), streak: 0 };
  return { level, streak: streak + 1 };
}

/** items: { level, correct, rt (null on timeout) } in play order. */
export function summarize(items) {
  const correct = items.filter((i) => i.correct);
  const second = items.slice(Math.floor(items.length / 2));
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const rts = correct.map((i) => i.rt).filter((v) => typeof v === 'number');
  return {
    correct: correct.length,
    total: items.length,
    accuracy: items.length ? Math.round((correct.length / items.length) * 100) : 0,
    levelReached: correct.length ? Math.max(...correct.map((i) => i.level)) : 0,
    levelEstimate: second.length ? Math.round(avg(second.map((i) => i.level)) * 10) / 10 : null,
    avgRt: rts.length ? Math.round(avg(rts)) : null,
    timeouts: items.filter((i) => i.rt === null).length
  };
}
