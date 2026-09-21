/* WebAudio blips - no asset files. Everything runs through one master gain node,
   so the volume slider and the mute button take effect immediately, mid-game. */

import { get, set } from './storage.js';

const DEFAULT_VOLUME = 0.6;

let ctx = null;
let master = null;
let enabled = true;
let volume = DEFAULT_VOLUME;

function applyGain() {
  if (master) master.gain.value = enabled ? volume : 0;
}

function ensureCtx() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.connect(ctx.destination);
    applyGain();
  }
  // browsers suspend the context until a gesture, and again when a tab sleeps
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export async function initAudio() {
  enabled = await get('soundOn', true);
  volume = await get('soundVolume', DEFAULT_VOLUME);
  applyGain();
  return { enabled, volume };
}

export const isEnabled = () => enabled;
export const getVolume = () => volume;

export async function toggleAudio() {
  enabled = !enabled;
  if (enabled) ensureCtx();
  applyGain();
  await set('soundOn', enabled);
  return enabled;
}

/** Slider handler. Dragging above zero un-mutes, which is what people expect. */
export async function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (volume > 0 && !enabled) {
    enabled = true;
    await set('soundOn', true);
  }
  ensureCtx();
  applyGain();
  await set('soundVolume', volume);
  return { enabled, volume };
}

function tone(freq, duration, type = 'sine', gain = 0.3, delay = 0) {
  if (!enabled || volume <= 0) return;
  try {
    if (!ensureCtx()) return;
    const at = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(gain, at + 0.012);   // tiny attack, no click
    amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(amp).connect(master);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  } catch { /* audio is a nicety, never a blocker */ }
}

/* Pentatonic scale so any sequence of tiles sounds consonant. */
const SCALE = [392, 440, 494, 587, 659, 784, 880, 988, 1175];
export const note = (i) => tone(SCALE[Math.abs(i) % SCALE.length], 0.22, 'triangle', 0.3);

export const sfx = {
  /** `step` climbs the scale with a streak, so a run of hits sounds like a rising riff. */
  correct(step = 0) {
    const i = Math.min(SCALE.length - 2, Math.max(0, step));
    tone(SCALE[i], 0.09, 'triangle', 0.32);
    tone(SCALE[i + 1], 0.13, 'triangle', 0.28, 0.06);
  },
  wrong() {
    tone(190, 0.18, 'sawtooth', 0.22);
    tone(120, 0.26, 'sawtooth', 0.2, 0.05);
  },
  tick() { tone(520, 0.05, 'square', 0.16); },
  start() { tone(523, 0.1, 'triangle', 0.3); tone(784, 0.18, 'triangle', 0.3, 0.1); },
  finish() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.3, i * 0.11));
  }
};
