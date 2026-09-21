/* Memory Grid - a spatial span task (Corsi block-tapping crossed with Simon).
   Tiles flash one at a time; the player repeats the path. The sequence grows by
   one tile each level, so the score is really "how long a path can you hold?". */

import { el, randInt } from '../core/util.js';
import { saveBest, getBest, recordRound } from '../core/storage.js';
import { sfx, note } from '../core/audio.js';
import { countUp } from '../core/fx.js';
import { createStage, createMeter, gradeChip, resultFx, abilityChip } from '../core/arcade.js';
import { logRun } from '../core/profile.js';

const ACCENT = '#a789ff';

const MODES = {
  easy: {
    key: 'easy', name: 'Easy', size: 3, startLen: 2, flash: 620, lives: 3, reverseEvery: 0,
    meta: '3x3 grid - slow flashes. Starts at 2 tiles.'
  },
  medium: {
    key: 'medium', name: 'Medium', size: 4, startLen: 3, flash: 460, lives: 3, reverseEvery: 0,
    meta: '4x4 grid - quicker flashes. Starts at 3 tiles.'
  },
  hard: {
    key: 'hard', name: 'Hard', size: 5, startLen: 3, flash: 360, lives: 3, reverseEvery: 3,
    meta: '5x5 grid - fast. Every 3rd level must be recalled backwards.'
  }
};

export function mount(root, ctx) {
  let teardown = null;
  // Brain Test hand-off. Absent in practice, where everything behaves as before.
  const official = ctx && ctx.official ? ctx.official : null;

  function setScreen(node, cleanup) {
    if (teardown) teardown();
    teardown = cleanup || null;
    root.textContent = '';
    root.append(node);
  }

  /* ------------------------------------------------------------------ setup */

  async function showSetup() {
    const bests = {};
    for (const key of Object.keys(MODES)) bests[key] = await getBest('memory-grid', key);

    // a tiny 3x3 demo that walks a fixed path on a loop
    const demoTiles = [];
    const demoGrid = el('div', { class: 'tile-grid demo-grid', style: { gridTemplateColumns: 'repeat(3,1fr)' } });
    for (let i = 0; i < 9; i++) {
      const t = el('div', { class: 'tile' });
      demoTiles.push(t);
      demoGrid.append(t);
    }

    const panel = el('div', { class: 'panel' },
      el('h2', { text: 'Memory Grid' }),
      el('p', { class: 'lead', text: 'Watch the path light up, then walk it back. Every level adds one more tile.' }),

      el('div', { class: 'rules' },
        el('div', { class: 'demo' }, demoGrid),
        el('ul', {},
          el('li', { html: 'Tiles flash <b>one at a time</b> - remember the order, not just the spots.' }),
          el('li', { html: 'Repeat the path by tapping the tiles in the <b>same order</b>.' }),
          el('li', { html: 'Clear a level and the sequence <b>grows by one</b>. You get 3 lives.' }),
          el('li', { html: 'Your headline stat is <b>span</b>: the longest path you played back clean.' })
        )
      ),

      el('div', { class: 'diffs' },
        Object.values(MODES).map((cfg) => {
          const best = bests[cfg.key];
          return el('button', { class: 'diff', type: 'button', onclick: () => startGame(cfg) },
            el('b', { class: 'd-name', text: cfg.name }),
            el('span', { class: 'd-meta', text: cfg.meta }),
            el('span', { class: 'd-best', text: best ? 'Best ' + best.score + ' - span ' + (best.span || 0) : 'No score yet' })
          );
        })
      )
    );

    const path = [0, 1, 4, 7, 6, 3];
    let step = 0;
    const cycle = setInterval(() => {
      demoTiles.forEach((t) => t.classList.remove('lit'));
      demoTiles[path[step % path.length]].classList.add('lit');
      step += 1;
    }, 620);

    setScreen(panel, () => clearInterval(cycle));
  }

  /* ------------------------------------------------------------------- play */

  function startGame(cfg) {
    const total = cfg.size * cfg.size;

    let level = 1;
    let lives = cfg.lives;
    let score = 0;
    let taps = 0;
    let goodTaps = 0;
    let span = 0;                 // longest sequence played back clean
    let flawless = true;          // no mistake on the current level

    let sequence = [];
    let target = [];              // sequence, reversed on a backwards level
    let inputIdx = 0;
    let accepting = false;
    let killed = false;
    let paused = false;

    const startedAt = performance.now();
    let pausedMs = 0;
    let pausedAt = 0;

    // trial-by-trial raw record: every attempt at a path and every tap in it
    const startedIso = new Date().toISOString();
    const attempts = [];
    let attempt = null;
    let pauses = 0;

    function closeAttempt(success, errorAt = null, aborted = false) {
      if (!attempt) return;
      const { t0, ...rest } = attempt;
      attempts.push({ ...rest, success, errorAt, aborted, ms: Math.round(performance.now() - t0) });
      attempt = null;
    }

    /* --- cancellable waits: every timer dies with the screen --- */
    const timers = new Set();
    const wait = (ms) => new Promise((res) => {
      const t = setTimeout(() => { timers.delete(t); res(); }, ms);
      timers.add(t);
    });

    /* --- HUD --- */
    const scoreEl = el('b', { text: '0' });
    const levelEl = el('b', { text: '1' });
    const lenEl = el('b', { text: String(cfg.startLen) });
    const livesEl = el('b', { class: 'lives', text: '' });

    const hud = el('div', { class: 'hud' },
      el('div', { class: 'box' }, scoreEl, el('span', { text: 'Score' })),
      el('div', { class: 'box' }, levelEl, el('span', { text: 'Level' })),
      el('div', { class: 'box' }, lenEl, el('span', { text: 'Tiles' })),
      el('div', { class: 'box hot' }, livesEl, el('span', { text: 'Lives' }))
    );

    const meter = createMeter('Watch the path');

    const promptEl = el('div', { class: 'prompt' });
    const grid = el('div', { class: 'tile-grid', style: { gridTemplateColumns: `repeat(${cfg.size},1fr)` } });
    const tiles = [];
    for (let i = 0; i < total; i++) {
      const tile = el('button', {
        class: 'tile', type: 'button', 'aria-label': 'tile ' + (i + 1),
        onclick: () => tap(i)
      });
      tiles.push(tile);
      grid.append(tile);
    }

    const stage = createStage();
    stage.add(promptEl, el('div', { class: 'grid-wrap' }, grid));
    const board = stage.board;
    stage.tint(ACCENT);

    const hint = el('p', { class: 'foot-hint', text: 'Space to pause - Esc to quit' });
    const wrap = el('div', {}, hud, meter.wrap, board, hint);

    function syncHud(animate) {
      if (animate) countUp(scoreEl, score, 420);
      else scoreEl.textContent = score;
      levelEl.textContent = level;
      lenEl.textContent = sequence.length || cfg.startLen;
      livesEl.textContent = '●'.repeat(lives) + '○'.repeat(cfg.lives - lives);
      stage.danger(lives === 1);
    }

    function syncMeter() {
      if (!accepting) { meter.set(0, 'Watch the path'); return; }
      const done = inputIdx;
      const len = target.length || sequence.length;
      meter.set((done / len) * 100, done + ' of ' + len + ' tapped');
    }

    function setPrompt(html) { promptEl.innerHTML = html; }

    function lightTile(idx, ms, cls = 'lit', sound = true) {
      const tile = tiles[idx];
      tile.classList.add(cls);
      if (sound) note(idx % 9);
      const t = setTimeout(() => { tile.classList.remove(cls); timers.delete(t); }, ms);
      timers.add(t);
    }

    const isReverse = () => cfg.reverseEvery > 0 && level % cfg.reverseEvery === 0;

    /* --- watch phase --- */
    let runId = 0;   // a resume can request a replay while one is mid-flight

    async function playSequence(announce) {
      const myRun = ++runId;
      const stale = () => killed || myRun !== runId;

      accepting = false;
      meter.set(0, 'Watch the path');
      setPrompt(announce || 'Watch the path');
      await wait(700);
      for (const idx of sequence) {
        if (stale()) return;
        while (paused) { await wait(120); if (stale()) return; }
        lightTile(idx, Math.max(180, cfg.flash * 0.62));
        await wait(cfg.flash);
      }
      if (stale()) return;
      inputIdx = 0;
      target = isReverse() ? sequence.slice().reverse() : sequence.slice();
      accepting = true;
      attempt = { level, length: sequence.length, reverse: isReverse(), path: target.slice(), taps: [], t0: performance.now() };
      setPrompt(isReverse()
        ? 'Now tap it <b class="flip">BACKWARDS</b>'
        : 'Your turn - tap the path');
      syncMeter();
    }

    function growSequence() {
      const grow = sequence.length === 0 ? cfg.startLen : 1;
      for (let i = 0; i < grow; i++) {
        // avoid repeating the tile that is already at the end of the path
        let next = randInt(total);
        if (sequence.length && next === sequence[sequence.length - 1]) next = (next + 1 + randInt(total - 1)) % total;
        sequence.push(next);
      }
    }

    /* --- input --- */
    function tap(idx) {
      if (!accepting || killed || paused) return;

      taps += 1;
      if (attempt) attempt.taps.push({ tile: idx, at: Math.round(performance.now() - attempt.t0) });
      if (idx === target[inputIdx]) {
        goodTaps += 1;
        inputIdx += 1;
        score += 10 * sequence.length;
        lightTile(idx, 220);
        const tile = tiles[idx];
        tile.classList.remove('tapped');
        void tile.offsetWidth;
        tile.classList.add('tapped');
        stage.burstAt(tile, ACCENT, 14);
        syncHud(true);
        syncMeter();
        if (inputIdx === target.length) levelCleared();
        return;
      }

      // wrong tile
      accepting = false;
      closeAttempt(false, inputIdx);
      lightTile(idx, 420, 'bad', false);
      lightTile(target[inputIdx], 620, 'hint', false);
      sfx.wrong();
      stage.shake();
      stage.flashBad();

      lives -= 1;
      flawless = false;
      syncHud(false);

      if (lives <= 0) { finish(); return; }
      retryLevel();
    }

    async function levelCleared() {
      accepting = false;
      closeAttempt(true);
      span = Math.max(span, sequence.length);
      score += 100 * level + (flawless ? 50 * level : 0);
      sfx.correct();
      meter.set(100, 'Path complete');
      stage.say(flawless ? 'CLEAN RUN - LEVEL ' + level : 'LEVEL ' + level + ' CLEARED');
      setPrompt(flawless
        ? 'Clean run - <b>level ' + level + '</b> cleared'
        : '<b>Level ' + level + '</b> cleared');
      tiles.forEach((t) => t.classList.add('good'));
      await wait(420);
      if (killed) return;
      tiles.forEach((t) => t.classList.remove('good'));

      level += 1;
      flawless = true;
      growSequence();
      syncHud(true);
      await wait(320);
      if (killed) return;
      playSequence('Level ' + level + ' - watch');
    }

    async function retryLevel() {
      setPrompt('Missed it - ' + lives + (lives === 1 ? ' life' : ' lives') + ' left');
      await wait(900);
      if (killed) return;
      playSequence('Same path again - watch');
    }

    /* --- pause --- */
    let pauseOverlay = null;

    function pause() {
      if (paused || killed) return;
      paused = true;
      pauses += 1;
      pausedAt = performance.now();
      accepting = false;
      closeAttempt(false, null, true);    // resuming replays the path as a fresh attempt
      pauseOverlay = el('div', { class: 'overlay' },
        el('div', {},
          el('div', { class: 'big', text: 'II' }),
          el('div', { class: 'small', text: 'Paused - press Space to replay the path' }))
      );
      board.append(pauseOverlay);
    }

    function resume() {
      if (!paused) return;
      paused = false;
      pausedMs += performance.now() - pausedAt;
      if (pauseOverlay) { pauseOverlay.remove(); pauseOverlay = null; }
      playSequence('Watch the path again');
    }

    const onVisibility = () => { if (document.hidden) pause(); };

    const onKey = (e) => {
      if (killed) return;
      if (e.key === 'Escape') {
        if (official) return;              // no bailing out mid-test by accident
        cleanup(); showSetup(); return;
      }
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        if (paused) resume(); else pause();
      }
    };

    function cleanup() {
      killed = true;
      timers.forEach(clearTimeout);
      timers.clear();
      stage.destroy();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
    }

    async function finish() {
      accepting = false;
      const elapsed = performance.now() - startedAt - pausedMs;
      cleanup();
      sfx.finish();

      const result = {
        mode: cfg.key,
        score,
        span,
        level,
        accuracy: taps ? Math.round((goodTaps / taps) * 100) : 0,
        taps,
        seconds: Math.round(elapsed / 1000),
        correctSequences: attempts.filter((a) => a.success).length,
        errors: attempts.filter((a) => !a.success && !a.aborted).length,
        startedAt: startedIso,
        raw: { attempts, pauses }
      };

      const isRecord = await saveBest('memory-grid', cfg.key, result);
      await recordRound(result.score);
      const change = await logRun('memory-grid', result,
        official ? { source: 'official', sessionId: official.sessionId } : {});
      if (official) { official.onComplete(result); return; }
      showResults(cfg, result, isRecord, change);
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);

    setScreen(wrap, cleanup);
    stage.ready();
    growSequence();
    syncHud(false);
    playSequence('Watch the path');
  }

  /* ---------------------------------------------------------------- results */

  function grade(r) {
    if (r.span >= 9) return 'S';
    if (r.span >= 7) return 'A';
    if (r.span >= 6) return 'B';
    if (r.span >= 5) return 'C';
    return 'D';
  }

  async function showResults(cfg, r, isRecord, change) {
    const prevBest = await getBest('memory-grid', cfg.key);
    const scoreEl = el('div', { class: 'result-score', text: '0' });

    const verdict =
      r.span >= 9 ? 'Exceptional span - a very long path held and replayed cleanly.' :
      r.span >= 7 ? 'Strong span. Try Medium or Hard for a bigger grid.' :
      r.span >= 5 ? 'Solid span. Chunk the path into pairs to push higher.' :
      'Try tracing the path as a shape rather than a list of tiles.';

    const panel = el('div', { class: 'panel result-panel' },
      el('p', { class: 'result-sub', text: cfg.name + ' run complete' }),
      el('div', { class: 'grade-row' }, gradeChip(grade(r)), scoreEl),
      el('p', { class: 'result-sub', text: verdict }),
      el('div', { class: 'center' },
        isRecord && r.score > 0
          ? el('span', { class: 'badge', text: 'NEW PERSONAL BEST' })
          : (prevBest ? el('span', { class: 'result-sub', text: 'Best on ' + cfg.name + ': ' + prevBest.score }) : null)
      ),
      el('div', { class: 'center' }, abilityChip(change)),

      el('div', { class: 'grid4' },
        el('div', { class: 'box' }, el('b', { text: String(r.span) }), el('span', { text: 'Span' })),
        el('div', { class: 'box' }, el('b', { text: String(r.level) }), el('span', { text: 'Level' })),
        el('div', { class: 'box' }, el('b', { text: r.accuracy + '%' }), el('span', { text: 'Accuracy' })),
        el('div', { class: 'box' }, el('b', { text: r.seconds + 's' }), el('span', { text: 'Time' }))
      ),

      el('div', { class: 'actions' },
        el('button', { class: 'btn primary', type: 'button', onclick: () => startGame(cfg) }, 'Play again'),
        el('button', { class: 'btn', type: 'button', onclick: () => showSetup() }, 'Change difficulty')
      ),
      el('p', { class: 'foot-hint', text: 'Enter to play again - Esc for difficulty' })
    );

    const onKey = (e) => {
      if (e.key === 'Escape') { showSetup(); return; }
      if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); startGame(cfg); }
    };
    document.addEventListener('keydown', onKey);

    const confetti = resultFx(panel);
    setScreen(panel, () => { document.removeEventListener('keydown', onKey); confetti.stop(); });

    countUp(scoreEl, r.score, 900);   // no rAF wrapper: a background tab would never start it
    if (isRecord && r.score > 0) confetti.start(['#a789ff', '#37dcf2', '#34d399', '#fbbf24']);
  }

  // Brain Test: fixed settings, no difficulty screen.
  if (official) startGame(MODES[official.difficulty] || MODES.easy);
  else showSetup();
}
