import { GAMES } from './core/games.js';
import { getProfile, clearAll } from './core/storage.js';
import { buildMindProfile, abilityFor, TYPICAL } from './core/profile.js';
import { getCurrentSession, listSessions, officialOrder, testMinutes } from './core/session.js';
import { noteFirstOpen, track } from './core/analytics.js';
import { meter } from './core/charts.js';
import { el } from './core/util.js';
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

/* ------------------------------------------------------- brain test card */

async function renderTestCard() {
  const card = document.getElementById('testCard');
  const current = await getCurrentSession();
  const done = (await listSessions()).filter((s) => s.status === 'completed');
  const latest = done[done.length - 1];
  const total = officialOrder().length;

  const latestLine = latest
    ? el('span', { class: 'tc-latest', text: `Latest: ${latest.overall ?? '—'} / 100 · ${new Date(latest.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` })
    : el('span', { class: 'tc-latest', text: 'No account needed' });

  card.replaceChildren(
    el('span', { class: 'tc-top' },
      el('span', { class: 'tc-label', text: 'Brain Test' }),
      el('span', { class: 'tc-meta', text: `${total} games · about ${testMinutes()} min` })),
    el('span', { class: 'tc-cta', text: current ? `Resume · game ${current.index + 1} of ${current.order.length}` : 'Start Brain Test →' }),
    latestLine
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
      el('span', { class: 'gc-icon', 'aria-hidden': 'true', text: game.icon }),
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

  await renderTestCard();
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
