/* The standard result format for official Brain Test sessions.

   Games keep returning their own native result object - the envelope wraps it
   rather than replacing it, so nothing a game measures is ever lost. */

import { abilityFor } from './profile.js';

/** Bump when a scoring curve changes, so old sessions can be re-scored knowingly. */
export const SCORING_VERSION = 1;

/**
 * @typedef {Object} GameResult
 * @property {string} gameId
 * @property {'official'|'practice'} mode
 * @property {string} difficulty          the settings the round was played at
 * @property {number|null} protocolVersion  Brain Test protocol, null for practice
 * @property {number} scoringVersion
 * @property {string|null} startedAt       ISO time the round began
 * @property {string} completedAt          ISO time the round ended
 * @property {number|null} points          the game's own points (its native `score`)
 * @property {number|null} score           normalised 0-100 performance score
 * @property {number|null} accuracy        percent
 * @property {number|null} reactionTimeMs  the game's headline response time
 * @property {number|null} correctAnswers
 * @property {number|null} totalQuestions
 * @property {number|null} difficultyReached  span, N level, pattern level...
 * @property {Object} metrics              the game's native result, minus raw
 * @property {Object|null} raw             trial-by-trial data - never discarded
 */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Normalised 0-100 score for a native result, via the same curves the profile uses. */
export function normalizedScore(gameId, native) {
  const ability = abilityFor(gameId);
  if (!ability) return null;
  const s = ability.score(native);
  return num(s);
}

/** @returns {GameResult} */
export function makeResult({ gameId, mode, difficulty, native, protocolVersion = null }) {
  const { raw = null, startedAt = null, ...metrics } = native;
  const total = metrics.total ??
    (typeof metrics.correct === 'number' && typeof metrics.wrong === 'number' ? metrics.correct + metrics.wrong : null) ??
    metrics.trials;

  return {
    gameId,
    mode,
    difficulty,
    protocolVersion,
    scoringVersion: SCORING_VERSION,
    startedAt,
    completedAt: new Date().toISOString(),
    points: num(metrics.score),
    score: normalizedScore(gameId, native),
    accuracy: num(metrics.accuracy),
    reactionTimeMs: num(metrics.avgRt ?? metrics.medianRt ?? metrics.choiceMedianRt ?? metrics.simpleMedianRt),
    correctAnswers: num(metrics.correct ?? metrics.hits ?? metrics.correctSequences),
    totalQuestions: num(total),
    difficultyReached: num(metrics.peakN ?? metrics.span ?? metrics.levelReached),
    metrics,
    raw
  };
}
