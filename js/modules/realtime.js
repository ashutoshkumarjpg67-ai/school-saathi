/* School Saathi — js/modules/realtime.js (v157: zero-dependency Supabase Realtime live sync).
   Classic script, no build step: loaded with defer BEFORE app.js.
   Subscribes to Postgres changes for the active school (school_id=eq.<id>) over
   native WebSocket using Phoenix protocol v1.0.0. When another device (Principal,
   Accountant, Teacher) updates a row, triggers a debounced sync cycle so changes
   appear live without waiting for the 30s polling tick.
   Safe no-op when WebSocket is unavailable (e.g. Node unit tests) or offline. */
'use strict';

var SB_RT_TABLES = [
  'ss_students', 'ss_attendance', 'ss_fee_records', 'ss_receipts',
  'ss_marks', 'ss_exams', 'ss_homework', 'ss_notices', 'ss_timetable'
];

var sbRtSock = null;
var sbRtHbTimer = null;
var sbRtReconnTimer = null;
var sbRtDebounceTimer = null;
var sbRtRef = 1;
var sbRtBackoffMs = 3000;
var sbRtActive = null; // { url, anonKey, token, schoolId, onChange }
var sbRtState = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'

function sbRealtimeStatus() {
  return sbRtState;
}

function sbRealtimeUrl(sbUrl, anonKey) {
  var wsBase = String(sbUrl || '').replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:').replace(/\/+$/, '');
  return wsBase + '/realtime/v1/websocket?apikey=' + encodeURIComponent(anonKey || '') + '&vsn=1.0.0';
}

function sbRealtimeStop() {
  sbRtActive = null;
  sbRtState = 'disconnected';
  sbRtBackoffMs = 3000;
  try { if (sbRtHbTimer) clearInterval(sbRtHbTimer); } catch (e1) {}
  try { if (sbRtReconnTimer) clearTimeout(sbRtReconnTimer); } catch (e2) {}
  try { if (sbRtDebounceTimer) clearTimeout(sbRtDebounceTimer); } catch (e3) {}
  sbRtHbTimer = null; sbRtReconnTimer = null; sbRtDebounceTimer = null;
  if (sbRtSock) {
    try { sbRtSock.onopen = sbRtSock.onmessage = sbRtSock.onerror = sbRtSock.onclose = null; sbRtSock.close(); } catch (e4) {}
    sbRtSock = null;
  }
}

function sbRealtimeConnect() {
  if (!sbRtActive) return;
  if (typeof WebSocket === 'undefined') return;
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) return;
  var cfg = sbRtActive;
  sbRtState = 'connecting';
  try {
    var sock = new WebSocket(sbRealtimeUrl(cfg.url, cfg.anonKey));
    sbRtSock = sock;
    var topic = 'realtime:school-' + cfg.schoolId;

    sock.onopen = function () {
      if (sbRtSock !== sock || !sbRtActive) return;
      sbRtState = 'connected';
      sbRtBackoffMs = 3000;
      var changes = SB_RT_TABLES.map(function (tbl) {
        return { event: '*', schema: 'public', table: tbl, filter: 'school_id=eq.' + cfg.schoolId };
      });
      var joinMsg = {
        topic: topic,
        event: 'phx_join',
        payload: {
          config: { broadcast: { self: false }, presence: { key: '' }, postgres_changes: changes },
          access_token: cfg.token
        },
        ref: String(sbRtRef++)
      };
      try { sock.send(JSON.stringify(joinMsg)); } catch (eJ) {}
      if (sbRtHbTimer) { try { clearInterval(sbRtHbTimer); } catch (eC) {} }
      sbRtHbTimer = setInterval(function () {
        if (sbRtSock !== sock || sock.readyState !== 1) return;
        try { sock.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(sbRtRef++) })); } catch (eH) {}
      }, 30000);
    };

    sock.onmessage = function (ev) {
      if (sbRtSock !== sock || !sbRtActive) return;
      try {
        var msg = JSON.parse(ev && ev.data ? ev.data : '{}');
        if (msg && msg.event === 'postgres_changes') {
          if (sbRtDebounceTimer) clearTimeout(sbRtDebounceTimer);
          sbRtDebounceTimer = setTimeout(function () {
            sbRtDebounceTimer = null;
            if (sbRtActive && typeof sbRtActive.onChange === 'function') {
              try { sbRtActive.onChange(msg.payload); } catch (eCb) {}
            }
          }, 1500);
        }
      } catch (eP) {}
    };

    sock.onerror = function () {};
    sock.onclose = function () {
      if (sbRtSock !== sock) return;
      sbRtSock = null;
      if (sbRtHbTimer) { try { clearInterval(sbRtHbTimer); } catch (eC2) {} sbRtHbTimer = null; }
      sbRtState = 'disconnected';
      if (!sbRtActive) return;
      var delay = sbRtBackoffMs;
      sbRtBackoffMs = Math.min(sbRtBackoffMs * 2, 30000);
      sbRtReconnTimer = setTimeout(sbRealtimeConnect, delay);
    };
  } catch (e) {
    sbRtState = 'disconnected';
  }
}

function sbRealtimeStart(sbUrl, anonKey, token, schoolId, onChange) {
  if (!sbUrl || !anonKey || !token || !schoolId) return;
  if (typeof WebSocket === 'undefined') return;
  if (sbRtActive && sbRtActive.schoolId === schoolId && sbRtActive.token === token && sbRtSock) return;
  sbRealtimeStop();
  sbRtActive = { url: sbUrl, anonKey: anonKey, token: token, schoolId: schoolId, onChange: onChange };
  sbRealtimeConnect();
}
