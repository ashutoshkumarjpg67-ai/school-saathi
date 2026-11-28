/* School Saathi — js/modules/turnstile.js (v159: Cloudflare Turnstile client helper).
   Classic script, no build step: loaded with defer before app.js.
   Renders managed Turnstile widgets explicitly on:
     1. New School Signup (#suTurnstile, action: 'signup')
     2. Public Admission Apply (#admTurnstile, action: 'admission_apply')
   Lazy-loads challenges.cloudflare.com/turnstile/v0/api.js?render=explicit only
   in a real browser when online. Offline / Node test harnesses safely no-op. */
'use strict';

var SB_TURNSTILE_SITEKEY = '0x4AAAAAAGUl8mHM68xzm35Z';
var sbTsWidgets = {}; // surface -> widgetId
var sbTsTokens = {};  // surface -> latest token
var sbTsPending = {}; // surface -> { elId, action }
var sbTsScriptLoaded = false;

function sbTurnstileLoadScript() {
  if (sbTsScriptLoaded) return;
  try {
    if (typeof document === 'undefined' || !document.createElement || !document.head) return;
    if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) return;
    sbTsScriptLoaded = true;
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=sbTurnstileOnLoad';
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  } catch (e) {}
}

function sbTurnstileOnLoad() {
  Object.keys(sbTsPending).forEach(function (surface) {
    var cfg = sbTsPending[surface];
    if (cfg) sbTurnstileMount(surface, cfg.elId, cfg.action);
  });
}

function sbTurnstileMount(surface, elId, action) {
  sbTsPending[surface] = { elId: elId, action: action };
  sbTsTokens[surface] = '';
  try {
    if (typeof document === 'undefined' || !document.getElementById) return;
    var el = document.getElementById(elId);
    if (!el) return;
    if (typeof window === 'undefined' || !window.turnstile || typeof window.turnstile.render !== 'function') {
      sbTurnstileLoadScript();
      return;
    }
    if (sbTsWidgets[surface] !== undefined) {
      try { window.turnstile.remove(sbTsWidgets[surface]); } catch (eR) {}
      delete sbTsWidgets[surface];
    }
    el.innerHTML = '';
    sbTsWidgets[surface] = window.turnstile.render(el, {
      sitekey: SB_TURNSTILE_SITEKEY,
      action: action,
      callback: function (tok) { sbTsTokens[surface] = tok || ''; },
      'expired-callback': function () { sbTsTokens[surface] = ''; },
      'error-callback': function () { sbTsTokens[surface] = ''; }
    });
  } catch (e) {}
}

function sbTurnstileToken(surface) {
  return sbTsTokens[surface] || '';
}

function sbTurnstileReset(surface) {
  sbTsTokens[surface] = '';
  try {
    if (typeof window !== 'undefined' && window.turnstile && sbTsWidgets[surface] !== undefined) {
      window.turnstile.reset(sbTsWidgets[surface]);
    }
  } catch (e) {}
}

// v166: Private School Code resolution (replaces public school list on Student/Parent/Teacher/Staff login).
function sbFindLocalSchoolByCode(rawVal) {
  var raw = String(rawVal || '').trim();
  if (!raw) return null;
  var upper = raw.toUpperCase();
  var schools = loadAccounts().filter(function (a) { return a.role === 'school'; });
  for (var i = 0; i < schools.length; i++) {
    var a = schools[i];
    if (a.uid === raw) return { localUid: a.uid };
    var d = readDbByKey(dbKeyFor(a));
    if (d && d.profile && d.profile.schoolCode && String(d.profile.schoolCode).trim().toUpperCase() === upper) {
      return { localUid: a.uid };
    }
  }
  return null;
}
function sbResolveSchoolCode(code) {
  var clean = String(code || '').trim().toUpperCase();
  if (!clean || typeof sbFetch !== 'function') return Promise.resolve({ ok: false });
  return sbFetch(SB_URL + '/rest/v1/rpc/ss_resolve_school_code', {
    method: 'POST',
    headers: { 'apikey': SB_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_code: clean })
  }).then(function (r) {
    if (!r || !r.ok || !r.data || !r.data.ok || !r.data.id) return { ok: false };
    return { ok: true, id: r.data.id, name: r.data.name || '', school_code: r.data.school_code || clean };
  }).catch(function () { return { ok: false, netfail: true }; });
}
function sbResolveLoginSchool(rawVal, err, required, onCloud) {
  var raw = String(rawVal || '').trim();
  if (raw.indexOf('cloud:') === 0) { onCloud(raw.slice(6)); return null; }
  var hit = sbFindLocalSchoolByCode(raw);
  if (hit) return hit.localUid;
  if (!raw) {
    if (!required) return '';
    err.textContent = t('tEnterSchoolCode'); err.classList.remove('hidden'); return null;
  }
  if (!sbIsOnline()) { err.textContent = t('tInvalidSchoolCode'); err.classList.remove('hidden'); return null; }
  sbResolveSchoolCode(raw).then(function (res) {
    if (!res || !res.ok || !res.id) { err.textContent = t('tInvalidSchoolCode'); err.classList.remove('hidden'); return; }
    onCloud(res.id);
  });
  return null;
}
function copySchoolCode() {
  var code = (db && db.profile && db.profile.schoolCode) ? String(db.profile.schoolCode).trim() : '';
  if (!code) return;
  try {
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(function () { toast(t('tCodeCopied') + ': ' + code); }).catch(function () { toast(code); });
      return;
    }
  } catch (e) {}
  toast(code);
}

// v167: Super Admin permanent school deletion (dummy/test school cleanup).
function superDeleteSchoolModal(schoolId, schoolName) {
  if (!state || state.role !== 'superadmin' || !schoolId) return;
  var name = String(schoolName || '').trim();
  openModal('<h3>Delete School Permanently</h3>' +
    '<p class="muted mb-12">This will permanently delete <b>' + esc(name || schoolId) + '</b> — all students, fees, attendance, photos, and its login account. This cannot be undone.</p>' +
    '<div id="saDelErr" class="err hidden"></div>' +
    '<form onsubmit="return doSuperDeleteSchool(event,' + jsAttr(schoolId) + ',' + jsAttr(name) + ')">' +
    '<div class="field"><label>Type the school name to confirm: <b>' + esc(name) + '</b></label><input id="saDelName" type="text" placeholder="' + esc(name) + '" autocomplete="off"></div>' +
    '<div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + esc(t('cancel')) + '</button>' +
    '<button type="submit" class="btn danger" id="saDelBtn">Delete Permanently</button></div></form>');
}
function doSuperDeleteSchool(e, schoolId, expectedName) {
  if (e && e.preventDefault) e.preventDefault();
  if (!state || state.role !== 'superadmin' || !schoolId) return false;
  var err = $('saDelErr');
  var typed = ($('saDelName') ? $('saDelName').value : '').trim();
  if (expectedName && typed.toLowerCase() !== String(expectedName).trim().toLowerCase()) {
    if (err) { err.textContent = 'School name does not match.'; err.classList.remove('hidden'); }
    return false;
  }
  var sess = (typeof sbLoadSession === 'function') ? sbLoadSession() : null;
  var tok = sess && sess.access_token;
  if (!tok || typeof sbFetch !== 'function') {
    if (err) { err.textContent = 'Session expired. Please log in again.'; err.classList.remove('hidden'); }
    return false;
  }
  if (err) err.classList.add('hidden');
  var btn = $('saDelBtn');
  if (btn) btn.disabled = true;
  sbFetch(SB_URL + '/functions/v1/admin-delete-school', {
    method: 'POST',
    headers: { 'apikey': SB_ANON_KEY, 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify({ school_id: schoolId })
  }).then(function (r) {
    if (btn) btn.disabled = false;
    if (!r || !r.ok || !r.data || !r.data.deleted) {
      var msg = (r && r.data && r.data.error) ? ('Delete failed: ' + r.data.error) : 'Delete failed. Please try again.';
      if (err) { err.textContent = msg; err.classList.remove('hidden'); }
      return;
    }
    if (Array.isArray(state.superSchools)) {
      state.superSchools = state.superSchools.filter(function (s) { return s.id !== schoolId; });
    }
    if (Array.isArray(state.superStats)) {
      state.superStats = state.superStats.filter(function (s) { return s.school_id !== schoolId; });
    }
    closeModal();
    renderApp();
    toast('Deleted: ' + (expectedName || schoolId));
  }).catch(function () {
    if (btn) btn.disabled = false;
    if (err) { err.textContent = 'Network error. Please try again.'; err.classList.remove('hidden'); }
  });
  return false;
}

// v170: EduNova color-coded Timetable tone + Dashboard Top Performers & Recent Admissions widgets.
function ttSubjectTone(subj) {
  var s = String(subj || '').toLowerCase(), h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 6;
  return 'tt-c' + Math.abs(h);
}
function sbEduNovaDashWidgets() {
  try {
    if (typeof db === 'undefined' || !db) return '';
    var stus = (db.students || []).filter(function (s) { return s && !s.deleted; });
    var recent = stus.slice().sort(function (a, b) {
      var da = a.admDate || a.createdAt || '', db2 = b.admDate || b.createdAt || '';
      return da < db2 ? 1 : (da > db2 ? -1 : 0);
    }).slice(0, 4);
    var recHtml = recent.length
      ? '<div class="tbl-wrap"><table><thead><tr><th>' + esc(t('thStudent')) + '</th><th>' + esc(t('thClass')) + '</th><th>' + esc(t('thDate')) + '</th></tr></thead><tbody>' +
        recent.map(function (s) {
          return '<tr><td><b>' + esc(s.name || '—') + '</b></td><td>' + esc(s.cls || '—') + '</td><td>' + esc((s.admDate || '—').slice(0, 10)) + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<p class="muted">No admissions recorded yet.</p>';

    var examTotals = {};
    (db.exams || []).forEach(function (ex) { if (ex && !ex.deleted && ex.id) examTotals[ex.id] = Number(ex.total) || 100; });
    var stuScores = {};
    (db.marks || []).forEach(function (m) {
      if (!m || !m.studentId || examTotals[m.examId] === undefined) return;
      var val = Number(m.marks);
      if (!isFinite(val)) return;
      if (!stuScores[m.studentId]) stuScores[m.studentId] = { got: 0, max: 0 };
      stuScores[m.studentId].got += val;
      stuScores[m.studentId].max += examTotals[m.examId];
    });
    var topList = stus.map(function (s) {
      var sc = stuScores[s.id];
      if (!sc || !sc.max) return null;
      return { name: s.name, cls: s.cls, pct: Math.round((sc.got / sc.max) * 1000) / 10 };
    }).filter(Boolean).sort(function (a, b) { return b.pct - a.pct; }).slice(0, 4);
    var topHtml = topList.length
      ? '<div class="tbl-wrap"><table><thead><tr><th>' + esc(t('thStudent')) + '</th><th>' + esc(t('thClass')) + '</th><th>Score</th></tr></thead><tbody>' +
        topList.map(function (r) {
          return '<tr><td><b>' + esc(r.name || '—') + '</b></td><td>' + esc(r.cls || '—') + '</td><td><span class="badge green">' + r.pct + '%</span></td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<p class="muted">Enter exam marks to see top performers.</p>';

    return '<div class="grid2e">' +
      '<div class="card"><div class="head-row"><div><h3>🏆 Top Performers</h3></div><a href="#" onclick="go(\'exams\');return false">' + esc(t('viewAll')) + '</a></div>' + topHtml + '</div>' +
      '<div class="card"><div class="head-row"><div><h3>🎓 Recent Admissions</h3></div><a href="#" onclick="go(\'students\');return false">' + esc(t('viewAll')) + '</a></div>' + recHtml + '</div>' +
    '</div>';
  } catch (e) { return ''; }
}
