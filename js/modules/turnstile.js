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
