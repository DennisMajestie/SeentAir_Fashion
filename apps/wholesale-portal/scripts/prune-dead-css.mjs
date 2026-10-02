/**
 * Remove top-level SCSS rule blocks whose selectors reference only class names
 * that no template uses any more.
 *
 * Three things this must never get wrong:
 *  1. SweetAlert2 builds its own DOM at runtime, so `.swal2-*` and the Brand
 *     Alert `.ba-*` skin never appear in a template. They are allowlisted.
 *  2. `[class.foo]` bindings name a class that `class="..."` never shows up in,
 *     so they are parsed too.
 *  3. Only top-level, brace-balanced blocks are touched, so a nested `@media`
 *     body or a shared selector is never removed.
 *
 * Safe to re-run: iterates to a fixpoint and refuses any block whose selector
 * also names a class that is still live.
 *
 * Dry run by default. This rewrites styles.scss in place, so it will not touch
 * the file unless you pass --write. Review the diff it prints first.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('../src/app/', import.meta.url));
const cssPath = new URL('../src/styles.scss', import.meta.url);

/** Styles.scss is only rewritten when --write is passed. */
const apply = process.argv.includes('--write');

/** Every .ts and .html under src/app, plus index.html. */
function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (/\.(ts|html)$/.test(entry)) out.push(full);
  }
  return out;
}
const sources = [...collect(appDir), new URL('../src/index.html', import.meta.url)];
const templates = sources
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n');

/**
 * Class names that exist at runtime but never appear in a template.
 * SweetAlert2 renders its own popup DOM; the Brand Alert service themes it.
 */
const RUNTIME_ONLY = [
  /^swal2-/,
  /^swal-/,
  /^ba-/,
  /^toast/,
  // Loading shimmer primitive; no template references it yet but it is a
  // design-system building block, not legacy card CSS.
  /^skeleton$/,
];

const liveClasses = new Set();
const add = (name) => {
  if (name && /^[a-zA-Z][\w-]*$/.test(name)) liveClasses.add(name);
};

// static class attributes
for (const m of templates.matchAll(/class="([^"]*)"/g)) {
  for (const token of m[1].split(/\s+/)) add(token.replace(/\{\{.*?\}\}/g, '').replace(/\[.*?\]/g, '').trim());
}
// [class.foo] and [class.foo]="expr" bindings
for (const m of templates.matchAll(/\[class\.([\w-]+)\]/g)) add(m[1]);
// [ngClass]="{ foo: cond }" keys
for (const m of templates.matchAll(/\[ngClass\][\s\S]{0,400}?\}"/g)) {
  for (const k of m[0].matchAll(/([\w-]+)\s*:/g)) add(k[1]);
}

const isRuntimeOnly = (name) => RUNTIME_ONLY.some((re) => re.test(name));

const source = readFileSync(cssPath, 'utf8');
let lines = source.split('\n');

const selectors = (header) =>
  header
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const classNamesIn = (sel) => [...sel.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);

let removed = 0;
let pass = 0;

for (;;) {
  pass++;
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\S/.test(line)) continue; // top level only
    if (!line.trim().endsWith('{')) continue;
    if (line.trim().startsWith('//')) continue;

    const header = line.trim().slice(0, -1).trim();
    if (header.startsWith('@') || header.includes('&')) continue;

    const sels = selectors(header);
    if (sels.length === 0) continue;

    const names = [...new Set(sels.flatMap(classNamesIn))];
    if (names.length === 0) continue;
    if (names.some((n) => liveClasses.has(n) || isRuntimeOnly(n))) continue;

    let depth = 0;
    let end = -1;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      if (depth === 0) {
        end = j;
        break;
      }
    }
    if (end === -1) continue;

    let dropEnd = end;
    if (dropEnd + 1 < lines.length && lines[dropEnd + 1].trim() === '') dropEnd++;

    lines = [...lines.slice(0, i), ...lines.slice(dropEnd + 1)];
    removed++;
    changed = true;
    console.log(`  removed .${names.join(', .')}  (line ${i + 1})`);
    break;
  }

  if (!changed) break;
  if (pass > 400) throw new Error('did not converge');
}

if (removed === 0) {
  console.log('\nNothing to prune.');
} else if (apply) {
  writeFileSync(cssPath, lines.join('\n'));
} else {
  console.log('\nDRY RUN: nothing written. Re-run with --write to apply.');
}
console.log(`${removed} rule blocks would be removed in ${pass} passes`);
console.log(`${lines.length} lines would remain (was ${source.split('\n').length})`);
console.log(`live classes tracked: ${liveClasses.size}`);