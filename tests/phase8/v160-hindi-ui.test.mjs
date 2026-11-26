// tests/phase8/v160-hindi-ui.test.mjs — Bilingual English + Hindi UI restoration tests.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppContext } from '../harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INDEX_SRC = readFileSync(join(ROOT, 'index.html'), 'utf8');

describe('v160 — Bilingual English + Hindi UI', () => {
  it('I18N.hi has 100% key parity with I18N.en and includes new v147-v159 keys', () => {
    const app = createAppContext();
    const enKeys = JSON.parse(app.run('JSON.stringify(Object.keys(I18N.en))'));
    const hiKeys = JSON.parse(app.run('JSON.stringify(Object.keys(I18N.hi))'));
    assert.equal(hiKeys.length, enKeys.length, 'hi key count must match en key count');
    assert.ok(/[\u0900-\u097F]/.test(app.run('I18N.hi.dashboard')));
    assert.ok(/[\u0900-\u097F]/.test(app.run('I18N.hi.timetable')));
    assert.ok(/[\u0900-\u097F]/.test(app.run('I18N.hi.rcTitle')));
    assert.ok(/[\u0900-\u097F]/.test(app.run('I18N.hi.tPwWeak')));
  });

  it('toggleLang() switches between en and hi, persists to localStorage, and updates t()', () => {
    const app = createAppContext();
    assert.equal(app.get('curLang'), 'en');
    assert.equal(app.run(`t('dashboard')`), 'Dashboard');
    assert.equal(app.run('toggleLang()'), 'hi');
    assert.equal(app.storage.getItem('schoolSaathiLang'), 'hi');
    assert.equal(app.run(`t('timetable')`), 'समय-सारणी');
    assert.equal(app.run('toggleLang()'), 'en');
    assert.equal(app.storage.getItem('schoolSaathiLang'), 'en');
  });

  it('index.html exposes the EN/Hindi toggle on both login and topbar', () => {
    assert.ok(INDEX_SRC.includes('id="langBtn"'));
    assert.ok(INDEX_SRC.includes('id="loginLangBtn"'));
    assert.ok(INDEX_SRC.includes('onclick="toggleLang()"'));
  });
});
