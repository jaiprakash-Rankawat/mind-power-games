/* Single source of truth for the hub, the practice shell and the Brain Test.
   Adding a game = drop a module in js/games/ and add an entry here.

   Registry order is the Brain Test order. `official` holds the fixed settings a
   game is played at in the Brain Test; practice lets the player choose. */

import { el } from './util.js';
import { shapeMarkup } from '../games/logic/attention-storm-logic.js';

export const GAMES = [
  {
    id: 'stroop',
    name: 'Color Clash',
    icon: '🎨',
    tagline: 'The word says one color, the ink says another. Trust the ink.',
    skills: 'Focus · Impulse control',
    module: 'stroop.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Attention',
    official: { difficulty: 'medium' },
    minutes: 1,
    instruction: 'Tap the colour of the ink - not the colour the word names.',
    keys: 'Keys 1-6, or tap the colour',
    tutorial: [
      {
        title: 'Read the word, see the ink',
        text: 'A color word appears — but it\'s printed in a <b>different</b> ink color. Your brain reads the word automatically. Fight that reflex.',
        buildDemo(box) {
          const word = el('div', { class: 'tut-stroop-word', text: 'GREEN', style: { color: '#fb7185' } });
          box.append(el('div', { style: { textAlign: 'center' } }, word));
          const colors = [['BLUE', '#34d399'], ['RED', '#60a5fa'], ['GREEN', '#fb7185']];
          let i = 0;
          const iv = setInterval(() => { i = (i + 1) % colors.length; word.textContent = colors[i][0]; word.style.color = colors[i][1]; }, 1800);
          return () => clearInterval(iv);
        }
      },
      {
        title: 'Tap the INK color',
        text: 'Ignore what the word <b>says</b>. Tap the color the word is <b>printed in</b>. The word below says GREEN but the ink is <b>red</b> — so tap red.',
        buildDemo(box) {
          const word = el('div', { class: 'tut-stroop-word', text: 'GREEN', style: { color: '#fb7185' } });
          const chips = el('div', { class: 'tut-stroop-chips' },
            el('div', { class: 'tut-stroop-chip', style: { background: '#60a5fa' } }),
            el('div', { class: 'tut-stroop-chip pulse', style: { background: '#fb7185', boxShadow: '0 0 20px rgba(251,113,133,.5)' } }),
            el('div', { class: 'tut-stroop-chip', style: { background: '#34d399' } })
          );
          box.append(el('div', { style: { textAlign: 'center' } }, word, chips));
        }
      },
      {
        title: 'Build your combo',
        text: 'Every <b>4 correct</b> in a row raises your multiplier from 1× up to <b>3×</b>. Faster answers score more. One mistake resets the streak.',
        buildDemo(box) {
          const streak = el('b', { text: '0', style: { fontSize: '32px', color: 'var(--brand-2)' } });
          const mult = el('span', { text: '×1', style: { fontSize: '20px', fontWeight: '800', color: 'var(--brand)', marginLeft: '14px' } });
          box.append(el('div', { style: { textAlign: 'center' } }, el('div', { text: 'STREAK', style: { fontSize: '10px', letterSpacing: '1.5px', color: 'var(--muted)', marginBottom: '6px' } }), streak, mult));
          let s = 0;
          const iv = setInterval(() => { s = s >= 8 ? 0 : s + 1; streak.textContent = s; mult.textContent = s >= 8 ? '×3' : s >= 4 ? '×2' : '×1'; }, 600);
          return () => clearInterval(iv);
        }
      }
    ]
  },
  {
    id: 'memory-grid',
    name: 'Memory Grid',
    icon: '🧩',
    tagline: 'Recall a flashing path that grows one tile at a time.',
    skills: 'Working memory',
    module: 'memory-grid.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Visual Memory',
    official: { difficulty: 'easy' },
    minutes: 1.5,
    instruction: 'Watch the tiles light up, then tap them in the same order. The path grows each level.',
    keys: 'Tap or click the tiles',
    tutorial: [
      {
        title: 'Watch the path',
        text: 'Tiles light up <b>one at a time</b> in a sequence. Watch carefully and remember the <b>order</b>, not just the positions.',
        buildDemo(box) {
          const tiles = Array.from({ length: 9 }, (_, i) => el('div', { class: 'tut-tile' }));
          const grid = el('div', { class: 'tut-grid' }, tiles);
          box.append(grid);
          const path = [0, 1, 4, 7, 6];
          let step = 0;
          const iv = setInterval(() => {
            tiles.forEach(t => t.classList.remove('lit'));
            tiles[path[step]].classList.add('lit');
            step = (step + 1) % path.length;
          }, 700);
          return () => clearInterval(iv);
        }
      },
      {
        title: 'Tap them back in order',
        text: 'After the sequence plays, tap the tiles in the <b>same order</b> they lit up. Get it right and you move on.',
        buildDemo(box) {
          const tiles = Array.from({ length: 9 }, (_, i) => el('div', { class: 'tut-tile' }));
          const grid = el('div', { class: 'tut-grid' }, tiles);
          const label = el('div', { text: 'Your turn — tap the path', style: { fontSize: '12px', color: 'var(--muted)', marginTop: '10px', textAlign: 'center', letterSpacing: '.5px' } });
          box.append(el('div', {}, grid, label));
          const path = [0, 1, 4];
          let step = 0;
          const iv = setInterval(() => {
            if (step > 0) tiles[path[step - 1]].classList.remove('lit');
            if (step < path.length) { tiles[path[step]].classList.add('lit'); tiles[path[step]].style.background = 'linear-gradient(160deg,#34d399,#0ea5e9)'; }
            step = step >= path.length ? (tiles.forEach(t => { t.classList.remove('lit'); t.style.background = ''; }), 0) : step + 1;
          }, 800);
          return () => clearInterval(iv);
        }
      },
      {
        title: 'The path grows each level',
        text: 'Each time you clear a level, the sequence gets <b>one tile longer</b>. You have <b>3 lives</b>. Your score is the longest path you replayed perfectly.',
        buildDemo(box) {
          const lenEl = el('b', { text: '2', style: { fontSize: '42px', color: 'var(--brand-2)' } });
          box.append(el('div', { style: { textAlign: 'center' } },
            el('div', { text: 'PATH LENGTH', style: { fontSize: '10px', letterSpacing: '1.5px', color: 'var(--muted)', marginBottom: '6px' } }),
            lenEl,
            el('div', { text: '●●●', style: { letterSpacing: '4px', fontSize: '17px', marginTop: '10px', color: 'var(--good)' } })
          ));
          let len = 2;
          const iv = setInterval(() => { len = len >= 7 ? 2 : len + 1; lenEl.textContent = len; }, 900);
          return () => clearInterval(iv);
        }
      }
    ]
  },
  {
    id: 'n-back',
    name: 'N-Back',
    icon: '🔁',
    tagline: 'Flag the item that matches the one N steps back. N adapts to you.',
    skills: 'Working memory · Updating',
    module: 'n-back.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Working Memory',
    official: { difficulty: 'easy', blocks: 3 },
    minutes: 3,
    instruction: 'Press MATCH when the square is where it was 2 steps earlier. The level adapts as you go.',
    keys: 'Space or tap MATCH',
    tutorial: [
      {
        title: 'Squares appear one at a time',
        text: 'A square lights up on a 3×3 grid, then moves to a new position. Keep track of <b>where it was</b>.',
        buildDemo(box) {
          const tiles = Array.from({ length: 9 }, () => el('div', { class: 'tut-tile', style: { width: '28px', height: '28px' } }));
          const grid = el('div', { class: 'tut-grid tut-nb-grid' }, tiles);
          box.append(grid);
          const positions = [0, 4, 8, 2, 4];
          let step = 0;
          const iv = setInterval(() => {
            tiles.forEach(t => t.classList.remove('lit'));
            tiles[positions[step]].classList.add('lit');
            step = (step + 1) % positions.length;
          }, 1200);
          return () => clearInterval(iv);
        }
      },
      {
        title: 'Match the one from N steps ago',
        text: 'At <b>2-back</b>, compare each square with where it was <b>2 steps earlier</b>. If it matches, press <b>MATCH</b>.',
        buildDemo(box) {
          const label = el('div', { class: 'tut-nb-label', text: 'Step 3: same as Step 1?' });
          const matchBtn = el('div', { class: 'tut-nb-match', text: 'MATCH ✓' });
          box.append(el('div', { style: { textAlign: 'center' } },
            el('div', { text: '2-BACK', style: { fontSize: '22px', fontWeight: '900', color: 'var(--brand)', marginBottom: '8px' } }),
            label, matchBtn
          ));
          const labels = ['Step 1 → center', 'Step 2 → corner', 'Step 3 → center = MATCH!'];
          let i = 0;
          const iv = setInterval(() => { i = (i + 1) % labels.length; label.textContent = labels[i]; }, 1500);
          return () => clearInterval(iv);
        }
      },
      {
        title: 'The level adapts to you',
        text: 'A clean block moves you <b>up</b> (2-back → 3-back). Too many errors moves you <b>down</b>. The test finds <b>your level</b>.',
        buildDemo(box) {
          const nEl = el('b', { text: '2', style: { fontSize: '42px', color: 'var(--brand)' } });
          const verdict = el('div', { text: 'Clean block — moving up', style: { fontSize: '12px', color: 'var(--good)', marginTop: '8px' } });
          box.append(el('div', { style: { textAlign: 'center' } },
            el('div', { text: 'N-LEVEL', style: { fontSize: '10px', letterSpacing: '1.5px', color: 'var(--muted)', marginBottom: '6px' } }),
            nEl, el('span', { text: '-back', style: { fontSize: '18px', color: 'var(--muted)', marginLeft: '4px' } }), verdict
          ));
          const sequence = [{ n: '2', msg: 'Clean block — moving up', c: 'var(--good)' }, { n: '3', msg: 'Holding this level', c: 'var(--muted)' }, { n: '3', msg: 'Too many errors — easing off', c: 'var(--bad)' }, { n: '2', msg: 'Clean block — moving up', c: 'var(--good)' }];
          let i = 0;
          const iv = setInterval(() => { i = (i + 1) % sequence.length; nEl.textContent = sequence[i].n; verdict.textContent = sequence[i].msg; verdict.style.color = sequence[i].c; }, 1800);
          return () => clearInterval(iv);
        }
      }
    ]
  },
  {
    id: 'reaction',
    name: 'Reaction Speed',
    icon: '⚡',
    tagline: 'Hit the light the instant it appears - then pick the right side, fast.',
    skills: 'Processing speed',
    module: 'reaction.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Processing Speed',
    official: { difficulty: 'medium' },
    minutes: 1.5,
    instruction: 'Press the moment the light appears. Then press the side it lights up on.',
    keys: 'Space, then F / J - or tap',
    tutorial: [
      {
        title: 'Wait for the light',
        text: 'A circle sits dark. When it turns <b>green</b> and says <b>NOW!</b> — react as fast as you can.',
        buildDemo(box) {
          const circle = el('div', { class: 'tut-rx-circle', text: 'WAIT' });
          box.append(el('div', { style: { textAlign: 'center' } }, circle));
          let on = false;
          const iv = setInterval(() => {
            on = !on;
            circle.classList.toggle('go', on);
            circle.textContent = on ? 'NOW!' : 'WAIT';
          }, 1800);
          return () => clearInterval(iv);
        }
      },
      {
        title: 'Hit it fast!',
        text: 'Press <b>Space</b> or tap the moment it lights up. Your result is the <b>median</b> time, so one slow reaction won\'t ruin it.',
        buildDemo(box) {
          const ms = el('div', { class: 'tut-rx-ms show', text: '247 ms' });
          box.append(el('div', { style: { textAlign: 'center' } },
            el('div', { text: 'YOUR TIME', style: { fontSize: '10px', letterSpacing: '1.5px', color: 'var(--muted)', marginBottom: '6px' } }), ms
          ));
          const times = ['312 ms', '247 ms', '198 ms', '284 ms'];
          let i = 0;
          const iv = setInterval(() => { i = (i + 1) % times.length; ms.textContent = times[i]; }, 1200);
          return () => clearInterval(iv);
        }
      },
      {
        title: 'Part 2: pick the right side',
        text: 'After simple reactions, slots appear. Press <b>F</b> for left or <b>J</b> for right — or tap the one that lights up.',
        buildDemo(box) {
          const left = el('div', { class: 'tut-tile', style: { width: '60px', height: '60px', borderRadius: '16px', display: 'inline-block' } });
          const right = el('div', { class: 'tut-tile', style: { width: '60px', height: '60px', borderRadius: '16px', display: 'inline-block' } });
          box.append(el('div', { style: { display: 'flex', gap: '18px', justifyContent: 'center', alignItems: 'center' } },
            el('div', { style: { textAlign: 'center' } }, left, el('div', { text: 'F', style: { fontSize: '11px', fontWeight: '800', marginTop: '6px', color: 'var(--muted)' } })),
            el('div', { style: { textAlign: 'center' } }, right, el('div', { text: 'J', style: { fontSize: '11px', fontWeight: '800', marginTop: '6px', color: 'var(--muted)' } }))
          ));
          let side = 0;
          const iv = setInterval(() => {
            left.classList.toggle('lit', side === 0);
            right.classList.toggle('lit', side === 1);
            side = 1 - side;
          }, 1500);
          return () => clearInterval(iv);
        }
      }
    ]
  },
  {
    id: 'task-switch',
    name: 'Task Switch',
    icon: '🔄',
    tagline: 'Odd or even? Low or high? The question keeps changing - keep up.',
    skills: 'Cognitive flexibility',
    module: 'task-switch.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Cognitive Flexibility',
    official: { difficulty: 'medium' },
    minutes: 1.5,
    instruction: 'Answer the question on each card: ODD or EVEN, or LOW or HIGH. The question changes.',
    keys: 'F = odd / low, J = even / high - or tap',
    tutorial: [
      {
        title: 'Two questions, one number',
        text: 'Each card shows a number. The question asks either <b>ODD or EVEN?</b> or <b>LOW or HIGH?</b> (below or above 5).',
        buildDemo(box) {
          const cue = el('div', { class: 'tut-ts-cue', text: 'ODD or EVEN?', style: { background: '#a789ff' } });
          const digit = el('div', { class: 'tut-ts-digit', text: '7' });
          const card = el('div', { class: 'tut-ts-card' }, digit);
          box.append(el('div', { style: { textAlign: 'center' } }, cue, card));
        }
      },
      {
        title: 'The question changes',
        text: 'Watch the banner above the card — it switches between <b style="color:#a789ff">ODD/EVEN</b> and <b style="color:#37dcf2">LOW/HIGH</b>. Read the question <b>first</b>, then the number.',
        buildDemo(box) {
          const cue = el('div', { class: 'tut-ts-cue', text: 'ODD or EVEN?', style: { background: '#a789ff' } });
          const digit = el('div', { class: 'tut-ts-digit', text: '3' });
          const card = el('div', { class: 'tut-ts-card' }, digit);
          box.append(el('div', { style: { textAlign: 'center' } }, cue, card));
          const rules = [{ q: 'ODD or EVEN?', c: '#a789ff', d: '3' }, { q: 'LOW or HIGH?', c: '#37dcf2', d: '8' }, { q: 'ODD or EVEN?', c: '#a789ff', d: '6' }];
          let i = 0;
          const iv = setInterval(() => { i = (i + 1) % rules.length; cue.textContent = rules[i].q; cue.style.background = rules[i].c; digit.textContent = rules[i].d; }, 2000);
          return () => clearInterval(iv);
        }
      },
      {
        title: 'Left or right',
        text: 'Press <b>F</b> (left) for <b>ODD / LOW</b>, or <b>J</b> (right) for <b>EVEN / HIGH</b>. Your key stat is <b>switch cost</b> — how much a rule change slows you.',
        buildDemo(box) {
          const left = el('div', { style: { padding: '10px 20px', borderRadius: '12px', background: 'var(--card-hi)', border: '1px solid var(--line)', textAlign: 'center' } },
            el('div', { style: { fontSize: '14px', fontWeight: '700' } }, el('span', { text: 'ODD', style: { marginRight: '6px' } }), el('span', { text: '·', style: { color: 'var(--muted)' } }), el('span', { text: ' LOW' })),
            el('div', { text: 'F', style: { fontSize: '10px', color: 'var(--muted)', marginTop: '4px', fontWeight: '800' } })
          );
          const right = el('div', { style: { padding: '10px 20px', borderRadius: '12px', background: 'var(--card-hi)', border: '1px solid var(--line)', textAlign: 'center' } },
            el('div', { style: { fontSize: '14px', fontWeight: '700' } }, el('span', { text: 'EVEN', style: { marginRight: '6px' } }), el('span', { text: '·', style: { color: 'var(--muted)' } }), el('span', { text: ' HIGH' })),
            el('div', { text: 'J', style: { fontSize: '10px', color: 'var(--muted)', marginTop: '4px', fontWeight: '800' } })
          );
          box.append(el('div', { style: { display: 'flex', gap: '14px', justifyContent: 'center' } }, left, right));
        }
      }
    ]
  },
  {
    id: 'number-pattern',
    name: 'Number Pattern',
    icon: '🔢',
    tagline: 'Six numbers, one hidden rule. What comes next?',
    skills: 'Reasoning',
    module: 'number-pattern.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Fluid Reasoning',
    official: { difficulty: 'medium' },
    minutes: 2,
    instruction: 'Six numbers follow one rule. Pick the number that comes next. Patterns get harder as you get them right.',
    keys: 'Keys 1-4, or tap an answer',
    tutorial: [
      {
        title: 'Find the hidden rule',
        text: 'Six numbers follow a <b>mathematical rule</b>. Look at the gaps between them to spot the pattern.',
        buildDemo(box) {
          const nums = [2, 4, 8, 16, 32, 64];
          const row = el('div', { class: 'tut-np-row' });
          nums.forEach((n, i) => {
            row.append(el('div', { class: 'tut-np-num', text: String(n) }));
            if (i < nums.length - 1) row.append(el('span', { class: 'tut-np-arrow', text: '×2' }));
          });
          box.append(row);
        }
      },
      {
        title: 'Pick what comes next',
        text: 'Choose the <b>next number</b> from four options. Only <b>one</b> answer fits the rule. Press keys <b>1–4</b> or tap.',
        buildDemo(box) {
          const row = el('div', { class: 'tut-np-row' },
            ...[2, 4, 8, 16, 32].map(n => el('div', { class: 'tut-np-num', text: String(n) })),
            el('div', { class: 'tut-np-num q', text: '?' })
          );
          box.append(el('div', {}, row,
            el('div', { style: { textAlign: 'center', marginTop: '12px', fontSize: '14px', fontWeight: '700', color: 'var(--good)' }, text: '→ 64' })
          ));
        }
      },
      {
        title: 'Patterns get harder',
        text: 'Two right in a row → harder rules. Miss one → easier. The test finds your <b>ceiling</b>. Rules include additions, multiplications, alternating patterns, and more.',
        buildDemo(box) {
          const lvl = el('b', { text: '1', style: { fontSize: '42px', color: '#fbbf24' } });
          box.append(el('div', { style: { textAlign: 'center' } },
            el('div', { text: 'LEVEL', style: { fontSize: '10px', letterSpacing: '1.5px', color: 'var(--muted)', marginBottom: '6px' } }),
            lvl
          ));
          let l = 1;
          const iv = setInterval(() => { l = l >= 5 ? 1 : l + 1; lvl.textContent = l; }, 800);
          return () => clearInterval(iv);
        }
      }
    ]
  },
  {
    id: 'spatial-rotation',
    name: 'Spatial Rotation',
    icon: '🧊',
    tagline: 'Same shape turned around - or its mirror image?',
    skills: 'Spatial reasoning',
    module: 'spatial-rotation.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Visuospatial Reasoning',
    official: { difficulty: 'medium' },
    minutes: 1.5,
    instruction: 'Is the right shape the left one turned around, or its mirror image? Accuracy first, then speed.',
    keys: 'F = same, J = mirror - or tap',
    tutorial: [
      {
        title: 'Two shapes side by side',
        text: 'You see a <b>reference shape</b> on the left and a <b>rotated shape</b> on the right. They\'re made of connected squares.',
        buildDemo(box) {
          const lShape = '<svg viewBox="0 0 60 60"><rect x="10" y="10" width="15" height="15" rx="3" fill="#a789ff"/><rect x="10" y="25" width="15" height="15" rx="3" fill="#a789ff"/><rect x="10" y="40" width="15" height="15" rx="3" fill="#a789ff"/><rect x="25" y="40" width="15" height="15" rx="3" fill="#a789ff"/></svg>';
          const rShape = '<svg viewBox="0 0 60 60" class="tut-sr-rotate"><rect x="10" y="10" width="15" height="15" rx="3" fill="#f472b6"/><rect x="10" y="25" width="15" height="15" rx="3" fill="#f472b6"/><rect x="10" y="40" width="15" height="15" rx="3" fill="#f472b6"/><rect x="25" y="40" width="15" height="15" rx="3" fill="#f472b6"/></svg>';
          const left = el('div', { class: 'tut-sr-shape', html: lShape });
          const right = el('div', { class: 'tut-sr-shape', html: rShape });
          box.append(el('div', { class: 'tut-sr-pair' }, left, el('span', { class: 'tut-sr-vs', text: 'vs' }), right));
        }
      },
      {
        title: 'Same or mirror?',
        text: 'The right shape is either the <b>same shape turned</b> (rotated), or its <b>mirror image</b> (flipped then rotated). Decide which.',
        buildDemo(box) {
          box.append(el('div', { style: { display: 'flex', gap: '24px', justifyContent: 'center', alignItems: 'center' } },
            el('div', { style: { textAlign: 'center' } },
              el('div', { text: '🔄', style: { fontSize: '32px' } }),
              el('div', { text: 'SAME', style: { fontSize: '12px', fontWeight: '800', color: 'var(--good)', marginTop: '6px', letterSpacing: '1px' } }),
              el('div', { text: 'Rotated only', style: { fontSize: '11px', color: 'var(--muted)', marginTop: '2px' } })
            ),
            el('div', { style: { textAlign: 'center' } },
              el('div', { text: '🪞', style: { fontSize: '32px' } }),
              el('div', { text: 'MIRROR', style: { fontSize: '12px', fontWeight: '800', color: 'var(--bad)', marginTop: '6px', letterSpacing: '1px' } }),
              el('div', { text: 'Flipped + rotated', style: { fontSize: '11px', color: 'var(--muted)', marginTop: '2px' } })
            )
          ));
        }
      },
      {
        title: 'Press SAME or MIRROR',
        text: 'Press <b>F</b> for SAME, <b>J</b> for MIRROR — or tap. Accuracy counts first, then speed. Bigger turns take longer — that\'s normal.',
        buildDemo(box) {
          const left = el('div', { style: { padding: '12px 22px', borderRadius: '14px', background: 'rgba(52,211,153,.15)', border: '2px solid var(--good)', textAlign: 'center' } },
            el('b', { text: 'SAME', style: { fontSize: '15px', letterSpacing: '1.5px' } }),
            el('div', { text: 'F', style: { fontSize: '10px', color: 'var(--muted)', marginTop: '4px', fontWeight: '800' } })
          );
          const right = el('div', { style: { padding: '12px 22px', borderRadius: '14px', background: 'rgba(251,113,133,.15)', border: '2px solid var(--bad)', textAlign: 'center' } },
            el('b', { text: 'MIRROR', style: { fontSize: '15px', letterSpacing: '1.5px' } }),
            el('div', { text: 'J', style: { fontSize: '10px', color: 'var(--muted)', marginTop: '4px', fontWeight: '800' } })
          );
          box.append(el('div', { style: { display: 'flex', gap: '14px', justifyContent: 'center' } }, left, right));
        }
      }
    ]
  },
  {
    id: 'sequence-recall',
    name: 'Sequence Recall',
    icon: '🧮',
    tagline: 'Digits flash one by one. Type them back in the same order.',
    skills: 'Working memory · Order',
    module: 'sequence-recall.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Sequence Memory',
    minutes: 1.5,
    instruction: 'Watch the digits appear one at a time, then type them back in the same order. Each correct answer adds a digit.',
    keys: 'Keys 1-9, Backspace to undo - or tap',
    tutorial: [
      {
        title: 'Watch the digits',
        text: 'Digits appear <b>one at a time</b>, then vanish. Remember them <b>in order</b>.',
        buildDemo(box) {
          const digit = el('div', { class: 'tut-ts-digit', text: '' });
          box.append(el('div', { style: { textAlign: 'center' } }, el('div', { class: 'tut-ts-card' }, digit)));
          const frames = ['7', '', '2', '', '9', '', '4', '', '', ''];
          let i = 0;
          const iv = setInterval(() => { digit.textContent = frames[i]; i = (i + 1) % frames.length; }, 450);
          return () => clearInterval(iv);
        }
      },
      {
        title: 'Type them back',
        text: 'When the last one is gone, type the sequence with keys <b>1-9</b> or the keypad. <b>Backspace</b> fixes a slip.',
        buildDemo(box) {
          const answer = ['7', '2', '9', '4'];
          const slots = answer.map(() => el('div', { class: 'tut-np-num', text: '' }));
          box.append(el('div', { class: 'tut-np-row' }, slots));
          let n = 0;
          const iv = setInterval(() => {
            n = n >= answer.length + 2 ? 0 : n + 1;
            slots.forEach((s, j) => { s.textContent = j < n ? answer[j] : ''; });
          }, 600);
          return () => clearInterval(iv);
        }
      },
      {
        title: 'The sequence grows',
        text: 'Each correct answer adds <b>one digit</b>. Miss twice in a row and the round ends. Your result is your <b>span</b> - the longest sequence you got perfectly. On Hard, type it <b>backwards</b>.',
        buildDemo(box) {
          const lenEl = el('b', { text: '3', style: { fontSize: '42px', color: 'var(--brand-2)' } });
          box.append(el('div', { style: { textAlign: 'center' } },
            el('div', { text: 'SEQUENCE LENGTH', style: { fontSize: '10px', letterSpacing: '1.5px', color: 'var(--muted)', marginBottom: '6px' } }),
            lenEl));
          let len = 3;
          const iv = setInterval(() => { len = len >= 8 ? 3 : len + 1; lenEl.textContent = len; }, 900);
          return () => clearInterval(iv);
        }
      }
    ]
  },
  {
    id: 'visual-tracking',
    name: 'Visual Tracking',
    icon: '👀',
    tagline: 'One turns red, then they all look alike and move. Keep your eyes on it.',
    skills: 'Visual attention · Tracking',
    module: 'visual-tracking.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Visual Tracking',
    minutes: 1.5,
    instruction: 'Follow the red object with your eyes while they all move, then pick it out when they stop.',
    keys: 'Click the object, or press its number',
    tutorial: [
      {
        title: 'Spot the red one',
        text: 'Several objects appear. One is <b>red</b> - that is your target.',
        buildDemo(box) {
          const dots = [0, 1, 2, 3].map((i) => el('span', { class: 'vt-demo-dot' + (i === 1 ? ' cue' : '') }));
          box.append(el('div', { class: 'vt-demo' }, dots));
        }
      },
      {
        title: 'They all look the same - and move',
        text: 'The red fades, every object looks <b>identical</b>, and they start moving. Follow the target with your eyes.',
        buildDemo(box) {
          const dots = [0, 1, 2, 3].map((i) => el('span', { class: 'vt-demo-dot' + (i === 1 ? ' cue' : '') }));
          box.append(el('div', { class: 'vt-demo' }, dots));
          let on = true;
          const iv = setInterval(() => { on = !on; dots[1].classList.toggle('cue', on); }, 1200);
          return () => clearInterval(iv);
        }
      },
      {
        title: 'Pick it out',
        text: 'When they stop, each gets a <b>number</b>. Click the one you followed or press its number. Two right in a row and the next round is <b>faster</b>.',
        buildDemo(box) {
          box.append(el('div', { class: 'vt-demo' },
            ['1', '2', '3', '4'].map((n) => el('span', { class: 'vt-demo-dot', text: n }))));
        }
      }
    ]
  },
  {
    id: 'attention-storm',
    name: 'Attention Storm',
    icon: '🌪️',
    tagline: 'Shapes flash past. Catch every star - and ignore the look-alikes.',
    skills: 'Sustained attention · Holding back',
    module: 'attention-storm.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Sustained Attention',
    minutes: 2,
    instruction: 'Shapes flash one at a time. Press only for the five-point star - not for the shapes that look like it.',
    keys: 'Space or tap for the star',
    tutorial: [
      {
        title: 'Shapes flash by',
        text: 'One shape at a time appears and disappears - a <b>fast stream</b> that keeps going.',
        buildDemo(box) {
          const card = el('div', { class: 'as-demo-shape big' });
          box.append(card);
          const seq = ['circle', 'triangle', 'star5', 'square', 'diamond', 'hexagon'];
          let i = 0;
          const iv = setInterval(() => {
            card.innerHTML = i % 2 ? '' : shapeMarkup(seq[(i / 2) % seq.length]);
            i = (i + 1) % (seq.length * 2);
          }, 450);
          return () => clearInterval(iv);
        }
      },
      {
        title: 'Press only for the star',
        text: 'When the <b>five-point star</b> appears, press <b>Space</b> or tap. Let every other shape pass.',
        buildDemo(box) {
          box.append(el('div', { class: 'as-demo' },
            el('span', { class: 'as-demo-shape big is-target', html: shapeMarkup('star5') }),
            el('span', { class: 'as-key', text: 'SPACE' })));
        }
      },
      {
        title: 'Beware the look-alikes',
        text: 'Some shapes are <b>almost</b> the star. Pressing for them is a <b>false alarm</b>; missing a star counts too. Do well and the stream speeds up.',
        buildDemo(box) {
          box.append(el('div', { class: 'as-demo' },
            ['star5', 'star6', 'star5-outline', 'star5-inverted'].map((sh) => el('span', { class: 'as-demo-col' },
              el('span', { class: 'as-demo-shape' + (sh === 'star5' ? ' is-target' : ''), html: shapeMarkup(sh) }),
              el('b', { class: sh === 'star5' ? 'as-yes' : 'as-no', text: sh === 'star5' ? '✓ press' : '✗ pass' })))));
        }
      }
    ]
  },
  {
    id: 'path-finder',
    name: 'Path Finder',
    icon: '🧭',
    tagline: 'Plan the best route through the maze - every step counts.',
    skills: 'Planning · Spatial problem solving',
    module: 'path-finder.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Planning',
    minutes: 2,
    instruction: 'Walk from the start to the flag in as few steps as possible. Every step counts, so plan the route first.',
    keys: 'Arrow keys or WASD - or click the next square',
    tutorial: [
      {
        title: 'Find the way to the flag',
        text: 'You start on the <b>green</b> square. Walls block the way. Find a route to the <b>flag</b>.',
        buildDemo(box) {
          const map = ['S.#.', '.##.', '...G'];
          box.append(el('div', { class: 'pf-grid pf-mini', style: { gridTemplateColumns: 'repeat(4, 1fr)', width: '128px' } },
            map.join('').split('').map((ch) => el('span', {
              class: 'pf-cell' + (ch === '#' ? ' wall' : '') + (ch === 'S' ? ' here start' : '') + (ch === 'G' ? ' goal' : ''),
              text: ch === 'G' ? '⚑' : ''
            }))));
        }
      },
      {
        title: 'Every step counts',
        text: 'Move one square at a time with the <b>arrow keys</b> or by clicking the next square. Steps back count too - so <b>plan first</b>, then walk.',
        buildDemo(box) {
          const map = ['S.#.', '.##.', '...G'];
          const cells = map.join('').split('').map((ch) => el('span', {
            class: 'pf-cell' + (ch === '#' ? ' wall' : '') + (ch === 'G' ? ' goal' : ''), text: ch === 'G' ? '⚑' : ''
          }));
          box.append(el('div', { class: 'pf-grid pf-mini', style: { gridTemplateColumns: 'repeat(4, 1fr)', width: '128px' } }, cells));
          const route = [0, 4, 8, 9, 10, 11];
          let i = 0;
          const iv = setInterval(() => {
            cells.forEach((c) => c.classList.remove('here', 'trail'));
            route.slice(0, i + 1).forEach((k) => cells[k].classList.add('trail'));
            cells[route[i]].classList.add('here');
            i = (i + 1) % route.length;
          }, 600);
          return () => clearInterval(iv);
        }
      },
      {
        title: 'Better routes, bigger mazes',
        text: 'A <b>perfect</b> route takes you up a level. On Hard, <b>mud</b> costs 2 steps - the shortest way is not always the cheapest.',
        buildDemo(box) {
          const map = ['S~~G', '....'];
          box.append(el('div', { class: 'pf-grid pf-mini', style: { gridTemplateColumns: 'repeat(4, 1fr)', width: '128px' } },
            map.join('').split('').map((ch) => el('span', {
              class: 'pf-cell' + (ch === '~' ? ' mud' : '') + (ch === 'S' ? ' here start' : '') + (ch === 'G' ? ' goal' : ''),
              text: ch === 'G' ? '⚑' : ch === '~' ? '2' : ''
            }))));
        }
      }
    ]
  }
];

export const getGame = (id) => GAMES.find((g) => g.id === id) || null;
