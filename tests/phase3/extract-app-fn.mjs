// extract-app-fn.mjs — Phase 3 test helper (shared by tests/phase3/*.test.mjs).
//
// The app is one big browser file (app.js); the Phase 3 regression tests
// exercise its shipped functions directly by extracting their source
// text and running it in a node:vm sandbox with stubbed dependencies.
// That way the tests assert on the code that actually ships, not on a
// copy of it. Node built-ins only.
//
// NOTE: this helper deliberately does NOT load app.js top-to-bottom
// (the file expects a browser: document, localStorage, ...). Only the
// named function/var is extracted, so a test must stub every free
// variable that function touches — the test file lists them.

import { readFileSync } from 'node:fs';

const APP_JS = new URL('../../app.js', import.meta.url);
const src = readFileSync(APP_JS, 'utf8');

// Extract `function <name>(...) {...}` source from app.js (brace-matched,
// skipping // comments, /* */ comments and '...' / "..." / `...` strings).
export function extractFunction(name) {
  const m = new RegExp('function ' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('function not found in app.js: ' + name);
  const open = src.indexOf('{', m.index);
  if (open === -1) throw new Error('no body for function: ' + name);
  return src.slice(m.index, scanBlock(src, open) + 1);
}

// Extract a `var <name> = ...;` statement (single line) from app.js.
export function extractVar(name) {
  const m = new RegExp('var ' + name + ' = [^;]+;').exec(src);
  if (!m) throw new Error('var not found in app.js: ' + name);
  return m[0];
}

function scanBlock(s, open) {
  let depth = 0;
  let i = open;
  while (i < s.length) {
    const c = s[i];
    const next = s[i + 1];
    if (c === '/' && next === '/') {
      i = s.indexOf('\n', i + 2);
      if (i === -1) break;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = s.indexOf('*/', i + 2);
      i = end === -1 ? s.length : end + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      i = skipString(s, i, c);
      continue;
    }
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  throw new Error('unbalanced braces while extracting function');
}

function skipString(s, i, quote) {
  i++;
  while (i < s.length) {
    if (s[i] === '\\') { i += 2; continue; }
    if (s[i] === quote) return i + 1;
    if (quote === '`' && s[i] === '$' && s[i + 1] === '{') {
      // Template interpolation: skip the ${ ... } block, then continue.
      i = scanBlock(s, s.indexOf('{', i + 1)) + 1;
      continue;
    }
    i++;
  }
  return i;
}
