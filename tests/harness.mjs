// tests/harness.mjs — in-repo test harness (Phase 1, audit CR-8).
//
// Loads the browser app (qrgen.js, js/bcrypt.js, js/modules/crypto.js,
// js/modules/i18n.js, app.js) plus the seeded fixtures
// (scripts/seed-fixtures.js) inside a node:vm context with minimal
// browser stubs, in the same order index.html loads them. No network,
// no DOM, no dependency — Node built-ins only.
//
// A fresh device starts EMPTY (v36): the context's localStorage starts
// empty, so loadDB() builds an empty db. Tests that need fixture data
// call seedDB() explicitly and put it into `db` — exactly what the
// external harness did, now inside the repo.
//
// Usage:
//   import { createAppContext } from './harness.mjs';
//   const app = createAppContext();
//   const db = app.run('seedDB()');
//   app.run('db = seedDB(); saveDB(db);');
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Scripts in index.html load order (defer). seed-fixtures.js is NOT
// loaded by index.html — it is harness-only, loaded last.
const LOAD_ORDER = [
  'qrgen.js',
  'js/bcrypt.js',
  'js/modules/crypto.js',
  'js/modules/i18n.js',
  'app.js',
  'js/modules/private-photos.js',
  'scripts/seed-fixtures.js',
];

function elementStub() {
  return {
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    remove() {},
    setAttribute() {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    style: {},
    textContent: '',
    innerHTML: '',
    value: '',
    click() {},
  };
}

export function createAppContext() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  const documentStub = {
    addEventListener() {},
    removeEventListener() {},
    getElementById: () => elementStub(),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => elementStub(),
    body: elementStub(),
    documentElement: elementStub(),
  };
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    localStorage,
    document: documentStub,
    window: { addEventListener() {}, removeEventListener() {} },
    navigator: {},
    location: { href: 'http://localhost/', reload() {} },
    // No network in the harness: any fetch rejects, so a test can
    // never accidentally touch Supabase or the live site.
    fetch: async () => {
      throw new Error('no network in harness');
    },
    Blob: class Blob {},
    URL: { createObjectURL: () => '', revokeObjectURL() {} },
    FileReader: class FileReader {},
    // bcrypt.js reads randomness from self.crypto (WebCryptoAPI).
    crypto: webcrypto,
  };
  sandbox.window.document = documentStub;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  for (const f of LOAD_ORDER) {
    vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  return {
    /** Evaluate code inside the app context and return its value. */
    run(code) {
      return vm.runInContext(code, sandbox);
    },
    /** Read a global (e.g. APP_VERSION) from the app context. */
    get(name) {
      return vm.runInContext(name, sandbox);
    },
    /** The in-memory localStorage, for assertions on what was saved. */
    storage: localStorage,
  };
    }
