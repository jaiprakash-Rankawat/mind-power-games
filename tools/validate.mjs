/* Pre-flight check for "Load unpacked".
   Catches the things that actually stop a Manifest V3 extension from loading:
   a bad manifest, missing or malformed icons, broken asset paths, and CSP
   violations (inline scripts, inline handlers, eval).

   Run:  node tools/validate.mjs
*/

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const warnings = [];
const checks = [];

const ok = (msg) => checks.push(msg);
const fail = (msg) => problems.push(msg);
const warn = (msg) => warnings.push(msg);
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/* ---------------------------------------------------------------- manifest */

let manifest;
try {
  manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  ok('manifest.json is valid JSON');
} catch (e) {
  fail(`manifest.json does not parse: ${e.message}`);
  report();
}

if (manifest.manifest_version !== 3) fail(`manifest_version must be 3 (found ${manifest.manifest_version})`);
else ok('manifest_version is 3');

for (const key of ['name', 'version', 'description']) {
  if (!manifest[key]) fail(`manifest is missing "${key}"`);
}
if (manifest.name && manifest.name.length > 45) fail(`name is ${manifest.name.length} chars (Web Store limit is 45)`);
if (manifest.description && manifest.description.length > 132) {
  fail(`description is ${manifest.description.length} chars (Web Store limit is 132)`);
}
if (manifest.version && !/^\d+(\.\d+){0,3}$/.test(manifest.version)) {
  fail(`version "${manifest.version}" must be 1-4 dot-separated integers`);
}
if (manifest.name) ok(`name/description/version within Web Store limits`);

/* ------------------------------------------------------------------ icons */

function pngSize(file) {
  const buf = readFileSync(file);
  const isPng = buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47;
  if (!isPng) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const iconSets = [
  ['icons', manifest.icons],
  ['action.default_icon', manifest.action && manifest.action.default_icon]
];
for (const [label, set] of iconSets) {
  if (!set) { warn(`no ${label} declared`); continue; }
  const iconsBefore = problems.length;
  for (const [size, path] of Object.entries(set)) {
    const full = join(ROOT, path);
    if (!existsSync(full)) { fail(`${label}["${size}"] -> missing file ${path}`); continue; }
    const dim = pngSize(full);
    if (!dim) fail(`${label}["${size}"] -> ${path} is not a valid PNG`);
    else if (dim.w !== Number(size) || dim.h !== Number(size)) {
      fail(`${label}["${size}"] -> ${path} is ${dim.w}x${dim.h}, expected ${size}x${size}`);
    }
  }
  if (problems.length === iconsBefore) ok(`${label}: all icons present, square and correctly sized`);
}

/* ------------------------------------------- html: assets + CSP violations */

const htmlFiles = walk(ROOT).filter((f) => f.endsWith('.html'));
if (!htmlFiles.length) fail('no HTML pages found');
const htmlBefore = problems.length;

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const base = dirname(file);

  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc=/i.test(m[1]) && m[2].trim()) {
      fail(`${rel(file)}: inline <script> is blocked by the extension CSP`);
    }
  }
  for (const m of html.matchAll(/\son[a-z]+\s*=\s*["']/gi)) {
    fail(`${rel(file)}: inline "${m[0].trim()}" handler is blocked by the extension CSP`);
  }

  for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const ref = m[1];
    if (/^(https?:|data:|#|mailto:)/i.test(ref)) {
      warn(`${rel(file)}: remote reference ${ref} (remote code is not allowed in MV3)`);
      continue;
    }
    const target = join(base, ref.split(/[?#]/)[0]);
    if (!existsSync(target)) fail(`${rel(file)}: references missing file ${ref}`);
  }
}
if (problems.length === htmlBefore) ok(`${htmlFiles.length} HTML page(s): no inline scripts or handlers, all assets resolve`);

/* --------------------------------------------- js: CSP + import resolution */

const jsFiles = walk(ROOT).filter((f) => f.endsWith('.js') && !f.includes(`${'tools'}`));
const jsBefore = problems.length;
for (const file of jsFiles) {
  const src = readFileSync(file, 'utf8');
  if (/\beval\s*\(/.test(src)) fail(`${rel(file)}: eval() is blocked by the extension CSP`);
  if (/new\s+Function\s*\(/.test(src)) fail(`${rel(file)}: new Function() is blocked by the extension CSP`);
  if (/\bdocument\.write\s*\(/.test(src)) fail(`${rel(file)}: document.write() is not allowed`);

  for (const m of src.matchAll(/(?:^|\s)(?:import|export)[\s\S]{0,200}?from\s+["'](\.[^"']+)["']/g)) {
    const target = join(dirname(file), m[1]);
    if (!existsSync(target)) fail(`${rel(file)}: import target not found: ${m[1]}`);
  }
}
if (problems.length === jsBefore) ok(`${jsFiles.length} JS module(s): no eval/new Function, all static imports resolve`);

/* ------------------------------------------ game registry -> module files */

const registry = readFileSync(join(ROOT, 'js', 'core', 'games.js'), 'utf8');
const blocks = registry.split(/\bid:\s*'/).slice(1);   // one chunk per registry entry
const regBefore = problems.length;
let unlocked = 0;
for (const block of blocks) {
  const id = (block.match(/^([^']+)'/) || [])[1];
  const mod = (block.match(/module:\s*'([^']+)'/) || [])[1];
  if (!id || /locked:\s*true/.test(block)) continue;
  unlocked += 1;
  if (!mod) { fail(`registry: game "${id}" is unlocked but declares no module`); continue; }
  const target = join(ROOT, 'js', 'games', mod);
  if (!existsSync(target)) fail(`registry: game "${id}" -> missing js/games/${mod}`);
}
if (!unlocked) fail('registry: no unlocked games - the hub would be empty');
if (problems.length === regBefore) ok(`registry: ${unlocked} unlocked game(s), each resolving to a module file`);

/* ----------------------------------------------------------------- report */

function report() {
  const line = '-'.repeat(58);
  console.log(`\n${line}\n Mind Power Games - extension pre-flight\n${line}`);
  for (const c of checks) console.log(`  PASS  ${c}`);
  for (const w of warnings) console.log(`  NOTE  ${w}`);
  for (const p of problems) console.log(`  FAIL  ${p}`);
  console.log(line);
  if (problems.length) {
    console.log(` ${problems.length} problem(s) would stop this loading in Chrome.\n`);
    process.exit(1);
  }
  console.log(' Ready to load unpacked at chrome://extensions\n');
}

report();
