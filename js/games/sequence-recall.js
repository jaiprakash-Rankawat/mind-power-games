/* Sequence Recall - working memory for order (digit span).
   Digits appear one at a time; the player types them back in the same order, or
   backwards on Hard. A clean recall adds a digit; two misses in a row end the
   round, so the headline measure is span - the longest sequence recalled
   perfectly. Sequence rules, timing and scoring live in
   ./logic/sequence-recall-logic.js (unit-tested). */

import { el } from '../core/util.js';
import { sfx, note } from '../core/audio.js';
import { countUp } from '../core/fx.js';
import { createStage, createMeter } from '../core/arcade.js';
import { createRng } from '../core/rng.js';
import { abilityFor } from '../core/profile.js';
import { track } from '../core/analytics.js';
import {
  createScreens, officialOf, seedFor, setupPanel, countdown, completeRound, resultsPanel, pauseOverlay, gradeFromScore
} from '../core/game-kit.js';
import {
  makeSequence, expectedAnswer, positionsRight, isCorrect, schedule, inputLimit, step, pointsFor, summarize, DIGITS
} from './logic/sequence-recall-logic.js';

const GAME_ID = 'sequence-recall';
const ACCENT = '#37dcf2';
const LEAD_MS = 550;                            // blank card before the first digit
const REVIEW_MS = { right: 950, wrong: 2000 };

const MODES = {
  easy: {
    key: 'easy', name: 'Easy', reverse: false, startLength: 3, maxLength: 12, on: 900, off: 300,
    meta: 'Type the digits back in order. One digit every 1.2s.'
  },
  medium: {
    key: 'medium', name: 'Medium', reverse: false, startLength: 3, maxLength: 12, on: 750, off: 250,
    meta: 'Type them back in order. One digit per second.'
  },
  hard: {
    key: 'hard', name: 'Hard', reverse: true, startLength: 3, maxLength: 10, on: 750, off: 250,
    meta: 'Reverse Recall: type them back last digit first.'
  }
};

export function mount(root, ctx) {
  const setScreen = createScreens(root);
  const official = officialOf(ctx);

  /* ------------------------------------------------------------------ setup */

  async function showSetup() {
    const demo = el('div', { class: 'np-demo', 'aria-hidden': 'true' },
      ['7', '2', '9', '4'].map((v) => el('span', { class: 'np-mini', text: v })),
      el('span', { class: 'demo-arrow', text: '-> type 7 2 9 4' }));
    setScreen(await setupPanel({
      gameId: GAME_ID,
      title: 'Sequence Recall',
      lead: 'Hold a sequence in mind, in order, and play it back.',
      demo,
      rules: [
        'Digits appear <b>one at a time</b>, then disappear.',
        'Type them back in the <b>same order</b> - keys <b>1-9</b> or the keypad. Backspace fixes a slip.',
        'Get it right and the next sequence is <b>one digit longer</b>. Miss twice in a row and the round ends.',
        'Hard is <b>Reverse Recall</b>: type the sequence last digit first.'
      ],
      modes: MODES,
      bestText: (b) => 'Best ' + b.score + (typeof b.span === 'number' ? ' - span ' + b.span : ''),
      onPick: startCountdown
    }));
  }

  function startCountdown(cfg) {
    countdown(setScreen, {
      note: cfg.reverse ? 'Watch, then type them backwards' : 'Watch, then type them in order',
      onGo: () => startGame(cfg)
    });
  }

  /* ------------------------------------------------------------------- play */

  function startGame(cfg) {
    const rng = createRng(seedFor(ctx));
    const seed = rng.seed;
    const log = [];                             // raw record of every sequence
    const startedAt = new Date().toISOString();
    const roundStart = performance.now();

    let state = { length: cfg.startLength, misses: 0 };
    let seq = [];
    let expected = [];
    let response = [];
    let keyTimes = [];                          // ms from "your turn" to each entry
    let onsets = [];                            // actual onsets, ms from the first planned onset
    let kinds = new Set();
    let undos = 0;
    let inputAt = 0;
    let phase = 'idle';                         // idle | show | input | review | paused
    let score = 0;
    let streak = 0;
    let killed = false;
    let pauses = 0;
    let voided = 0;

    const timers = new Set();
    const later = (fn, ms) => {
      const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
      timers.add(t);
    };
    const at = (when, fn) => later(fn, Math.max(0, when - performance.now()));
    const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };

    /* --- HUD --- */
    const scoreEl = el('b', { text: '0' });
    const lengthEl = el('b', { text: String(state.length) });
    const spanEl = el('b', { text: '—' });
    const rightEl = el('b', { text: '0' });
    const hud = el('div', { class: 'hud' },
      el('div', { class: 'box' }, scoreEl, el('span', { text: 'Score' })),
      el('div', { class: 'box hot' }, lengthEl, el('span', { text: 'Length' })),
      el('div', { class: 'box' }, spanEl, el('span', { text: 'Best span' })),
      el('div', { class: 'box' }, rightEl, el('span', { text: 'Correct' })));
    const timerFill = el('div', { class: 'timer-fill' });
    const timerTrack = el('div', { class: 'timer-track' }, timerFill);
    const meter = createMeter('Get ready');

    /* --- board --- */
    const promptEl = el('div', { class: 'prompt', text: 'Watch the digits' });
    const digitEl = el('span', { class: 'sq-digit' });
    const card = el('div', { class: 'sq-card' }, digitEl);
    const dotsEl = el('div', { class: 'sq-dots', 'aria-hidden': 'true' });
    const slotsEl = el('div', { class: 'sq-slots', 'aria-live': 'polite' });
    const revealEl = el('p', { class: 'sq-reveal' });
    const keys = DIGITS.map((d) => {
      const b = el('button', { class: 'sq-key', type: 'button', 'aria-label': 'Digit ' + d, text: String(d) });
      b.addEventListener('click', () => enter(d, 'pointer'));
      return b;
    });
    const undoBtn = el('button', { class: 'sq-key sq-undo', type: 'button', 'aria-label': 'Undo the last digit' }, '⌫ Undo');
    undoBtn.addEventListener('click', () => undo());
    const pad = el('div', { class: 'sq-pad' }, keys, undoBtn);
    const arena = el('div', { class: 'arena sq-arena' }, card, dotsEl, slotsEl, revealEl, pad);

    const stage = createStage('sq');
    stage.add(promptEl, arena);
    stage.tint(ACCENT);
    const board = stage.board;
    const hint = el('p', {
      class: 'foot-hint',
      text: 'Keys 1-9 - Backspace to undo - Space to pause' + (official ? '' : ' - Esc to quit')
    });
    const wrap = el('div', {}, hud, timerTrack, meter.wrap, board, hint);

    function syncHud(animate) {
      if (animate) countUp(scoreEl, score, 300); else scoreEl.textContent = score;
      lengthEl.textContent = String(state.length);
      const best = log.filter((t) => t.correct).map((t) => t.length);
      spanEl.textContent = best.length ? String(Math.max(...best)) : '—';
      rightEl.textContent = String(log.filter((t) => t.correct).length);
    }

    function setPad(on) {
      keys.forEach((k) => { k.disabled = !on; });
      undoBtn.disabled = !on || !response.length;
      arena.classList.toggle('typing', on);
    }

    function runTimer(ms) {
      timerFill.style.transition = 'none';
      timerFill.style.width = '100%';
      void timerFill.offsetWidth;
      timerFill.style.transition = `width ${ms}ms linear`;
      timerFill.style.width = '0%';
    }
    function freezeTimer() {
      const w = getComputedStyle(timerFill).width;
      timerFill.style.transition = 'none';
      timerFill.style.width = w;
    }
    function resetTimer() {
      timerFill.style.transition = 'none';
      timerFill.style.width = '100%';
    }

    /* --- one sequence --- */
    function newTrial() {
      if (killed) return;
      seq = makeSequence(rng, state.length);
      expected = expectedAnswer(seq, cfg.reverse);
      response = [];
      keyTimes = [];
      onsets = [];
      kinds = new Set();
      undos = 0;
      slotsEl.replaceChildren(...expected.map(() => el('span', { class: 'sq-slot' })));
      dotsEl.replaceChildren(...seq.map(() => el('span', { class: 'sq-dot' })));
      revealEl.textContent = '';
      card.classList.remove('good', 'bad', 'ask');
      digitEl.textContent = '';
      setPad(false);
      resetTimer();
      syncHud(false);
      present();
      if (document.hidden) pause();             // the tab was left during the last review
    }

    function present() {
      phase = 'show';
      arena.classList.add('showing');
      promptEl.innerHTML = cfg.reverse ? 'Watch - you will type them <b>backwards</b>' : 'Watch the digits';
      meter.set(0, 'Watch - ' + seq.length + ' digits');
      const plan = schedule(seq.length, cfg);
      const start = performance.now() + LEAD_MS;
      plan.items.forEach((it, i) => {
        at(start + it.show, () => showDigit(i, start));
        at(start + it.hide, hideDigit);
      });
      at(start + plan.end, startInput);
    }

    function showDigit(i, start) {
      onsets[i] = Math.round(performance.now() - start);
      digitEl.textContent = String(seq[i]);
      digitEl.classList.remove('show', 'out');
      void digitEl.offsetWidth;
      digitEl.classList.add('show');
      card.classList.add('lit');
      [...dotsEl.children].forEach((d, j) => {
        d.classList.toggle('on', j === i);
        d.classList.toggle('done', j < i);
      });
      meter.set(((i + 1) / seq.length) * 100, 'Watch - ' + (i + 1) + ' of ' + seq.length);
      sfx.tick();
    }

    function hideDigit() {
      digitEl.classList.add('out');
      card.classList.remove('lit');
    }

    function startInput() {
      if (killed) return;
      phase = 'input';
      arena.classList.remove('showing');
      [...dotsEl.children].forEach((d) => { d.classList.remove('on'); d.classList.add('done'); });
      digitEl.classList.remove('show', 'out');
      digitEl.textContent = '?';
      card.classList.add('ask');
      promptEl.innerHTML = cfg.reverse
        ? 'Now type them <b>backwards</b> - last digit first'
        : 'Now type them in the <b>same order</b>';
      meter.set(0, 'Your turn - 0 of ' + expected.length);
      setPad(true);
      inputAt = performance.now();
      runTimer(inputLimit(expected.length));
      later(() => evaluate(true), inputLimit(expected.length));
    }

    function paintSlots() {
      [...slotsEl.children].forEach((s, i) => {
        const has = i < response.length;
        s.textContent = has ? String(response[i]) : '';
        s.classList.toggle('filled', has);
      });
      undoBtn.disabled = phase !== 'input' || !response.length;
      meter.set((response.length / expected.length) * 100, 'Your turn - ' + response.length + ' of ' + expected.length);
    }

    function enter(d, kind) {
      if (killed || phase !== 'input') return;
      response.push(d);
      keyTimes.push(Math.round(performance.now() - inputAt));
      kinds.add(kind);
      paintSlots();
      const slot = slotsEl.children[response.length - 1];
      slot.classList.remove('pop');
      void slot.offsetWidth;
      slot.classList.add('pop');
      note(response.length - 1);
      if (response.length === expected.length) evaluate(false);
    }

    function undo() {
      if (killed || phase !== 'input' || !response.length) return;
      response.pop();
      keyTimes.pop();
      undos += 1;
      paintSlots();
    }

    function evaluate(timedOut) {
      if (killed || phase !== 'input') return;
      phase = 'review';
      clearTimers();
      freezeTimer();
      setPad(false);

      const length = expected.length;
      const right = positionsRight(response, expected);
      const correct = !timedOut && isCorrect(response, expected);
      const rt = timedOut ? null : keyTimes[keyTimes.length - 1];
      log.push({
        length, reverse: cfg.reverse, sequence: seq, expected, response: response.slice(),
        correct, right, rt, firstRt: keyTimes.length ? keyTimes[0] : null, keyTimes: keyTimes.slice(),
        undos, timedOut, onsets: onsets.slice(), input: [...kinds].join('+') || 'none'
      });
      score += pointsFor({ correct, length, rt, right, reverse: cfg.reverse });

      // right / wrong is shown by a mark on every slot, not by colour alone
      [...slotsEl.children].forEach((s, i) => {
        s.classList.add(response[i] === expected[i] ? 'right' : 'wrong');
      });

      const nextState = step(state, correct, cfg);
      if (correct) {
        streak += 1;
        card.classList.add('good');
        digitEl.textContent = '✓';
        sfx.correct(Math.min(6, streak));
        stage.burstAt(slotsEl, ACCENT, 22);
        promptEl.innerHTML = 'Correct - <b>' + length + '</b> in a row';
        stage.danger(false);
        if (!nextState.done) stage.say('LENGTH ' + nextState.length);
      } else {
        streak = 0;
        card.classList.add('bad');
        digitEl.textContent = '✗';
        sfx.wrong();
        stage.flashBad();
        stage.shake();
        revealEl.textContent = (cfg.reverse ? 'Backwards, it was  ' : 'It was  ') + expected.join('  ');
        promptEl.innerHTML = (timedOut ? 'Out of time' : 'Not quite') +
          (nextState.done ? '' : ' - one more try at <b>' + length + '</b>');
        stage.danger(!nextState.done);
      }
      syncHud(true);

      later(() => {
        if (nextState.done) { finish(); return; }
        state = { length: nextState.length, misses: nextState.misses };
        newTrial();
      }, correct ? REVIEW_MS.right : REVIEW_MS.wrong);
    }

    /* --- pause: the sequence is hidden, so it is replayed fresh on resume --- */
    let pausedCard = null;

    function pause() {
      if (killed || (phase !== 'show' && phase !== 'input')) return;
      clearTimers();
      freezeTimer();
      setPad(false);
      phase = 'paused';
      pauses += 1;
      voided += 1;
      digitEl.textContent = '';
      card.classList.remove('lit');
      pausedCard = pauseOverlay(resume);
      board.append(pausedCard);
    }

    function resume() {
      if (phase !== 'paused') return;
      if (pausedCard) { pausedCard.remove(); pausedCard = null; }
      newTrial();                               // a new sequence at the same length
    }

    const onVisibility = () => { if (document.hidden) pause(); };

    const onKey = (e) => {
      if (killed || e.repeat) return;
      if (e.key === 'Escape') {
        if (official) return;
        abandon(); return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (phase === 'paused') resume(); else pause();
        return;
      }
      if (phase !== 'input') return;
      if (e.key === 'Backspace') { e.preventDefault(); undo(); return; }
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= 9) { e.preventDefault(); enter(n, 'key'); }
    };

    function cleanup() {
      killed = true;
      clearTimers();
      stage.destroy();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
    }

    function abandon() {
      track('game_abandoned', {
        game_id: GAME_ID, difficulty: cfg.key, trials_completed: log.length,
        duration_ms: Math.round(performance.now() - roundStart), start_time: startedAt
      });
      cleanup();
      showSetup();
    }

    function finish() {
      cleanup();
      sfx.finish();
      const result = {
        mode: cfg.key, score, reverse: cfg.reverse, ...summarize(log), startedAt,
        raw: { seed, trials: log, pauses, voided, timing: { on: cfg.on, off: cfg.off } }
      };
      completeRound({ ctx, gameId: GAME_ID, cfg, result, showResults: (info) => showResults(cfg, result, info) });
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    setScreen(wrap, cleanup);
    stage.ready();
    syncHud(false);
    later(newTrial, 300);
  }

  /* ---------------------------------------------------------------- results */

  function showResults(cfg, r, { isRecord, prevBest, change }) {
    const ability = abilityFor(GAME_ID);
    const grade = gradeFromScore(ability ? ability.score(r) : null);
    const verdict = {
      S: 'A long span - you held sequences most people cannot.',
      A: 'Strong recall, even as the sequences grew.',
      B: 'Solid. Try saying the digits to yourself in twos or threes.',
      C: 'Rehearse as they appear: repeat the whole sequence in your head after each new digit.',
      D: 'Say each digit silently as it appears, then play the list back in your head before typing.'
    }[grade];
    const { node, cleanup } = resultsPanel({
      subtitle: cfg.name + ' round complete',
      grade, score: r.score, verdict, isRecord, prevBest, cfgName: cfg.name, change,
      stats: [
        [r.span || '—', 'Span'],
        [r.correct + '/' + r.total, 'Correct'],
        [r.itemAccuracy + '%', 'Digits right'],
        [typeof r.medianRt === 'number' ? (r.medianRt / 1000).toFixed(1) + 's' : '—', 'Answer time']
      ],
      note: '"Span" is the longest sequence you typed back perfectly' + (r.reverse ? ', backwards.' : '.'),
      onAgain: () => startCountdown(cfg),
      onSetup: () => showSetup()
    });
    setScreen(node, cleanup);
  }

  if (official) startCountdown(MODES[official.difficulty] || MODES.medium);
  else showSetup();
}
