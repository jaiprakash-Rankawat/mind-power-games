# Brain Test Architecture

Mind Power Games is a Manifest V3 Chrome extension with eleven short cognitive
games. They can be played one at a time (**Practice**), as a five-game, five-minute
**Daily Brain Check** that builds a Brain Level (section 15), or as a fixed,
eleven-game **Brain Test** that produces a Brain Profile.

The code is plain JavaScript (ES modules). There is no bundler, no framework, no
dependencies, no network code, and no account. Chrome loads the source files
directly.

## Product principles

1. These are **cognitive-performance games**, not a medical, clinical or IQ assessment. The UI says so wherever scores appear.
2. Scores are called **Performance Scores**, never "IQ", "intelligence" or "brain power". There are no population comparisons ("better than X% of people"). **Brain Level** is a progression level earned with XP: it only goes up and is always described as practice and progress, never as a measure of intelligence.
3. **Accuracy and consistency come before flashy scoring.** Every question has exactly one objectively correct answer, and the tests prove it.
4. **Raw data is never thrown away.** Every trial is stored; scores are derived from it.
5. **No login to play.** The whole test works anonymously and offline.
6. **The three original games are production code.** They were extended through small, additive, opt-in hooks, never rewritten.

---

## 1. The eleven games

Registry order is test order (`js/core/games.js`).

| # | Game | File | Category | Official settings | Headline measure |
|---|------|------|----------|-------------------|------------------|
| 1 | Color Clash | `js/games/stroop.js` | Attention / inhibitory control | Medium: 6 colours, 50s | Reaction time ÷ accuracy; Stroop interference (ms) |
| 2 | Memory Grid | `js/games/memory-grid.js` | Visual memory (visuospatial span) | Easy: 3×3 grid (standard 9-block Corsi) | Span |
| 3 | N-Back | `js/games/n-back.js` | Working memory (updating) | Easy, **3 blocks** (practice uses 4) | Peak N held, d′ |
| 4 | Reaction Speed | `js/games/reaction.js` | Processing speed | Medium: 8 simple + 14 two-choice | Median choice RT ÷ accuracy, plus simple RT |
| 5 | Task Switch | `js/games/task-switch.js` | Cognitive flexibility | Medium: 36 cards, 35% switches | Switch cost (ms) |
| 6 | Number Pattern | `js/games/number-pattern.js` | Fluid reasoning | Medium: 12 patterns, starts at level 2 | Level held (adaptive) |
| 7 | Spatial Rotation | `js/games/spatial-rotation.js` | Visuospatial reasoning | Medium: 16 pairs, turns 45–180° | Median RT ÷ accuracy; ms per degree |
| 8 | Sequence Recall | `js/games/sequence-recall.js` | Sequence memory (digit span) | Medium: forward, one digit per second, from 3 | Span |
| 9 | Visual Tracking | `js/games/visual-tracking.js` | Visual tracking (multiple-object tracking) | Medium: 5 objects, 5s of motion, 10 rounds | Speed held |
| 10 | Attention Storm | `js/games/attention-storm.js` | Sustained attention, inhibitory control | Medium: 3 blocks of 32 shapes, pace adapts | d′ |
| 11 | Path Finder | `js/games/path-finder.js` | Planning | Medium: 8 mazes, level ladder from 6×6 | Level held, route efficiency |

The whole test takes about 19 minutes (12 before protocol 2). Each game has a `minutes` estimate in the registry, and the total is computed from those.

### Why the original seven

The target list had seven categories, but the audit found that two of the three
original games measure working memory: **Memory Grid** measures span (storing and
replaying positions) and **N-Back** measures updating. Neither involves mentally
*transforming* anything, so Memory Grid is **not** visuospatial reasoning.

That left five uncovered categories and four new slots:

- **Visual Search was left out.** It overlaps most with what is already measured. It is attention-driven (Color Clash covers attention) and its main output is speed (Reaction Speed covers speed).
- **Mental rotation was kept.** It is a distinct, well-studied ability with an objective signature: reaction time rises steadily with the rotation angle.
- **Memory Grid appears in profiles as "Visual Memory"**, not as spatial reasoning, so the label matches what it actually measures.

Visual Search could be added later as a practice-only eighth game.

### Protocol 2: four more games

Sequence Recall, Visual Tracking, Attention Storm and Path Finder were added as games
8-11 (`PROTOCOL_VERSION` 2). They come **after** the original seven, so those keep the
same position in the test - and the same fatigue - as before. The test grows from
about 12 to about 19 minutes; later games are played by a more tired player, which
should be kept in mind when comparing abilities.

- **Sequence Recall** overlaps with Memory Grid (span) and N-Back (working memory).
  It measures memory for *order* of easily named items (digit span), where Memory
  Grid measures places and N-Back measures updating. It is shown as **Sequence
  Memory**.
- **Attention Storm** overlaps with Color Clash (attention). It is a continuous-
  performance task: staying on task through a long stream and holding back for
  look-alikes, rather than resisting one strong interference. It is shown as
  **Sustained Attention**.
- **Visual Tracking** is multiple-object tracking. The target is shown red, then
  **every object turns identical before moving** - if it stayed red, the question
  at the end could be answered without tracking anything.
- **Path Finder** measures planning. It draws on spatial skills (Spatial Reasoning)
  and problem solving (Reasoning), but its signature is choosing a route *before*
  committing to it: every step counts, including steps back.

### Known overlaps (to keep in mind when interpreting)

- **Color Clash** also rewards speed, so it overlaps with processing speed. Its Hard mode adds rule switching, which overlaps with flexibility. The official test uses **Medium (no rule flips)** to keep it an attention measure.
- **Reaction Speed Easy** is simple reaction only, which mostly measures motor speed. The official Medium adds a choice block, which makes it a processing-speed measure.
- **Number Pattern** draws on familiarity with numbers. A picture-based reasoning task (Raven-style matrices) would be fairer across backgrounds, but is a much larger build.

---

## 2. Architecture

```
popup.html / js/popup.js        Daily Brain Check, Performance Score, Brain Test, practice tiles
daily.html / js/daily-runner.js DAILY: home -> [card -> game] x5 -> results, XP, Brain Level
test.html  / js/test-runner.js  OFFICIAL: intro -> [card -> game] x11 -> Brain Profile
game.html  / js/game-shell.js   PRACTICE: one game, chosen difficulty   (unchanged)
profile.html / js/profile-page.js   rolling profile, trend, Brain Test history

js/core/
  games.js        registry: order, modes, official settings, instructions, minutes
  session.js      Brain Test sessions: state machine, persistence, eligibility
  daily.js        Daily Brain Check: settings, day seed, XP and Brain Level, persistence
  level-ui.js     Brain Level badge and XP bar
  score-reveal.js the animated "out of 100" score ring on the Brain Test and Daily Brain Check results
  icons.js        game icons (SVG), each showing how its game is played
  tutorial.js     how-to-play overlay; tutorials.js holds each game's rule, example and practice
  result.js       standard GameResult envelope (wraps a game's native result)
  profile.js      scoring curves, run history, rolling Performance Score, trend
  rng.js          seeded PRNG (mulberry32) + seed hashing
  stats.js        median / mean / sd / slope
  analytics.js    local-only event log
  game-kit.js     shared setup / countdown / results screens for the newer games
  arcade.js fx.js audio.js charts.js util.js storage.js sound-control.js

js/games/        the eleven games, each exporting mount(root, ctx)
js/games/logic/  pure, DOM-free logic for the eight newer games (unit-tested)
```

### The game contract

Each game exports one function (the five in the Daily Brain Check also export their
`MODES`, so the tests can check the daily settings against the real ones):

```js
mount(root, ctx)
// ctx.game      registry entry
// ctx.official  absent in practice; in the Brain Test and the Daily Brain Check:
//               { difficulty, blocks?, overrides?, source?, seed, sessionId, onComplete(result) }
//               overrides: settings merged over the mode (the daily check's shorter rounds)
//               source:    'official' (default) or 'daily', recorded with the round
```

**Practice** passes `{ game }` and nothing else, so every game behaves exactly as it did before the Brain Test existed.

**Official** passes `ctx.official`. A game then:
- skips its difficulty screen and plays at the fixed settings
- ignores Esc, so the test can't be quit by accident
- saves, logs and hands its native result to `onComplete` instead of showing its own results screen

The generic `BrainGame` interface (`start / handleInput / isComplete / calculateResult / reset`) was **deliberately not introduced**. Each original game is a self-contained screen state machine; forcing a new interface onto them would have meant rewriting working code with no benefit to players. Extending `ctx` achieved the same integration with small, additive changes.

### What changed in the original three games

Every change is behind `if (official)` or adds new result fields:

| Game | Change |
|------|--------|
| All three | `ctx.official` branch at mount; official hand-off in `finish()`; Esc ignored when official; `startedAt` and a `raw` trial log added to the result |
| Color Clash | keeps the colour-blind palette choice in official mode; new fields `rtCongruent`, `rtIncongruent`, `interferenceMs`. Since v1.3.0: seeded from `ctx.official.seed` when a test passes one (practice keeps `Math.random`, and records no seed); `overrides` can shorten the round; `source` is passed to the history |
| Memory Grid | new fields `correctSequences`, `errors`; raw log of every attempt, with the timing of each tap |
| N-Back | official settings can set the block count; "Stop and score" is hidden in official mode; raw log of every trial across blocks. `trials` stays a *count*; the list lives in `raw.trials`. |

`tests/scoring-baseline.test.mjs` pins 220 scoring cases captured **before** these changes, so any change to how the original games score fails the tests.

---

## 3. Game flow

**Practice:** popup tile → `game.html?game=<id>` → setup (choose difficulty) → countdown → play → results screen (grade, stats, ability chip) → play again / change difficulty.

**Official:** popup "Start Brain Test" → `test.html` → intro → for each of the 11 games:
1. an instruction card ("GAME 3 / 11", one line of rules, the keys)
2. the game at its official settings
3. the result is saved into the session

After game 11 comes the **Brain Profile**. A progress bar with one segment per game stays visible throughout. All runner actions are guarded against double activation, so a double-click can't start two sessions or mount a game twice.

---

## 4. Scoring architecture

```
raw trials -> native result (the game's own metrics + points)
           -> normalised 0-100 score (a curve in profile.js)
           -> Brain Profile (per-ability scores + overall)
```

- **Points** are the game's arcade score: fun, and comparable within one game and mode.
- **Normalised score (0–100):** each ability has a piecewise-linear curve with anchor points taken from published results for that kind of task. **50 is a reference midpoint, not a population average of our players.** 40–60 is shown as the reference range. Harder modes earn more credit for the same raw performance.
- **Guardrails:** near-chance play is capped (e.g. accuracy under 65% on two-choice tasks, d′ under 1 in N-Back, more than 5 false starts in Reaction Speed). A game with too few valid trials returns *no score* rather than a misleading one.
- **Rolling Performance Score** (popup and profile page): each ability's score is the median of the best 3 of the last 10 rounds, so one lucky round can't inflate it. It is "provisional" under 3 rounds. The Performance Score is the mean of the abilities played.
- **Brain Test overall:** the mean of the session's normalised scores (eleven under protocol 2, seven under protocol 1). A game with no valid score is **excluded**, not counted as zero, and the session is then marked unranked.
- **Scores are derived on read** from the stored raw results. `SCORING_VERSION` (in `result.js`) is saved with every official result, so a future curve change can be applied deliberately and knowingly.

| Ability | Raw input | Midpoint (≈50) |
|---------|-----------|----------------|
| Attention | RT ÷ accuracy | ~800ms (Easy) |
| Visual Memory | span | 5.5 |
| Working Memory | peak N ± d′ adjustment | 2.5-back |
| Processing Speed | 0.7 × choice (RT ÷ accuracy) + 0.3 × simple RT | ~470ms choice / ~320ms simple |
| Flexibility | switch cost, minus an accuracy penalty | ~200ms |
| Reasoning | level held (1–5) | ~3 |
| Spatial Reasoning | median RT ÷ accuracy | ~2100ms |
| Sequence Memory | span (+2 when recalled backwards) | 6.5 digits |
| Visual Tracking | speed held × credit for the number of objects | 300 units/s* |
| Sustained Attention | d′ (+ pace credit; reaction time moves it by at most 5 points) | d′ 3.0* |
| Planning | level held, ± route efficiency; +0.5 for mud puzzles | level ~3.3* |

\* Our own judgement for these tasks - there are no comparable published results to anchor to. Treat these three as provisional until norms exist (section 13).

These anchors are **rough reference points**, not norms. See section 13.

---

## 5. Session architecture

A session (`js/core/session.js`) is saved to `chrome.storage.local`:

```js
{
  id, kind: 'brain-test', protocolVersion: 2,   // 1 = the seven-game test
  seed,                         // every game's stimuli derive from this
  order: [11 game ids], index,  // next game to play
  status: 'in_progress' | 'completed' | 'abandoned',
  createdAt, updatedAt, completedAt, localDay,
  attemptOfDay,                 // 1 = first Brain Test started today
  attempts: { gameId: n },      // n > 1 means the game was interrupted and replayed
  results: { gameId: GameResult },
  summary: { overall, abilities[], measured, total, interruptions, eligible, reasons[], scoringVersion }
}
```

A session keeps the order it was created with, so a session started under protocol 1
still resumes, finishes and is scored with its own seven games.

**It is saved when a game starts and when it ends.** What happens after an interruption:

| Event | Result |
|-------|--------|
| Refresh, closing the tab, navigating away, browser/extension restart | Reopening the Brain Test shows **Welcome back** and resumes at the next unfinished game |
| Closing the popup | Nothing — the test runs in its own tab |
| Interrupted mid-game | That game **restarts from its beginning**. A timed game can't be fairly resumed halfway. The restart is recorded and makes the session unranked. |
| Switching tabs mid-game | The game pauses itself. Pause counts are recorded in the raw data. |
| "Start over" | The current session is marked `abandoned`, and a new one begins |

The pure state transitions (`createSession`, `beginGame`, `finishGame`, `summarize`) are unit-tested separately from persistence.

---

## 6. Data architecture

All data lives in `chrome.storage.local` on the player's machine. The manifest requests `unlimitedStorage` (no install warning) because raw trial data is kept rather than discarded.

| Key | Contents | Written by |
|-----|----------|------------|
| `history:<gameId>` | every round (practice, official and daily), raw result + `ts` + `source` (+ `sessionId`), up to 1000 per game | `profile.logRun` |
| `best:<gameId>:<mode>` | best-points round per mode | `storage.saveBest` |
| `profile` | rounds played, best points, day streak (local days) | `storage.recordRound` |
| `session:<id>` | a full Brain Test session, including GameResults with raw data | `session.js` |
| `session:current` | id of the in-progress session, or null | `session.js` |
| `sessions:list` | a summary row per session (for history and daily attempt counting) | `session.js` |
| `daily:check:<id>` | a full Daily Brain Check, including GameResults with raw data | `daily.js` |
| `daily:current` | id of the daily check in progress, or null | `daily.js` |
| `daily:list` | a row per daily check: day, counted, status, score, per-game scores, XP awarded (Brain Level is the sum of counted XP) | `daily.js` |
| `analytics:events` | local event log, capped at 2000 | `analytics.js` |
| `analytics:firstOpenAt` | first time any extension page opened | `analytics.js` |
| `profile.migrated` | one-time import of pre-profile bests done | `profile.js` |
| `soundOn`, `soundVolume`, `stroop.palette`, `theme` | preferences | audio, Color Clash, theme toggle |
| `tutorial:seen:<gameId>` | the how-to-play tutorial has been shown (finished or skipped) | `tutorial.js` |

### The GameResult envelope (official results)

```js
{
  gameId, mode: 'official', difficulty, protocolVersion, scoringVersion,
  startedAt, completedAt,
  points,            // the game's native score
  score,             // normalised 0-100 (null if not enough valid trials)
  accuracy, reactionTimeMs, correctAnswers, totalQuestions, difficultyReached,
  metrics,           // the game's native result, untouched
  raw                // trial-by-trial data
}
```

The envelope **wraps** the native result rather than replacing it, so nothing a game measures is lost.

### Raw data per game

| Game | Per-trial record |
|------|------------------|
| Color Clash | word, ink, rule, congruent, correct answer, response, correct, RT, time into round; pause count; palette |
| Memory Grid | per attempt: level, length, reversed?, the path, every tap with its timing, success, where it failed, aborted by pause; pause count |
| N-Back | block, N, position, colour, whether each channel was a match, whether and when the player pressed, voided by pause; pause count |
| Reaction Speed | block, target, response, RT, outcome (hit / error / timeout / anticipation / false start), false starts, wait time before the signal, input device; seed |
| Task Switch | digit, rule, repeat/switch, correct answer, congruent, response, correct, RT, input; seed |
| Number Pattern | level, rule family, the six numbers, answer, options, response, correct, RT, input; seed |
| Spatial Rotation | shape cells, mirrored?, angle, direction, answer, response, correct, RT, input; seed |
| Sequence Recall | per sequence: length, direction, the digits, expected answer, response, positions right, time of every key, undos, timed out, actual onset of every digit; pauses, voided sequences; seed |
| Visual Tracking | per round: trial seed, speed level and speed, objects, duration, target, response (object and number), correct, RT, input; motion settings; seed. Trajectories are regenerated from the trial seed, not stored |
| Attention Storm | per shape: block, level, kind (target / lure / other), shape, onset, responded, RT, input, outcome; per-block hit and false-alarm rates; extra presses; seed |
| Path Finder | per puzzle: the grid, start, goal, best cost and steps, trap flag, the walked path, cost, moves, excess, planning time (to the first move), total time, bumps, input; seed |

---

## 7. Randomisation and correctness

- **Seeded:** `rng.js` provides a mulberry32 generator. Each official session stores a seed, and each game's seed is `hashSeed(sessionSeed, gameId)`. Practice rounds draw a fresh seed and **record it**, so any round of the eight newer games (4-11) can be regenerated exactly.
- **Original three games:** Memory Grid and N-Back still use `Math.random` and are not seeded. Color Clash, which the Daily Brain Check needed, takes its stimuli from `ctx.official.seed` whenever a test passes one (both the Daily Brain Check and the Brain Test); practice rounds keep `Math.random`.

How each newer game guarantees one objectively correct answer (all enforced in `tests/games.test.mjs`):

- **Task Switch** never shows a 5, which is neither low nor high. Every digit has one answer under each rule. No run of the same rule is longer than 5, and each sequence contains enough switches to measure a cost.
- **Number Pattern** runs each generated series through eight rule families (arithmetic, geometric, affine, second-order, doubling differences, interleaved, Fibonacci-like, alternating operations). If **any** family that explains the six shown numbers predicts a different next number, the item is discarded. Distractors are never predicted by any fitting family. **Tested on 10,000 generated items.** The guarantee is relative to these eight families.
- **Spatial Rotation** only uses shapes that are chiral (the mirror image matches no rotation) and have no rotational symmetry, so "same" and "mirror" can never look identical and the displayed angle is the real one. Angle × answer combinations are exactly balanced. Tested on 450 generated trial sets.
- **Sequence Recall** never shows a digit twice in a row or three consecutive numbers (1-2-3), and schedules every digit from one start time, so presentation cannot drift (measured within ~10 ms in the browser).
- **Visual Tracking** simulates motion at a fixed 60 Hz step from a seed. Tested on 384 trials across every speed and mode: objects stay inside the arena, never touch (centres at least 2r + 4 apart), keep their speed (under 0.5% of frames below half speed) and never linger in one small area for 4 seconds.
- **Attention Storm** has exact target / lure / other counts per block, never starts with a target and never shows three targets in a row. A response belongs to a shape from 100 ms after its onset until 100 ms after the next onset, so slow-but-genuine responses are never lost. The fastest pace still shows each shape for 400 ms with a 700 ms window.
- **Path Finder** accepts a maze only after a shortest-path search (bucket-queue Dijkstra) finds a route; after a bounded number of tries it carves a route first. **Tested on 3,000 generated puzzles against an independent brute-force solver**: every one is solvable and the best cost it scores against is the true best. On Hard, the most direct route costs more than the cheapest in at least 90% of puzzles (a trap).
- **Reaction Speed** balances choice targets exactly across positions and randomises the wait before each signal (0.9–2.6s simple, 0.7–1.8s choice) so it can't be anticipated. Responses under 100ms count as guesses.

---

## 8. Difficulty system

Every game has Easy / Medium / Hard for practice, and **one fixed official setting**. Difficulty never changes randomly:

- **N-Back** adapts by block (Jaeggi protocol): ≤2 errors → N+1, ≥5 errors → N−1.
- **Number Pattern** adapts by item (two right in a row → harder rule family, one wrong → easier), settling near 70% correct.
- **Memory Grid** grows the path by one tile per cleared level.
- **Sequence Recall** adds a digit after each correct answer; two misses in a row end the round.
- **Visual Tracking** speeds up after two right in a row and slows down after a miss (settles near 70%).
- **Attention Storm** changes pace between blocks: faster after at least 85% caught with at most 10% false alarms, slower under 60% caught or over 30% false alarms.
- **Path Finder** climbs a six-step ladder (5×5 to 10×10) after a perfect route and drops after an unsolved puzzle.
- The others use fixed parameters per mode (number of choices, time limits, switch rate, shape size, angles).

---

## 9. Anonymous user flow

Install → click the icon → "Start Brain Test" → play all 11 → see the Brain Profile. No account, no network, nothing leaves the device.

"Save your Brain Profile? Create an account" is **not built**. When it is added, it should be offered *after* results and should upload existing local sessions on consent.

---

## 10. Practice vs official

| | Practice | Brain Test |
|--|--|--|
| Entry | popup tiles, profile page | popup "Start Brain Test", `test.html` |
| Games | one at a time | all 11, fixed order |
| Settings | player's choice | fixed per game |
| Attempts | unlimited | unlimited, but only the first of the day can be ranked |
| Results | per-game results screen | Brain Profile at the end |
| Stored as | `history` with `source: 'practice'` | `session:<id>`, plus `history` with `source: 'official'` |
| Ranking | never | only when eligible |

Official rounds also feed the rolling practice profile, tagged `official`. Rankings read only from sessions.

---

## 11. Leaderboard rules (prepared, not built)

A session is **eligible** only when **all** of these hold:

1. It was the player's **first Brain Test started that local day** (`attemptOfDay === 1`). Abandoning and restarting doesn't reset this, so "restart until the first game goes well" can't be used.
2. **No game was restarted** after an interruption.
3. **Every game produced a valid score.**

The reasons are stored in `summary.reasons` and shown to the player.

The data is shaped for **Daily** (`localDay`), **Weekly** (group by week of `localDay`), **Personal best** (max `summary.overall` among eligible sessions) and **Global** rankings.

> ⚠️ Scores computed on the player's machine can be forged. A real global
> leaderboard needs server-side checks. The stored raw trial data and seeds are
> what make those checks possible: the server can regenerate the stimuli from the
> seed and re-score the raw responses.

The Daily Brain Check already derives its seed from the local date (section 15), so its five games give everyone the same stimuli on the same day - the basis for a fair daily ranking. A Brain Test variant would also need Memory Grid and N-Back seeded (section 7).

---

## 12. Analytics and privacy

`js/core/analytics.js` appends events to local storage **only**. There is no network code anywhere in the extension.

| Event | When |
|-------|------|
| `extension_installed` | first time any extension page opens (there is no background worker to catch the real install) |
| `brain_test_started` / `_completed` / `_abandoned` | session lifecycle |
| `daily_check_started` / `_completed` / `_abandoned` | Daily Brain Check lifecycle (`counted`, `score`, `xp`; abandoned = left unfinished until the day ended) |
| `game_started` / `game_completed` | games in the Brain Test and the Daily Brain Check (`source`: `official` or `daily`) |
| `practice_started` / `practice_completed` | practice games (started = opened from the popup or profile) |
| `result_shared` | "Copy result" on the Brain Profile |
| `game_abandoned` | a practice round of one of the four newest games is quit with Esc (`trials_completed`, `duration_ms`) |

**Properties:** `game_id`, `session_id`, `difficulty`, `score`, `start_time`, `completion_time`, attempt numbers.

**Never collected:** names, emails, browsing history, page content, or anything about other websites. The manifest requests only `storage` and `unlimitedStorage`, with **no host permissions**, so the extension cannot read any web page.

Sending analytics anywhere later would need a backend, consent UI, a host permission and a privacy-policy update.

---

## 13. Future statistical benchmarking

The anchors behind today's 0–100 scores are reference points from published research, not norms from our own players. Raw data is kept specifically so this can be improved:

1. **Norms.** With consent, collect eligible official sessions, then replace the curve anchors with percentiles from real players, per device type.
2. **Reliability.** Measure test-retest correlation per game from players who take the test on nearby days. Games with low reliability should get more trials.
3. **Item calibration.** Number Pattern levels are rule families ordered by judgement. Item response theory on the logged responses (`raw.items`) would give empirical difficulties.
4. **Device latency.** Browser and keyboard latency inflate reaction times by a roughly constant amount per device. A calibration trial, or per-device norms, would correct for it (`input` is logged per trial).
5. **Construct checks.** Correlations between the eleven abilities across players would confirm, or question, the mapping in section 1.

Until norms exist, the UI keeps to neutral language ("Your performance score was 72 out of 100"), and every results page carries the not-a-clinical-or-IQ-test note.

---

## 14. Testing

| Command | What it checks |
|---------|----------------|
| `npm test` | 89 unit tests (Node built-in runner): scoring baseline for the original games, rng / stats / result envelope / session state machine and eligibility, the migration regression, correctness of every newer game's generator, the eleven-game protocol (`tests/brain-test.test.mjs`), the Daily Brain Check (`tests/daily.test.mjs`: settings, shortened rounds still scored, day seed, XP and levels), and the tutorials and icons (`tests/tutorials.test.mjs`: every game has both, and every practice answer is right) |
| `npm run validate` | manifest, icons, CSP (no inline scripts or `eval`), every asset path and import, registry → module |
| `npm run build` | validate, then write `dist/mind-power-games-v<version>.zip` |
| `tests/browser/harness.html` | dev-only page (not shipped) for mounting any game with an official context from the console |

**Verified in the browser for this release:**
- every game in both practice and official mode
- the full 7-game test end to end, on a first-of-day session
- refresh mid-game → resume → the restart is recorded and the test is unranked
- "Start over" → abandoned, with the attempt count incremented
- double-clicking any runner button → exactly one session and one game mount

**Verified in the browser for v1.2.0 (the four new games):**
- each new game in practice mode, played through by an in-page driver: correct answers, wrong answers, timeouts, pause (Space / P / tab hidden), Esc to quit (with `game_abandoned`), light and dark themes, a 400px-wide window
- counts recorded by the game match what the driver did (e.g. Attention Storm: 20 hits, 4 misses, 5 look-alike false alarms planned and recorded)
- Sequence Recall onset timing within 11 ms; Visual Tracking animation at a 14 ms median frame gap, no frame over 21 ms
- the Brain Test resuming at game 8 of 11 and playing the four new games in official mode to the Brain Profile (11 rows, overall = mean), with an interrupted game restarted and the session marked unranked
- a completed protocol-1 session still showing its own seven games and overall score
- all eleven games start, and popup, profile and test pages load, with no console errors

**Verified in the browser for v1.3.0 (the Daily Brain Check):**
- a first check played through with in-page drivers: Color Clash ran 40s, Reaction Speed 6 + 10 trials, Attention Storm 64 shapes, Visual Tracking 6 rounds; each result stored with `mode: 'daily'`, its settings and a seed, and logged to history with `source: 'daily'`
- a game with too few valid trials (Reaction Speed, all false starts) gave no score and was left out of the check score
- results against an earlier check: score change and previous best, per-game change, new-best badges, XP breakdown (+100, +score, +25 per best), level-up animation to level 2, next step naming the lowest ability
- "Done" shows today's check as done with the time to the next one; a practice run is not counted, and resumes after a reload
- the popup's daily card (in progress, done today) in dark and light themes, and the profile's daily section (level, best / last score, chart, history links to `daily.html?check=`)
- practice Color Clash unchanged: 50s, no seed recorded, `source: 'practice'`; the Brain Test intro unchanged; no console errors
- not timed: a full clean run end to end. The browser pane used for testing was hidden, which pauses animation frames, so Visual Tracking and Color Clash's timer were stepped by hand. About five minutes is the estimate from the settings (each game's `minutes` in `DAILY_GAMES`)

---

## 15. Daily Brain Check and Brain Level

Five games, about five minutes, once a day (`js/core/daily.js`, `daily.html`).

| # | Game | Ability | Setting |
|---|------|---------|---------|
| 1 | Color Clash | Attention | Medium, 40s (Brain Test: 50s) |
| 2 | Reaction Speed | Processing Speed | Medium, 6 simple + 10 choice (8 + 14) |
| 3 | Sequence Recall | Sequence Memory | Medium, unchanged |
| 4 | Attention Storm | Sustained Attention | Medium, 2 blocks of 32 (3 blocks) |
| 5 | Visual Tracking | Visual Tracking | Medium, 6 rounds (10) |

**Why these settings.** Each game keeps its Medium mode, so the scoring curves (and their load factors) apply unchanged. Only counts and lengths are shortened, and each still clears the minimum its score needs: 8+ Color Clash answers, 4+ valid trials in each Reaction Speed part (so two guesses in six still score), 40+ Attention Storm shapes with 8+ stars, 6 Visual Tracking rounds (paused rounds are replayed). Sequence Recall is left alone: it is adaptive already, and starting at 4 digits would score a player whose span is 3 as 0. Shorter rounds are noisier, so daily scores are compared with daily scores - bests and changes come only from earlier daily checks, never from the Brain Test or practice.

**Counting.** The first check started on a local day is *counted*: its seed is `hashSeed('daily-check', DAILY_VERSION, day)`, the same for everyone that day; it earns XP; it can set bests. Any other check that day is a practice run with a random seed, no XP and no bests. A check unfinished at the end of its day can't be resumed (its seed belongs to that day) and is marked abandoned. Bump `DAILY_VERSION` when the games or settings change.

**Score.** The mean of the five ability scores from that check; a game with no valid score is left out, not counted as zero.

**XP and Brain Level.** XP is stored with each counted check when it finishes, so a later rule change never takes a level away. A counted check earns +100 for finishing, + its score, +25 for each game that beats its previous best, and +50 for a new best score. A first check sets a baseline, so it earns no best bonuses. Level 2 needs 150 XP and each level after needs 50 more (`stepXp(n) = 100 + 50n`): a typical check (150-300 XP) levels up almost daily at first, and every two or three days by level 10.

**Beat-your-best loop.** The instruction card before each game shows that game's best and last daily score ("beat it"). The results screen shows the score change since the last check, the change and a new-best mark per game, the XP breakdown with a level-up animation, and names the lowest ability with a button to practise its game. The popup's top card shows the level and either "Start today's check", "Resume" or "Done today" with the time until the next one.

**Verified in the browser for v1.4.0 (blue palette, icons, try-it tutorials):**
- every tutorial opens and renders its example and practice with no errors; each practice was played through by an in-page driver, including a wrong answer first - the explanation shown was right every time (e.g. Color Clash: "That is what the word says", Path Finder: "You took 10 steps; the shortest is 8")
- keys pressed inside a tutorial never reach the game or runner underneath (Enter advances the tutorial, not the Daily Brain Check card)
- the tutorial opens by itself over the first Daily Brain Check card on a fresh profile; every instruction card and setup screen has How to play
- popup, profile, Brain Test and Daily Brain Check pages in the blue palette with the new icons, dark and light; the toolbar PNGs at 16-128 px on dark and light backgrounds

---

## 16. Tutorials

Each game's tutorial has three steps: **How it works** (the rule in one sentence and a worked example showing the right answer beside the tempting wrong one), **Try it** (practice questions in the game's own look) and **Ready** (controls and scoring). Practice questions are fixed rather than random, so they can be checked: `tests/tutorials.test.mjs` confirms, for example, that every Color Clash word differs from its ink, every Spatial Rotation mirror really cannot be turned into its shape, and the Path Finder maze's shortest route is the 8 steps the tutorial states.

A wrong practice answer says why and lets the player try again; the step is done when they have answered each question right. The overlay captures the keyboard while it is open, so nothing reaches the game underneath. It opens by itself the first time a game comes up anywhere (practice, Daily Brain Check, Brain Test - always before the game starts, so it never costs test time), and from any How to play button afterwards.
