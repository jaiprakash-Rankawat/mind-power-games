/* Seeded randomness. Official Brain Test sessions store a seed, so every stimulus
   sequence can be regenerated exactly - for auditing a score, re-scoring later, or
   giving everyone the same test on a given day. Practice runs get a fresh seed,
   and still record it. */

/** A fresh 32-bit seed from the platform's secure generator. */
export function randomSeed() {
  const c = globalThis.crypto;
  if (c && c.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] >>> 0;
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

/** Deterministic 32-bit seed from any values (e.g. session seed + game id). */
export function hashSeed(...parts) {
  const str = parts.join('|');
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32: small, fast, and well distributed for game stimuli. */
export function createRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n) => Math.floor(next() * n);
  return {
    seed: seed >>> 0,
    next,
    int,
    /** integer in [lo, hi] inclusive */
    between: (lo, hi) => lo + int(hi - lo + 1),
    range: (lo, hi) => lo + next() * (hi - lo),
    chance: (p) => next() < p,
    pick: (arr) => arr[int(arr.length)],
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
  };
}
