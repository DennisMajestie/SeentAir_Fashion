/**
 * Run a hoisted-or-nested workspace CLI without relying on npm putting the
 * binary on PATH (npm versions differ across Node majors, and so does where
 * they install devDependencies). Resolves the CLI via Node's own module
 * resolution, which walks up from this file to wherever npm placed it.
 *
 * Usage:
 *   node scripts/run-cli.js [--register PACKAGE] ENTRY [args...]
 *
 *   --register PACKAGE  node -r flag value for the child (e.g. ts-node/register)
 *   ENTRY               package subpath of the CLI, e.g. @nestjs/cli/bin/nest.js
 */
'use strict';

const { spawnSync } = require('node:child_process');

const argv = process.argv.slice(2);
const preloads = [];
let entry = null;

while (argv.length && !entry) {
  const arg = argv.shift();
  if (arg === '--register') preloads.push(argv.shift());
  else entry = arg;
}
const rest = argv;

if (!entry) {
  console.error('usage: node run-cli.js [--register PACKAGE] ENTRY [args...]');
  process.exit(2);
}

function pathExists(full) {
  const fs = require('node:fs');
  try {
    fs.realpathSync(full);
    return true;
  } catch {
    return false;
  }
}

function showDiagnostics(pkg) {
  const path = require('node:path');
  const parts = pkg.split('/');
  const scoped = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  console.error(`failed to resolve ${pkg} — searched:`);
  for (const dir of module.paths) {
    const pkgPath = path.join(dir, scoped);
    const full = path.join(dir, ...parts);
    const state = pathExists(full) ? 'PRESENT' : pathExists(pkgPath) ? 'pkg-dir-present' : 'absent';
    console.error(`  ${dir} -> ${state}`);
  }
}

function resolve(pkg) {
  try {
    return require.resolve(pkg);
  } catch {
    try {
      return require.resolve(pkg, { paths: [process.cwd()] });
    } catch {
      showDiagnostics(pkg);
    }
  }
  console.error(`could not resolve ${pkg}; build cannot continue`);
  process.exit(1);
}

const cli = resolve(entry);
const nodeArgs = preloads.map((p) => ['-r', resolve(p)]).flat();
nodeArgs.push(cli, ...rest);

const result = spawnSync(process.execPath, nodeArgs, { stdio: 'inherit' });

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);