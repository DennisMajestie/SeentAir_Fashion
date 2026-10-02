/**
 * Report every custom property that is *used* but never *defined*.
 *
 * `var(--x)` with no matching declaration is not a build error in SCSS or the
 * Angular compiler. It fails at computed-value time: the declaration using it
 * is invalidated and falls back to the property's initial or inherited value.
 * A background silently becomes transparent; a border-radius silently becomes
 * 0. These are invisible in review and easy to ship.
 */
import { readFileSync } from 'node:fs';

const path = new URL('../src/styles.scss', import.meta.url);
const css = readFileSync(path, 'utf8');

const defined = new Set(
  [...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]),
);
const used = [...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);

const undefinedUses = new Map();
for (const name of used) {
  if (defined.has(name)) continue;
  const count = (undefinedUses.get(name) ?? 0) + 1;
  undefinedUses.set(name, count);
}

if (undefinedUses.size === 0) {
  console.log(`all ${used.length} custom property uses are defined`);
} else {
  console.log(`${undefinedUses.size} UNDEFINED custom properties:\n`);
  for (const [name, count] of [...undefinedUses].sort((a, b) => b[1] - a[1])) {
    const lines = css
      .split('\n')
      .map((l, i) => [l, i + 1])
      .filter(([l]) => l.includes(`var(${name})`))
      .map(([, n]) => n);
    console.log(`  ${name}  x${count}  lines ${lines.join(', ')}`);
  }
}

const dupes = new Map();
for (const m of css.matchAll(/(--[\w-]+)\s*:/g)) {
  dupes.set(m[1], (dupes.get(m[1]) ?? 0) + 1);
}
const redeclared = [...dupes].filter(([, n]) => n > 1);
console.log(
  redeclared.length
    ? `\nre-declared (check for conflicts): ${redeclared.map(([k, n]) => `${k} x${n}`).join(', ')}`
    : '\nno duplicate declarations',
);