/* The Brain Test with eleven games (protocol 2): the four newest games join the
   end of the test, and sessions started under protocol 1 keep their seven. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../js/core/games.js';
import { abilityFor, ABILITIES } from '../js/core/profile.js';
import { makeResult } from '../js/core/result.js';
import {
  officialOrder, testMinutes, officialSettings, createSession, beginGame, finishGame, PROTOCOL_VERSION
} from '../js/core/session.js';

const ORIGINAL = ['stroop', 'memory-grid', 'n-back', 'reaction', 'task-switch', 'number-pattern', 'spatial-rotation'];
const NEW = ['sequence-recall', 'visual-tracking', 'attention-storm', 'path-finder'];

test('brain test: the seven original games keep their order, the four new ones follow', () => {
  assert.deepEqual(officialOrder(), [...ORIGINAL, ...NEW]);
  assert.equal(PROTOCOL_VERSION, 2);
  assert.equal(testMinutes(), 19);
});

test('brain test: every new game has fixed settings, a module, instructions and its own ability', () => {
  const names = new Set(ABILITIES.map((a) => a.name));
  assert.equal(names.size, ABILITIES.length, 'ability names are unique');
  for (const id of NEW) {
    const g = GAMES.find((x) => x.id === id);
    assert.deepEqual(officialSettings(id), { difficulty: 'medium' });
    assert.ok(g.module && g.instruction && g.keys && g.category && g.minutes);
    assert.equal(g.tutorial.length, 3);
    assert.ok(abilityFor(id), `${id} has a scoring curve`);
  }
});

test('brain test: a session started under protocol 1 still runs, and scores, its own seven games', () => {
  const s = createSession({ id: 'old', seed: 1, order: ORIGINAL, now: 0, day: '2026-09-20', attemptOfDay: 1 });
  s.protocolVersion = 1;
  ORIGINAL.forEach((id, i) => { beginGame(s, id, i); finishGame(s, id, { gameId: id, score: 50 + i }, i); });
  assert.equal(s.status, 'completed');
  assert.equal(s.summary.total, 7);
  assert.deepEqual(s.summary.abilities.map((a) => a.gameId), ORIGINAL);
  assert.equal(s.summary.overall, 53);
});

test('brain test: the standard result envelope maps each new game\'s headline numbers', () => {
  const sq = makeResult({ gameId: 'sequence-recall', mode: 'official', difficulty: 'medium',
    native: { score: 900, span: 6, correct: 4, total: 6, accuracy: 67, medianRt: 3100, reverse: false, raw: { trials: [] } } });
  assert.equal(sq.difficultyReached, 6);
  assert.equal(sq.reactionTimeMs, 3100);
  assert.equal(sq.correctAnswers, 4);
  assert.equal(sq.totalQuestions, 6);
  assert.equal(typeof sq.score, 'number');
  assert.deepEqual(sq.raw, { trials: [] }, 'raw data is kept');

  const pf = makeResult({ gameId: 'path-finder', mode: 'official', difficulty: 'medium',
    native: { score: 4000, correct: 5, total: 8, accuracy: 63, levelReached: 5, levelEstimate: 4.5, efficiency: 95, completionRate: 100, raw: {} } });
  assert.equal(pf.difficultyReached, 5);
  assert.equal(pf.correctAnswers, 5);
  assert.equal(typeof pf.score, 'number');
});
