/* The measurement layer: raw game results -> 0-100 ability scores -> Performance Score.

   Raw results are what gets stored. Scores are always derived on read, so the
   scoring curves can be retuned later without losing or distorting anyone's
   history.

   Each curve maps performance onto 0-100 around a reference midpoint of 50. The
   anchor points come from published results for the underlying tasks (Stroop
   interference, Corsi span, n-back level). They are reference points for tracking
   yourself over time - not norms from our own players, and not clinical norms. */

import { get, set, getBest } from './storage.js';
import { GAMES } from './games.js';
import { track } from './analytics.js';

// Raw per-trial data is kept for later statistical work, so history is generous.
const HISTORY_CAP = 1000;
const WINDOW = 10;                 // most recent runs considered per ability
const TOP = 3;                     // ability score = median of the best 3 in that window
export const TYPICAL = [40, 60];   // reference range drawn on meters and charts

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Piecewise-linear interpolation over ascending [x, y] anchors. */
function curve(x, pts) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    if (x <= x1) {
      const [x0, y0] = pts[i - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return pts[pts.length - 1][1];
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;

export const ABILITIES = [
  {
    id: 'focus',                    // id kept for stored data; shown as Attention
    name: 'Attention',
    game: 'stroop',
    gameName: 'Color Clash',
    icon: '\u{1F3A8}',
    what: 'Acting on what matters while ignoring a strong distraction',
    /* Inverse efficiency (reaction time / accuracy) folds speed and accuracy into
       one number; harder modes are credited for their extra load. */
    score(run) {
      const answered = (run.correct || 0) + (run.wrong || 0);
      if (answered < 8 || !run.avgRt) return null;
      const acc = Math.max(0.01, (run.accuracy || 0) / 100);
      const load = { easy: 1, medium: 1.15, hard: 1.3 }[run.mode] || 1;
      const ies = run.avgRt / acc / load;
      let s = curve(ies, [[450, 98], [550, 88], [650, 72], [800, 50], [1000, 30], [1300, 12], [1800, 3]]);
      if (run.accuracy < 60) s = Math.min(s, 20);          // mostly guessing
      return Math.round(s);
    },
    metric: (run) => `${run.accuracy}% accurate, ${run.avgRt}ms average`
  },
  {
    id: 'visual-memory',
    name: 'Visual Memory',
    game: 'memory-grid',
    gameName: 'Memory Grid',
    icon: '\u{1F9E9}',
    what: 'Holding a sequence of places in mind and replaying it',
    /* Corsi-style span: published adult results cluster around 5-6. Bigger grids credit more. */
    score(run) {
      if (typeof run.span !== 'number') return null;
      const bonus = { easy: 0, medium: 0.5, hard: 1 }[run.mode] || 0;
      return Math.round(curve(run.span + bonus,
        [[1, 3], [2, 8], [3, 18], [4, 32], [5, 45], [5.5, 50], [6, 57], [7, 70], [8, 82], [9, 91], [10, 96], [12, 99]]));
    },
    metric: (run) => `span ${run.span} on ${run.mode}`
  },
  {
    id: 'working-memory',
    name: 'Working Memory',
    game: 'n-back',
    gameName: 'N-Back',
    icon: '\u{1F501}',
    what: 'Updating what you hold in mind as new information arrives',
    /* Level held, nudged by sensitivity (d') so clean play outranks lucky play.
       Published adult results mostly fall between 2- and 3-back. */
    score(run) {
      if (!run.trials || run.trials < 10) return null;
      const d = Number(run.dprime) || 0;
      const bonus = { easy: 0, medium: 0.3, hard: 0.8 }[run.mode] || 0;
      const adj = clamp((d - 2) * 0.25, -0.5, 0.4);
      let s = curve((run.peakN || 0) + bonus + adj,
        [[0, 5], [1, 15], [2, 38], [2.5, 50], [3, 62], [4, 80], [5, 91], [6, 97]]);
      if (d < 1) s = Math.min(s, 25);                      // not reading the stream
      return Math.round(s);
    },
    metric: (run) => `${run.peakN}-back, d′ ${(Number(run.dprime) || 0).toFixed(1)}`
  },
  {
    id: 'processing-speed',
    name: 'Processing Speed',
    game: 'reaction',
    gameName: 'Reaction Speed',
    icon: '⚡',
    what: 'Seeing, deciding and responding quickly',
    /* Median reaction times as measured in a browser (which adds some device
       latency). With a choice part, the decision speed dominates: choice time /
       choice accuracy, credited for four-way choices; simple speed adds a little.
       Guess-like play (many false starts, choice accuracy under 70%) is capped. */
    score(run) {
      if (typeof run.simpleMedianRt !== 'number' || (run.simpleValid || 0) < 4) return null;
      const simple = curve(run.simpleMedianRt, [[180, 98], [220, 90], [260, 75], [300, 58], [320, 50], [370, 36], [450, 18], [600, 5]]);
      let s = simple;
      if (typeof run.choiceMedianRt === 'number' && typeof run.choiceAccuracy === 'number' && (run.choiceValid || 0) >= 4) {
        const load = run.choices === 4 ? 1.15 : 1;
        const ies = run.choiceMedianRt / Math.max(0.01, run.choiceAccuracy / 100) / load;
        s = 0.3 * simple + 0.7 * curve(ies, [[280, 98], [330, 90], [380, 77], [430, 62], [470, 50], [540, 36], [650, 20], [850, 5]]);
        if (run.choiceAccuracy < 70) s = Math.min(s, 25);
      }
      if ((run.falseStarts || 0) > 5) s = Math.min(s, 40);
      return Math.round(s);
    },
    metric: (run) => (typeof run.choiceMedianRt === 'number'
      ? `choice ${run.choiceMedianRt}ms at ${run.choiceAccuracy}%, simple ${run.simpleMedianRt}ms`
      : `simple ${run.simpleMedianRt}ms`)
  },
  {
    id: 'flexibility',
    name: 'Flexibility',
    game: 'task-switch',
    gameName: 'Task Switch',
    icon: '\u{1F504}',
    what: 'Changing mental gears when the rules change',
    /* Switch cost (median correct RT after a rule change minus on a repeat), with
       published results for cued switching mostly between 100 and 300ms. Predictable
       switching (Easy) is easier, so its cost earns less credit. Accuracy below 92%
       lowers the score; near-guessing is capped. Needs 5+ clean trials of each type. */
    score(run) {
      if (typeof run.switchCost !== 'number' || (run.validSwitch || 0) < 5 || (run.validRepeat || 0) < 5) return null;
      const load = { easy: 0.8, medium: 1, hard: 1.15 }[run.mode] || 1;
      const cost = Math.max(0, run.switchCost) / load;
      let s = curve(cost, [[0, 95], [40, 88], [90, 75], [140, 62], [200, 50], [300, 35], [450, 18], [700, 5]]);
      s -= Math.max(0, 92 - (run.accuracy || 0)) * 1.2;
      if ((run.accuracy || 0) < 65) s = Math.min(s, 20);
      return Math.round(Math.max(0, s));
    },
    metric: (run) => `switch cost ${run.switchCost}ms, ${run.accuracy}% accurate`
  },
  {
    id: 'reasoning',
    name: 'Reasoning',
    game: 'number-pattern',
    gameName: 'Number Pattern',
    icon: '\u{1F522}',
    what: 'Finding the rule behind a pattern and applying it',
    /* The adaptive difficulty settles where the player gets about 70% right, so the
       level held in the second half is the estimate. Levels are absolute (the same
       rule families in every mode), so no mode adjustment is needed. Rough anchors:
       level 3 (interleaved or growing steps) sits near the midpoint. */
    score(run) {
      if (typeof run.levelEstimate !== 'number' || (run.total || 0) < 6) return null;
      let s = curve(run.levelEstimate, [[1, 12], [1.5, 22], [2, 33], [2.5, 43], [3, 52], [3.5, 63], [4, 75], [4.5, 86], [5, 95]]);
      if ((run.accuracy || 0) < 40) s = Math.min(s, 25);
      return Math.round(s);
    },
    metric: (run) => `level ${run.levelEstimate} held, ${run.correct}/${run.total} correct`
  },
  {
    id: 'spatial',
    name: 'Spatial Reasoning',
    game: 'spatial-rotation',
    gameName: 'Spatial Rotation',
    icon: '\u{1F9CA}',
    what: 'Turning shapes in your mind to compare them',
    /* Median correct RT / accuracy. Published 2D mental-rotation times for turns up
       to 180 degrees mostly run 1-3s. With two choices, 50% is chance, so accuracy
       under 65% is capped. Easy (small turns, small shapes) earns less credit. */
    score(run) {
      if (typeof run.medianRt !== 'number' || (run.correct || 0) < 6) return null;
      const load = { easy: 0.85, medium: 1, hard: 1.15 }[run.mode] || 1;
      const ies = run.medianRt / Math.max(0.01, (run.accuracy || 0) / 100) / load;
      let s = curve(ies, [[900, 95], [1200, 85], [1500, 72], [1800, 60], [2100, 50], [2600, 37], [3400, 20], [5000, 5]]);
      if ((run.accuracy || 0) < 65) s = Math.min(s, 20);
      return Math.round(s);
    },
    metric: (run) => `${run.accuracy}% accurate, ${(run.medianRt / 1000).toFixed(1)}s median`
  },
  {
    id: 'sequence-memory',
    name: 'Sequence Memory',
    game: 'sequence-recall',
    gameName: 'Sequence Recall',
    icon: '\u{1F9EE}',
    what: 'Holding items in mind in order and playing them back',
    /* Digit span. Published adult forward spans mostly fall around 6-7 and backward
       spans about two digits shorter, so a backward span earns +2 and the slower
       Easy pace gives up a quarter digit. Rough reference points, not norms. */
    score(run) {
      if (typeof run.span !== 'number' || (run.total || 0) < 2) return null;
      const shift = run.reverse ? 2 : run.mode === 'easy' ? -0.25 : 0;
      return Math.round(curve(run.span + shift,
        [[0, 2], [2, 5], [3, 10], [4, 20], [5, 32], [6, 43], [6.5, 50], [7, 57], [8, 70], [9, 82], [10, 91], [11, 96], [12, 99]]));
    },
    metric: (run) => `span ${run.span}${run.reverse ? ' backwards' : ''}, ${run.correct}/${run.total} correct`
  }
];

/* Abilities announced but not yet playable (none - all seven games are built). */
export const COMING_SOON = [];

export const abilityFor = (gameId) => ABILITIES.find((a) => a.game === gameId) || null;

/* ---------------------------------------------------------------- history */

const histKey = (gameId) => `history:${gameId}`;

export async function getHistory(gameId) {
  return get(histKey(gameId), []);
}

/** Score for one ability from its run list: median of the best 3 of the last 10. */
export function abilityScore(ability, runs) {
  const all = runs.map((r) => ability.score(r)).filter((s) => typeof s === 'number' && !Number.isNaN(s));
  const recent = runs.slice(-WINDOW).map((r) => ability.score(r))
    .filter((s) => typeof s === 'number' && !Number.isNaN(s));
  if (!recent.length) return { score: null, runs: all.length, provisional: true };
  const best = [...recent].sort((a, b) => b - a).slice(0, TOP);
  return {
    score: Math.round(median(best)),
    runs: all.length,
    provisional: all.length < TOP          // one lucky round is not a measurement
  };
}

/* Players who scored before the profile existed keep their records: their saved
   bests seed the history once. */
async function migrateOnce() {
  if (await get('profile.migrated', false)) return;
  for (const g of GAMES) {
    if (g.locked || !g.modes) continue;
    if ((await getHistory(g.id)).length) continue;
    const seeded = [];
    for (const mode of g.modes) {
      const best = await getBest(g.id, mode);
      // Bests carrying startedAt were written by a version that always logs the
      // round to history itself - importing them too would store it twice.
      if (!best || best.startedAt) continue;
      const ts = best.date ? Date.parse(best.date + 'T12:00:00') : Date.now();
      seeded.push({ ...best, mode: best.mode || mode, ts: Number.isNaN(ts) ? Date.now() : ts, imported: true });
    }
    if (seeded.length) await set(histKey(g.id), seeded.sort((a, b) => a.ts - b.ts));
  }
  await set('profile.migrated', true);
}

/**
 * Called by each game when a round ends. Stores the raw result and reports how
 * the ability score moved, for the results screen.
 * meta.source: 'practice' (default) or 'official'; official rounds also carry
 * their sessionId. Both count toward this rolling profile; only official
 * sessions can ever count toward rankings.
 */
export async function logRun(gameId, result, meta = {}) {
  await migrateOnce();
  const ability = abilityFor(gameId);
  const history = await getHistory(gameId);
  const before = ability ? abilityScore(ability, history) : null;
  const source = meta.source === 'official' ? 'official' : 'practice';

  history.push({ ...result, ts: Date.now(), source, ...(meta.sessionId ? { sessionId: meta.sessionId } : {}) });
  while (history.length > HISTORY_CAP) history.shift();
  await set(histKey(gameId), history);

  track(source === 'official' ? 'game_completed' : 'practice_completed', {
    game_id: gameId,
    session_id: meta.sessionId || null,
    difficulty: result.mode || null,
    score: typeof result.score === 'number' ? result.score : null,
    start_time: result.startedAt || null,
    completion_time: new Date().toISOString()
  });

  if (!ability) return null;
  const after = abilityScore(ability, history);
  return {
    ability: ability.name,
    before: before.score,
    after: after.score,
    runScore: ability.score(history[history.length - 1]),
    provisional: after.provisional,
    runs: after.runs
  };
}

/* ------------------------------------------------------------------ trend */

function dayOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function endOfDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

/** One point per day played: every ability as it stood at the end of that day. */
function buildTrend(histories) {
  const days = new Set();
  for (const a of ABILITIES) for (const r of histories[a.id]) days.add(dayOf(r.ts));

  return [...days].sort().map((day) => {
    const cutoff = endOfDay(day);
    const abilities = {};
    const scored = [];
    for (const a of ABILITIES) {
      const s = abilityScore(a, histories[a.id].filter((r) => r.ts <= cutoff)).score;
      abilities[a.id] = s;
      if (s !== null) scored.push(s);
    }
    return {
      day,
      ts: cutoff,
      brain: scored.length ? Math.round(mean(scored)) : null,
      abilities
    };
  });
}

/* ---------------------------------------------------------------- profile */

export async function buildMindProfile() {
  await migrateOnce();

  const histories = {};
  for (const a of ABILITIES) histories[a.id] = await getHistory(a.game);

  const abilities = ABILITIES.map((a) => {
    const runs = histories[a.id];
    const s = abilityScore(a, runs);
    const last = runs.length ? runs[runs.length - 1] : null;
    return {
      id: a.id, name: a.name, game: a.game, gameName: a.gameName, icon: a.icon, what: a.what,
      ...s,
      lastMetric: last ? a.metric(last) : null
    };
  });

  const scored = abilities.filter((a) => a.score !== null);
  const brain = scored.length ? Math.round(mean(scored.map((a) => a.score))) : null;
  const trend = buildTrend(histories);

  // change against the most recent day at least a week old
  let weekDelta = null;
  if (brain !== null) {
    const weekAgo = Date.now() - 7 * 864e5;
    const past = trend.filter((p) => p.ts <= weekAgo && p.brain !== null).pop();
    if (past) weekDelta = brain - past.brain;
  }

  return {
    brain,
    weekDelta,
    coverage: scored.length,
    total: ABILITIES.length,
    complete: scored.length === ABILITIES.length && scored.every((a) => !a.provisional),
    abilities,
    trend,
    comingSoon: COMING_SOON
  };
}
