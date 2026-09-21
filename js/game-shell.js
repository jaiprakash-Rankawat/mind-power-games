import { getGame } from './core/games.js';
import { initAudio, toggleAudio, setVolume, isEnabled, getVolume } from './core/audio.js';
import { el } from './core/util.js';
import { wireThemeToggle } from './core/theme-toggle.js';
import { hasSeenTutorial, showTutorial } from './core/tutorial.js';

const stage = document.getElementById('stage');
const params = new URLSearchParams(location.search);
const game = getGame(params.get('game') || 'stroop');
wireThemeToggle(document.getElementById('themeBtn'));

document.getElementById('backBtn').addEventListener('click', () => {
  if (history.length > 1) history.back();
  else window.close();
});

const soundBtn = document.getElementById('soundBtn');
const volSlider = document.getElementById('volSlider');

const SPEAKER = '♫';        // audible
const MUTED = '✕';          // muted

/* Guarded throughout: this runs at module top level, so one missing control
   must not abort the shell and leave the player with no game at all. */
function paintSound() {
  const on = isEnabled() && getVolume() > 0;
  if (soundBtn) {
    soundBtn.textContent = on ? SPEAKER : MUTED;
    soundBtn.classList.toggle('muted', !on);
    soundBtn.title = (on ? 'Mute' : 'Unmute') + ' (M)';
  }
  if (volSlider) volSlider.value = Math.round(getVolume() * 100);
}

initAudio().then(paintSound).catch(() => {});

if (soundBtn) {
  soundBtn.addEventListener('click', async () => {
    await toggleAudio();
    paintSound();
    soundBtn.blur();        // keep Space bound to the game, not this button
  });
}

if (volSlider) {
  volSlider.addEventListener('input', async () => {
    await setVolume(Number(volSlider.value) / 100);
    paintSound();
  });
  volSlider.addEventListener('change', () => volSlider.blur());
}

// Mute from anywhere, mid-round, without reaching for the mouse.
document.addEventListener('keydown', async (e) => {
  if (e.key !== 'm' && e.key !== 'M') return;
  if (e.target === volSlider) return;
  await toggleAudio();
  paintSound();
});

async function boot() {
  if (!game || game.locked) {
    stage.append(
      el('div', { class: 'panel center' },
        el('h2', { text: 'Game not available yet' }),
        el('p', { class: 'lead', text: 'Pick another game from the extension popup.' }))
    );
    return;
  }

  document.getElementById('gameTitle').textContent = game.name;
  document.getElementById('gameTag').textContent = game.skills;
  document.title = `${game.name} · Mind Power Games`;

  const mod = await import(`./games/${game.module}`);
  
  // Show tutorial on first play
  if (game.tutorial && game.tutorial.length && !(await hasSeenTutorial(game.id))) {
    await showTutorial(document.body, game.id, game.tutorial);
  }

  mod.mount(stage, { game });
}

boot();
