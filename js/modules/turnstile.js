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
