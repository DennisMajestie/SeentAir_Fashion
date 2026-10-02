/**
 * Report selectors defined more than once in styles.scss.
 *
 * SCSS has no duplicate detection, so a later rule silently wins on the
 * properties they share and quietly loses the rest. That is how a stale
 * `.chip` survived next to the pill version and how a dark-theme override can
 * lose a property the newer rule happens not to set.
 */
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.scss', import.meta.url), 'utf8');

/** Strip comments so commented-out rules do not count. */
const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');

const counts = new Map();
for (const m of clean.matchAll(/^\s*([^{}@/][^{}]*?)\{/gm)) {
  const selector = m[1].trim().replace(/\s+/g, ' ');
  if (!selector || selector.includes('{')) continue;
  const line = clean.slice(0, m.index).split('\n').length;
  const list = counts.get(selector) ?? [];
  list.push(line);
  counts.set(selector, list);
}

const dupes = [...counts].filter(([, lines]) => lines.length > 1);
if (dupes.length === 0) {
  console.log('no duplicate top-level selectors');
} else {
  console.log(`${dupes.length} duplicated selectors:\n`);
  for (const [sel, lines] of dupes.sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${sel}`);
    console.log(`      lines ${lines.join(', ')}`);
  }
}