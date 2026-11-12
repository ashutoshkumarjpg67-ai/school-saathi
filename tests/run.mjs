// Zero-dependency test runner (audit CR-8).
// Finds every *.test.mjs under tests/ (any depth) and runs them with
// `node --test`, passing EXPLICIT file paths.
//
// Why not a glob in package.json? The Node 20 test runner used in CI does
// not expand glob patterns passed as arguments ("Could not find
// 'tests/*.test.mjs'"), and `node --test tests/` tries to load the
// directory as a module. Explicit paths work on every Node version
// (>= 18) and every shell, including Windows cmd.
//
// Usage: node tests/run.mjs   (also wired as `npm test`)
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const TESTS_DIR = fileURLToPath(new URL('.', import.meta.url));

function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) collect(p, out);
    else if (entry.endsWith('.test.mjs')) out.push(p);
  }
  return out;
}

const files = collect(TESTS_DIR);
if (files.length === 0) {
  console.error('No test files found under tests/');
  process.exit(1);
}

const res = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(res.status ?? 1);
