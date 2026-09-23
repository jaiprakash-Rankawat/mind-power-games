import { GAMES } from './core/games.js';
import { getProfile, clearAll } from './core/storage.js';
import { buildMindProfile, abilityFor, TYPICAL } from './core/profile.js';
import { getCurrentSession, listSessions, officialOrder, testMinutes } from './core/session.js';
import { dailyState, dailyOrder, dailyMinutes, untilNextCheck } from './core/daily.js';
import { levelBar } from './core/level-ui.js';
import { noteFirstOpen, track } from './core/analytics.js';
import { meter } from './core/charts.js';
import { el } from './core/util.js';
import { iconSvg } from './core/icons.js';
import { wireThemeToggle } from './core/theme-toggle.js';

noteFirstOpen();
wireThemeToggle(document.getElementById('themeBtn'));

function openPage(path) {
  const url = chrome.runtime.getURL(path);
  if (chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url });
  else window.open(url, '_blank');
  window.close();
}

async function openGame(id) {
  await track('practice_started', { game_id: id, start_time: new Date().toISOString() });
  openPage(`game.html?game=${encodeURIComponent(id)}`);
}

/* ------------------------------------------------- daily check (primary) */

async function renderDailyCard() {
  const card = document.getElementById('dailyCard');
  const st = await dailyState();
  const n = dailyOrder().length;

  let cta;
  let line;
  if (st.current) {
    cta = `Resume · game ${st.current.index + 1} of ${n}`;
    line = st.current.counted ? "Today's check is in progress" : 'Practice run in progress';
  } else if (st.doneToday) {
    cta = `✓ Done today · ${st.today.score ?? '—'} / 100`;
    line = `New check in ${untilNextCheck()}`;
  } else {
    cta = st.history.length ? "Start today's check →" : 'Take your first check →';
    line = st.lastScore === null ? 'Five games that set your Brain Level' : `Beat your last score: ${st.lastScore}`;
  }

  card.replaceChildren(
    el('span', { class: 'tc-top' },
      el('span', { class: 'tc-label', text: 'Daily Brain Check' }),
      el('span', { class: 'tc-meta', text: `${n} games · about ${dailyMinutes()} min` })),
    el('span', { class: 'tc-cta', text: cta }),
    el('span', { class: 'tc-latest', text: line }),
    levelBar(st.level, { compact: true })
  );
  card.onclick = () => openPage('daily.html');
}

/* ----------------------------------------------- brain test (secondary) */

async function renderTestCard() {
  const card = document.getElementById('testCard');
  const current = await getCurrentSession();
  const done = (await listSessions()).filter((s) => s.status === 'completed');
  const latest = done[done.length - 1];

  const meta = `${officialOrder().length} games · about ${testMinutes()} min` +
    (latest && latest.overall !== null ? ` · latest ${latest.overall}` : '');

  card.replaceChildren(
    el('span', { class: 'tc-main' },
      el('span', { class: 'tc-label', text: 'Full Brain Test' }),
      el('span', { class: 'tc-meta', text: meta })),
    el('span', { class: 'tc-go', text: current ? `Resume ${current.index + 1}/${current.order.length} →` : 'Start →' })
  );
  card.onclick = () => openPage('test.html');
}

/* ------------------------------------------------ performance score card */

function renderBrainCard(p) {
  const card = document.getElementById('brainCard');

  const status =
    p.brain === null ? 'Play any game to get your first score' :
    p.complete ? `All ${p.total} abilities measured` :
    p.coverage < p.total ? `Provisional · ${p.coverage} of ${p.total} abilities scored` :
    'Provisional · play each game 3 times for a stable score';

  let delta = null;
  if (p.weekDelta !== null) {
    delta = el('span', {
      class: 'delta ' + (p.weekDelta > 0 ? 'up' : p.weekDelta < 0 ? 'down' : ''),
      text: p.weekDelta === 0 ? 'no change this week'
        : (p.weekDelta > 0 ? '▲ ' : '▼ ') + Math.abs(p.weekDelta) + ' this week'
    });
  }

  card.replaceChildren(
    el('span', { class: 'bc-top' },
      el('span', { class: 'bc-label', text: 'Performance Score' }),
      delta
    ),
    el('span', { class: 'bc-row' },
      el('span', { class: 'bc-figure', text: p.brain === null ? '—' : String(p.brain) }),
      el('span', { class: 'bc-side' },
        el('span', { class: 'bc-status', text: status }),
        el('span', { class: 'bc-link', text: 'View full profile →' })))
  );
  card.onclick = () => openPage('profile.html');
}

/* ------------------------------------------------------------ game tiles */

function gameCard(game, profile) {
  const ab = abilityFor(game.id);
  const stats = ab && profile.abilities.find((a) => a.id === ab.id);
  const scored = stats && stats.score !== null;

  return el('button', { class: 'game-card', type: 'button', title: game.tagline, onclick: () => openGame(game.id) },
    el('span', { class: 'gc-row' },
      el('span', { class: 'gc-icon', 'aria-hidden': 'true', html: iconSvg(game.id) }),
      el('span', { class: 'gc-title', text: game.name })),
    el('span', { class: 'gc-row2' },
      el('span', { class: 'gc-ability',
        text: ab ? ab.name + (scored && stats.provisional ? ' · provisional' : '') : game.skills }),
      el('span', { class: 'gc-score', text: scored ? String(stats.score) : '—' })),
    meter(scored ? stats.score : null, TYPICAL)
  );
}

/* ----------------------------------------------------------------- render */

async function render() {
  const [profile, totals] = await Promise.all([buildMindProfile(), getProfile()]);

  await Promise.all([renderDailyCard(), renderTestCard()]);
  renderBrainCard(profile);

  document.getElementById('gameList').replaceChildren(
    ...GAMES.filter((g) => !g.locked).map((g) => gameCard(g, profile))
  );

  // Set stagger index for entrance animation
  document.querySelectorAll('.game-card').forEach((card, i) => card.style.setProperty('--i', i));

  document.getElementById('footStats').textContent =
    `${totals.rounds} round${totals.rounds === 1 ? '' : 's'} · ${totals.dayStreak}-day streak`;
}

/* Two-step confirm: window.confirm() is unreliable inside an extension popup,
   where the dialog can dismiss the popup itself. */
const resetBtn = document.getElementById('resetBtn');
let resetArmed = null;

resetBtn.addEventListener('click', async () => {
  if (!resetArmed) {
    resetBtn.textContent = 'Tap again to erase';
    resetBtn.classList.add('danger');
    resetArmed = setTimeout(() => {
      resetArmed = null;
      resetBtn.textContent = 'Reset progress';
      resetBtn.classList.remove('danger');
    }, 3000);
    return;
  }
  clearTimeout(resetArmed);
  resetArmed = null;
  resetBtn.textContent = 'Reset progress';
  resetBtn.classList.remove('danger');
  await clearAll();
  render();
});

render();
