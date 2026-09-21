/* Full profile page: Performance Score, the ability shape, per-ability meters, and the
   trend over time. Every number is printed as text somewhere on the page, so the
   charts summarise rather than gate. */

import { buildMindProfile, TYPICAL } from './core/profile.js';
import { radarChart, lineChart, meter } from './core/charts.js';
import { getCurrentSession, listSessions, testMinutes } from './core/session.js';
import { noteFirstOpen, track } from './core/analytics.js';
import { el } from './core/util.js';
import { wireThemeToggle } from './core/theme-toggle.js';

noteFirstOpen();
wireThemeToggle(document.getElementById('themeBtn'));

const root = document.getElementById('profile');

document.getElementById('backBtn').addEventListener('click', () => {
  if (history.length > 1) history.back();
  else window.close();
});

const play = async (game) => {
  await track('practice_started', { game_id: game, start_time: new Date().toISOString() });
  location.href = 'game.html?game=' + encodeURIComponent(game);
};

const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function deltaText(d) {
  if (d === null) return null;
  if (d === 0) return el('span', { class: 'delta', text: 'No change since last week' });
  return el('span', {
    class: 'delta ' + (d > 0 ? 'up' : 'down'),
    text: (d > 0 ? '▲ ' : '▼ ') + Math.abs(d) + ' since last week'
  });
}

/* ------------------------------------------------------------------- hero */

function hero(p) {
  const someProvisional = p.abilities.some((a) => a.score !== null && a.provisional);
  const status =
    p.brain === null ? 'Play any game to get your first score.' :
    p.complete ? `Based on all ${p.total} abilities, each from at least 3 rounds.` :
    p.coverage < p.total ? `Provisional - ${p.coverage} of ${p.total} abilities scored so far.` :
    someProvisional ? 'Provisional - some abilities have fewer than 3 rounds.' :
    '';

  const copy = el('div', { class: 'hero-copy' },
    el('span', { class: 'hero-label', text: 'Performance Score' }),
    el('div', { class: 'hero-figure', text: p.brain === null ? '—' : String(p.brain) }),
    deltaText(p.weekDelta),
    el('p', { class: 'hero-status', text: status }),
    el('p', { class: 'hero-note', text: 'Scores run from 0 to 100. 50 is a reference midpoint taken from published results for similar tasks, and the shaded ring marks the reference range, 40 to 60. It is not a comparison with other players.' })
  );

  const radar = radarChart({
    axes: p.abilities.map((a) => ({ label: a.name, value: a.score })),
    size: 320,
    typical: TYPICAL
  });
  const allPlayed = p.abilities.every((a) => a.score !== null);

  return el('section', { class: 'panel hero' },
    copy,
    el('div', { class: 'hero-viz' },
      radar,
      allPlayed ? null : el('p', { class: 'viz-caption center', text: 'Play all three games to draw your profile shape.' })
    )
  );
}

/* ------------------------------------------------------------- brain test */

async function brainTests() {
  const current = await getCurrentSession();
  const done = (await listSessions()).filter((s) => s.status === 'completed').reverse();
  const day = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return el('section', { class: 'panel' },
    el('div', { class: 'bt-head' },
      el('div', {},
        el('h2', { text: 'Brain Test' }),
        el('p', { class: 'lead', text: `The official test: all seven games in a fixed order at fixed settings, about ${testMinutes()} minutes. Only official tests can count toward rankings; practice never does.` })),
      el('a', { class: 'btn primary', href: 'test.html' },
        current ? `Resume - game ${current.index + 1} of ${current.order.length}` : 'Take the Brain Test')),
    done.length
      ? el('div', { class: 'bt-list' }, done.map((s) => el('a', { class: 'bt-item', href: 'test.html?session=' + encodeURIComponent(s.id) },
          el('span', { class: 'bt-item-day', text: day(s.completedAt) }),
          el('span', { class: 'bt-item-score' }, el('b', { text: s.overall === null ? '—' : String(s.overall) }), ' / 100'),
          el('span', { class: 'pill' + (s.eligible ? ' ranked' : ''), text: s.eligible ? 'Ranked' : 'Unranked' }),
          el('span', { class: 'bt-item-go', text: 'View →' }))))
      : el('p', { class: 'viz-caption', text: 'No completed Brain Tests yet.' })
  );
}

/* -------------------------------------------------------------- abilities */

function abilityRow(a) {
  const meta = a.score === null
    ? 'Not played yet'
    : `Last round: ${a.lastMetric}  ·  ${a.runs} round${a.runs === 1 ? '' : 's'} scored`;

  return el('div', { class: 'ability' },
    el('span', { class: 'ab-icon', 'aria-hidden': 'true', text: a.icon }),
    el('div', { class: 'ab-main' },
      el('div', { class: 'ab-head' },
        el('b', { class: 'ab-name', text: a.name }),
        a.score !== null && a.provisional ? el('span', { class: 'pill', text: 'Provisional' }) : null,
        el('span', { class: 'ab-score', text: a.score === null ? '—' : String(a.score) })
      ),
      el('p', { class: 'ab-what', text: a.what }),
      meter(a.score, TYPICAL),
      el('div', { class: 'ab-foot' },
        el('span', { class: 'ab-meta', text: meta }),
        el('button', { class: 'btn small', type: 'button', onclick: () => play(a.game) }, 'Play ' + a.gameName)
      )
    )
  );
}

function abilities(p) {
  return el('section', { class: 'panel' },
    el('h2', { text: 'Abilities' }),
    el('p', { class: 'lead', text: 'Each ability is scored from your recent rounds of one game. Provisional means fewer than 3 rounds - keep playing for a stable number.' }),
    el('div', { class: 'ability-list' },
      p.abilities.map(abilityRow),
      p.comingSoon.map((c) => el('div', { class: 'ability soon' },
        el('span', { class: 'ab-icon', 'aria-hidden': 'true', text: '\u{1F512}' }),
        el('div', { class: 'ab-main' },
          el('div', { class: 'ab-head' },
            el('b', { class: 'ab-name', text: c.name }),
            el('span', { class: 'pill', text: 'Coming soon' })
          ),
          el('p', { class: 'ab-what', text: 'Arrives with ' + c.gameName + '.' })
        )
      ))
    )
  );
}

/* ------------------------------------------------------------------ trend */

function tableView(points, name) {
  if (!points.length) return null;
  return el('details', { class: 'table-view' },
    el('summary', { text: 'View as table' }),
    el('table', {},
      el('thead', {}, el('tr', {}, el('th', { text: 'Day' }), el('th', { text: name }))),
      el('tbody', {}, points.slice().reverse().map((pt) =>
        el('tr', {}, el('td', { text: fmtDate(pt.ts) }), el('td', { text: String(pt.value) }))))
    )
  );
}

function trend(p) {
  const options = [{ id: 'brain', name: 'Performance Score' }, ...p.abilities.map((a) => ({ id: a.id, name: a.name }))];
  let current = 'brain';

  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Choose what to plot' });
  const chartSlot = el('div', { class: 'chart-slot' });
  const tableSlot = el('div');

  const series = (id) => p.trend
    .map((t) => ({ ts: t.ts, value: id === 'brain' ? t.brain : t.abilities[id] }))
    .filter((pt) => typeof pt.value === 'number');

  function draw() {
    const opt = options.find((o) => o.id === current);
    const pts = series(current);
    lineChart({ points: pts, into: chartSlot, name: opt.name, typical: TYPICAL });
    tableSlot.replaceChildren(...[tableView(pts, opt.name)].filter(Boolean));
    for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.id === current));
  }

  for (const o of options) {
    const b = el('button', { class: 'seg-btn', type: 'button', 'data-id': o.id }, o.name);
    b.addEventListener('click', () => { current = o.id; draw(); });
    seg.append(b);
  }

  const section = el('section', { class: 'panel' },
    el('h2', { text: 'Progress' }),
    el('p', { class: 'lead', text: 'One point per day you played: your score as it stood at the end of that day.' }),
    seg,
    chartSlot,
    el('p', { class: 'viz-caption', text: 'Shaded band: reference range (40 to 60).' }),
    tableSlot
  );
  // the caller draws once the section is in the page, so the chart can measure its width
  return { section, draw };
}

/* ------------------------------------------------------------------ about */

function about() {
  return el('section', { class: 'panel about' },
    el('h2', { text: 'How scores work' }),
    el('ul', {},
      el('li', { text: 'Each ability is scored 0 to 100 from your last 10 rounds of its game: the middle of your best three. One lucky round will not inflate it, and one bad day will not sink it.' }),
      el('li', { text: '50 is a reference midpoint for each task, set from published results for similar tasks - not from other players. Harder modes earn more credit for the same performance.' }),
      el('li', { text: 'Your Performance Score is the average of the abilities you have played.' }),
      el('li', { text: 'Your raw results are kept, and scores are recalculated from them - nothing is lost if the scoring is improved later.' })
    ),
    el('p', { class: 'honest', text: 'These scores use rough reference points from published research on these tasks. They are good for tracking yourself over time, but they are not a clinical or IQ assessment.' })
  );
}

/* ----------------------------------------------------------------- render */

async function render() {
  const p = await buildMindProfile();
  const progress = trend(p);
  const tests = await brainTests();
  root.replaceChildren(hero(p), tests, abilities(p), progress.section, about());
  progress.draw();
}

render();
