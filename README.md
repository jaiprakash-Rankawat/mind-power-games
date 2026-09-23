# Mind Power Games

A Chrome extension (Manifest V3) with eleven short cognitive games. Take the
**Daily Brain Check** - five games in about five minutes, once a day, building your
Brain Level - or the full **Brain Test** - all eleven in a fixed order, about 19
minutes, ending in a Brain Profile - or practise any game on its own. No account, no
network: everything stays on your machine.

These are cognitive-performance games, not a medical assessment or an IQ test.
The full design is in **[BRAIN_TEST_ARCHITECTURE.md](BRAIN_TEST_ARCHITECTURE.md)**.

## Install

See **[INSTALL.md](INSTALL.md)** for the full walkthrough and troubleshooting.
The short version:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this folder
4. Pin "Mind Power Games" to the toolbar

### Scripts

There is **no bundler and no compile step** - Chrome loads the source files as they
are, so you never need to build before loading the extension. The scripts only
check, package and serve it (no dependencies, `npm install` is not needed):

```bash
npm test           # unit tests: scoring baseline, sessions, daily check, game generators
npm run validate   # pre-flight: manifest, icons, CSP, asset + import paths
npm run build      # validate, then write dist/mind-power-games-v<version>.zip
npm run dev        # static server on :5173 for testing outside Chrome
```

`npm run build` is only for sharing or the Chrome Web Store. For local use, skip it
and load the folder directly.

## Brain Test & Performance Scores

Each game measures one ability on a 0-100 scale (50 is a reference midpoint from
published results for similar tasks - not a comparison with other players).

| # | Game | Ability | Raw measure behind the score |
|---|---|---|---|
| 1 | Color Clash | Attention | reaction time / accuracy (plus Stroop interference) |
| 2 | Memory Grid | Visual Memory | span (longest path replayed clean) |
| 3 | N-Back | Working Memory | peak N level, adjusted by d-prime |
| 4 | Reaction Speed | Processing Speed | median choice time / accuracy, plus simple reaction time |
| 5 | Task Switch | Flexibility | switch cost: slowdown right after the rule changes |
| 6 | Number Pattern | Reasoning | difficulty level held by an adaptive staircase |
| 7 | Spatial Rotation | Spatial Reasoning | median time / accuracy; ms per degree of rotation |
| 8 | Sequence Recall | Sequence Memory | span: longest digit sequence typed back perfectly (backwards on Hard) |
| 9 | Visual Tracking | Visual Tracking | speed held by a staircase while following one object among look-alikes |
| 10 | Attention Storm | Sustained Attention | d-prime (stars caught vs false alarms); reaction time adjusts it by at most 5 |
| 11 | Path Finder | Planning | level held on a ladder of mazes, adjusted by route efficiency |

**Three ways to play:**

- **Daily Brain Check** (`daily.html`, the big card at the top of the popup) - five
  games in about five minutes: Color Clash, Reaction Speed, Sequence Recall,
  Attention Storm and Visual Tracking, at shortened Medium settings. See below.
- **Brain Test** (`test.html`, from "Full Brain Test" in the popup) - all eleven at
  fixed settings, ending in a Brain Profile: an overall performance score, the eleven
  ability scores and their shape. Progress is saved after every game, so a closed
  tab resumes at the next game. Only the first test of the day, with no restarted
  games, is marked as ranking-eligible.
- **Practice** (the tiles in the popup) - any game, any difficulty, as often as you
  like. Never ranked.

**Where scores show:** the popup (Brain Level, Performance Score and one meter per
game), the profile page (`profile.html`: radar, Brain Level and daily scores,
per-ability meters, trend, Brain Test history) and every results screen (a chip
showing how the round moved the ability score).

**How the numbers are made:** raw trial data is stored and scores are derived from
it. A practice ability score is the median of your best 3 of your last 10 rounds
(provisional under 3). Near-chance play is capped and too-few-trials rounds get no
score rather than a misleading one. Details and the anchor points for each curve:
[BRAIN_TEST_ARCHITECTURE.md](BRAIN_TEST_ARCHITECTURE.md), section 4.

## Daily Brain Check & Brain Level

Five games, about five minutes, built to be played every day:

| # | Game | Ability | Daily setting (Medium, shortened) |
|---|---|---|---|
| 1 | Color Clash | Attention | 40s instead of 50s |
| 2 | Reaction Speed | Processing Speed | 6 simple + 10 choice trials instead of 8 + 14 |
| 3 | Sequence Recall | Sequence Memory | unchanged (adaptive; starting longer would score a span of 3 as 0) |
| 4 | Attention Storm | Sustained Attention | 2 blocks of 32 shapes instead of 3 |
| 5 | Visual Tracking | Visual Tracking | 6 rounds instead of 10 |

Every shortened game still clears the minimum trials its score needs (tested in
`tests/daily.test.mjs`).

- **The score** (0-100) is the mean of the five ability scores from that check, on
  the same curves as everywhere else. It is the number to push higher.
- **One check a day counts.** The first check of each local day uses that day's
  seed - everyone who plays that day gets the same stimuli - earns XP and can set
  personal bests. Any further check that day is a practice run: fresh stimuli, no
  XP, no bests.
- **Brain Level** is earned with XP and only ever goes up: +100 for finishing, plus
  the score, +25 for each game that beats its best, +50 for a new best score. Level
  2 needs 150 XP and each level after needs 50 more than the last.
- **Beat your best.** Each game's instruction card shows your best and last score
  for it. The results screen shows the change since your last check for the score
  and every game, marks new bests, and names your lowest ability today with a button
  to practise its game.

Brain Level measures practice and progress, not intelligence - the results screen
and profile say so.

## Games

### 1. Color Clash (Stroop task)
A colour word is printed in a conflicting ink colour - `BLUE` written in red.
You must answer with the **ink**, not the word. This trains selective attention
and impulse control: reading is automatic, so suppressing it takes effort.

| Mode   | Colours | Time | Twist |
|--------|---------|------|-------|
| Easy   | 4 | 60s | Buttons stay in place, ink rule only |
| Medium | 6 | 50s | Buttons reshuffle every trial, -2s per miss |
| Hard   | 6 | 45s | The rule randomly flips to "pick what the word *says*", -3s per miss |

Scoring: `(80 + speed bonus) x multiplier`. The multiplier climbs every 4 correct
answers in a row, up to 3x. A miss costs 40 points, resets the streak, and burns
clock time. Best score, accuracy, best streak and average reaction time are stored
per difficulty.

Keyboard: `1-6` answer, `Space` pause, `Esc` quit, `Enter` replay. Input is tap or
key only - nothing in this game requires speech, unlike the clinical Stroop test
where the colour is spoken aloud.

**Colour-blind safe palette** - a toggle on the setup screen swaps the red/green
inks for a set based on the Okabe-Ito palette (blue, orange, yellow, pink, cyan,
teal-green), which stays distinguishable with red-green colour vision deficiency.
The choice is remembered.

### Sound

Every game page has a sound control in the header: a mute button and a volume
slider, both usable mid-round and remembered between sessions. **M** mutes and
unmutes from anywhere without reaching for the mouse.

All audio is generated with WebAudio - there are no sound files in the extension.
Tones run through a single master gain node, so the slider takes effect instantly,
and muting stops oscillators being created at all rather than just turning them
down. Color Clash climbs a pentatonic scale as your streak grows, and Memory Grid
gives each tile its own note, so a path has a melody you can learn.

### Shared presentation

All eleven games are built on the same shell (`js/core/arcade.js`), so they look and
feel like one product:

- ambient glow behind the board that tints to whatever is in play
- particle burst on every correct answer, in the colour you hit
- a progress meter under the HUD - combo streak (Color Clash), path progress
  (Memory Grid), block progress (N-Back)
- milestone callouts, a red pulse when the situation is urgent, screen shake and a
  red flash on a miss
- results screen with an animated score, an S-to-D grade and confetti on a record

Color Clash adds glossy answer chips with colour-matched glow; Memory Grid and
N-Back share the glossy tile grid.

### How-to-play tutorials

Every game has a three-step tutorial (`js/core/tutorial.js`, content in
`js/core/tutorials.js`):

1. **How it works** - the rule in one sentence and a worked example that shows the
   right answer next to the tempting wrong one (the ink, not the word; the star, not
   the look-alikes).
2. **Try it** - two to five practice questions in the game's own look. A wrong
   answer explains why ("That is what the word says - look at the colour of the
   letters") and the player tries again; the step completes once they get them right.
3. **Ready** - the controls and how the score works.

It opens by itself the first time a game comes up - in practice, in the Daily Brain
Check or in the Brain Test (before the game starts, so it never costs time) - and
again from the **How to play** button on every setup screen and instruction card.
The practice answers are checked by `tests/tutorials.test.mjs`.

### Look: palette, icons and logo

- **Blue palette** - blue and light blue on navy, with amber for bests
  and targets. Every colour comes from the tokens in `css/theme.css` (dark and light),
  apart from the games' own stimuli: Color Clash's inks, the red target, the star.
  Game boards stay dark in both themes.
- **Game icons** (`js/core/icons.js`) show how each game is played: the word RED in
  blue ink, a lit path through a grid, a star among look-alikes, a route to a flag.
- **Logo** - a brain with a spark (`icons/logo.svg`, and `icons/logo-small.svg` for
  16 and 32 px). `node tools/render-icons.mjs` redraws the toolbar PNGs from them
  with headless Chrome.

The sun / moon button in every page header switches between dark and light themes,
and the choice is remembered.

### 2. Memory Grid (spatial span)
Tiles flash one at a time; you replay the path in order. Each cleared level adds
one more tile to the same path, so it measures **span** - the longest sequence you
can hold and reproduce. This is the Corsi block-tapping test with a Simon-style
growing sequence.

| Mode   | Grid | Start | Twist |
|--------|------|-------|-------|
| Easy   | 3x3 | 2 tiles | Slow flashes (620ms) |
| Medium | 4x4 | 3 tiles | Quicker flashes (460ms) |
| Hard   | 5x5 | 3 tiles | Fast (360ms), and every 3rd level must be recalled **backwards** |

Scoring: 10 points per correct tile x current path length, plus `100 x level` for
clearing a level and another `50 x level` if you cleared it without a miss. Three
lives; a wrong tile briefly outlines the tile you should have hit, then replays the
same path. Stats stored: score, span, level, accuracy, time.

Keyboard: `Space` pause (resuming replays the path), `Esc` quit.

### 3. N-Back (working-memory updating)
A stream of squares plays one at a time; press MATCH when the current square is in
the same place it was N steps back. Unlike Memory Grid (recall a finished path),
this forces you to hold a *moving window* and keep overwriting it - the standard
lab measure of working-memory updating.

| Mode   | Channels | Pace | Twist |
|--------|----------|------|-------|
| Easy   | Position | 3.0s per item | Can drop to 1-back |
| Medium | Position | 2.4s per item | Near-miss lures at N-1 / N+1 |
| Hard   | Position + colour | 2.8s per item | Dual n-back: two channels, keys A and L |

**N adapts to you** (Jaeggi protocol): a block with <=2 errors moves you up a level,
>=5 errors moves you down, anything between holds. A run is 4 blocks of `16 + N`
items, with a summary between blocks where you can continue or stop and score.

Two numbers make this a real measurement rather than a score:
- **Peak N** - the highest level you cleared with <=2 errors.
- **d-prime** - signal-detection sensitivity, `z(hit rate) - z(false-alarm rate)`
  with a log-linear correction. It separates genuine detection from button mashing:
  perfect play scores ~3.9, random pressing ~0.7. Above 2 means you are reading the
  stream.

Most people sit at 2-3 back; 4 is genuinely hard.

### 4. Reaction Speed (processing speed)
Part 1: press the instant a light appears (simple reaction). Part 2: press the side
it appears on (choice reaction). Pressing early is a false start; responses under
100ms count as guesses. Easy is simple-only; Hard has four choices.

### 5. Task Switch (cognitive flexibility)
A digit appears with a question - ODD or EVEN? / LOW or HIGH? - that changes between
cards. The measure is the switch cost: how much slower you are right after the rule
changes. 5 never appears, so HIGH/LOW always has one answer. Easy switches every 4
cards (predictable); Medium and Hard switch without warning.

### 6. Number Pattern (fluid reasoning)
Six numbers follow a rule; pick the seventh from four. Two right in a row brings a
harder rule family, one wrong an easier one. Every generated pattern is checked
against eight rule families and discarded if any of them gives a different answer,
so each has exactly one defensible answer (tested on 10,000 generated items).

### 7. Spatial Rotation (visuospatial reasoning)
Is the right shape the left one turned, or its mirror image? Shapes are chosen so a
mirror image can never be matched by turning, and every angle appears equally often
with each answer. Response time by angle is recorded - the classic mental-rotation
slope.

### 8. Sequence Recall (digit span)
Digits appear one at a time, then you type them back in order. A correct answer adds
a digit; a miss retries the same length with new digits; two misses in a row end the
round. Sequences never repeat a digit twice in a row or run three consecutive numbers.
Easy is paced at 1.2s per digit, Medium at 1s; **Hard is Reverse Recall** (type them
last digit first). Keyboard: `1-9`, `Backspace` to undo, `Space` pause, `Esc` quit.

### 9. Visual Tracking (multiple-object tracking)
One object turns red, then every object turns identical and they all move; when they
stop, pick the one that was red (click it or press its number). Motion is simulated
from a seed, so objects provably stay in bounds, never touch and never park. Two right
in a row speeds up the next round; a miss slows it down. Easy 3 objects, Medium 5,
Hard 8 with sudden turns.

### 10. Attention Storm (continuous performance)
Shapes flash one at a time; press `Space` (or tap) only for the five-point star. Look-
alikes - a six-point star, an outline star, an upside-down star - test holding back.
Three blocks of 32; the pace speeds up after a clean block. Shapes are SVG, so they
look identical on every system. `P` pauses.

### 11. Path Finder (planning)
Walk from the start to the flag one square at a time - every step counts, so plan
first. A perfect route climbs a ladder of bigger, busier mazes (5x5 to 10x10); an
unsolved puzzle drops a level. **Hard adds mud** that costs 2 steps, and the most
direct route is usually a trap. Every puzzle is proven solvable (tested on 3,000
generated puzzles against an independent solver). Arrow keys / WASD or click.

## Adding a game

1. Create `js/games/<id>.js` exporting `mount(root, ctx)`. Put any stimulus
   generation or scoring maths in `js/games/logic/<id>-logic.js` with no DOM, and
   test it in `tests/games.test.mjs`.
2. Use `js/core/game-kit.js` for the setup, countdown and results screens so it
   matches the other games, and `createRng(seedFor(ctx))` for its randomness.
3. Honour `ctx.official` (fixed settings, no setup screen, `completeRound` hands off).
4. Add an entry to `GAMES` in `js/core/games.js` (with `official`, `category`,
   `instruction`, `keys`, `minutes`) and a scoring curve to `ABILITIES` in
   `js/core/profile.js`. Setting `locked: true` keeps an unfinished game out of the
   popup, the game page and the Brain Test.
5. Add a tutorial to `js/core/tutorials.js` and an icon to `js/core/icons.js` -
   `tests/tutorials.test.mjs` fails until both exist.

## Local development

`chrome.storage` is unavailable outside the extension, so scores fall back to
`localStorage`. ES modules need HTTP (not `file://`), so start the static server:

```bash
npm run dev
```

Then open http://localhost:5173/game.html?game=stroop - or any other game `id` from
`js/core/games.js` (`memory-grid`, `n-back`, `reaction`, `task-switch`,
`number-pattern`, `spatial-rotation`, `sequence-recall`, `visual-tracking`,
`attention-storm`, `path-finder`). `test.html` runs the Brain Test and
`profile.html` shows the profile.

## Files

```
manifest.json      MV3 manifest (storage permission only, no host access)
popup.html/js      hub: Daily Brain Check, Performance Score, Brain Test, practice tiles
game.html          shared game shell (header, sound toggle, mount point)
js/core/           storage, audio, dom helpers, game registry
js/core/arcade.js  shared game shell: glow, particles, flash, callout, meter
js/core/fx.js      canvas particle system + animated number counter
js/core/profile.js scoring curves, run history, Performance Score, trend
js/core/charts.js  hand-built SVG radar, line chart and meter (no chart library)
js/core/session.js Brain Test sessions: order, persistence, resume, eligibility
js/core/daily.js   Daily Brain Check: settings, day seed, XP and Brain Level, persistence
js/core/level-ui.js Brain Level badge and XP bar (popup, profile, daily check)
js/core/score-reveal.js animated "out of 100" score ring (Brain Test and daily results)
js/core/icons.js   game icons (SVG), each a hint at how the game is played
js/core/tutorial.js how-to-play overlay: how it works, try it, ready
js/core/tutorials.js each game's rule, worked example and practice questions
js/core/result.js  standard GameResult envelope (wraps each game's own result)
js/core/rng.js     seeded random numbers (every stimulus reproducible from a seed)
js/core/game-kit.js shared setup / countdown / results screens for games 4-11
js/core/analytics.js local-only event log (no network)
js/games/logic/    pure, unit-tested logic for games 4-11
test.html/js       the Brain Test runner
daily.html         the Daily Brain Check (js/daily-runner.js, css/daily.css)
profile.html/js    full brain profile page
css/viz.css        chart styles shared by popup and profile
tests/             npm test suites + dev-only browser harness (not shipped)
js/games/          the eleven games
css/               theme + page styles
icons/             logo.svg + logo-small.svg, and the toolbar PNGs rendered from them
INSTALL.md         how to load, update, package and publish
package.json       npm script aliases (no dependencies, no bundler)
package.ps1        builds dist/mind-power-games-v<version>.zip
tools/validate.mjs pre-flight: manifest, icons, CSP, asset + import paths
tools/render-icons.mjs redraws icons/icon*.png from the logo SVGs (headless Chrome)
dist/              build output (not part of the extension)
```
