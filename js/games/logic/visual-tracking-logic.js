/* Visual Tracking - pure logic (no DOM), unit-tested in tests/games.test.mjs.

   Multiple-object tracking: one object is marked as the target, then every object
   turns identical and they all move. When they stop, the player picks the target.
   Because the objects look the same while moving, the only way to answer is to
   have followed it - that is what the task measures.

   Motion is simulated here at a fixed 60 Hz step from a seed, so a trial can be
   regenerated exactly and its properties can be tested: objects stay inside the
   arena, never overlap, and never park in one spot. Speed is constant within a
   trial (it is the difficulty variable); direction wanders randomly, objects steer
   away from each other and from the walls, and harder modes add sudden turns. */

import { createRng } from '../../core/rng.js';
import { mean, median, round } from '../../core/stats.js';

/** Arena in abstract units; the page scales it to whatever size it is drawn at. */
export const ARENA = { w: 1000, h: 625, r: 30 };
export const DT = 1 / 60;
export const MIN_GAP = 2 * ARENA.r + 8;       // centre-to-centre floor: never touching
const SENSE = 4.2 * ARENA.r;                  // start steering away from a neighbour
const WALL_SENSE = 2.4 * ARENA.r;
const REF_SPEED = 300;                        // wander and turns are given at this speed

/** Speed per level, in arena units per second (the arena is 1000 wide). */
export const SPEEDS = [140, 180, 220, 270, 320, 380, 450, 530];
export const LEVELS = SPEEDS.length;

/** Starting spots: spread out, clear of the walls, found by seeded rejection sampling. */
export function startPositions(rng, n) {
  const { w, h, r } = ARENA;
  const pad = 2.6 * r;                        // outside the walls' steering band
  for (let attempt = 0; attempt < 200; attempt++) {
    const pts = [];
    for (let tries = 0; pts.length < n && tries < 400; tries++) {
      const x = rng.range(pad, w - pad);
      const y = rng.range(pad, h - pad);
      if (pts.every((p) => Math.hypot(p.x - x, p.y - y) >= 3.4 * r)) pts.push({ x, y });
    }
    if (pts.length === n) return pts;
  }
  // unreachable for the object counts used here; a grid keeps it total anyway
  const cols = Math.ceil(Math.sqrt(n * (w / h)));
  return Array.from({ length: n }, (_, i) => ({
    x: pad + ((i % cols) + 0.5) * ((w - 2 * pad) / cols),
    y: pad + (Math.floor(i / cols) + 0.5) * ((h - 2 * pad) / Math.ceil(n / cols))
  }));
}

/**
 * Simulates one trial. Returns frames as a flat Float32Array:
 * frame f, object i -> x at [(f * n + i) * 2], y at +1.
 * params: { n, speed, duration (ms), wander (rad/s of drift), turns (sudden turns per s) }.
 * wander and turns are quoted at REF_SPEED and scale with speed, so a path curves
 * the same amount per distance travelled at any speed: slow objects do not spin
 * in place, and speed stays the only thing the staircase changes.
 */
export function simulate(seed, { n, speed, duration, wander, turns }) {
  const rng = createRng(seed);
  const { w, h, r } = ARENA;
  const steps = Math.round(duration / 1000 / DT);
  const objs = startPositions(rng, n).map((p) => ({ ...p, a: rng.range(0, 2 * Math.PI) }));
  const frames = new Float32Array((steps + 1) * n * 2);
  const record = (f) => objs.forEach((o, i) => { frames[(f * n + i) * 2] = o.x; frames[(f * n + i) * 2 + 1] = o.y; });
  const pace = speed / REF_SPEED;
  const jitter = (wander * pace) / Math.sqrt(20);   // uniform steps whose spread adds up to `wander` per second
  const turnRate = turns * pace;

  record(0);
  for (let f = 1; f <= steps; f++) {
    for (const o of objs) {
      o.a += (rng.next() * 2 - 1) * jitter;
      if (turnRate && rng.chance(turnRate * DT)) o.a += (rng.chance(0.5) ? 1 : -1) * rng.range(Math.PI / 3, (2 * Math.PI) / 3);
    }

    // steer: heading plus a push away from close neighbours and walls; speed stays constant
    const headings = objs.map((o, i) => {
      let vx = Math.cos(o.a);
      let vy = Math.sin(o.a);
      objs.forEach((p, j) => {
        if (i === j) return;
        const dx = o.x - p.x;
        const dy = o.y - p.y;
        const d = Math.hypot(dx, dy) || 0.001;
        if (d < SENSE) {
          const k = 2.2 * (1 - d / SENSE) ** 2;
          vx += (dx / d) * k;
          vy += (dy / d) * k;
        }
      });
      if (o.x < WALL_SENSE) vx += 1.0 * (1 - o.x / WALL_SENSE);
      if (o.x > w - WALL_SENSE) vx -= 1.0 * (1 - (w - o.x) / WALL_SENSE);
      if (o.y < WALL_SENSE) vy += 1.0 * (1 - o.y / WALL_SENSE);
      if (o.y > h - WALL_SENSE) vy -= 1.0 * (1 - (h - o.y) / WALL_SENSE);
      // two walls at once can trap an object looping in a corner: head for open space
      const nearX = o.x < WALL_SENSE || o.x > w - WALL_SENSE;
      const nearY = o.y < WALL_SENSE || o.y > h - WALL_SENSE;
      if (nearX && nearY) {
        const cx = w / 2 - o.x;
        const cy = h / 2 - o.y;
        const d = Math.hypot(cx, cy);
        vx += (cx / d) * 1.2;
        vy += (cy / d) * 1.2;
      }
      return Math.atan2(vy, vx);
    });

    objs.forEach((o, i) => {
      o.a = headings[i];
      o.x += Math.cos(o.a) * speed * DT;
      o.y += Math.sin(o.a) * speed * DT;
      // a wall is a mirror
      if (o.x < r) { o.x = r; o.a = Math.PI - o.a; }
      if (o.x > w - r) { o.x = w - r; o.a = Math.PI - o.a; }
      if (o.y < r) { o.y = r; o.a = -o.a; }
      if (o.y > h - r) { o.y = h - r; o.a = -o.a; }
    });

    // safety net: steering keeps them apart, this guarantees it
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = objs[i];
          const b = objs[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.001;
          if (d >= MIN_GAP) continue;
          const push = (MIN_GAP - d) / 2;
          a.x -= (dx / d) * push; a.y -= (dy / d) * push;
          b.x += (dx / d) * push; b.y += (dy / d) * push;
        }
      }
      for (const o of objs) {
        o.x = Math.min(w - r, Math.max(r, o.x));
        o.y = Math.min(h - r, Math.max(r, o.y));
      }
    }
    record(f);
  }
  return { frames, steps, n };
}

export const positionAt = (sim, f, i) => ({ x: sim.frames[(f * sim.n + i) * 2], y: sim.frames[(f * sim.n + i) * 2 + 1] });

/** Answer labels 1..n, numbered left to right as the objects come to rest. */
export function labelOrder(sim) {
  const last = sim.steps;
  return Array.from({ length: sim.n }, (_, i) => i).sort((a, b) => positionAt(sim, last, a).x - positionAt(sim, last, b).x);
}

/** Staircase: two right in a row speeds up, one wrong slows down, within 1..LEVELS. */
export function nextLevel(level, streak, correct) {
  if (!correct) return { level: Math.max(1, level - 1), streak: 0 };
  if (streak + 1 >= 2) return { level: Math.min(LEVELS, level + 1), streak: 0 };
  return { level, streak: streak + 1 };
}

export const speedFor = (level) => SPEEDS[Math.max(1, Math.min(LEVELS, level)) - 1];

export const pointsFor = (correct, level, rt) =>
  (correct ? 100 + 25 * level + Math.max(0, Math.round((4000 - (rt || 4000)) / 40)) : 0);

/**
 * trials: { level, speed, correct, rt }. The speed the player could keep up with
 * is read from the second half of the round, after the staircase has settled.
 */
export function summarize(trials) {
  const correct = trials.filter((t) => t.correct).length;
  const settled = trials.slice(Math.floor(trials.length / 2));
  const rts = trials.filter((t) => t.correct && typeof t.rt === 'number').map((t) => t.rt);
  return {
    correct,
    wrong: trials.length - correct,
    total: trials.length,
    accuracy: trials.length ? Math.round((correct / trials.length) * 100) : 0,
    levelReached: trials.length ? Math.max(...trials.map((t) => t.level)) : 0,
    levelEstimate: settled.length ? round(mean(settled.map((t) => t.level)), 1) : null,
    speedHeld: settled.length ? round(mean(settled.map((t) => t.speed))) : null,
    medianRt: round(median(rts)),
    timeouts: trials.filter((t) => t.rt === null).length
  };
}
