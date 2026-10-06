// Verifies the token file. Run with `npm run check` from packages/ui-components.
//
//   1. Contrast: every text/surface pairing the system allows meets WCAG AA
//      (4.5:1 text, 3:1 control borders, focus rings and status marks), in
//      the light and the dark theme.
//   2. Status colours step in lightness as well as hue, so they survive
//      greyscale.
//   3. Every token is shown on the reference page.
//
// No dependencies: it reads tokens.css as text.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const css = readFileSync(here('../src/tokens/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const reference = readFileSync(here('../src/tokens/reference.html'), 'utf8');

const block = (selector) => {
  const start = css.indexOf(selector + ' {');
  if (start < 0) throw new Error(`No "${selector}" block in tokens.css`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
  return Object.fromEntries(
    [...body.matchAll(/(--se-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
};
const light = block(':root');
const dark = { ...light, ...block(":root[data-theme='dark']") };

const resolve = (theme, name) => {
  let value = theme[name];
  if (value === undefined) throw new Error(`Unknown token ${name}`);
  for (let i = 0; i < 8 && value.startsWith('var('); i++) value = theme[value.slice(4, -1).trim()];
  return value;
};
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const lightness = (hex) => 116 * Math.cbrt(luminance(hex)) - 16; // CIE L*

const SURFACES = ['bg', 'surface', 'surface-sunken', 'surface-hover'];
const STATUSES = ['warning', 'success', 'info', 'danger']; // lightest to darkest
const pairs = []; // [foreground, background, minimum ratio]
for (const s of SURFACES) {
  for (const t of ['text', 'text-muted', 'text-subtle', 'accent-text']) pairs.push([t, s, 4.5]);
  pairs.push(['border-strong', s, 3], ['focus', s, 3]);
}
for (const fill of ['accent', 'accent-hover', 'accent-active']) pairs.push(['on-accent', fill, 4.5]);
pairs.push(['accent-text', 'accent-subtle', 4.5], ['text', 'accent-subtle', 4.5]);
for (const s of STATUSES) {
  pairs.push([`${s}-text`, `${s}-bg`, 4.5], [`${s}-text`, 'surface', 4.5], [`${s}-text`, 'bg', 4.5]);
  pairs.push([`${s}-border`, 'surface', 3], [`${s}-border`, `${s}-bg`, 3]);
}

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error('  FAIL ' + msg);
};
for (const [themeName, theme] of [['light', light], ['dark', dark]]) {
  const c = (n) => resolve(theme, `--se-color-${n}`);
  let worst = Infinity;
  for (const [fg, bg, min] of pairs) {
    const ratio = contrast(c(fg), c(bg));
    worst = Math.min(worst, ratio / min);
    if (ratio < min) fail(`${themeName}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
  }
  const steps = STATUSES.map((s) => lightness(c(`${s}-border`)));
  for (let i = 1; i < steps.length; i++) {
    if (steps[i - 1] - steps[i] < 6) {
      fail(`${themeName}: ${STATUSES[i - 1]} and ${STATUSES[i]} marks are only ${(steps[i - 1] - steps[i]).toFixed(1)} L* apart (need 6)`);
    }
  }
  console.log(
    `${themeName}: ${pairs.length} pairings checked; status marks at L* ${steps.map((s) => s.toFixed(0)).join(' / ')}`,
  );
}

const names = [...new Set([...css.matchAll(/(--se-[\w-]+)\s*:/g)].map((m) => m[1]))];
const missing = names.filter((n) => !new RegExp(n + '(?![\\w-])').test(reference));
if (missing.length) fail(`reference.html does not show: ${missing.join(', ')}`);
console.log(`${names.length} tokens; ${names.length - missing.length} shown on the reference page`);

if (failures) {
  console.error(`\n${failures} problem(s).`);
  process.exit(1);
}
console.log('\nAll token checks pass.');
