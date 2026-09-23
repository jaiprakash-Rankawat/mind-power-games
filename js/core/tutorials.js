/* What each game's tutorial teaches (the overlay itself is core/tutorial.js).

   Every game gets:
     goal      the rule in one sentence
     learn     a worked example: the right answer beside the tempting wrong one
     explain   one or two sentences under the example
     practice  { goal, intro, start(box, api) } - practice questions in the game's
               own look; api.right() / api.wrong() give feedback, and a wrong
               answer never moves on until it is answered right
     ready     controls and scoring, one line each

   Practice items are fixed, not random, so every player gets the same, clear
   examples (and tests/tutorials.test.mjs can check the answers). */

import { el } from './util.js';
import { shapeMarkup, TARGET } from '../games/logic/attention-storm-logic.js';
import { cheapestRoute } from '../games/logic/path-finder-logic.js';

/* ---------------------------------------------------------------- helpers */

const tag = (ok, text) => el('span', { class: 'tut-tag ' + (ok ? 'yes' : 'no'), text: (ok ? '✓ ' : '✗ ') + text });
const col = (...kids) => el('div', { class: 'tut-col' }, ...kids);
const row = (...kids) => el('div', { class: 'tut-row' }, ...kids);
const arrow = () => el('span', { class: 'tut-arrow', 'aria-hidden': 'true', text: '→' });
const keyOf = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);

/** Color Clash's standard inks. */
export const INK = { RED: '#ff4d4d', BLUE: '#4d8bff', GREEN: '#2ee88a', YELLOW: '#ffd23f' };

function grid3(cls = '') {
  const tiles = Array.from({ length: 9 }, (_, i) => el('button', { class: 'tile tut-tile', type: 'button', 'aria-label': 'tile ' + (i + 1) }));
  return { node: el('div', { class: 'tut-grid ' + cls }, tiles), tiles };
}

function miniGrid(pos, label, marked = false) {
  return col(
    el('div', { class: 'mini-grid' + (marked ? ' marked' : '') },
      Array.from({ length: 9 }, (_, i) => el('span', { class: 'mini' + (i === pos ? ' on' : '') }))),
    el('span', { class: 'tut-caption', text: label }));
}

/** A polyomino as SVG, turned by `angle` degrees about its centre. */
function shapeSvg(cells, angle, color) {
  const S = 100;
  const w = Math.max(...cells.map((c) => c[0])) + 1;
  const h = Math.max(...cells.map((c) => c[1])) + 1;
  const cell = 64 / Math.max(w, h, 3);
  const ox = (S - w * cell) / 2;
  const oy = (S - h * cell) / 2;
  const rects = cells.map(([x, y]) =>
    `<rect x="${ox + x * cell + 1}" y="${oy + y * cell + 1}" width="${cell - 2}" height="${cell - 2}" rx="${cell * 0.18}" fill="${color}"/>`).join('');
  return `<svg viewBox="0 0 ${S} ${S}" aria-hidden="true"><g transform="rotate(${angle} 50 50)">${rects}</g></svg>`;
}
const mirrorCells = (cells) => {
  const w = Math.max(...cells.map((c) => c[0]));
  return cells.map(([x, y]) => [w - x, y]);
};
export const L_SHAPE = [[0, 0], [0, 1], [0, 2], [1, 2]];
export const F_SHAPE = [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]];

const shapeTile = (shape, extra = '') =>
  el('span', { class: 'as-demo-shape tut-shape ' + extra, html: shapeMarkup(shape) });

/* ------------------------------------------------------ practice item data */

export const STROOP_ITEMS = [['BLUE', 'RED'], ['YELLOW', 'GREEN'], ['RED', 'BLUE']];     // [word, ink]
export const GRID_ITEMS = [[3, 1, 8], [0, 4, 2, 7]];
export const NBACK_SEQ = [0, 4, 0, 2, 7, 2, 6];
export const SWITCH_ITEMS = [[3, 'parity'], [8, 'magnitude'], [6, 'parity'], [2, 'magnitude']];
export const PATTERN_ITEMS = [
  { seq: [3, 6, 9, 12, 15, 18], options: [19, 21, 24, 20], answer: 21, rule: 'it adds 3 each time' },
  { seq: [1, 2, 4, 8, 16, 32], options: [48, 64, 34, 40], answer: 64, rule: 'it doubles each time' },
  { seq: [5, 10, 6, 11, 7, 12], options: [8, 13, 17, 6], answer: 8, rule: 'two steps take turns: +5, then -4' }
];
export const ROTATION_ITEMS = [
  { cells: L_SHAPE, angle: 90, mirror: false },
  { cells: L_SHAPE, angle: 180, mirror: true },
  { cells: F_SHAPE, angle: 135, mirror: false }
];
export const RECALL_ITEMS = [[5, 1, 8], [3, 9, 4, 6]];
export const STORM_STREAM = ['circle', 'star5', 'star6', 'square', 'star5', 'star5-outline', 'triangle', 'star5', 'star5-inverted'];
export const MAZE = ['S..#.', '##.#.', '.....', '.###.', '...#F'];

const LOOK_ALIKE = { star6: 'a six-point star', 'star5-outline': 'an outline star', 'star5-inverted': 'an upside-down star', star4: 'a four-point star' };

/* ----------------------------------------------------------------- content */

export const TUTORIALS = {
  stroop: {
    goal: 'Tap the colour of the <b>letters</b>, not the colour the word names.',
    explain: 'The word says <b>GREEN</b>, but it is printed in <b>red</b> - so red is right. Reading happens by itself; this game is about ignoring it.',
    learn(box) {
      const chip = (hex) => el('span', { class: 'tut-swatch', style: { background: hex } });
      box.append(col(
        el('div', { class: 'tut-word', text: 'GREEN', style: { color: INK.RED } }),
        row(col(chip(INK.RED), tag(true, 'The ink: tap this')), col(chip(INK.GREEN), tag(false, 'What it says')))));
    },
    practice: {
      goal: STROOP_ITEMS.length,
      intro: 'Tap the colour the letters are printed in.',
      start(box, api) {
        const names = Object.keys(INK);
        const word = el('div', { class: 'tut-word' });
        const chips = el('div', { class: 'tut-chips' }, names.map((n, i) =>
          el('button', { class: 'chip tut-chip', type: 'button', 'aria-label': n.toLowerCase(), style: { background: INK[n] }, onclick: () => pick(n) },
            el('span', { class: 'key', text: String(i + 1) }))));
        box.append(word, chips);
        let i = 0;
        let locked = false;
        const show = () => { const [w, ink] = STROOP_ITEMS[i]; word.textContent = w; word.style.color = INK[ink]; locked = false; };
        function pick(n) {
          if (locked || api.done) return;
          const [w, ink] = STROOP_ITEMS[i];
          if (n === ink) {
            locked = true;
            i += 1;
            if (!api.right(`Right - the letters are ${ink.toLowerCase()}.`)) api.later(show, 900);
          } else if (n === w) {
            api.wrong('That is what the word <b>says</b>. Look at the colour of the letters.');
          } else {
            api.wrong(`Not quite - the letters are <b>${ink.toLowerCase()}</b>.`);
          }
        }
        api.onKey((e) => { const k = Number(e.key); if (k >= 1 && k <= 4) { e.preventDefault(); pick(names[k - 1]); } });
        show();
      }
    },
    ready: [
      'Keys <b>1-6</b>, or tap a colour.',
      'Quick right answers score most. A miss costs points, and on Medium and Hard some time too.',
      'On Hard the rule sometimes flips to <b>what the word says</b> - the line above the word tells you.'
    ]
  },

  'memory-grid': {
    goal: 'Watch the tiles light up, then tap the same tiles <b>in the same order</b>.',
    explain: 'Here the path was tile 1, then 2, then 3. Tap them back in that order. Each level adds one more tile.',
    learn(box) {
      const { node, tiles } = grid3('small');
      [[3, '1'], [1, '2'], [8, '3']].forEach(([i, n]) => { tiles[i].classList.add('lit'); tiles[i].textContent = n; });
      tiles.forEach((t) => { t.tabIndex = -1; });
      box.append(node);
    },
    practice: {
      goal: GRID_ITEMS.length,
      intro: 'Watch first.',
      start(box, api) {
        const { node, tiles } = grid3();
        box.append(node);
        let item = 0;
        let pos = 0;
        let locked = true;
        const clear = () => tiles.forEach((t) => t.classList.remove('lit', 'good', 'bad', 'hint'));
        function play() {
          const seq = GRID_ITEMS[item];
          locked = true;
          pos = 0;
          clear();
          api.say(`Watch the ${seq.length} tiles...`);
          seq.forEach((t, k) => {
            api.later(() => tiles[t].classList.add('lit'), 500 + k * 700);
            api.later(() => tiles[t].classList.remove('lit'), 500 + k * 700 + 480);
          });
          api.later(() => { locked = false; api.say('Your turn: tap them <b>in the same order</b>.'); }, 500 + seq.length * 700);
        }
        tiles.forEach((tile, t) => tile.addEventListener('click', () => {
          if (locked || api.done) return;
          const seq = GRID_ITEMS[item];
          if (t === seq[pos]) {
            tile.classList.add('good');
            api.later(() => tile.classList.remove('good'), 300);
            pos += 1;
            if (pos === seq.length) {
              locked = true;
              item += 1;
              if (!api.right(`Right - all ${seq.length} in order.`)) api.later(play, 1100);
            }
          } else {
            locked = true;
            tile.classList.add('bad');
            tiles[seq[pos]].classList.add('hint');
            api.wrong('Not that one - the <b>outlined</b> tile came next. Watch again.');
            api.later(play, 1700);
          }
        }));
        play();
      }
    },
    ready: [
      'Tap or click the tiles.',
      'Each level adds one tile to the path. You have 3 lives.',
      'On Hard, every third level is played <b>backwards</b> - last tile first.'
    ]
  },

  'n-back': {
    goal: 'Press <b>MATCH</b> when the square is in the same place as <b>2 steps before</b>.',
    explain: 'Square 3 is where square 1 was, so on square 3 you press MATCH. When it is somewhere else, do nothing.',
    learn(box) {
      box.append(row(miniGrid(0, '1'), arrow(), miniGrid(4, '2'), arrow(), miniGrid(0, '3 = MATCH', true)));
    },
    practice: {
      goal: NBACK_SEQ.length - 2,
      intro: 'Watch the first two squares.',
      start(box, api) {
        const big = grid3('nb');
        big.tiles.forEach((t) => { t.tabIndex = -1; t.disabled = true; });
        const history = el('div', { class: 'tut-row tut-history' });
        const matchBtn = el('button', { class: 'nb-btn', type: 'button', onclick: () => answer(true) }, el('b', { text: 'MATCH' }), el('span', { text: 'Space' }));
        const noBtn = el('button', { class: 'nb-btn', type: 'button', onclick: () => answer(false) }, el('b', { text: 'Not a match' }), el('span', { text: 'N' }));
        const actions = el('div', { class: 'nb-actions tut-actions' }, matchBtn, noBtn);
        box.append(history, big.node, actions);
        let i = 0;
        let waiting = false;
        function show() {
          const pos = NBACK_SEQ[i];
          big.tiles.forEach((t, k) => t.classList.toggle('on', k === pos));
          history.replaceChildren(
            i >= 2 ? miniGrid(NBACK_SEQ[i - 2], '2 back') : el('span'),
            i >= 1 ? miniGrid(NBACK_SEQ[i - 1], '1 back') : el('span'));
          actions.style.visibility = i >= 2 ? 'visible' : 'hidden';
          if (i < 2) {
            waiting = false;
            api.say(i === 0 ? 'Remember where this one is...' : '...and this one.');
            api.later(() => { i += 1; show(); }, 1500);
          } else {
            waiting = true;
            api.say('Same place as <b>2 back</b>?');
          }
        }
        function answer(saidMatch) {
          if (!waiting || api.done) return;
          const isMatch = NBACK_SEQ[i] === NBACK_SEQ[i - 2];
          if (saidMatch === isMatch) {
            waiting = false;
            i += 1;
            const done = api.right(isMatch ? 'Right - same place as 2 steps ago.' : 'Right - 2 steps ago it was somewhere else.');
            if (!done) api.later(show, 900);
          } else {
            history.firstChild.querySelector('.mini-grid')?.classList.add('marked');
            api.wrong(isMatch
              ? 'It <b>was</b> a match - look at <b>2 back</b>: same place.'
              : 'Not a match - look at <b>2 back</b>: it was somewhere else.');
          }
        }
        api.onKey((e) => {
          if (e.code === 'Space') { e.preventDefault(); answer(true); }
          if (keyOf(e) === 'n') { e.preventDefault(); answer(false); }
        });
        show();
      }
    },
    ready: [
      'Press <b>MATCH</b> (or <b>Space</b>) only for a match. For anything else, do nothing - there is no "no" button in the game.',
      'The game shows no history: you keep the last squares in your head.',
      'The level adapts: do well and it becomes 3-back; struggle and it can drop to 1-back.'
    ]
  },

  reaction: {
    goal: 'Wait for the light, then press <b>as fast as you can</b>.',
    explain: 'Part 1: press the moment the circle turns <b>green</b>. Part 2: a light appears on the left or right - press <b>that side</b>. Pressing before the light is a false start.',
    learn(box) {
      box.append(
        row(col(el('span', { class: 'rx-pad tut-pad', text: 'WAIT' }), tag(false, 'Press now = too soon')), arrow(),
          col(el('span', { class: 'rx-pad tut-pad go', text: 'NOW!' }), tag(true, 'Press now'))),
        row(col(row(el('span', { class: 'rx-slot tut-slot' }, el('span', { class: 'rx-key', text: 'F' })),
          el('span', { class: 'rx-slot tut-slot go' }, el('span', { class: 'rx-key', text: 'J' }))), tag(true, 'Right side lit: press J'))));
    },
    practice: {
      goal: 4,
      intro: 'Wait for green...',
      start(box, api) {
        const trials = [{ block: 'simple' }, { block: 'simple' }, { block: 'choice', side: 1 }, { block: 'choice', side: 0 }];
        const pad = el('button', { class: 'rx-pad tut-pad', type: 'button', onclick: () => press(null) }, 'WAIT');
        const slots = [0, 1].map((s) => el('button', { class: 'rx-slot tut-slot', type: 'button', 'aria-label': s ? 'right' : 'left', onclick: () => press(s) },
          el('span', { class: 'rx-key', text: s ? 'J' : 'F' })));
        const slotRow = el('div', { class: 'rx-slots tut-slots' }, slots);
        box.append(pad, slotRow);
        let i = 0;
        let phase = 'idle';
        let onset = 0;
        let pending = null;
        function arm() {
          const t = trials[i];
          phase = 'wait';
          pad.hidden = t.block !== 'simple';
          slotRow.hidden = t.block === 'simple';
          pad.classList.remove('go', 'early');
          pad.textContent = 'WAIT';
          slots.forEach((s) => s.classList.remove('go', 'bad'));
          api.say(t.block === 'simple' ? 'Wait for green, then press (Space or tap).' : 'Part 2: press the side that lights up (F or J).');
          pending = api.later(fire, 1100 + Math.round(Math.random() * 1200));
        }
        function fire() {
          const t = trials[i];
          phase = 'go';
          onset = performance.now();
          if (t.block === 'simple') { pad.classList.add('go'); pad.textContent = 'NOW!'; } else slots[t.side].classList.add('go');
          pending = api.later(() => { phase = 'idle'; api.wrong('Too slow - press as soon as the light comes on.'); api.later(arm, 1200); }, 3000);
        }
        function press(side) {
          if (api.done || phase === 'idle') return;
          const t = trials[i];
          if ((t.block === 'simple') !== (side === null)) return;          // wrong control for this part
          clearTimeout(pending);
          if (phase === 'wait') {
            phase = 'idle';
            if (t.block === 'simple') { pad.classList.add('early'); pad.textContent = 'TOO SOON'; }
            api.wrong('Too soon - wait for the light.');
            api.later(arm, 1200);
            return;
          }
          phase = 'idle';
          if (t.block === 'choice' && side !== t.side) {
            slots[side].classList.add('bad');
            api.wrong('The light was on the <b>other side</b>.');
            api.later(arm, 1200);
            return;
          }
          const rt = Math.round(performance.now() - onset);
          i += 1;
          if (!api.right(`${rt} ms - nice.`)) api.later(arm, 1000);
        }
        api.onKey((e) => {
          const k = keyOf(e);
          if (e.code === 'Space') { e.preventDefault(); press(null); }
          if (k === 'f' || k === 'ArrowLeft') { e.preventDefault(); press(0); }
          if (k === 'j' || k === 'ArrowRight') { e.preventDefault(); press(1); }
        });
        arm();
      }
    },
    ready: [
      'Part 1: <b>Space</b> or tap. Part 2: <b>F</b> for left, <b>J</b> for right, or tap.',
      'Presses before the light, or faster than 100 ms, count as guesses.',
      'Your score is mostly about part 2: fast <b>and</b> right.'
    ]
  },

  'task-switch': {
    goal: 'Read the question, then answer with the <b>left</b> or <b>right</b> button.',
    explain: '<b>Left</b> means ODD or LOW. <b>Right</b> means EVEN or HIGH. LOW is below 5, HIGH is above 5. The question can change on any card - read it every time.',
    learn(box) {
      const example = (q, cls, digit, left, right, ok, note) => col(
        el('span', { class: 'ts-cue small ' + cls, text: q }),
        el('span', { class: 'tut-digit', text: String(digit) }),
        row(el('span', { class: 'tut-side' + (ok === 0 ? ' pick' : ''), text: left }), el('span', { class: 'tut-side' + (ok === 1 ? ' pick' : ''), text: right })),
        tag(true, note));
      box.append(row(
        example('ODD or EVEN?', 'parity', 7, 'ODD', 'EVEN', 0, '7 is odd: left'),
        example('LOW or HIGH?', 'magnitude', 7, 'LOW', 'HIGH', 1, '7 is high: right')));
    },
    practice: {
      goal: SWITCH_ITEMS.length,
      intro: 'Read the question on each card.',
      start(box, api) {
        const cue = el('span', { class: 'ts-cue' });
        const digit = el('span', { class: 'tut-digit big' });
        const opt = (rule, text) => el('span', { class: 'ts-opt', 'data-rule': rule, text });
        const btn = (side, a, b, key) => el('button', { class: 'ts-btn tut-ts-btn', type: 'button', onclick: () => answer(side) },
          el('span', { class: 'ts-opts' }, opt('parity', a), el('span', { class: 'ts-sep', text: '·' }), opt('magnitude', b)),
          el('span', { class: 'ts-key', text: key }));
        const buttons = el('div', { class: 'ts-buttons' }, btn('left', 'ODD', 'LOW', 'F'), btn('right', 'EVEN', 'HIGH', 'J'));
        box.append(cue, digit, buttons);
        let i = 0;
        let locked = false;
        function show() {
          const [d, rule] = SWITCH_ITEMS[i];
          cue.textContent = rule === 'parity' ? 'ODD or EVEN?' : 'LOW or HIGH?';
          cue.className = 'ts-cue ' + rule;
          digit.textContent = String(d);
          buttons.querySelectorAll('.ts-opt').forEach((o) => o.classList.toggle('on', o.dataset.rule === rule));
          locked = false;
          if (i > 0 && rule !== SWITCH_ITEMS[i - 1][1]) api.say('<b>The question changed</b> - read it first.');
          else api.say('Read the question on each card.');
        }
        function answer(side) {
          if (locked || api.done) return;
          const [d, rule] = SWITCH_ITEMS[i];
          const label = rule === 'parity' ? (d % 2 ? 'ODD' : 'EVEN') : (d < 5 ? 'LOW' : 'HIGH');
          const want = label === 'ODD' || label === 'LOW' ? 'left' : 'right';
          if (side === want) {
            locked = true;
            i += 1;
            if (!api.right(`Right - ${d} is ${label.toLowerCase()}.`)) api.later(show, 900);
          } else {
            api.wrong(rule === 'parity'
              ? `${d} is ${label.toLowerCase()}, so press <b>${want}</b> (${label}).`
              : `The question is <b>LOW or HIGH</b>. ${d} is ${d < 5 ? 'below' : 'above'} 5, so press <b>${want}</b> (${label}).`);
          }
        }
        api.onKey((e) => {
          const k = keyOf(e);
          if (k === 'f' || k === 'ArrowLeft') { e.preventDefault(); answer('left'); }
          if (k === 'j' || k === 'ArrowRight') { e.preventDefault(); answer('right'); }
        });
        show();
      }
    },
    ready: [
      '<b>F</b> or <b>←</b> for left, <b>J</b> or <b>→</b> for right, or tap.',
      'On Easy the question changes every 4 cards; on Medium and Hard, without warning.',
      'Your score is about how little a change of question slows you down.'
    ]
  },

  'number-pattern': {
    goal: 'Find the rule behind the numbers and pick the <b>next one</b>.',
    explain: 'Each number here is 2 more than the one before, so the next is <b>14</b>. Rules can add, multiply, or take turns between two steps.',
    learn(box) {
      box.append(col(
        row(...[2, 4, 6, 8, 10, 12].map((n) => el('span', { class: 'np-mini', text: String(n) })), el('span', { class: 'np-mini q', text: '?' })),
        row(...[13, 14, 16, 24].map((n) => col(el('span', { class: 'np-mini' + (n === 14 ? ' tut-pick' : ''), text: String(n) }),
          n === 14 ? tag(true, '+2') : el('span', { class: 'tut-tag blank', text: ' ' }))))));
    },
    practice: {
      goal: PATTERN_ITEMS.length,
      intro: 'What comes next?',
      start(box, api) {
        const seqRow = el('div', { class: 'tut-row' });
        const opts = el('div', { class: 'np-options tut-np-options' });
        box.append(seqRow, opts);
        let i = 0;
        let locked = false;
        function show() {
          const it = PATTERN_ITEMS[i];
          seqRow.replaceChildren(...it.seq.map((n) => el('span', { class: 'np-mini', text: String(n) })), el('span', { class: 'np-mini q', text: '?' }));
          opts.replaceChildren(...it.options.map((n, k) => el('button', { class: 'np-opt', type: 'button', onclick: () => pick(n) },
            el('span', { class: 'np-key', text: String(k + 1) }), String(n))));
          locked = false;
        }
        function pick(n) {
          if (locked || api.done) return;
          const it = PATTERN_ITEMS[i];
          if (n === it.answer) {
            locked = true;
            i += 1;
            if (!api.right(`Right - ${it.rule}.`)) api.later(show, 1100);
          } else {
            api.wrong('Not quite. Look at how each number changes from the one before it.');
          }
        }
        api.onKey((e) => { const k = Number(e.key); if (k >= 1 && k <= 4) { e.preventDefault(); pick(PATTERN_ITEMS[i].options[k - 1]); } });
        show();
      }
    },
    ready: [
      'Keys <b>1-4</b>, or tap an answer.',
      'Two right in a row brings a harder kind of pattern; a miss brings an easier one.',
      'There is always exactly one answer that fits.'
    ]
  },

  'spatial-rotation': {
    goal: 'Is the right shape the left one <b>turned</b> (SAME), or <b>flipped</b> (MIRROR)?',
    explain: 'SAME means only turned: turn it back and it lines up. MIRROR means flipped over, like a reflection - no amount of turning makes it line up.',
    learn(box) {
      const pair = (probe, note) => col(row(
        el('span', { class: 'tut-shape-box', html: shapeSvg(L_SHAPE, 0, '#60a5fa') }),
        el('span', { class: 'tut-shape-box', html: probe })), tag(true, note));
      box.append(row(
        pair(shapeSvg(L_SHAPE, 90, '#fbbf24'), 'SAME: just turned'),
        pair(shapeSvg(mirrorCells(L_SHAPE), 0, '#fbbf24'), 'MIRROR: flipped over')));
    },
    practice: {
      goal: ROTATION_ITEMS.length,
      intro: 'Same shape turned, or a mirror image?',
      start(box, api) {
        const left = el('span', { class: 'tut-shape-box big' });
        const right = el('span', { class: 'tut-shape-box big' });
        const btn = (ans, label, key) => el('button', { class: 'ts-btn sr-btn tut-ts-btn', type: 'button', onclick: () => answer(ans) },
          el('b', { text: label }), el('span', { class: 'ts-key', text: key }));
        box.append(row(left, right), el('div', { class: 'ts-buttons' }, btn('same', 'SAME', 'F'), btn('mirror', 'MIRROR', 'J')));
        let i = 0;
        let locked = false;
        function show() {
          const it = ROTATION_ITEMS[i];
          left.innerHTML = shapeSvg(it.cells, 0, '#60a5fa');
          right.innerHTML = shapeSvg(it.mirror ? mirrorCells(it.cells) : it.cells, it.angle, '#fbbf24');
          locked = false;
        }
        function answer(a) {
          if (locked || api.done) return;
          const it = ROTATION_ITEMS[i];
          const want = it.mirror ? 'mirror' : 'same';
          if (a === want) {
            locked = true;
            i += 1;
            if (!api.right(it.mirror ? 'Right - it is flipped, not just turned.' : `Right - the same shape, turned ${it.angle}°.`)) api.later(show, 1000);
          } else {
            api.wrong(it.mirror
              ? 'It is a <b>mirror</b> image: no turn makes it line up - it is flipped over.'
              : `It is the <b>same</b> shape, turned ${it.angle}°. Turn it back in your head and it lines up.`);
          }
        }
        api.onKey((e) => {
          const k = keyOf(e);
          if (k === 'f' || k === 'ArrowLeft' || k === 's') { e.preventDefault(); answer('same'); }
          if (k === 'j' || k === 'ArrowRight' || k === 'm') { e.preventDefault(); answer('mirror'); }
        });
        show();
      }
    },
    ready: [
      '<b>F</b> for SAME, <b>J</b> for MIRROR, or tap.',
      'Picture turning the right shape back until it matches the left one.',
      'Bigger turns take longer - that is normal, and part of what is measured.'
    ]
  },

  'sequence-recall': {
    goal: 'Digits appear one at a time. Then type them back <b>in the same order</b>.',
    explain: 'You saw 4, then 7, then 2 - so you type <b>4 7 2</b>. Each right answer adds one more digit.',
    learn(box) {
      const card = (d) => el('span', { class: 'tut-digit-card', text: String(d) });
      box.append(col(
        row(card(4), arrow(), card(7), arrow(), card(2)),
        row(...[4, 7, 2].map((d) => el('span', { class: 'sq-slot filled right', text: String(d) })))));
    },
    practice: {
      goal: RECALL_ITEMS.length,
      intro: 'Watch the digits.',
      start(box, api) {
        const digit = el('span', { class: 'tut-digit-card big' });
        const slots = el('div', { class: 'sq-slots tut-sq-slots' });
        const keys = Array.from({ length: 9 }, (_, k) => el('button', { class: 'sq-key', type: 'button', onclick: () => enter(k + 1) }, String(k + 1)));
        const undo = el('button', { class: 'sq-key sq-undo', type: 'button', onclick: () => back() }, 'Undo');
        const pad = el('div', { class: 'sq-pad tut-sq-pad' }, keys, undo);
        box.append(digit, slots, pad);
        let i = 0;
        let typed = [];
        let input = false;
        const paint = () => {
          const seq = RECALL_ITEMS[i];
          slots.replaceChildren(...seq.map((_, k) => el('span', { class: 'sq-slot' + (k < typed.length ? ' filled' : ''), text: k < typed.length ? String(typed[k]) : '' })));
        };
        function play() {
          const seq = RECALL_ITEMS[i];
          input = false;
          typed = [];
          paint();
          pad.classList.add('off');
          api.say(`Watch the ${seq.length} digits...`);
          seq.forEach((d, k) => {
            api.later(() => { digit.textContent = String(d); digit.classList.add('lit'); }, 400 + k * 1000);
            api.later(() => { digit.textContent = ''; digit.classList.remove('lit'); }, 400 + k * 1000 + 750);
          });
          api.later(() => { input = true; digit.textContent = '?'; pad.classList.remove('off'); api.say('Now type them <b>in the same order</b>.'); }, 400 + seq.length * 1000);
        }
        function enter(d) {
          if (!input || api.done) return;
          const seq = RECALL_ITEMS[i];
          typed.push(d);
          paint();
          if (typed.length < seq.length) return;
          input = false;
          if (typed.join('') === seq.join('')) {
            i += 1;
            if (!api.right(`Right - ${seq.join(' ')}.`)) api.later(play, 1100);
          } else {
            api.wrong(`Not quite - it was <b>${seq.join(' ')}</b>. Watch again.`);
            api.later(play, 1800);
          }
        }
        function back() { if (input && typed.length) { typed.pop(); paint(); } }
        api.onKey((e) => {
          const k = Number(e.key);
          if (k >= 1 && k <= 9) { e.preventDefault(); enter(k); }
          if (e.key === 'Backspace') { e.preventDefault(); back(); }
        });
        play();
      }
    },
    ready: [
      'Keys <b>1-9</b> and <b>Backspace</b>, or tap.',
      'Each right answer adds a digit. Two misses in a row end the round.',
      'On Hard, type them <b>backwards</b> - last digit first.'
    ]
  },

  'visual-tracking': {
    goal: 'Remember the <b class="tut-red">red</b> ball. When they all look the same and move, keep your eyes on it.',
    explain: 'The red ball turns white like the others, then they all move. When they stop, pick the one that was red - click it or press its number.',
    learn(box) {
      const ball = (cls, text = '') => el('span', { class: 'tut-ball-demo ' + cls, text });
      box.append(row(
        col(row(ball(''), ball('cue'), ball('')), el('span', { class: 'tut-caption', text: '1. Remember the red one' })), arrow(),
        col(row(ball('', ''), ball('', ''), ball('', '')), el('span', { class: 'tut-caption', text: '2. They turn white and move' })), arrow(),
        col(row(ball('', '1'), ball('pick', '2'), ball('', '3')), el('span', { class: 'tut-caption', text: '3. Pick it' }))));
    },
    practice: {
      goal: 2,
      intro: 'Remember the red one.',
      start(box, api) {
        const SLOTS = [[12, 22], [40, 16], [70, 24], [88, 62], [60, 78], [30, 72], [14, 56], [50, 48]];
        const ROUNDS = [
          { start: [0, 2, 4, 6], target: 1, moves: [[5, 7, 1, 3], [2, 0, 6, 4], [7, 5, 3, 1]], ms: 1100 },
          { start: [1, 3, 5, 7], target: 2, moves: [[6, 4, 2, 0], [3, 7, 1, 5], [0, 2, 6, 4], [5, 1, 7, 3]], ms: 900 }
        ];
        const field = el('div', { class: 'tut-vt' });
        const balls = [0, 1, 2, 3].map((b) => el('button', { class: 'tut-ball', type: 'button', 'aria-label': 'ball ' + (b + 1), onclick: () => pick(b) }));
        field.append(...balls);
        box.append(field);
        let r = 0;
        let answering = false;
        const place = (slots, ms) => balls.forEach((b, k) => {
          b.style.transitionDuration = ms + 'ms';
          b.style.left = SLOTS[slots[k]][0] + '%';
          b.style.top = SLOTS[slots[k]][1] + '%';
        });
        function play() {
          const round = ROUNDS[r];
          answering = false;
          field.classList.remove('answering');
          balls.forEach((b) => { b.className = 'tut-ball'; b.textContent = ''; });
          place(round.start, 0);
          balls[round.target].classList.add('cue');
          api.say('Remember the <b class="tut-red">red</b> one...');
          api.later(() => { balls[round.target].classList.remove('cue'); api.say('Keep your eyes on it...'); }, 1600);
          round.moves.forEach((m, k) => api.later(() => place(m, round.ms), 2000 + k * round.ms));
          api.later(() => {
            answering = true;
            field.classList.add('answering');
            balls.forEach((b, k) => { b.textContent = String(k + 1); });
            api.say('Which one was red? Click it or press its number.');
          }, 2000 + round.moves.length * round.ms + 150);
        }
        function pick(b) {
          if (!answering || api.done) return;
          answering = false;
          const round = ROUNDS[r];
          if (b === round.target) {
            balls[b].classList.add('hit');
            r += 1;
            if (!api.right('Right - you followed it.')) api.later(play, 1300);
          } else {
            balls[b].classList.add('miss');
            balls[round.target].classList.add('reveal');
            api.wrong(`It was number <b>${round.target + 1}</b>. Follow it with your eyes the whole time - watch again.`);
            api.later(play, 2200);
          }
        }
        api.onKey((e) => { const k = Number(e.key); if (k >= 1 && k <= 4) { e.preventDefault(); pick(k - 1); } });
        play();
      }
    },
    ready: [
      'Click the ball, or press its number.',
      'Two right in a row and they move faster; a miss slows them down.',
      'Look at the ball itself, not at the spaces between them.'
    ]
  },

  'attention-storm': {
    goal: 'Shapes flash one at a time. Press <b>only</b> for the solid <b>five-point star</b>.',
    explain: 'Look-alikes try to catch you out - a six-point star, an outline star, an upside-down star. For those, and everything else, do nothing.',
    learn(box) {
      box.append(row(
        col(shapeTile(TARGET, 'is-target big'), tag(true, 'Press')),
        col(shapeTile('star6'), tag(false, 'Six points')),
        col(shapeTile('star5-outline'), tag(false, 'Outline')),
        col(shapeTile('star5-inverted'), tag(false, 'Upside down')),
        col(shapeTile('circle'), tag(false, 'Not a star'))));
    },
    practice: {
      goal: STORM_STREAM.filter((s) => s === TARGET).length,
      intro: 'Press Space (or tap the card) only for the star.',
      start(box, api) {
        const shape = el('div', { class: 'as-shape tut-as-shape' });
        const cardEl = el('button', { class: 'as-card tut-as-card', type: 'button', 'aria-label': 'Press for the star', onclick: () => respond() }, shape);
        const startBtn = el('button', { class: 'btn primary', type: 'button', onclick: () => run() }, 'Start the shapes');
        box.append(cardEl, startBtn);
        let k = -1;
        let open = false;
        let pressed = false;
        let running = false;
        function run() {
          if (running || api.done) return;
          running = true;
          startBtn.hidden = true;
          api.say('Press only for the star.');
          STORM_STREAM.forEach((s, idx) => {
            api.later(() => {
              k = idx; open = true; pressed = false;
              shape.innerHTML = shapeMarkup(s);
              cardEl.classList.remove('hit', 'fa');
            }, 300 + idx * 1500);
            api.later(() => { shape.innerHTML = ''; }, 300 + idx * 1500 + 1100);
            api.later(() => {
              open = false;
              if (s === TARGET && !pressed) api.wrong('That was the star - press for it.');
            }, 300 + idx * 1500 + 1450);
          });
          api.later(() => {
            running = false;
            if (!api.done) { startBtn.hidden = false; startBtn.textContent = 'Go again'; api.say('Almost - catch every star.'); }
          }, 300 + STORM_STREAM.length * 1500);
        }
        function respond() {
          if (!open || pressed || api.done) return;
          pressed = true;
          const s = STORM_STREAM[k];
          if (s === TARGET) { cardEl.classList.add('hit'); api.right('Star - got it.'); }
          else {
            cardEl.classList.add('fa');
            api.wrong(LOOK_ALIKE[s] ? `That is ${LOOK_ALIKE[s]} - hold back.` : 'Not a star - hold back.');
          }
        }
        api.onKey((e) => {
          if (e.code === 'Space' || keyOf(e) === 'j') { e.preventDefault(); if (running) respond(); else run(); }
        });
      }
    },
    ready: [
      '<b>Space</b> or <b>J</b>, or tap the shape - only for the solid five-point star.',
      'Three blocks; the pace speeds up after a clean block.',
      'Missing a star and pressing for a look-alike both count against you.'
    ]
  },

  'path-finder': {
    goal: 'Walk from the <b class="tut-green">green dot</b> to the <b class="tut-gold">flag</b> in as few steps as possible.',
    explain: 'Every step counts - even steps back. Plan the whole route first. Here the way left looks open but is a dead end; the shortest route takes <b>8 steps</b>.',
    learn(box) {
      const best = cheapestRoute(MAZE, [0, 0], [4, 4]);
      const onRoute = new Set(best.path.map(([r, c]) => r + ',' + c));
      box.append(col(mazeNode((r, c, ch, cell) => {
        if (onRoute.has(r + ',' + c) && ch !== 'S' && ch !== 'F') cell.classList.add('trail');
      }), tag(true, `Shortest route: ${best.steps} steps`)));
    },
    practice: {
      goal: 1,
      intro: 'Plan first, then move with the arrow keys or by clicking the next square.',
      start(box, api) {
        const best = cheapestRoute(MAZE, [0, 0], [4, 4]).steps;
        let here = [0, 0];
        let steps = 0;
        let locked = false;
        const cells = {};
        const counter = el('span', { class: 'tut-caption', text: 'Steps: 0' });
        const maze = mazeNode((r, c, ch, cell) => {
          cells[r + ',' + c] = cell;
          cell.addEventListener('click', () => step(r, c));
        }, true);
        box.append(maze, counter);
        const paint = () => {
          Object.values(cells).forEach((c) => c.classList.remove('here'));
          cells[here.join(',')].classList.add('here');
          counter.textContent = `Steps: ${steps}`;
        };
        function reset() {
          here = [0, 0]; steps = 0; locked = false;
          Object.values(cells).forEach((c) => c.classList.remove('trail'));
          paint();
        }
        function step(r, c) {
          if (locked || api.done) return;
          if (Math.abs(r - here[0]) + Math.abs(c - here[1]) !== 1) return;
          if (r < 0 || c < 0 || r > 4 || c > 4) return;
          const cell = cells[r + ',' + c];
          if (MAZE[r][c] === '#') { cell.classList.remove('bump'); void cell.offsetWidth; cell.classList.add('bump'); return; }
          cells[here.join(',')].classList.add('trail');
          here = [r, c];
          steps += 1;
          paint();
          if (MAZE[r][c] === 'F') {
            locked = true;
            if (steps === best) api.right(`Perfect - ${steps} steps, the shortest route.`);
            else { api.wrong(`You took ${steps} steps; the shortest is ${best}. Plan the route first, then try again.`); api.later(reset, 2000); }
          }
        }
        api.onKey((e) => {
          const k = keyOf(e);
          const d = { ArrowUp: [-1, 0], w: [-1, 0], ArrowDown: [1, 0], s: [1, 0], ArrowLeft: [0, -1], a: [0, -1], ArrowRight: [0, 1], d: [0, 1] }[k];
          if (d) { e.preventDefault(); step(here[0] + d[0], here[1] + d[1]); }
        });
        reset();
      }
    },
    ready: [
      'Arrow keys or <b>WASD</b>, or click the next square.',
      'A perfect route moves you up to a bigger maze; an unsolved one moves you down.',
      'On Hard, mud squares cost 2 steps - the straight line is often a trap.'
    ]
  }
};

/** The practice maze, with a hook to decorate each square. */
function mazeNode(decorate, clickable = false) {
  const cells = [];
  MAZE.forEach((line, r) => [...line].forEach((ch, c) => {
    const cls = 'pf-cell' + (ch === '#' ? ' wall' : ch === 'F' ? ' goal' : '');
    const cell = el(clickable ? 'button' : 'span', { class: cls, ...(clickable ? { type: 'button', 'aria-label': `row ${r + 1}, column ${c + 1}` } : {}) },
      ch === 'F' ? '⚑' : '');
    if (ch === 'S') cell.classList.add(clickable ? 'start' : 'here');
    decorate(r, c, ch, cell);
    cells.push(cell);
  }));
  return el('div', { class: 'pf-grid tut-pf', style: { gridTemplateColumns: 'repeat(5,1fr)' } }, cells);
}
