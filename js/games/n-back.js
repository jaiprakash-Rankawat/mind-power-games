/* N-Back - continuous working-memory updating.
   A stimulus stream plays; the player flags each item that matches the one N
   steps back. N adapts block by block (Jaeggi protocol: <=2 errors levels up,
   >=5 levels down), so the level it settles at is the ability estimate. */

import { el, randInt } from '../core/util.js';
import { saveBest, getBest, recordRound } from '../core/storage.js';
import { sfx } from '../core/audio.js';
import { countUp } from '../core/fx.js';
import { createStage, createMeter, gradeChip, resultFx, abilityChip } from '../core/arcade.js';
import { logRun } from '../core/profile.js';

const ACCENT = '#a789ff';

const COLORS = ['#ff4d4d', '#4d8bff', '#2ee88a', '#ffd23f', '#b46bff', '#ff8c42'];

const MODES = {
  easy: {
    key: 'easy', name: 'Easy', dual: false, trialMs: 3000, stimMs: 700,
    startN: 2, minN: 1, blocks: 4, pMatch: 0.3, pLure: 0,
    meta: 'Position only - 3s per item. Starts at 2-back.'
  },
  medium: {
    key: 'medium', name: 'Medium', dual: false, trialMs: 2400, stimMs: 550,
    startN: 2, minN: 2, blocks: 4, pMatch: 0.3, pLure: 0.1,
    meta: 'Position only - 2.4s per item, with near-miss lures.'
  },
  hard: {
    key: 'hard', name: 'Hard', dual: true, trialMs: 2800, stimMs: 650,
    startN: 2, minN: 2, blocks: 4, pMatch: 0.28, pLure: 0.12,
    meta: 'Dual n-back - track position AND colour at the same time.'
  }
};

const BLOCK_BASE = 16;          // trials per block = BLOCK_BASE + n
const LEVEL_UP_ERRORS = 2;      // <= this many errors in a block: n + 1
const LEVEL_DOWN_ERRORS = 5;    // >= this many errors: n - 1

/* Inverse normal CDF (Acklam) - needed for d', the sensitivity score. */
function probit(p) {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
             1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
             6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
             -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
             3.754408661907416e+00];
  const lo = 0.02425, hi = 1 - lo;
  let q, r;
  if (p < lo) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > hi) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5; r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
         (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** d' with a log-linear correction so perfect or empty cells stay finite. */
function dPrime(hits, matches, falseAlarms, nonMatches) {
  if (!matches || !nonMatches) return 0;
  const hr = (hits + 0.5) / (matches + 1);
  const fa = (falseAlarms + 0.5) / (nonMatches + 1);
  return probit(hr) - probit(fa);
}

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

  function miniGrid(activeIdx, highlight) {
    const g = el('div', { class: 'mini-grid' + (highlight ? ' marked' : '') });
    for (let i = 0; i < 9; i++) {
      g.append(el('span', { class: 'mini' + (i === activeIdx ? ' on' : '') }));
    }
    return g;
  }

  async function showSetup() {
    const bests = {};
    for (const key of Object.keys(MODES)) bests[key] = await getBest('n-back', key);

    // a static strip: item 3 repeats item 1, so on item 3 you press MATCH
    const strip = el('div', { class: 'nb-strip' },
      miniGrid(4, true),
      el('span', { class: 'nb-step', text: '1' }),
      miniGrid(0),
      el('span', { class: 'nb-step', text: '2' }),
      miniGrid(4, true),
      el('span', { class: 'nb-step nb-hit', text: 'MATCH' })
    );

    const panel = el('div', { class: 'panel' },
      el('h2', { text: 'N-Back' }),
      el('p', { class: 'lead', text: 'The hardest working-memory task there is: hold a moving window in your head and keep updating it.' }),

      el('div', { class: 'rules' },
        el('div', { class: 'demo' }, strip),
        el('ul', {},
          el('li', { html: 'Squares light up one at a time. Press <b>MATCH</b> when the square is in the same place it was <b>N steps earlier</b>.' }),
          el('li', { html: 'At 2-back, compare each square with the one from <b>two</b> items ago - then let the oldest one go.' }),
          el('li', { html: 'N adapts as you play: a clean block moves you <b>up</b>, a messy one moves you <b>down</b>.' }),
          el('li', { html: 'Your result is the <b>N level you hold</b> plus <b>d′</b>, a sensitivity score that separates real hits from lucky guesses.' })
        )
      ),

      el('div', { class: 'diffs' },
        Object.values(MODES).map((cfg) => {
          const best = bests[cfg.key];
          return el('button', { class: 'diff', type: 'button', onclick: () => startCountdown(cfg) },
            el('b', { class: 'd-name', text: cfg.name }),
            el('span', { class: 'd-meta', text: cfg.meta }),
            el('span', { class: 'd-best', text: best ? 'Best ' + best.score + ' - peak ' + (best.peakN || 0) + '-back' : 'No score yet' })
          );
        })
      ),
      el('p', { class: 'foot-hint', text: 'Each step up in N adds real load - 3-back is already demanding.' })
    );

    setScreen(panel);
  }

  /* -------------------------------------------------------------- countdown */

  function startCountdown(cfg, carry) {
    const big = el('div', { class: 'big', text: '3' });
    const n = carry ? carry.n : cfg.startN;
    const overlay = el('div', { class: 'overlay' },
      el('div', {}, big, el('div', { class: 'small', text: n + '-back' + (cfg.dual ? ' - position and colour' : '') }))
    );
    const board = el('div', { class: 'board arcade', style: { minHeight: '420px' } }, overlay);

    let c = 3;
    sfx.tick();
    const timer = setInterval(() => {
      c -= 1;
      if (c > 0) { big.textContent = String(c); sfx.tick(); return; }
      clearInterval(timer);
      big.textContent = 'GO';
      sfx.start();
      setTimeout(() => startGame(cfg, carry), 400);
    }, 650);

    setScreen(board, () => clearInterval(timer));
  }

  /* ------------------------------------------------------------------- play */

  function startGame(cfg, carry) {
    /* --- run state (survives across blocks) --- */
    let n = carry ? carry.n : cfg.startN;
    let blockNo = carry ? carry.blockNo : 1;
    let score = carry ? carry.score : 0;
    const nHistory = carry ? carry.nHistory : [];
    const tally = carry ? carry.tally : {
      hits: 0, misses: 0, falseAlarms: 0, matches: 0, nonMatches: 0, trials: 0, peakN: 0,
      // raw, trial-by-trial record across all blocks - never summarised away
      log: [], pauses: 0, startedAt: new Date().toISOString()
    };

    /* --- block state --- */
    const blockLen = BLOCK_BASE + n;
    const posSeq = makeSequence(blockLen, n, 9, cfg.pMatch, cfg.pLure);
    const colSeq = cfg.dual ? makeSequence(blockLen, n, COLORS.length, cfg.pMatch, cfg.pLure) : null;

    let idx = -1;
    let blockErrors = 0;
    let killed = false;
    let paused = false;
    let trialVoid = false;
    let answered = { pos: false, col: false };
    let rts = { pos: null, col: null };    // ms from stimulus onset to each press
    let onsetAt = 0;
    let runId = 0;

    const timers = new Set();
    const wait = (ms) => new Promise((res) => {
      const t = setTimeout(() => { timers.delete(t); res(); }, ms);
      timers.add(t);
    });

    /* --- HUD --- */
    const scoreEl = el('b', { text: String(score) });
    const nEl = el('b', { text: n + '-back' });
    const blockEl = el('b', { text: blockNo + '/' + cfg.blocks });
    const errEl = el('b', { text: '0' });

    const hud = el('div', { class: 'hud' },
      el('div', { class: 'box' }, scoreEl, el('span', { text: 'Score' })),
      el('div', { class: 'box hot' }, nEl, el('span', { text: 'Level' })),
      el('div', { class: 'box' }, blockEl, el('span', { text: 'Block' })),
      el('div', { class: 'box' }, errEl, el('span', { text: 'Errors' }))
    );

    const timerFill = el('div', { class: 'timer-fill' });
    const timerTrack = el('div', { class: 'timer-track' }, timerFill);

    const meter = createMeter('Block ' + blockNo + ' - item 0 of ' + blockLen);
    const promptEl = el('div', { class: 'prompt', html: 'Match the item from <b>' + n + '</b> steps back' });
    const grid = el('div', { class: 'tile-grid', style: { gridTemplateColumns: 'repeat(3,1fr)' } });
    const cells = [];
    for (let i = 0; i < 9; i++) {
      const cell = el('div', { class: 'tile nb-cell' });
      cells.push(cell);
      grid.append(cell);
    }

    const posBtn = el('button', { class: 'nb-btn', type: 'button', onclick: () => respond('pos') },
      el('b', { text: cfg.dual ? 'POSITION' : 'MATCH' }),
      el('span', { text: cfg.dual ? 'key A' : 'space' })
    );
    const colBtn = cfg.dual
      ? el('button', { class: 'nb-btn', type: 'button', onclick: () => respond('col') },
          el('b', { text: 'COLOUR' }), el('span', { text: 'key L' }))
      : null;

    const actions = el('div', { class: 'nb-actions' }, posBtn, colBtn);

    const stage = createStage('nb');
    stage.add(promptEl, el('div', { class: 'grid-wrap' }, grid), actions);
    const board = stage.board;
    stage.tint(ACCENT);

    const hint = el('p', { class: 'foot-hint',
      text: (cfg.dual ? 'A = position - L = colour' : 'Space or click = match') + ' - Esc to quit' });

    const wrap = el('div', {}, hud, timerTrack, meter.wrap, board, hint);

    function syncHud(animate) {
      if (animate) countUp(scoreEl, score, 420);
      else scoreEl.textContent = score;
      nEl.textContent = n + '-back';
      blockEl.textContent = blockNo + '/' + cfg.blocks;
      errEl.textContent = blockErrors;
      stage.danger(blockErrors >= LEVEL_DOWN_ERRORS - 1);
    }

    /* --- stimulus stream --- */
    function isMatch(seq, i) { return i >= n && seq[i] === seq[i - n]; }

    function flashBtn(btn, cls) {
      if (!btn) return;
      btn.classList.add(cls);
      const t = setTimeout(() => { btn.classList.remove(cls); timers.delete(t); }, 320);
      timers.add(t);
    }

    function respond(channel) {
      if (killed || paused || idx < 0 || answered[channel]) return;
      answered[channel] = true;
      rts[channel] = Math.round(performance.now() - onsetAt);

      const seq = channel === 'pos' ? posSeq : colSeq;
      const btn = channel === 'pos' ? posBtn : colBtn;
      const hit = isMatch(seq, idx);

      if (hit) {
        tally.hits += 1;
        score += 100 * n;
        sfx.correct();
        flashBtn(btn, 'good');
        stage.burstAt(btn, channel === 'col' ? COLORS[colSeq[idx]] : ACCENT, 16);
        syncHud(true);
        return;
      }

      tally.falseAlarms += 1;
      blockErrors += 1;
      score = Math.max(0, score - 50);
      sfx.wrong();
      flashBtn(btn, 'bad');
      stage.flashBad();
      stage.shake(260);
      syncHud(false);
    }

    /** Called when a trial closes: everything the player did not press. */
    function closeTrial() {
      tally.log.push({
        block: blockNo,
        n,
        i: idx,
        pos: posSeq[idx],
        col: colSeq ? colSeq[idx] : null,
        posMatch: isMatch(posSeq, idx),
        colMatch: colSeq ? isMatch(colSeq, idx) : null,
        pressedPos: answered.pos,
        pressedCol: cfg.dual ? answered.col : null,
        rtPos: rts.pos,
        rtCol: cfg.dual ? rts.col : null,
        voided: trialVoid
      });
      if (trialVoid) return;
      const channels = cfg.dual ? ['pos', 'col'] : ['pos'];
      for (const ch of channels) {
        const seq = ch === 'pos' ? posSeq : colSeq;
        const wasMatch = isMatch(seq, idx);
        if (wasMatch) tally.matches += 1; else tally.nonMatches += 1;

        if (wasMatch && !answered[ch]) {
          tally.misses += 1;
          blockErrors += 1;
          score = Math.max(0, score - 30);
          flashBtn(ch === 'pos' ? posBtn : colBtn, 'bad');
          stage.flashBad();
        } else if (!wasMatch && !answered[ch]) {
          score += 10;                       // correct rejection
        }
      }
      tally.trials += 1;
      syncHud(false);
    }

    function paintStimulus(show) {
      cells.forEach((c) => { c.classList.remove('on'); c.style.background = ''; });
      if (!show) return;
      const cell = cells[posSeq[idx]];
      cell.classList.add('on');
      cell.style.background = cfg.dual ? COLORS[colSeq[idx]] : '';
    }

    function runTimerBar(ms) {
      timerFill.style.transition = 'none';
      timerFill.style.width = '100%';
      void timerFill.offsetWidth;
      timerFill.style.transition = `width ${ms}ms linear`;
      timerFill.style.width = '0%';
    }

    async function runBlock() {
      const myRun = ++runId;
      const stale = () => killed || myRun !== runId;
      stage.say(n + '-BACK');

      for (let i = 0; i < blockLen; i++) {
        while (paused) { await wait(120); if (stale()) return; }
        if (stale()) return;

        idx = i;
        answered = { pos: false, col: false };
        rts = { pos: null, col: null };
        trialVoid = false;
        meter.set(((i + 1) / blockLen) * 100, 'Block ' + blockNo + ' - item ' + (i + 1) + ' of ' + blockLen);

        paintStimulus(true);
        onsetAt = performance.now();
        runTimerBar(cfg.trialMs);
        await wait(cfg.stimMs);
        if (stale()) return;

        paintStimulus(false);
        await wait(cfg.trialMs - cfg.stimMs);
        if (stale()) return;

        closeTrial();
      }
      idx = -1;
      endBlock();
    }

    /* --- between blocks: adapt N, then hand control back to the player --- */
    function endBlock() {
      nHistory.push(n);
      tally.peakN = Math.max(tally.peakN, blockErrors <= LEVEL_UP_ERRORS ? n : 0);

      let nextN = n;
      let verdict;
      if (blockErrors <= LEVEL_UP_ERRORS) { nextN = n + 1; verdict = 'Clean block - moving up'; }
      else if (blockErrors >= LEVEL_DOWN_ERRORS) { nextN = Math.max(cfg.minN, n - 1); verdict = 'Too many errors - easing off'; }
      else verdict = 'Holding this level';

      if (blockErrors <= LEVEL_UP_ERRORS) score += 200 * n;

      const last = blockNo >= cfg.blocks;
      cleanup();

      if (last) { finish(); return; }

      const carry = {
        n: nextN, blockNo: blockNo + 1, score, nHistory, tally
      };

      const panel = el('div', { class: 'panel center result-panel' },
        el('p', { class: 'result-sub', text: 'Block ' + blockNo + ' of ' + cfg.blocks + ' complete' }),
        el('div', { class: 'result-score', text: n + '-back' }),
        el('p', { class: 'result-sub', text: verdict }),
        el('div', { class: 'grid4' },
          el('div', { class: 'box' }, el('b', { text: String(blockErrors) }), el('span', { text: 'Errors' })),
          el('div', { class: 'box' }, el('b', { text: String(tally.hits) }), el('span', { text: 'Hits' })),
          el('div', { class: 'box' }, el('b', { text: String(score) }), el('span', { text: 'Score' })),
          el('div', { class: 'box' }, el('b', { text: nextN + '-back' }), el('span', { text: 'Next' }))
        ),
        el('div', { class: 'actions' },
          el('button', { class: 'btn primary', type: 'button', onclick: () => startCountdown(cfg, carry) }, 'Next block'),
          // the official test always plays every block
          official ? null : el('button', { class: 'btn', type: 'button', onclick: () => { finishFrom(cfg, carry); } }, 'Stop and score')
        ),
        el('p', { class: 'foot-hint', text: 'Press Enter to continue' })
      );

      const onKey = (e) => {
        if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); startCountdown(cfg, carry); }
        if (e.key === 'Escape' && !official) showSetup();
      };
      document.addEventListener('keydown', onKey);
      setScreen(panel, () => document.removeEventListener('keydown', onKey));
    }

    /* --- pause --- */
    let pauseOverlay = null;

    function pause() {
      if (paused || killed) return;
      paused = true;
      tally.pauses += 1;
      trialVoid = true;              // do not score a trial the player could not see
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
      if (pauseOverlay) { pauseOverlay.remove(); pauseOverlay = null; }
    }

    const onVisibility = () => { if (document.hidden) pause(); };

    const onKey = (e) => {
      if (killed) return;
      if (e.key === 'Escape') {
        if (official) return;              // no bailing out mid-test by accident
        cleanup(); showSetup(); return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (paused) { resume(); return; }
        if (!cfg.dual) respond('pos');
        return;
      }
      if (paused) return;
      if (cfg.dual && (e.key === 'a' || e.key === 'A')) respond('pos');
      if (cfg.dual && (e.key === 'l' || e.key === 'L')) respond('col');
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
      const result = buildResult(cfg, score, nHistory, tally);
      const isRecord = await saveBest('n-back', cfg.key, result);
      await recordRound(result.score);
      const change = await logRun('n-back', result,
        official ? { source: 'official', sessionId: official.sessionId } : {});
      if (official) { official.onComplete(result); return; }
      showResults(cfg, result, isRecord, change);
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);

    setScreen(wrap, cleanup);
    stage.ready();
    syncHud(false);
    runBlock();
  }

  /** "Stop and score" from a between-block screen. */
  async function finishFrom(cfg, carry) {
    const result = buildResult(cfg, carry.score, carry.nHistory, carry.tally);
    const isRecord = await saveBest('n-back', cfg.key, result);
    await recordRound(result.score);
    const change = await logRun('n-back', result);
    showResults(cfg, result, isRecord, change);
  }

  function buildResult(cfg, score, nHistory, t) {
    const correct = t.hits + (t.nonMatches - t.falseAlarms);
    const responses = t.matches + t.nonMatches;
    return {
      mode: cfg.key,
      score,
      peakN: t.peakN || (nHistory.length ? Math.min(...nHistory) : cfg.startN),
      meanN: nHistory.length ? Math.round((nHistory.reduce((a, b) => a + b, 0) / nHistory.length) * 10) / 10 : cfg.startN,
      accuracy: responses ? Math.round((correct / responses) * 100) : 0,
      dprime: Math.round(dPrime(t.hits, t.matches, t.falseAlarms, t.nonMatches) * 100) / 100,
      hits: t.hits,
      misses: t.misses,
      falseAlarms: t.falseAlarms,
      trials: t.trials,
      startedAt: t.startedAt || null,
      raw: { trials: t.log || [], pauses: t.pauses || 0 }
    };
  }

  /* ------------------------------------------------- sequence with lures --- */

  function makeSequence(len, n, size, pMatch, pLure) {
    const seq = [];
    for (let i = 0; i < len; i++) {
      if (i >= n && Math.random() < pMatch) { seq.push(seq[i - n]); continue; }

      let v = randInt(size);
      if (i >= n && v === seq[i - n]) v = (v + 1 + randInt(size - 1)) % size;

      // a lure repeats n-1 or n+1 back: feels like a match, is not one
      if (pLure && Math.random() < pLure) {
        const d = Math.random() < 0.5 ? n - 1 : n + 1;
        if (d > 0 && i - d >= 0 && (i < n || seq[i - d] !== seq[i - n])) v = seq[i - d];
      }
      seq.push(v);
    }
    return seq;
  }

  /* ---------------------------------------------------------------- results */

  function grade(r) {
    if (r.dprime < 1) return 'D';          // guessing, whatever level was reached
    if (r.peakN >= 5) return 'S';
    if (r.peakN >= 4) return 'A';
    if (r.peakN >= 3) return 'B';
    if (r.peakN >= 2) return 'C';
    return 'D';
  }

  async function showResults(cfg, r, isRecord, change) {
    const prevBest = await getBest('n-back', cfg.key);
    const scoreEl = el('div', { class: 'result-score', text: '0' });

    const verdict =
      r.peakN >= 5 ? 'Exceptional - you held 5-back or beyond.' :
      r.peakN >= 4 ? 'Strong - 4-back is a heavy load to hold cleanly.' :
      r.peakN >= 3 ? 'Solid - 3-back held with few errors.' :
      'A clean 2-back is the right place to build from.';

    const panel = el('div', { class: 'panel result-panel' },
      el('p', { class: 'result-sub', text: cfg.name + (cfg.dual ? ' dual' : '') + ' run complete' }),
      el('div', { class: 'grade-row' }, gradeChip(grade(r)), el('div', { class: 'result-score', text: r.peakN + '-back' })),
      el('p', { class: 'result-sub', text: verdict }),
      el('div', { class: 'center' },
        isRecord && r.score > 0
          ? el('span', { class: 'badge', text: 'NEW PERSONAL BEST' })
          : (prevBest ? el('span', { class: 'result-sub', text: 'Best on ' + cfg.name + ': ' + prevBest.score }) : null)
      ),
      el('div', { class: 'center' }, abilityChip(change)),

      el('div', { class: 'grid4' },
        el('div', { class: 'box' }, scoreEl, el('span', { text: 'Score' })),
        el('div', { class: 'box' }, el('b', { text: r.accuracy + '%' }), el('span', { text: 'Accuracy' })),
        el('div', { class: 'box' }, el('b', { text: r.dprime.toFixed(2) }), el('span', { text: "Sensitivity d′" })),
        el('div', { class: 'box' }, el('b', { text: r.hits + '/' + (r.hits + r.misses) }), el('span', { text: 'Hits' }))
      ),

      el('p', { class: 'foot-hint',
        text: 'Mean level ' + r.meanN + '-back - ' + r.falseAlarms + ' false alarms over ' + r.trials + ' items. ' +
              'd′ above 2 means you are reading the stream, not guessing.' }),

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
    if (isRecord && r.score > 0) confetti.start(['#a789ff', '#37dcf2', '#34d399', '#fbbf24']);
  }

  // Brain Test: fixed settings (including the block count), no difficulty screen.
  if (official) {
    const base = MODES[official.difficulty] || MODES.easy;
    startCountdown({ ...base, blocks: official.blocks || base.blocks });
  } else {
    showSetup();
  }
}
