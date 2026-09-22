/* Color Clash - a timed Stroop task.
   The player sees a color word printed in a conflicting ink color and must
   answer with the INK (or, on Hard, whichever rule is currently showing).

   Input is tap / click / number keys only - nothing here needs speech. */

import { el, pick, shuffle } from '../core/util.js';
import { saveBest, getBest, recordRound, get, set } from '../core/storage.js';
import { sfx } from '../core/audio.js';
import { countUp } from '../core/fx.js';
import { createStage, createMeter, gradeChip, resultFx, abilityChip } from '../core/arcade.js';
import { logRun } from '../core/profile.js';
import { createRng } from '../core/rng.js';
import { median } from '../core/stats.js';

/* Two palettes. "safe" is built on the Okabe-Ito colour-blind-safe set, so the
   six inks stay distinguishable with red-green colour vision deficiency. */
const PALETTES = {
  standard: [
    { name: 'RED',    hex: '#ff4d4d' },
    { name: 'BLUE',   hex: '#4d8bff' },
    { name: 'GREEN',  hex: '#2ee88a' },
    { name: 'YELLOW', hex: '#ffd23f' },
    { name: 'PURPLE', hex: '#b46bff' },
    { name: 'ORANGE', hex: '#ff8c42' }
  ],
  safe: [
    { name: 'BLUE',   hex: '#3d9bff' },
    { name: 'ORANGE', hex: '#f0a028' },
    { name: 'YELLOW', hex: '#f5e642' },
    { name: 'PINK',   hex: '#e488be' },
    { name: 'CYAN',   hex: '#6fd4f5' },
    { name: 'GREEN',  hex: '#00b388' }
  ]
};

export const MODES = {
  easy: {
    key: 'easy', name: 'Easy', colors: 4, seconds: 60,
    timePenalty: 0, shuffleOptions: false, ruleSwitch: false,
    meta: '4 colors - 60s. Buttons stay put, ink rule only.'
  },
  medium: {
    key: 'medium', name: 'Medium', colors: 6, seconds: 50,
    timePenalty: 2, shuffleOptions: true, ruleSwitch: false,
    meta: '6 colors - 50s. Buttons reshuffle, -2s per miss.'
  },
  hard: {
    key: 'hard', name: 'Hard', colors: 6, seconds: 45,
    timePenalty: 3, shuffleOptions: true, ruleSwitch: true,
    meta: '6 colors - 45s. The rule flips mid-game, -3s per miss.'
  }
};

const CONGRUENT_CHANCE = 0.18;   // how often the word and the ink agree
const REVEAL_MS = 420;           // pause after a miss while the answer is shown

const MILESTONES = {
  4: 'COMBO x1.5',
  8: 'COMBO x2',
  12: 'COMBO x2.5',
  16: 'MAX COMBO x3'
};

/* Stroop interference: how much slower correct answers are when word and ink
   clash than when they agree. Ink-rule trials only, so Hard's rule flips don't
   contaminate it. */
function interference(trials) {
  const ok = trials.filter((t) => t.correct && t.rule === 'ink');
  const c = median(ok.filter((t) => t.congruent).map((t) => t.rt));
  const i = median(ok.filter((t) => !t.congruent).map((t) => t.rt));
  return {
    rtCongruent: c === null ? null : Math.round(c),
    rtIncongruent: i === null ? null : Math.round(i),
    interferenceMs: c === null || i === null ? null : Math.round(i - c)
  };
}

export function mount(root, ctx) {
  let teardown = null;
  let paletteKey = 'standard';
  // Brain Test hand-off. Absent in practice, where everything behaves as before.
  const official = ctx && ctx.official ? ctx.official : null;

  function setScreen(node, cleanup) {
    if (teardown) teardown();
    teardown = cleanup || null;
    root.textContent = '';
    root.append(node);
  }

  const palette = () => PALETTES[paletteKey];

  /* ------------------------------------------------------------------ setup */

  async function showSetup() {
    paletteKey = await get('stroop.palette', 'standard');

    const bests = {};
    for (const key of Object.keys(MODES)) bests[key] = await getBest('stroop', key);

    const demoWord = el('span', { class: 'demo-word', text: 'GREEN' });
    const demoSwatch = el('span', { class: 'demo-chip' });

    const paintDemo = (word, ink) => {
      demoWord.textContent = word.name;
      demoWord.style.color = ink.hex;
      demoWord.style.textShadow = `0 0 34px ${ink.hex}77`;
      demoSwatch.style.background = ink.hex;
    };

    const sw = el('span', { class: 'switch' + (paletteKey === 'safe' ? ' on' : '') });
    const toggle = el('button', {
      class: 'toggle-row', type: 'button',
      onclick: async () => {
        paletteKey = paletteKey === 'safe' ? 'standard' : 'safe';
        await set('stroop.palette', paletteKey);
        sw.classList.toggle('on', paletteKey === 'safe');
        paintDemo(palette()[2], palette()[0]);
      }
    },
      el('span', {},
        el('b', { class: 'tr-title', text: 'Colour-blind safe palette' }),
        el('span', { class: 'tr-sub', text: 'Swaps red/green for inks that stay distinct with red-green colour blindness' })
      ),
      sw
    );

    const panel = el('div', { class: 'panel' },
      el('h2', { text: 'Color Clash' }),
      el('p', { class: 'lead', text: 'Your brain reads the word faster than it sees the ink. Beat the reflex.' }),

      el('div', { class: 'rules' },
        el('div', { class: 'demo' }, demoWord, el('span', { class: 'demo-arrow', text: '->' }), demoSwatch),
        el('ul', {},
          el('li', { html: 'The word <b>GREEN</b> printed in red ink &rarr; the answer is <b>red</b>.' }),
          el('li', { html: 'Tap the colour button, or press <b>1-6</b>. No typing, no speaking.' }),
          el('li', { html: 'Faster answers score more, and every 4 in a row raises your <b>multiplier</b>.' }),
          el('li', { html: 'On <b>Hard</b> the rule flips: sometimes you must pick what the word <b>says</b>.' })
        ),
        toggle
      ),

      el('div', { class: 'diffs' },
        Object.values(MODES).map((cfg) => {
          const best = bests[cfg.key];
          return el('button', { class: 'diff', type: 'button', onclick: () => startCountdown(cfg) },
            el('b', { class: 'd-name', text: cfg.name }),
            el('span', { class: 'd-meta', text: cfg.meta }),
            el('span', { class: 'd-best', text: best ? 'Best ' + best.score : 'No score yet' })
          );
        })
      )
    );

    // attract loop so the mechanic is obvious before the round starts
    let i = 0;
    paintDemo(palette()[2], palette()[0]);
    const cycle = setInterval(() => {
      const p = palette();
      i = (i + 1) % p.length;
      paintDemo(p[(i + 2) % p.length], p[i]);
    }, 1400);

    setScreen(panel, () => clearInterval(cycle));
  }

  /* -------------------------------------------------------------- countdown */

  function startCountdown(cfg) {
    const big = el('div', { class: 'big', text: '3' });
    const overlay = el('div', { class: 'overlay' },
      el('div', {}, big, el('div', { class: 'small', text: 'Answer with the INK color' }))
    );
    const board = el('div', { class: 'board arcade', style: { minHeight: '380px' } }, overlay);

    let n = 3;
    sfx.tick();
    const timer = setInterval(() => {
      n -= 1;
      if (n > 0) { big.textContent = String(n); big.classList.remove('tick'); void big.offsetWidth; big.classList.add('tick'); sfx.tick(); return; }
      clearInterval(timer);
      big.textContent = 'GO';
      sfx.start();
      setTimeout(() => startGame(cfg), 350);
    }, 650);

    setScreen(board, () => clearInterval(timer));
  }

  /* ------------------------------------------------------------------- play */

  async function startGame(cfg) {
    const pool = palette().slice(0, cfg.colors);
    const best = await getBest('stroop', cfg.key);

    // A test passes a seed, so its stimuli can be regenerated - and a day's Daily
    // Brain Check is the same for everyone. Practice keeps Math.random, as before.
    const seed = official && typeof official.seed === 'number' ? official.seed : null;
    const rng = seed === null ? null : createRng(seed);
    const rand = rng ? rng.next : Math.random;
    const choose = rng ? rng.pick : pick;
    const reorder = rng ? rng.shuffle : shuffle;

    const stats = { score: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0, rtTotal: 0, fastest: Infinity };

    // trial-by-trial raw record - kept for later analysis, never summarised away
    const trials = [];
    const startedAt = new Date().toISOString();
    const t0 = performance.now();
    let pauses = 0;

    let current = null;
    let trialStart = 0;
    let locked = false;      // true during the post-miss reveal
    let running = true;
    let paused = false;
    let endsAt = performance.now() + cfg.seconds * 1000;
    let lastRule = 'ink';
    let options = pool.slice();
    let lastMultiplier = 1;

    /* --- HUD --- */
    const scoreEl = el('b', { text: '0' });
    const timeEl = el('b', { text: String(cfg.seconds) });
    const streakEl = el('b', { text: '0' });
    const multEl = el('b', { text: '1x' });
    const multBox = el('div', { class: 'box hot' }, multEl, el('span', { text: 'Multiplier' }));

    const hud = el('div', { class: 'hud' },
      el('div', { class: 'box' }, scoreEl, el('span', { text: 'Score' })),
      el('div', { class: 'box' }, timeEl, el('span', { text: 'Seconds' })),
      el('div', { class: 'box' }, streakEl, el('span', { text: 'Streak' })),
      multBox
    );

    const timerFill = el('div', { class: 'timer-fill' });
    const timerTrack = el('div', { class: 'timer-track' }, timerFill);

    const meter = createMeter('4 in a row for x1.5');

    const promptEl = el('div', { class: 'prompt' });
    const wordEl = el('div', { class: 'word' });
    const floatEl = el('div', { class: 'float' });
    const chipWrap = el('div', { class: 'chips' + (pool.length > 4 ? ' six' : '') });

    const stage = createStage();
    stage.add(floatEl, promptEl, wordEl, chipWrap);
    const board = stage.board;

    const hint = el('p', { class: 'foot-hint',
      text: 'Keys 1-' + pool.length + ' - Space to pause - Esc to quit' +
            (best ? ' - Best on ' + cfg.name + ': ' + best.score : '') });

    const wrap = el('div', {}, hud, timerTrack, meter.wrap, board, hint);

    function renderChips() {
      chipWrap.textContent = '';
      options.forEach((color, idx) => {
        chipWrap.append(
          el('button', {
            class: 'chip', type: 'button', 'aria-label': color.name,
            style: { background: color.hex, boxShadow: `0 12px 26px ${color.hex}3d, inset 0 -6px 0 rgba(0,0,0,.18), inset 0 2px 0 rgba(255,255,255,.35)` },
            onclick: () => answer(color, idx)
          }, el('span', { class: 'key', text: String(idx + 1) }))
        );
      });
    }

    function nextTrial() {
      const flip = cfg.ruleSwitch && rand() < 0.3;
      const rule = cfg.ruleSwitch ? (flip ? (lastRule === 'ink' ? 'word' : 'ink') : lastRule) : 'ink';
      const ruleFlipped = rule !== lastRule;
      lastRule = rule;

      const word = choose(pool);
      let ink = word;
      if (rand() > CONGRUENT_CHANCE) {
        while (ink.name === word.name) ink = choose(pool);
      }
      current = { word, ink, rule, answer: rule === 'ink' ? ink : word };

      if (cfg.shuffleOptions) { options = reorder(pool); renderChips(); }

      const base = rule === 'ink'
        ? 'Tap the color the word is <b>printed in</b>'
        : 'Tap the color the word <b>says</b>';
      promptEl.innerHTML = ruleFlipped
        ? '<b class="flip">RULE FLIP!</b> ' + base
        : base;

      wordEl.textContent = word.name;
      wordEl.style.color = ink.hex;
      wordEl.style.textShadow = `0 0 46px ${ink.hex}80, 0 6px 28px rgba(0,0,0,.55)`;
      stage.tint(ink.hex);
      wordEl.classList.remove('pop');
      void wordEl.offsetWidth;            // restart the entrance animation
      wordEl.classList.add('pop');

      trialStart = performance.now();
    }

    // 1x .. 3x, climbing every 4 correct in a row
    const multiplier = () => 1 + Math.min(4, Math.floor(stats.streak / 4)) * 0.5;

    function showFloat(text, color) {
      floatEl.textContent = text;
      floatEl.style.color = color;
      floatEl.classList.remove('go');
      void floatEl.offsetWidth;
      floatEl.classList.add('go');
    }

    function syncHud(animate) {
      if (animate) countUp(scoreEl, stats.score, 420);
      else scoreEl.textContent = stats.score;

      streakEl.textContent = stats.streak;

      const m = multiplier();
      multEl.textContent = (m % 1 === 0 ? m : m.toFixed(1)) + 'x';
      if (m > lastMultiplier) {
        multBox.classList.remove('bump');
        void multBox.offsetWidth;
        multBox.classList.add('bump');
      }
      lastMultiplier = m;

      // combo meter fills toward the next multiplier step
      const intoStep = stats.streak % 4;
      const atMax = stats.streak >= 16;
      meter.set(atMax ? 100 : (intoStep / 4) * 100, atMax
        ? 'MAX COMBO'
        : (4 - intoStep) + ' more for x' + (multiplier() + 0.5).toFixed(1).replace('.0', ''));
    }

    function answer(color, chipIdx) {
      if (!running || paused || locked || !current) return;
      const rt = performance.now() - trialStart;
      stats.rtTotal += rt;
      trials.push({
        word: current.word.name,
        ink: current.ink.name,
        rule: current.rule,
        congruent: current.word.name === current.ink.name,
        answer: current.answer.name,
        response: color.name,
        correct: color.name === current.answer.name,
        rt: Math.round(rt),
        at: Math.round(performance.now() - t0)
      });

      if (color.name === current.answer.name) {
        const speedBonus = Math.max(0, Math.round(120 - rt / 12));
        const gained = Math.round((80 + speedBonus) * multiplier());

        stats.score += gained;
        stats.correct += 1;
        stats.streak += 1;
        stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
        stats.fastest = Math.min(stats.fastest, rt);

        sfx.correct(stats.streak - 1);     // the riff climbs as the streak grows
        showFloat('+' + gained, 'var(--good)');

        const chip = chipWrap.children[chipIdx];
        if (chip) {
          chip.classList.remove('hit');
          void chip.offsetWidth;
          chip.classList.add('hit');
          stage.burstAt(chip, color.hex, 20);
        }

        if (MILESTONES[stats.streak]) stage.say(MILESTONES[stats.streak]);
        syncHud(true);
        nextTrial();
        return;
      }

      stats.wrong += 1;
      stats.streak = 0;
      stats.score = Math.max(0, stats.score - 40);
      endsAt -= cfg.timePenalty * 1000;

      sfx.wrong();
      showFloat(cfg.timePenalty ? '-40   -' + cfg.timePenalty + 's' : '-40', 'var(--bad)');
      stage.shake();
      stage.flashBad();
      syncHud(false);

      // dim everything except the colour they should have picked
      locked = true;
      const answerName = current.answer.name;
      Array.from(chipWrap.children).forEach((btn, idx) => {
        if (options[idx].name !== answerName) btn.classList.add('miss');
      });
      setTimeout(() => {
        Array.from(chipWrap.children).forEach((b) => b.classList.remove('miss'));
        locked = false;
        if (running && !paused) nextTrial();
      }, REVEAL_MS);
    }

    /* --- clock --- */
    let raf = 0;
    let lastWhole = cfg.seconds;

    function loop() {
      if (!running) return;
      if (!paused) {
        const left = Math.max(0, endsAt - performance.now());
        const whole = Math.ceil(left / 1000);
        if (whole !== lastWhole) {
          lastWhole = whole;
          timeEl.textContent = whole;
          if (whole <= 5 && whole > 0) sfx.tick();
        }
        timerFill.style.width = Math.max(0, Math.min(1, left / (cfg.seconds * 1000))) * 100 + '%';
        timerFill.classList.toggle('low', left <= 10000);
        stage.danger(left <= 10000);
        if (left <= 0) { finish(); return; }
      }
      raf = requestAnimationFrame(loop);
    }

    /* --- pause / resume --- */
    let pauseOverlay = null;
    let pausedAt = 0;

    function pause() {
      if (paused || !running) return;
      paused = true;
      pauses += 1;
      pausedAt = performance.now();
      pauseOverlay = el('div', { class: 'overlay' },
        el('div', {},
          el('div', { class: 'big', text: 'II' }),
          el('div', { class: 'small', text: 'Paused - press Space to resume' }))
      );
      board.append(pauseOverlay);
    }

    function resume() {
      if (!paused) return;
      paused = false;
      endsAt += performance.now() - pausedAt;
      if (pauseOverlay) { pauseOverlay.remove(); pauseOverlay = null; }
      trialStart = performance.now();     // do not charge the pause to reaction time
    }

    const onVisibility = () => { if (document.hidden) pause(); };

    const onKey = (e) => {
      if (!running) return;
      if (e.key === 'Escape') {
        if (official) return;              // no bailing out mid-test by accident
        running = false; cleanup(); showSetup(); return;
      }
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        if (paused) resume(); else pause();
        return;
      }
      if (paused) return;
      const idx = Number(e.key) - 1;
      if (Number.isInteger(idx) && idx >= 0 && idx < options.length) {
        e.preventDefault();
        answer(options[idx], idx);
      }
    };

    function cleanup() {
      cancelAnimationFrame(raf);
      stage.destroy();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
    }

    async function finish() {
      running = false;
      cleanup();
      sfx.finish();

      const answered = stats.correct + stats.wrong;
      const result = {
        mode: cfg.key,
        score: stats.score,
        correct: stats.correct,
        wrong: stats.wrong,
        accuracy: answered ? Math.round((stats.correct / answered) * 100) : 0,
        bestStreak: stats.bestStreak,
        avgRt: answered ? Math.round(stats.rtTotal / answered) : 0,
        fastest: stats.fastest === Infinity ? 0 : Math.round(stats.fastest),
        ...interference(trials),
        startedAt,
        raw: { trials, pauses, palette: paletteKey, ...(seed === null ? {} : { seed }) }
      };

      const isRecord = await saveBest('stroop', cfg.key, result);
      await recordRound(result.score);
      const change = await logRun('stroop', result,
        official ? { source: official.source || 'official', sessionId: official.sessionId } : {});
      if (official) { official.onComplete(result); return; }
      showResults(cfg, result, isRecord, best, change);
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);

    renderChips();
    setScreen(wrap, () => { running = false; cleanup(); });
    stage.ready();
    syncHud(false);
    nextTrial();
    raf = requestAnimationFrame(loop);
  }

  /* ---------------------------------------------------------------- results */

  function grade(r) {
    if (r.accuracy >= 95 && r.avgRt < 850) return { letter: 'S', tone: 's' };
    if (r.accuracy >= 90) return { letter: 'A', tone: 'a' };
    if (r.accuracy >= 80) return { letter: 'B', tone: 'b' };
    if (r.accuracy >= 65) return { letter: 'C', tone: 'c' };
    return { letter: 'D', tone: 'd' };
  }

  function showResults(cfg, r, isRecord, prevBest, change) {
    const verdict =
      r.accuracy >= 95 && r.avgRt < 900 ? 'Elite focus. Your reading reflex lost the argument.' :
      r.accuracy >= 90 ? 'Sharp. The word barely slowed you down.' :
      r.accuracy >= 75 ? 'Solid - trim the hesitation and the score climbs fast.' :
      'The word is winning. Slow down a touch and chase accuracy first.';

    const g = grade(r);
    const scoreEl = el('div', { class: 'result-score', text: '0' });

    const panel = el('div', { class: 'panel result-panel' },
      el('p', { class: 'result-sub', text: cfg.name + ' round complete' }),
      el('div', { class: 'grade-row' }, gradeChip(g.letter), scoreEl),
      el('p', { class: 'result-sub', text: verdict }),
      el('div', { class: 'center' },
        isRecord && r.score > 0
          ? el('span', { class: 'badge', text: 'NEW PERSONAL BEST' })
          : (prevBest ? el('span', { class: 'result-sub', text: 'Best on ' + cfg.name + ': ' + prevBest.score }) : null)
      ),
      el('div', { class: 'center' }, abilityChip(change)),

      el('div', { class: 'grid4' },
        el('div', { class: 'box' }, el('b', { text: r.accuracy + '%' }), el('span', { text: 'Accuracy' })),
        el('div', { class: 'box' }, el('b', { text: r.correct + '/' + (r.correct + r.wrong) }), el('span', { text: 'Correct' })),
        el('div', { class: 'box' }, el('b', { text: String(r.bestStreak) }), el('span', { text: 'Best streak' })),
        el('div', { class: 'box' }, el('b', { text: r.avgRt + 'ms' }), el('span', { text: 'Avg reaction' }))
      ),

      el('div', { class: 'actions' },
        el('button', { class: 'btn primary', type: 'button', onclick: () => startCountdown(cfg) }, 'Play again'),
        el('button', { class: 'btn', type: 'button', onclick: () => showSetup() }, 'Change difficulty')
      ),
      el('p', { class: 'foot-hint', text: 'Enter to play again - Esc for difficulty' })
    );

    const onKey = (e) => {
      if (e.key === 'Escape') { showSetup(); return; }
      if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); startCountdown(cfg); }
    };
    document.addEventListener('keydown', onKey);

    const confetti = resultFx(panel);
    setScreen(panel, () => { document.removeEventListener('keydown', onKey); confetti.stop(); });

    countUp(scoreEl, r.score, 900);   // no rAF wrapper: a background tab would never start it
    if (isRecord && r.score > 0) confetti.start(palette().map((c) => c.hex));
  }

  /* Brain Test: fixed settings and no difficulty screen - but the player's
     colour-blind palette choice still applies. */
  async function startOfficial() {
    paletteKey = await get('stroop.palette', 'standard');
    // the Daily Brain Check shortens the round through overrides
    startCountdown({ ...(MODES[official.difficulty] || MODES.medium), ...(official.overrides || {}) });
  }

  if (official) startOfficial();
  else showSetup();
}
