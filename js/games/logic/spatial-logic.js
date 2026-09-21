/* Spatial Rotation - pure logic (no DOM), unit-tested in tests/games.test.mjs.

   Shapes are polyominoes: squares joined edge to edge. Each trial shows a shape
   and a second copy turned by some angle - either the same shape, or its mirror
   image. The player says which.

   Correctness guarantee: only CHIRAL shapes are used - no rotation of the shape
   matches its mirror image - so "same" and "mirror" can never look identical.
   Shapes also have no rotational symmetry, so the angle shown is the real angle
   the player has to mentally rotate through. (For squares on a grid, checking
   the four 90-degree rotations is sufficient: any rotation that maps a grid shape
   onto a grid shape is a multiple of 90 degrees.) */

import { median, slope, round } from '../../core/stats.js';

export function normalize(cells) {
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - minX, y - minY]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

export const shapeKey = (cells) => normalize(cells).map(([x, y]) => x + ',' + y).join(';');
export const rotate90 = (cells) => normalize(cells.map(([x, y]) => [y, -x]));
export const mirror = (cells) => normalize(cells.map(([x, y]) => [-x, y]));

export function rotations(cells) {
  const out = [normalize(cells)];
  for (let i = 1; i < 4; i++) out.push(rotate90(out[i - 1]));
  return out;
}

/** Chiral and without rotational symmetry. */
export function isValidShape(cells) {
  const keys = rotations(cells).map(shapeKey);
  if (new Set(keys).size !== 4) return false;
  return !keys.includes(shapeKey(mirror(cells)));
}

/** A random connected shape of `size` squares. */
export function randomPolyomino(rng, size) {
  const cells = [[0, 0]];
  const has = (x, y) => cells.some((c) => c[0] === x && c[1] === y);
  const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (cells.length < size) {
    const [x, y] = rng.pick(cells);
    const [dx, dy] = rng.pick(steps);
    if (!has(x + dx, y + dy)) cells.push([x + dx, y + dy]);
  }
  return normalize(cells);
}

export function makeShape(rng, size) {
  for (let tries = 0; tries < 500; tries++) {
    const cells = randomPolyomino(rng, size);
    const w = Math.max(...cells.map((c) => c[0])) + 1;
    const h = Math.max(...cells.map((c) => c[1])) + 1;
    if (Math.max(w, h) > size - 1) continue;          // no long thin sticks
    if (isValidShape(cells)) return cells;
  }
  throw new Error(`no valid shape of size ${size}`);
}

/**
 * Trials fixed by the seed. Every angle appears equally often with each answer
 * (count must be a multiple of 2 x angles), in a shuffled order.
 */
export function makeTrials(rng, { count, size, angles }) {
  const combos = [];
  for (const angle of angles) for (const mirrored of [false, true]) combos.push({ angle, mirrored });
  const list = [];
  while (list.length < count) list.push(...combos);
  return rng.shuffle(list.slice(0, count)).map(({ angle, mirrored }) => {
    const shape = makeShape(rng, size);
    const base = rotations(shape)[rng.int(4)];         // start from any orientation
    return {
      cells: base,
      probe: mirrored ? mirror(base) : base,           // drawn turned by angle * direction
      mirrored,
      angle,
      direction: rng.chance(0.5) ? 1 : -1,
      answer: mirrored ? 'mirror' : 'same'
    };
  });
}

/** trials: { angle, correct, rt (null on timeout) }. */
export function summarize(trials) {
  const ok = trials.filter((t) => t.correct && typeof t.rt === 'number');
  const byAngle = {};
  for (const a of [...new Set(trials.map((t) => t.angle))].sort((x, y) => x - y)) {
    byAngle[a] = round(median(ok.filter((t) => t.angle === a).map((t) => t.rt)));
  }
  const correct = trials.filter((t) => t.correct).length;
  const med = round(median(ok.map((t) => t.rt)));
  return {
    correct,
    total: trials.length,
    accuracy: trials.length ? Math.round((correct / trials.length) * 100) : 0,
    medianRt: med,
    avgRt: med,
    rtByAngle: byAngle,
    // how much longer each degree of rotation takes - the classic mental-rotation signature
    rtSlope: round(slope(ok.map((t) => t.angle), ok.map((t) => t.rt)), 1),
    timeouts: trials.filter((t) => t.rt === null).length
  };
}
