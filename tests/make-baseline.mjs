/* One-off: snapshot what the scoring produces BEFORE the Brain Test work, so the
   regression test can prove existing scores never move. Re-run only on purpose. */
import { writeFileSync } from 'node:fs';
import { ABILITIES, abilityScore } from '../js/core/profile.js';

const byId = Object.fromEntries(ABILITIES.map((a) => [a.id, a]));
const cases = [];

for (const mode of ['easy', 'medium', 'hard'])
  for (const accuracy of [45, 60, 80, 92, 97, 100])
    for (const avgRt of [300, 500, 700, 900, 1200, 1600])
      cases.push({ ability: 'focus', run: { mode, accuracy, avgRt, correct: 30, wrong: 3 } });
cases.push({ ability: 'focus', run: { mode: 'easy', accuracy: 100, avgRt: 500, correct: 5, wrong: 0 } });

for (const mode of ['easy', 'medium', 'hard'])
  for (const span of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12])
    cases.push({ ability: 'visual-memory', run: { mode, span } });

for (const mode of ['easy', 'medium', 'hard'])
  for (const peakN of [1, 2, 3, 4, 5])
    for (const dprime of [0.5, 1.5, 2, 3, 3.9])
      cases.push({ ability: 'working-memory', run: { mode, peakN, dprime, trials: 37 } });

for (const c of cases) c.expected = byId[c.ability].score(c.run);

const aggregates = [[6], [5, 7], [5, 5, 9, 5, 5], [6, 6, 6, 6], [9, 9, 9, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5], []]
  .map((spans) => ({ spans, expected: abilityScore(byId['visual-memory'], spans.map((s) => ({ span: s, mode: 'easy' }))) }));

writeFileSync(new URL('./fixtures/scoring-baseline.json', import.meta.url), JSON.stringify({ cases, aggregates }, null, 1));
console.log(`baseline written: ${cases.length} single-run cases, ${aggregates.length} aggregate cases`);
