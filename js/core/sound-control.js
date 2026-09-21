/* Mute button + volume slider + M shortcut, for pages other than the practice
   game shell (which keeps its own, unchanged copy of this wiring). */

import { initAudio, toggleAudio, setVolume, isEnabled, getVolume } from './audio.js';

const SPEAKER = '♫';
const MUTED = '✕';

export function wireSoundControl(button, slider) {
  function paint() {
    const on = isEnabled() && getVolume() > 0;
    if (button) {
      button.textContent = on ? SPEAKER : MUTED;
      button.classList.toggle('muted', !on);
      button.title = (on ? 'Mute' : 'Unmute') + ' (M)';
    }
    if (slider) slider.value = Math.round(getVolume() * 100);
  }

  initAudio().then(paint).catch(() => {});

  if (button) {
    button.addEventListener('click', async () => {
      await toggleAudio();
      paint();
      button.blur();
    });
  }
  if (slider) {
    slider.addEventListener('input', async () => {
      await setVolume(Number(slider.value) / 100);
      paint();
    });
    slider.addEventListener('change', () => slider.blur());
  }
  document.addEventListener('keydown', async (e) => {
    if ((e.key !== 'm' && e.key !== 'M') || e.target === slider) return;
    await toggleAudio();
    paint();
  });
}
