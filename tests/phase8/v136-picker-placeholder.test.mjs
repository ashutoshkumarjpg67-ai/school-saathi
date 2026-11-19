// tests/phase8/v136-picker-placeholder.test.mjs — v136 public-picker safeguard.
//
// The public Apply picker used to pre-select the first listed school, so a
// parent who did not touch the School field applied to whatever school
// happened to sort first. v136 prepends a disabled empty-value placeholder
// ("Select school") so a submission requires a deliberate choice, keeps a
// choice the parent already made across the async server-list refresh, and
// rejects an empty selection with a dedicated message.
//
// Server side, the SQL 46 listable-school policy already rejects inserts
// without a valid listable school_id.
//
// Run: node --test tests/phase8/*.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppContext } from '../harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = readFileSync(join(ROOT, 'app.js'), 'utf8');

describe('public Apply picker requires a deliberate school choice', () => {
  it('options start with a disabled empty-value placeholder', () => {
    const app = createAppContext();
    const html = app.run('admReqSchoolOptions()');
    assert.match(html, /^<option value="" disabled selected>/, `no leading placeholder: ${html.slice(0, 120)}`);
    // A placeholder is never a submittable school value.
    assert.ok(!html.includes('value="" disabled selected>srv:') && !html.includes('value="" disabled selected>local:'));
  });

  it('real schools still list after the placeholder', () => {
    const app = createAppContext();
    app.run(`admReqPublicCache = [{ id: 'sch-1', name: "St. Mary's School", city: 'Patna' }];`);
    const html = app.run('admReqSchoolOptions()');
    assert.ok(html.includes('value="srv:sch-1"'), 'server school missing');
    assert.ok(html.indexOf('value=""') < html.indexOf('srv:sch-1'), 'placeholder must come first');
    // School names stay HTML-escaped in option text.
    assert.ok(html.includes('St. Mary&#39;s School'), `name not escaped: ${html}`);
  });

  it('async refresh preserves a school the parent already picked', () => {
    const marker = "var prev = sel.value; // keep a choice the parent already made";
    assert.ok(APP.includes(marker), 'refresh does not preserve the current selection');
    assert.ok(APP.includes('if (prev) sel.value = prev;'), 'selection is never restored');
  });

  it('empty selection is rejected with the pick-a-school message, not a generic failure', () => {
    const m = APP.match(/if \(!sel\) \{ toast\(t\('([^']+)'\)\); return false; \}/);
    assert.ok(m, 'empty-selection guard not found');
    assert.equal(m[1], 'tAdmReqPickSchool');
  });

  it('both languages carry the new strings', () => {
    const I18N = readFileSync(join(ROOT, 'js', 'modules', 'i18n.js'), 'utf8');
    assert.equal(I18N.match(/admReqPickSchool:/g).length, 2, 'admReqPickSchool missing in a language');
    assert.equal(I18N.match(/tAdmReqPickSchool:/g).length, 2, 'tAdmReqPickSchool missing in a language');
  });
});
