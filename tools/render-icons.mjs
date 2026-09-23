/* Renders the toolbar icons (icons/icon{16,32,48,128}.png) from the logo SVGs,
   using headless Chrome: each SVG is drawn onto a canvas at the exact size.

     node tools/render-icons.mjs            (set CHROME=<path> if Chrome is elsewhere)

   16 and 32 px use logo-small.svg (thicker lines, no folds); 48 and 128 use logo.svg.
   Only needed after changing a logo SVG - the PNGs are committed. */

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [[16, 'logo-small.svg'], [32, 'logo-small.svg'], [48, 'logo.svg'], [128, 'logo.svg']];

const chrome = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].find((p) => p && existsSync(p));
if (!chrome) { console.error('Chrome not found - set CHROME to its path.'); process.exit(1); }

// the SVG gets the target size as its own width/height, so it rasterises sharp
const jobs = SIZES.map(([size, file]) => {
  const svg = readFileSync(join(ROOT, 'icons', file), 'utf8')
    .replace('<svg ', `<svg width="${size}" height="${size}" `);
  return { size, src: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') };
});

const page = `<!doctype html><pre id="out"></pre><script>
const jobs = ${JSON.stringify(jobs)};
Promise.all(jobs.map((j) => new Promise((done) => {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = c.height = j.size;
    c.getContext('2d').drawImage(img, 0, 0, j.size, j.size);
    done(j.size + ' ' + c.toDataURL('image/png'));
  };
  img.src = j.src;
}))).then((lines) => { document.getElementById('out').textContent = lines.join('\\n'); });
</script>`;

const dir = mkdtempSync(join(tmpdir(), 'mpg-icons-'));
const html = join(dir, 'render.html');
writeFileSync(html, page);
let dom;
try {
  dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--virtual-time-budget=3000', '--dump-dom', pathToFileURL(html).href],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

let written = 0;
for (const [, size, b64] of dom.matchAll(/(\d+) data:image\/png;base64,([A-Za-z0-9+/=]+)/g)) {
  writeFileSync(join(ROOT, 'icons', `icon${size}.png`), Buffer.from(b64, 'base64'));
  console.log(`icons/icon${size}.png`);
  written += 1;
}
if (written !== SIZES.length) { console.error(`expected ${SIZES.length} icons, rendered ${written}`); process.exit(1); }
