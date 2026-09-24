/* Game icons. Each one shows how its game is played, so the icon alone is a hint:
   Color Clash is the word RED printed in blue, Attention Storm is the star among
   other shapes, Path Finder is a route to a flag.

   32x32 SVG strings built from constants (safe to insert as HTML). Lines use
   currentColor, so an icon takes the colour of its container; the few fixed
   colours are part of the hint (the blue word, the red target, the gold star). */

const svg = (body, attrs = '') =>
  `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" ${attrs}>${body}</svg>`;
const line = 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';
const font = 'font-family="Segoe UI,Arial,sans-serif" font-weight="800" text-anchor="middle"';

const ICONS = {
  // the word RED, printed in blue ink, over a red bar
  stroop: svg(
    `<text x="16" y="18.5" font-size="12.5" ${font} fill="#3b82f6">RED</text>` +
    '<rect x="6.5" y="22.5" width="19" height="3.6" rx="1.8" fill="#ef4444"/>'),

  // a 3x3 grid with a path through three lit tiles
  'memory-grid': svg(
    [[4, 4, 0], [12.5, 4, 1], [21, 4, 0], [4, 12.5, 1], [12.5, 12.5, 0], [21, 12.5, 0], [4, 21, 0], [12.5, 21, 0], [21, 21, 1]]
      .map(([x, y, on]) => `<rect x="${x}" y="${y}" width="7" height="7" rx="2"${on ? ' fill="currentColor"' : ''}/>`).join('') +
    '<path d="M16 7.5 7.5 16 24.5 24.5" stroke-dasharray="1.6 2.2"/>',
    'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"'),

  // three squares in a row, the last one matching the first (an arrow back)
  'n-back': svg(
    '<rect x="3" y="17" width="7" height="7" rx="2" fill="currentColor"/>' +
    '<rect x="12.5" y="17" width="7" height="7" rx="2"/>' +
    '<rect x="22" y="17" width="7" height="7" rx="2" fill="currentColor"/>' +
    '<path d="M25.5 13.5C24 5.5 8 5.5 6.5 13"/><path d="M3.8 10.4l2.7 2.9 3.1-2.3"/>', line),

  // a stopwatch with a lightning bolt
  reaction: svg(
    '<circle cx="16" cy="18" r="10.5"/><path d="M13 3.5h6M16 3.5v4"/>' +
    '<path d="M17.8 10.5 12.5 19h4.2l-1.6 6.5 5.4-8.6h-4.3z" fill="currentColor" stroke-width="1.2"/>', line),

  // a digit with arrows turning between two questions
  'task-switch': svg(
    `<text x="16" y="21" font-size="13.5" ${font} fill="currentColor" stroke="none">7</text>` +
    '<path d="M5.5 11.5a11.5 11.5 0 0 1 17.5-5"/><path d="M26.5 20.5a11.5 11.5 0 0 1-17.5 5"/>' +
    '<path d="M23.5 2.5v4.2h-4.2M8.5 29.5v-4.2h4.2"/>', line),

  // rising bars, then a question mark
  'number-pattern': svg(
    '<rect x="2.5" y="20" width="5.5" height="8.5" rx="1.6"/><rect x="10" y="14.5" width="5.5" height="14" rx="1.6"/>' +
    '<rect x="17.5" y="8.5" width="5.5" height="20" rx="1.6"/>' +
    `<text x="27.3" y="20" font-size="14" ${font}>?</text>`, 'fill="currentColor"'),

  // an L shape and a turned copy, with a turning arrow
  'spatial-rotation': svg(
    '<path d="M3 14h4.5v8H12v4.5H3z" fill="currentColor"/>' +
    '<path d="M29 22.5V18h-8v-4.5h-4.5v9z"/>' +
    '<path d="M8.5 9.5a9.5 9.5 0 0 1 15.5.5"/><path d="M24.6 5.4v4.8h-4.8"/>', line),

  // three digits in a row, played back
  'sequence-recall': svg(
    '<rect x="2.5" y="6.5" width="8" height="11.5" rx="2"/><rect x="12" y="6.5" width="8" height="11.5" rx="2"/>' +
    '<rect x="21.5" y="6.5" width="8" height="11.5" rx="2"/>' +
    `<g fill="currentColor" stroke="none" font-size="9" ${font}><text x="6.5" y="15.5">4</text><text x="16" y="15.5">7</text><text x="25.5" y="15.5">2</text></g>` +
    '<path d="M5 24.5h21.5M23.5 21.8l3 2.7-3 2.7"/>', line),

  // look-alike balls, one marked red and ringed
  'visual-tracking': svg(
    '<circle cx="6.5" cy="8.5" r="3.6"/><circle cx="25.5" cy="24" r="3.6"/><circle cx="8" cy="25" r="3.6"/>' +
    '<circle cx="19" cy="13" r="3.8" fill="#ef4444" stroke="#ef4444"/>' +
    '<circle cx="19" cy="13" r="7.6" stroke-dasharray="2.4 2.4"/>', line),

  // the gold five-point star among faded look-alike shapes
  'attention-storm': svg(
    '<path d="M16 5.2l3.1 6.4 7 .9-5.2 4.8 1.4 6.9L16 20.8l-6.3 3.4 1.4-6.9-5.2-4.8 7-.9z" fill="#f5b50b"/>' +
    '<g fill="currentColor" opacity=".45"><circle cx="4.5" cy="5" r="2.2"/><rect x="25.3" y="3" width="4.4" height="4.4" rx="1"/>' +
    '<path d="M3.5 27.5l2.6-4.5 2.6 4.5z"/><circle cx="27.2" cy="27.2" r="2.2"/></g>'),

  // a route through a maze to a flag
  'path-finder': svg(
    '<rect x="3" y="3" width="26" height="26" rx="4.5" opacity=".4"/>' +
    '<path d="M7.5 24.5V18h7v-7h7V8"/><circle cx="7.5" cy="24.5" r="2.2" fill="currentColor"/>' +
    '<path d="M21.5 9V3.8l5.2 2-5.2 2.2" fill="currentColor"/>', line)
};

/** SVG markup for a game's icon ('' for an unknown id). */
export const iconSvg = (gameId) => ICONS[gameId] || '';

export const ICON_IDS = Object.keys(ICONS);
