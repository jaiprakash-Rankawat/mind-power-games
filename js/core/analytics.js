/* Product analytics - LOCAL ONLY. Events are appended to chrome.storage.local and
   never leave the device: there is no network code in this extension. They exist
   so a future, consented sync has clean data to send.

   Recorded: event name, time, game id, session id, score, difficulty.
   Never recorded: names, emails, browsing history, page content, or anything
   about the websites the player visits. */

import { get, set } from './storage.js';

const KEY = 'analytics:events';
const CAP = 2000;

export const EVENTS = [
  'extension_installed',   // approximated by first open - there is no background worker
  'brain_test_started',
  'game_started',
  'game_completed',
  'brain_test_completed',
  'brain_test_abandoned',
  'practice_started',
  'practice_completed',
  'game_abandoned',        // practice round quit with Esc (the four newest games)
  'result_shared'
];

// Writes are chained so two quick events on one page can't overwrite each other.
let chain = Promise.resolve();

export function track(event, props = {}) {
  chain = chain.then(async () => {
    const list = await get(KEY, []);
    list.push({ event, at: new Date().toISOString(), ...props });
    while (list.length > CAP) list.shift();
    await set(KEY, list);
  }).catch(() => { /* analytics must never break a game */ });
  return chain;
}

/** Records extension_installed once, the first time any extension page opens. */
export async function noteFirstOpen() {
  if (await get('analytics:firstOpenAt', null)) return;
  await set('analytics:firstOpenAt', new Date().toISOString());
  await track('extension_installed', { via: 'first_open' });
}

export const getEvents = () => get(KEY, []);
