// tests/phase8/v158-dark-mode.test.mjs — Dark Mode + Supabase keepalive workflow tests.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppContext } from '../harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CSS_SRC = readFileSync(join(ROOT, 'styles.css'), 'utf8');
const INDEX_SRC = readFileSync(join(ROOT, 'index.html'), 'utf8');

describe('v158 — Dark Mode toggle & persistence', () => {
  it('toggles between light and dark, persists to localStorage, and sets data-theme', () => {
    const app = createAppContext();
    app.run(`
      globalThis.__themeAttr = '';
      document.documentElement.setAttribute = function (k, v) { if (k === 'data-theme') globalThis.__themeAttr = v; };
    `);
    assert.equal(app.run('initTheme()'), 'light');
    assert.equal(app.get('__themeAttr'), 'light');
    assert.equal(app.run('toggleTheme()'), 'dark');
    assert.equal(app.get('__themeAttr'), 'dark');
    assert.equal(app.storage.getItem('schoolSaathiTheme'), 'dark');
    assert.equal(app.run('toggleTheme()'), 'light');
    assert.equal(app.storage.getItem('schoolSaathiTheme'), 'light');
  });

  it('styles.css defines [data-theme="dark"] and index.html has the themeBtn toggle', () => {
    assert.ok(CSS_SRC.includes('[data-theme="dark"]'), 'dark theme CSS missing');
    assert.ok(INDEX_SRC.includes('id="themeBtn"'), 'themeBtn missing in index.html');
    assert.ok(INDEX_SRC.includes('onclick="toggleTheme()"'), 'toggleTheme handler missing');
  });

  it('Supabase keepalive workflow exists', () => {
    assert.ok(existsSync(join(ROOT, 'docs', 'supabase-keepalive.yml')));
  });
});

