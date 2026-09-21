/* Regression guard: the scores the three original games produce must never move.
   The fixture was captured before the Brain Test work began. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ABILITIES, abilityScore } from '../js/core/profile.js';

const { cases, aggregates } = JSON.parse(readFileSync(new URL('./fixtures/scoring-baseline.json', import.meta.url), 'utf8'));
const byId = Object.fromEntries(ABILITIES.map((a) => [a.id, a]));

test('original ability curves are unchanged', () => {
  for (const c of cases) {
    assert.equal(byId[c.ability].score(c.run), c.expected, `${c.ability} ${JSON.stringify(c.run)}`);
  }
});

test('original aggregation (median of best 3 of last 10) is unchanged', () => {
  for (const a of aggregates) {
    const got = abilityScore(byId['visual-memory'], a.spans.map((s) => ({ span: s, mode: 'easy' })));
    assert.deepEqual(got, a.expected, `spans ${a.spans}`);
  }
});
