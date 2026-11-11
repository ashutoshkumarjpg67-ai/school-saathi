// C8: version drift check — version ek jagah badle, baaki jagah sync rahe.
// Source of truth: version.json (sirf wahi number badlo, phir baaki markers
// usi number se milao). Mismatch par exit code 1 — bina pass kiye push mat karo.
// Chalao: node scripts/check-version.mjs   (repo root se)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const failures = [];
function check(name, found, expected) {
  const ok = found === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: found=${found} expected=${expected}`);
  if (!ok) failures.push(name);
}

// 1. Source of truth — version.json
const truth = JSON.parse(read('version.json')).version;
console.log(`version.json: ${truth}`);

// 2. app.js — var APP_VERSION = N;
const appJs = read('app.js');
const appV = appJs.match(/var APP_VERSION\s*=\s*(\d+)\s*;/);
check('app.js APP_VERSION', appV ? Number(appV[1]) : 'MISSING', truth);

// 3. index.html — har ?v=N (styles.css, qrgen.js, app.js)
const html = read('index.html');
const htmlVs = [...html.matchAll(/\?v=(\d+)/g)].map((m) => Number(m[1]));
console.log(`index.html ?v= occurrences: ${htmlVs.length} [${htmlVs.join(', ')}]`);
check('index.html ?v= count', htmlVs.length, 3);
htmlVs.forEach((v, i) => check(`index.html ?v= #${i + 1}`, v, truth));

// 4. index.html — sidebar footer vN (static HTML, app.js ise rewrite nahi karta)
const sideV = html.match(/>v(\d+)<br>/);
check('index.html sidebar vN', sideV ? Number(sideV[1]) : 'MISSING', truth);

// 5. sw.js — CACHE_NAME = 'school-saathi-vN' (sirf padho, line mat chhedo)
const sw = read('sw.js');
const cacheV = sw.match(/CACHE_NAME\s*=\s*'school-saathi-v(\d+)'/);
check('sw.js CACHE_NAME', cacheV ? Number(cacheV[1]) : 'MISSING', truth);

// 6. sw.js — APP_SHELL ke ?v=N (styles.css, app.js, qrgen.js)
const swVs = [...sw.matchAll(/\?v=(\d+)/g)].map((m) => Number(m[1]));
console.log(`sw.js ?v= occurrences: ${swVs.length} [${swVs.join(', ')}]`);
check('sw.js ?v= count', swVs.length, 3);
swVs.forEach((v, i) => check(`sw.js ?v= #${i + 1}`, v, truth));

// 7. sw.js — APP_SHELL me icons/logo.svg precache hona chahiye (L-22; PR #7)
//    Logo login screen par <img src="icons/logo.svg"> se dikhta hai — offline
//    login par bhi dikhe, isliye precache list me hona zaroori hai.
const shellBlock = sw.match(/APP_SHELL\s*=\s*\[([\s\S]*?)\]/);
check('sw.js APP_SHELL has icons/logo.svg', shellBlock ? shellBlock[1].includes("'icons/logo.svg'") : 'MISSING', true);

// 8. manifest.json — app ke actual values se consistent hona chahiye (L-22).
//    Expected values invent nahi kiye — index.html / styles.css se liye gaye:
//    naam = apple-mobile-web-app-title, theme = meta theme-color / CSS --navy.
check('index.html links manifest.json', html.includes('rel="manifest" href="manifest.json"'), true);
const manifest = JSON.parse(read('manifest.json'));
const appTitle = html.match(/<meta name="apple-mobile-web-app-title" content="([^"]+)"/);
const htmlTheme = html.match(/<meta name="theme-color" content="([^"]+)"/);
const css = read('styles.css');
const cssNavy = css.match(/--navy:\s*(#[0-9A-Fa-f]{6})/);
check('manifest.json name', manifest.name, appTitle ? appTitle[1] : 'MISSING');
check('manifest.json short_name', manifest.short_name, appTitle ? appTitle[1] : 'MISSING');
check('manifest.json theme_color vs index.html', manifest.theme_color, htmlTheme ? htmlTheme[1] : 'MISSING');
check('manifest.json theme_color vs styles.css --navy', manifest.theme_color, cssNavy ? cssNavy[1] : 'MISSING');

if (failures.length) {
  console.error(`\nVERSION DRIFT: ${failures.length} check(s) failed — ${failures.join(', ')}`);
  console.error('version.json ka number baaki jagah bhi wahi rakho, phir dobara chalao.');
  process.exit(1);
}
console.log(`\nOK: saare version markers ${truth} par consistent hain.`);
