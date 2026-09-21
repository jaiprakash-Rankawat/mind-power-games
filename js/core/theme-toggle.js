/* Theme toggle: dark ↔ light, persisted in chrome.storage / localStorage. */

import { get, set } from './storage.js';

const KEY = 'theme';
const DARK = 'dark';
const LIGHT = 'light';
const ICON = { dark: '☀️', light: '🌙' };

function apply(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

/** Call once at page load, before any rendering. Returns the active theme. */
export async function initTheme() {
  const stored = await get(KEY, DARK);
  const theme = stored === LIGHT ? LIGHT : DARK;
  apply(theme);
  return theme;
}

/** Wire a button element: sets its icon and toggles on click. */
export async function wireThemeToggle(btn) {
  if (!btn) return;
  let theme = await initTheme();
  btn.textContent = ICON[theme];
  btn.title = theme === DARK ? 'Switch to light mode' : 'Switch to dark mode';
  btn.setAttribute('aria-label', btn.title);

  btn.addEventListener('click', async () => {
    theme = theme === DARK ? LIGHT : DARK;
    apply(theme);
    await set(KEY, theme);
    btn.textContent = ICON[theme];
    btn.title = theme === DARK ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', btn.title);
    // spring animation
    btn.style.transform = 'scale(1.25) rotate(20deg)';
    setTimeout(() => { btn.style.transform = ''; }, 200);
  });
}
