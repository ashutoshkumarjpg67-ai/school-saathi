/* School Saathi — static build. All data lives in localStorage (seeded once, never overwritten). */
'use strict';

/* ================= constants ================= */
var DB_KEY = 'schoolSaathiDBv1';
var SESSION_KEY = 'schoolSaathiSession';
var NAVY = '#0A1E4B', BLUE = '#2563EB', GREEN = '#16A34A', ORANGE = '#EA8600', RED = '#DC2626';
var FEE_MONTHS = [ // monthly ledger — sums MUST equal 8,45,000 collected / 1,20,000 pending
  { m: 'Apr', collected: 165000, pending: 25000 },
  { m: 'May', collected: 178000, pending: 22000 },
  { m: 'Jun', collected: 162000, pending: 28000 },
  { m: 'Jul', collected: 175000, pending: 20000 },
  { m: 'Aug', collected: 165000, pending: 25000 }
];
/* Accounts live in localStorage on this device (server auth is Phase 2).
   OWNER is the platform-owner login. School accounts are created via Sign Up;
   each school gets its own workspace copy under its own DB key. */
var OWNER = { id: 'super@school-saathi.in', pw: 'admin123', role: 'super', name: 'Super Admin', sub: 'Platform Owner', email: 'super@school-saathi.in', uid: 'owner' };
var ACC_KEY = 'schoolSaathiAccounts';
function hashPw(s) { var h = 5381, i; for (i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return 'h' + h.toString(36); }
function loadAccounts() { try { var r = localStorage.getItem(ACC_KEY); if (r) { var a = JSON.parse(r); if (Array.isArray(a)) return a; } } catch (e) {} return []; }
function saveAccounts(list) { try { localStorage.setItem(ACC_KEY, JSON.stringify(list)); } catch (e) {} }
function findAccount(email) {
  email = (email || '').trim().toLowerCase();
  if (email === OWNER.id) return OWNER;
  var list = loadAccounts();
  for (var i = 0; i < list.length; i++) if (list[i].email === email) return list[i];
  return null;
}
function dbKeyFor(a) { if (a.role === 'parent') return DB_KEY; return a.role === 'super' ? 'schoolSaathiDBv1' : 'schoolSaathiDB_' + a.uid; }
function applySchoolProfile(d, a) { d.profile.name = a.school; d.profile.principal = a.name; d.profile.email = a.email; return d; }

/* ================= Supabase Auth (v27) =================
   Server login via GoTrue REST with plain fetch — NO external JS library,
   the app stays self-contained. The anon (publishable) key below is safe to
   ship in client code; it is NOT a service_role key (there is none anywhere
   in this app — never add one). Project: School Saathi,
   https://bsjqeeeemwimzldrehpw.supabase.co (ref has FOUR e's after bsjq).
   Login order: Supabase first when online, local djb2 accounts as the
   offline fallback. The local super@school-saathi.in / admin123 account
   stays working offline only — that address cannot exist in Supabase Auth
   (the domain does not resolve), so the Supabase owner is the Gmail
   account created for him and the local super account is the
   offline fallback for the same person. Never hard-code an email for the
   Super Admin check: it is a lookup on ss_platform_admins by user id. */
var SB_URL = 'https://bsjqeeeemwimzldrehpw.supabase.co';
var SB_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzanFlZWVlbXdpbXpsZHJlaHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxODA0ODIsImV4cCI6MjEwOTc1NjQ4Mn0.KUV5jF6he8suH_lHUrLvXixPVdzIwHVqcPJXHh1jVkM';
var SB_SESSION_KEY = 'schoolSaathiSupabaseSession';
var SB_SCHOOL_MAP_KEY = 'schoolSaathiServerSchools'; // { localAccountUid: serverSchoolUuid }
var SB_MIGRATED_KEY = 'schoolSaathiMigrated'; // per Supabase uid: { at, schoolId, counts }
var SB_STATUS_KEY = 'schoolSaathiSbStatus'; // { state, at, detail }
var sbRecoveryToken = null;
var sbMigPromise = null; // one migration run at a time

function sbIsOnline() {
  if (typeof fetch !== 'function') return false;
  try { if (typeof navigator !== 'undefined' && navigator.onLine === false) return false; } catch (e) {}
  return true;
}
function sbAuthFetch(path, opts) {
  opts = opts || {};
  if (typeof fetch !== 'function') return Promise.reject(new Error('no-fetch'));
  var headers = { 'apikey': SB_ANON_KEY, 'Authorization': 'Bearer ' + (opts.token || SB_ANON_KEY), 'Content-Type': 'application/json' };
  var init = { method: opts.method || 'GET', headers: headers };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  return fetch(SB_URL + path, init).then(function (res) {
    if (res.status === 204) return { ok: res.ok, status: res.status, data: null };
    return res.json().catch(function () { return null; }).then(function (data) {
      return { ok: res.ok, status: res.status, data: data };
    });
  });
}
function sbRest(method, path, token, body, prefer) {
  if (typeof fetch !== 'function') return Promise.reject(new Error('no-fetch'));
  var headers = { 'apikey': SB_ANON_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
  if (prefer) headers['Prefer'] = prefer;
  var init = { method: method, headers: headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  return fetch(SB_URL + '/rest/v1/' + path, init).then(function (res) {
    if (res.status === 204) return { ok: res.ok, status: res.status, data: null };
    return res.json().catch(function () { return null; }).then(function (data) {
      return { ok: res.ok, status: res.status, data: data };
    });
  });
}
function sbSignUp(email, pw, school, name) {
  return sbAuthFetch('/auth/v1/signup', { method: 'POST', body: { email: email, password: pw, data: { school: school, name: name } } });
}
function sbSignIn(email, pw) {
  return sbAuthFetch('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email, password: pw } });
}
function sbSignOut(token) {
  return sbAuthFetch('/auth/v1/logout', { method: 'POST', token: token, body: {} });
}
function sbRefresh(refreshToken) {
  return sbAuthFetch('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refreshToken } });
}
function sbRecover(email) {
  return sbAuthFetch('/auth/v1/recover', { method: 'POST', body: { email: email } });
}
function sbGetUser(token) {
  return sbAuthFetch('/auth/v1/user', { method: 'GET', token: token });
}
function sbSetNewPassword(recoveryToken, pw) {
  return sbAuthFetch('/auth/v1/user', { method: 'PUT', token: recoveryToken, body: { password: pw } });
}
function sbStoreSession(d) {
  try {
    var s = { access_token: d.access_token, refresh_token: d.refresh_token || '', expires_at: Date.now() + ((d.expires_in || 3600) * 1000), user_id: (d.user && d.user.id) || '', email: (d.user && d.user.email) || '' };
    localStorage.setItem(SB_SESSION_KEY, JSON.stringify(s));
    return s;
  } catch (e) { return null; }
}
function sbLoadSession() {
  try { var r = localStorage.getItem(SB_SESSION_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; }
}
function sbClearSession() { try { localStorage.removeItem(SB_SESSION_KEY); } catch (e) {} }
function sbGetValidToken() {
  var s = sbLoadSession();
  if (!s || !s.access_token) return Promise.resolve(null);
  if (s.expires_at && s.expires_at - Date.now() > 60000) return Promise.resolve(s.access_token);
  if (!s.refresh_token) return Promise.resolve(null);
  return sbRefresh(s.refresh_token).then(function (r) {
    if (!r.ok || !r.data || !r.data.access_token) { sbClearSession(); return null; }
    var s2 = sbStoreSession(r.data);
    return s2 ? s2.access_token : null;
  }).catch(function () { return null; });
}
function sbCheckSuperAdmin(uid, token) {
  return sbRest('GET', 'ss_platform_admins?select=user_id&user_id=eq.' + encodeURIComponent(uid), token).then(function (r) {
    return r.ok && Array.isArray(r.data) && r.data.length > 0;
  });
}
function sbSetStatus(state, detail) {
  try { localStorage.setItem(SB_STATUS_KEY, JSON.stringify({ state: state, at: new Date().toISOString(), detail: detail || '' })); } catch (e) {}
}
function sbLoadStatus() {
  try { var r = localStorage.getItem(SB_STATUS_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; }
}
function sbStatusText() {
  var st = sbLoadStatus();
  if (!st) return t('sbStatusPending');
  if (st.state === 'synced') return t('sbStatusSynced') + (st.at ? ' ' + st.at.slice(0, 10) : '');
  if (st.state === 'uploading') return t('sbStatusUploading');
  if (st.state === 'failed') return t('sbStatusFailed');
  if (st.state === 'offline') return t('sbStatusOffline');
  return t('sbStatusPending');
}
function sbLoadMig(uid) {
  try { var r = localStorage.getItem(SB_MIGRATED_KEY + ':' + uid); return r ? JSON.parse(r) : null; } catch (e) { return null; }
}
function sbSaveMig(uid, v) {
  try { localStorage.setItem(SB_MIGRATED_KEY + ':' + uid, JSON.stringify(v)); } catch (e) {}
}
function sbServerSchoolMap() {
  try { var r = localStorage.getItem(SB_SCHOOL_MAP_KEY); return r ? JSON.parse(r) : {}; } catch (e) { return {}; }
}
function sbSaveServerSchool(localUid, serverId) {
  var m = sbServerSchoolMap(); m[localUid] = serverId;
  try { localStorage.setItem(SB_SCHOOL_MAP_KEY, JSON.stringify(m)); } catch (e) {}
}
function sbFinishSupabaseLogin(data, email, pw) {
  var uid = data.user && data.user.id;
  if (!uid) { sbLocalLogin(email, pw, $('loginErr')); return; }
  sbStoreSession(data);
  var meta = (data.user && data.user.user_metadata) || {};
  sbCheckSuperAdmin(uid, data.access_token).then(function (isSuper) {
    if (isSuper) {
      // Platform owner. Never migrate the platform demo DB to the server.
      state.sb = { uid: uid, email: email, isSuper: true };
      $('loginErr').classList.add('hidden');
      loginAs(OWNER);
      return;
    }
    var a = findAccount(email);
    if (!a) {
      // Signed in on the server but no account on this device yet: create
      // the local workspace from the signup metadata so offline login works.
      a = { uid: 'u' + Date.now().toString(36), name: meta.name || email, school: meta.school || '', email: email, pwHash: pw ? hashPw(pw) : '', role: 'school', sub: 'School Admin • ' + (meta.school || ''), created: new Date().toISOString().slice(0, 10), sbUid: uid };
      var list = loadAccounts(); list.push(a); saveAccounts(list);
    } else {
      a.sbUid = uid;
      var list2 = loadAccounts();
      for (var i = 0; i < list2.length; i++) if (list2[i].email === email) list2[i] = a;
      saveAccounts(list2);
    }
    state.sb = { uid: uid, email: email, isSuper: false };
    $('loginErr').classList.add('hidden');
    loginAs(a);
    sbMaybeMigrate(a, uid, data.access_token); // fire-and-forget: never blocks login
  }).catch(function () {
    // Admin check failed mid-flight (network dropped): log in locally.
    sbLocalLogin(email, pw, $('loginErr'));
  });
}
function sbLocalLogin(id, pw, err) {
  var a = findAccount(id);
  var ok = a ? (a.role === 'super' ? pw === OWNER.pw : hashPw(pw) === a.pwHash) : false;
  if (!a || !ok) {
    err.textContent = t('tInvalidCreds');
    err.classList.remove('hidden');
    return false;
  }
  err.classList.add('hidden');
  loginAs(a);
  return true;
}
function showRecoverForm() {
  switchAuth('login');
  $('loginForm').classList.add('hidden');
  $('recoverForm').classList.remove('hidden');
  $('resetForm').classList.add('hidden');
  $('recoverEmail').focus();
}
function doRecover(e) {
  e.preventDefault();
  var email = ($('recoverEmail').value || '').trim().toLowerCase();
  var err = $('recoverErr');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    err.textContent = t('tInvalidEmail');
    err.classList.remove('hidden');
    return false;
  }
  err.classList.add('hidden');
  if (!sbIsOnline()) {
    err.textContent = t('sbOfflineLogin');
    err.classList.remove('hidden');
    return false;
  }
  sbRecover(email).then(function () {
    err.textContent = t('sbRecoverSent');
    err.classList.remove('hidden');
  }).catch(function () {
    err.textContent = t('sbRecoverFailed');
    err.classList.remove('hidden');
  });
  return false;
}
function doResetPassword(e) {
  e.preventDefault();
  var pw = $('resetPw').value, pw2 = $('resetPw2').value;
  var err = $('resetErr');
  function fail(msg) { err.textContent = msg; err.classList.remove('hidden'); return false; }
  if (pw.length < 6) return fail(t('tPwShort'));
  if (pw !== pw2) return fail(t('tPwMismatch'));
  if (!sbRecoveryToken) return fail(t('sbResetFailed'));
  var tok = sbRecoveryToken;
  sbSetNewPassword(tok, pw).then(function (r) {
    if (!r.ok) { err.textContent = t('sbResetFailed'); err.classList.remove('hidden'); return; }
    // Keep the device account in sync so offline login keeps working.
    sbGetUser(tok).then(function (u) {
      var em = u && u.data && u.data.email;
      if (em) {
        var a = findAccount(em);
        if (a && a.role !== 'super') {
          a.pwHash = hashPw(pw);
          var l2 = loadAccounts();
          for (var i = 0; i < l2.length; i++) if (l2[i].email === em) l2[i] = a;
          saveAccounts(l2);
        }
      }
    }).catch(function () { /* email lookup failed — server password still set */ });
    sbRecoveryToken = null;
    try { history.replaceState(null, '', location.pathname); } catch (e2) {}
    $('resetForm').classList.add('hidden');
    $('loginForm').classList.remove('hidden');
    err.classList.add('hidden');
    toast(t('sbResetDone'));
    switchAuth('login');
  }).catch(function () {
    err.textContent = t('sbResetFailed');
    err.classList.remove('hidden');
  });
  return false;
}
function sbBoot() {
  // Password-reset / email-confirm links land back here with a hash.
  try {
    var h = (typeof location !== 'undefined' && location.hash) || '';
    if (h && h.indexOf('access_token=') !== -1) {
      var params = {};
      h.slice(1).split('&').forEach(function (p) { var kv = p.split('='); params[kv[0]] = decodeURIComponent(kv[1] || ''); });
      if (params.type === 'recovery' && params.access_token) {
        sbRecoveryToken = params.access_token;
        showView('login'); switchAuth('login');
        $('loginForm').classList.add('hidden');
        $('resetForm').classList.remove('hidden');
        return;
      }
      if ((params.type === 'signup' || params.type === 'invite') && params.access_token) {
        try { history.replaceState(null, '', location.pathname); } catch (e2) {}
        toast(t('sbEmailConfirmed'));
        return;
      }
    }
  } catch (e) {}
  // Resume a stored server session: refresh it if needed and retry a
  // pending backup. Never blocks the local session.
  if (!state.user || !state.sb) return;
  if (state.user.role !== 'school' || sbLoadMig(state.sb.uid)) return;
  sbGetValidToken().then(function (tok) {
    if (!tok) return;
    sbMaybeMigrate(state.user, state.sb.uid, tok);
  }).catch(function () { /* offline — retry on next login */ });
}

/* ================= One-time migration upload (v27) =================
   On first Supabase login for a school account, the account's local data
   is uploaded once into the ss_ tables. Idempotent: every table is read
   first and rows already on the server are skipped. After upload the
   counts are read back and compared with the local counts; only then is
   the account marked migrated. Local data is NEVER deleted. The app keeps
   localStorage as its working store after migration (v28+ moves screens
   to the server); a second device signing in starts empty locally —
   download/sync is a later phase, not v27. Migration never runs for the
   Super Admin (the platform demo DB is not a school) or for parents. */
function sbNullIfEmpty(v) { return (v === '' || v === undefined || v === null) ? null : v; }
function sbMapStudent(s, schoolId) {
  return { school_id: schoolId, local_id: s.id, name: s.name || '', cls: s.cls || '', roll: s.roll || 0,
    enr: sbNullIfEmpty(s.enr), guardian: s.guardian || '', phone: s.phone || '', mobile2: s.mobile2 || '',
    parent_email: s.parentEmail || '', father_name: s.fatherName || '', mother_name: s.motherName || '',
    occupation: s.occupation || '', dob: sbNullIfEmpty(s.dob),
    gender: (s.gender === 'Boy' || s.gender === 'Girl') ? s.gender : '',
    blood_group: s.bloodGroup || '', category: s.category || '', address: s.address || '',
    state: s.state || '', district: s.district || '', pin: s.pin || '',
    previous_school: s.previousSchool || '', previous_class: s.previousClass || '',
    admission_no: sbNullIfEmpty(s.admissionNo), admission_date: sbNullIfEmpty(s.admissionDate),
    session: s.session || '', status: s.status || 'Active', result: (s.result === undefined || s.result === null) ? null : s.result,
    parent_pin: s.parentPin || null, photo_data_url: s.photo || null,
    documents: s.documents || { birthCert: false, tc: false, tcNumber: '', other: '' },
    aadhaar: sbNullIfEmpty(s.aadhaar) };
}
function sbMapFeeStructure(f, schoolId) {
  return { school_id: schoolId, cls: f.cls || '', fee_type: f.type || 'Tuition', amount: f.amount || 0 };
}
function sbMapFeeRecord(r, schoolId, stuMap) {
  return { school_id: schoolId, local_id: r.id, student_id: stuMap[r.studentId] || null,
    student_name: r.student || '', cls: r.cls || '', month: r.month || '', fee_type: r.type || 'Tuition',
    amount: r.amount || 0, status: r.status || 'Pending', record_date: sbNullIfEmpty(r.date) };
}
function sbMapTeacher(te, schoolId) {
  return { school_id: schoolId, local_id: te.id, name: te.name || '', subject: te.subject || '', cls: te.cls || '' };
}
function sbMapExam(e, schoolId) {
  return { school_id: schoolId, local_id: e.id, name: e.name || '', cls: e.cls || '', subject: e.subject || '',
    exam_date: sbNullIfEmpty(e.date), total: e.total || 100 };
}
function sbMapHomework(h, schoolId, stuMap) {
  return { school_id: schoolId, local_id: h.id, cls: h.cls || '', subject: h.subject || '', title: h.title || '',
    due: sbNullIfEmpty(h.due), done_by: (h.doneBy || []).map(function (id) { return stuMap[id]; }).filter(function (x) { return !!x; }) };
}
function sbMapNotice(n, schoolId) {
  return { school_id: schoolId, local_id: n.id, title: n.title || '', notice_date: sbNullIfEmpty(n.date), body: n.body || '' };
}
function sbMapReceipt(rc, schoolId, stuMap, byId) {
  var s = byId[rc.studentId] || {};
  return { school_id: schoolId, student_id: stuMap[rc.studentId] || null, receipt_no: rc.receiptNo || '',
    admission_no: rc.admissionNo || s.admissionNo || s.enr || '', student_name: rc.name || s.name || '',
    cls: rc.cls || s.cls || '', session: rc.session || '', receipt_date: sbNullIfEmpty(rc.date),
    month: rc.month || '', counter_no: rc.counterNo || 0, lines: rc.lines || [], pay_mode: rc.payMode || 'Cash',
    pay_date: sbNullIfEmpty(rc.payDate), bank: rc.bank || '', number: rc.number || '',
    total: rc.total || 0, total_words: rc.totalWords || '', collector: rc.collector || '' };
}
function sbMapAudit(a, schoolId) {
  return { school_id: schoolId, ts: a.ts || new Date().toISOString(), actor: a.actor || 'system', action: a.action || '', details: a.details || '' };
}
function sbMapActivity(a, schoolId) {
  var row = { school_id: schoolId, icon: a.icon || '', bg: a.bg || '', title: a.title || '', sub: a.sub || '' };
  if (a.ts) row.created_at = a.ts;
  return row;
}
function sbFlattenAttendance(d) {
  var out = [];
  Object.keys(d.attendance || {}).forEach(function (key) {
    var parts = key.split('|');
    var recs = d.attendance[key] || {};
    Object.keys(recs).forEach(function (sid) {
      out.push({ date: parts[0], cls: parts[1] || '', studentId: sid, status: recs[sid] });
    });
  });
  return out;
}
function sbLocalCounts(d) {
  return { students: (d.students || []).length, feeRecords: (d.feeRecords || []).length,
    feeStructure: (d.feeStructure || []).length, attendance: sbFlattenAttendance(d).length,
    receipts: (d.receipts || []).length, auditLog: (d.auditLog || []).length,
    activities: (d.activities || []).length, teachers: (d.teachers || []).length,
    exams: (d.exams || []).length, marks: (d.marks || []).length,
    homework: (d.homework || []).length, notices: (d.notices || []).length };
}
function sbNormTs(v) { return String(v || '').slice(0, 19); }
// Upload rows that are not on the server yet. keyFn builds the dedupe key
// from a row (local or server). onInserted receives ALL rows for the table
// (existing + inserted) so callers can build id maps. Returns a promise
// of the number of rows inserted.
function sbUploadMissing(token, schoolId, table, selectCols, rows, keyFn, onInserted) {
  if (!rows.length) return Promise.resolve(0);
  return sbRest('GET', table + '?select=' + selectCols + '&school_id=eq.' + encodeURIComponent(schoolId) + '&limit=5000', token).then(function (r) {
    if (!r.ok) throw new Error('read-' + table);
    var existing = Array.isArray(r.data) ? r.data : [];
    var seen = {};
    existing.forEach(function (row) { seen[keyFn(row)] = true; });
    var missing = rows.filter(function (row) { return !seen[keyFn(row)]; });
    if (onInserted) onInserted(existing);
    if (!missing.length) return 0;
    return sbRest('POST', table, token, missing, 'return=representation').then(function (r2) {
      if (!r2.ok) throw new Error('insert-' + table);
      var inserted = Array.isArray(r2.data) ? r2.data : [];
      if (onInserted) onInserted(existing.concat(inserted));
      return inserted.length;
    });
  });
}
function sbEnsureServerSchool(account, sbUid, token, d) {
  return sbRest('GET', 'ss_schools?select=id&owner_id=eq.' + encodeURIComponent(sbUid), token).then(function (r) {
    if (r.ok && Array.isArray(r.data) && r.data.length) {
      sbSaveServerSchool(account.uid, r.data[0].id);
      return r.data[0].id;
    }
    var p = d.profile || {};
    var e = d.feeExtras || {};
    var row = { owner_id: sbUid, name: p.name || account.school || '', city: p.city || '', principal: p.principal || '',
      phone: p.phone || '', email: p.email || account.email || '', session: p.session || '2025–26',
      address: p.address || '', logo_data_url: p.logo || null, plan: 'Active', status: 'active', is_demo: false,
      adm_counter: d.admCounter || 1, receipt_counter: d.receiptCounter || 1,
      admission_fee: e.admissionFee || 0, caution_money: e.cautionMoney || 0,
      annual_charges: e.annualCharges || 0, transport_fee: e.transportFee || 0 };
    return sbRest('POST', 'ss_schools', token, row, 'return=representation').then(function (r2) {
      if (!r2.ok || !Array.isArray(r2.data) || !r2.data.length) throw new Error('create-school');
      sbSaveServerSchool(account.uid, r2.data[0].id);
      return r2.data[0].id;
    });
  });
}
function sbVerifyCounts(token, schoolId, counts) {
  var checks = [
    ['ss_students', 'local_id', counts.students], ['ss_fee_records', 'local_id', counts.feeRecords],
    ['ss_fee_structure', 'cls', counts.feeStructure], ['ss_attendance', 'student_id', counts.attendance],
    ['ss_receipts', 'receipt_no', counts.receipts], ['ss_audit_log', 'ts', counts.auditLog],
    ['ss_activities', 'title', counts.activities], ['ss_teachers', 'local_id', counts.teachers],
    ['ss_exams', 'local_id', counts.exams], ['ss_marks', 'exam_id', counts.marks],
    ['ss_homework', 'local_id', counts.homework], ['ss_notices', 'local_id', counts.notices]
  ];
  var chain = Promise.resolve({ ok: true, detail: '' });
  checks.forEach(function (c) {
    chain = chain.then(function (acc) {
      if (!acc.ok) return acc;
      return sbRest('GET', c[0] + '?select=' + c[1] + '&school_id=eq.' + encodeURIComponent(schoolId) + '&limit=5000', token).then(function (r) {
        if (!r.ok) return { ok: false, detail: 'verify-' + c[0] };
        var got = Array.isArray(r.data) ? r.data.length : 0;
        // Server may hold MORE rows than this device (another device already
        // migrated) — that is fine. Fewer means this upload did not land.
        if (got < c[2]) return { ok: false, detail: c[0] + ' ' + got + '/' + c[2] };
        return acc;
      });
    });
  });
  return chain;
}
function sbMaybeMigrate(account, sbUid, token, force) {
  if (sbMigPromise) return sbMigPromise;
  if (!account || account.role !== 'school') return Promise.resolve({ done: false, reason: 'not-school' });
  if (!force && sbLoadMig(sbUid)) return Promise.resolve({ done: true, reason: 'already' });
  if (!sbIsOnline()) { sbSetStatus('offline'); return Promise.resolve({ done: false, reason: 'offline' }); }
  sbSetStatus('uploading');
  var d = db; // the account's DB is loaded by loginAs before this runs
  var counts = sbLocalCounts(d);
  var schoolId = null, stuMap = {}, examMap = {};
  var byId = {};
  (d.students || []).forEach(function (s) { byId[s.id] = s; });
  sbMigPromise = sbEnsureServerSchool(account, sbUid, token, d).then(function (id) {
    schoolId = id;
    if (!schoolId) throw new Error('no-school-id');
    return sbUploadMissing(token, schoolId, 'ss_fee_structure', 'cls,fee_type',
      (d.feeStructure || []).map(function (f) { return sbMapFeeStructure(f, schoolId); }),
      function (row) { return row.cls + '|' + row.fee_type; });
  }).then(function () {
    return sbUploadMissing(token, schoolId, 'ss_students', 'local_id,id',
      (d.students || []).map(function (s) { return sbMapStudent(s, schoolId); }),
      function (row) { return row.local_id; },
      function (rows) { rows.forEach(function (r) { if (r.local_id) stuMap[r.local_id] = r.id; }); });
  }).then(function () {
    return sbUploadMissing(token, schoolId, 'ss_teachers', 'local_id',
      (d.teachers || []).map(function (te) { return sbMapTeacher(te, schoolId); }),
      function (row) { return row.local_id; });
  }).then(function () {
    return sbUploadMissing(token, schoolId, 'ss_exams', 'local_id,id',
      (d.exams || []).map(function (e) { return sbMapExam(e, schoolId); }),
      function (row) { return row.local_id; },
      function (rows) { rows.forEach(function (r) { if (r.local_id) examMap[r.local_id] = r.id; }); });
  }).then(function () {
    return sbUploadMissing(token, schoolId, 'ss_fee_records', 'local_id',
      (d.feeRecords || []).map(function (r) { return sbMapFeeRecord(r, schoolId, stuMap); }),
      function (row) { return row.local_id; });
  }).then(function () {
    var attRows = sbFlattenAttendance(d).filter(function (a) { return !!stuMap[a.studentId]; }).map(function (a) {
      return { school_id: schoolId, att_date: a.date, cls: a.cls, student_id: stuMap[a.studentId], status: a.status };
    });
    return sbUploadMissing(token, schoolId, 'ss_attendance', 'att_date,cls,student_id', attRows,
      function (row) { return row.att_date + '|' + row.cls + '|' + row.student_id; });
  }).then(function () {
    return sbUploadMissing(token, schoolId, 'ss_receipts', 'receipt_no',
      (d.receipts || []).map(function (rc) { return sbMapReceipt(rc, schoolId, stuMap, byId); }),
      function (row) { return row.receipt_no; });
  }).then(function () {
    var markRows = (d.marks || []).filter(function (m) { return examMap[m.examId] && stuMap[m.studentId]; }).map(function (m) {
      return { school_id: schoolId, exam_id: examMap[m.examId], student_id: stuMap[m.studentId], marks: m.marks };
    });
    return sbUploadMissing(token, schoolId, 'ss_marks', 'exam_id,student_id', markRows,
      function (row) { return row.exam_id + '|' + row.student_id; });
  }).then(function () {
    return sbUploadMissing(token, schoolId, 'ss_homework', 'local_id',
      (d.homework || []).map(function (h) { return sbMapHomework(h, schoolId, stuMap); }),
      function (row) { return row.local_id; });
  }).then(function () {
    return sbUploadMissing(token, schoolId, 'ss_notices', 'local_id',
      (d.notices || []).map(function (n) { return sbMapNotice(n, schoolId); }),
      function (row) { return row.local_id; });
  }).then(function () {
    return sbUploadMissing(token, schoolId, 'ss_audit_log', 'ts,actor,action,details',
      (d.auditLog || []).map(function (a) { return sbMapAudit(a, schoolId); }),
      function (row) { return sbNormTs(row.ts) + '|' + row.actor + '|' + row.action + '|' + row.details; });
  }).then(function () {
    return sbUploadMissing(token, schoolId, 'ss_activities', 'title,sub',
      (d.activities || []).map(function (a) { return sbMapActivity(a, schoolId); }),
      function (row) { return row.title + '|' + row.sub; });
  }).then(function () {
    return sbVerifyCounts(token, schoolId, counts);
  }).then(function (v) {
    sbMigPromise = null;
    if (!v.ok) {
      sbSetStatus('failed', v.detail);
      return { done: false, reason: 'verify', detail: v.detail };
    }
    sbSaveMig(sbUid, { at: new Date().toISOString(), schoolId: schoolId, counts: counts });
    sbSetStatus('synced');
    return { done: true, reason: 'ok', schoolId: schoolId, counts: counts };
  }).catch(function (err) {
    sbMigPromise = null;
    sbSetStatus('failed', (err && err.message) || 'error');
    return { done: false, reason: 'error', detail: (err && err.message) || 'error' };
  });
  return sbMigPromise;
}
function sbRetryMigration() {
  if (!state.user || state.user.role !== 'school') { toast(t('sbStatusNotSchool')); return; }
  if (!state.sb || !state.sb.uid) { toast(t('sbStatusPending')); return; }
  toast(t('sbStatusUploading'));
  sbGetValidToken().then(function (tok) {
    if (!tok) { sbSetStatus('offline'); toast(t('sbStatusOffline')); renderApp(); return; }
    return sbMaybeMigrate(state.user, state.sb.uid, tok, true).then(function (r) {
      toast(r.done ? t('sbBackupDone') : t('sbBackupFailed'));
      renderApp();
    });
  }).catch(function () { toast(t('sbBackupFailed')); });
}
// Public Apply form -> server (anon). MUST use return=minimal: anon has no
// SELECT on ss_admission_requests, so asking for the row back fails with
// 401 even though the insert itself succeeds (verified 9 Nov 2026).
function sbPostAdmission(serverSchoolId, req) {
  var body = { school_id: serverSchoolId, local_id: req.id, name: req.name, dob: sbNullIfEmpty(req.dob),
    gender: req.gender || '', class_apply: req.classApply, guardian_name: req.guardianName || '',
    phone: req.phone, previous_school: req.previousSchool || '', status: 'Pending', reason: '',
    submitted: req.submitted || todayIST() };
  return sbRest('POST', 'ss_admission_requests', SB_ANON_KEY, body, 'return=minimal');
}



/* ================= seed data ================= */
var SCHOOL_NAMES = [
  ['St. Xavier School','Patna',1250,'active','Active'], ['DAV Public School','Gaya',1100,'active','Active'],
  ['Bright Future School','Muzaffarpur',980,'active','Active'], ['Holy Child School','Bhagalpur',860,'active','Active'],
  ['Sunrise Academy','Darbhanga',750,'active','Active'], ['Saraswati Vidya Mandir','Gopalganj',620,'active','Active'],
  ['Gyanlok Public School','Baliwan Sagar',500,'active','Trial'], ['St. Joseph\'s School','Siwan',940,'active','Active'],
  ['Delhi Public School','Patna',1480,'active','Active'], ['Notre Dame Academy','Patna',1120,'active','Active'],
  ['Kendriya Vidyalaya','Chhapra',890,'active','Expired'], ['Bal Vidyapeeth','Hajipur',430,'active','Trial'],
  ['St. Mary\'s School','Motihari',760,'active','Active'], ['Rose Public School','Bettiah',540,'active','Active'],
  ['Modern Public School','Samastipur',690,'active','Active'], ['Vidya Niketan','Ara',610,'active','Active'],
  ['Little Scholars Public School','Siwan',380,'pending','Active'], ['Gyan Jyoti Vidyalaya','Chhapra',290,'pending','Active'],
  ['Carmel High School','Patna',1050,'active','Active'], ['Don Bosco Academy','Patna',980,'active','Active'],
  ['St. Karen\'s School','Patna',870,'active','Expired'], ['Radiant Public School','Gopalganj',450,'active','Active'],
  ['Oxford Public School','Muzaffarpur',720,'active','Expired'], ['Mount Carmel School','Gaya',660,'active','Expired']
];
var FIRST = ['Aarav','Vivaan','Aditya','Arjun','Sai','Reyansh','Krishna','Ishaan','Rohan','Kabir','Ananya','Diya','Aadhya','Myra','Sara','Ira','Priya','Riya','Anika','Navya','Aarush','Vihaan','Aryan','Dhruv','Meera','Kavya','Sneha','Pooja','Nikhil','Varun','Rahul','Sana','Ishita','Tanvi','Yash','Om','Dev','Rudra','Aisha','Zara','Farhan','Imran','Nisha','Kiran','Manav','Shreya'];
var LAST = ['Kumar','Singh','Sharma','Verma','Gupta','Mishra','Tiwari','Yadav','Jha','Pandey','Choudhary','Ranjan','Srivastava','Dubey','Sinha','Patel','Das','Roy','Kumari','Devi'];
var GIRL_NAMES = ['Ananya', 'Diya', 'Aadhya', 'Myra', 'Sara', 'Ira', 'Priya', 'Riya', 'Anika', 'Navya', 'Meera', 'Kavya', 'Sneha', 'Pooja', 'Sana', 'Ishita', 'Tanvi', 'Aisha', 'Zara', 'Nisha', 'Shreya'];
var CLASSES = ['6th-A','6th-B','7th-A','7th-B','8th-A','8th-B','9th-A','9th-B','10th-A','10th-B'];
var FEE_TYPES = ['Tuition', 'Admission', 'Transport', 'Exam', 'Library', 'Activity', 'Computer Lab', 'Other'];
var MONTHS_ACAD = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
var MONTH_NUM = { Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12, Jan: 1, Feb: 2, Mar: 3 };
var FEE_TYPE_KEYS = { 'Tuition': 'feeTypeTuition', 'Admission': 'feeTypeAdmission', 'Transport': 'feeTypeTransport', 'Exam': 'feeTypeExam', 'Library': 'feeTypeLibrary', 'Activity': 'feeTypeActivity', 'Computer Lab': 'feeTypeComputer', 'Other': 'feeTypeOther' };
function defaultFeeStructure() {
  var amt = { '6': 800, '7': 900, '8': 1000, '9': 1200, '10': 1500 };
  return CLASSES.map(function (c) { return { cls: c, type: 'Tuition', amount: amt[c.split('th')[0]] || 1000 }; });
}
function monthStartDate(m) { // 1st of the month, on the seed's 2026-based academic timeline
  var n = MONTH_NUM[m] || 4, y = n >= 4 ? 2026 : 2027;
  return y + '-' + String(n).padStart(2, '0') + '-01';
}
var SUBJECTS = ['Mathematics','Science','English','Hindi','Social Science'];

function seedDB() {
  var schools = SCHOOL_NAMES.map(function (s, i) {
    return { id: 'sch' + (i + 1), name: s[0], city: s[1], students: s[2], status: s[3], plan: s[4],
      users: 180 + ((i * 137) % 900), since: '202' + (i % 5) + '-0' + ((i % 9) + 1) + '-15' };
  });
  // 40 students, 4 per class-section; first two are Riya & Priya (10th-A)
  var students = [];
  var fi = 0;
  CLASSES.forEach(function (cls, ci) {
    for (var r = 1; r <= 4; r++) {
      var idx = ci * 4 + (r - 1);
      var name;
      if (cls === '10th-A' && r === 1) name = 'Riya Kumari';
      else if (cls === '10th-A' && r === 2) name = 'Priya Kumari';
      else { name = FIRST[fi % FIRST.length] + ' ' + LAST[(fi * 7 + 3) % LAST.length]; fi++; }
      var feePending = (idx % 6 === 4); // ~7 of 40 pending
      var rec = { id: 'stu' + (idx + 1), name: name, cls: cls, roll: r, enr: 'ENR-' + String(idx + 1).padStart(3, '0'),
        guardian: 'Mr. ' + LAST[(idx * 5 + 1) % LAST.length],
        phone: '98' + String(10000000 + ((idx * 7919) % 89999999)),
        att: 85 + ((idx * 7) % 14), result: 62 + ((idx * 11) % 36),
        fee: feePending ? 'Pending' : 'Paid',
        status: 'Active', session: '2025–26', admissionNo: 'ADM-2025-' + String(idx + 1).padStart(3, '0'), admissionDate: '',
        dob: '', gender: GIRL_NAMES.indexOf(name.split(' ')[0]) !== -1 ? 'Girl' : 'Boy', bloodGroup: '', category: '',
        address: '', state: '', district: '', pin: '',
        fatherName: 'Mr. ' + LAST[(idx * 5 + 1) % LAST.length], motherName: 'Mrs. ' + LAST[(idx * 5 + 1) % LAST.length],
        mobile2: '', parentEmail: '', occupation: '', previousSchool: '', previousClass: '',
        documents: { birthCert: idx % 4 !== 3, tc: idx % 2 === 0, tcNumber: idx % 2 === 0 ? 'TC-' + (1000 + idx) : '', other: '' }, aadhaar: '' };
      if (cls === '10th-A' && r === 1) { rec.att = 92; rec.result = 95; rec.fee = 'Paid'; }
      if (cls === '10th-A' && r === 2) { rec.att = 94; rec.result = 91; rec.fee = 'Paid'; }
      students.push(rec);
    }
  });
  var teachers = [
    ['Sunita Sharma','Mathematics','10th-A'], ['Rajesh Kumar','Science','10th-B'], ['Anita Verma','English','9th-A'],
    ['Vikram Singh','Hindi','8th-A'], ['Pooja Mishra','Social Science','9th-B'], ['Amit Jha','Mathematics','8th-B'],
    ['Neha Gupta','Science','7th-A'], ['Suresh Yadav','English','6th-A'], ['Kavita Tiwari','Hindi','7th-B'],
    ['Manoj Pandey','Mathematics','9th-B'], ['Rekha Sinha','Science','6th-B'], ['Deepak Choudhary','English','10th-A']
  ].map(function (t, i) { return { id: 't' + (i + 1), name: t[0], subject: t[1], cls: t[2] }; });
  // Fee records: split each month's totals into exact records (deterministic, sums exact)
  var feeRecords = [], fid = 1;
  FEE_MONTHS.forEach(function (mo, mi) {
    function split(total, n, status) {
      var base = Math.floor(total / n), rem = total - base * (n - 1);
      for (var k = 0; k < n; k++) {
        var amt = (k === n - 1) ? rem : base;
        var idx = status === 'Pending' ? (mi * 4 + k) : (mi * 9 + k * 3); // pending: 20 distinct students
        var st = students[idx % students.length];
        feeRecords.push({ id: 'fee' + (fid++), studentId: st.id, student: st.name, cls: st.cls,
          month: mo.m, type: 'Tuition', amount: amt, status: status, date: '2026-0' + (mi + 4) + '-' + String(3 + ((k * 5) % 24)).padStart(2, '0') });
      }
    }
    split(mo.collected, 10, 'Collected');
    split(mo.pending, 4, 'Pending');
  });
  // Riya Kumari (demo student) gets one Collected record so her "Paid" status is evidence-based (totals unchanged).
  var riyaStu = students.find(function (s) { return s.name === 'Riya Kumari'; });
  if (riyaStu) {
    var donorRec = feeRecords.find(function (r) { return r.month === 'Apr' && r.status === 'Collected' && r.studentId === students[27].id; });
    if (donorRec) { donorRec.studentId = riyaStu.id; donorRec.student = riyaStu.name; donorRec.cls = riyaStu.cls; }
  }
  var today = todayIST();
  var attRecords = {};
  students.filter(function (s) { return s.cls === '10th-A'; }).forEach(function (s, i) {
    attRecords[s.id] = (i === 2) ? 'Absent' : (i === 3) ? 'Late' : 'Present';
  });
  return {
    v: 2,
    schools: schools,
    students: students,
    teachers: teachers,
    feeMonths: FEE_MONTHS,
    feeRecords: feeRecords,
    feeStructure: defaultFeeStructure(),
    feeExtras: { admissionFee: 0, cautionMoney: 0, annualCharges: 0, transportFee: 0 },
    admCounter: 41,
    receipts: [],
    receiptCounter: 1,
    auditLog: [],
    attendanceAgg: { present: 0, absent: 0, late: 0 },
    attendance: (function () { var a = {}; a[today + '|10th-A'] = attRecords; return a; })(),
    exams: [
      { id: 'ex1', name: 'Unit Test 1', cls: '10th-A', subject: 'Mathematics', date: '2026-08-12', total: 100 },
      { id: 'ex2', name: 'Unit Test 2', cls: '10th-A', subject: 'Science', date: '2026-09-18', total: 100 },
      { id: 'ex3', name: 'Half Yearly Exam', cls: '10th-A', subject: 'All Subjects', date: '2026-10-06', total: 100 },
      { id: 'ex4', name: 'Unit Test 1', cls: '9th-A', subject: 'Mathematics', date: '2026-08-14', total: 100 },
      { id: 'ex5', name: 'Monthly Test', cls: '8th-B', subject: 'English', date: '2026-10-20', total: 50 }
    ],
    marks: [
      { examId: 'ex1', studentId: 'stu33', marks: 95 }, { examId: 'ex1', studentId: 'stu34', marks: 91 },
      { examId: 'ex1', studentId: 'stu35', marks: 78 }, { examId: 'ex1', studentId: 'stu36', marks: 84 },
      { examId: 'ex2', studentId: 'stu33', marks: 93 }, { examId: 'ex2', studentId: 'stu34', marks: 88 },
      { examId: 'ex3', studentId: 'stu33', marks: 95 }, { examId: 'ex3', studentId: 'stu34', marks: 90 }
    ],
    homework: [
      { id: 'hw1', cls: '10th-A', subject: 'Mathematics', title: 'Ex 5.2 — Q1 to Q10', due: '2026-11-10', doneBy: ['stu34'] },
      { id: 'hw2', cls: '10th-A', subject: 'Science', title: 'Light chapter notes + diagram', due: '2026-11-11', doneBy: [] },
      { id: 'hw3', cls: '9th-A', subject: 'English', title: 'Essay — My Favourite Festival', due: '2026-11-12', doneBy: ['stu33'] },
      { id: 'hw4', cls: '8th-B', subject: 'Hindi', title: 'Nibandh — Swachh Bharat', due: '2026-11-13', doneBy: [] }
    ],
    notices: [
      { id: 'n1', title: 'Annual Sports Day', date: '2026-11-07', body: 'Annual Sports Day will be held on 20 November 2026 at the school ground. All students must report in sports uniform by 8:00 AM.' },
      { id: 'n2', title: 'Parent-Teacher Meeting', date: '2026-11-05', body: 'PTM for Classes 6–10 will be held on Saturday, 15 November 2026, 10:00 AM – 1:00 PM. Parents are requested to attend.' },
      { id: 'n3', title: 'Diwali Holidays', date: '2026-10-28', body: 'School will remain closed from 30 October to 2 November 2026 for Diwali. Classes resume on 3 November 2026.' }
    ],
    activities: [
      { icon: '💰', bg: 'green', title: 'New fee payment received', sub: 'by Priya Kumari' },
      { icon: '✅', bg: 'blue', title: 'Attendance updated', sub: 'Class 10th-A' },
      { icon: '📢', bg: 'orange', title: 'New notice published', sub: 'Annual Sports Day' }
    ],
    profile: { name: 'St. Xavier School', city: 'Patna', principal: 'Rahul Kumar', phone: '+91 98350 12345', email: 'info@stxavierpatna.edu.in', session: '2025–26', address: 'Boring Road, Patna, Bihar — 800001' }
  };
}

/* ================= empty school DB (v20) =================
   What a brand-new school gets, and what Reset All Data leaves
   behind: NOTHING but the school's identity and its fee-structure
   settings. No demo students, teachers, fees, attendance, exams,
   marks, homework, notices, receipts or audit entries. The seed
   function above stays in the code for TESTS ONLY (harness fixtures
   and the Super Admin platform DB) — no real account path may call
   it to populate a school anymore. */
function emptyDb(profile, schools) {
  var p = profile || { name: '', city: '', principal: '', phone: '', email: '', session: '2025–26', address: '' };
  return {
    v: 2,
    schools: schools || [],
    students: [],
    teachers: [],
    feeMonths: FEE_MONTHS,
    feeRecords: [],
    feeStructure: defaultFeeStructure(),
    feeExtras: defaultFeeExtras(),
    admCounter: 1,
    receipts: [],
    receiptCounter: 1,
    auditLog: [],
    attendanceAgg: { present: 0, absent: 0, late: 0 },
    attendance: {},
    admissionRequests: [],
    exams: [],
    marks: [],
    homework: [],
    notices: [],
    activities: [],
    profile: p,
    feeClsAlignedV9: true
  };
}

/* ================= DB helpers ================= */
function migrateAttendance(d) {
  // Old shape: { date, cls, records } (single day). New: keyed by 'YYYY-MM-DD|Class'.
  if (d.attendance && d.attendance.date) {
    var key = d.attendance.date + '|' + (d.attendance.cls || '10th-A');
    var att = {}; att[key] = d.attendance.records || {};
    d.attendance = att;
  }
  if (!d.attendance || typeof d.attendance !== 'object') d.attendance = {};
  return d;
}
function migrateFeesV7(d) {
  // Fees v2 -> v7 migration for existing DBs (e.g. the user's phone): ENR numbers
  // in seed order, 'Tuition' on old fee records, default fee structure if missing.
  // Idempotent; never changes amounts or statuses.
  (d.students || []).forEach(function (s, i) {
    if (!s.enr) s.enr = 'ENR-' + String(i + 1).padStart(3, '0');
  });
  (d.feeRecords || []).forEach(function (r) { if (!r.type) r.type = 'Tuition'; });
  if (!Array.isArray(d.feeStructure) || !d.feeStructure.length) d.feeStructure = defaultFeeStructure();
  return d;
}
function migrateStudentsV9(d) {
  // Phase 1 (Student Management) migration for existing v2 DBs: admission numbers,
  // status, session, documents checklist, audit log. Idempotent; never changes
  // existing values, amounts or statuses. Admission dates are NOT fabricated —
  // old records keep admissionDate blank until edited.
  var maxAdm = 0;
  (d.students || []).forEach(function (s) {
    var m = /^ADM-(\d{4})-(\d+)$/.exec(s.admissionNo || '');
    if (m) maxAdm = Math.max(maxAdm, parseInt(m[2], 10));
  });
  var next = Math.max(maxAdm + 1, d.admCounter || 1);
  var year = ((d.profile && d.profile.session ? String(d.profile.session).match(/\d{4}/) : null) || ['2025'])[0];
  (d.students || []).forEach(function (s) {
    if (!s.admissionNo) { s.admissionNo = 'ADM-' + year + '-' + String(next).padStart(3, '0'); next++; }
    if (!s.status) s.status = 'Active';
    if (!s.session) s.session = (d.profile && d.profile.session) || '2025–26';
    if (!s.documents) s.documents = { birthCert: false, tc: false, tcNumber: '', other: '' };
    if (s.documents.birthCert == null) s.documents.birthCert = false;
    if (s.documents.tc == null) s.documents.tc = false;
  });
  // One-time repair (v9): align feeRecord.cls to the owning student's cls. All
  // current records are seed records, so this fixes the Riya 9th-A/10th-A
  // mismatch on existing DBs (incl. the user's phone). Guarded by a flag so
  // later class transfers keep OLD fee records under their historical cls —
  // the migration runs on every load, so an unconditional align would undo that.
  if (!d.feeClsAlignedV9) {
    (d.feeRecords || []).forEach(function (r) {
      var own = (d.students || []).find(function (s) { return s.id === r.studentId; });
      if (own && r.cls !== own.cls) r.cls = own.cls;
    });
    d.feeClsAlignedV9 = true;
  }
  d.admCounter = next;
  if (!Array.isArray(d.auditLog)) d.auditLog = [];
  return d;
}

/* ================= Phase 4: parent portal + admission requests =================
   Static scope: no server. A parent logs in with Admission No. + PIN on the
   device where the school's data lives; the PIN is the last 4 digits of the
   primary mobile unless the school set a custom one. Real password accounts
   arrive with the server phase. */
function parentPinFromPhone(phone) { var d = digitsOnly(phone); return d.length >= 4 ? d.slice(-4) : ''; }
function migrateV12(d) {
  // Phase 4 migration for existing v2 DBs: parent PINs + admission requests.
  // Idempotent; never changes existing values, amounts or statuses.
  (d.students || []).forEach(function (s) {
    if (s.parentPin === undefined) s.parentPin = parentPinFromPhone(s.phone);
  });
  if (!Array.isArray(d.admissionRequests)) d.admissionRequests = [];
  return d;
}
function defaultFeeExtras() { return { admissionFee: 0, cautionMoney: 0, annualCharges: 0, transportFee: 0 }; }
function migrateV13(d) {
  // Phase 5 (fee collection receipt) migration for existing v2 DBs: one-time /
  // annual fee amounts, saved receipts, receipt counter. Idempotent; never
  // changes existing values, amounts or statuses. All extra amounts default
  // to 0 — the school sets its own amounts, nothing is invented.
  if (!d.feeExtras || typeof d.feeExtras !== 'object') d.feeExtras = defaultFeeExtras();
  ['admissionFee', 'cautionMoney', 'annualCharges', 'transportFee'].forEach(function (k) {
    if (typeof d.feeExtras[k] !== 'number' || isNaN(d.feeExtras[k]) || d.feeExtras[k] < 0) d.feeExtras[k] = 0;
  });
  if (!Array.isArray(d.receipts)) d.receipts = [];
  if (!d.receiptCounter) {
    var max = 0;
    d.receipts.forEach(function (r) { var m = /^RCP-\d{4}-(\d+)$/.exec(r.receiptNo || ''); if (m) max = Math.max(max, parseInt(m[1], 10)); });
    d.receiptCounter = max + 1;
  }
  return d;
}
function storageKeys() {
  var out = [];
  try {
    if (typeof localStorage.key === 'function' && typeof localStorage.length === 'number') {
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k) out.push(k); }
      return out;
    }
  } catch (e) {}
  if (typeof localStorage.keys === 'function') { try { return localStorage.keys(); } catch (e2) {} }
  return out;
}
function readDbByKey(key) {
  try { var raw = localStorage.getItem(key); if (!raw) return null; var d = JSON.parse(raw); return (d && d.v === 2) ? d : null; }
  catch (e) { return null; }
}
function writeDbByKey(key, d) { try { localStorage.setItem(key, JSON.stringify(d)); } catch (e) {} }
function findStudentById(sid) {
  // Same device-wide scan as findStudentByAdmNo, but by student id (used to
  // restore a stored parent session after a refresh).
  var want = String(sid || '').trim();
  if (!want) return null;
  var found = null;
  storageKeys().forEach(function (key) {
    if (found) return;
    if (key.indexOf('schoolSaathiDB') !== 0 || key.slice(-4) === '.bak') return;
    var d = readDbByKey(key);
    if (!d) return;
    migrateV12(d);
    (d.students || []).some(function (s) {
      if (String(s.id || '') === want) { found = { student: s, dbKey: key, db: d }; return true; }
      return false;
    });
  });
  return found;
}
function findStudentByAdmNo(admNo) {
  // Search every school DB on this device for the admission number. Returns
  // { student, dbKey, db } or null. Migrates the found DB in memory so the
  // parent PIN is available even on a DB that has not loaded since v12.
  var want = String(admNo || '').trim().toLowerCase();
  if (!want) return null;
  var found = null;
  storageKeys().forEach(function (key) {
    if (found) return;
    if (key.indexOf('schoolSaathiDB') !== 0 || key.slice(-4) === '.bak') return;
    var d = readDbByKey(key);
    if (!d) return;
    migrateV12(d);
    (d.students || []).some(function (s) {
      if (String(s.admissionNo || '').trim().toLowerCase() === want) { found = { student: s, dbKey: key, db: d }; return true; }
      return false;
    });
  });
  return found;
}
function loadDB(override) {
  try {
    var raw = localStorage.getItem(DB_KEY);
    if (raw) {
      var d = JSON.parse(raw);
      if (d && d.v === 2) { var m = migrateV13(migrateV12(migrateStudentsV9(migrateFeesV7(migrateAttendance(d))))); saveDB(m); return m; }
      // Unknown version: keep a backup, never wipe silently.
      try { localStorage.setItem(DB_KEY + '.bak', raw); } catch (e2) { /* ignore */ }
    }
  } catch (e) { /* storage unavailable — fall back to memory */ }
  // v20: a brand-new school starts EMPTY — no demo students or fees.
  // The boot / Super Admin path (no override) still seeds the platform
  // demo DB, so the Super Admin network figures stay untouched.
  var fresh = override ? emptyDb() : seedDB();
  if (override) applySchoolProfile(fresh, override);
  saveDB(fresh);
  return fresh;
}
var MEM_FALLBACK = null;
function saveDB(db) {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
  catch (e) { MEM_FALLBACK = db; }
  MEM_FALLBACK = db;
}
var db = loadDB();

/* ================= state ================= */
var state = { role: null, user: null, view: 'dashboard', lang: 'en', parentStudentId: null, admReqFilter: 'All', feeFilter: 'All', feeType: 'All', feeSearch: '', feeStudent: null, feeGenMonth: 'Sep', feeFormOpen: false, feePreselect: null, stuSearch: '', stuClass: 'All', stuSection: 'All', stuSession: 'All', stuGender: 'All', stuFee: 'All', stuStatus: 'All', stuPage: 1, stuSort: 'name', stuSortDir: 1, profileStudent: null, profileTab: 'overview', attCls: '10th-A', attDate: '', examId: 'ex1', stuSel: {}, collectStudent: null, collectRecordId: null, savedReceiptId: null, sb: null };

/* Phase 2: bulk import + promotion state (in-memory only, never persisted). */
var importState = { rows: null, fileName: '', result: null };
var promoState = null;
var pendingIdPrint = []; // student ids queued for the ID-card print flow (in-memory only).
var collectDraft = null; // in-memory draft of the receipt being collected (never persisted until saved).

/* ================= utils ================= */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

/* ================= photos + school logo (v8) ================= */
function initialsOf(name) { return String(name || '').split(' ').filter(function (w) { return w; }).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase(); }
function avatarHTML(photo, name, cls) {
  var c = cls || 'avatar';
  if (photo) return '<span class="' + c + ' has-photo"><img src="' + esc(photo) + '" alt=""></span>';
  return '<span class="' + c + '">' + esc(initialsOf(name)) + '</span>';
}
function photoPrevHTML(photo, name) {
  if (photo) return '<img class="photo-prev" src="' + esc(photo) + '" alt="">';
  return '<span class="photo-prev">' + esc(initialsOf(name)) + '</span>';
}
function fitWithin(w, h, max) {
  w = +w || 0; h = +h || 0; max = +max || 0;
  if (!w || !h || !max) return { w: 0, h: 0 };
  var s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}
function dataUrlBytes(url) { var p = String(url || '').split(',')[1] || ''; return Math.floor(p.length * 0.75); }
function compressAttempts(w, h, opts) {
  var list = [];
  if (opts.format === 'png') {
    [opts.max, Math.round(opts.max / 2)].forEach(function (m) { var d = fitWithin(w, h, m); list.push({ w: d.w, h: d.h, q: 1, format: 'png' }); });
  } else {
    [0.8, 0.7, 0.6, 0.5].forEach(function (q) { var d = fitWithin(w, h, opts.max); list.push({ w: d.w, h: d.h, q: q, format: 'jpeg' }); });
    [384, 256].forEach(function (m) { var d = fitWithin(w, h, m); list.push({ w: d.w, h: d.h, q: 0.6, format: 'jpeg' }); });
  }
  return list;
}
var PHOTO_MAX = 512, PHOTO_CAP = 120 * 1024, LOGO_MAX = 256, LOGO_CAP = 250 * 1024;
var pendingPhoto = null, pendingLogo = null;
function compressImageFile(file, opts, cb) {
  if (typeof FileReader === 'undefined' || typeof Image === 'undefined' || typeof document === 'undefined' || !document.createElement) { cb(null, 'not-supported'); return; }
  if (!file) { cb(null, 'no-file'); return; }
  var reader = new FileReader();
  reader.onerror = function () { cb(null, 'read-failed'); };
  reader.onload = function () {
    var img = new Image();
    img.onerror = function () { cb(null, 'bad-image'); };
    img.onload = function () {
      try {
        var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
        if (!iw || !ih) { cb(null, 'bad-image'); return; }
        var attempts = compressAttempts(iw, ih, opts);
        for (var i = 0; i < attempts.length; i++) {
          var a = attempts[i];
          var c = document.createElement('canvas');
          c.width = a.w; c.height = a.h;
          var cx = c.getContext('2d');
          if (!cx) { cb(null, 'no-canvas'); return; }
          if (a.format === 'jpeg') { cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, a.w, a.h); }
          cx.drawImage(img, 0, 0, a.w, a.h);
          var url = a.format === 'png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', a.q);
          if (dataUrlBytes(url) <= opts.cap) { cb(url, null); return; }
        }
        cb(null, 'too-big');
      } catch (e) { cb(null, 'compress-failed'); }
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function onStudentPhoto(input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  compressImageFile(file, { max: PHOTO_MAX, cap: PHOTO_CAP, format: 'jpeg' }, function (url, err) {
    if (!url) { toast(err === 'too-big' ? t('tPhotoTooBig') : t('tPhotoError')); input.value = ''; return; }
    pendingPhoto = url;
    var prev = $('fStPhotoPrev');
    if (prev) prev.innerHTML = photoPrevHTML(url, $('fStName') ? $('fStName').value : '');
  });
}
function clearStudentPhoto() {
  pendingPhoto = '';
  var inp = $('fStPhoto'); if (inp) inp.value = '';
  var prev = $('fStPhotoPrev');
  if (prev) prev.innerHTML = photoPrevHTML(null, $('fStName') ? $('fStName').value : '');
}
function onSchoolLogo(input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  compressImageFile(file, { max: LOGO_MAX, cap: LOGO_CAP, format: 'png' }, function (url, err) {
    if (!url) { toast(err === 'too-big' ? t('tLogoTooBig') : t('tPhotoError')); input.value = ''; return; }
    pendingLogo = url;
    var prev = $('fPfLogoPrev');
    if (prev) prev.innerHTML = '<img class="photo-prev" src="' + esc(url) + '" alt="">';
  });
}
function clearSchoolLogo() {
  pendingLogo = '';
  var inp = $('fPfLogo'); if (inp) inp.value = '';
  var prev = $('fPfLogoPrev');
  if (prev) prev.innerHTML = '<span class="photo-prev">🎓</span>';
}
function inr(n) { return '₹' + Number(n).toLocaleString('en-IN'); }
function num(n) { return Number(n).toLocaleString('en-IN'); }
function todayIST() { // IST date, not UTC (before 5:30 AM UTC date is yesterday in IST)
  var now = new Date();
  var utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}
var toastTimer = null;
function toast(msg) {
  var t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
}
/* ================= numbers in words (Indian numbering) ================= */
var WORD_ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
var WORD_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function wordsUnder100(x) {
  if (x < 20) return WORD_ONES[x];
  var ten = WORD_TENS[Math.floor(x / 10)], one = WORD_ONES[x % 10];
  return one ? ten + ' ' + one : ten;
}
function wordsUnder1000(x) {
  var h = Math.floor(x / 100), r = x % 100, out = '';
  if (h) out = WORD_ONES[h] + ' Hundred';
  if (r) out += (out ? ' ' : '') + wordsUnder100(r);
  return out;
}
// Indian numbering: crore / lakh / thousand. 177820 -> 'One Lakh Seventy Seven
// Thousand Eight Hundred Twenty Only' (as on the DPS reference receipt).
function numberToWords(n) {
  n = Math.floor(Math.abs(+n || 0));
  if (n === 0) return 'Zero Only';
  var parts = [], crore = Math.floor(n / 10000000); n %= 10000000;
  var lakh = Math.floor(n / 100000); n %= 100000;
  var thou = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(wordsUnder1000(crore) + ' Crore');
  if (lakh) parts.push(wordsUnder1000(lakh) + ' Lakh');
  if (thou) parts.push(wordsUnder1000(thou) + ' Thousand');
  if (n) parts.push(wordsUnder1000(n));
  return parts.join(' ') + ' Only';
}
/* ================= fee extras + receipt numbers ================= */
function feeExtras() {
  if (!db.feeExtras || typeof db.feeExtras !== 'object') db.feeExtras = defaultFeeExtras();
  var e = db.feeExtras;
  ['admissionFee', 'cautionMoney', 'annualCharges', 'transportFee'].forEach(function (k) {
    if (typeof e[k] !== 'number' || isNaN(e[k]) || e[k] < 0) e[k] = 0;
  });
  return e;
}
// peek=true previews the next number without consuming it (draft display only).
function nextReceiptNo(peek) {
  if (!db.receiptCounter) migrateV13(db);
  var n = 'RCP-' + todayIST().slice(0, 4) + '-' + String(db.receiptCounter).padStart(3, '0');
  if (!peek) db.receiptCounter++;
  return n;
}
function feeTotals() {
  var c = 0, p = 0;
  db.feeRecords.forEach(function (r) { if (r.status === 'Collected') c += r.amount; else p += r.amount; });
  return { collected: c, pending: p };
}
function feeMonthsUsed() {
  // Academic order Apr->Mar: seed months first, then any month found in feeRecords.
  var seen = {}, list = [];
  FEE_MONTHS.forEach(function (mo) { if (!seen[mo.m]) { seen[mo.m] = 1; list.push(mo.m); } });
  db.feeRecords.forEach(function (r) { if (r.month && !seen[r.month]) { seen[r.month] = 1; list.push(r.month); } });
  return list.sort(function (a, b) { return (MONTH_NUM[a] || 99) - (MONTH_NUM[b] || 99); });
}
function feeRangeLabel() {
  var ms = feeMonthsUsed();
  return ms.length ? ms[0] + '–' + ms[ms.length - 1] : '';
}
function feeChartData() {
  // Month-wise totals computed LIVE from feeRecords, not the static seed ledger.
  return feeMonthsUsed().map(function (m) {
    var c = 0, p = 0;
    db.feeRecords.forEach(function (r) { if (r.month === m) { if (r.status === 'Collected') c += r.amount; else p += r.amount; } });
    return { label: m, collected: c, pending: p };
  });
}
function feeTypeOf(r) { return r.type || 'Tuition'; }
function feeTypeLabel(ty) { var k = FEE_TYPE_KEYS[ty]; return k ? t(k) : ty; }
function feeAllTypes() {
  var list = FEE_TYPES.slice();
  db.feeRecords.forEach(function (r) { var ty = feeTypeOf(r); if (list.indexOf(ty) === -1) list.push(ty); });
  return list;
}
function feeTypeTotals() {
  var m = {};
  db.feeRecords.forEach(function (r) {
    var ty = feeTypeOf(r);
    if (!m[ty]) m[ty] = { collected: 0, pending: 0 };
    if (r.status === 'Collected') m[ty].collected += r.amount; else m[ty].pending += r.amount;
  });
  return m;
}
function enrOf(sid) { var s = db.students.find(function (x) { return x.id === sid; }); return s ? (s.enr || '') : ''; }
function nextEnr() {
  var max = 0;
  db.students.forEach(function (s) {
    var m = /^ENR-(\d+)$/.exec(s.enr || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'ENR-' + String(max + 1).padStart(3, '0');
}
function refreshStudentFee(sid) {
  var s = db.students.find(function (x) { return x.id === sid; });
  if (s) s.fee = studentFeeStatus(sid);
}
function feeFiltered() {
  var q = state.feeSearch.toLowerCase(), f = state.feeFilter, ty = state.feeType;
  return db.feeRecords.filter(function (r) {
    if (f !== 'All' && r.status !== f) return false;
    if (ty !== 'All' && feeTypeOf(r) !== ty) return false;
    if (q) {
      var hay = (r.student + ' ' + r.cls + ' ' + enrOf(r.studentId)).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}
function filterFees(q) {
  // Client-side row filter only — the page is NOT re-rendered, so the search
  // input keeps focus and the typed text (same pattern as the fees search filter).
  q = (q || '').toLowerCase();
  var visible = 0, total = 0;
  document.querySelectorAll('#feeBody tr').forEach(function (tr) {
    if (tr.id === 'feeNoMatch') return;
    total++;
    var show = !q || tr.textContent.toLowerCase().indexOf(q) !== -1;
    tr.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  var nm = document.getElementById('feeNoMatch');
  if (nm) nm.style.display = visible ? 'none' : '';
  var fc = document.getElementById('feeCount');
  if (fc) fc.textContent = t('showingRec') + ' ' + visible + ' ' + t('ofRec') + ' ' + total + ' ' + t('recordsWord');
}
function studentFeeStatus(id) {
  // Derived from fee records: Pending if ANY Pending record exists, Paid if ANY Collected record exists, else no dues.
  var hasCol = false;
  for (var i = 0; i < db.feeRecords.length; i++) {
    var r = db.feeRecords[i];
    if (r.studentId !== id) continue;
    if (r.status === 'Pending') return 'Pending';
    if (r.status === 'Collected') hasCol = true;
  }
  return hasCol ? 'Paid' : '\u2014';
}

// ---------------- Phase 1: Student Management helpers ----------------
var GENDERS = ['Boy', 'Girl', 'Other'];
var BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
var CATEGORIES = ['General', 'OBC', 'SC', 'ST', 'Other'];
var SESSIONS = ['2025–26', '2024–25', '2026–27'];
var SECTIONS = ['A', 'B', 'C'];
var STU_PAGE_SIZE = 10;
var STU_STATUSES = ['Active', 'Inactive', 'Draft', 'Cancelled'];
function classParts() {
  var out = [];
  CLASSES.forEach(function (c) { var p = c.split('-')[0]; if (out.indexOf(p) === -1) out.push(p); });
  return out;
}
function classPartOf(cls) { return (cls || '').split('-')[0]; }
function sectionOf(cls) { return (cls || '').split('-')[1] || ''; }
function digitsOnly(v) { return String(v || '').replace(/[^0-9]/g, ''); }
function maskAadhaar(a) {
  var d = digitsOnly(a);
  if (d.length !== 12) return '—';
  return '**** **** ' + d.slice(8);
}
// Session containing a YYYY-MM-DD date (Apr-Mar academic year). Timezone-proof:
// parses the ISO date directly instead of new Date(), whose UTC-midnight parse
// can shift the day in far-western timezones.
function sessionOfDate(ds) {
  var m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(ds || ''));
  if (!m) return '';
  var y = parseInt(m[1], 10), mo = parseInt(m[2], 10);
  if (mo >= 4) return y + '–' + String((y + 1) % 100).padStart(2, '0');
  return (y - 1) + '–' + String(y % 100).padStart(2, '0');
}
function currentSession() { return sessionOfDate(todayIST()); }
function admYear() {
  var m = String(db.profile.session || '2025–26').match(/\d{4}/);
  return m ? m[0] : '2025';
}
function ensureAdmCounter() {
  if (!db.admCounter) {
    var max = 0;
    db.students.forEach(function (s) {
      var m = /^ADM-(\d{4})-(\d+)$/.exec(s.admissionNo || '');
      if (m) max = Math.max(max, parseInt(m[2], 10));
    });
    db.admCounter = max + 1;
  }
}
// peek=true previews the next number without consuming it (form display only).
function nextAdmNo(peek) {
  ensureAdmCounter();
  var n = 'ADM-' + admYear() + '-' + String(db.admCounter).padStart(3, '0');
  if (!peek) db.admCounter++;
  return n;
}
function nextRoll(cls) {
  var max = 0;
  db.students.forEach(function (s) { if (s.cls === cls) max = Math.max(max, s.roll || 0); });
  return max + 1;
}
function logAudit(action, details) {
  if (!Array.isArray(db.auditLog)) db.auditLog = [];
  var actor = state.user ? (state.user.name + ' (' + state.role + ')') : 'system';
  db.auditLog.unshift({ ts: new Date().toISOString(), actor: actor, action: action, details: details || '' });
  if (db.auditLog.length > 200) db.auditLog.length = 200;
}
function findDupStudent(data, excludeId) {
  var d = null;
  db.students.some(function (s) {
    if (excludeId && s.id === excludeId) return false;
    if (data.admissionNo && s.admissionNo && s.admissionNo === data.admissionNo) { d = s; return true; }
    if (data.dob && s.dob && s.dob === data.dob && s.name.trim().toLowerCase() === String(data.name || '').trim().toLowerCase()) { d = s; return true; }
    if (data.phone && s.phone && digitsOnly(s.phone) === digitsOnly(data.phone) && s.name.trim().toLowerCase() === String(data.name || '').trim().toLowerCase()) { d = s; return true; }
    return false;
  });
  return d;
}
function sessionOptions() {
  var out = [];
  db.students.forEach(function (s) { if (s.session && out.indexOf(s.session) === -1) out.push(s.session); });
  if (db.profile.session && out.indexOf(db.profile.session) === -1) out.push(db.profile.session);
  return out;
}
function studentStats() {
  var total = db.students.length, active = 0, inactive = 0, draft = 0, cancelled = 0, boys = 0, girls = 0, unspec = 0, pend = 0, attSum = 0;
  var byClass = {};
  var curSess = currentSession();
  var newAdm = 0;
  db.students.forEach(function (s) {
    var st = s.status || 'Active';
    if (st === 'Active') active++; else if (st === 'Inactive') inactive++; else if (st === 'Draft') draft++; else if (st === 'Cancelled') cancelled++;
    if (s.gender === 'Boy') boys++; else if (s.gender === 'Girl') girls++; else unspec++;
    if (studentFeeStatus(s.id) === 'Pending') pend++;
    attSum += studentAttPct(s);
    byClass[s.cls] = (byClass[s.cls] || 0) + 1;
    if (s.admissionDate && sessionOfDate(s.admissionDate) === curSess) newAdm++;
  });
  return { total: total, active: active, inactive: inactive, draft: draft, cancelled: cancelled, boys: boys, girls: girls, unspec: unspec, pendFee: pend, avgAtt: total ? Math.round(attSum / total) : 0, newAdm: newAdm, byClass: byClass };
}
function classBarsHTML(byClass) {
  var max = 0;
  CLASSES.forEach(function (c) { max = Math.max(max, byClass[c] || 0); });
  return CLASSES.map(function (c) {
    var n = byClass[c] || 0;
    var w = max ? Math.round(n / max * 100) : 0;
    return '<div class="class-bar"><b>' + esc(c) + '</b><span class="bar-track"><span class="bar-fill" style="width:' + w + '%"></span></span><span class="n">' + n + '</span></div>';
  }).join('');
}
function stuFiltered() {
  var q = (state.stuSearch || '').trim().toLowerCase();
  return db.students.filter(function (s) {
    if (state.stuClass !== 'All' && s.cls !== state.stuClass) return false;
    if (state.stuSection !== 'All' && sectionOf(s.cls) !== state.stuSection) return false;
    if (state.stuSession !== 'All' && (s.session || '') !== state.stuSession) return false;
    if (state.stuGender !== 'All' && (s.gender || '') !== state.stuGender) return false;
    if (state.stuStatus !== 'All' && (s.status || 'Active') !== state.stuStatus) return false;
    if (state.stuFee !== 'All' && studentFeeStatus(s.id) !== state.stuFee) return false;
    if (q) {
      var hay = [s.name, s.admissionNo, s.enr, s.phone].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}
function stuSorted(list) {
  var col = state.stuSort || 'name', dir = state.stuSortDir || 1;
  var arr = list.slice();
  arr.sort(function (a, b) {
    var r = 0;
    if (col === 'name') r = a.name.localeCompare(b.name);
    else if (col === 'class') r = (CLASSES.indexOf(a.cls) - CLASSES.indexOf(b.cls)) || ((a.roll || 0) - (b.roll || 0));
    else if (col === 'admDate') {
      var da = a.admissionDate || '', dbv = b.admissionDate || '';
      r = !da && !dbv ? 0 : !da ? 1 : !dbv ? -1 : (da < dbv ? -1 : da > dbv ? 1 : 0);
    } else if (col === 'att') r = studentAttPct(a) - studentAttPct(b);
    return r * dir;
  });
  return arr;
}
function stuPageCount(list) { return Math.max(1, Math.ceil(list.length / STU_PAGE_SIZE)); }
function stuPageRows(list) {
  if (state.stuPage > stuPageCount(list)) state.stuPage = stuPageCount(list);
  if (state.stuPage < 1) state.stuPage = 1;
  return list.slice((state.stuPage - 1) * STU_PAGE_SIZE, state.stuPage * STU_PAGE_SIZE);
}
function sortStu(col) {
  if (state.stuSort === col) state.stuSortDir = -state.stuSortDir;
  else { state.stuSort = col; state.stuSortDir = 1; }
  renderPage();
}
function onStuSearch(el) {
  state.stuSearch = el.value;
  state.stuPage = 1;
  renderPage();
  var inp = $('stuSearchInput');
  if (inp && inp.focus) { inp.focus(); if (inp.setSelectionRange) { try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {} } }
}
function feeSummaryFor(sid) {
  var s = db.students.find(function (x) { return x.id === sid; });
  if (!s) return null;
  var recs = db.feeRecords.filter(function (r) { return r.studentId === sid; })
    .sort(function (a, b) { return (MONTH_NUM[a.month] || 99) - (MONTH_NUM[b.month] || 99) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0); });
  var billed = 0, paid = 0, pend = 0, byType = {};
  recs.forEach(function (r) {
    billed += r.amount;
    if (r.status === 'Collected') paid += r.amount; else pend += r.amount;
    var ty = feeTypeOf(r);
    if (!byType[ty]) byType[ty] = { collected: 0, pending: 0 };
    if (r.status === 'Collected') byType[ty].collected += r.amount; else byType[ty].pending += r.amount;
  });
  return { s: s, recs: recs, billed: billed, paid: paid, pend: pend, byType: byType };
}
function latestExamPct(s) {
  var exs = db.exams.filter(function (e) { return e.cls === s.cls; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  for (var i = 0; i < exs.length; i++) {
    var mk = db.marks.find(function (m) { return m.examId === exs[i].id && m.studentId === s.id; });
    if (mk) return { pct: Math.round(mk.marks / exs[i].total * 100), name: exs[i].name };
  }
  return null;
}
var STU_CSV_HEAD = ['Name', 'Admission No', 'Enr', 'Class', 'Section', 'Roll', "Father's Name", "Mother's Name", 'Guardian', 'Mobile', 'Secondary Mobile', 'Parent Email', 'Attendance %', 'Fee Status', 'Status', 'Session', 'Admission Date', 'DOB', 'Gender', 'Category', 'Blood Group', 'Address', 'District', 'State', 'PIN', 'Previous School', 'Previous Class', 'Birth Cert', 'TC', 'TC Number'];
function studentCSVRow(s) {
  var d = s.documents || {};
  return [s.name, s.admissionNo || '', s.enr || '', s.cls, sectionOf(s.cls), s.roll,
    s.fatherName || s.guardian, s.motherName || '', s.guardian, s.phone, s.mobile2 || '', s.parentEmail || '',
    studentAttPct(s), studentFeeStatus(s.id), s.status || 'Active', s.session || '', s.admissionDate || '', s.dob || '',
    s.gender || '', s.category || '', s.bloodGroup || '', s.address || '', s.district || '', s.state || '', s.pin || '',
    s.previousSchool || '', s.previousClass || '', d.birthCert ? 'Yes' : 'No', d.tc ? 'Yes' : 'No', d.tcNumber || ''];
}
function downloadStudentCSV(id) {
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) return;
  downloadCSV('school-saathi-student-' + (s.admissionNo || s.id) + '.csv', [STU_CSV_HEAD, studentCSVRow(s)]);
  toast('✓ ' + t('tStuCsvOne'));
}
function exportStudentsCSV() {
  var list = stuSorted(stuFiltered());
  downloadCSV('school-saathi-students-' + todayIST() + '.csv', [STU_CSV_HEAD].concat(list.map(studentCSVRow)));
  toast('✓ ' + t('tCsvExported'));
}

/* ================= Phase 2: bulk CSV import =================
   CSV only — Excel (.xlsx) is a zipped binary format and cannot be parsed
   without a library; this static build has zero external dependencies, so the
   template and the import are CSV. The UI says so (impTemplateSub). */
var IMPORT_CSV_HEAD = ['name', 'dob', 'gender', 'bloodGroup', 'category', 'address', 'state', 'district', 'pin', 'admissionDate', 'session', 'class', 'section', 'roll', 'previousSchool', 'previousClass', 'fatherName', 'motherName', 'guardianName', 'mobile', 'mobile2', 'parentEmail', 'occupation', 'birthCert', 'tc', 'tcNumber', 'aadhaar'];
function buildImportTemplate() {
  return [IMPORT_CSV_HEAD,
    ['Aarav Kumar', '2014-05-12', 'Boy', 'O+', 'OBC', 'Ward 4, Manikpur', 'Bihar', 'Gopalganj', '841428', '2026-04-01', '2026–27', '6th', 'A', '1', '', '', 'Ramesh Kumar', 'Sunita Devi', 'Ramesh Kumar', '9812345678', '', 'ramesh@example.com', 'Farmer', 'Yes', 'No', '', ''],
    ['Sneha Kumari', '2013-11-03', 'Girl', 'B+', 'General', 'Boring Road', 'Bihar', 'Patna', '800001', '2026-04-01', '2026–27', '6th', 'A', '2', 'Sunrise Academy', '5th', 'Anil Sharma', 'Pooja Sharma', 'Anil Sharma', '9812345679', '9812345680', '', 'Teacher', 'Yes', 'Yes', 'TC-2041', '']];
}
function downloadImportTemplate() {
  downloadCSV('school-saathi-import-template.csv', buildImportTemplate());
  toast(t('tImpTemplate'));
}
function parseCSV(text) {
  // Small RFC-4180 reader: quoted fields (commas, doubled quotes, newlines
  // inside quotes), CRLF/LF endings, BOM stripped, fully-empty lines skipped.
  var rows = [], row = [], field = '', inQ = false;
  var s = String(text || '').replace(/^\uFEFF/, '');
  for (var i = 0; i < s.length; i++) {
    var c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') {
      if (field.trim() === '') { field = ''; inQ = true; } // quote opens the field (leading spaces tolerated)
      else field += c; // stray quote inside an unquoted field: keep literally
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
}
function parseImportCSV(text) {
  var grid = parseCSV(text);
  if (!grid.length) return { rows: [], error: t('impNoRows') };
  var head = grid[0].map(function (h) { return String(h || '').trim().toLowerCase(); });
  if (head.indexOf('name') === -1) return { rows: [], error: t('impBadHeader') };
  var rows = [];
  for (var i = 1; i < grid.length; i++) {
    var obj = { __line: i + 1 };
    IMPORT_CSV_HEAD.forEach(function (col) {
      var idx = head.indexOf(col.toLowerCase());
      obj[col] = idx === -1 ? '' : String(grid[i][idx] == null ? '' : grid[i][idx]).trim();
    });
    rows.push(obj);
  }
  return { rows: rows, error: null };
}
function isValidDateStr(ds) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ds || '').trim());
  if (!m) return false;
  var y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  var dt = new Date(y, mo - 1, d); // component round-trip is timezone-proof
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}
function normSession(v) {
  var s = String(v || '').trim().replace(/(\d{4})-(\d{2})/, '$1–$2');
  return /^\d{4}–\d{2}$/.test(s) ? s : '';
}
function normBool(v) {
  var s = String(v || '').trim().toLowerCase();
  if (['yes', 'y', 'true', '1'].indexOf(s) !== -1) return true;
  if (['no', 'n', 'false', '0', ''].indexOf(s) !== -1) return false;
  return null; // not a recognisable Yes/No
}
// Validates ONE import row against the same rules as the admission form.
// seenValid: normalised data objects of previously VALID rows in this file
// (in-file duplicates are checked against valid rows only, so a row with its
// own errors reports the real error instead of "duplicate").
function validateImportRow(row, seenValid) {
  var errors = [];
  var name = String(row.name || '').trim();
  if (!name) errors.push(t('impErrName'));
  var phone = digitsOnly(row.mobile);
  if (phone.length !== 10) errors.push(t('impErrMobile'));
  var phone2 = digitsOnly(row.mobile2);
  if (row.mobile2 && String(row.mobile2).trim() !== '' && phone2.length !== 10) errors.push(t('impErrMobile2'));
  var clsRaw = String(row.class || '').trim();
  var secRaw = String(row.section || '').trim().toUpperCase();
  var clsPart = clsRaw, sec = secRaw;
  if (clsRaw.indexOf('-') !== -1) { // tolerate a combined '6th-A' in the class column
    var parts = clsRaw.split('-');
    clsPart = parts[0].trim();
    if (!secRaw) sec = (parts[1] || '').trim().toUpperCase();
  }
  if (classParts().indexOf(clsPart) === -1) errors.push(t('impErrClass'));
  if (SECTIONS.indexOf(sec) === -1) errors.push(t('impErrSection'));
  var pin = digitsOnly(row.pin);
  if (row.pin && String(row.pin).trim() !== '' && pin.length !== 6) errors.push(t('impErrPin'));
  var aadhaar = digitsOnly(row.aadhaar);
  if (row.aadhaar && String(row.aadhaar).trim() !== '' && aadhaar.length !== 12) errors.push(t('impErrAadhaar'));
  var dob = String(row.dob || '').trim();
  if (dob && !isValidDateStr(dob)) errors.push(t('impErrDob'));
  var admDate = String(row.admissionDate || '').trim();
  if (admDate && !isValidDateStr(admDate)) errors.push(t('impErrAdmDate'));
  var session = '';
  if (row.session && String(row.session).trim() !== '') {
    session = normSession(row.session);
    if (!session) errors.push(t('impErrSession'));
  }
  var gender = '';
  if (row.gender && String(row.gender).trim() !== '') {
    var g = String(row.gender).trim().toLowerCase();
    gender = g === 'boy' ? 'Boy' : g === 'girl' ? 'Girl' : g === 'other' ? 'Other' : '';
    if (!gender) errors.push(t('impErrGender'));
  }
  var blood = '';
  if (row.bloodGroup && String(row.bloodGroup).trim() !== '') {
    blood = String(row.bloodGroup).trim().toUpperCase();
    if (BLOOD_GROUPS.indexOf(blood) === -1) { errors.push(t('impErrBlood')); blood = ''; }
  }
  var cat = '';
  if (row.category && String(row.category).trim() !== '') {
    var cl = String(row.category).trim().toLowerCase();
    CATEGORIES.forEach(function (c) { if (c.toLowerCase() === cl) cat = c; });
    if (!cat) errors.push(t('impErrCategory'));
  }
  var email = String(row.parentEmail || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(t('impErrEmail'));
  var roll = 0;
  if (row.roll && String(row.roll).trim() !== '') {
    if (!/^\d+$/.test(String(row.roll).trim()) || parseInt(row.roll, 10) < 1) errors.push(t('impErrRoll'));
    else roll = parseInt(row.roll, 10);
  }
  var bc = normBool(row.birthCert), tcB = normBool(row.tc);
  if (bc === null) errors.push(t('impErrBool') + ' (' + t('fBirthCert') + ')');
  if (tcB === null) errors.push(t('impErrBool') + ' (' + t('fTc') + ')');
  var cls = clsPart + '-' + sec;
  var data = null;
  if (!errors.length) {
    data = { name: name, cls: cls, roll: roll, guardian: String(row.guardianName || '').trim() || String(row.fatherName || '').trim() || '—',
      phone: phone, dob: dob, gender: gender, bloodGroup: blood, category: cat,
      address: String(row.address || '').trim(), state: String(row.state || '').trim(), district: String(row.district || '').trim(), pin: pin,
      session: session || db.profile.session, admissionDate: admDate || todayIST(),
      previousSchool: String(row.previousSchool || '').trim(), previousClass: String(row.previousClass || '').trim(),
      fatherName: String(row.fatherName || '').trim(), motherName: String(row.motherName || '').trim(),
      mobile2: phone2, parentEmail: email, occupation: String(row.occupation || '').trim(), aadhaar: aadhaar,
      documents: { birthCert: !!bc, tc: !!tcB, tcNumber: String(row.tcNumber || '').trim(), other: '' } };
    var dup = findDupStudent(data, null); // same rules as the admission form
    if (dup) return { ok: false, status: 'duplicate', errors: [t('impErrDup') + ' ' + dup.name + ' (' + (dup.admissionNo || dup.enr || '') + ' • ' + dup.cls + ')'], data: null };
    var dupIn = null;
    (seenValid || []).some(function (v) {
      if (v.name.trim().toLowerCase() === name.toLowerCase() && ((dob && v.dob === dob) || (phone && digitsOnly(v.phone) === phone))) { dupIn = v; return true; }
      return false;
    });
    if (dupIn) return { ok: false, status: 'duplicate', errors: [t('impErrDupFile') + ' (' + dupIn.name + ' • ' + dupIn.cls + ')'], data: null };
  }
  return { ok: errors.length === 0, status: errors.length ? 'error' : 'valid', errors: errors, data: data };
}
function validateImportRows(rows) {
  var seen = [], out = [];
  (rows || []).forEach(function (r) {
    var v = validateImportRow(r, seen);
    if (v.ok) seen.push(v.data);
    out.push({ row: r, status: v.status, errors: v.errors, data: v.data });
  });
  return out;
}
function onImportFile(input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  if (typeof FileReader === 'undefined') { toast(t('tPhotoError')); return; }
  var reader = new FileReader();
  reader.onerror = function () { toast(t('tPhotoError')); };
  reader.onload = function () {
    var parsed = parseImportCSV(reader.result);
    if (parsed.error) { importState.rows = null; importState.result = null; toast(parsed.error); openImportModal(); return; }
    importState.rows = validateImportRows(parsed.rows);
    importState.fileName = file.name || '';
    importState.result = null;
    openImportModal();
  };
  reader.readAsText(file);
}
function importPreviewHTML() {
  var rows = importState.rows || [];
  var valid = 0, errs = 0, dups = 0, impd = 0;
  rows.forEach(function (r) {
    if (r.status === 'valid') valid++;
    else if (r.status === 'duplicate') dups++;
    else if (r.status === 'imported') impd++;
    else errs++;
  });
  var trs = rows.map(function (r, i) {
    var badgeCls = (r.status === 'valid' || r.status === 'imported') ? 'green' : r.status === 'duplicate' ? 'orange' : 'red';
    var label = r.status === 'valid' ? t('impValid') : r.status === 'imported' ? t('impImported') : r.status === 'duplicate' ? t('impDuplicate') : t('impError');
    return '<tr><td>' + (r.row.__line || i + 2) + '</td><td><b>' + esc(r.row.name || '—') + '</b></td><td>' + esc((r.row.class || '') + (r.row.section ? '-' + r.row.section : '')) + '</td><td>' + esc(r.row.mobile || '') + '</td>' +
      '<td><span class="badge ' + badgeCls + '">' + label + '</span></td><td>' + esc(r.errors.join('; ') || '—') + '</td></tr>';
  }).join('');
  var res = '';
  if (importState.result) {
    var rs = importState.result;
    res = '<div class="card" style="margin-top:12px"><h3>' + t('impSummary') + '</h3><p>' + rs.imported + ' ' + t('impImported') + ' • ' + rs.skipped + ' ' + t('impSkipped') + '</p></div>';
  }
  return '<h3 style="margin-top:14px">' + t('impPreview') + ' — ' + rows.length + ' ' + t('recordsWord') + '</h3>' +
    '<p class="muted">' + valid + ' ' + t('impValid') + ' • ' + errs + ' ' + t('impError') + ' • ' + dups + ' ' + t('impDuplicate') + (impd ? ' • ' + impd + ' ' + t('impImported') : '') + (importState.fileName ? ' • ' + esc(importState.fileName) : '') + '</p>' +
    '<div class="tbl-wrap imp-scroll"><table><thead><tr><th>#</th><th>' + t('thName') + '</th><th>' + t('thClass') + '</th><th>' + t('thPhone') + '</th><th>' + t('thStatus') + '</th><th>' + t('impReason') + '</th></tr></thead><tbody>' +
    (trs || '<tr><td colspan="6"><div class="empty">' + t('impNoRows') + '</div></td></tr>') + '</tbody></table></div>' +
    '<div class="actions" style="justify-content:flex-start">' +
    '<button class="btn green" ' + (valid ? '' : 'disabled') + ' onclick="confirmImport()">' + t('impConfirm') + ' (' + valid + ')</button>' +
    (importState.result ? '<button class="btn" onclick="closeModal();renderApp()">' + t('impDone') + '</button>' : '') + '</div>' + res;
}
function openImportModal() {
  openModal('<h3>' + t('impTitle') + '</h3>' +
    '<p class="muted">' + t('impTemplateSub') + '</p>' +
    '<div class="toolbar" style="margin:12px 0"><button class="btn ghost sm" onclick="downloadImportTemplate()">⬇ ' + t('impTemplate') + '</button>' +
    '<input type="file" id="impFile" accept=".csv,text/csv" onchange="onImportFile(this)" style="flex:1;min-width:180px"></div>' +
    '<div id="impPreviewWrap">' + (importState.rows ? importPreviewHTML() : '') + '</div>' +
    '<div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('closeW') + '</button></div>', true);
}
function confirmImport() {
  var rows = importState.rows || [];
  var imported = 0, skipped = 0;
  var now = Date.now();
  rows.forEach(function (r, i) {
    if (r.status !== 'valid' || !r.data) { if (r.status === 'error' || r.status === 'duplicate') skipped++; return; }
    // Re-check duplicates at import time, so a second Confirm (or data that
    // changed since the preview) can never import the same student twice.
    var dup = findDupStudent(r.data, null);
    if (dup) { r.status = 'duplicate'; r.errors = [t('impErrDup') + ' ' + dup.name + ' (' + (dup.admissionNo || dup.enr || '') + ' • ' + dup.cls + ')']; skipped++; return; }
    var d = r.data;
    var admNo = nextAdmNo();
    var rec = { id: 'stu' + now + '_' + i, att: 100, result: 0, fee: '—', enr: nextEnr(), admissionNo: admNo, status: 'Active' };
    Object.keys(d).forEach(function (k) { rec[k] = d[k]; });
    rec.parentPin = parentPinFromPhone(rec.phone || '');
    rec.roll = d.roll || nextRoll(d.cls);
    // No fee record is created on import: dues are created by Generate Fees.
    // (The single-admission form adds a ₹6,000 placeholder record; a bulk
    // import of many students must not silently inflate the fee totals.)
    db.students.push(rec);
    logAudit('Bulk import', rec.name + ' • ' + admNo + ' • ' + rec.cls);
    r.status = 'imported';
    imported++;
  });
  importState.result = { imported: imported, skipped: skipped };
  saveDB(db);
  toast(t('tImpDone') + ' ' + imported + ' ' + t('impImported') + '.');
  openImportModal();
}
function donutPct(v, total) { return total ? Math.round(v / total * 100) : 0; }
function todayAtt() {
  // Live school-wide attendance for TODAY, computed from the actual
  // per-student attendance records (db.attendance, keyed 'YYYY-MM-DD|Class').
  // The old aggregate (seeded 1,150 present of 1,250) described a
  // 1,250-student school, not this one, and was only ever delta-updated from
  // that wrong baseline — so the donut showed fake numbers. 0 of 0 when
  // nothing is marked today yet.
  // v24: soft-deleted (Cancelled) students never count — their old marks
  // stay in the register, but they are not today's students anymore.
  var t = todayIST(), p = 0, a = 0, l = 0;
  var cancelled = {};
  (db.students || []).forEach(function (s) { if ((s.status || 'Active') === 'Cancelled') cancelled[s.id] = 1; });
  Object.keys(db.attendance || {}).forEach(function (k) {
    if (k.indexOf(t + '|') !== 0) return;
    var recs = db.attendance[k] || {};
    Object.keys(recs).forEach(function (id) {
      if (cancelled[id]) return;
      if (recs[id] === 'Present') p++;
      else if (recs[id] === 'Absent') a++;
      else l++;
    });
  });
  return { present: p, absent: a, late: l, total: p + a + l };
}
function studentAttPct(s) {
  // v24: a student's attendance % is computed LIVE from the actual marked
  // records in db.attendance — so the figure moves the moment attendance
  // is marked. Present and Late both count as attended (the student was
  // there); Absent does not. Only when the student has NO marked days at
  // all do we fall back to the stored s.att (the seed / import / admission
  // value). Never write the computed value back into s.att — the stored
  // value stays the fallback.
  var total = 0, attended = 0;
  Object.keys(db.attendance || {}).forEach(function (k) {
    var recs = db.attendance[k] || {};
    var m = recs[s.id];
    if (!m) return;
    total++;
    if (m === 'Present' || m === 'Late') attended++;
  });
  return total ? Math.round(attended / total * 100) : (s.att || 0);
}
function schoolCounts() {
  var t = db.schools.length, a = 0, p = 0;
  db.schools.forEach(function (s) { if (s.status === 'active') a++; else p++; });
  return { total: t, active: a, pending: p };
}
function subCounts() {
  var c = { Active: 0, Expired: 0, Trial: 0 };
  db.schools.forEach(function (s) { if (c[s.plan] != null) c[s.plan]++; });
  return c;
}
/* v26: platform totals are computed LIVE from the super-admin store
   (db.schools) — never hard-coded. The old 12,450 users / 48 admins /
   1,240 teachers / 11,162 students were literals with no data behind
   them, so they are gone; the per-school users/students figures below
   are the only user numbers the platform can honestly show. */
function totalPlatformUsers() {
  var n = 0; db.schools.forEach(function (s) { n += s.users || 0; }); return n;
}
function totalPlatformStudents() {
  var n = 0; db.schools.forEach(function (s) { n += s.students || 0; }); return n;
}
/* v26: real relative time from an ISO timestamp. Returns '' when the
   entry has no timestamp — old entries that predate timestamps show
   no time rather than a fabricated one. */
function relTime(ts) {
  if (!ts) return '';
  var t = Date.parse(ts); if (isNaN(t)) return '';
  var d = Date.now() - t; if (d < 0) d = 0;
  var m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  var h = Math.floor(m / 60);
  if (h < 24) return h + ' hr ago';
  if (h < 48) return 'Yesterday';
  var dt = new Date(t);
  return dt.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getMonth()] + ' ' + dt.getFullYear();
}
function addActivity(icon, bg, title, sub) {
  // v26: store a real timestamp at log time. The old literal was the
  // same for every entry, however old it was.
  db.activities.unshift({ icon: icon, bg: bg, title: title, sub: sub, ts: new Date().toISOString() });
  db.activities = db.activities.slice(0, 6);
}
function csvCell(c) {
  var s = String(c);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
  return '"' + s.replace(/"/g, '""') + '"';
}
function downloadCSV(filename, rows) {
  var csv = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function openModal(html, wide) { $('modalRoot').innerHTML = '<div class="modal-back" onclick="if(event.target===this)closeModal()"><div class="modal' + (wide ? ' wide' : '') + '">' + html + '</div></div>'; }
function closeModal() { $('modalRoot').innerHTML = ''; }
var confirmCb = null;
function confirmModal(msg, cb) {
  confirmCb = cb;
  openModal('<h3>' + t('confirmTitle') + '</h3><p style="color:var(--muted);font-size:14px">' + esc(msg) + '</p><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button><button type="button" class="btn danger" onclick="confirmYes()">' + t('confirmYes') + '</button></div>');
}
function confirmYes() { var cb = confirmCb; confirmCb = null; closeModal(); if (cb) cb(); }

/* ================= charts (hand-rolled SVG, animated) ================= */
function donutSVG(segments, size, centerTop, centerBottom) {
  size = size || 190;
  var r = 72, c = 2 * Math.PI * r, total = 0;
  segments.forEach(function (s) { total += s.value; });
  var off = 0, arcs = '';
  segments.forEach(function (s, i) {
    var frac = total ? s.value / total : 0, len = frac * c;
    arcs += '<circle class="donut-arc" cx="100" cy="100" r="' + r + '" fill="none" stroke="' + s.color + '" stroke-width="24" ' +
      'stroke-dasharray="0 ' + c.toFixed(1) + '" data-len="' + len.toFixed(1) + '" data-off="' + (-off).toFixed(1) + '" ' +
      'transform="rotate(-90 100 100)" data-tip="' + esc(s.label) + ': ' + num(s.value) + (s.pct != null ? ' (' + s.pct + '%)' : '') + '" />';
    off += len;
  });
  return '<svg viewBox="0 0 200 200" width="' + size + '" height="' + size + '" role="img" aria-label="Donut chart">' + arcs +
    '<text x="100" y="96" text-anchor="middle" font-size="30" font-weight="800" fill="#0A1E4B">' + esc(centerTop) + '</text>' +
    '<text x="100" y="120" text-anchor="middle" font-size="12.5" fill="#64748B">' + esc(centerBottom) + '</text></svg>';
}
function animateDonuts(root) {
  (root || document).querySelectorAll('.donut-arc').forEach(function (arc, i) {
    var c = 2 * Math.PI * 72;
    setTimeout(function () {
      arc.setAttribute('stroke-dasharray', arc.getAttribute('data-len') + ' ' + c.toFixed(1));
      arc.setAttribute('stroke-dashoffset', arc.getAttribute('data-off'));
    }, 60 + i * 90);
  });
}
function barChartSVG(data) {
  // data: [{label, collected, pending}]
  if (!data || !data.length) return '<div class="empty">' + t('tNoFeeData') + '</div>';
  var W = 560, H = 260, padL = 46, padB = 30, padT = 14, maxV = 0;
  data.forEach(function (d) { maxV = Math.max(maxV, d.collected || 0, d.pending || 0); });
  maxV = Math.ceil(maxV / 50000) * 50000 || 50000;
  var iw = W - padL - 14, ih = H - padT - padB, n = data.length, gw = iw / n, bw = Math.min(26, gw / 3.4);
  var y = function (v) { return padT + ih - (v / maxV) * ih; };
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Fee collection trend">';
  [0, 0.5, 1].forEach(function (f) {
    var yy = padT + ih * (1 - f);
    s += '<line class="grid-ln" x1="' + padL + '" y1="' + yy + '" x2="' + (W - 10) + '" y2="' + yy + '"/>' +
      '<text class="axis-lbl" x="' + (padL - 6) + '" y="' + (yy + 4) + '" text-anchor="end">' + (f === 0 ? '0' : (f * maxV / 100000).toFixed(1).replace('.0', '') + 'L') + '</text>';
  });
  data.forEach(function (d, i) {
    var cx = padL + gw * i + gw / 2, base = padT + ih;
    s += '<rect class="bar" x="' + (cx - bw - 3) + '" y="' + y(d.collected) + '" width="' + bw + '" height="' + (base - y(d.collected)) + '" fill="' + BLUE + '" rx="3" data-tip="' + (d.label || d.m) + ' Collected: ' + inr(d.collected) + '"/>';
    s += '<rect class="bar" x="' + (cx + 3) + '" y="' + y(d.pending) + '" width="' + bw + '" height="' + (base - y(d.pending)) + '" fill="' + ORANGE + '" rx="3" data-tip="' + (d.label || d.m) + ' Pending: ' + inr(d.pending) + '"/>';
    s += '<text class="axis-lbl" x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + (d.label || d.m) + '</text>';
  });
  s += '</svg>';
  return s;
}
function animateBars(root) {
  // Bars render at final height now (August bars looked empty mid-animation).
  // Only animate legacy bars that still carry data-y/data-h.
  (root || document).querySelectorAll('.bar').forEach(function (b) {
    if (!b.getAttribute('data-y')) return;
    b.setAttribute('y', b.getAttribute('data-y')); b.setAttribute('height', b.getAttribute('data-h'));
  });
}
/* v26: the line chart + its animation removed with the fake growth
   chart — schools carry no created-date, so no time series can be
   computed honestly. Fee trend still uses barChartSVG. */

/* ================= i18n ================= */
var I18N = {
  en: {
    dashboard: 'Dashboard', schools: 'Schools', users: 'Users', subscriptions: 'Subscriptions', analytics: 'Analytics', settings: 'Settings', reports: 'Reports', help: 'Help & Support', students: 'Student Management', attendance: 'Attendance', fees: 'Fees', exams: 'Examinations', homework: 'Homework', notices: 'Notices', totalSchools: 'Total Schools', totalUsers: 'Total Users', activeSchools: 'Active Schools', pendingApproval: 'Pending Approval', totalStudents: 'Total Students', totalTeachers: 'Total Teachers', feeCollected: 'Fee Collected', pendingFee: 'Pending Fee', logout: 'Logout',
    navFeatures: 'Features', navDashboards: 'Dashboards', navSchools: 'Schools', navLogin: 'Login',
    heroTitle: 'Next-Generation School Management System', heroSub: 'For a Smarter & Brighter Education Future — one app for the whole school: students, teachers, fees, attendance, exams and notices.', heroGetStarted: 'Get Started →', heroExplore: 'Explore Demo',
    statsTitle: 'Trusted by schools across Bihar', statsSub: 'Live platform figures from the School Saathi network.', todayAttendance: 'Today\'s Attendance', feeCollectedRange: 'Fee Collected (Apr–Aug)',
    featTitle: 'Key Features Highlights', featSub: 'Everything a school needs, in one place.',
    feat1t: 'Multi-School Management', feat1d: 'One platform, every school gets its own login, workspace, name and data — fully separate.',
    feat2t: 'Role-Based Access', feat2d: 'Super Admin, School Admin, Teacher and Student — each role sees only what it should.',
    feat3t: 'Real-time Analytics', feat3d: 'Attendance, fee collection and growth — live charts and counts on every dashboard.',
    feat4t: 'Secure & Scalable', feat4d: 'Your school\'s data stays in your school\'s account. Works for 100 or 10,000 students.',
    feat5t: 'Hindi + English Support', feat5d: 'Switch the whole interface between Hindi and English with one tap.',
    feat6t: 'Web + Android App', feat6d: 'Runs on PC and phone. Installable as an app — works offline after the first load.',
    rolesTitle: 'Three dashboards, one system', rolesSub: 'Tap a role to open its demo dashboard — no password needed.',
    roleSuper: 'Super Admin', roleSuperD: 'Platform Owner — all 24 schools, users, subscriptions and growth at a glance.', goSuper: 'Open Super Admin →',
    roleSchool: 'School Admin — Rahul Kumar', roleSchoolD: 'St. Xavier School, Patna — students, attendance, fees, exams, homework and notices.', goSchool: 'Open School Admin →',
    roleStudent: 'Student — Riya Kumari', roleStudentD: 'Class 10th-A — attendance, fees, results and homework on a mobile-style view.', goStudent: 'Open Student View →',
    landFooter: '<b>School Saathi</b> — Smart Education. Better Tomorrow.<br>Built for Bihar • Free for Schools • Made with ❤️ in Gopalganj, Bihar',
    loginWelcome: 'Log in or sign up<br>to continue', loginEmail: 'Email', loginPassword: 'Password', loginEmailPh: 'you@school.edu.in', loginPwPh: '••••••••', loginBtn: 'Login', authLogin: 'Log In', authSignup: 'Sign Up', authNote: 'One account per school. Your data stays on this device and backs up to the server when you are online.', suSchool: 'School Name', suYourName: 'Your Name', suEmail: 'Email', suPw: 'Password', suPw2: 'Confirm Password', suBtn: 'Create Account', loginOr: 'Or continue with', demoTitle: '— One-tap demo login —', loginBack: '← Back to website',
    superDashboard: 'Super Admin Dashboard', schoolDashboard: 'School Admin Dashboard', studentDashboard: 'Student Dashboard',
    confirmTitle: 'Confirm', cancel: 'Cancel', confirmYes: 'Yes, continue', saveBtn: 'Save',
    addSchool: 'Add School', addStudent: 'Add Student', saveAttendance: 'Save Attendance', saveMarks: 'Save Marks', addHomework: 'Add Homework', publishNotice: 'Publish Notice', downloadReport: 'Download Report', approve: 'Approve', remove: 'Remove', editBtn: 'Edit', deleteBtn: 'Delete', collectBtn: 'Collect', saveSettingsBtn: 'Save Settings', resetAllData: 'Reset All Data', resetPwTitle: 'Enter your password to reset', resetPwHint: 'Resetting permanently deletes ALL school data — students, teachers, fees, attendance, exams, homework, notices and receipts. This cannot be undone.', resetConfirmMsg: 'This will permanently delete ALL data — students, teachers, fees, attendance, exams, homework, notices and receipts. This cannot be undone.', resetPwLabel: 'Account password', resetPwWrong: 'Wrong password — nothing was reset.', resetPwGo: 'Verify & Continue', publishBtn: 'Publish', assignHw: 'Assign Homework', saveSchoolBtn: 'Save School', saveStudentBtn: 'Save Student',
    attOverview: 'Attendance Overview', todayAtt: 'Today\'s Attendance', feeTrend: 'Fee Collection Trend', feeTrendSub: 'Apr – Aug (Collected vs Pending)', feeTrendSub2: 'Apr to Aug (Collected vs Pending)', recentAct: 'Recent Activities', activityLog: 'Activity Log', actLogSub: 'Full audit history — newest first.', thDetails: 'Details', actBy: 'By', supYourName: 'Your name', quickLinks: 'Quick Links', jumpTask: 'Jump to a task', top5: 'Top 5 Schools', byStrength: 'By student strength', platformTotals: 'Platform Totals', platformTotalsSub: 'Live totals from the schools on the platform', subsStatus: 'Subscription Status', subsSub: 'Share of schools by plan status', quickActions: 'Quick Actions', qaSub: 'Common admin tasks', enterMarks: 'Enter Marks', myHomework: 'My Homework', noticesH: 'Notices', latestNotices: 'Latest from school', plansH: 'Plans', guidesH: 'Quick Guides', guidesSub: 'Most common tasks', contactH: 'Contact', contactSub: 'We reply within one working day', studentsReport: 'Students Report', feesReport: 'Fees Report', attReport: 'Attendance Report', schoolsReport: 'Schools Report',
    thName: 'Name', thClass: 'Class', thRoll: 'Roll', thGuardian: 'Guardian', thPhone: 'Phone', thAtt: 'Att.', thFee: 'Fee', thAction: 'Action', thStudent: 'Student', thMonth: 'Month', thAmount: 'Amount', thDate: 'Date', thStatus: 'Status', thSchool: 'School', thCity: 'City', thStudents: 'Students', thUsers: 'Users', thPlan: 'Plan', thMarks: 'Marks', thResult: 'Result', thSince: 'Since', thRole: 'Role',
    subSuperDash: 'Platform Overview & Management', subSchools: 'All schools on the platform', subUsers: 'Teachers, staff & students', subSubs: 'Plans & billing status', subAnalytics: 'Growth, attendance & fees', subAnalyticsFull: 'Growth, attendance & fees across the platform', subReports: 'Download CSV reports', subHelp: 'Guides & contact', subStudents: 'St. Xavier School, Patna', subAttendance: 'Mark & view attendance', subFees: 'Fee collection & pending dues', subExams: 'Exams & marks entry', subHomework: 'Assign & track homework', subNotices: 'Notice board',
    fSchoolName: 'School Name', fCity: 'City', fStudents: 'Students', fPlan: 'Plan', fStudentName: 'Student Name', fClass: 'Class', fRoll: 'Roll No', fGuardian: 'Guardian', fPhone: 'Phone', fTitle: 'Title', fSubject: 'Subject', fDue: 'Due Date', fMessage: 'Message', fPrincipal: 'Principal / Admin', fEmail: 'Email', fAddress: 'Address', fSession: 'Academic Session',
    tLoggedIn: 'Logged in as', tAccountCreated: 'Account created. Welcome, ', tInvalidCreds: 'Invalid email or password.', tFillAll: 'Please fill in all fields.', tInvalidEmail: 'Please enter a valid email address.', tPwShort: 'Password must be at least 6 characters.', tPwMismatch: 'Passwords do not match.', tEmailTaken: 'An account with this email already exists. Please log in.', tLoggedOut: 'Logged out. See you soon!', tBackExit: 'Press back again to exit', tSchoolAdded: 'School added — pending approval.', tSchoolRemoved: 'School removed.', tStudentAdded: 'Student added.', tStudentUpdated: 'Student updated.', tStudentDeleted: 'Student deleted.', tAttSaved: 'Attendance saved', tMarksSaved: 'Marks saved for', tHwDone: 'Homework marked done.', tHwNotDone: 'Homework marked not done.', tHwAssigned: 'Homework assigned.', tNoticePub: 'Notice published.', tReportDl: 'Report downloaded.', tSettingsSaved: 'Settings saved.', tAllReset: 'All data deleted — the school is now empty.', tSessionChanged: 'Academic session changed to', tApproved: 'approved. Pending approvals:', tNoChanges: 'No changes.', tStudentsRange: 'Students must be between 1 and 100,000.', tFutureDate: 'Future date not allowed — showing today.', tDueFuture: 'Due date must be today or later.', tDemoLogin: 'Demo account — use one-tap login below.', tGoogleDemo: 'Demo build — please use a one-tap demo login.', tNoStudentData: 'No student data — ask your school admin to add students.', tNoExams: 'No exams yet.', tNoHw: 'No homework yet.', tNoMarks: 'No marks entered yet for this exam.', tNoMatch: 'No students match.', tNoSchoolsMatch: 'No schools match.', tNotEntered: 'Not entered', tCollectedFrom: 'collected from', tDupSchool: 'already exists.', tDupStudent: 'already exists in', tNotSaved: 'Not saved', tCheckMarks: 'check marks', tStudentsWord: 'students', tNoFeeData: 'No fee data yet.',
    searchStudent: 'Search student…', searchSchool: 'Search school or city…', viewAll: 'View All →', classAvg: 'Class average', studentsMarked: 'students marked', ofWord: 'of', showingRec: 'Showing', ofRec: 'of', recordsWord: 'records.', tapDone: 'tap the box when done', myHwSub: 'Tap the box when you finish', tileAtt: 'Attendance', tileFees: 'Fees', tileResults: 'Results', tileHw: 'Homework', doneSuffix: 'done', presBtn: 'Present', absBtn: 'Absent', lateBtn: 'Late',
    qaAddSchool: 'Add School', qaAddSchoolD: 'Onboard a new school', qaManageUsers: 'Manage Users', qaManageUsersD: 'Roles & accounts', qaViewReports: 'View Reports', qaViewReportsD: 'Download CSV', qaSysSettings: 'System Settings', qaSysSettingsD: 'Platform config',
    qaAddStudent: 'Add Student', qaAddStudentD: 'New admission', qaMarkAtt: 'Mark Attendance', qaMarkAttD: 'Today\'s register', qaEnterMarks: 'Enter Marks', qaEnterMarksD: 'Exam results', qaGenReport: 'Generate Report', qaGenReportD: 'CSV download',
    dlStudents: 'Download Students CSV', dlFees: 'Download Fees CSV', dlAtt: 'Download Attendance CSV', dlSchools: 'Download Schools CSV',
    repStudentsSub: 'Name, class, roll, guardian, phone, attendance, fee status', repFeesSub: 'Student, class, month, amount, status — Apr to Aug',
    subSettingsP: 'Platform settings', subSettingsS: 'School profile', settingsSub: 'Edit and save — changes persist on this device.',
    sysSettings: 'System Settings', platformConfig: 'Platform configuration', platformH: 'Platform', supName: 'Platform name', supTagline: 'Tagline', supSession: 'Default session', supEmail: 'Support email', supStorage: 'Data storage', supStorageV: 'This device (localStorage) — demo build',
    studentsW: 'Students', perSchool: '2 per school',
    schoolsOnPlatform: 'schools on the platform', pendingApprovalL: 'pending approval',
    planBasicT: 'Basic — ₹8 / student / month', planBasicD: 'Attendance, fees, notices', planStdT: 'Standard — ₹12 / student / month', planStdD: '+ Exams, homework, reports', planPremT: 'Premium — ₹15 / student / month', planPremD: '+ Analytics, WhatsApp, priority support', setupLine: 'Setup ₹4,999 one-time • 1 month free trial • Annual advance = 2 months free.',
    guide1t: 'Add a school', guide1d: 'Schools → + Add School → fill details → Save. New schools start as Pending until approved.', guide2t: 'Collect a fee', guide2d: 'School Admin → Fees → Collect on a pending record. Totals update instantly.', guide3t: 'Mark attendance', guide3d: 'School Admin → Attendance → pick class & date → Present / Absent / Late → Save.',
    contactPhone: 'Phone', contactHours: 'Hours', hoursV: 'Mon–Sat, 9 AM – 6 PM', raiseSupport: 'Raise a Support Request', supportNoted: 'Support request noted — we will call you back.', recentSup: 'Recent Support Requests', supOpen: 'Open', supProgress: 'In Progress', supResolved: 'Resolved', noSupReq: 'No support requests yet',
    plansSub: 'Per-student monthly pricing', collectedW: 'Collected', pendingW: 'Pending', allW: 'All', editStudent: 'Edit Student', thePlatform: 'the platform', repSchoolsSub: 'city, students, plan, status', subActive: 'Active', subExpired: 'Expired', subTrial: 'Trial', feeTypeTuition: 'Tuition', feeTypeAdmission: 'Admission', feeTypeTransport: 'Transport', feeTypeExam: 'Exam', feeTypeLibrary: 'Library', feeTypeActivity: 'Activity', feeTypeComputer: 'Computer Lab', feeTypeOther: 'Other', allTypes: 'All Types', searchFee: 'Search name, enrollment no. or class…', thEnr: 'Enr. No.', thType: 'Type', feeByType: 'Fee by Type', feeByTypeSub: 'Collected and pending per fee type, computed live.', addFee: 'Add Fee', addFeeSub: 'Add one fee record manually for any student.', feeStruct: 'Fee Structure', feeStructSub: 'Monthly amount per class. Generate uses this to create fee records.', genFees: 'Generate Fees', saveStruct: 'Save Structure', addRow: 'Add Row', customType: 'Custom…', typeCustomPh: 'Type a custom fee type', fStudent: 'Student', fMonth: 'Month', fType: 'Fee Type', fAmount: 'Amount (₹)', fStatus: 'Status', fDate: 'Date', printList: 'Print List', printStmt: 'Print Statement', backFees: 'Back to All Fees', totalBilled: 'Total Billed', totalPaid: 'Paid', totalPending: 'Pending', feeRecsH: 'Fee Records', feeProfileSub: 'All fee records for this student in one place.', tFeeAdded: 'Fee record added.', delFeeMsg: 'Delete this pending fee record?', tFeeDeleted: 'Fee record deleted.', tPickStudent: 'Please choose a student.', tAmtPositive: 'Amount must be more than 0.', tTypeRequired: 'Please type the custom fee type.', tStructSaved: 'Fee structure saved.', tStructAdded: 'Structure row added.', tStructRemoved: 'Structure row removed.', tGenRecords: 'fee records generated for', tGenSkipped: 'already existed', tNoFeeRecs: 'No fee records yet for this student.', printTitle: 'Fee Statement', printListTitle: 'Fee List', printGenOn: 'Generated on', closeW: 'Close', saveFeeBtn: 'Save Fee', photoLabel: 'Student Photo', photoHint: 'Photo is compressed automatically (max 512px, ~120KB).', removePhoto: 'Remove photo', logoLabel: 'School Logo', logoHint: 'Logo is compressed automatically (max 256px, PNG keeps transparency).', removeLogo: 'Remove logo', tPhotoTooBig: 'That photo is too large even after compression. Please choose a smaller photo.', tLogoTooBig: 'That logo is too large even after compression. Please choose a smaller logo.', tPhotoError: 'Could not read that image. Please choose another file.', aadhaarHint: 'Optional. Stored securely and never shown in full.', actActivate: 'Activate Student', actAtt: 'View Attendance', actDeactivate: 'Deactivate Student', actDownload: 'Download Details', actEdit: 'Edit Student', actFees: 'View Fees', actIdCard: 'Print ID Card', actResults: 'View Results', actTransfer: 'Transfer Student', actView: 'View Profile', actionsW: 'Actions', admNoAuto: 'Auto-generated', allClasses: 'All Classes', allFeeSt: 'All Fee Status', allGenders: 'All Genders', allSections: 'All Sections', allSessions: 'All Sessions', allStatus: 'All Statuses', attPct: 'Attendance', backDir: 'Back to Directory', cancelAdm: 'Cancel Admission', cancelAdmMsg: 'Cancel this admission? The student record will be kept with status Cancelled.', docMissing: 'Not received', docStatus: 'Received', docsNote: 'Document files will be uploaded in the server phase. This checklist records what has been received.', exportCsv: 'Export CSV', fAadhaar: 'Aadhaar Number (optional)', fAdmDate: 'Admission Date', fAdmNo: 'Admission Number', fBirthCert: 'Birth Certificate', fBlood: 'Blood Group', fCategory: 'Category', fDistrict: 'District', fDob: 'Date of Birth', fDocsOther: 'Other Documents (notes)', fFather: 'Father\'s Name', fGender: 'Gender', fMother: 'Mother\'s Name', fOccupation: 'Occupation', fParentEmail: 'Parent Email', fPhone2: 'Secondary Mobile', fPin: 'PIN Code', fPrevClass: 'Previous Class', fPrevSchool: 'Previous School', fSection: 'Section', fState: 'State', fTc: 'Transfer Certificate (TC)', fTcNo: 'Transfer Certificate No.', feeSt: 'Fee Status', hwDone: 'Done', hwPend: 'Pending', hwPending: 'Homework Pending', latestExam: 'Latest Exam', nextW: 'Next', noActivity: 'No activity recorded yet.', noAttRecs: 'No attendance records yet for this student.', noExamRecs: 'No examination results yet.', noHwRecs: 'No homework records for this class.', openFees: 'Open Fee Page', pgOf: 'of', pgPage: 'Page', phase3W: 'Phase 3', prevW: 'Previous', saveAddAnother: 'Save & Add Another', saveDraft: 'Save as Draft', secAcademic: 'Academic Details', secDocs: 'Documents', secParent: 'Parent / Guardian Details', secPersonal: 'Personal Details', stActive: 'Active Students', stAvgAtt: 'Average Attendance', stBoys: 'Boys', stByClass: 'Students by Class', stByClassSub: 'Number of students in each class-section.', stGenderDist: 'Boys & Girls', stGenderSub: 'Gender distribution across the school.', stGirls: 'Girls', stInactive: 'Inactive Students', stNewAdm: 'New Admissions', stNotSpec: 'Not specified', stPendFee: 'Students with Pending Fees', stTotal: 'Total Students', stuSearchPh: 'Search name, admission no. or mobile…', tActMsg: 'Activate student', tActivated: 'Student activated.', tAdmCancelled: 'Admission cancelled. The record is kept.', tAdmCreated: 'Admission saved. Admission No. ', tCsvExported: 'Student list exported.', tDeactMsg: 'Deactivate student', tDeactivated: 'Student deactivated.', tDraftSaved: 'Draft saved.', tDupFound: 'A matching student already exists: ', tInvalidAadhaar: 'Aadhaar must be 12 digits (optional).', tInvalidMobile: 'Enter a valid 10-digit mobile number.', tInvalidPin: 'PIN code must be 6 digits.', tPickClass: 'Please choose a class.', tReqFields: 'Please fill Student Name, Primary Mobile, Class and Section.', tStuCsvOne: 'Student details downloaded.', tTransferred: 'Student transferred.', tabAcademic: 'Academic Records', tabActivity: 'Activity History', tabAttendance: 'Attendance History', tabDocs: 'Documents', tabFees: 'Fee History', tabHomework: 'Homework Records', tabOverview: 'Overview', tabParent: 'Parent Information', tabPersonal: 'Personal Information', tabResults: 'Examination Results', thAdmNo: 'Admission No.', thExam: 'Exam', thFather: 'Father\'s Name', transferTitle: 'Transfer Student', transferTo: 'New Class & Section', idCardSoon: 'ID Card generator comes in Phase 3.',
    impTitle: 'Bulk Import Students', impImportBtn: 'Import Students', impTemplate: 'Download Sample Template', impTemplateSub: 'CSV format only — Excel (.xlsx) files cannot be read here. Use the template columns.', impChooseFile: 'Choose CSV File', impPreview: 'Import Preview', impSummary: 'Import Summary', impValid: 'Valid', impError: 'Error', impDuplicate: 'Duplicate', impReason: 'Reason', impConfirm: 'Import Valid Rows', impDone: 'Done', impNoRows: 'No rows found in this file. Please check the template.', impBadHeader: 'This file does not look like the student template — the Name column is missing.', impNoFile: 'Please choose a CSV file first.', impNoValid: 'No valid rows to import.', impImported: 'imported', impSkipped: 'skipped', impErrName: 'Name is required', impErrMobile: 'Mobile must be 10 digits', impErrMobile2: 'Secondary mobile must be 10 digits', impErrClass: 'Class is not valid', impErrSection: 'Section must be A, B or C', impErrPin: 'PIN must be 6 digits', impErrAadhaar: 'Aadhaar must be 12 digits', impErrDob: 'Date of birth is not a valid date', impErrAdmDate: 'Admission date is not a valid date', impErrSession: 'Session is not valid (e.g. 2025–26)', impErrGender: 'Gender must be Boy, Girl or Other', impErrBlood: 'Blood group is not valid', impErrCategory: 'Category must be General, OBC, SC, ST or Other', impErrEmail: 'Parent email is not valid', impErrRoll: 'Roll must be a positive number', impErrBool: 'Must be Yes or No', impErrDup: 'Duplicate of', impErrDupFile: 'Duplicate in this file', tImpDone: 'Bulk import complete.', tImpTemplate: 'Sample template downloaded.',
    promoTitle: 'Promote Students', promoBtn: 'Promote Students', promoSingle: 'Promote Student', promoFromSession: 'Current Session', promoFromClass: 'Current Class', promoToSession: 'Target Session', promoToClass: 'Target Class', promoToSection: 'Target Section', promoSelectAll: 'Select All', promoSelectNone: 'Select None', promoSelected: 'selected', promoPromote: 'Promote Selected', promoRetain: 'Retain Selected', promoNoStudents: 'No students in this class and session.', promoNoSelect: 'Please select at least one student.', promoNoop: 'Target class and session are the same as current — nothing to change.', promoNoopRetain: 'Target session is the same as the current session — nothing to change.', promoDone: 'Promotion complete.', promoPromoted: 'promoted', promoRetained: 'retained', promoNote: 'Attendance, fees, exam marks and homework history are preserved.', promoSingleNote: 'Single student promotion', promoSkipped: 'skipped (already moved)', promoNotEligible: 'Only Active or Inactive students can be promoted.',
    idcPreview: 'ID Card Preview', idcPrint: 'Print', idcPrintCards: 'Print ID Cards', idcSelectAll: 'Select all', idcClearSel: 'Clear selection', idcReady: 'ID cards ready to print', idcEmergency: 'Emergency Contact', idcReturn: 'If found, please return to', idcNoQr: 'QR code could not be generated.',
    authParent: 'Parent', parentAdmNo: 'Admission Number', parentPinLabel: 'Parent PIN', parentLoginBtn: 'Login as Parent', parentNote: 'Parent access on this device uses a PIN set by the school. Real password accounts arrive with the server version.', parentSub: 'Parent', parentDashboard: 'My Child', tInvalidParent: 'Invalid admission number or PIN.', tParentScope: 'You can only view your own child\'s profile.', parentAccess: 'Parent Access', parentPinNow: 'Current Parent PIN', parentPinNone: 'No PIN set — parent login unavailable for this student.', parentPinNew: 'New PIN (4–6 digits)', parentPinSetBtn: 'Set PIN', parentPinClear: 'Clear PIN', tPinLen: 'PIN must be 4–6 digits.', tPinSet: 'Parent PIN set.', tPinCleared: 'Parent PIN cleared.', tPinAuto: 'Default PIN is the last 4 digits of the parent\'s mobile.', admissions: 'Admission Requests', admReqTitle: 'admission requests', admReqApply: 'Apply for Admission', admReqFormTitle: 'Apply for Admission', admReqSchool: 'School', admReqNoSchool: 'No school account exists on this device yet — admission requests open after a school signs up here.', admReqClassApply: 'Class Applying For', admReqSubmitted: 'Application received. The school will review it and contact you.', admReqApprove: 'Approve', admReqReject: 'Reject', admReqView: 'View', admReqReason: 'Reason (optional)', admReqApproved: 'Admission request approved.', admReqRejected: 'Admission request rejected.', admReqPrefilled: 'Prefilled from an admission request — check the details before saving.', admReqStatus: 'Status', admReqSubmittedOn: 'Submitted', admReqEmpty: 'No admission requests yet.', admReqPending: 'Pending', admReqApprovedSt: 'Approved', admReqRejectedSt: 'Rejected', admReqAll: 'All', tReqName: 'Student name is required.', tReqClass: 'Please choose the class.', tAdmReqFailed: 'Could not save the application for that school.', softDelMsg: 'Remove this student? The record is kept (soft delete) — fees, marks, attendance and homework stay saved.', tStudentRemoved: 'Student removed (record kept).', tAdmReqInvalid: 'Please fill the student name, a 10-digit mobile and the class.',
    collectFeeBtn: 'Collect Fee', rcptTitle: 'FEE RECEIPT', rcptReceiptNo: 'Receipt No', rcptDate: 'Date', rcptAdmNo: 'Adm No', rcptSession: 'Session', rcptName: 'Name', rcptClass: 'Class', rcptInstallment: 'Installment', rcptCounter: 'Counter No', rcptSlNo: 'Sl.No', rcptDesc: 'Description', rcptDue: 'Due', rcptCon: 'Con', rcptPaid: 'Paid', rcptAdmissionFee: 'Admission Fee', rcptTuitionFee: 'Tuition Fee', rcptCaution: 'Caution Money', rcptAnnual: 'Annual Charges', rcptBusFee: 'Bus Fee', rcptDues: 'Dues', rcptPayModeTitle: 'PAY MODE INFORMATION', rcptPayMode: 'Pay Mode', rcptBank: 'Bank', rcptNumber: 'Number', rcptTotal: 'Total', rcptTotalWords: 'Total in Words', rcptComputerGen: 'This is a computer generated Receipt. Does not required signature.', rcptParentCopy: 'PARENT COPY', rcptCollectorSign: 'Collector\'s Signature', rcptIncludeBus: 'Include Bus/Transport', rcptOtherFees: 'Other Fees', rcptAnnualHint: 'One-time and annual amounts used on the Collect Fee receipt. Set 0 to hide a row.', payModeCash: 'Cash', payModeCheque: 'Cheque', payModeUpi: 'UPI', payModeCard: 'Card', payModeBank: 'Bank Transfer', tFeeCollected: 'Fee collected.', tCollectZero: 'Nothing to collect — enter a Paid amount.', tCollectSaved: 'Fee collected — Receipt ', tCollectNotActive: 'This student is not active — fee cannot be collected.', rcptReceipts: 'Receipts', rcptView: 'View', rcptPrint: 'Print / Save PDF', rcptCollectAgain: 'Collect Again', rcptNoReceipts: 'No receipts yet for this student.', rcptDraft: 'Draft — not saved yet', rcptCollectSave: 'Collect & Save', rcptNoLines: 'Nothing to collect for this period — set the fee amounts in Fee Structure first.',
    sbForgotPw: 'Forgot password?', sbRecoverTitle: 'Reset Password', sbSendResetLink: 'Send Reset Link', sbResetPw: 'Set New Password', sbRecoverSent: 'If an account exists for that email, a reset link was sent. Check your inbox.', sbRecoverFailed: 'Could not send the reset link. Check your connection and try again.', sbResetDone: 'Password updated. Log in with your new password.', sbResetFailed: 'Could not update the password. The link may have expired — request a new one.', sbTooMany: 'Too many attempts — please wait a few minutes and try again.', sbEmailConfirm: 'Server account created — confirm your email to use it on other devices.', sbEmailConfirmed: 'Email confirmed — log in to continue.', sbOfflineLogin: 'You are offline — using this device’s account.', sbTitle: 'Server Backup', sbBackupNow: 'Back Up Now', sbStatusSynced: 'Backed up to the server.', sbStatusPending: 'Backup pending — it will run on your next login.', sbStatusUploading: 'Backing up to the server…', sbStatusFailed: 'Backup failed — it will retry on your next login.', sbStatusOffline: 'Offline — backup will run when you are back online.', sbStatusNotSchool: 'Server backup is available for school accounts.', sbBackupDone: 'Backup complete.', sbBackupFailed: 'Backup did not finish — check your connection and try again.'
  },
  hi: {
    dashboard: 'डैशबोर्ड', schools: 'स्कूल', users: 'उपयोगकर्ता', subscriptions: 'सदस्यता', analytics: 'विश्लेषण', settings: 'सेटिंग्स', reports: 'रिपोर्ट', help: 'सहायता', students: 'छात्र प्रबंधन', attendance: 'उपस्थिति', fees: 'शुल्क', exams: 'परीक्षा', homework: 'होमवर्क', notices: 'नोटिस', totalSchools: 'कुल स्कूल', totalUsers: 'कुल उपयोगकर्ता', activeSchools: 'सक्रिय स्कूल', pendingApproval: 'स्वीकृति लंबित', totalStudents: 'कुल छात्र', totalTeachers: 'कुल शिक्षक', feeCollected: 'शुल्क संग्रह', pendingFee: 'बकाया शुल्क', logout: 'लॉगआउट',
    navFeatures: 'सुविधाएँ', navDashboards: 'डैशबोर्ड', navSchools: 'स्कूल', navLogin: 'लॉगिन',
    heroTitle: 'नेक्स्ट-जनरेशन स्कूल मैनेजमेंट सिस्टम', heroSub: 'बेहतर और उज्ज्वल शिक्षा के लिए — पूरे स्कूल के लिए एक ऐप: छात्र, शिक्षक, शुल्क, उपस्थिति, परीक्षा और नोटिस।', heroGetStarted: 'शुरू करें →', heroExplore: 'डेमो देखें',
    statsTitle: 'बिहार भर के स्कूलों का भरोसा', statsSub: 'School Saathi नेटवर्क के लाइव आंकड़े।', todayAttendance: 'आज की उपस्थिति', feeCollectedRange: 'शुल्क संग्रह (अप्रैल–अगस्त)',
    featTitle: 'मुख्य सुविधाएँ', featSub: 'स्कूल को जो कुछ चाहिए, सब एक जगह।',
    feat1t: 'मल्टी-स्कूल प्रबंधन', feat1d: 'एक प्लेटफ़ॉर्म, हर स्कूल का अपना लॉगिन, वर्कस्पेस, नाम और डेटा — पूरी तरह अलग।',
    feat2t: 'भूमिका-आधारित पहुँच', feat2d: 'सुपर एडमिन, स्कूल एडमिन, शिक्षक और छात्र — हर भूमिका सिर्फ वही देखती है जो उसे देखना चाहिए।',
    feat3t: 'रियल-टाइम विश्लेषण', feat3d: 'उपस्थिति, शुल्क संग्रह और वृद्धि — हर डैशबोर्ड पर लाइव चार्ट और आंकड़े।',
    feat4t: 'सुरक्षित और स्केलेबल', feat4d: 'आपके स्कूल का डेटा आपके स्कूल के खाते में रहता है। 100 या 10,000 छात्रों के लिए काम करता है।',
    feat5t: 'हिंदी + अंग्रेज़ी सपोर्ट', feat5d: 'एक टैप में पूरा इंटरफ़ेस हिंदी और अंग्रेज़ी के बीच बदलें।',
    feat6t: 'वेब + एंड्रॉयड ऐप', feat6d: 'PC और फ़ोन पर चलता है। ऐप की तरह इंस्टॉल होता है — पहली बार लोड होने के बाद ऑफ़लाइन भी काम करता है।',
    rolesTitle: 'तीन डैशबोर्ड, एक सिस्टम', rolesSub: 'डेमो डैशबोर्ड खोलने के लिए किसी भूमिका पर टैप करें — पासवर्ड की ज़रूरत नहीं।',
    roleSuper: 'सुपर एडमिन', roleSuperD: 'प्लेटफ़ॉर्म मालिक — सभी 24 स्कूल, उपयोगकर्ता, सदस्यता और वृद्धि एक नज़र में।', goSuper: 'सुपर एडमिन खोलें →',
    roleSchool: 'स्कूल एडमिन — राहुल कुमार', roleSchoolD: 'सेंट ज़ेवियर स्कूल, पटना — छात्र, उपस्थिति, शुल्क, परीक्षा, होमवर्क और नोटिस।', goSchool: 'स्कूल एडमिन खोलें →',
    roleStudent: 'छात्र — रिया कुमारी', roleStudentD: 'कक्षा 10th-A — उपस्थिति, शुल्क, परिणाम और होमवर्क, मोबाइल जैसी स्क्रीन पर।', goStudent: 'छात्र दृश्य खोलें →',
    landFooter: '<b>School Saathi</b> — Smart Education. Better Tomorrow.<br>बिहार के लिए बना • स्कूलों के लिए मुफ़्त • गोपालगंज, बिहार में बना ❤️',
    loginWelcome: 'लॉग इन करें या साइन अप करें<br>जारी रखने के लिए', loginEmail: 'ईमेल', loginPassword: 'पासवर्ड', loginEmailPh: 'आप@school.edu.in', loginPwPh: '••••••••', loginBtn: 'लॉगिन', authLogin: 'लॉग इन', authSignup: 'साइन अप', authNote: 'एक स्कूल, एक अकाउंट। सर्वर वर्शन आने तक आपके स्कूल का डेटा इसी डिवाइस पर रहेगा।', suSchool: 'स्कूल का नाम', suYourName: 'आपका नाम', suEmail: 'ईमेल', suPw: 'पासवर्ड', suPw2: 'पासवर्ड दोबारा डालें', suBtn: 'अकाउंट बनाएँ', loginOr: 'या जारी रखें', demoTitle: '— एक टैप में डेमो लॉगिन —', loginBack: '← वेबसाइट पर वापस',
    superDashboard: 'सुपर एडमिन डैशबोर्ड', schoolDashboard: 'स्कूल एडमिन डैशबोर्ड', studentDashboard: 'छात्र डैशबोर्ड',
    confirmTitle: 'पुष्टि करें', cancel: 'रद्द करें', confirmYes: 'हाँ, जारी रखें', saveBtn: 'सहेजें',
    addSchool: 'स्कूल जोड़ें', addStudent: 'छात्र जोड़ें', saveAttendance: 'उपस्थिति सहेजें', saveMarks: 'अंक सहेजें', addHomework: 'होमवर्क जोड़ें', publishNotice: 'नोटिस प्रकाशित करें', downloadReport: 'रिपोर्ट डाउनलोड करें', approve: 'स्वीकृत करें', remove: 'हटाएँ', editBtn: 'बदलें', deleteBtn: 'हटाएँ', collectBtn: 'वसूलें', saveSettingsBtn: 'सेटिंग्स सहेजें', resetAllData: 'सारा डेटा रीसेट करें', resetPwTitle: 'रीसेट करने के लिए पासवर्ड डालें', resetPwHint: 'रीसेट करने से स्कूल का सारा डेटा हमेशा के लिए मिट जाएगा — छात्र, शिक्षक, फीस, उपस्थिति, परीक्षा, होमवर्क, नोटिस और रसीदें। यह वापस नहीं होगा।', resetConfirmMsg: 'इससे सारा डेटा हमेशा के लिए मिट जाएगा — छात्र, शिक्षक, फीस, उपस्थिति, परीक्षा, होमवर्क, नोटिस और रसीदें। यह वापस नहीं होगा।', resetPwLabel: 'अकाउंट पासवर्ड', resetPwWrong: 'गलत पासवर्ड — कुछ भी रीसेट नहीं हुआ।', resetPwGo: 'जाँचें और जारी रखें', publishBtn: 'प्रकाशित करें', assignHw: 'होमवर्क सौंपें', saveSchoolBtn: 'स्कूल सहेजें', saveStudentBtn: 'छात्र सहेजें',
    attOverview: 'उपस्थिति अवलोकन', todayAtt: 'आज की उपस्थिति', feeTrend: 'शुल्क संग्रह प्रवृत्ति', feeTrendSub: 'अप्रैल – अगस्त (संग्रह बनाम बकाया)', feeTrendSub2: 'अप्रैल से अगस्त (संग्रह बनाम बकाया)', recentAct: 'हाल की गतिविधियाँ', activityLog: 'गतिविधि लॉग', actLogSub: 'पूरी ऑडिट हिस्ट्री — नई पहले।', thDetails: 'विवरण', actBy: 'द्वारा', supYourName: 'आपका नाम', quickLinks: 'त्वरित लिंक', jumpTask: 'किसी कार्य पर जाएँ', top5: 'शीर्ष 5 स्कूल', byStrength: 'छात्र संख्या के अनुसार', platformTotals: 'प्लेटफ़ॉर्म कुल', platformTotalsSub: 'प्लेटफ़ॉर्म पर स्कूलों के लाइव कुल', subsStatus: 'सदस्यता स्थिति', subsSub: 'योजना स्थिति के अनुसार स्कूलों का हिस्सा', quickActions: 'त्वरित कार्य', qaSub: 'आम व्यवस्थापक कार्य', enterMarks: 'अंक भरें', myHomework: 'मेरा होमवर्क', noticesH: 'नोटिस', latestNotices: 'स्कूल से नवीनतम', plansH: 'योजनाएँ', guidesH: 'त्वरित मार्गदर्शिकाएँ', guidesSub: 'सबसे आम कार्य', contactH: 'संपर्क', contactSub: 'हम एक कार्य दिवस के भीतर जवाब देते हैं', studentsReport: 'छात्र रिपोर्ट', feesReport: 'शुल्क रिपोर्ट', attReport: 'उपस्थिति रिपोर्ट', schoolsReport: 'स्कूल रिपोर्ट',
    thName: 'नाम', thClass: 'कक्षा', thRoll: 'रोल', thGuardian: 'अभिभावक', thPhone: 'फ़ोन', thAtt: 'उप.', thFee: 'शुल्क', thAction: 'कार्रवाई', thStudent: 'छात्र', thMonth: 'महीना', thAmount: 'राशि', thDate: 'तारीख', thStatus: 'स्थिति', thSchool: 'स्कूल', thCity: 'शहर', thStudents: 'छात्र', thUsers: 'उपयोगकर्ता', thPlan: 'योजना', thMarks: 'अंक', thResult: 'परिणाम', thSince: 'से', thRole: 'भूमिका',
    subSuperDash: 'प्लेटफ़ॉर्म अवलोकन और प्रबंधन', subSchools: 'प्लेटफ़ॉर्म के सभी स्कूल', subUsers: 'शिक्षक, कर्मचारी और छात्र', subSubs: 'योजनाएँ और बिलिंग स्थिति', subAnalytics: 'वृद्धि, उपस्थिति और शुल्क', subAnalyticsFull: 'पूरे प्लेटफ़ॉर्म पर वृद्धि, उपस्थिति और शुल्क', subReports: 'CSV रिपोर्ट डाउनलोड करें', subHelp: 'मार्गदर्शिकाएँ और संपर्क', subStudents: 'सेंट ज़ेवियर स्कूल, पटना', subAttendance: 'उपस्थिति दर्ज करें और देखें', subFees: 'शुल्क संग्रह और बकाया', subExams: 'परीक्षा और अंक प्रविष्टि', subHomework: 'होमवर्क सौंपें और देखें', subNotices: 'नोटिस बोर्ड',
    fSchoolName: 'स्कूल का नाम', fCity: 'शहर', fStudents: 'छात्र', fPlan: 'योजना', fStudentName: 'छात्र का नाम', fClass: 'कक्षा', fRoll: 'रोल नंबर', fGuardian: 'अभिभावक', fPhone: 'फ़ोन', fTitle: 'शीर्षक', fSubject: 'विषय', fDue: 'देय तारीख', fMessage: 'संदेश', fPrincipal: 'प्रधानाचार्य / एडमिन', fEmail: 'ईमेल', fAddress: 'पता', fSession: 'शैक्षणिक सत्र',
    tLoggedIn: 'के रूप में लॉगिन हुआ', tAccountCreated: 'अकाउंट बन गया। स्वागत है, ', tInvalidCreds: 'ईमेल या पासवर्ड गलत है।', tFillAll: 'कृपया सभी फ़ील्ड भरें।', tInvalidEmail: 'कृपया सही ईमेल पता डालें।', tPwShort: 'पासवर्ड कम से कम 6 अक्षर का हो।', tPwMismatch: 'पासवर्ड मेल नहीं खाते।', tEmailTaken: 'इस ईमेल से अकाउंट पहले से बना है। कृपया लॉग इन करें।', tLoggedOut: 'लॉगआउट हो गया। फिर मिलते हैं!', tBackExit: 'बाहर निकलने के लिए बैक फिर से दबाएँ', tSchoolAdded: 'स्कूल जोड़ा गया — स्वीकृति लंबित।', tSchoolRemoved: 'स्कूल हटाया गया।', tStudentAdded: 'छात्र जोड़ा गया।', tStudentUpdated: 'छात्र अपडेट हुआ।', tStudentDeleted: 'छात्र हटाया गया।', tAttSaved: 'उपस्थिति सहेजी गई', tMarksSaved: 'अंक सहेजे गए', tHwDone: 'होमवर्क पूर्ण के रूप में चिह्नित।', tHwNotDone: 'होमवर्क अपूर्ण के रूप में चिह्नित।', tHwAssigned: 'होमवर्क सौंपा गया।', tNoticePub: 'नोटिस प्रकाशित हुआ।', tReportDl: 'रिपोर्ट डाउनलोड हुई।', tSettingsSaved: 'सेटिंग्स सहेजी गईं।', tAllReset: 'सारा डेटा मिट गया — स्कूल अब खाली है।', tSessionChanged: 'शैक्षणिक सत्र बदला गया', tApproved: 'स्वीकृत। लंबित स्वीकृतियाँ:', tNoChanges: 'कोई बदलाव नहीं।', tStudentsRange: 'छात्रों की संख्या 1 से 100,000 के बीच होनी चाहिए।', tFutureDate: 'भविष्य की तारीख नहीं चुन सकते — आज की तारीख दिखा रहे हैं।', tDueFuture: 'देय तारीख आज या आगे की होनी चाहिए।', tDemoLogin: 'डेमो खाता — नीचे एक-टैप लॉगिन इस्तेमाल करें।', tGoogleDemo: 'डेमो बिल्ड — कृपया एक-टैप डेमो लॉगिन इस्तेमाल करें।', tNoStudentData: 'कोई छात्र डेटा नहीं — अपने स्कूल एडमिन से छात्र जोड़ने को कहें।', tNoExams: 'अभी कोई परीक्षा नहीं है।', tNoHw: 'अभी कोई होमवर्क नहीं है।', tNoMarks: 'इस परीक्षा के लिए अभी कोई अंक नहीं भरे गए।', tNoMatch: 'कोई छात्र नहीं मिला।', tNoSchoolsMatch: 'कोई स्कूल नहीं मिला।', tNotEntered: 'नहीं भरा गया', tCollectedFrom: 'से वसूला गया', tDupSchool: 'पहले से मौजूद है।', tDupStudent: 'में पहले से मौजूद है', tNotSaved: 'सहेजा नहीं गया', tCheckMarks: 'अंक जाँचें', tStudentsWord: 'छात्र', tNoFeeData: 'अभी कोई शुल्क डेटा नहीं है।',
    searchStudent: 'छात्र खोजें…', searchSchool: 'स्कूल या शहर खोजें…', viewAll: 'सभी देखें →', classAvg: 'कक्षा औसत', studentsMarked: 'छात्रों के अंक भरे गए', ofWord: 'में से', showingRec: 'दिखाए जा रहे हैं', ofRec: 'में से', recordsWord: 'रिकॉर्ड।', tapDone: 'पूरा होने पर बॉक्स पर टैप करें', myHwSub: 'पूरा होने पर बॉक्स पर टैप करें', tileAtt: 'उपस्थिति', tileFees: 'शुल्क', tileResults: 'परिणाम', tileHw: 'होमवर्क', doneSuffix: 'पूर्ण', presBtn: 'उपस्थित', absBtn: 'अनुपस्थित', lateBtn: 'देर से',
    qaAddSchool: 'स्कूल जोड़ें', qaAddSchoolD: 'नया स्कूल जोड़ें', qaManageUsers: 'उपयोगकर्ता प्रबंधित करें', qaManageUsersD: 'भूमिकाएँ और खाते', qaViewReports: 'रिपोर्ट देखें', qaViewReportsD: 'CSV डाउनलोड करें', qaSysSettings: 'सिस्टम सेटिंग्स', qaSysSettingsD: 'प्लेटफ़ॉर्म कॉन्फ़िग',
    qaAddStudent: 'छात्र जोड़ें', qaAddStudentD: 'नया प्रवेश', qaMarkAtt: 'उपस्थिति दर्ज करें', qaMarkAttD: 'आज का रजिस्टर', qaEnterMarks: 'अंक भरें', qaEnterMarksD: 'परीक्षा परिणाम', qaGenReport: 'रिपोर्ट बनाएँ', qaGenReportD: 'CSV डाउनलोड',
    dlStudents: 'छात्र CSV डाउनलोड करें', dlFees: 'शुल्क CSV डाउनलोड करें', dlAtt: 'उपस्थिति CSV डाउनलोड करें', dlSchools: 'स्कूल CSV डाउनलोड करें',
    repStudentsSub: 'नाम, कक्षा, रोल, अभिभावक, फ़ोन, उपस्थिति, शुल्क स्थिति', repFeesSub: 'छात्र, कक्षा, महीना, राशि, स्थिति — अप्रैल से अगस्त',
    subSettingsP: 'प्लेटफ़ॉर्म सेटिंग्स', subSettingsS: 'स्कूल प्रोफ़ाइल', settingsSub: 'बदलें और सहेजें — बदलाव इस डिवाइस पर सहेजे जाते हैं।',
    sysSettings: 'सिस्टम सेटिंग्स', platformConfig: 'प्लेटफ़ॉर्म कॉन्फ़िगरेशन', platformH: 'प्लेटफ़ॉर्म', supName: 'प्लेटफ़ॉर्म का नाम', supTagline: 'टैगलाइन', supSession: 'डिफ़ॉल्ट सत्र', supEmail: 'सहायता ईमेल', supStorage: 'डेटा संग्रहण', supStorageV: 'इस डिवाइस पर (localStorage) — डेमो बिल्ड',
    studentsW: 'छात्र', perSchool: 'प्रति स्कूल 2',
    schoolsOnPlatform: 'प्लेटफ़ॉर्म पर स्कूल', pendingApprovalL: 'स्वीकृति लंबित',
    planBasicT: 'बेसिक — ₹8 / छात्र / माह', planBasicD: 'उपस्थिति, शुल्क, नोटिस', planStdT: 'स्टैंडर्ड — ₹12 / छात्र / माह', planStdD: '+ परीक्षा, होमवर्क, रिपोर्ट', planPremT: 'प्रीमियम — ₹15 / छात्र / माह', planPremD: '+ विश्लेषण, WhatsApp, प्राथमिकता सहायता', setupLine: 'सेटअप ₹4,999 एक बार • 1 महीना मुफ़्त ट्रायल • वार्षिक अग्रिम = 2 महीने मुफ़्त।',
    guide1t: 'स्कूल जोड़ें', guide1d: 'स्कूल → + स्कूल जोड़ें → विवरण भरें → सहेजें। नए स्कूल स्वीकृति तक लंबित रहते हैं।', guide2t: 'शुल्क वसूलें', guide2d: 'स्कूल एडमिन → शुल्क → बकाया रिकॉर्ड पर वसूलें दबाएँ। कुल तुरंत अपडेट होता है।', guide3t: 'उपस्थिति दर्ज करें', guide3d: 'स्कूल एडमिन → उपस्थिति → कक्षा और तारीख चुनें → उपस्थित / अनुपस्थित / देर से → सहेजें।',
    contactPhone: 'फ़ोन', contactHours: 'समय', hoursV: 'सोम–शनि, सुबह 9 – शाम 6', raiseSupport: 'सहायता अनुरोध भेजें', supportNoted: 'सहायता अनुरोध दर्ज हुआ — हम आपको कॉल करेंगे।', recentSup: 'हाल के सहायता अनुरोध', supOpen: 'खुला', supProgress: 'प्रगति में', supResolved: 'हल हो गया', noSupReq: 'अभी कोई सहायता अनुरोध नहीं',
    plansSub: 'प्रति छात्र मासिक मूल्य', collectedW: 'संग्रह', pendingW: 'बकाया', allW: 'सभी', editStudent: 'छात्र बदलें', thePlatform: 'पूरे प्लेटफ़ॉर्म', repSchoolsSub: 'शहर, छात्र, योजना, स्थिति', subActive: 'सक्रिय', subExpired: 'समाप्त', subTrial: 'परीक्षण', feeTypeTuition: 'ट्यूशन', feeTypeAdmission: 'प्रवेश', feeTypeTransport: 'परिवहन', feeTypeExam: 'परीक्षा', feeTypeLibrary: 'पुस्तकालय', feeTypeActivity: 'गतिविधि', feeTypeComputer: 'कंप्यूटर लैब', feeTypeOther: 'अन्य', allTypes: 'सभी प्रकार', searchFee: 'नाम, नामांकन संख्या या कक्षा खोजें…', thEnr: 'नामांकन सं.', thType: 'प्रकार', feeByType: 'प्रकार के अनुसार शुल्क', feeByTypeSub: 'प्रति प्रकार संग्रह और बकाया, लाइव गणना।', addFee: 'शुल्क जोड़ें', addFeeSub: 'किसी भी छात्र के लिए एक शुल्क रिकॉर्ड जोड़ें।', feeStruct: 'शुल्क संरचना', feeStructSub: 'प्रति कक्षा मासिक राशि। Generate इसी से रिकॉर्ड बनाता है।', genFees: 'शुल्क बनाएँ', saveStruct: 'संरचना सहेजें', addRow: 'पंक्ति जोड़ें', customType: 'कस्टम…', typeCustomPh: 'शुल्क का प्रकार लिखें', fStudent: 'छात्र', fMonth: 'महीना', fType: 'शुल्क प्रकार', fAmount: 'राशि (₹)', fStatus: 'स्थिति', fDate: 'तारीख', printList: 'सूची छापें', printStmt: 'विवरण छापें', backFees: 'सभी शुल्क पर वापस', totalBilled: 'कुल बिल', totalPaid: 'जमा', totalPending: 'बकाया', feeRecsH: 'शुल्क रिकॉर्ड', feeProfileSub: 'इस छात्र के सभी शुल्क रिकॉर्ड एक ही जगह।', tFeeAdded: 'शुल्क रिकॉर्ड जुड़ गया।', delFeeMsg: 'यह बकाया शुल्क रिकॉर्ड हटाएँ?', tFeeDeleted: 'शुल्क रिकॉर्ड हटा दिया गया।', tPickStudent: 'कृपया छात्र चुनें।', tAmtPositive: 'राशि 0 से अधिक होनी चाहिए।', tTypeRequired: 'कृपया शुल्क का प्रकार लिखें।', tStructSaved: 'शुल्क संरचना सहेजी गई।', tStructAdded: 'संरचना पंक्ति जुड़ी।', tStructRemoved: 'संरचना पंक्ति हटाई गई।', tGenRecords: 'शुल्क रिकॉर्ड बने', tGenSkipped: 'पहले से थे', tNoFeeRecs: 'इस छात्र के लिए अभी कोई शुल्क रिकॉर्ड नहीं है।', printTitle: 'शुल्क विवरण', printListTitle: 'शुल्क सूची', printGenOn: 'बनाया गया', closeW: 'बंद करें', saveFeeBtn: 'शुल्क सहेजें', photoLabel: 'छात्र की फ़ोटो', photoHint: 'फ़ोटो अपने आप छोटी हो जाती है (अधिकतम 512px, ~120KB)।', removePhoto: 'फ़ोटो हटाएँ', logoLabel: 'स्कूल का लोगो', logoHint: 'लोगो अपने आप छोटा हो जाता है (अधिकतम 256px, PNG में पारदर्शिता रहती है)।', removeLogo: 'लोगो हटाएँ', tPhotoTooBig: 'यह फ़ोटो छोटी करने के बाद भी बड़ी है। कृपया छोटी फ़ोटो चुनें।', tLogoTooBig: 'यह लोगो छोटा करने के बाद भी बड़ा है। कृपया छोटा लोगो चुनें।', tPhotoError: 'यह तस्वीर पढ़ी नहीं जा सकी। कृपया दूसरी फ़ाइल चुनें।', aadhaarHint: 'वैकल्पिक। सुरक्षित रूप से सहेजा जाता है, पूरा कभी नहीं दिखाया जाता।', actActivate: 'छात्र सक्रिय करें', actAtt: 'उपस्थिति देखें', actDeactivate: 'छात्र निष्क्रिय करें', actDownload: 'विवरण डाउनलोड करें', actEdit: 'छात्र बदलें', actFees: 'शुल्क देखें', actIdCard: 'ID कार्ड छापें', actResults: 'परिणाम देखें', actTransfer: 'छात्र स्थानांतरित करें', actView: 'प्रोफ़ाइल देखें', actionsW: 'कार्रवाई', admNoAuto: 'स्वतः निर्मित', allClasses: 'सभी कक्षाएँ', allFeeSt: 'सभी शुल्क स्थितियाँ', allGenders: 'सभी लिंग', allSections: 'सभी अनुभाग', allSessions: 'सभी सत्र', allStatus: 'सभी स्थितियाँ', attPct: 'उपस्थिति', backDir: 'सूची पर वापस', cancelAdm: 'प्रवेश रद्द करें', cancelAdmMsg: 'यह प्रवेश रद्द करें? छात्र का रिकॉर्ड Cancelled स्थिति के साथ रखा जाएगा।', docMissing: 'प्राप्त नहीं', docStatus: 'प्राप्त', docsNote: 'दस्तावेज़ फ़ाइलें सर्वर चरण में अपलोड होंगी। यह सूची बताती है कि क्या प्राप्त हुआ है।', exportCsv: 'CSV निर्यात करें', fAadhaar: 'आधार संख्या (वैकल्पिक)', fAdmDate: 'प्रवेश तिथि', fAdmNo: 'प्रवेश संख्या', fBirthCert: 'जन्म प्रमाण पत्र', fBlood: 'रक्त समूह', fCategory: 'श्रेणी', fDistrict: 'जिला', fDob: 'जन्म तिथि', fDocsOther: 'अन्य दस्तावेज़ (नोट)', fFather: 'पिता का नाम', fGender: 'लिंग', fMother: 'माता का नाम', fOccupation: 'व्यवसाय', fParentEmail: 'अभिभावक ईमेल', fPhone2: 'दूसरा मोबाइल', fPin: 'पिन कोड', fPrevClass: 'पिछली कक्षा', fPrevSchool: 'पिछला स्कूल', fSection: 'अनुभाग', fState: 'राज्य', fTc: 'स्थानांतरण प्रमाण पत्र (TC)', fTcNo: 'TC संख्या', feeSt: 'शुल्क स्थिति', hwDone: 'पूर्ण', hwPend: 'बाकी', hwPending: 'होमवर्क बाकी', latestExam: 'हाल की परीक्षा', nextW: 'अगला', noActivity: 'अभी कोई गतिविधि दर्ज नहीं है।', noAttRecs: 'इस छात्र के लिए अभी कोई उपस्थिति रिकॉर्ड नहीं है।', noExamRecs: 'अभी कोई परीक्षा परिणाम नहीं है।', noHwRecs: 'इस कक्षा के लिए कोई होमवर्क रिकॉर्ड नहीं है।', openFees: 'शुल्क पेज खोलें', pgOf: 'का', pgPage: 'पृष्ठ', phase3W: 'Phase 3', prevW: 'पिछला', saveAddAnother: 'सहेजें और नया जोड़ें', saveDraft: 'ड्राफ़्ट सहेजें', secAcademic: 'शैक्षणिक विवरण', secDocs: 'दस्तावेज़', secParent: 'माता-पिता / अभिभावक विवरण', secPersonal: 'व्यक्तिगत विवरण', stActive: 'सक्रिय छात्र', stAvgAtt: 'औसत उपस्थिति', stBoys: 'लड़के', stByClass: 'कक्षा अनुसार छात्र', stByClassSub: 'प्रत्येक कक्षा-अनुभाग में छात्रों की संख्या।', stGenderDist: 'लड़के और लड़कियाँ', stGenderSub: 'पूरे स्कूल में लिंग वितरण।', stGirls: 'लड़कियाँ', stInactive: 'निष्क्रिय छात्र', stNewAdm: 'नए प्रवेश', stNotSpec: 'निर्दिष्ट नहीं', stPendFee: 'बकाया शुल्क वाले छात्र', stTotal: 'कुल छात्र', stuSearchPh: 'नाम, प्रवेश संख्या या मोबाइल खोजें…', tActMsg: 'छात्र सक्रिय करें', tActivated: 'छात्र सक्रिय हुआ।', tAdmCancelled: 'प्रवेश रद्द हुआ। रिकॉर्ड रखा गया है।', tAdmCreated: 'प्रवेश सहेजा गया। प्रवेश संख्या ', tCsvExported: 'छात्र सूची निर्यात हुई।', tDeactMsg: 'छात्र निष्क्रिय करें', tDeactivated: 'छात्र निष्क्रिय हुआ।', tDraftSaved: 'ड्राफ़्ट सहेजा गया।', tDupFound: 'मेल खाता छात्र पहले से मौजूद है: ', tInvalidAadhaar: 'आधार 12 अंकों का होना चाहिए (वैकल्पिक)।', tInvalidMobile: 'सही 10 अंकों का मोबाइल नंबर डालें।', tInvalidPin: 'पिन कोड 6 अंकों का होना चाहिए।', tPickClass: 'कृपया कक्षा चुनें।', tReqFields: 'कृपया छात्र का नाम, मुख्य मोबाइल, कक्षा और अनुभाग भरें।', tStuCsvOne: 'छात्र का विवरण डाउनलोड हुआ।', tTransferred: 'छात्र स्थानांतरित हुआ।', tabAcademic: 'शैक्षणिक रिकॉर्ड', tabActivity: 'गतिविधि इतिहास', tabAttendance: 'उपस्थिति इतिहास', tabDocs: 'दस्तावेज़', tabFees: 'शुल्क इतिहास', tabHomework: 'होमवर्क रिकॉर्ड', tabOverview: 'सारांश', tabParent: 'अभिभावक जानकारी', tabPersonal: 'व्यक्तिगत जानकारी', tabResults: 'परीक्षा परिणाम', thAdmNo: 'प्रवेश सं.', thExam: 'परीक्षा', thFather: 'पिता का नाम', transferTitle: 'छात्र स्थानांतरण', transferTo: 'नई कक्षा और अनुभाग', idCardSoon: 'ID कार्ड जनरेटर Phase 3 में आएगा।',
    impTitle: 'छात्रों का बल्क आयात', impImportBtn: 'छात्र आयात करें', impTemplate: 'नमूना टेम्पलेट डाउनलोड करें', impTemplateSub: 'सिर्फ CSV प्रारूप — Excel (.xlsx) फ़ाइल यहाँ पढ़ी नहीं जा सकती। टेम्पलेट के कॉलम इस्तेमाल करें।', impChooseFile: 'CSV फ़ाइल चुनें', impPreview: 'आयात पूर्वावलोकन', impSummary: 'आयात सारांश', impValid: 'सही', impError: 'त्रुटि', impDuplicate: 'दोहरा', impReason: 'कारण', impConfirm: 'सही पंक्तियाँ आयात करें', impDone: 'पूर्ण', impNoRows: 'इस फ़ाइल में कोई पंक्ति नहीं मिली। कृपया टेम्पलेट जाँचें।', impBadHeader: 'यह फ़ाइल छात्र टेम्पलेट जैसी नहीं लगती — नाम वाला कॉलम नहीं मिला।', impNoFile: 'कृपया पहले CSV फ़ाइल चुनें।', impNoValid: 'आयात के लिए कोई सही पंक्ति नहीं है।', impImported: 'आयात हुए', impSkipped: 'छोड़े गए', impErrName: 'नाम आवश्यक है', impErrMobile: 'मोबाइल 10 अंकों का होना चाहिए', impErrMobile2: 'दूसरा मोबाइल 10 अंकों का होना चाहिए', impErrClass: 'कक्षा सही नहीं है', impErrSection: 'अनुभाग A, B या C होना चाहिए', impErrPin: 'पिन 6 अंकों का होना चाहिए', impErrAadhaar: 'आधार 12 अंकों का होना चाहिए', impErrDob: 'जन्म तिथि सही तारीख नहीं है', impErrAdmDate: 'प्रवेश तिथि सही तारीख नहीं है', impErrSession: 'सत्र सही नहीं है (जैसे 2025–26)', impErrGender: 'लिंग Boy, Girl या Other होना चाहिए', impErrBlood: 'रक्त समूह सही नहीं है', impErrCategory: 'श्रेणी General, OBC, SC, ST या Other होनी चाहिए', impErrEmail: 'अभिभावक ईमेल सही नहीं है', impErrRoll: 'रोल धनात्मक संख्या होनी चाहिए', impErrBool: 'Yes या No होना चाहिए', impErrDup: 'इसकी प्रतिलिपि', impErrDupFile: 'इस फ़ाइल में दोहरा', tImpDone: 'बल्क आयात पूर्ण हुआ।', tImpTemplate: 'नमूना टेम्पलेट डाउनलोड हुआ।',
    promoTitle: 'छात्रों को प्रोन्नत करें', promoBtn: 'छात्र प्रोन्नत करें', promoSingle: 'छात्र प्रोन्नत करें', promoFromSession: 'वर्तमान सत्र', promoFromClass: 'वर्तमान कक्षा', promoToSession: 'लक्ष्य सत्र', promoToClass: 'लक्ष्य कक्षा', promoToSection: 'लक्ष्य अनुभाग', promoSelectAll: 'सभी चुनें', promoSelectNone: 'कोई नहीं', promoSelected: 'चयनित', promoPromote: 'चयनित को प्रोन्नत करें', promoRetain: 'चयनित को रोकें', promoNoStudents: 'इस कक्षा और सत्र में कोई छात्र नहीं है।', promoNoSelect: 'कृपया कम से कम एक छात्र चुनें।', promoNoop: 'लक्ष्य कक्षा और सत्र वर्तमान जैसे ही हैं — बदलने को कुछ नहीं।', promoNoopRetain: 'लक्ष्य सत्र वर्तमान सत्र जैसा ही है — बदलने को कुछ नहीं।', promoDone: 'प्रोन्नति पूर्ण हुई।', promoPromoted: 'प्रोन्नत हुए', promoRetained: 'रोके गए', promoNote: 'उपस्थिति, शुल्क, परीक्षा अंक और होमवर्क इतिहास सुरक्षित रहता है।', promoSingleNote: 'एक छात्र की प्रोन्नति', promoSkipped: 'छोड़े गए (पहले ही स्थानांतरित)', promoNotEligible: 'केवल सक्रिय या निष्क्रिय छात्र ही प्रोन्नत हो सकते हैं।',
    idcPreview: 'ID कार्ड पूर्वावलोकन', idcPrint: 'छापें', idcPrintCards: 'ID कार्ड छापें', idcSelectAll: 'सभी चुनें', idcClearSel: 'चयन हटाएँ', idcReady: 'ID कार्ड छपाई के लिए तैयार', idcEmergency: 'आपातकालीन संपर्क', idcReturn: 'मिले तो कृपया लौटाएँ', idcNoQr: 'QR कोड नहीं बन सका।',
    authParent: 'अभिभावक', parentAdmNo: 'प्रवेश संख्या', parentPinLabel: 'अभिभावक PIN', parentLoginBtn: 'अभिभावक के रूप में लॉगिन करें', parentNote: 'इस डिवाइस पर अभिभावक लॉगिन स्कूल द्वारा दिए गए PIN से होता है। सर्वर संस्करण में असली पासवर्ड अकाउंट आएँगे।', parentSub: 'अभिभावक', parentDashboard: 'मेरा बच्चा', tInvalidParent: 'प्रवेश संख्या या PIN गलत है।', tParentScope: 'आप केवल अपने बच्चे की प्रोफ़ाइल देख सकते हैं।', parentAccess: 'अभिभावक पहुँच', parentPinNow: 'वर्तमान अभिभावक PIN', parentPinNone: 'कोई PIN नहीं है — इस छात्र के लिए अभिभावक लॉगिन उपलब्ध नहीं है।', parentPinNew: 'नया PIN (4–6 अंक)', parentPinSetBtn: 'PIN सेट करें', parentPinClear: 'PIN हटाएँ', tPinLen: 'PIN 4–6 अंकों का होना चाहिए।', tPinSet: 'अभिभावक PIN सेट हो गया।', tPinCleared: 'अभिभावक PIN हटा दिया गया।', tPinAuto: 'डिफ़ॉल्ट PIN अभिभावक के मोबाइल के आखिरी 4 अंक होते हैं।', admissions: 'प्रवेश आवेदन', admReqTitle: 'प्रवेश आवेदन', admReqApply: 'प्रवेश के लिए आवेदन करें', admReqFormTitle: 'प्रवेश हेतु आवेदन', admReqSchool: 'स्कूल', admReqNoSchool: 'इस डिवाइस पर अभी कोई स्कूल अकाउंट नहीं है — स्कूल के साइन अप के बाद ही आवेदन खुलेंगे।', admReqClassApply: 'किस कक्षा के लिए आवेदन', admReqSubmitted: 'आवेदन मिल गया। स्कूल इसकी समीक्षा करके आपसे संपर्क करेगा।', admReqApprove: 'स्वीकृत करें', admReqReject: 'अस्वीकृत करें', admReqView: 'देखें', admReqReason: 'कारण (वैकल्पिक)', admReqApproved: 'प्रवेश आवेदन स्वीकृत हुआ।', admReqRejected: 'प्रवेश आवेदन अस्वीकृत हुआ।', admReqPrefilled: 'प्रवेश आवेदन से भरा गया है — सहेजने से पहले विवरण जाँच लें।', admReqStatus: 'स्थिति', admReqSubmittedOn: 'जमा किया गया', admReqEmpty: 'अभी कोई प्रवेश आवेदन नहीं है।', admReqPending: 'लंबित', admReqApprovedSt: 'स्वीकृत', admReqRejectedSt: 'अस्वीकृत', admReqAll: 'सभी', tReqName: 'छात्र का नाम ज़रूरी है।', tReqClass: 'कृपया कक्षा चुनें।', tAdmReqFailed: 'उस स्कूल के लिए आवेदन सहेजा नहीं जा सका।', softDelMsg: 'इस छात्र को हटाएँ? रिकॉर्ड सहेजा रहेगा (सॉफ्ट डिलीट) — शुल्क, अंक, उपस्थिति और होमवर्क सहेजे रहेंगे।', tStudentRemoved: 'छात्र हटाया गया (रिकॉर्ड सहेजा रहा)।', tAdmReqInvalid: 'कृपया छात्र का नाम, 10 अंकों का मोबाइल और कक्षा भरें।',
    collectFeeBtn: 'शुल्क वसूलें', rcptTitle: 'शुल्क रसीद', rcptReceiptNo: 'रसीद संख्या', rcptDate: 'तारीख', rcptAdmNo: 'प्रवेश संख्या', rcptSession: 'सत्र', rcptName: 'नाम', rcptClass: 'कक्षा', rcptInstallment: 'किस्त', rcptCounter: 'काउंटर संख्या', rcptSlNo: 'क्र.सं.', rcptDesc: 'विवरण', rcptDue: 'देय', rcptCon: 'छूट', rcptPaid: 'जमा', rcptAdmissionFee: 'प्रवेश शुल्क', rcptTuitionFee: 'शिक्षण शुल्क', rcptCaution: 'जमानत राशि', rcptAnnual: 'वार्षिक शुल्क', rcptBusFee: 'बस शुल्क', rcptDues: 'बकाया', rcptPayModeTitle: 'भुगतान जानकारी', rcptPayMode: 'भुगतान माध्यम', rcptBank: 'बैंक', rcptNumber: 'संख्या', rcptTotal: 'कुल', rcptTotalWords: 'कुल (शब्दों में)', rcptComputerGen: 'यह कंप्यूटर द्वारा बनाई गई रसीद है। हस्ताक्षर की आवश्यकता नहीं है।', rcptParentCopy: 'अभिभावक प्रति', rcptCollectorSign: 'वसूलकर्ता के हस्ताक्षर', rcptIncludeBus: 'बस/परिवहन शामिल करें', rcptOtherFees: 'अन्य शुल्क', rcptAnnualHint: 'शुल्क वसूली रसीद पर दिखने वाली एकमुश्त और वार्षिक राशि। छिपाने के लिए 0 रखें।', payModeCash: 'नकद', payModeCheque: 'चेक', payModeUpi: 'UPI', payModeCard: 'कार्ड', payModeBank: 'बैंक ट्रांसफर', tFeeCollected: 'शुल्क वसूल लिया गया।', tCollectZero: 'वसूलने के लिए कुछ नहीं है — जमा राशि डालें।', tCollectSaved: 'शुल्क वसूल लिया गया — रसीद ', tCollectNotActive: 'यह छात्र सक्रिय नहीं है — शुल्क नहीं वसूला जा सकता।', rcptReceipts: 'रसीदें', rcptView: 'देखें', rcptPrint: 'प्रिंट / PDF सहेजें', rcptCollectAgain: 'फिर से वसूलें', rcptNoReceipts: 'इस छात्र की अभी कोई रसीद नहीं है।', rcptDraft: 'मसौदा — अभी सहेजा नहीं गया', rcptCollectSave: 'वसूलें और सहेजें', rcptNoLines: 'इस अवधि के लिए वसूलने को कुछ नहीं है — पहले शुल्क संरचना में राशि डालें।'
  }
};
function t(k) { return (I18N[state.lang] && I18N[state.lang][k]) || I18N.en[k] || k; }
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    var v = t(el.getAttribute('data-i18n'));
    if (v) el.textContent = v;
  });
  document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
    var v = t(el.getAttribute('data-i18n-html'));
    if (v) el.innerHTML = v;
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
  });
}
function setLang(l) {
  state.lang = l;
  $('langEn').classList.toggle('on', l === 'en');
  $('langHi').classList.toggle('on', l === 'hi');
  var lo = $('langOne'); if (lo) lo.textContent = l === 'en' ? 'EN' : 'हिं';
  applyI18n();
  if (state.role) renderApp();
}
function toggleLang() { setLang(state.lang === 'en' ? 'hi' : 'en'); }

/* ================= auth & shell ================= */
function showView(which) {
  hideTip();
  ['login', 'app'].forEach(function (id) { $(id).classList.toggle('hidden', id !== which); });
  window.scrollTo(0, 0);
}
function showLogin() { showView('login'); try { $('sbStatus').textContent = sbStatusText(); } catch (e) {} $('loginId').focus(); }
function persistSession() {
  // The session lives in localStorage so it survives closing and reopening
  // the app (sessionStorage died with the tab/PWA, forcing a fresh login).
  try {
    if (state.role && state.user) localStorage.setItem(SESSION_KEY, JSON.stringify({ role: state.role, email: state.user.email, view: state.view }));
    else localStorage.removeItem(SESSION_KEY);
  } catch (e) { /* private mode — session just won't survive */ }
}
function loginAs(a, opts) {
  state.role = a.role; state.user = a; state.view = 'dashboard';
  DB_KEY = dbKeyFor(a);
  db = loadDB(a.role === 'school' ? a : null);
  showView('app'); renderApp();
  persistSession();
  lastBackAt = 0; histExiting = false;
  histArmGuard(); // fresh history for this account: [dashboard, guard] — back from the dashboard warns first, it never re-enters another account
  if (!opts || !opts.silent) toast(t('tLoggedIn') + ' ' + a.name);
}
function restoreSession() {
  try {
    var raw = null;
    try { raw = localStorage.getItem(SESSION_KEY); } catch (e) {}
    if (!raw) {
      // One-time migration: an older build kept the session in
      // sessionStorage. Adopt it once so nobody is logged out by the update.
      try {
        var old = sessionStorage.getItem(SESSION_KEY);
        if (old) {
          raw = old;
          try { localStorage.setItem(SESSION_KEY, old); } catch (e2) {}
          try { sessionStorage.removeItem(SESSION_KEY); } catch (e3) {}
        }
      } catch (e4) {}
    }
    if (!raw) return false;
    var sv = JSON.parse(raw);
    if (sv.role === 'parent' && typeof sv.email === 'string' && sv.email.indexOf('parent:') === 0) {
      // Parent accounts are not in schoolSaathiAccounts: restore by looking
      // the student up on this device. A cleared PIN invalidates the session.
      var pf = findStudentById(sv.email.slice(7));
      if (pf && pf.student.parentPin) {
        DB_KEY = pf.dbKey;
        state.parentStudentId = pf.student.id;
        loginAs({ role: 'parent', name: pf.student.name, sub: t('parentSub') + ' • ' + pf.student.name, email: 'parent:' + pf.student.id, uid: 'parent-' + pf.student.id, studentId: pf.student.id }, { silent: true });
        state.view = 'dashboard';
        renderApp();
        return true;
      }
      return false;
    }
    var a = findAccount(sv.email);
    if (!a || a.role !== sv.role) return false;
    loginAs(a, { silent: true });
    var ss = sbLoadSession();
    if (ss && ss.user_id && (!ss.email || ss.email === sv.email)) state.sb = { uid: ss.user_id, email: ss.email || sv.email, isSuper: sv.role === 'super' };
    state.view = (NAV[a.role] || []).some(function (n) { return n[0] === sv.view; }) ? sv.view : 'dashboard';
    if (state.view !== 'dashboard') histReplaceTop({ view: state.view }); // drop the guard: the restored view sits on top
    renderApp();
    persistSession(); // re-persist AFTER applying the view — the stored view must match what the user sees
    return true;
  } catch (e) { return false; }
}
function switchAuth(tab) {
  var tabs = { login: ['tabLogin', 'loginForm', 'loginErr', 'loginId'], signup: ['tabSignup', 'signupForm', 'signupErr', 'suSchool'], parent: ['tabParent', 'parentForm', 'parentErr', 'parentAdmNo'] };
  Object.keys(tabs).forEach(function (k) {
    var ids = tabs[k];
    $(ids[0]).classList.toggle('on', tab === k);
    $(ids[1]).classList.toggle('hidden', tab !== k);
    $(ids[2]).classList.add('hidden');
  });
  $('recoverForm').classList.add('hidden');
  $('resetForm').classList.add('hidden');
  setTimeout(function () { $(tabs[tab][3]).focus(); }, 50);
}
function doParentLogin(e) {
  e.preventDefault();
  var adm = $('parentAdmNo').value.trim();
  var pin = $('parentPin').value.trim();
  var err = $('parentErr');
  var found = findStudentByAdmNo(adm);
  // One generic error: never reveal whether the number or the PIN was wrong.
  var ok = found && found.student.parentPin && digitsOnly(pin).length >= 4 && digitsOnly(pin) === digitsOnly(found.student.parentPin);
  if (!found || !ok) {
    err.textContent = t('tInvalidParent');
    err.classList.remove('hidden');
    return false;
  }
  DB_KEY = found.dbKey;
  var acct = { role: 'parent', name: found.student.name, sub: t('parentSub') + ' • ' + found.student.name, email: 'parent:' + found.student.id, uid: 'parent-' + found.student.id, studentId: found.student.id };
  state.parentStudentId = found.student.id;
  err.classList.add('hidden');
  loginAs(acct);
  return false;
}
function parentStudent() {
  if (state.role !== 'parent' || !state.parentStudentId) return null;
  return db.students.find(function (x) { return x.id === state.parentStudentId; }) || null;
}
function canViewStudent(id) {
  // Parents may open ONLY their own child's profile. Everyone else is
  // unrestricted here (their nav already limits which views exist).
  if (state.role === 'parent') return id === state.parentStudentId;
  return true;
}
function parentDashboard() {
  var s = parentStudent();
  if (!s) return '<div class="card"><div class="empty">' + t('tNoStudentData') + '</div></div>';
  state.profileStudent = s.id;
  return studentProfilePage(s.id);
}
function doLogin(e) {
  e.preventDefault();
  var id = $('loginId').value.trim().toLowerCase(), pw = $('loginPw').value;
  var err = $('loginErr');
  if (!id || !pw) {
    err.textContent = t('tInvalidCreds');
    err.classList.remove('hidden');
    return false;
  }
  if (sbIsOnline()) {
    // Server first when we can reach it; the device account is the fallback
    // (offline, or the server says the password is wrong there).
    // NOTE: this returns false synchronously — the promise chain runs in the
    // background. Never return the promise: onsubmit treats a truthy
    // return as "submit the form" and the page would reload.
    sbSignIn(id, pw).then(function (res) {
      if (res.ok && res.data && res.data.access_token) { sbFinishSupabaseLogin(res.data, id, pw); return; }
      sbLocalLogin(id, pw, err);
    }).catch(function () { sbLocalLogin(id, pw, err); });
  } else {
    sbLocalLogin(id, pw, err);
  }
  return false;
}
function doSignup(e) {
  e.preventDefault();
  var err = $('signupErr');
  var school = $('suSchool').value.trim(), name = $('suName').value.trim(),
      email = $('suEmail').value.trim().toLowerCase(), pw = $('suPw').value, pw2 = $('suPw2').value;
  function fail(msg) { err.textContent = msg; err.classList.remove('hidden'); return false; }
  if (!school || !name || !email || !pw || !pw2) return fail(t('tFillAll'));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(t('tInvalidEmail'));
  if (pw.length < 6) return fail(t('tPwShort'));
  if (pw !== pw2) return fail(t('tPwMismatch'));
  if (findAccount(email)) return fail(t('tEmailTaken'));
  var a = { uid: 'u' + Date.now().toString(36), name: name, school: school, email: email, pwHash: hashPw(pw), role: 'school', sub: 'School Admin • ' + school, created: new Date().toISOString().slice(0, 10), sbUid: null };
  var list = loadAccounts(); list.push(a); saveAccounts(list);
  err.classList.add('hidden');
  toast(t('tAccountCreated') + name);
  // Create the server account too, best-effort and in the background.
  // The local account above already works offline, so a server failure
  // (offline, rate-limited) never blocks signup.
  if (sbIsOnline()) {
    sbSignUp(email, pw, school, name).then(function (res) {
      if (res.status === 429) { toast(t('sbTooMany')); return; }
      if (!res.ok || !res.data || !res.data.user || !res.data.user.id) return;
      a.sbUid = res.data.user.id;
      var l2 = loadAccounts();
      for (var i = 0; i < l2.length; i++) if (l2[i].email === email) l2[i] = a;
      saveAccounts(l2);
      if (res.data.access_token) { sbStoreSession(res.data); state.sb = { uid: res.data.user.id, email: email, isSuper: false }; }
      else toast(t('sbEmailConfirm'));
    }).catch(function () { /* offline mid-flight — local account stands */ });
  }
  loginAs(a, { silent: true });
  return false;
}
function logout() {
  state.role = null; state.user = null; state.view = 'dashboard';
  state.feeStudent = null; state.feeSearch = ''; state.feeType = 'All'; state.feeFilter = 'All'; state.feeFormOpen = false; state.feePreselect = null;
  state.profileStudent = null; state.profileTab = 'overview'; state.stuPage = 1;
  state.parentStudentId = null; state.admReqFilter = 'All';
  promoState = null; importState.rows = null; importState.result = null;
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  // Sign out of the server too (best-effort) and drop the server session.
  try {
    var sbSess = sbLoadSession();
    if (sbSess && sbSess.access_token) sbSignOut(sbSess.access_token).catch(function () {});
  } catch (e2) {}
  sbClearSession();
  state.sb = null;
  lastBackAt = 0; histExiting = false;
  histReset('login'); // back after logout cannot re-enter the app
  $('loginId').value = ''; $('loginPw').value = '';
  $('parentAdmNo').value = ''; $('parentPin').value = '';
  $('page').innerHTML = '';
  showLogin();
  toast(t('tLoggedOut'));
}

var NAV = {
  super: [
    ['dashboard', '🏠', 'dashboard'], ['schools', '🏫', 'schools'], ['users', '👥', 'users'],
    ['subscriptions', '💳', 'subscriptions'], ['analytics', '📊', 'analytics'], ['settings', '⚙️', 'settings'],
    ['reports', '📄', 'reports'], ['help', '❓', 'help']
  ],
  school: [
    ['dashboard', '🏠', 'dashboard'], ['students', '🎒', 'students'], ['admissions', '📋', 'admissions'], ['attendance', '✅', 'attendance'],
    ['fees', '💰', 'fees'], ['exams', '📝', 'exams'], ['homework', '📚', 'homework'],
    ['notices', '📢', 'notices'], ['reports', '📄', 'reports'], ['activityLog', '📜', 'activityLog'], ['settings', '⚙️', 'settings']
  ],
  student: [
    ['dashboard', '🏠', 'dashboard'], ['homework', '📚', 'homework'], ['notices', '📢', 'notices']
  ],
  parent: [
    ['dashboard', '🏠', 'dashboard']
  ]
};
var VIEW_TITLES = {
  dashboard: ['Dashboard', 'Platform Overview & Management'],
  schools: ['Schools', 'All schools on the platform'], users: ['Users', 'Teachers, staff & students'],
  subscriptions: ['Subscriptions', 'Plans & billing status'], analytics: ['Analytics', 'Growth, attendance & fees'],
  settings: ['Settings', 'Platform / school settings'], reports: ['Reports', 'Download CSV reports'],
  activityLog: ['Activity Log', 'Full audit history'],
  help: ['Help & Support', 'Guides & contact'],
  students: ['Student Management', 'St. Xavier School, Patna'], admissions: ['Admission Requests', 'New applications & approvals'], attendance: ['Attendance', 'Mark & view attendance'],
  fees: ['Fees', 'Fee collection & pending dues'], exams: ['Examinations', 'Exams & marks entry'],
  homework: ['Homework', 'Assign & track homework'], notices: ['Notices', 'Notice board']
};
/* ================= in-app history (Android back button) =================
   Views are swapped in place, so without history entries the Android back
   button exits the PWA at once. Every screen — top-level views AND sub-views
   (student profile, fee profile, collect page, saved receipt, promotion) —
   gets its own entry, so Back walks back through the screens actually seen.
   Entries are full states {view, sub?, guard?}; dedupe compares the whole
   state, never the view alone.
   Dashboard guard: after login the stack is [dashboard, guard]. Popping the
   guard only warns ("Press back again to exit") and re-pushes the guard; a
   second Back within 2s lets the press through, so the app exits. */
var lastBackAt = 0;
var histCur = null; // last known top history entry (full state), or null
var histExiting = false; // set while a programmatic exit-back is in flight
function histSupported() {
  try {
    return (typeof window !== 'undefined' && !!window.history && typeof window.history.pushState === 'function' && typeof window.history.replaceState === 'function');
  } catch (e) { return false; }
}
function histTopState() {
  try { if (window.history && window.history.state) return window.history.state; } catch (e) {}
  return histCur;
}
function histSameState(a, b) {
  if (!a || !b) return a === b;
  return a.view === b.view && (a.sub || null) === (b.sub || null) && !!a.guard === !!b.guard;
}
function histPush(st) {
  try {
    if (!histSupported()) return;
    var cur = histTopState();
    if (cur && cur.guard) { // navigation consumes the dashboard guard: replace it
      window.history.replaceState(st, '');
      histCur = st;
      return;
    }
    if (histSameState(cur, st)) return; // never push duplicate consecutive entries
    if (cur && cur.sub && cur.view === st.view && !st.sub) { // a list replaces its own sub-view
      window.history.replaceState(st, '');
      histCur = st;
      return;
    }
    window.history.pushState(st, '');
    histCur = st;
  } catch (e) {}
}
function histReplaceTop(st) {
  try {
    if (!histSupported()) return;
    window.history.replaceState(st, '');
    histCur = st;
  } catch (e) {}
}
function histReset(view) {
  try {
    if (!histSupported()) return;
    var st = { view: view || 'dashboard' };
    window.history.replaceState(st, '');
    histCur = st;
  } catch (e) {}
}
function histArmGuard() {
  // Stack becomes [dashboard, guard]: Back from the dashboard warns first.
  try {
    if (!histSupported()) return;
    window.history.replaceState({ view: 'dashboard' }, '');
    window.history.pushState({ view: 'dashboard', guard: 1 }, '');
    histCur = { view: 'dashboard', guard: 1 };
  } catch (e) {}
}
function histPushGuard() {
  try {
    if (!histSupported()) return;
    var st = { view: 'dashboard', guard: 1 };
    window.history.pushState(st, '');
    histCur = st;
  } catch (e) {}
}
function histExitBack() {
  // Second Back within 2s: let the press exit the app for real.
  histExiting = true;
  try { window.history.back(); } catch (e) {}
  setTimeout(function () { histExiting = false; }, 1000);
}
function clearHistSubState() {
  state.feeStudent = null; state.collectStudent = null; state.collectRecordId = null; state.savedReceiptId = null; collectDraft = null;
  state.profileStudent = null; promoState = null;
  state.feeFormOpen = false; state.feePreselect = null;
}
function applyHistState(v, sub) {
  // Restore a view (and optional sub-view) reached via Back/Forward.
  state.view = v;
  clearHistSubState();
  toggleSidebar(false);
  if (sub) {
    var parts = String(sub).split(':');
    if (parts[0] === 'profile') {
      if (v === 'fees') state.feeStudent = parts[1];
      else if (v === 'students') { state.profileStudent = parts[1]; state.profileTab = 'overview'; }
    } else if (parts[0] === 'collect' && v === 'fees') {
      var cs = db.students.find(function (x) { return x.id === parts[1]; });
      if (cs) { state.collectStudent = parts[1]; state.collectRecordId = parts[2] || null; state.feeStudent = parts[1]; collectDraft = newCollectDraft(parts[1], state.collectRecordId); }
    } else if (parts[0] === 'receipt' && v === 'fees') {
      var rc = (db.receipts || []).find(function (r) { return r.receiptNo === parts[1]; });
      if (rc) { state.collectStudent = rc.studentId; state.savedReceiptId = rc.receiptNo; state.feeStudent = rc.studentId; }
    } else if (parts[0] === 'promo' && v === 'students') {
      openPromotion(parts[1] || null, { noHist: true });
      persistSession();
      return;
    }
  }
  persistSession();
  renderApp();
}
function onPopState(ev) {
  if (!state.role || !state.user) return; // logged out: back cannot re-enter
  if (histExiting) return; // programmatic exit-back already in flight
  var prev = histCur;
  var st = ev && ev.state;
  histCur = st || null;
  var v = st && st.view;
  var sub = st && st.sub;
  if (prev && prev.guard) {
    // The guard entry was popped: a Back press while on the dashboard.
    if (state.view !== 'dashboard') { state.view = 'dashboard'; clearHistSubState(); persistSession(); toggleSidebar(false); renderApp(); }
    var now = Date.now();
    if (now - lastBackAt < 2000) { lastBackAt = 0; histExitBack(); return; } // second press: exit
    lastBackAt = now;
    toast(t('tBackExit'));
    histPushGuard(); // guard back on top, so the next press can exit
    return;
  }
  if (st && st.guard) {
    // Landed ON the guard entry (popped a view above it): we are on the dashboard.
    applyHistState('dashboard', null);
    return;
  }
  if (!v) {
    // Popped past the root entry.
    if (state.view !== 'dashboard') { applyHistState('dashboard', null); histArmGuard(); return; }
    var now2 = Date.now();
    if (now2 - lastBackAt < 2000) { lastBackAt = 0; histExitBack(); return; }
    lastBackAt = now2;
    toast(t('tBackExit'));
    histArmGuard();
    return;
  }
  var nav = NAV[state.role] || [];
  if (!nav.some(function (n) { return n[0] === v; })) { v = 'dashboard'; sub = null; }
  applyHistState(v, sub);
}
function histBack() {
  // In-page "← back" button: follow the history entry if this screen has
  // one, so Android Back and the on-screen back never disagree afterwards.
  // Returns true when a history back was triggered.
  if (histSupported() && histCur && histCur.sub) {
    try { window.history.back(); return true; } catch (e) {}
  }
  return false;
}
function backFromProfile() { if (histBack()) return; state.profileStudent = null; renderPage(); }
function backFromFeeProfile() { if (histBack()) return; state.feeStudent = null; renderPage(); }
function backFromReceipt() { if (histBack()) return; state.savedReceiptId = null; state.collectStudent = null; renderPage(); }
function go(view) {
  var nav = NAV[state.role] || [];
  var ok = nav.some(function (n) { return n[0] === view; });
  state.view = ok ? view : 'dashboard';
  if (state.view !== 'fees') { state.feeStudent = null; state.collectStudent = null; state.collectRecordId = null; state.savedReceiptId = null; collectDraft = null; }
  state.profileStudent = null;
  promoState = null; importState.rows = null; importState.result = null;
  persistSession();
  toggleSidebar(false);
  renderApp();
  histPush({ view: state.view });
}
function toggleSidebar(open) {
  var sb = $('sidebar'), sc = $('scrim');
  if (open === undefined) open = !sb.classList.contains('open');
  sb.classList.toggle('open', open);
  sc.classList.toggle('hidden', !open);
}
function renderApp() {
  var nav = NAV[state.role] || [];
  $('sideNav').innerHTML = nav.map(function (n) {
    return '<button class="' + (state.view === n[0] ? 'active' : '') + '" onclick="go(\'' + n[0] + '\')"><span class="ic">' + n[1] + '</span>' + esc(t(n[2])) + '</button>';
  }).join('');
  var u = state.user;
  var me = state.role === 'student' ? meStudent() : (state.role === 'parent' ? parentStudent() : null);
  var whoPhoto = me ? me.photo : null;
  var wa = $('whoAvatar');
  if (whoPhoto) { wa.innerHTML = '<img src="' + esc(whoPhoto) + '" alt="">'; wa.classList.add('has-photo'); }
  else { wa.textContent = initialsOf(u.name); wa.classList.remove('has-photo'); }
  $('whoName').textContent = u.name;
  $('whoRole').textContent = u.sub;
  var prof = db.profile;
  var bc = $('sideBrandCap');
  if (bc) bc.innerHTML = (state.role !== 'super' && prof.logo) ? '<img class="side-logo" src="' + esc(prof.logo) + '" alt="">' : '🎓';
  $('sideSchoolInfo').innerHTML = state.role === 'super'
    ? '<b style="color:#fff">School Saathi</b><br>Platform Admin'
    : '<b style="color:#fff">' + esc(prof.name) + '</b><br>' + esc(prof.city) + ', Bihar';
  var sess = $('sessionSel');
  if (!sess.options.length) {
    ['2025–26', '2024–25', '2026–27'].forEach(function (s) {
      var o = document.createElement('option'); o.value = s; o.textContent = s; sess.appendChild(o);
    });
  }
  sess.value = prof.session;
  sess.disabled = (state.role === 'parent');
  var vt = VIEW_TITLES[state.view] || ['Dashboard', ''];
  $('topTitle').textContent = t(state.view) === state.view ? vt[0] : t(state.view);
  if (state.view === 'dashboard') $('topTitle').textContent = t('dashboard');
  $('topCrumb').textContent = state.role === 'super' ? t('superDashboard') : (state.role === 'school' ? prof.name + ', ' + prof.city : (state.role === 'parent' ? t('parentDashboard') : t('studentDashboard')));
  renderPage();
}
function changeSession(v) {
  if (state.role !== 'school') return;
  db.profile.session = v; saveDB(db);
  toast(t('tSessionChanged') + ' ' + v);
}
function renderPage() {
  var p = $('page');
  hideTip();
  var pages = state.role === 'super' ? PAGE_SUPER : state.role === 'school' ? PAGE_SCHOOL : state.role === 'parent' ? PAGE_PARENT : PAGE_STUDENT;
  var fn = pages[state.view] || pages.dashboard;
  p.innerHTML = fn();
  if (state.view === 'fees' && !state.feeStudent && state.feeSearch) filterFees(state.feeSearch);
  animateDonuts(p); animateBars(p);
}

function hideTip() { var tip = $('chartTip'); if (tip) { tip.style.opacity = '0'; tip.textContent = ''; } }
/* ================= chart tooltip (mouse + touch) ================= */
document.addEventListener('pointerover', function (e) {
  var el = e.target.closest ? e.target.closest('[data-tip]') : null;
  var tip = $('chartTip');
  if (!el) { tip.style.opacity = '0'; return; }
  tip.textContent = el.getAttribute('data-tip');
  tip.style.opacity = '1';
});
document.addEventListener('pointermove', function (e) {
  var tip = $('chartTip');
  if (tip.style.opacity === '1') {
    tip.style.left = Math.min(window.innerWidth - 190, e.clientX + 12) + 'px';
    tip.style.top = (e.clientY + 14) + 'px';
  }
});
document.addEventListener('pointerout', function (e) {
  if (e.target.closest && e.target.closest('[data-tip]')) $('chartTip').style.opacity = '0';
});

/* ================= SUPER ADMIN pages ================= */
function statCard(ic, cls, label, value, chg, chgCls, countOpts) {
  var co = countOpts || {};
  // v26: every stat card renders its final value as plain text — no
  // count-up animation anywhere. A count-up card shows intermediate
  // values while it animates, so a read taken mid-animation disagrees
  // with the same figure elsewhere (the Student Management Average
  // Attendance card read 74% on its way to 100%; the profile Overview
  // tile had the same fault and went static in v25). A settled value
  // is shown from the first paint, so every read agrees.
  var v = (typeof value === 'number') ? value.toLocaleString('en-IN') : value;
  var valHtml = '<div class="val">' + (co.prefix || '') + v + (co.suffix || '') + '</div>';
  return '<div class="stat"><div class="ic ' + cls + '">' + ic + '</div><div><div class="lbl">' + esc(label) + '</div>' + valHtml +
    (chg ? '<div class="chg ' + chgCls + '">' + chg + '</div>' : '') + '</div></div>';
}
function superDashboard() {
  var sc = schoolCounts(), subs = subCounts();
  var TOP5_NAMES = ['St. Xavier School', 'DAV Public School', 'Bright Future School', 'Holy Child School', 'Sunrise Academy'];
  var top5 = TOP5_NAMES.map(function (n) { var f = db.schools.filter(function (sc) { return sc.name === n; }); return f.length ? f[0] : null; }).filter(function (sc) { return sc; });
  if (top5.length < 5) top5 = db.schools.slice().sort(function (a, b) { return b.students - a.students; }).slice(0, 5);
  var rows = top5.map(function (s, i) {
    return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(s.name) + '</b></td><td>' + esc(s.city) + '</td><td>' + num(s.students) + '</td><td><span class="badge ' + (s.status === 'active' ? 'green' : 'orange') + '">' + (s.status === 'active' ? 'Active' : 'Pending') + '</span></td></tr>';
  }).join('');
  return '' +
  '<div class="page-head"><div><h2>' + t('superDashboard') + '</h2><p>' + t('subSuperDash') + '</p></div>' +
  '<div class="toolbar"><button class="btn sm" onclick="go(\'schools\')">+ ' + t('addSchool') + '</button></div></div>' +
  '<div class="stats">' +
    statCard('🏫', 'blue', t('totalSchools'), sc.total, '', 'up') +
    statCard('👥', 'green', t('totalUsers'), totalPlatformUsers(), '', 'up') +
    statCard('✅', 'green', t('activeSchools'), sc.active, '', 'up') +
    statCard('⏰', 'orange', t('pendingApproval'), sc.pending, '', 'down') +
  '</div>' +
  '<div class="grid2"><div class="card"><div class="head-row"><div><h3>' + t('platformTotals') + '</h3><p class="card-sub">' + t('platformTotalsSub') + '</p></div></div><div class="legend">' +
  '<div class="row"><span class="dot" style="background:' + BLUE + '"></span>' + t('totalSchools') + '<b>' + num(sc.total) + '</b></div>' +
  '<div class="row"><span class="dot" style="background:' + GREEN + '"></span>' + t('totalStudents') + '<b>' + num(totalPlatformStudents()) + '</b></div>' +
  '<div class="row"><span class="dot" style="background:' + ORANGE + '"></span>' + t('totalUsers') + '<b>' + num(totalPlatformUsers()) + '</b></div>' +
  '<div class="row"><span class="dot" style="background:' + GREEN + '"></span>' + t('subActive') + '<b>' + subs.Active + '</b></div>' +
  '<div class="row"><span class="dot" style="background:' + ORANGE + '"></span>' + t('subTrial') + '<b>' + subs.Trial + '</b></div>' +
  '<div class="row"><span class="dot" style="background:' + RED + '"></span>' + t('subExpired') + '<b>' + subs.Expired + '</b></div></div></div>' +
  '<div class="card"><h3>' + t('subsStatus') + '</h3><p class="card-sub">' + t('subsSub') + '</p><div class="donut-wrap">' +
    donutSVG([{ value: subs.Active, color: GREEN, label: t('subActive'), pct: donutPct(subs.Active, sc.total) }, { value: subs.Expired, color: RED, label: t('subExpired'), pct: donutPct(subs.Expired, sc.total) }, { value: subs.Trial, color: ORANGE, label: t('subTrial'), pct: donutPct(subs.Trial, sc.total) }], 190, donutPct(subs.Active, sc.total) + '%', t('subActive')) +
    '<div class="legend"><div class="row"><span class="dot" style="background:' + GREEN + '"></span>' + t('subActive') + '<b>' + subs.Active + '</b></div>' +
    '<div class="row"><span class="dot" style="background:' + RED + '"></span>' + t('subExpired') + '<b>' + subs.Expired + '</b></div>' +
    '<div class="row"><span class="dot" style="background:' + ORANGE + '"></span>' + t('subTrial') + '<b>' + subs.Trial + '</b></div></div>' +
  '</div></div></div>' +
  '<div class="grid2"><div class="card"><div class="head-row"><div><h3>' + t('top5') + '</h3><p class="card-sub">' + t('byStrength') + '</p></div><a href="#" onclick="go(\'schools\');return false">' + t('viewAll') + '</a></div>' +
    '<div class="tbl-wrap"><table><thead><tr><th>#</th><th>' + t('thSchool') + '</th><th>' + t('thCity') + '</th><th>' + t('thStudents') + '</th><th>' + t('thStatus') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
  '<div class="card"><h3>' + t('quickActions') + '</h3><p class="card-sub">' + t('qaSub') + '</p><div class="qa-grid">' +
    '<div class="qa" onclick="go(\'schools\')"><div class="ic">🏫</div><b>' + t('qaAddSchool') + '</b><span>' + t('qaAddSchoolD') + '</span></div>' +
    '<div class="qa" onclick="go(\'users\')"><div class="ic">👥</div><b>' + t('qaManageUsers') + '</b><span>' + t('qaManageUsersD') + '</span></div>' +
    '<div class="qa" onclick="go(\'reports\')"><div class="ic">📊</div><b>' + t('qaViewReports') + '</b><span>' + t('qaViewReportsD') + '</span></div>' +
    '<div class="qa" onclick="go(\'settings\')"><div class="ic">⚙️</div><b>' + t('qaSysSettings') + '</b><span>' + t('qaSysSettingsD') + '</span></div>' +
  '</div></div></div>' +
  '<div style="margin-top:16px">' + supportRequestsCard(3) + '</div>';
}
function superSchools() {
  var rows = db.schools.map(function (s) {
    return '<tr><td><b>' + esc(s.name) + '</b></td><td>' + esc(s.city) + '</td><td>' + num(s.students) + '</td><td>' + num(s.users) + '</td>' +
      '<td><span class="badge ' + (s.plan === 'Active' ? 'green' : s.plan === 'Trial' ? 'orange' : 'red') + '">' + s.plan + '</span></td>' +
      '<td><span class="badge ' + (s.status === 'active' ? 'green' : 'orange') + '">' + (s.status === 'active' ? 'Active' : 'Pending') + '</span></td>' +
      '<td><div class="row-actions">' + (s.status === 'pending'
        ? '<button class="btn green sm" onclick="approveSchool(\'' + s.id + '\')">' + t('approve') + '</button>'
        : '<button class="btn ghost sm" onclick="removeSchool(\'' + s.id + '\')">' + t('remove') + '</button>') + '</div></td></tr>';
  }).join('');
  return '<div class="page-head"><div><h2>' + t('schools') + '</h2><p>' + db.schools.length + ' ' + t('schoolsOnPlatform') + ' — ' + schoolCounts().pending + ' ' + t('pendingApprovalL') + '</p></div>' +
    '<div class="toolbar"><input id="schSearch" placeholder="' + t('searchSchool') + '" oninput="filterSchools(this.value)" style="min-width:220px"><button class="btn" onclick="schoolForm()">+ ' + t('addSchool') + '</button></div></div>' +
    '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('thSchool') + '</th><th>' + t('thCity') + '</th><th>' + t('thStudents') + '</th><th>' + t('thUsers') + '</th><th>' + t('thPlan') + '</th><th>' + t('thStatus') + '</th><th>' + t('thAction') + '</th></tr></thead><tbody id="schBody">' + rows + '<tr id="schNoMatch" style="display:none"><td colspan="7"><div class="empty">' + t('tNoSchoolsMatch') + '</div></td></tr></tbody></table></div></div>';
}
function filterSchools(q) {
  q = q.toLowerCase();
  var visible = 0;
  document.querySelectorAll('#schBody tr').forEach(function (tr) {
    if (tr.id === 'schNoMatch') return;
    var show = tr.textContent.toLowerCase().indexOf(q) !== -1;
    tr.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  var nm = document.getElementById('schNoMatch');
  if (nm) nm.style.display = visible ? 'none' : '';
}
function schoolForm() {
  openModal('<h3>' + t('addSchool') + '</h3><form onsubmit="return saveSchool(event)"><div class="form-grid">' +
    '<div><label>' + t('fSchoolName') + '</label><input id="fSchName" required placeholder="e.g. Sunrise Public School"></div>' +
    '<div><label>' + t('fCity') + '</label><input id="fSchCity" required placeholder="e.g. Gopalganj"></div>' +
    '<div><label>' + t('fStudents') + '</label><input id="fSchStu" type="number" min="1" value="300" required></div>' +
    '<div><label>' + t('fPlan') + '</label><select id="fSchPlan"><option>Active</option><option>Trial</option><option>Expired</option></select></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button><button class="btn" type="submit">' + t('saveSchoolBtn') + '</button></div></form>');
}
function saveSchool(e) {
  e.preventDefault();
  var name = $('fSchName').value.trim();
  var n = parseInt($('fSchStu').value, 10);
  if (db.schools.some(function (x) { return x.name.toLowerCase() === name.toLowerCase(); })) { toast(name + ' ' + t('tDupSchool')); return false; }
  if (!n || n < 1 || n > 100000) { toast(t('tStudentsRange')); return false; }
  db.schools.push({ id: 'sch' + Date.now(), name: name, city: $('fSchCity').value.trim(),
    students: n, status: 'pending', plan: $('fSchPlan').value, users: 0, since: todayIST() });
  saveDB(db); closeModal(); renderApp();
  toast(t('tSchoolAdded'));
  return false;
}
function approveSchool(id) {
  var s = db.schools.find(function (x) { return x.id === id; });
  if (!s) return;
  s.status = 'active'; saveDB(db); renderApp();
  toast('✓ ' + s.name + ' ' + t('tApproved') + ' ' + schoolCounts().pending);
}
function removeSchool(id) {
  var s = db.schools.find(function (x) { return x.id === id; });
  if (!s) return;
  confirmModal('Remove ' + s.name + ' from the platform?', function () {
    db.schools = db.schools.filter(function (x) { return x.id !== id; });
    saveDB(db); renderApp();
    toast(t('tSchoolRemoved'));
  });
}
/* v26: the old Users page listed 10 hard-coded people and four fake
   totals (12,450 users / 48 admins / 1,240 teachers / 11,162 students)
   with no data behind them. The super-admin store holds no per-person
   user records, so the page now shows the only honest user figures
   that exist: live per-school student and user counts from db.schools.
   Admin/teacher/student splits do not exist in the store, so those
   cards are gone rather than guessed. */
function superUsers() {
  var rows = db.schools.map(function (s) {
    return '<tr><td><b>' + esc(s.name) + '</b></td><td>' + esc(s.city) + '</td><td>' + num(s.students) + '</td><td>' + num(s.users || 0) + '</td>' +
      '<td><span class="badge ' + (s.plan === 'Active' ? 'green' : s.plan === 'Trial' ? 'orange' : 'red') + '">' + s.plan + '</span></td>' +
      '<td><span class="badge ' + (s.status === 'active' ? 'green' : 'orange') + '">' + (s.status === 'active' ? 'Active' : 'Pending') + '</span></td></tr>';
  }).join('');
  return '<div class="page-head"><div><h2>' + t('users') + '</h2><p>' + db.schools.length + ' ' + t('schools') + ' • ' + num(totalPlatformStudents()) + ' ' + t('studentsW') + ' • ' + num(totalPlatformUsers()) + ' ' + t('totalUsers') + '</p></div></div>' +
    '<div class="stats">' +
    statCard('🏫', 'blue', t('totalSchools'), db.schools.length, '', 'up') +
    statCard('🎒', 'green', t('totalStudents'), totalPlatformStudents(), '', 'up') +
    statCard('👥', 'blue', t('totalUsers'), totalPlatformUsers(), '', 'up') +
    '</div><div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('thSchool') + '</th><th>' + t('thCity') + '</th><th>' + t('thStudents') + '</th><th>' + t('thUsers') + '</th><th>' + t('thPlan') + '</th><th>' + t('thStatus') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}
function superSubscriptions() {
  var subs = subCounts(), tot = db.schools.length;
  var rows = db.schools.map(function (s) {
    return '<tr><td><b>' + esc(s.name) + '</b></td><td>' + esc(s.city) + '</td><td><span class="badge ' + (s.plan === 'Active' ? 'green' : s.plan === 'Trial' ? 'orange' : 'red') + '">' + s.plan + '</span></td><td>' + esc(s.since) + '</td></tr>';
  }).join('');
  return '<div class="page-head"><div><h2>' + t('subscriptions') + '</h2><p>' + subs.Active + ' Active • ' + subs.Expired + ' Expired • ' + subs.Trial + ' Trial — ' + donutPct(subs.Active, db.schools.length) + '% active</p></div></div>' +
    '<div class="grid2e"><div class="card"><h3>' + t('subsStatus') + '</h3><p class="card-sub">' + t('subsSub') + '</p><div class="donut-wrap">' +
    donutSVG([{ value: subs.Active, color: GREEN, label: t('subActive'), pct: donutPct(subs.Active, tot) }, { value: subs.Expired, color: RED, label: t('subExpired'), pct: donutPct(subs.Expired, tot) }, { value: subs.Trial, color: ORANGE, label: t('subTrial'), pct: donutPct(subs.Trial, tot) }], 190, donutPct(subs.Active, tot) + '%', t('subActive')) +
    '<div class="legend"><div class="row"><span class="dot" style="background:' + GREEN + '"></span>' + t('subActive') + '<b>' + subs.Active + '</b></div>' +
    '<div class="row"><span class="dot" style="background:' + RED + '"></span>' + t('subExpired') + '<b>' + subs.Expired + '</b></div>' +
    '<div class="row"><span class="dot" style="background:' + ORANGE + '"></span>' + t('subTrial') + '<b>' + subs.Trial + '</b></div></div>' +
    '</div></div>' +
    '<div class="card"><h3>' + t('plansH') + '</h3><p class="card-sub">' + t('plansSub') + '</p><div class="act-list">' +
    '<div class="act"><div class="ic green" style="background:var(--green-soft)">✓</div><div><b>' + t('planBasicT') + '</b><span>' + t('planBasicD') + '</span></div></div>' +
    '<div class="act"><div class="ic" style="background:var(--blue-soft)">★</div><div><b>' + t('planStdT') + '</b><span>' + t('planStdD') + '</span></div></div>' +
    '<div class="act"><div class="ic orange" style="background:var(--orange-soft)">◆</div><div><b>' + t('planPremT') + '</b><span>' + t('planPremD') + '</span></div></div>' +
    '</div><p class="muted" style="margin-top:14px">' + t('setupLine') + '</p></div></div>' +
    '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('thSchool') + '</th><th>' + t('thCity') + '</th><th>' + t('thPlan') + '</th><th>' + t('thSince') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}
function superAnalytics() {
  var ft = feeTotals(), ta = todayAtt();
  return '<div class="page-head"><div><h2>' + t('analytics') + '</h2><p>' + t('subAnalyticsFull') + '</p></div></div>' +
  '<div class="stats">' +
    statCard('🏫', 'blue', t('totalSchools'), schoolCounts().total, '', 'up') +
    statCard('👥', 'green', t('totalUsers'), totalPlatformUsers(), '', 'up') +
    statCard('💰', 'orange', t('feeCollected'), ft.collected, '', 'up', { prefix: '₹' }) +
    statCard('⏰', 'red', t('pendingFee'), ft.pending, '', 'down', { prefix: '₹' }) +
  '</div>' +
  '<div class="grid2"><div class="card"><h3>' + t('feeTrend') + '</h3><p class="card-sub">' + esc(db.profile.name) + ' — ' + feeRangeLabel() + ' (' + t('collectedW') + ' / ' + t('pendingW') + ')</p><div class="chart-box">' + barChartSVG(feeChartData()) + '</div><p class="muted" style="margin-top:8px"><span style="color:' + BLUE + '">■</span> ' + t('collectedW') + ' &nbsp; <span style="color:' + ORANGE + '">■</span> ' + t('pendingW') + '</p></div></div>' +
  '<div class="card"><h3>' + t('todayAtt') + ' — ' + esc(db.profile.name) + '</h3><p class="card-sub">' + num(ta.total) + ' students • ' + donutPct(ta.present, ta.total) + '% present</p><div class="donut-wrap">' +
    donutSVG([{ value: ta.present, color: GREEN, label: t('presBtn'), pct: donutPct(ta.present, ta.total) }, { value: ta.absent, color: RED, label: t('absBtn'), pct: donutPct(ta.absent, ta.total) }, { value: ta.late, color: ORANGE, label: t('lateBtn'), pct: donutPct(ta.late, ta.total) }], 190, donutPct(ta.present, ta.total) + '%', t('todayAtt')) +
    '<div class="legend"><div class="row"><span class="dot" style="background:' + GREEN + '"></span>' + t('presBtn') + '<b>' + num(ta.present) + '</b></div>' +
    '<div class="row"><span class="dot" style="background:' + RED + '"></span>' + t('absBtn') + '<b>' + num(ta.absent) + '</b></div>' +
    '<div class="row"><span class="dot" style="background:' + ORANGE + '"></span>' + t('lateBtn') + '<b>' + num(ta.late) + '</b></div></div>' +
  '</div></div>';
}
/* ================= Super Admin platform settings (v24) =================
   The settings on this page used to be read-only text under a button
   that only showed a toast — nothing was ever saved. They now live in
   localStorage (key schoolSaathiPlatformSettings) so they survive
   reloads: Save writes them and re-renders the page with the new
   values. The version label shows the real build version. */
function platformSettings() {
  try { var v = JSON.parse(localStorage.getItem('schoolSaathiPlatformSettings') || 'null'); return v && typeof v === 'object' ? v : {}; }
  catch (e) { return {}; }
}
function savePlatformSettings(e) {
  if (e) e.preventDefault();
  var v = {
    name: ($('fPlName').value || '').trim() || 'School Saathi',
    tagline: ($('fPlTagline').value || '').trim() || 'Smart Education. Better Tomorrow.',
    session: ($('fPlSession').value || '').trim() || db.profile.session,
    supportEmail: ($('fPlEmail').value || '').trim() || 'support@school-saathi.in'
  };
  localStorage.setItem('schoolSaathiPlatformSettings', JSON.stringify(v));
  renderApp();
  toast('✓ ' + t('tSettingsSaved'));
  return false;
}
function superSettings() {
  var ps = platformSettings();
  var pName = ps.name || 'School Saathi', pTag = ps.tagline || 'Smart Education. Better Tomorrow.',
      pSess = ps.session || db.profile.session, pEmail = ps.supportEmail || 'support@school-saathi.in';
  var sessOpts = ['2025–26', '2024–25', '2026–27'].map(function (s) { return '<option' + (pSess === s ? ' selected' : '') + '>' + s + '</option>'; }).join('');
  return '<div class="page-head"><div><h2>' + t('sysSettings') + '</h2><p>' + t('platformConfig') + '</p></div></div>' +
  '<div class="card" style="max-width:640px"><h3>' + t('platformH') + '</h3><p class="card-sub">' + esc(pName) + ' — v26</p>' +
  '<form onsubmit="return savePlatformSettings(event)"><div class="form-grid">' +
  '<div><label>' + t('supName') + '</label><input id="fPlName" value="' + esc(pName) + '"></div>' +
  '<div><label>' + t('supTagline') + '</label><input id="fPlTagline" value="' + esc(pTag) + '"></div>' +
  '<div><label>' + t('supSession') + '</label><select id="fPlSession">' + sessOpts + '</select></div>' +
  '<div><label>' + t('supEmail') + '</label><input id="fPlEmail" type="email" value="' + esc(pEmail) + '"></div>' +
  '<div class="full"><label>' + t('supStorage') + '</label><input value="' + esc(t('supStorageV')) + '" disabled></div>' +
  '</div><div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap"><button class="btn" type="submit">' + t('saveSettingsBtn') + '</button>' +
  '<button type="button" class="btn danger" onclick="resetAllData()">' + t('resetAllData') + '</button></div></form></div>';
}
function resetPwCheck(pw) {
  // Password gate for Reset All Data: the signed-in account's own password.
  if (!state.role || !state.user) return false;
  if (state.role === 'super') return pw === OWNER.pw;
  if (state.role === 'school') {
    var a = findAccount(state.user.email);
    return !!a && !!a.pwHash && hashPw(pw) === a.pwHash;
  }
  return false; // parent / student roles never reset
}
function resetAllData() {
  if (!state.role || !state.user || (state.role !== 'school' && state.role !== 'super')) return;
  openModal('<h3>' + t('resetPwTitle') + '</h3><p style="color:var(--muted);font-size:14px">' + t('resetPwHint') + '</p>' +
    '<form onsubmit="return submitResetPw(event)"><div class="form-grid"><div class="full"><label>' + t('resetPwLabel') + '</label>' +
    '<input id="resetPwInput" type="password" autocomplete="current-password" placeholder="••••••••"></div></div>' +
    '<div id="resetPwErr" class="err hidden"></div>' +
    '<div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button>' +
    '<button class="btn danger" type="submit">' + t('resetPwGo') + '</button></div></form>');
  setTimeout(function () { var el = $('resetPwInput'); if (el) el.focus(); }, 50);
}
function submitResetPw(e) {
  if (e) e.preventDefault();
  var pw = $('resetPwInput') ? $('resetPwInput').value : '';
  if (!resetPwCheck(pw)) {
    var err = $('resetPwErr');
    if (err) { err.textContent = t('resetPwWrong'); err.classList.remove('hidden'); }
    return false;
  }
  closeModal();
  confirmModal(t('resetConfirmMsg'), resetAllConfirmed);
  return false;
}
function resetAllConfirmed() {
  // v20: reset means a REAL reset — wipe EVERYTHING to zero. What survives:
  // the school profile (name/city/principal/phone/email/address/session/
  // logo — the school's identity and login are untouched) and the
  // fee-structure defaults (6th ₹800 … 10th ₹1500, which Generate needs).
  // For the Super Admin the platform network list (24 schools) survives
  // too — reset wipes the school's operational data, never the platform.
  // One-time fee amounts (Admission/Caution/Annual/Bus) go back to 0 and
  // must be re-entered in Fee Structure.
  var keepProfile = db.profile;
  var keepSchools = (state.role === 'super') ? db.schools : [];
  db = emptyDb(keepProfile, keepSchools);
  saveDB(db);
  state.view = 'dashboard';
  state.feeStudent = null; state.feeSearch = ''; state.feeType = 'All'; state.feeFilter = 'All'; state.feeFormOpen = false; state.feePreselect = null;
  state.profileStudent = null; state.profileTab = 'overview'; state.stuPage = 1;
  state.collectStudent = null; state.collectRecordId = null; state.savedReceiptId = null; collectDraft = null;
  state.parentStudentId = null; state.admReqFilter = 'All';
  promoState = null; importState.rows = null; importState.result = null;
  renderApp();
  persistSession();
  toast(t('tAllReset'));
}
function superReports() { return reportsPage('super'); }
function superHelp() {
  return '<div class="page-head"><div><h2>' + t('help') + '</h2><p>' + t('subHelp') + '</p></div></div>' +
  '<div class="grid2e"><div class="card"><h3>' + t('guidesH') + '</h3><p class="card-sub">' + t('guidesSub') + '</p><div class="act-list">' +
  '<div class="act"><div class="ic" style="background:var(--blue-soft)">🏫</div><div><b>' + t('guide1t') + '</b><span>' + t('guide1d') + '</span></div></div>' +
  '<div class="act"><div class="ic" style="background:var(--green-soft)">💰</div><div><b>' + t('guide2t') + '</b><span>' + t('guide2d') + '</span></div></div>' +
  '<div class="act"><div class="ic" style="background:var(--orange-soft)">✅</div><div><b>' + t('guide3t') + '</b><span>' + t('guide3d') + '</span></div></div>' +
  '</div></div>' +
  '<div class="card"><h3>' + t('contactH') + '</h3><p class="card-sub">' + t('contactSub') + '</p><div class="kv"><b>' + t('fEmail') + '</b><span>' + esc(platformSettings().supportEmail || 'support@school-saathi.in') + '</span><b>' + t('contactPhone') + '</b><span>+91 63047 97341</span><b>' + t('contactHours') + '</b><span>' + t('hoursV') + '</span></div>' +
  '<div style="margin-top:16px"><button class="btn" onclick="openSupportForm()">' + t('raiseSupport') + '</button></div></div></div>' +
  '<div class="card" style="margin-top:16px"><h3>' + t('recentSup') + '</h3>' + supportListRows(supportRequests()) + '</div>';
}
/* v25: "Raise Support" — the v24 build shipped only the write path.
   Root cause of the wipe report: there was NO seed data and NO read
   path at all — no list on the Help page, no card on the Super Admin
   dashboard — so a submitted request was invisible (it looked "not
   stored"), and nothing could ever show the demo requests again. The
   submit itself appended correctly; the feature was half-built. v25
   completes it: supportRequests() is the single read/write path — it
   seeds the 3 demo requests the first time the store is empty and
   returns newest-first; submitSupportRequest appends through it and
   re-renders so the new request shows at once. */
var SUPPORT_SEED = [
  { ts: '2026-11-07T10:00:00.000Z', name: 'St. Xavier School', message: 'Unable to Generate Report', status: 'Open', by: 'St. Xavier School' },
  { ts: '2026-11-08T11:30:00.000Z', name: 'DAV Public School', message: 'Fee Receipt Not Downloading', status: 'In Progress', by: 'DAV Public School' },
  { ts: '2026-11-09T08:15:00.000Z', name: 'Sunrise Academy', message: 'Login Issue Resolved', status: 'Resolved', by: 'Sunrise Academy' }
];
function supportRequests() {
  var list = null;
  try { list = JSON.parse(localStorage.getItem('schoolSaathiSupportRequests') || 'null'); } catch (e) { list = null; }
  if (!Array.isArray(list)) {
    // First use (or a corrupt store): seed the 3 demo requests.
    list = SUPPORT_SEED.slice();
    try { localStorage.setItem('schoolSaathiSupportRequests', JSON.stringify(list)); } catch (e2) {}
  }
  return list;
}
function supportStatusBadge(st) {
  var cls = st === 'Resolved' ? 'green' : st === 'In Progress' ? 'blue' : 'orange';
  var label = st === 'Resolved' ? t('supResolved') : st === 'In Progress' ? t('supProgress') : t('supOpen');
  return '<span class="badge ' + cls + '">' + label + '</span>';
}
function supportListRows(list) {
  if (!list.length) return '<div class="empty">' + t('noSupReq') + '</div>';
  return '<div class="act-list">' + list.map(function (r) {
    var when = (r.ts || '').slice(0, 10);
    return '<div class="act"><div class="ic" style="background:var(--blue-soft)">🎧</div><div><b>' + esc(r.name || r.by || '') + '</b><span>' + esc(r.message || '') + (when ? ' • ' + esc(when) : '') + '</span></div>' + supportStatusBadge(r.status || 'Open') + '</div>';
  }).join('') + '</div>';
}
function supportRequestsCard(limit) {
  var list = supportRequests();
  var shown = (typeof limit === 'number') ? list.slice(0, limit) : list;
  return '<div class="card"><div class="head-row"><div><h3>' + t('recentSup') + '</h3></div><a href="#" onclick="go(\'help\');return false">' + t('viewAll') + '</a></div>' + supportListRows(shown) + '</div>';
}
function openSupportForm() {
  openModal('<h3>' + t('raiseSupport') + '</h3><p style="color:var(--muted);font-size:14px">' + t('contactSub') + '</p>' +
    '<form onsubmit="return submitSupportRequest(event)"><div class="form-grid">' +
    '<div><label>' + t('supYourName') + '</label><input id="fSupName" value="' + esc(state.user ? state.user.name : '') + '"></div>' +
    '<div class="full"><label>' + t('fMessage') + '</label><input id="fSupMsg"></div></div>' +
    '<div id="supErr" class="err hidden"></div>' +
    '<div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button>' +
    '<button class="btn" type="submit">' + t('raiseSupport') + '</button></div></form>');
}
function submitSupportRequest(e) {
  if (e) e.preventDefault();
  var name = ($('fSupName') ? $('fSupName').value : '').trim();
  var msg = ($('fSupMsg') ? $('fSupMsg').value : '').trim();
  if (!name || !msg) { var err = $('supErr'); if (err) { err.textContent = t('tFillAll'); err.classList.remove('hidden'); } return false; }
  // v25: append through the single supportRequests() path — the 3 seeded
  // requests stay, the new one goes on top as Open.
  var list = supportRequests();
  list.unshift({ ts: new Date().toISOString(), name: name, message: msg, status: 'Open', by: state.user ? state.user.name : '' });
  if (list.length > 50) list.length = 50;
  localStorage.setItem('schoolSaathiSupportRequests', JSON.stringify(list));
  closeModal();
  toast(t('supportNoted'));
  renderApp(); // v25: show the new request in the list at once
  return false;
}
var PAGE_SUPER = { dashboard: superDashboard, schools: superSchools, users: superUsers, subscriptions: superSubscriptions, analytics: superAnalytics, settings: superSettings, reports: superReports, help: superHelp };

/* ================= SCHOOL ADMIN pages ================= */
function schoolDashboard() {
  var ft = feeTotals(), ta = todayAtt();
  var acts = db.activities.map(function (a) {
    // v26: real relative time from the entry's timestamp. Entries that
    // predate timestamps (seed + old stored entries) show no time at
    // all rather than a fabricated one.
    var when = relTime(a.ts);
    return '<div class="act"><div class="ic" style="background:var(--' + (a.bg === 'green' ? 'green' : a.bg === 'blue' ? 'blue' : 'orange') + '-soft)">' + a.icon + '</div><div><b>' + esc(a.title) + '</b><span>' + esc(a.sub) + (when ? ' • ' + esc(when) : '') + '</span></div></div>';
  }).join('');
  var logoHtml = db.profile.logo ? '<img class="dash-logo" src="' + esc(db.profile.logo) + '" alt="">' : '';
  return '<div class="page-head"><div class="prof-head">' + logoHtml + '<div><h2>' + t('schoolDashboard') + '</h2><p>' + esc(db.profile.name) + ', ' + esc(db.profile.city) + '</p></div></div>' +
    '<div class="toolbar"><button class="btn sm" onclick="downloadReportCSV(\'fees\')">⬇ ' + t('downloadReport') + '</button></div></div>' +
  '<div class="stats">' +
    statCard('🎒', 'blue', t('totalStudents'), db.students.length, '', 'up') +
    statCard('👩‍🏫', 'green', t('totalTeachers'), db.teachers.length, '', 'up') +
    statCard('💰', 'orange', t('feeCollected'), ft.collected, '', 'up', { prefix: '₹' }) +
    statCard('⏰', 'red', t('pendingFee'), ft.pending, '', 'down', { prefix: '₹' }) +
  '</div>' +
  '<div class="grid2"><div class="card"><h3>' + t('attOverview') + '</h3><p class="card-sub">' + t('todayAtt') + '</p><div class="donut-wrap">' +
    donutSVG([{ value: ta.present, color: GREEN, label: t('presBtn'), pct: donutPct(ta.present, ta.total) }, { value: ta.absent, color: RED, label: t('absBtn'), pct: donutPct(ta.absent, ta.total) }, { value: ta.late, color: ORANGE, label: t('lateBtn'), pct: donutPct(ta.late, ta.total) }], 190, donutPct(ta.present, ta.total) + '%', t('todayAtt')) +
    '<div class="legend"><div class="row"><span class="dot" style="background:' + GREEN + '"></span>' + t('presBtn') + '<b>' + num(ta.present) + '</b></div>' +
    '<div class="row"><span class="dot" style="background:' + RED + '"></span>' + t('absBtn') + '<b>' + num(ta.absent) + '</b></div>' +
    '<div class="row"><span class="dot" style="background:' + ORANGE + '"></span>' + t('lateBtn') + '<b>' + num(ta.late) + '</b></div></div>' +
  '</div></div>' +
  '<div class="card"><h3>' + t('feeTrend') + '</h3><p class="card-sub">' + feeRangeLabel() + ' (' + t('collectedW') + ' / ' + t('pendingW') + ')</p><div class="chart-box">' + barChartSVG(feeChartData()) + '</div><p class="muted" style="margin-top:8px"><span style="color:' + BLUE + '">■</span> ' + t('collectedW') + ' &nbsp; <span style="color:' + ORANGE + '">■</span> ' + t('pendingW') + '</p></div></div>' +
  '<div class="grid2"><div class="card"><div class="head-row"><div><h3>' + t('recentAct') + '</h3></div><a href="#" onclick="go(\'activityLog\');return false">' + t('viewAll') + '</a></div><div class="act-list">' + acts + '</div></div>' +
  '<div class="card"><h3>' + t('quickLinks') + '</h3><p class="card-sub">' + t('jumpTask') + '</p><div class="qa-grid">' +
    '<div class="qa" onclick="go(\'students\')"><div class="ic">🎒</div><b>' + t('qaAddStudent') + '</b><span>' + t('qaAddStudentD') + '</span></div>' +
    '<div class="qa" onclick="go(\'attendance\')"><div class="ic">✅</div><b>' + t('qaMarkAtt') + '</b><span>' + t('qaMarkAttD') + '</span></div>' +
    '<div class="qa" onclick="go(\'exams\')"><div class="ic">📝</div><b>' + t('qaEnterMarks') + '</b><span>' + t('qaEnterMarksD') + '</span></div>' +
    '<div class="qa" onclick="go(\'reports\')"><div class="ic">📄</div><b>' + t('qaGenReport') + '</b><span>' + t('qaGenReportD') + '</span></div>' +
  '</div></div></div>';
}
/* ================= Activity / Audit Log (v24) =================
   The dashboard "Recent Activities" card only shows the last few
   db.activities entries (collections, attendance saves, notices) — and
   its "View All" link was dead. The real audit trail lives in
   db.auditLog (logAudit: fee collections, fee deletions, admissions,
   transfers, promotions, PIN changes...), newest first. This page
   lists every audit entry so nothing — including a fee deletion —
   is invisible. */
function activityLogPage() {
  var rows = (db.auditLog || []).slice().sort(function (a, b) { return a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0; });
  var trs = rows.map(function (a) {
    var when = (a.ts || '').replace('T', ' ').slice(0, 19);
    return '<tr><td style="white-space:nowrap">' + esc(when) + '</td><td><b>' + esc(a.action) + '</b></td><td>' + esc(a.details || '') + '</td><td>' + esc(a.actor || '') + '</td></tr>';
  }).join('');
  return '<div class="page-head"><div><h2>' + t('activityLog') + '</h2><p>' + t('actLogSub') + '</p></div>' +
    '<div class="toolbar"><button class="btn ghost" onclick="go(\'dashboard\')">← ' + t('dashboard') + '</button></div></div>' +
    '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('thDate') + '</th><th>' + t('thAction') + '</th><th>' + t('thDetails') + '</th><th>' + t('actBy') + '</th></tr></thead><tbody>' +
    (trs || '<tr><td colspan="4"><div class="empty">' + t('noActivity') + '</div></td></tr>') + '</tbody></table></div></div>';
}
function studentsPage() {
  if (state.profileStudent) return studentProfilePage(state.profileStudent);
  if (promoState) return promotionPage();
  var st = studentStats();
  var list = stuSorted(stuFiltered());
  var pages = stuPageCount(list);
  var rows = stuPageRows(list);
  var sortArrow = function (col) { return state.stuSort === col ? (state.stuSortDir === 1 ? ' ▲' : ' ▼') : ''; };
  var trs = rows.map(function (s) {
    var fs = studentFeeStatus(s.id);
    var stt = s.status || 'Active';
    var badgeCls = stt === 'Active' ? 'green' : stt === 'Inactive' ? 'grey' : stt === 'Draft' ? 'blue' : 'red';
    return '<tr><td class="sel-col"><input type="checkbox" ' + ((state.stuSel || {})[s.id] ? 'checked' : '') + ' onchange="toggleStuSel(\'' + s.id + '\', this.checked)" aria-label="' + esc(s.name) + '"></td><td>' + avatarHTML(s.photo, s.name, 'mini-avatar') + '<button class="linklike" onclick="openStudentProfile(\'' + s.id + '\')">' + esc(s.name) + '</button></td>' +
      '<td>' + esc(s.admissionNo || '—') + '</td><td>' + esc(s.cls) + '</td><td>' + s.roll + '</td><td>' + esc(s.fatherName || s.guardian) + '</td><td>' + esc(s.phone) + '</td><td>' + studentAttPct(s) + '%</td>' +
      '<td><span class="badge ' + (fs === 'Paid' ? 'green' : fs === 'Pending' ? 'orange' : 'grey') + '">' + fs + '</span></td>' +
      '<td><span class="badge ' + badgeCls + '">' + stt + '</span></td>' +
      '<td><button class="btn ghost sm" onclick="stuActions(\'' + s.id + '\')">⋮ ' + t('actionsW') + '</button></td></tr>';
  }).join('');
  var opt = function (vals, cur, allLabel) {
    return ['All'].concat(vals).map(function (v) {
      return '<option value="' + v + '" ' + (cur === v ? 'selected' : '') + '>' + (v === 'All' ? allLabel : v) + '</option>';
    }).join('');
  };
  var from = list.length ? (state.stuPage - 1) * STU_PAGE_SIZE + 1 : 0;
  var selCount = stuSelCount();
  var allPageSel = rows.length > 0 && rows.every(function (s) { return !!(state.stuSel || {})[s.id]; });
  var to = Math.min(list.length, state.stuPage * STU_PAGE_SIZE);
  return '<div class="page-head"><div><h2>' + t('students') + '</h2><p>' + list.length + ' ' + t('ofWord') + ' ' + db.students.length + ' ' + t('studentsW') + '</p></div>' +
    '<div class="toolbar"><input id="stuSearchInput" placeholder="' + t('stuSearchPh') + '" value="' + esc(state.stuSearch) + '" oninput="onStuSearch(this)" style="min-width:200px">' +
    '<select onchange="state.stuClass=this.value;state.stuPage=1;renderPage()">' + opt(CLASSES, state.stuClass, t('allClasses')) + '</select>' +
    '<select onchange="state.stuSection=this.value;state.stuPage=1;renderPage()">' + opt(SECTIONS, state.stuSection, t('allSections')) + '</select>' +
    '<select onchange="state.stuSession=this.value;state.stuPage=1;renderPage()">' + opt(sessionOptions(), state.stuSession, t('allSessions')) + '</select>' +
    '<select onchange="state.stuGender=this.value;state.stuPage=1;renderPage()">' + opt(GENDERS, state.stuGender, t('allGenders')) + '</select>' +
    '<select onchange="state.stuFee=this.value;state.stuPage=1;renderPage()">' + opt(['Paid', 'Pending', '—'], state.stuFee, t('allFeeSt')) + '</select>' +
    '<select onchange="state.stuStatus=this.value;state.stuPage=1;renderPage()">' + opt(STU_STATUSES, state.stuStatus, t('allStatus')) + '</select>' +
    '<button class="btn ghost" onclick="exportStudentsCSV()">⬇ ' + t('exportCsv') + '</button>' +
    '<button class="btn ghost" onclick="openImportModal()">📥 ' + t('impImportBtn') + '</button>' +
    '<button class="btn ghost" onclick="openPromotion()">⬆️ ' + t('promoBtn') + '</button>' +
    '<button class="btn" onclick="studentForm()">+ ' + t('addStudent') + '</button></div></div>' +
    '<div class="stats">' +
    statCard('👥', 'blue', t('stTotal'), st.total, '', 'up') +
    statCard('✅', 'green', t('stActive'), st.active, '', 'up') +
    statCard('⏸️', 'blue', t('stInactive'), st.inactive, '', 'up') +
    statCard('🆕', 'orange', t('stNewAdm'), st.newAdm, '', 'up') +
    statCard('⏰', 'red', t('stPendFee'), st.pendFee, '', 'down') +
    statCard('📊', 'blue', t('stAvgAtt'), st.avgAtt, '', 'up', { suffix: '%' }) +
    '</div>' +
    '<div class="grid2" style="margin-top:16px"><div class="card"><h3>' + t('stByClass') + '</h3><p class="muted">' + t('stByClassSub') + '</p><div style="margin-top:10px">' + classBarsHTML(st.byClass) + '</div></div>' +
    '<div class="card"><h3>' + t('stGenderDist') + '</h3><p class="muted">' + t('stGenderSub') + '</p><div style="display:flex;align-items:center;gap:16px;margin-top:10px">' +
    donutSVG([{ value: st.boys, color: BLUE, label: t('stBoys'), pct: donutPct(st.boys, st.total) }, { value: st.girls, color: '#EC4899', label: t('stGirls'), pct: donutPct(st.girls, st.total) }, { value: st.unspec, color: '#94A3B8', label: t('stNotSpec'), pct: donutPct(st.unspec, st.total) }], 150, String(st.total), t('studentsW')) +
    '<div><div class="type-row"><b>' + t('stBoys') + '</b><span>' + st.boys + '</span></div>' +
    '<div class="type-row"><b>' + t('stGirls') + '</b><span>' + st.girls + '</span></div>' +
    '<div class="type-row"><b>' + t('stNotSpec') + '</b><span>' + st.unspec + '</span></div></div></div></div></div>' +
    (selCount ? '<div class="card id-bulk-bar"><span><b>' + selCount + '</b> ' + t('promoSelected') + '</span><span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="printIdCardsBulk()">🪪 ' + t('idcPrintCards') + ' (' + selCount + ')</button><button class="btn ghost sm" onclick="clearStuSel()">' + t('idcClearSel') + '</button></span></div>' : '') +
    '<div class="card" style="margin-top:16px"><div class="tbl-wrap"><table><thead><tr>' +
    '<th class="sel-col"><input type="checkbox" ' + (allPageSel ? 'checked' : '') + ' onchange="toggleStuSelAll(this.checked)" aria-label="' + t('idcSelectAll') + '"></th>' +
    '<th onclick="sortStu(\'name\')" style="cursor:pointer">' + t('thName') + sortArrow('name') + '</th>' +
    '<th>' + t('thAdmNo') + '</th>' +
    '<th onclick="sortStu(\'class\')" style="cursor:pointer">' + t('thClass') + sortArrow('class') + '</th>' +
    '<th>' + t('thRoll') + '</th><th>' + t('thFather') + '</th><th>' + t('thPhone') + '</th>' +
    '<th onclick="sortStu(\'att\')" style="cursor:pointer">' + t('thAtt') + sortArrow('att') + '</th>' +
    '<th>' + t('thFee') + '</th><th>' + t('thStatus') + '</th><th>' + t('actionsW') + '</th></tr></thead><tbody>' +
    (trs || '<tr><td colspan="11"><div class="empty">' + t('tNoMatch') + '</div></td></tr>') + '</tbody></table></div>' +
    '<div class="toolbar" style="margin-top:12px;justify-content:space-between"><span class="muted">' + t('showingRec') + ' ' + from + '–' + to + ' ' + t('ofRec') + ' ' + list.length + ' ' + t('studentsW') + '</span>' +
    '<span><button class="btn ghost sm" ' + (state.stuPage <= 1 ? 'disabled' : '') + ' onclick="state.stuPage--;renderPage()">← ' + t('prevW') + '</button> ' +
    '<span class="muted">' + t('pgPage') + ' ' + state.stuPage + ' ' + t('pgOf') + ' ' + pages + '</span> ' +
    '<button class="btn ghost sm" ' + (state.stuPage >= pages ? 'disabled' : '') + ' onclick="state.stuPage++;renderPage()">' + t('nextW') + ' →</button></span></div></div>';
}
var admEditingId = null;
function suggestRoll() {
  if (admEditingId) return;
  var cls = ($('fStCls') ? $('fStCls').value : '') + '-' + ($('fStSec') ? $('fStSec').value : 'A');
  if ($('fStRoll')) $('fStRoll').value = nextRoll(cls);
}
var admPrefill = null; // admission request being converted into an admission
function studentForm(id) {
  if (state.role !== 'school') { toast(t('tParentScope')); return; }
  pendingPhoto = null;
  admEditingId = id || null;
  var s = id ? db.students.find(function (x) { return x.id === id; }) : null;
  var pf = (!s && admPrefill) ? admPrefill : null;
  var reqId = pf ? pf.id : '';
  var d = s ? (s.documents || {}) : {};
  var clsPart = s ? classPartOf(s.cls) : '6th';
  var secPart = s ? sectionOf(s.cls) : 'A';
  var clsOpts = classParts().map(function (c) { return '<option ' + (c === clsPart ? 'selected' : '') + '>' + c + '</option>'; }).join('');
  var secOpts = SECTIONS.map(function (x) { return '<option ' + (x === secPart ? 'selected' : '') + '>' + x + '</option>'; }).join('');
  var sessOpts = SESSIONS.map(function (x) { return '<option ' + ((s ? s.session : db.profile.session) === x ? 'selected' : '') + '>' + x + '</option>'; }).join('');
  var genOpts = [''].concat(GENDERS).map(function (g) { return '<option value="' + g + '" ' + (((s && s.gender === g) || (pf && pf.gender === g)) ? 'selected' : '') + '>' + (g || '—') + '</option>'; }).join('');
  var bloodOpts = [''].concat(BLOOD_GROUPS).map(function (b) { return '<option value="' + b + '" ' + ((s && s.bloodGroup === b) ? 'selected' : '') + '>' + (b || '—') + '</option>'; }).join('');
  var catOpts = [''].concat(CATEGORIES).map(function (c) { return '<option value="' + c + '" ' + ((s && s.category === c) ? 'selected' : '') + '>' + (c || '—') + '</option>'; }).join('');
  if (pf) {
    clsPart = pf.classApply || clsPart;
    admPrefill = null; // consumed into the form; the link now lives in fStAdmReq
  }
  var admNo = s ? (s.admissionNo || '') : nextAdmNo(true);
  var admDate = s ? (s.admissionDate || '') : todayIST();
  var rollVal = s ? s.roll : nextRoll(clsPart + '-' + secPart);
  openModal('<h3>' + (s ? t('editStudent') : t('addStudent')) + '</h3>' +
    '<div id="fStErr" class="err hidden"></div>' +
    '<form onsubmit="return saveStudent(event,\'' + (id || '') + '\')"><div class="form-grid">' +
    '<div class="full sec-title">' + t('secPersonal') + '</div>' +
    '<input type="hidden" id="fStAdmReq" value="' + esc(reqId) + '">' +
    (pf ? '<div class="full"><p class="muted">' + t('admReqPrefilled') + '</p></div>' : '') +
    '<div><label>' + t('fStudentName') + ' *</label><input id="fStName" required value="' + esc(s ? s.name : (pf ? pf.name : '')) + '" placeholder="e.g. Aarav Kumar"></div>' +
    '<div><label>' + t('fDob') + '</label><input id="fStDob" type="date" value="' + esc(s ? (s.dob || '') : (pf ? (pf.dob || '') : '')) + '"></div>' +
    '<div><label>' + t('fGender') + '</label><select id="fStGender">' + genOpts + '</select></div>' +
    '<div><label>' + t('fBlood') + '</label><select id="fStBlood">' + bloodOpts + '</select></div>' +
    '<div><label>' + t('fCategory') + '</label><select id="fStCategory">' + catOpts + '</select></div>' +
    '<div><label>' + t('fPin') + '</label><input id="fStPin" inputmode="numeric" value="' + esc(s ? (s.pin || '') : '') + '" placeholder="800001"></div>' +
    '<div class="full"><label>' + t('fAddress') + '</label><input id="fStAddress" value="' + esc(s ? (s.address || '') : '') + '" placeholder="House no., street, area"></div>' +
    '<div><label>' + t('fState') + '</label><input id="fStState" value="' + esc(s ? (s.state || '') : '') + '" placeholder="Bihar"></div>' +
    '<div><label>' + t('fDistrict') + '</label><input id="fStDistrict" value="' + esc(s ? (s.district || '') : '') + '" placeholder="Gopalganj"></div>' +
    '<div class="full"><label>' + t('photoLabel') + '</label><div class="photo-row"><span id="fStPhotoPrev">' + photoPrevHTML(s ? s.photo : null, s ? s.name : '') + '</span>' +
    '<input type="file" id="fStPhoto" accept="image/*" onchange="onStudentPhoto(this)">' +
    '<button type="button" class="btn ghost sm" onclick="clearStudentPhoto()">' + t('removePhoto') + '</button></div>' +
    '<p class="muted">' + t('photoHint') + '</p></div>' +
    '<div class="full sec-title">' + t('secAcademic') + '</div>' +
    '<div><label>' + t('fAdmNo') + '</label><input value="' + esc(admNo) + '" disabled><p class="muted">' + t('admNoAuto') + '</p></div>' +
    '<div><label>' + t('fAdmDate') + '</label><input id="fStAdmDate" type="date" value="' + esc(admDate) + '"></div>' +
    '<div><label>' + t('fSession') + '</label><select id="fStSession">' + sessOpts + '</select></div>' +
    '<div><label>' + t('fClass') + ' *</label><select id="fStCls" onchange="suggestRoll()">' + clsOpts + '</select></div>' +
    '<div><label>' + t('fSection') + ' *</label><select id="fStSec" onchange="suggestRoll()">' + secOpts + '</select></div>' +
    '<div><label>' + t('fRoll') + '</label><input id="fStRoll" type="number" min="1" value="' + rollVal + '" required></div>' +
    '<div><label>' + t('fPrevSchool') + '</label><input id="fStPrevSchool" value="' + esc(s ? (s.previousSchool || '') : (pf ? (pf.previousSchool || '') : '')) + '"></div>' +
    '<div><label>' + t('fPrevClass') + '</label><input id="fStPrevClass" value="' + esc(s ? (s.previousClass || '') : '') + '"></div>' +
    '<div class="full sec-title">' + t('secParent') + '</div>' +
    '<div><label>' + t('fFather') + '</label><input id="fStFather" value="' + esc(s ? (s.fatherName || '') : '') + '" placeholder="Mr. Sharma"></div>' +
    '<div><label>' + t('fMother') + '</label><input id="fStMother" value="' + esc(s ? (s.motherName || '') : '') + '" placeholder="Mrs. Sharma"></div>' +
    '<div><label>' + t('fGuardian') + '</label><input id="fStG" value="' + esc(s ? s.guardian : (pf ? pf.guardianName : '')) + '" placeholder="Mr. Sharma"></div>' +
    '<div><label>' + t('fPhone') + ' *</label><input id="fStPh" value="' + esc(s ? s.phone : (pf ? pf.phone : '')) + '" placeholder="98XXXXXXXX"></div>' +
    '<div><label>' + t('fPhone2') + '</label><input id="fStPh2" value="' + esc(s ? (s.mobile2 || '') : '') + '" placeholder="98XXXXXXXX"></div>' +
    '<div><label>' + t('fParentEmail') + '</label><input id="fStParentEmail" type="email" value="' + esc(s ? (s.parentEmail || '') : '') + '" placeholder="parent@email.com"></div>' +
    '<div><label>' + t('fOccupation') + '</label><input id="fStOccupation" value="' + esc(s ? (s.occupation || '') : '') + '" placeholder="e.g. Farmer"></div>' +
    '<div class="full sec-title">' + t('secDocs') + '</div>' +
    '<div><label class="check"><input type="checkbox" id="fStBirthCert" ' + (d.birthCert ? 'checked' : '') + '> ' + t('fBirthCert') + '</label></div>' +
    '<div><label class="check"><input type="checkbox" id="fStTc" ' + (d.tc ? 'checked' : '') + '> ' + t('fTc') + '</label></div>' +
    '<div><label>' + t('fTcNo') + '</label><input id="fStTcNo" value="' + esc(d.tcNumber || '') + '"></div>' +
    '<div><label>' + t('fAadhaar') + '</label><input id="fStAadhaar" inputmode="numeric" value="' + esc(s ? (s.aadhaar || '') : '') + '" placeholder="12-digit (optional)"><p class="muted">' + t('aadhaarHint') + '</p></div>' +
    '<div class="full"><label>' + t('fDocsOther') + '</label><input id="fStDocsOther" value="' + esc(d.other || '') + '"></div>' +
    '<div class="full"><p class="muted">' + t('docsNote') + '</p></div>' +
    '</div><div class="actions" style="flex-wrap:wrap">' +
    (s ? '<button type="button" class="btn danger" onclick="cancelAdmission(\'' + s.id + '\')">' + t('cancelAdm') + '</button>' : '') +
    '<button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button>' +
    '<button type="button" class="btn ghost" onclick="return saveStudent(event,\'' + (id || '') + '\',\'draft\')">' + t('saveDraft') + '</button>' +
    '<button type="button" class="btn ghost" onclick="return saveStudent(event,\'' + (id || '') + '\',\'another\')">' + t('saveAddAnother') + '</button>' +
    '<button class="btn" type="submit">' + t('saveStudentBtn') + '</button></div></form>', true);
}
function saveStudent(e, id, mode) {
  if (state.role !== 'school') { toast(t('tParentScope')); return false; }
  e.preventDefault();
  mode = mode || 'active';
  var errEl = $('fStErr');
  function fail(msg) { if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); } toast(msg); return false; }
  var fval = function (fid) { var el = $(fid); return el ? (el.value || '') : ''; };
  var name = fval('fStName').trim();
  var clsRaw = fval('fStCls');
  var secRaw = fval('fStSec');
  var cls = clsRaw.indexOf('-') !== -1 ? clsRaw : (clsRaw + '-' + (secRaw || 'A'));
  var phone = fval('fStPh').trim();
  if (!name || !phone || !clsRaw) return fail(t('tReqFields'));
  if (digitsOnly(phone).length !== 10) return fail(t('tInvalidMobile'));
  var pin = fval('fStPin').trim();
  if (pin && !/^\d{6}$/.test(pin)) return fail(t('tInvalidPin'));
  var aadhaar = digitsOnly(fval('fStAadhaar'));
  if (aadhaar && aadhaar.length !== 12) return fail(t('tInvalidAadhaar'));
  var admDateVal = fval('fStAdmDate');
  var dob = fval('fStDob');
  var data = { name: name, cls: cls, roll: parseInt(fval('fStRoll'), 10) || 1,
    guardian: fval('fStG').trim() || '—', phone: phone,
    dob: dob, gender: fval('fStGender'), bloodGroup: fval('fStBlood'),
    category: fval('fStCategory'), address: fval('fStAddress').trim(),
    state: fval('fStState').trim(), district: fval('fStDistrict').trim(), pin: pin,
    session: fval('fStSession') || db.profile.session,
    admissionDate: admDateVal || todayIST(),
    previousSchool: fval('fStPrevSchool').trim(),
    previousClass: fval('fStPrevClass').trim(),
    fatherName: fval('fStFather').trim(),
    motherName: fval('fStMother').trim(),
    mobile2: fval('fStPh2').trim(),
    parentEmail: fval('fStParentEmail').trim(),
    occupation: fval('fStOccupation').trim(),
    aadhaar: aadhaar,
    documents: { birthCert: $('fStBirthCert') ? !!$('fStBirthCert').checked : false,
      tc: $('fStTc') ? !!$('fStTc').checked : false,
      tcNumber: fval('fStTcNo').trim(),
      other: fval('fStDocsOther').trim() } };
  // Edit with a blank date field keeps the stored date (never fabricate one on edit).
  if (id && !admDateVal) { var ex0 = db.students.find(function (x) { return x.id === id; }); if (ex0) data.admissionDate = ex0.admissionDate || ''; }
  var dup = findDupStudent(data, id || null);
  if (dup) return fail(t('tDupFound') + dup.name + ' (' + (dup.admissionNo || dup.enr || '') + ' • ' + dup.cls + ')');
  if (id) {
    var s = db.students.find(function (x) { return x.id === id; });
    if (!s) return false;
    var oldPhone = s.phone;
    Object.assign(s, data);
    // Parent PIN follows the primary mobile while it is still the default
    // (last 4 digits); a custom PIN set by the school is never overwritten.
    if (!s.parentPin || s.parentPin === parentPinFromPhone(oldPhone)) s.parentPin = parentPinFromPhone(s.phone);
    s.status = mode === 'draft' ? 'Draft' : 'Active';
    if (pendingPhoto !== null) { if (pendingPhoto) s.photo = pendingPhoto; else delete s.photo; }
    logAudit('Student updated', s.name + ' • ' + (s.admissionNo || '') + ' • ' + s.cls);
    toast(t('tStudentUpdated'));
  } else {
    var nid = 'stu' + Date.now();
    var admNo = nextAdmNo();
    var newStu = Object.assign({ id: nid, att: 100, result: 0, fee: 'Pending', enr: nextEnr(), admissionNo: admNo, status: mode === 'draft' ? 'Draft' : 'Active', parentPin: parentPinFromPhone(phone) }, data);
    if (pendingPhoto) newStu.photo = pendingPhoto;
    db.students.push(newStu);
    var reqId = fval('fStAdmReq');
    if (reqId) {
      var rq = (db.admissionRequests || []).find(function (x) { return x.id === reqId; });
      if (rq && rq.status === 'Pending') {
        rq.status = 'Approved'; rq.studentId = nid;
        logAudit('Admission request approved', rq.name + ' • ' + admNo + ' • ' + cls);
      }
    }
    logAudit(mode === 'draft' ? 'Admission saved as draft' : 'Admission created', name + ' • ' + admNo + ' • ' + cls);
    toast(mode === 'draft' ? t('tDraftSaved') : t('tAdmCreated') + admNo);
  }
  pendingPhoto = null;
  saveDB(db); closeModal();
  if (mode === 'another') { renderApp(); studentForm(''); }
  else renderApp();
  return false;
}
function stuActions(id) {
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) return;
  var stt = s.status || 'Active';
  var toggleBtn = stt === 'Active'
    ? '<button class="btn ghost" onclick="closeModal();deactivateStudent(\'' + s.id + '\')">' + t('actDeactivate') + '</button>'
    : (stt === 'Inactive'
      ? '<button class="btn ghost" onclick="closeModal();deactivateStudent(\'' + s.id + '\')">' + t('actActivate') + '</button>' : '');
  openModal('<h3>' + esc(s.name) + ' • ' + esc(s.cls) + '</h3><div class="menu-list">' +
    '<button class="btn ghost" onclick="closeModal();openStudentProfile(\'' + s.id + '\')">' + t('actView') + '</button>' +
    '<button class="btn ghost" onclick="closeModal();studentForm(\'' + s.id + '\')">' + t('actEdit') + '</button>' +
    '<button class="btn ghost" onclick="closeModal();viewStudentAttendance(\'' + s.id + '\')">' + t('actAtt') + '</button>' +
    '<button class="btn ghost" onclick="closeModal();viewStudentFees(\'' + s.id + '\')">' + t('actFees') + '</button>' +
    '<button class="btn ghost" onclick="closeModal();viewStudentResults(\'' + s.id + '\')">' + t('actResults') + '</button>' +
    '<button class="btn ghost" onclick="closeModal();printIdCard(\'' + s.id + '\')">🪪 ' + t('actIdCard') + '</button>' +
    '<button class="btn ghost" onclick="closeModal();downloadStudentCSV(\'' + s.id + '\')">' + t('actDownload') + '</button>' +
    '<button class="btn ghost" onclick="closeModal();transferStudent(\'' + s.id + '\')">' + t('actTransfer') + '</button>' +
    ((stt === 'Active' || stt === 'Inactive') ? '<button class="btn ghost" onclick="closeModal();promoteSingle(\'' + s.id + '\')">⬆️ ' + t('promoSingle') + '</button>' : '') +
    toggleBtn +
    '<button class="btn danger" onclick="closeModal();deleteStudent(\'' + s.id + '\')">' + t('deleteBtn') + '</button>' +
    '</div>');
}
function viewStudentAttendance(id) {
  if (state.role === 'parent' || !canViewStudent(id)) { toast(t('tParentScope')); return; }
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) return;
  state.attCls = s.cls;
  go('attendance');
}
function viewStudentFees(id) {
  if (state.role === 'parent' || !canViewStudent(id)) { toast(t('tParentScope')); return; }
  state.view = 'fees'; state.feeStudent = id;
  persistSession();
  histPush({ view: 'fees', sub: 'profile:' + id });
  renderApp();
}
function viewStudentResults(id) {
  if (state.role === 'parent' || !canViewStudent(id)) { toast(t('tParentScope')); return; }
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) return;
  var ex = db.exams.find(function (e) { return e.cls === s.cls; });
  if (ex) state.examId = ex.id;
  go('exams');
}
function transferStudent(id) {
  if (state.role !== 'school') { toast(t('tParentScope')); return; }
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) return;
  var clsOpts = CLASSES.map(function (c) { return '<option ' + (c === s.cls ? 'selected' : '') + '>' + c + '</option>'; }).join('');
  openModal('<h3>' + t('transferTitle') + ' — ' + esc(s.name) + '</h3><form onsubmit="return doTransfer(event,\'' + s.id + '\')"><div class="form-grid">' +
    '<div class="full"><label>' + t('transferTo') + '</label><select id="fTrCls" onchange="suggestTransferRoll()">' + clsOpts + '</select></div>' +
    '<div><label>' + t('fRoll') + '</label><input id="fTrRoll" type="number" min="1" value="' + nextRoll(s.cls) + '"></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button><button class="btn" type="submit">' + t('transferTitle') + '</button></div></form>');
}
function suggestTransferRoll() {
  var cls = $('fTrCls') ? $('fTrCls').value : '';
  if (cls && $('fTrRoll')) $('fTrRoll').value = nextRoll(cls);
}
function doTransfer(e, id) {
  e.preventDefault();
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) return false;
  var toCls = $('fTrCls') ? $('fTrCls').value : '';
  if (!toCls) { toast(t('tPickClass')); return false; }
  var fromCls = s.cls;
  s.cls = toCls;
  s.roll = parseInt($('fTrRoll') ? $('fTrRoll').value : '', 10) || nextRoll(toCls);
  // NOTE: fee records keep their historical cls (the fee belonged to the old
  // class); only the student's cls changes. The v9 migration's one-time
  // fee-cls alignment is flag-guarded so it never rewrites these either.
  logAudit('Student transferred', s.name + ' • ' + (s.admissionNo || '') + ' • ' + fromCls + ' → ' + toCls);
  saveDB(db); closeModal(); renderApp();
  toast(t('tTransferred'));
  return false;
}

/* ================= Phase 2: promotion =================
   History is preserved by design: fee records keep their historical cls,
   marks stay keyed by exam, attendance stays keyed by date|old class — so a
   promoted student's whole history stays visible in the profile tabs. */
function nextSession(sess) {
  var m = /^(\d{4})–(\d{2})$/.exec(String(sess || '').trim());
  if (!m) return '';
  var y = parseInt(m[1], 10) + 1;
  return y + '–' + String((y + 1) % 100).padStart(2, '0');
}
function nextClassPart(cp) {
  var parts = classParts();
  var i = parts.indexOf(cp);
  return i === -1 ? cp : parts[Math.min(i + 1, parts.length - 1)];
}
function promoEligible(fromSession, fromCls) {
  // Only Active/Inactive students in that exact class + session.
  // Draft/Cancelled students are never listed. A second run on the same
  // class/session naturally finds none of the already-promoted students.
  return db.students.filter(function (s) {
    return s.cls === fromCls && (s.session || '') === fromSession && ((s.status || 'Active') === 'Active' || (s.status || 'Active') === 'Inactive');
  });
}
// Pure promotion core (UI-free, so the harness can drive it directly).
// sel: { ids, toSession, toCls (full '10th-A'), mode: 'promote'|'retain' }.
// Returns { promoted, retained, skipped: [{id, reason}] }.
function runPromotion(sel) {
  var out = { promoted: 0, retained: 0, skipped: [] };
  (sel.ids || []).forEach(function (id) {
    var s = db.students.find(function (x) { return x.id === id; });
    if (!s) { out.skipped.push({ id: id, reason: t('promoNotEligible') }); return; }
    var stt = s.status || 'Active';
    if (stt !== 'Active' && stt !== 'Inactive') { out.skipped.push({ id: id, reason: t('promoNotEligible') }); return; }
    var fromCls = s.cls, fromSess = s.session || '';
    if (sel.mode === 'retain') {
      if (fromSess === sel.toSession) { out.skipped.push({ id: id, reason: t('promoNoopRetain') }); return; }
      s.session = sel.toSession;
      logAudit('Student retained', s.name + ' • ' + (s.admissionNo || '') + ' • ' + 'Retained in ' + fromCls + ', session ' + fromSess + ' → ' + sel.toSession);
      out.retained++;
    } else {
      if (fromCls === sel.toCls && fromSess === sel.toSession) { out.skipped.push({ id: id, reason: t('promoNoop') }); return; }
      s.previousClass = fromCls; // v11: record the class promoted FROM (shown on the profile Academic tab)
      s.cls = sel.toCls;
      s.roll = nextRoll(sel.toCls); // next free roll in the TARGET class, in order
      s.session = sel.toSession;
      logAudit('Student promoted', s.name + ' • ' + (s.admissionNo || '') + ' • ' + fromCls + ' → ' + sel.toCls + ', session ' + fromSess + ' → ' + sel.toSession);
      out.promoted++;
    }
  });
  saveDB(db);
  return out;
}
function promoList() {
  if (!promoState) return [];
  if (promoState.mode === 'single' && promoState.singleId) {
    var s = db.students.find(function (x) { return x.id === promoState.singleId; });
    return s ? [s] : [];
  }
  return promoEligible(promoState.fromSession, promoState.fromCls);
}
function openPromotion(singleId, opts) {
  if (state.role !== 'school') { toast(t('tParentScope')); return; }
  state.profileStudent = null; // never show profile + promotion at once
  var s = singleId ? db.students.find(function (x) { return x.id === singleId; }) : null;
  var fromSession = s ? (s.session || db.profile.session) : db.profile.session;
  var fromCls = s ? s.cls : '9th-A';
  var sel = {};
  if (singleId) sel[singleId] = true;
  promoState = {
    mode: singleId ? 'single' : 'bulk',
    singleId: singleId || null,
    fromSession: fromSession, fromCls: fromCls,
    toSession: nextSession(fromSession) || db.profile.session,
    toCls: nextClassPart(classPartOf(fromCls)), toSec: sectionOf(fromCls) || 'A',
    selected: sel, result: null
  };
  persistSession();
  if (!opts || !opts.noHist) histPush({ view: 'students', sub: singleId ? 'promo:' + singleId : 'promo' });
  renderPage();
}
function promoteSingle(id) { openPromotion(id); }
function onPromoFromChange() {
  if (!promoState) return;
  var fs = $('promoFromSession'), fc = $('promoFromClass');
  if (fs) promoState.fromSession = fs.value;
  if (fc) promoState.fromCls = fc.value;
  promoState.selected = {};
  promoState.result = null;
  renderPage();
}
function onPromoToChange() {
  if (!promoState) return;
  var ts = $('promoToSession'), tc = $('promoToClass'), tsec = $('promoToSection');
  if (ts) promoState.toSession = ts.value;
  if (tc) promoState.toCls = tc.value;
  if (tsec) promoState.toSec = tsec.value;
  renderPage();
}
function togglePromo(id, checked) {
  if (!promoState) return;
  if (checked) promoState.selected[id] = true; else delete promoState.selected[id];
  renderPage();
}
function togglePromoAll(checked) {
  if (!promoState) return;
  if (checked) promoList().forEach(function (s) { promoState.selected[s.id] = true; });
  else promoState.selected = {};
  renderPage();
}
function doPromote(mode) {
  if (!promoState) return;
  var ids = Object.keys(promoState.selected);
  if (!ids.length) { toast(t('promoNoSelect')); return; }
  var toCls = promoState.toCls + '-' + promoState.toSec;
  var res = runPromotion({ ids: ids, toSession: promoState.toSession, toCls: toCls, mode: mode });
  promoState.result = { mode: mode, promoted: res.promoted, retained: res.retained, skipped: res.skipped.length };
  promoState.selected = {};
  renderPage();
  if (res.promoted === 0 && res.retained === 0) toast(mode === 'retain' ? t('promoNoopRetain') : t('promoNoop'));
  else toast(t('promoDone') + ' ' + res.promoted + ' ' + t('promoPromoted') + ', ' + res.retained + ' ' + t('promoRetained') + '.');
}
function promotionPage() {
  var p = promoState;
  var list = promoList();
  var sessOpts = function (cur) {
    var opts = [];
    SESSIONS.concat(sessionOptions()).forEach(function (s) { if (opts.indexOf(s) === -1) opts.push(s); });
    if (opts.indexOf(cur) === -1) opts.push(cur);
    return opts.map(function (s) { return '<option ' + (s === cur ? 'selected' : '') + '>' + s + '</option>'; }).join('');
  };
  var clsOpts = function (cur) {
    return CLASSES.map(function (c) { return '<option ' + (c === cur ? 'selected' : '') + '>' + c + '</option>'; }).join('');
  };
  var cpOpts = function (cur) {
    return classParts().map(function (c) { return '<option ' + (c === cur ? 'selected' : '') + '>' + c + '</option>'; }).join('');
  };
  var secOpts = function (cur) {
    return SECTIONS.map(function (x) { return '<option ' + (x === cur ? 'selected' : '') + '>' + x + '</option>'; }).join('');
  };
  var selCount = Object.keys(p.selected).length;
  var rows = list.map(function (s) {
    var checked = !!p.selected[s.id];
    return '<label class="promo-row"><input type="checkbox" ' + (checked ? 'checked' : '') + ' ' + (p.mode === 'single' ? 'disabled' : '') + ' onchange="togglePromo(\'' + s.id + '\', this.checked)">' +
      '<span style="flex:1"><b>' + esc(s.name) + '</b> <span class="muted">• ' + esc(s.cls) + ' • ' + t('thAdmNo') + ' ' + esc(s.admissionNo || '—') + ' • ' + t('thRoll') + ' ' + s.roll + '</span></span>' +
      '<span class="badge ' + ((s.status || 'Active') === 'Active' ? 'green' : 'grey') + '">' + (s.status || 'Active') + '</span></label>';
  }).join('');
  var resHtml = '';
  if (p.result) {
    resHtml = '<div class="card" style="margin-top:16px"><h3>' + t('promoDone') + '</h3><p>' + p.result.promoted + ' ' + t('promoPromoted') + ' • ' + p.result.retained + ' ' + t('promoRetained') + ' • ' + p.result.skipped + ' ' + t('impSkipped') + '</p></div>';
  }
  return '<div class="page-head"><div><h2>' + t('promoTitle') + '</h2><p>' + t('promoNote') + '</p></div>' +
    '<div class="toolbar"><button class="btn ghost" onclick="promoState=null;renderPage()">← ' + t('backDir') + '</button></div></div>' +
    (p.mode === 'single' ? '<p class="muted" style="margin-bottom:12px">' + t('promoSingleNote') + '</p>' : '') +
    '<div class="card"><div class="form-grid">' +
    '<div><label>' + t('promoFromSession') + '</label><select id="promoFromSession" onchange="onPromoFromChange()">' + sessOpts(p.fromSession) + '</select></div>' +
    '<div><label>' + t('promoFromClass') + '</label><select id="promoFromClass" onchange="onPromoFromChange()">' + clsOpts(p.fromCls) + '</select></div>' +
    '<div><label>' + t('promoToSession') + '</label><select id="promoToSession" onchange="onPromoToChange()">' + sessOpts(p.toSession) + '</select></div>' +
    '<div><label>' + t('promoToClass') + '</label><select id="promoToClass" onchange="onPromoToChange()">' + cpOpts(p.toCls) + '</select></div>' +
    '<div><label>' + t('promoToSection') + '</label><select id="promoToSection" onchange="onPromoToChange()">' + secOpts(p.toSec) + '</select></div>' +
    '</div></div>' +
    '<div class="card" style="margin-top:16px"><div class="head-row"><div><h3>' + list.length + ' ' + t('studentsW') + '</h3><p class="card-sub">' + selCount + ' ' + t('promoSelected') + '</p></div>' +
    '<div class="toolbar"><button class="btn ghost sm" onclick="togglePromoAll(true)">' + t('promoSelectAll') + '</button>' +
    '<button class="btn ghost sm" onclick="togglePromoAll(false)">' + t('promoSelectNone') + '</button></div></div>' +
    '<div class="promo-list">' + (rows || '<div class="empty">' + t('promoNoStudents') + '</div>') + '</div>' +
    '<div class="actions" style="justify-content:flex-start;margin-top:16px"><button class="btn green" onclick="doPromote(\'promote\')">' + t('promoPromote') + '</button>' +
    '<button class="btn ghost" onclick="doPromote(\'retain\')">' + t('promoRetain') + '</button></div></div>' + resHtml;
}
function deactivateStudent(id) {
  if (state.role !== 'school') { toast(t('tParentScope')); return; }
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) return;
  var toInactive = (s.status || 'Active') === 'Active';
  confirmModal((toInactive ? t('tDeactMsg') : t('tActMsg')) + ' — ' + s.name + '?', function () {
    s.status = toInactive ? 'Inactive' : 'Active';
    logAudit(toInactive ? 'Student deactivated' : 'Student activated', s.name + ' • ' + (s.admissionNo || '') + ' • ' + s.cls);
    saveDB(db); renderApp();
    toast(toInactive ? t('tDeactivated') : t('tActivated'));
  });
}
function cancelAdmission(id) {
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) return;
  confirmModal(t('cancelAdmMsg'), function () {
    s.status = 'Cancelled';
    logAudit('Admission cancelled', s.name + ' • ' + (s.admissionNo || '') + ' • ' + s.cls);
    saveDB(db); closeModal(); renderApp();
    toast(t('tAdmCancelled'));
  });
}
function openStudentProfile(id) {
  if (!canViewStudent(id)) { toast(t('tParentScope')); return; }
  promoState = null;
  state.profileStudent = id; state.profileTab = 'overview';
  persistSession();
  histPush({ view: 'students', sub: 'profile:' + id });
  renderPage();
}
function setProfileTab(tab) { state.profileTab = tab; renderPage(); }
function studentProfilePage(id) {
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) { state.profileStudent = null; return studentsPage(); }
  var stt = s.status || 'Active';
  var badgeCls = stt === 'Active' ? 'green' : stt === 'Inactive' ? 'grey' : stt === 'Draft' ? 'blue' : 'red';
  var tabs = [['overview', 'tabOverview'], ['personal', 'tabPersonal'], ['parent', 'tabParent'], ['academic', 'tabAcademic'], ['attendance', 'tabAttendance'], ['fees', 'tabFees'], ['results', 'tabResults'], ['homework', 'tabHomework'], ['docs', 'tabDocs'], ['activity', 'tabActivity']];
  var tabBar = '<div class="tabs">' + tabs.map(function (tb) {
    return '<button class="tab-btn' + (state.profileTab === tb[0] ? ' on' : '') + '" onclick="setProfileTab(\'' + tb[0] + '\')">' + t(tb[1]) + '</button>';
  }).join('') + '</div>';
  var isParent = state.role === 'parent';
  var toolbar = isParent
    ? '<div class="toolbar"><button class="btn ghost" onclick="printIdCard(\'' + s.id + '\')">🪪 ' + t('actIdCard') + '</button></div>'
    : '<div class="toolbar"><button class="btn ghost" onclick="backFromProfile()">← ' + t('backDir') + '</button>' +
    '<button class="btn" onclick="studentForm(\'' + s.id + '\')">' + t('editStudent') + '</button>' +
    '<button class="btn ghost" onclick="printIdCard(\'' + s.id + '\')">🪪 ' + t('actIdCard') + '</button>' +
    ((stt === 'Active' || stt === 'Inactive') ? '<button class="btn ghost" onclick="promoteSingle(\'' + s.id + '\')">⬆️ ' + t('promoSingle') + '</button>' : '') + '</div>';
  return '<div class="page-head"><div class="prof-head">' + avatarHTML(s.photo, s.name, 'big-avatar') + '<div><h2>' + esc(s.name) + '</h2><p>' + esc(s.cls) + ' • ' + t('thAdmNo') + ' ' + esc(s.admissionNo || '—') + ' • ' + t('thEnr') + ' ' + esc(s.enr || '—') + ' • <span class="badge ' + badgeCls + '">' + stt + '</span></p></div></div>' +
    toolbar + '</div>' +
    tabBar + '<div style="margin-top:16px">' + profileTabBody(s, state.profileTab || 'overview') + '</div>';
}
function profileTabBody(s, tab) {
  var d = s.documents || {};
  var kv = function (label, val) { return '<div class="kv"><b>' + label + '</b><span>' + val + '</span></div>'; };
  if (tab === 'personal') {
    return '<div class="card">' + kv(t('fStudentName'), esc(s.name)) + kv(t('fDob'), esc(s.dob || '—')) + kv(t('fGender'), esc(s.gender || '—')) + kv(t('fBlood'), esc(s.bloodGroup || '—')) + kv(t('fCategory'), esc(s.category || '—')) + kv(t('fAddress'), esc(s.address || '—')) + kv(t('fState'), esc(s.state || '—')) + kv(t('fDistrict'), esc(s.district || '—')) + kv(t('fPin'), esc(s.pin || '—')) + kv(t('fAadhaar'), maskAadhaar(s.aadhaar)) + '</div>';
  }
  if (tab === 'parent') {
    var base = '<div class="card">' + kv(t('fFather'), esc(s.fatherName || '—')) + kv(t('fMother'), esc(s.motherName || '—')) + kv(t('fGuardian'), esc(s.guardian)) + kv(t('fPhone'), esc(s.phone)) + kv(t('fPhone2'), esc(s.mobile2 || '—')) + kv(t('fParentEmail'), esc(s.parentEmail || '—')) + kv(t('fOccupation'), esc(s.occupation || '—')) + '</div>';
    if (state.role !== 'school') return base;
    var pinNow = s.parentPin ? esc(s.parentPin) : '—';
    var pinBox = '<div class="card" style="margin-top:16px"><h3>' + t('parentAccess') + '</h3>' +
      '<div class="kv"><b>' + t('parentPinNow') + '</b><span>' + pinNow + '</span></div>' +
      '<p class="muted" style="margin:8px 0">' + t('tPinAuto') + (s.parentPin ? '' : ' ' + t('parentPinNone')) + '</p>' +
      '<div class="form-grid"><div><label>' + t('parentPinNew') + '</label><input id="fParentPinNew" inputmode="numeric" maxlength="6" placeholder="4–6 digits"></div></div>' +
      '<div class="toolbar" style="margin-top:12px"><button class="btn" onclick="setParentPin(\'' + s.id + '\')">' + t('parentPinSetBtn') + '</button>' +
      '<button class="btn ghost" onclick="clearParentPin(\'' + s.id + '\')">' + t('parentPinClear') + '</button></div></div>';
    return base + pinBox;
  }
  if (tab === 'academic') {
    return '<div class="card">' + kv(t('fAdmNo'), esc(s.admissionNo || '—')) + kv(t('fAdmDate'), esc(s.admissionDate || '—')) + kv(t('fSession'), esc(s.session || '—')) + kv(t('fClass'), esc(classPartOf(s.cls))) + kv(t('fSection'), esc(sectionOf(s.cls))) + kv(t('fRoll'), String(s.roll)) + kv(t('fPrevSchool'), esc(s.previousSchool || '—')) + kv(t('fPrevClass'), esc(s.previousClass || '—')) + kv(t('thStatus'), esc(s.status || 'Active')) + '</div>';
  }
  if (tab === 'attendance') {
    var rows = [];
    Object.keys(db.attendance).forEach(function (k) {
      var recs = db.attendance[k] || {};
      if (recs[s.id]) rows.push({ date: k.split('|')[0], cls: k.split('|')[1], st: recs[s.id] });
    });
    rows.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var shown = rows.slice(0, 30);
    var trs = shown.map(function (r) {
      return '<tr><td>' + esc(r.date) + '</td><td>' + esc(r.cls) + '</td><td><span class="badge ' + (r.st === 'Present' ? 'green' : r.st === 'Absent' ? 'red' : 'orange') + '">' + r.st + '</span></td></tr>';
    }).join('');
    return '<div class="card"><p class="muted">' + t('attPct') + ': <b>' + studentAttPct(s) + '%</b>' + (rows.length > 30 ? ' • ' + t('showingRec') + ' 30 ' + t('ofRec') + ' ' + rows.length : '') + '</p><div class="tbl-wrap"><table><thead><tr><th>' + t('thDate') + '</th><th>' + t('thClass') + '</th><th>' + t('thStatus') + '</th></tr></thead><tbody>' + (trs || '<tr><td colspan="3"><div class="empty">' + t('noAttRecs') + '</div></td></tr>') + '</tbody></table></div></div>';
  }
  if (tab === 'fees') {
    var sum = feeSummaryFor(s.id);
    if (!sum) return '<div class="card"><div class="empty">' + t('tNoFeeRecs') + '</div></div>';
    var btRows = Object.keys(sum.byType).map(function (ty) {
      return '<div class="type-row"><b>' + esc(feeTypeLabel(ty)) + '</b><span>' + t('collectedW') + ' ' + inr(sum.byType[ty].collected) + ' • ' + t('pendingW') + ' ' + inr(sum.byType[ty].pending) + '</span></div>';
    }).join('');
    var frs = sum.recs.map(function (r) {
      return '<tr><td>' + r.month + '</td><td>' + esc(feeTypeLabel(feeTypeOf(r))) + '</td><td>' + inr(r.amount) + '</td><td>' + esc(r.date) + '</td><td><span class="badge ' + (r.status === 'Collected' ? 'green' : 'orange') + '">' + r.status + '</span></td></tr>';
    }).join('');
    return '<div class="stats">' + statCard('🧾', 'blue', t('totalBilled'), sum.billed, '', 'up', { prefix: '₹' }) + statCard('✅', 'green', t('totalPaid'), sum.paid, '', 'up', { prefix: '₹' }) + statCard('⏰', 'red', t('totalPending'), sum.pend, '', 'down', { prefix: '₹' }) + '</div>' +
      '<div class="card"><h3>' + t('feeByType') + '</h3>' + (btRows || '<p class="muted">' + t('tNoFeeRecs') + '</p>') + '</div>' +
      '<div class="card" style="margin-top:16px"><h3>' + t('feeRecsH') + '</h3><div class="tbl-wrap fee-hist-tbl"><table><thead><tr><th>' + t('thMonth') + '</th><th>' + t('thType') + '</th><th>' + t('thAmount') + '</th><th>' + t('thDate') + '</th><th>' + t('thStatus') + '</th></tr></thead><tbody>' + (frs || '<tr><td colspan="5"><div class="empty">' + t('tNoFeeRecs') + '</div></td></tr>') + '</tbody></table></div>' +
      (state.role === 'parent' ? '' : '<div class="toolbar" style="margin-top:12px"><button class="btn" onclick="viewStudentFees(\'' + s.id + '\')">' + t('openFees') + '</button></div>') + '</div>';
  }
  if (tab === 'results') {
    var exs = db.exams.filter(function (e) { return e.cls === s.cls; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var rtrs = exs.map(function (ex) {
      var mk = db.marks.find(function (m) { return m.examId === ex.id && m.studentId === s.id; });
      var pct = mk ? Math.round(mk.marks / ex.total * 100) + '%' : '—';
      return '<tr><td>' + esc(ex.name) + '</td><td>' + esc(ex.subject) + '</td><td>' + esc(ex.date) + '</td><td>' + (mk ? mk.marks + ' / ' + ex.total : '—') + '</td><td>' + pct + '</td></tr>';
    }).join('');
    return '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('thExam') + '</th><th>' + t('fSubject') + '</th><th>' + t('thDate') + '</th><th>' + t('thMarks') + '</th><th>' + t('thResult') + '</th></tr></thead><tbody>' + (rtrs || '<tr><td colspan="5"><div class="empty">' + t('noExamRecs') + '</div></td></tr>') + '</tbody></table></div></div>';
  }
  if (tab === 'homework') {
    var hws = db.homework.filter(function (h) { return h.cls === s.cls; });
    var htrs = hws.map(function (h) {
      var done = (h.doneBy || []).indexOf(s.id) !== -1;
      return '<tr><td>' + esc(h.title) + '</td><td>' + esc(h.subject) + '</td><td>' + esc(h.due) + '</td><td><span class="badge ' + (done ? 'green' : 'orange') + '">' + (done ? t('hwDone') : t('hwPend')) + '</span></td></tr>';
    }).join('');
    return '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('fTitle') + '</th><th>' + t('fSubject') + '</th><th>' + t('fDue') + '</th><th>' + t('thStatus') + '</th></tr></thead><tbody>' + (htrs || '<tr><td colspan="4"><div class="empty">' + t('noHwRecs') + '</div></td></tr>') + '</tbody></table></div></div>';
  }
  if (tab === 'docs') {
    var docRow = function (label, ok) { return '<div class="kv"><b>' + label + '</b><span class="badge ' + (ok ? 'green' : 'grey') + '">' + (ok ? t('docStatus') : t('docMissing')) + '</span></div>'; };
    return '<div class="card">' + docRow(t('fBirthCert'), !!d.birthCert) + docRow(t('fTc'), !!d.tc) + kv(t('fTcNo'), esc(d.tcNumber || '—')) + kv(t('fDocsOther'), esc(d.other || '—')) + '<p class="muted" style="margin-top:10px">' + t('docsNote') + '</p></div>';
  }
  if (tab === 'activity') {
    var acts = (db.auditLog || []).filter(function (a) {
      var det = a.details || '';
      if (s.admissionNo) return det.indexOf(s.admissionNo) !== -1;
      return det.indexOf(s.name) !== -1;
    });
    var arows = acts.map(function (a) {
      return '<div class="act"><div><b>' + esc(a.action) + '</b><div class="muted">' + esc(a.details) + '</div><div class="muted">' + esc(a.ts) + ' • ' + esc(a.actor) + '</div></div></div>';
    }).join('');
    return '<div class="card">' + (arows || '<div class="empty">' + t('noActivity') + '</div>') + '</div>';
  }
  // overview (default)
  var lex = latestExamPct(s);
  var hwPend = db.homework.filter(function (h) { return h.cls === s.cls && (h.doneBy || []).indexOf(s.id) === -1; }).length;
  var sum2 = feeSummaryFor(s.id);
  var pendAmt = sum2 ? sum2.pend : 0;
  return '<div class="stats">' +
    statCard('📊', 'blue', t('attPct'), studentAttPct(s), '', 'up', { suffix: '%' }) +
    statCard('💰', 'green', t('feeSt'), pendAmt, '', pendAmt ? 'down' : 'up', { prefix: '₹' }) +
    statCard('📝', 'orange', t('latestExam'), lex ? lex.pct : 0, lex ? lex.name : '', 'up', { suffix: '%' }) +
    statCard('📚', 'red', t('hwPending'), hwPend, '', 'up') +
    '</div>' +
    '<div class="card">' + kv(t('fGuardian'), esc(s.guardian)) + kv(t('fPhone'), esc(s.phone)) + kv(t('fAdmNo'), esc(s.admissionNo || '—')) + kv(t('thEnr'), esc(s.enr || '—')) + kv(t('fAdmDate'), esc(s.admissionDate || '—')) + kv(t('fSession'), esc(s.session || '—')) + kv(t('thStatus'), esc(s.status || 'Active')) + '</div>';
}
function setParentPin(id) {
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s || state.role !== 'school') return;
  var v = digitsOnly($('fParentPinNew') ? $('fParentPinNew').value : '');
  if (v.length < 4 || v.length > 6) { toast(t('tPinLen')); return; }
  s.parentPin = v;
  logAudit('Parent PIN set', s.name + ' • ' + (s.admissionNo || '') + ' • ' + s.cls);
  saveDB(db); renderPage();
  toast(t('tPinSet'));
}
function clearParentPin(id) {
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s || state.role !== 'school') return;
  s.parentPin = '';
  logAudit('Parent PIN cleared', s.name + ' • ' + (s.admissionNo || '') + ' • ' + s.cls);
  saveDB(db); renderPage();
  toast(t('tPinCleared'));
}
function deleteStudent(id) {
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) return;
  // Soft delete only: the record and ALL of its history (fees, marks,
  // attendance, homework) are kept. Nothing is ever hard-deleted here.
  confirmModal(t('softDelMsg') + ' — ' + s.name + '?', function () {
    s.status = 'Cancelled';
    logAudit('Student removed', s.name + ' • ' + (s.admissionNo || '') + ' • ' + s.cls + ' (soft delete — record kept)');
    saveDB(db); renderApp();
    toast(t('tStudentRemoved'));
  });
}
function attendancePage() {
  if (!state.attDate) state.attDate = todayIST();
  var cls = state.attCls;
  var roster = db.students.filter(function (s) { return s.cls === cls; });
  var key = state.attDate + '|' + cls;
  var recs = db.attendance[key] || {};
  var rows = roster.map(function (s) {
    var cur = recs[s.id] || 'Present';
    return '<tr><td><b>' + esc(s.name) + '</b></td><td>' + s.roll + '</td><td><div class="mark-btns">' +
      ['Present', 'Absent', 'Late'].map(function (m) {
        return '<button class="' + m[0].toLowerCase() + (cur === m ? ' on' : '') + '" onclick="markAtt(\'' + s.id + '\',\'' + m + '\')">' + (m === 'Present' ? t('presBtn') : m === 'Absent' ? t('absBtn') : t('lateBtn')) + '</button>';
      }).join('') + '</div></td></tr>';
  }).join('');
  var counts = { Present: 0, Absent: 0, Late: 0 };
  roster.forEach(function (s) { counts[recs[s.id] || 'Present']++; });
  var clsOpts = CLASSES.map(function (c) { return '<option ' + (cls === c ? 'selected' : '') + '>' + c + '</option>'; }).join('');
  var ta = todayAtt();
  return '<div class="page-head"><div><h2>' + t('attendance') + '</h2><p>Class ' + esc(cls) + ' • ' + esc(state.attDate) + ' — ' + counts.Present + ' ' + t('presBtn') + ', ' + counts.Absent + ' ' + t('absBtn') + ', ' + counts.Late + ' ' + t('lateBtn') + '</p></div>' +
    '<div class="toolbar"><select onchange="state.attCls=this.value;renderPage()">' + clsOpts + '</select>' +
    '<input type="date" value="' + esc(state.attDate) + '" max="' + todayIST() + '" onchange="onAttDate(this.value)" style="min-width:160px">' +
    '<button class="btn green" onclick="saveAttendance()">✓ ' + t('saveAttendance') + '</button></div></div>' +
    '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('thStudent') + '</th><th>' + t('thRoll') + '</th><th>' + t('thStatus') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<p class="muted" style="margin-top:12px">School-wide today: ' + num(ta.present) + ' Present • ' + num(ta.absent) + ' Absent • ' + num(ta.late) + ' Late (' + donutPct(ta.present, ta.total) + '% attendance).</p></div>';
}
function onAttDate(v) {
  if (v > todayIST()) { toast(t('tFutureDate')); state.attDate = todayIST(); }
  else state.attDate = v;
  renderPage();
}
function markAtt(id, m) {
  var key = state.attDate + '|' + state.attCls;
  if (!db.attendance[key]) db.attendance[key] = {};
  db.attendance[key][id] = m;
  saveDB(db); // autosave — marks are never lost on page change
  renderPage();
}
function saveAttendance() {
  var key = state.attDate + '|' + state.attCls;
  var recs = db.attendance[key] || {};
  // v25: attendance saves go to the audit log too, so the full Activity
  // Log shows them. Recent Activities keeps its own db.activities entry
  // (addActivity below) — one save = one entry in each list, never two
  // in either. Counts use the same Present-default as the page itself.
  var counts = { Present: 0, Absent: 0, Late: 0 };
  db.students.filter(function (s) { return s.cls === state.attCls; }).forEach(function (s) {
    var m = recs[s.id] || 'Present';
    if (m === 'Present') counts.Present++; else if (m === 'Absent') counts.Absent++; else counts.Late++;
  });
  logAudit('Attendance updated', 'Class ' + state.attCls + ' • ' + state.attDate + ' • ' + counts.Present + ' Present, ' + counts.Absent + ' Absent, ' + counts.Late + ' Late');
  addActivity('✅', 'blue', 'Attendance updated', 'Class ' + state.attCls);
  saveDB(db);
  toast('✓ ' + t('tAttSaved') + ' — Class ' + state.attCls + ' (' + state.attDate + ').');
}
function feesPage() {
  if (state.collectStudent) return collectFeePage(state.collectStudent);
  if (state.feeStudent) return studentFeeProfile(state.feeStudent);
  var ft = feeTotals(), f = state.feeFilter, ty = state.feeType;
  var list = feeFiltered();
  var bt = feeTypeTotals();
  var btRows = Object.keys(bt).sort(function (a, b) { return (bt[b].collected + bt[b].pending) - (bt[a].collected + bt[a].pending); }).map(function (ty2) {
    return '<div class="type-row"><b>' + esc(feeTypeLabel(ty2)) + '</b><span>' + t('collectedW') + ' ' + inr(bt[ty2].collected) + ' • ' + t('pendingW') + ' ' + inr(bt[ty2].pending) + '</span></div>';
  }).join('');
  var typeOpts = ['All'].concat(feeAllTypes()).map(function (x) {
    return '<option value="' + esc(x) + '" ' + (ty === x ? 'selected' : '') + '>' + (x === 'All' ? t('allTypes') : esc(feeTypeLabel(x))) + '</option>';
  }).join('');
  var rows = list.slice(0, 120).map(function (r) {
    return '<tr><td><button class="linklike" onclick="return openFeeProfile(\'' + r.studentId + '\', event)">' + esc(r.student) + '</button></td><td>' + esc(enrOf(r.studentId)) + '</td><td>' + esc(r.cls) + '</td><td>' + r.month + '</td><td>' + esc(feeTypeLabel(feeTypeOf(r))) + '</td><td>' + inr(r.amount) + '</td><td>' + esc(r.date) + '</td>' +
      '<td><span class="badge ' + (r.status === 'Collected' ? 'green' : 'orange') + '">' + r.status + '</span></td>' +
      '<td>' + (r.status === 'Pending' ? '<button class="btn green sm" onclick="openCollectFee(\'' + r.studentId + '\',\'' + r.id + '\')">' + t('collectBtn') + '</button> <button class="btn danger sm" onclick="deleteFeeRecord(\'' + r.id + '\')">' + t('deleteBtn') + '</button>' : '<span class="muted">—</span>') + '</td></tr>';
  }).join('');
  return '<div class="page-head"><div><h2>' + t('fees') + '</h2><p>' + t('collectedW') + ' ' + inr(ft.collected) + ' • ' + t('pendingW') + ' ' + inr(ft.pending) + ' (' + feeRangeLabel() + ')</p></div>' +
    '<div class="toolbar"><div class="pill-tabs">' + ['All', 'Pending', 'Collected'].map(function (x) {
      return '<button class="' + (f === x ? 'on' : '') + '" onclick="state.feeFilter=\'' + x + '\';renderPage()">' + (x === 'All' ? t('allW') : x === 'Pending' ? t('pendingW') : t('collectedW')) + '</button>';
    }).join('') + '</div>' +
    '<select onchange="state.feeType=this.value;renderPage()" aria-label="Fee type">' + typeOpts + '</select>' +
    '<input id="feeSearchInput" placeholder="' + t('searchFee') + '" value="' + esc(state.feeSearch) + '" oninput="state.feeSearch=this.value;filterFees(this.value)" style="min-width:200px">' +
    '<button class="btn ghost" onclick="printFeeList()">🖨 ' + t('printList') + '</button></div></div>' +
    '<div class="stats">' +
    statCard('💰', 'orange', t('feeCollected'), ft.collected, '', 'up', { prefix: '₹' }) +
    statCard('⏰', 'red', t('pendingFee'), ft.pending, '', 'down', { prefix: '₹' }) +
    '</div>' +
    '<div class="card"><h3>' + t('feeByType') + '</h3><p class="card-sub">' + t('feeByTypeSub') + '</p><div class="type-rows">' + (btRows || '<div class="empty">' + t('tNoFeeRecs') + '</div>') + '</div></div>' +
    '<div class="card"><h3>' + t('feeTrend') + '</h3><p class="card-sub">' + feeRangeLabel() + ' (' + t('collectedW') + ' / ' + t('pendingW') + ')</p><div class="chart-box">' + barChartSVG(feeChartData()) + '</div><p class="muted" style="margin-top:8px"><span style="color:' + BLUE + '">■</span> ' + t('collectedW') + ' &nbsp; <span style="color:' + ORANGE + '">■</span> ' + t('pendingW') + '</p></div>' +
    '<div class="card"><div class="tbl-wrap fee-list-tbl"><table><thead><tr><th>' + t('thStudent') + '</th><th>' + t('thEnr') + '</th><th>' + t('thClass') + '</th><th>' + t('thMonth') + '</th><th>' + t('thType') + '</th><th>' + t('thAmount') + '</th><th>' + t('thDate') + '</th><th>' + t('thStatus') + '</th><th>' + t('thAction') + '</th></tr></thead><tbody id="feeBody">' +
    (rows || '<tr><td colspan="9"><div class="empty">' + t('tNoMatch') + '</div></td></tr>') + '<tr id="feeNoMatch" style="display:none"><td colspan="9"><div class="empty">' + t('tNoMatch') + '</div></td></tr></tbody></table></div>' +
    '<p class="muted" id="feeCount" style="margin-top:10px">' + t('showingRec') + ' ' + Math.min(120, list.length) + ' ' + t('ofRec') + ' ' + list.length + ' ' + t('recordsWord') + '</p></div>' +
    feeFormCard() + feeStructureCard();
}

/* ================= student fee profile ================= */
function openFeeProfile(sid, e) {
  if (e) e.preventDefault();
  state.feeStudent = sid; state.collectStudent = null; state.collectRecordId = null; state.savedReceiptId = null; collectDraft = null;
  persistSession();
  histPush({ view: 'fees', sub: 'profile:' + sid });
  renderPage();
  return false;
}
function openAddFeeFor(sid) {
  state.feeStudent = null; state.feeFormOpen = true; state.feePreselect = sid;
  renderApp();
}
function studentFeeProfile(sid) {
  var sum = feeSummaryFor(sid);
  if (!sum) { state.feeStudent = null; return feesPage(); }
  var s = sum.s, recs = sum.recs, billed = sum.billed, paid = sum.paid, pend = sum.pend, byType = sum.byType;
  var btRows = Object.keys(byType).map(function (ty2) {
    return '<div class="type-row"><b>' + esc(feeTypeLabel(ty2)) + '</b><span>' + t('collectedW') + ' ' + inr(byType[ty2].collected) + ' • ' + t('pendingW') + ' ' + inr(byType[ty2].pending) + '</span></div>';
  }).join('');
  var rows = recs.map(function (r) {
    return '<tr><td>' + r.month + '</td><td>' + esc(feeTypeLabel(feeTypeOf(r))) + '</td><td>' + inr(r.amount) + '</td><td>' + esc(r.date) + '</td>' +
      '<td><span class="badge ' + (r.status === 'Collected' ? 'green' : 'orange') + '">' + r.status + '</span></td>' +
      '<td>' + (r.status === 'Pending' ? '<button class="btn green sm" onclick="openCollectFee(\'' + s.id + '\',\'' + r.id + '\')">' + t('collectBtn') + '</button> <button class="btn danger sm" onclick="deleteFeeRecord(\'' + r.id + '\')">' + t('deleteBtn') + '</button>' : '<span class="muted">—</span>') + '</td></tr>';
  }).join('');
  return '<div class="page-head"><div class="prof-head">' + avatarHTML(s.photo, s.name, 'big-avatar') + '<div><h2>' + esc(s.name) + '</h2><p>' + t('thClass') + ' ' + esc(s.cls) + ' • ' + t('thEnr') + ' ' + esc(s.enr || '—') + ' • ' + t('thGuardian') + ' ' + esc(s.guardian) + ' • ' + t('thPhone') + ' ' + esc(s.phone) + '</p><p class="muted">' + t('feeProfileSub') + '</p></div></div>' +
    '<div class="toolbar"><button class="btn ghost" onclick="backFromFeeProfile()">← ' + t('backFees') + '</button>' +
    '<button class="btn green" onclick="openCollectFee(\'' + s.id + '\')">💰 ' + t('collectFeeBtn') + '</button>' +
    '<button class="btn" onclick="openAddFeeFor(\'' + s.id + '\')">+ ' + t('addFee') + '</button>' +
    '<button class="btn ghost" onclick="printStudentStatement(\'' + s.id + '\')">🖨 ' + t('printStmt') + '</button></div></div>' +
    '<div class="stats">' +
    statCard('🧾', 'blue', t('totalBilled'), billed, '', 'up', { prefix: '₹' }) +
    statCard('✅', 'green', t('totalPaid'), paid, '', 'up', { prefix: '₹' }) +
    statCard('⏰', 'red', t('totalPending'), pend, '', 'down', { prefix: '₹' }) +
    '</div>' +
    '<div class="card"><h3>' + t('feeByType') + '</h3><p class="card-sub">' + t('feeByTypeSub') + '</p><div class="type-rows">' + (btRows || '<div class="empty">' + t('tNoFeeRecs') + '</div>') + '</div></div>' +
    '<div class="card"><h3>' + t('feeRecsH') + '</h3><p class="card-sub">' + recs.length + ' ' + t('recordsWord') + '</p><div class="tbl-wrap fee-prof-tbl"><table><thead><tr><th>' + t('thMonth') + '</th><th>' + t('thType') + '</th><th>' + t('thAmount') + '</th><th>' + t('thDate') + '</th><th>' + t('thStatus') + '</th><th>' + t('thAction') + '</th></tr></thead><tbody>' + (rows || '<tr><td colspan="6"><div class="empty">' + t('tNoFeeRecs') + '</div></td></tr>') + '</tbody></table></div></div>' +
    receiptListCard(sid);
}
function receiptListCard(sid) {
  var rcs = (db.receipts || []).filter(function (r) { return r.studentId === sid; }).slice().reverse();
  var rcRows = rcs.map(function (r) {
    return '<tr><td>' + esc(r.receiptNo) + '</td><td>' + esc(r.date) + '</td><td>' + esc(payModeLabel(r.payMode)) + '</td><td>' + inr(r.total) + '</td>' +
      '<td><button class="btn sm" onclick="openSavedReceipt(\'' + esc(r.receiptNo) + '\')">' + t('rcptView') + '</button> ' +
      '<button class="btn ghost sm" onclick="printReceipt(\'' + esc(r.receiptNo) + '\')">🖨 ' + t('rcptPrint') + '</button></td></tr>';
  }).join('');
  return '<div class="card"><h3>' + t('rcptReceipts') + '</h3><p class="card-sub">' + rcs.length + ' ' + t('recordsWord') + '</p><div class="tbl-wrap"><table><thead><tr><th>' + t('rcptReceiptNo') + '</th><th>' + t('rcptDate') + '</th><th>' + t('rcptPayMode') + '</th><th>' + t('rcptTotal') + '</th><th>' + t('thAction') + '</th></tr></thead><tbody>' + (rcRows || '<tr><td colspan="5"><div class="empty">' + t('rcptNoReceipts') + '</div></td></tr>') + '</tbody></table></div></div>';
}

/* ================= manual fee + fee structure + generate ================= */
function toggleFeeForm() { state.feeFormOpen = !state.feeFormOpen; if (!state.feeFormOpen) state.feePreselect = null; renderPage(); }
function toggleCustom(selId, wrapId) {
  var s = $(selId), w = $(wrapId);
  if (s && w) w.classList.toggle('hidden', s.value !== '__custom');
}
function feeTypeSelectOpts() {
  return FEE_TYPES.map(function (x) { return '<option value="' + esc(x) + '">' + esc(feeTypeLabel(x)) + '</option>'; }).join('') + '<option value="__custom">' + t('customType') + '</option>';
}
function feeFormCard() {
  var btn = '<button class="btn ghost sm" onclick="toggleFeeForm()">' + (state.feeFormOpen ? '✕ ' + t('closeW') : '+ ' + t('addFee')) + '</button>';
  var body = '';
  if (state.feeFormOpen) {
    var stuOpts = db.students.map(function (s) {
      return '<option value="' + s.id + '" ' + (state.feePreselect === s.id ? 'selected' : '') + '>' + esc(s.name) + ' — ' + esc(s.cls) + ' (' + esc(s.enr || '') + ')</option>';
    }).join('');
    var curM = new Date().toLocaleString('en', { month: 'short' });
    if (MONTHS_ACAD.indexOf(curM) === -1) curM = 'Sep';
    var moOpts = MONTHS_ACAD.map(function (m) { return '<option ' + (m === curM ? 'selected' : '') + '>' + m + '</option>'; }).join('');
    body = '<form onsubmit="return saveFeeRecord(event)" style="margin-top:14px"><div class="form-grid">' +
      '<div><label>' + t('fStudent') + '</label><select id="fFeeStudent">' + stuOpts + '</select></div>' +
      '<div><label>' + t('fMonth') + '</label><select id="fFeeMonth">' + moOpts + '</select></div>' +
      '<div><label>' + t('fType') + '</label><select id="fFeeType" onchange="toggleCustom(\'fFeeType\',\'fFeeCustomWrap\')">' + feeTypeSelectOpts() + '</select></div>' +
      '<div><label>' + t('fAmount') + '</label><input id="fFeeAmount" type="number" min="1" step="1" placeholder="e.g. 1500" required></div>' +
      '<div><label>' + t('fStatus') + '</label><select id="fFeeStatus"><option value="Pending">' + t('pendingW') + '</option><option value="Collected">' + t('collectedW') + '</option></select></div>' +
      '<div><label>' + t('fDate') + '</label><input id="fFeeDate" type="date" value="' + todayIST() + '"></div>' +
      '<div class="full hidden" id="fFeeCustomWrap"><label>' + t('customType') + '</label><input id="fFeeCustom" placeholder="' + t('typeCustomPh') + '"></div>' +
      '</div><div class="actions" style="justify-content:flex-start"><button class="btn" type="submit">' + t('saveFeeBtn') + '</button></div></form>';
  }
  return '<div class="card"><div class="head-row"><div><h3>' + t('addFee') + '</h3><p class="card-sub">' + t('addFeeSub') + '</p></div>' + btn + '</div>' + body + '</div>';
}
function saveFeeRecord(e) {
  e.preventDefault();
  var sid = $('fFeeStudent').value;
  var s = db.students.find(function (x) { return x.id === sid; });
  if (!sid || !s) { toast(t('tPickStudent')); return false; }
  var amt = parseFloat($('fFeeAmount').value);
  if (isNaN(amt) || amt <= 0) { toast(t('tAmtPositive')); return false; }
  var ty = $('fFeeType').value;
  if (ty === '__custom') {
    ty = $('fFeeCustom').value.trim();
    if (!ty) { toast(t('tTypeRequired')); return false; }
  }
  db.feeRecords.push({ id: 'fee' + Date.now(), studentId: sid, student: s.name, cls: s.cls,
    month: $('fFeeMonth').value, type: ty, amount: amt, status: $('fFeeStatus').value, date: $('fFeeDate').value || todayIST() });
  refreshStudentFee(sid);
  state.feePreselect = null;
  saveDB(db); renderApp();
  toast('✓ ' + t('tFeeAdded'));
  return false;
}
function feeStructureCard() {
  var rows = (db.feeStructure || []).map(function (row, i) {
    return '<tr><td>' + esc(row.cls) + '</td><td>' + esc(feeTypeLabel(row.type)) + '</td>' +
      '<td><input type="number" min="0" step="50" value="' + row.amount + '" id="fsAmt-' + i + '" style="width:120px"></td>' +
      '<td><button class="btn danger sm" onclick="deleteFeeStructureRow(' + i + ')">' + t('deleteBtn') + '</button></td></tr>';
  }).join('');
  var clsOpts = CLASSES.map(function (c) { return '<option>' + c + '</option>'; }).join('');
  var moOpts = MONTHS_ACAD.map(function (m) { return '<option ' + (m === state.feeGenMonth ? 'selected' : '') + '>' + m + '</option>'; }).join('');
  var ex = feeExtras();
  return '<div class="card"><div class="head-row"><div><h3>' + t('feeStruct') + '</h3><p class="card-sub">' + t('feeStructSub') + '</p></div><button class="btn sm" onclick="saveFeeStructure()">' + t('saveStruct') + '</button></div>' +
    '<div class="tbl-wrap"><table><thead><tr><th>' + t('thClass') + '</th><th>' + t('thType') + '</th><th>' + t('fAmount') + '</th><th>' + t('thAction') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div class="rcpt-ex"><h4>' + t('rcptOtherFees') + '</h4><p class="card-sub">' + t('rcptAnnualHint') + '</p><div class="form-grid">' +
    '<div><label>' + t('rcptAdmissionFee') + ' (₹)</label><input type="number" min="0" step="50" id="fsEx-admissionFee" value="' + ex.admissionFee + '"></div>' +
    '<div><label>' + t('rcptCaution') + ' (₹)</label><input type="number" min="0" step="50" id="fsEx-cautionMoney" value="' + ex.cautionMoney + '"></div>' +
    '<div><label>' + t('rcptAnnual') + ' (₹)</label><input type="number" min="0" step="50" id="fsEx-annualCharges" value="' + ex.annualCharges + '"></div>' +
    '<div><label>' + t('rcptBusFee') + ' / ' + t('fMonth') + ' (₹)</label><input type="number" min="0" step="50" id="fsEx-transportFee" value="' + ex.transportFee + '"></div>' +
    '</div></div>' +
    '<div class="toolbar" style="margin-top:14px"><select id="fsNewCls">' + clsOpts + '</select>' +
    '<select id="fsNewType" onchange="toggleCustom(\'fsNewType\',\'fsNewCustomWrap\')">' + feeTypeSelectOpts() + '</select>' +
    '<input id="fsNewAmt" type="number" min="1" step="50" placeholder="e.g. 1500" style="max-width:130px">' +
    '<button class="btn ghost sm" onclick="addFeeStructureRow()">+ ' + t('addRow') + '</button></div>' +
    '<div class="full hidden" id="fsNewCustomWrap" style="margin-top:10px"><input id="fsNewCustom" placeholder="' + t('typeCustomPh') + '" style="max-width:260px"></div>' +
    '<div class="toolbar" style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px"><label style="margin:0">' + t('fMonth') + '</label>' +
    '<select id="fGenMonth" onchange="state.feeGenMonth=this.value">' + moOpts + '</select>' +
    '<button class="btn green" onclick="generateFees()">' + t('genFees') + '</button></div></div>';
}
function saveFeeStructure() {
  var rows = db.feeStructure || [];
  var exVals = {};
  var exKeys = ['admissionFee', 'cautionMoney', 'annualCharges', 'transportFee'];
  for (var k = 0; k < exKeys.length; k++) {
    var exInp = $('fsEx-' + exKeys[k]);
    if (!exInp || exInp.value === '' || exInp.value == null) continue; // empty input: keep the stored amount
    var exV = parseFloat(exInp.value);
    if (isNaN(exV) || exV < 0) { toast(t('tAmtPositive')); return; }
    exVals[exKeys[k]] = exV;
  }
  for (var i = 0; i < rows.length; i++) {
    var inp = $('fsAmt-' + i);
    if (!inp) continue;
    var v = parseFloat(inp.value);
    if (isNaN(v) || v < 0) { toast(t('tAmtPositive')); return; }
    rows[i].amount = v;
  }
  var ex = feeExtras();
  Object.keys(exVals).forEach(function (k) { ex[k] = exVals[k]; });
  saveDB(db); renderPage();
  toast('✓ ' + t('tStructSaved'));
}
function addFeeStructureRow() {
  var cls = $('fsNewCls').value;
  var ty = $('fsNewType').value;
  if (ty === '__custom') {
    ty = $('fsNewCustom').value.trim();
    if (!ty) { toast(t('tTypeRequired')); return; }
  }
  var amt = parseFloat($('fsNewAmt').value);
  if (isNaN(amt) || amt <= 0) { toast(t('tAmtPositive')); return; }
  if (!Array.isArray(db.feeStructure)) db.feeStructure = defaultFeeStructure();
  db.feeStructure.push({ cls: cls, type: ty, amount: amt });
  saveDB(db); renderPage();
  toast('✓ ' + t('tStructAdded'));
}
function deleteFeeStructureRow(i) {
  if (!Array.isArray(db.feeStructure) || !db.feeStructure[i]) return;
  db.feeStructure.splice(i, 1);
  saveDB(db); renderPage();
  toast(t('tStructRemoved'));
}
function deleteFeeRecord(rid) {
  // Only a PENDING record can be deleted. A Collected record is tied to a
  // receipt and is the payment's evidence, so it must stay.
  var r = db.feeRecords.find(function (x) { return x.id === rid; });
  if (!r || r.status !== 'Pending') return;
  var s = db.students.find(function (x) { return x.id === r.studentId; });
  confirmModal(t('delFeeMsg') + ' — ' + (s ? s.name + ' • ' : '') + r.month + ' • ' + feeTypeLabel(feeTypeOf(r)) + ' ' + inr(r.amount) + '?', function () {
    db.feeRecords = db.feeRecords.filter(function (x) { return x.id !== rid; });
    if (state.collectRecordId === rid) { state.collectStudent = null; state.collectRecordId = null; collectDraft = null; }
    if (s) refreshStudentFee(s.id);
    logAudit('Fee record deleted', (s ? s.name + ' (' + (s.enr || '') + ') • ' : '') + r.month + ' ' + feeTypeLabel(feeTypeOf(r)) + ' ' + inr(r.amount));
    saveDB(db); renderApp();
    toast('✓ ' + t('tFeeDeleted'));
  });
}
function generateFees() {
  var month = state.feeGenMonth;
  var sel = $('fGenMonth');
  if (sel && sel.value) month = sel.value;
  state.feeGenMonth = month;
  var existing = {};
  db.feeRecords.forEach(function (r) { if (r.month === month) existing[r.studentId + '|' + feeTypeOf(r)] = 1; });
  var made = 0, skipped = 0;
  db.students.forEach(function (s) {
    (db.feeStructure || []).forEach(function (row) {
      if (row.cls !== s.cls) return;
      var key = s.id + '|' + row.type;
      if (existing[key]) { skipped++; return; }
      db.feeRecords.push({ id: 'fee' + Date.now() + '_' + made, studentId: s.id, student: s.name, cls: s.cls,
        month: month, type: row.type, amount: row.amount, status: 'Pending', date: monthStartDate(month) });
      existing[key] = 1; made++;
    });
  });
  db.students.forEach(function (s) { s.fee = studentFeeStatus(s.id); });
  saveDB(db); renderApp();
  toast('✓ ' + made + ' ' + t('tGenRecords') + ' ' + month + ' • ' + skipped + ' ' + t('tGenSkipped') + '.');
}

/* ================= print ================= */
function printRowsToArea(title, sub, headHtml, bodyHtml, totalsHtml) {
  var printLogoHtml = db.profile.logo ? '<img class="print-logo" src="' + esc(db.profile.logo) + '" alt="">' : '';
  $('printArea').innerHTML = '<div class="print-stmt"><div class="print-head">' + printLogoHtml + '<div><h1>' + esc(db.profile.name) + '</h1><p class="muted">' + esc(db.profile.address || '') + ' • ' + esc(db.profile.phone || '') + '</p></div></div>' +
    '<h2>' + esc(title) + '</h2><p>' + sub + '</p><table><thead><tr>' + headHtml + '</tr></thead><tbody>' + bodyHtml + '</tbody></table>' + totalsHtml +
    '<p class="muted" style="margin-top:14px">' + t('printGenOn') + ' ' + todayIST() + '</p></div>';
  if (window.print) window.print();
}
function printStudentStatement(sid) {
  var s = db.students.find(function (x) { return x.id === sid; });
  if (!s) return;
  var recs = db.feeRecords.filter(function (r) { return r.studentId === sid; })
    .sort(function (a, b) { return (MONTH_NUM[a.month] || 99) - (MONTH_NUM[b.month] || 99) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0); });
  var billed = 0, paid = 0, pend = 0;
  recs.forEach(function (r) { billed += r.amount; if (r.status === 'Collected') paid += r.amount; else pend += r.amount; });
  var body = recs.map(function (r) {
    return '<tr><td>' + r.month + '</td><td>' + esc(feeTypeLabel(feeTypeOf(r))) + '</td><td>' + inr(r.amount) + '</td><td>' + esc(r.date) + '</td><td>' + r.status + '</td></tr>';
  }).join('');
  printRowsToArea(t('printTitle'), esc(s.name) + ' • ' + t('thClass') + ' ' + esc(s.cls) + ' • ' + t('thEnr') + ' ' + esc(s.enr || '—') + ' • ' + t('thGuardian') + ' ' + esc(s.guardian),
    '<th>' + t('thMonth') + '</th><th>' + t('thType') + '</th><th>' + t('thAmount') + '</th><th>' + t('thDate') + '</th><th>' + t('thStatus') + '</th>',
    body,
    '<div class="tot"><span>' + t('totalBilled') + ': ' + inr(billed) + '</span><span>' + t('totalPaid') + ': ' + inr(paid) + '</span><span>' + t('totalPending') + ': ' + inr(pend) + '</span></div>');
}
function printFeeList() {
  var list = feeFiltered();
  var c = 0, p = 0;
  list.forEach(function (r) { if (r.status === 'Collected') c += r.amount; else p += r.amount; });
  var body = list.slice(0, 500).map(function (r) {
    return '<tr><td>' + esc(r.student) + '</td><td>' + esc(enrOf(r.studentId)) + '</td><td>' + esc(r.cls) + '</td><td>' + r.month + '</td><td>' + esc(feeTypeLabel(feeTypeOf(r))) + '</td><td>' + inr(r.amount) + '</td><td>' + esc(r.date) + '</td><td>' + r.status + '</td></tr>';
  }).join('');
  var filt = t('fees') + ' — ' + (state.feeFilter === 'All' ? t('allW') : state.feeFilter) + ' • ' + (state.feeType === 'All' ? t('allTypes') : feeTypeLabel(state.feeType)) + (state.feeSearch ? ' • \u201c' + esc(state.feeSearch) + '\u201d' : '') + ' (' + feeRangeLabel() + ')';
  printRowsToArea(t('printListTitle'), filt,
    '<th>' + t('thStudent') + '</th><th>' + t('thEnr') + '</th><th>' + t('thClass') + '</th><th>' + t('thMonth') + '</th><th>' + t('thType') + '</th><th>' + t('thAmount') + '</th><th>' + t('thDate') + '</th><th>' + t('thStatus') + '</th>',
    body,
    '<div class="tot"><span>' + t('collectedW') + ': ' + inr(c) + '</span><span>' + t('pendingW') + ': ' + inr(p) + '</span><span>' + list.length + ' ' + t('recordsWord') + '</span></div>');
}

/* ================= Phase 3: ID cards + QR (v11) =================
   QR: Nayuki qrcodegen (MIT), vendored as qrgen.js and loaded before app.js.
   Payload: SCHOOL-SAATHI|<admissionNo>|<name>|<class>|<school>|<phone>.
   Aadhaar is NEVER in the payload, the card, or any print output. */
function idCardPayload(s) {
  return ['SCHOOL-SAATHI', (s.admissionNo || s.enr || ''), (s.name || ''), (s.cls || ''), (db.profile.name || ''), (s.phone || '')].join('|');
}
// Pure SVG render of the QR matrix (crisp at print size). Returns '' when the
// encoder is unavailable or the text cannot be encoded — never a fake image.
function qrSvgFor(text, px) {
  if (!String(text || '').trim()) return ''; // never render a QR for empty data
  if (typeof qrcodegen === 'undefined' || !qrcodegen.QrCode) return '';
  var qr;
  try { qr = qrcodegen.QrCode.encodeText(String(text || ''), qrcodegen.QrCode.Ecc.MEDIUM); }
  catch (e) { return ''; }
  var n = qr.size, border = 4, total = n + border * 2, cell = px / total;
  var rects = '';
  for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
    if (qr.getModule(x, y)) rects += '<rect x="' + ((x + border) * cell).toFixed(2) + '" y="' + ((y + border) * cell).toFixed(2) + '" width="' + cell.toFixed(2) + '" height="' + cell.toFixed(2) + '"/>';
  }
  return '<svg class="id-qr" viewBox="0 0 ' + px + ' ' + px + '" width="' + px + '" height="' + px + '" role="img" aria-label="QR code"><rect width="' + px + '" height="' + px + '" fill="#ffffff"/>' + rects + '</svg>';
}
// One student's front + back, credit-card size (85.6 x 54 mm), navy + gold.
function idCardHTML(s) {
  var logoHtml = db.profile.logo ? '<img class="id-logo-img" src="' + esc(db.profile.logo) + '" alt="">' : '<span class="id-logo-cap">🎓</span>';
  var qr = qrSvgFor(idCardPayload(s), 150);
  var qrHtml = qr || '<div class="id-qr-missing">' + t('idcNoQr') + '</div>';
  var backLines = '';
  if (s.address) backLines += '<span><b>' + t('fAddress') + ':</b> ' + esc(s.address) + '</span>';
  if (s.bloodGroup) backLines += '<span><b>' + t('fBlood') + ':</b> ' + esc(s.bloodGroup) + '</span>';
  backLines += '<span><b>' + t('idcEmergency') + ':</b> ' + esc(s.guardian || '') + ' • ' + esc(s.phone || '') + '</span>';
  return '<div class="id-sheet">' +
    '<div class="id-card id-front"><div class="id-head">' + logoHtml + '<span class="id-school">' + esc(db.profile.name) + '</span></div>' +
    '<div class="id-body">' + avatarHTML(s.photo, s.name, 'id-photo') + '<div class="id-info"><b class="id-name">' + esc(s.name) + '</b>' +
    '<span>' + t('thAdmNo') + ' ' + esc(s.admissionNo || '—') + '</span>' +
    '<span>' + t('thClass') + ' ' + esc(s.cls) + ' • ' + t('fRoll') + ' ' + s.roll + '</span>' +
    '<span>' + t('fSession') + ' ' + esc(s.session || '—') + '</span></div></div>' +
    '<div class="id-foot">' + t('fGuardian') + ': ' + esc(s.guardian || '') + ' • ' + esc(s.phone || '') + '</div></div>' +
    '<div class="id-card id-back"><div class="id-qr-wrap">' + qrHtml + '</div><div class="id-back-info">' + backLines +
    '<span class="id-return">' + t('idcReturn') + ' ' + esc(db.profile.name) + '</span></div></div></div>';
}
function idCardsPrintHTML(ids) {
  return (ids || []).map(function (id) {
    var s = db.students.find(function (x) { return x.id === id; });
    return s ? idCardHTML(s) : '';
  }).join('');
}
// Print preview modal: shows the count + the exact cards, then prints via #printArea.
function openIdCardPreview(ids) {
  ids = (ids || []).filter(function (id) { return canViewStudent(id); });
  if (!ids.length) { toast(t('tParentScope')); return; }
  var list = (ids || []).map(function (id) { return db.students.find(function (x) { return x.id === id; }); }).filter(function (s) { return !!s; });
  if (!list.length) { toast(t('promoNoSelect')); return; }
  pendingIdPrint = list.map(function (s) { return s.id; });
  openModal('<h3>' + t('idcPreview') + '</h3><p class="muted">' + list.length + ' ' + t('idcReady') + '</p>' +
    '<div class="id-preview">' + list.map(function (s) { return idCardHTML(s); }).join('') + '</div>' +
    '<div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button>' +
    '<button type="button" class="btn" onclick="printIdCardsNow()">🖨 ' + t('idcPrint') + '</button></div>', true);
}
function printIdCardsNow() {
  if (!pendingIdPrint.length) { closeModal(); return; }
  var n = pendingIdPrint.length;
  closeModal();
  $('printArea').innerHTML = '<div class="id-print">' + idCardsPrintHTML(pendingIdPrint) + '</div>';
  if (window.print) window.print();
  toast(n + ' ' + t('idcReady'));
}
function printIdCard(id) { openIdCardPreview([id]); }
function printIdCardsBulk() {
  var ids = Object.keys(state.stuSel || {});
  if (!ids.length) { toast(t('promoNoSelect')); return; }
  openIdCardPreview(ids);
}
function toggleStuSel(id, checked) {
  if (!state.stuSel) state.stuSel = {};
  if (checked) state.stuSel[id] = true; else delete state.stuSel[id];
  renderPage();
}
function toggleStuSelAll(checked) {
  if (!state.stuSel) state.stuSel = {};
  stuPageRows(stuSorted(stuFiltered())).forEach(function (s) {
    if (checked) state.stuSel[s.id] = true; else delete state.stuSel[s.id];
  });
  renderPage();
}
function clearStuSel() { state.stuSel = {}; renderPage(); }
function stuSelCount() { return Object.keys(state.stuSel || {}).length; }
function collectFee(id) {
  var r = db.feeRecords.find(function (x) { return x.id === id; });
  if (!r || r.status !== 'Pending') return;
  r.status = 'Collected';
  logAudit('Fee collected', r.student + ' • ' + inr(r.amount));
  addActivity('💰', 'green', 'New fee payment received', 'by ' + r.student + ' • ' + inr(r.amount));
  saveDB(db); renderApp();
  toast('✓ ' + inr(r.amount) + ' ' + t('tCollectedFrom') + ' ' + r.student + '.');
}

/* ================= Phase 5: fee collection receipt (v13) =================
   Modelled on the DPS fee receipt the user sent: school header, FEE RECEIPT
   title, Receipt No / Date / Adm No / Session / Name / Class / Installment /
   CounterNo, lines table (Sl.No, Description, Due, Con, Paid), PAY MODE
   INFORMATION, Total in Words, QR, computer-generated line, PARENT COPY —
   plus the student's photo and a Collector's Signature block (user's ask).
   Lines auto-fill from real data; every Due / Con / Paid cell is editable.
   Aadhaar is NEVER on the receipt. */
var PAY_MODES = ['Cash', 'Cheque', 'UPI', 'Card', 'Bank Transfer'];
function payModeLabel(m) {
  var k = { 'Cash': 'payModeCash', 'Cheque': 'payModeCheque', 'UPI': 'payModeUpi', 'Card': 'payModeCard', 'Bank Transfer': 'payModeBank' }[m];
  return k ? t(k) : m;
}
function collectMonthDefault() {
  var curM = new Date().toLocaleString('en', { month: 'short' });
  return MONTHS_ACAD.indexOf(curM) === -1 ? 'Sep' : curM;
}
function tuitionForClass(cls) {
  var row = (db.feeStructure || []).find(function (r) { return r.cls === cls && r.type === 'Tuition'; });
  if (row) return row.amount;
  var part = classPartOf(cls);
  var row2 = (db.feeStructure || []).find(function (r) { return classPartOf(r.cls) === part && r.type === 'Tuition'; });
  return row2 ? row2.amount : 0;
}
function hasCollectedType(sid, type, session) {
  return db.feeRecords.some(function (r) {
    if (r.studentId !== sid || feeTypeOf(r) !== type || r.status !== 'Collected') return false;
    if (session) return sessionOfDate(r.date) === session;
    return true;
  });
}
function busDefault(sid) {
  return db.feeRecords.some(function (r) { return r.studentId === sid && feeTypeOf(r) === 'Transport'; });
}
// Auto-fill the receipt lines for a student + month. includeBus (default:
// a Transport record already exists for the student) controls the bus row.
function buildCollectLines(sid, prefRecordId, month, includeBus) {
  var s = db.students.find(function (x) { return x.id === sid; });
  if (!s) return [];
  var ex = feeExtras();
  var lines = [], linked = {};
  var pref = prefRecordId ? db.feeRecords.find(function (r) { return r.id === prefRecordId && r.studentId === sid; }) : null;
  if (pref) month = pref.month;
  var sess = s.session || currentSession();
  if (includeBus === undefined) includeBus = busDefault(sid);
  function addLine(key, desc, type, mo, due, recordId, kind) {
    lines.push({ key: key, desc: desc, type: type, month: mo, due: due, con: 0, paid: due, recordId: recordId || '', kind: kind });
    if (recordId) linked[recordId] = 1;
  }
  // Current-period tuition: pending record amount wins, else structure amount;
  // already Collected for this month -> nothing to collect, row omitted.
  var tuRec = db.feeRecords.find(function (r) { return r.studentId === sid && r.month === month && feeTypeOf(r) === 'Tuition' && r.status === 'Pending'; });
  var tuCol = !tuRec && db.feeRecords.some(function (r) { return r.studentId === sid && r.month === month && feeTypeOf(r) === 'Tuition' && r.status === 'Collected'; });
  var tuAmt = tuRec ? tuRec.amount : (tuCol ? 0 : tuitionForClass(s.cls));
  if (tuAmt > 0) addLine('tuition', t('rcptTuitionFee') + ' (' + month + ')', 'Tuition', month, tuAmt, tuRec ? tuRec.id : '', 'tuition');
  // One-time fees: only while the school charges them AND none collected yet.
  if (ex.admissionFee > 0 && !hasCollectedType(sid, 'Admission')) {
    var aRec = db.feeRecords.find(function (r) { return r.studentId === sid && feeTypeOf(r) === 'Admission' && r.status === 'Pending'; });
    addLine('admission', t('rcptAdmissionFee'), 'Admission', month, aRec ? aRec.amount : ex.admissionFee, aRec ? aRec.id : '', 'onetime');
  }
  if (ex.cautionMoney > 0 && !hasCollectedType(sid, 'Caution Money')) {
    var cRec = db.feeRecords.find(function (r) { return r.studentId === sid && feeTypeOf(r) === 'Caution Money' && r.status === 'Pending'; });
    addLine('caution', t('rcptCaution'), 'Caution Money', month, cRec ? cRec.amount : ex.cautionMoney, cRec ? cRec.id : '', 'onetime');
  }
  if (ex.annualCharges > 0 && !hasCollectedType(sid, 'Annual Charges', sess)) {
    var anRec = db.feeRecords.find(function (r) { return r.studentId === sid && feeTypeOf(r) === 'Annual Charges' && r.status === 'Pending' && sessionOfDate(r.date) === sess; });
    addLine('annual', t('rcptAnnual'), 'Annual Charges', month, anRec ? anRec.amount : ex.annualCharges, anRec ? anRec.id : '', 'onetime');
  }
  // Bus / transport: only when the checkbox is on (default: a Transport
  // record already exists for the student).
  if (ex.transportFee > 0 && includeBus) {
    var trRec = db.feeRecords.find(function (r) { return r.studentId === sid && r.month === month && feeTypeOf(r) === 'Transport' && r.status === 'Pending'; });
    addLine('transport', t('rcptBusFee') + ' (' + month + ')', 'Transport', month, trRec ? trRec.amount : ex.transportFee, trRec ? trRec.id : '', 'transport');
  }
  // Previous dues: one row per Pending record not already linked above.
  db.feeRecords.filter(function (r) { return r.studentId === sid && r.status === 'Pending' && !linked[r.id]; })
    .sort(function (a, b) { return (MONTH_NUM[a.month] || 99) - (MONTH_NUM[b.month] || 99) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0); })
    .forEach(function (r) {
      addLine('dues-' + r.id, t('rcptDues') + ' — ' + r.month + ' ' + feeTypeLabel(feeTypeOf(r)), feeTypeOf(r), r.month, r.amount, r.id, 'dues');
    });
  return lines;
}
function reapplyLineEdits(oldLines, newLines) {
  newLines.forEach(function (nl) {
    var o = (oldLines || []).find(function (x) { return x.key === nl.key; });
    if (o) { nl.due = o.due; nl.con = o.con; nl.paid = o.paid; }
  });
}
function newCollectDraft(sid, recordId) {
  var month = collectMonthDefault();
  var pref = recordId ? db.feeRecords.find(function (r) { return r.id === recordId; }) : null;
  if (pref) month = pref.month;
  return { studentId: sid, month: month, counterNo: 'COUNTER-1', payMode: 'Cash', payDate: todayIST(), bank: '', number: '', lines: buildCollectLines(sid, recordId, month), busIncluded: busDefault(sid) };
}
function openCollectFee(sid, recordId) {
  if (state.role !== 'school') return;
  var s = db.students.find(function (x) { return x.id === sid; });
  if (!s || !canViewStudent(sid)) return;
  if (s.status === 'Cancelled' || s.status === 'Draft') { toast(t('tCollectNotActive')); return; }
  state.collectStudent = sid; state.collectRecordId = recordId || null; state.savedReceiptId = null;
  state.view = 'fees'; state.feeStudent = sid;
  collectDraft = newCollectDraft(sid, recordId);
  persistSession();
  histPush({ view: 'fees', sub: 'collect:' + sid + (recordId ? ':' + recordId : '') });
  renderPage();
}
function cancelCollectFee() {
  if (histBack()) return; // the collect entry pops, landing back where it was opened from
  state.collectStudent = null; state.collectRecordId = null; state.savedReceiptId = null; collectDraft = null;
  renderPage();
}
// Read the on-screen inputs back into the draft. Missing / empty inputs
// (e.g. harness stubs) keep the draft value — never wipe it.
function readCollectInputs() {
  var d = collectDraft; if (!d) return;
  var m = $('rcptMonth'); if (m && m.value) d.month = m.value;
  var c = $('rcptCounter'); if (c && c.value.trim()) d.counterNo = c.value.trim();
  var pm = $('rcptPayMode'); if (pm && pm.value) d.payMode = pm.value;
  var pd = $('rcptPayDate'); if (pd && pd.value) d.payDate = pd.value;
  var bk = $('rcptBank'); if (bk) d.bank = bk.value || '';
  var nb = $('rcptNumber'); if (nb) d.number = nb.value || '';
  d.lines.forEach(function (ln) {
    var dv = $('rcptDue-' + ln.key), cv = $('rcptCon-' + ln.key), pv = $('rcptPaid-' + ln.key), v;
    if (dv) { v = parseFloat(dv.value); if (!isNaN(v) && v >= 0) ln.due = v; }
    if (cv) { v = parseFloat(cv.value); if (!isNaN(v) && v >= 0) ln.con = v; }
    if (pv) { v = parseFloat(pv.value); if (!isNaN(v) && v >= 0) ln.paid = v; }
  });
}
function collectDraftTotal(d) { var tot = 0; (d.lines || []).forEach(function (ln) { tot += +ln.paid || 0; }); return tot; }
function collectTotalsUpdate() {
  var d = collectDraft; if (!d) return;
  var tot = collectDraftTotal(d);
  var t1 = $('collectTotal'), t2 = $('payModeTotal'), t3 = $('totalWords');
  if (t1) t1.textContent = inr(tot);
  if (t2) t2.textContent = inr(tot);
  if (t3) t3.textContent = numberToWords(tot);
  var qr = $('rcptQr');
  if (qr) {
    var s = db.students.find(function (x) { return x.id === d.studentId; });
    var svg = qrSvgFor(receiptPayload(nextReceiptNo(true), s, tot), 120);
    if (svg) qr.innerHTML = svg;
  }
}
// Paid defaults to Due - Con and re-computes live when Due or Con changes.
function collectLineEdit(el) {
  var d = collectDraft; if (!d) return;
  var key = el.getAttribute('data-line'), field = el.getAttribute('data-field');
  var ln = d.lines.find(function (x) { return x.key === key; });
  if (!ln) return;
  var v = parseFloat(el.value); if (isNaN(v) || v < 0) v = 0;
  if (field === 'due' || field === 'con') {
    if (field === 'due') ln.due = v; else ln.con = v;
    ln.paid = Math.max(0, ln.due - ln.con);
    var p = $('rcptPaid-' + key); if (p) p.value = ln.paid;
  } else if (field === 'paid') {
    ln.paid = Math.min(v, Math.max(0, ln.due - ln.con));
    el.value = ln.paid;
  }
  collectTotalsUpdate();
}
function collectMonthChange(sel) {
  var d = collectDraft; if (!d) return;
  readCollectInputs();
  var old = d.lines; d.month = sel.value;
  d.lines = buildCollectLines(d.studentId, state.collectRecordId, d.month, d.busIncluded);
  reapplyLineEdits(old, d.lines);
  renderPage();
}
function collectBusToggle(cb) {
  var d = collectDraft; if (!d) return;
  readCollectInputs();
  var old = d.lines; d.busIncluded = !!cb.checked;
  d.lines = buildCollectLines(d.studentId, state.collectRecordId, d.month, d.busIncluded);
  reapplyLineEdits(old, d.lines);
  renderPage();
}
function collectPayModeChange(sel) {
  var d = collectDraft; if (!d) return;
  d.payMode = sel.value;
  var show = sel.value === 'Cheque' || sel.value === 'Card' || sel.value === 'Bank Transfer';
  var br = $('rcptBankRow'); if (br) br.classList.toggle('hidden', !show);
}
function receiptPayload(receiptNo, s, total) {
  return ['SCHOOL-SAATHI', 'RECEIPT', receiptNo || '', (s && (s.admissionNo || s.enr)) || '', (s && s.name) || '', total || 0].join('|');
}
function receiptViewFromDraft(d, s) {
  var tot = collectDraftTotal(d);
  return { receiptNo: nextReceiptNo(true), date: todayIST(), month: d.month, session: s.session || currentSession(), counterNo: d.counterNo, lines: d.lines, payMode: d.payMode, payDate: d.payDate, bank: d.bank, number: d.number, total: tot, totalWords: numberToWords(tot), collector: state.user ? state.user.name : '' };
}
// One receipt renderer for the draft page, the saved view and print. Never
// includes Aadhaar (the receipt has no field for it by design).
function receiptHTML(rcpt, s, editable) {
  var logoHtml = db.profile.logo ? '<img class="rcpt-logo" src="' + esc(db.profile.logo) + '" alt="">' : '<span class="rcpt-logo-cap">🎓</span>';
  var moOpts = MONTHS_ACAD.map(function (m) { return '<option value="' + m + '" ' + (m === rcpt.month ? 'selected' : '') + '>' + m + '</option>'; }).join('');
  var meta = '<div class="rcpt-meta"><div class="rcpt-meta-grid">' +
    '<span><b>' + t('rcptReceiptNo') + '</b> : ' + esc(rcpt.receiptNo) + (editable ? ' <span class="muted">(' + t('rcptDraft') + ')</span>' : '') + '</span>' +
    '<span><b>' + t('rcptDate') + '</b> : ' + esc(rcpt.date) + '</span>' +
    '<span><b>' + t('rcptAdmNo') + '</b> : ' + esc(s.admissionNo || s.enr || '—') + '</span>' +
    '<span><b>' + t('rcptSession') + '</b> : ' + esc(rcpt.session || '') + '</span>' +
    '<span><b>' + t('rcptName') + '</b> : ' + esc(s.name) + '</span>' +
    '<span><b>' + t('rcptClass') + '</b> : ' + esc(s.cls) + '</span>' +
    '<span><b>' + t('rcptInstallment') + '</b> : ' + (editable ? '<select id="rcptMonth" onchange="collectMonthChange(this)">' + moOpts + '</select>' : esc(rcpt.month)) + '</span>' +
    '<span><b>' + t('rcptCounter') + '</b> : ' + (editable ? '<input id="rcptCounter" value="' + esc(rcpt.counterNo) + '">' : esc(rcpt.counterNo)) + '</span></div>' +
    avatarHTML(s.photo, s.name, 'rcpt-photo') + '</div>';
  var rows = rcpt.lines.map(function (ln, i) {
    if (editable) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(ln.desc) + '</td>' +
        '<td><input type="number" min="0" step="1" id="rcptDue-' + ln.key + '" data-line="' + ln.key + '" data-field="due" value="' + ln.due + '" oninput="collectLineEdit(this)"></td>' +
        '<td><input type="number" min="0" step="1" id="rcptCon-' + ln.key + '" data-line="' + ln.key + '" data-field="con" value="' + ln.con + '" oninput="collectLineEdit(this)"></td>' +
        '<td><input type="number" min="0" step="1" id="rcptPaid-' + ln.key + '" data-line="' + ln.key + '" data-field="paid" value="' + ln.paid + '" oninput="collectLineEdit(this)"></td></tr>';
    }
    return '<tr><td>' + (i + 1) + '</td><td>' + esc(ln.desc) + '</td><td>' + ln.due + '</td><td>' + ln.con + '</td><td>' + ln.paid + '</td></tr>';
  }).join('');
  var busBox = '';
  if (editable && feeExtras().transportFee > 0) {
    busBox = '<label class="check rcpt-bus"><input type="checkbox" id="rcptBus" ' + (collectDraft && collectDraft.busIncluded ? 'checked' : '') + ' onchange="collectBusToggle(this)"> ' + t('rcptIncludeBus') + '</label>';
  }
  var showBank = rcpt.payMode === 'Cheque' || rcpt.payMode === 'Card' || rcpt.payMode === 'Bank Transfer';
  var payOpts = PAY_MODES.map(function (m) { return '<option value="' + m + '" ' + (m === rcpt.payMode ? 'selected' : '') + '>' + payModeLabel(m) + '</option>'; }).join('');
  var pay = '<div class="rcpt-band">' + t('rcptPayModeTitle') + '</div><div class="rcpt-pay-grid">' +
    '<span><b>' + t('rcptPayMode') + '</b> ' + (editable ? '<select id="rcptPayMode" onchange="collectPayModeChange(this)">' + payOpts + '</select>' : esc(payModeLabel(rcpt.payMode))) + '</span>' +
    '<span><b>' + t('rcptDate') + '</b> ' + (editable ? '<input type="date" id="rcptPayDate" value="' + esc(rcpt.payDate) + '">' : esc(rcpt.payDate)) + '</span>' +
    '<span id="rcptBankRow" class="' + (showBank ? '' : 'hidden') + '"><b>' + t('rcptBank') + '</b> ' + (editable ? '<input id="rcptBank" value="' + esc(rcpt.bank || '') + '">' : esc(rcpt.bank || '—')) + '</span>' +
    '<span><b>' + t('rcptNumber') + '</b> ' + (editable ? '<input id="rcptNumber" value="' + esc(rcpt.number || '') + '">' : esc(rcpt.number || '—')) + '</span>' +
    '<span><b>' + t('rcptTotal') + '</b> <b id="payModeTotal">' + inr(rcpt.total) + '</b></span></div>';
  var qr = qrSvgFor(receiptPayload(rcpt.receiptNo, s, rcpt.total), 120);
  return '<div class="rcpt">' +
    '<div class="rcpt-head">' + logoHtml + '<div><div class="rcpt-school">' + esc(db.profile.name) + '</div><div class="rcpt-addr">' + esc(db.profile.address || '') + '</div></div></div>' +
    '<div class="rcpt-title">' + t('rcptTitle') + '</div>' +
    meta +
    '<div class="rcpt-lines"><div class="tbl-wrap rcpt-tbl"><table><thead><tr><th>' + t('rcptSlNo') + '</th><th>' + t('rcptDesc') + '</th><th>' + t('rcptDue') + '</th><th>' + t('rcptCon') + '</th><th>' + t('rcptPaid') + '</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5"><div class="empty">' + t('rcptNoLines') + '</div></td></tr>') + '</tbody></table></div></div>' +
    busBox + pay +
    '<div class="rcpt-total"><span><b>' + t('rcptTotal') + ' :</b></span><b id="collectTotal">' + inr(rcpt.total) + '</b></div>' +
    '<div class="rcpt-words"><b>' + t('rcptTotalWords') + ':</b> <span id="totalWords">' + esc(rcpt.totalWords) + '</span></div>' +
    '<div class="rcpt-foot"><div class="rcpt-qr" id="rcptQr">' + (qr || '<div class="id-qr-missing">' + t('idcNoQr') + '</div>') + '</div>' +
    '<div class="rcpt-note">' + t('rcptComputerGen') + '</div>' +
    '<div class="rcpt-sign"><div class="rcpt-sign-line"></div><div>' + t('rcptCollectorSign') + '</div><div><b>' + esc(rcpt.collector || '') + '</b></div></div></div>' +
    '<div class="rcpt-copy">' + t('rcptParentCopy') + '</div></div>';
}
function collectFeePage(sid) {
  var s = db.students.find(function (x) { return x.id === sid; });
  if (!s) { state.collectStudent = null; return feesPage(); }
  if (state.savedReceiptId) {
    var rc = (db.receipts || []).find(function (r) { return r.receiptNo === state.savedReceiptId; });
    if (rc) {
      return '<div class="page-head"><div><h2>' + t('rcptTitle') + '</h2><p>' + esc(s.name) + ' • ' + esc(s.cls) + ' • ' + esc(s.admissionNo || '') + '</p></div>' +
        '<div class="toolbar"><button class="btn ghost" onclick="backFromReceipt()">← ' + t('backFees') + '</button></div></div>' +
        receiptHTML(rc, s, false) +
        '<div class="actions"><button class="btn" onclick="printReceipt(\'' + esc(rc.receiptNo) + '\')">🖨 ' + t('rcptPrint') + '</button>' +
        '<button class="btn green" onclick="openCollectFee(\'' + s.id + '\')">' + t('rcptCollectAgain') + '</button></div>';
    }
    state.savedReceiptId = null;
  }
  var d = collectDraft;
  if (!d || d.studentId !== sid) { d = collectDraft = newCollectDraft(sid, state.collectRecordId); }
  var view = receiptViewFromDraft(d, s);
  return '<div class="page-head"><div><h2>' + t('collectFeeBtn') + '</h2><p>' + esc(s.name) + ' • ' + esc(s.cls) + ' • ' + esc(s.admissionNo || '') + '</p></div>' +
    '<div class="toolbar"><button class="btn ghost" onclick="cancelCollectFee()">← ' + t('backFees') + '</button></div></div>' +
    receiptHTML(view, s, true) +
    '<div class="actions"><button class="btn green" onclick="saveCollectFee(event)">💰 ' + t('rcptCollectSave') + '</button>' +
    '<button class="btn ghost" onclick="cancelCollectFee()">' + t('cancel') + '</button></div>';
}
function saveCollectFee(e) {
  if (e) e.preventDefault();
  var d = collectDraft; if (!d) return false;
  readCollectInputs();
  var s = db.students.find(function (x) { return x.id === d.studentId; });
  if (!s) return false;
  var total = collectDraftTotal(d);
  if (total <= 0) { toast(t('tCollectZero')); return false; }
  var receiptNo = nextReceiptNo(false);
  var today = d.payDate || todayIST();
  var savedLines = [];
  d.lines.forEach(function (ln, i) {
    var paid = +ln.paid || 0, due = +ln.due || 0, con = +ln.con || 0;
    var net = Math.max(0, due - con);
    savedLines.push({ desc: ln.desc, type: ln.type, month: ln.month, due: due, con: con, paid: paid });
    if (paid <= 0) return;
    var rec = ln.recordId ? db.feeRecords.find(function (r) { return r.id === ln.recordId; }) : null;
    if (rec) {
      if (paid >= net) { rec.status = 'Collected'; rec.amount = net; rec.date = today; }
      else {
        rec.amount = net - paid; // remainder stays Pending
        db.feeRecords.push({ id: 'fee' + Date.now() + '_' + i, studentId: s.id, student: s.name, cls: s.cls, month: ln.month, type: ln.type, amount: paid, status: 'Collected', date: today });
      }
    } else {
      db.feeRecords.push({ id: 'fee' + Date.now() + '_' + i, studentId: s.id, student: s.name, cls: s.cls, month: ln.month, type: ln.type, amount: paid, status: 'Collected', date: today });
      if (paid < net) db.feeRecords.push({ id: 'fee' + Date.now() + '_p' + i, studentId: s.id, student: s.name, cls: s.cls, month: ln.month, type: ln.type, amount: net - paid, status: 'Pending', date: today });
    }
  });
  var rc = { receiptNo: receiptNo, studentId: s.id, admissionNo: s.admissionNo || s.enr || '', name: s.name, cls: s.cls, session: s.session || currentSession(), date: today, month: d.month, counterNo: d.counterNo, lines: savedLines, payMode: d.payMode, payDate: d.payDate, bank: d.bank, number: d.number, total: total, totalWords: numberToWords(total), collector: state.user ? state.user.name : '' };
  if (!Array.isArray(db.receipts)) db.receipts = [];
  db.receipts.push(rc);
  refreshStudentFee(s.id);
  logAudit('Fee collected', s.name + ' • ' + receiptNo + ' • ₹' + total);
  addActivity('💰', 'green', 'Fee collected', s.name + ' • ' + receiptNo + ' • ' + inr(total));
  saveDB(db);
  state.savedReceiptId = receiptNo; collectDraft = null;
  histReplaceTop({ view: 'fees', sub: 'receipt:' + receiptNo }); // Back from the saved receipt goes to the fee profile, not the spent collect form
  renderApp();
  toast('✓ ' + t('tCollectSaved') + receiptNo + ' • ' + inr(total));
  return false;
}
function openSavedReceipt(receiptNo) {
  var rc = (db.receipts || []).find(function (r) { return r.receiptNo === receiptNo; });
  if (!rc) return;
  state.collectStudent = rc.studentId; state.savedReceiptId = receiptNo; state.feeStudent = rc.studentId; state.view = 'fees';
  persistSession();
  histPush({ view: 'fees', sub: 'receipt:' + receiptNo });
  renderPage();
}
function printReceipt(receiptNo) {
  var rc = (db.receipts || []).find(function (r) { return r.receiptNo === receiptNo; });
  if (!rc) return;
  var s = db.students.find(function (x) { return x.id === rc.studentId; });
  if (!s) return;
  $('printArea').innerHTML = '<div class="print-rcpt">' + receiptHTML(rc, s, false) + '</div>';
  if (window.print) window.print();
}
var PAGE_SCHOOL = { dashboard: schoolDashboard, students: studentsPage, attendance: attendancePage, fees: feesPage, exams: null, homework: null, notices: null, reports: null, settings: null };


/* ================= Phase 4: admission requests =================
   Public intake: anyone can apply from the auth screen. The request is
   saved into the chosen school's own DB on this device (static scope — no
   server, so there is no cross-device inbox yet). The school admin reviews
   it; Approve prefills the admission form, Reject keeps it in history. */
function validateAdmissionRequest(r) {
  var errs = [];
  if (!r.name) errs.push(t('tReqName'));
  if (digitsOnly(r.phone).length !== 10) errs.push(t('tInvalidMobile'));
  if (!r.classApply) errs.push(t('tReqClass'));
  return errs;
}
function saveAdmissionRequestToSchool(dbKey, req) {
  var d = readDbByKey(dbKey);
  if (!d) return false;
  migrateV12(d);
  d.admissionRequests.push(req);
  writeDbByKey(dbKey, d);
  if (DB_KEY === dbKey) db = d; // keep the in-memory DB in sync
  return true;
}
function openAdmissionApply() {
  var schools = loadAccounts().filter(function (a) { return a.role === 'school'; }).filter(function (a) { return !!readDbByKey(dbKeyFor(a)); });
  var schOpts = schools.map(function (a) { return '<option value="' + esc(dbKeyFor(a)) + '">' + esc(a.school) + '</option>'; }).join('');
  var clsOpts = classParts().map(function (c) { return '<option>' + c + '</option>'; }).join('');
  var genOpts = [''].concat(GENDERS).map(function (g) { return '<option value="' + g + '">' + (g || '—') + '</option>'; }).join('');
  openModal('<h3>' + t('admReqFormTitle') + '</h3>' +
    (schools.length ? '' : '<p class="err">' + t('admReqNoSchool') + '</p>') +
    '<form onsubmit="return saveAdmissionRequest(event)"><div class="form-grid">' +
    '<div class="full"><label>' + t('admReqSchool') + '</label><select id="fArSchool">' + schOpts + '</select></div>' +
    '<div><label>' + t('fStudentName') + ' *</label><input id="fArName" required placeholder="e.g. Aarav Kumar"></div>' +
    '<div><label>' + t('fDob') + '</label><input id="fArDob" type="date"></div>' +
    '<div><label>' + t('fGender') + '</label><select id="fArGender">' + genOpts + '</select></div>' +
    '<div><label>' + t('admReqClassApply') + ' *</label><select id="fArClass">' + clsOpts + '</select></div>' +
    '<div><label>' + t('fGuardian') + '</label><input id="fArGuardian" placeholder="Mr. Sharma"></div>' +
    '<div><label>' + t('fPhone') + ' *</label><input id="fArPhone" inputmode="numeric" placeholder="98XXXXXXXX"></div>' +
    '<div class="full"><label>' + t('fPrevSchool') + '</label><input id="fArPrevSchool" placeholder="Previous school (if any)"></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button>' +
    '<button class="btn" type="submit" ' + (schools.length ? '' : 'disabled') + '>' + t('admReqApply') + '</button></div></form>', true);
}
function saveAdmissionRequest(e) {
  e.preventDefault();
  var req = { id: 'ar' + Date.now(), name: ($('fArName') ? $('fArName').value : '').trim(),
    dob: $('fArDob') ? $('fArDob').value : '', gender: $('fArGender') ? $('fArGender').value : '',
    classApply: $('fArClass') ? $('fArClass').value : '', guardianName: ($('fArGuardian') ? $('fArGuardian').value : '').trim(),
    phone: ($('fArPhone') ? $('fArPhone').value : '').trim(), previousSchool: ($('fArPrevSchool') ? $('fArPrevSchool').value : '').trim(),
    status: 'Pending', reason: '', submitted: todayIST(), studentId: '' };
  var errs = validateAdmissionRequest(req);
  if (errs.length) { toast(errs.join(' ')); return false; }
  var key = $('fArSchool') ? $('fArSchool').value : '';
  if (!key || !saveAdmissionRequestToSchool(key, req)) { toast(t('tAdmReqFailed')); return false; }
  // Also send to the server when this school is already backed up there.
  // Fire-and-forget: the local save above is the source of truth, so a
  // failed server post never blocks the application.
  try {
    var map = sbServerSchoolMap();
    var acct = loadAccounts().filter(function (x) { return dbKeyFor(x) === key; })[0];
    var sid = acct && map[acct.uid];
    if (sid && sbIsOnline()) sbPostAdmission(sid, req).catch(function () {});
  } catch (e2) {}
  closeModal();
  toast(t('admReqSubmitted'));
  return false;
}
function admissionRequestsPage() {
  var list = (db.admissionRequests || []).slice().sort(function (a, b) { return a.submitted < b.submitted ? 1 : -1; });
  var f = state.admReqFilter || 'All';
  var shown = list.filter(function (r) { return f === 'All' || r.status === f; });
  var counts = { Pending: 0, Approved: 0, Rejected: 0 };
  list.forEach(function (r) { if (counts[r.status] != null) counts[r.status]++; });
  var rows = shown.map(function (r) {
    var badge = r.status === 'Pending' ? 'orange' : r.status === 'Approved' ? 'green' : 'red';
    return '<tr><td><b>' + esc(r.name) + '</b></td><td>' + esc(r.dob || '—') + '</td><td>' + esc(r.classApply) + '</td><td>' + esc(r.guardianName || '—') + '</td><td>' + esc(r.phone) + '</td><td>' + esc(r.submitted) + '</td>' +
      '<td><span class="badge ' + badge + '">' + t('admReq' + r.status) + '</span></td>' +
      '<td><div class="row-actions"><button class="btn ghost sm" onclick="viewAdmissionRequest(\'' + r.id + '\')">' + t('admReqView') + '</button>' +
      (r.status === 'Pending' ? '<button class="btn green sm" onclick="approveAdmissionRequest(\'' + r.id + '\')">' + t('admReqApprove') + '</button>' +
      '<button class="btn danger sm" onclick="rejectAdmissionRequest(\'' + r.id + '\')">' + t('admReqReject') + '</button>' : '') +
      '</div></td></tr>';
  }).join('');
  var fOpts = ['All', 'Pending', 'Approved', 'Rejected'].map(function (x) {
    var lbl = x === 'All' ? t('admReqAll') : t('admReq' + x);
    return '<option value="' + x + '" ' + (f === x ? 'selected' : '') + '>' + lbl + '</option>';
  }).join('');
  return '<div class="page-head"><div><h2>' + t('admissions') + '</h2><p>' + list.length + ' ' + t('admReqTitle') + ' — ' + counts.Pending + ' ' + t('admReqPending') + '</p></div>' +
    '<div class="toolbar"><label>' + t('admReqStatus') + '</label><select onchange="state.admReqFilter=this.value;renderPage()">' + fOpts + '</select></div></div>' +
    '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('fStudentName') + '</th><th>' + t('fDob') + '</th><th>' + t('admReqClassApply') + '</th><th>' + t('fGuardian') + '</th><th>' + t('fPhone') + '</th><th>' + t('admReqSubmittedOn') + '</th><th>' + t('admReqStatus') + '</th><th>' + t('thAction') + '</th></tr></thead>' +
    '<tbody>' + (rows || '<tr><td colspan="8"><div class="empty">' + t('admReqEmpty') + '</div></td></tr>') + '</tbody></table></div></div>';
}
function viewAdmissionRequest(id) {
  var r = (db.admissionRequests || []).find(function (x) { return x.id === id; });
  if (!r) return;
  var kv = function (label, val) { return '<div class="kv"><b>' + label + '</b><span>' + val + '</span></div>'; };
  var badge = r.status === 'Pending' ? 'orange' : r.status === 'Approved' ? 'green' : 'red';
  openModal('<h3>' + esc(r.name) + ' • ' + esc(r.classApply) + '</h3><div class="card">' +
    kv(t('fStudentName'), esc(r.name)) + kv(t('fDob'), esc(r.dob || '—')) + kv(t('fGender'), esc(r.gender || '—')) +
    kv(t('admReqClassApply'), esc(r.classApply)) + kv(t('fGuardian'), esc(r.guardianName || '—')) + kv(t('fPhone'), esc(r.phone)) +
    kv(t('fPrevSchool'), esc(r.previousSchool || '—')) + kv(t('admReqSubmittedOn'), esc(r.submitted)) +
    kv(t('admReqStatus'), '<span class="badge ' + badge + '">' + t('admReq' + r.status) + '</span>') +
    (r.status === 'Rejected' && r.reason ? kv(t('admReqReason'), esc(r.reason)) : '') +
    (r.status === 'Approved' && r.studentId ? kv(t('fAdmNo'), esc((db.students.find(function (s) { return s.id === r.studentId; }) || {}).admissionNo || '—')) : '') +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button>' +
    (r.status === 'Pending' ? '<button type="button" class="btn danger" onclick="closeModal();rejectAdmissionRequest(\'' + r.id + '\')">' + t('admReqReject') + '</button>' +
    '<button type="button" class="btn green" onclick="closeModal();approveAdmissionRequest(\'' + r.id + '\')">' + t('admReqApprove') + '</button>' : '') +
    '</div>');
}
function approveAdmissionRequest(id) {
  var r = (db.admissionRequests || []).find(function (x) { return x.id === id; });
  if (!r || r.status !== 'Pending') return;
  admPrefill = r;
  studentForm('');
}
function rejectAdmissionRequest(id) {
  var r = (db.admissionRequests || []).find(function (x) { return x.id === id; });
  if (!r || r.status !== 'Pending') return;
  openModal('<h3>' + t('admReqReject') + ' — ' + esc(r.name) + '</h3><form onsubmit="return doRejectAdmissionRequest(event,\'' + r.id + '\')"><div class="form-grid">' +
    '<div class="full"><label>' + t('admReqReason') + '</label><textarea id="fArReason" rows="3" placeholder="e.g. Seats full for this class"></textarea></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button>' +
    '<button class="btn danger" type="submit">' + t('admReqReject') + '</button></div></form>');
}
function doRejectAdmissionRequest(e, id) {
  e.preventDefault();
  var r = (db.admissionRequests || []).find(function (x) { return x.id === id; });
  if (!r) return false;
  r.status = 'Rejected';
  r.reason = ($('fArReason') ? $('fArReason').value : '').trim();
  logAudit('Admission request rejected', r.name + ' • ' + r.classApply + (r.reason ? ' • ' + r.reason : ''));
  saveDB(db); closeModal(); renderApp();
  toast(t('admReqRejected'));
  return false;
}
/* ================= exams / homework / notices / reports / settings ================= */
function examsPage() {
  var ex = db.exams.find(function (e) { return e.id === state.examId; }) || db.exams[0];
  if (!ex) return '<div class="page-head"><div><h2>' + t('exams') + '</h2></div></div><div class="card"><div class="empty">' + t('tNoExams') + '</div></div>';
  var roster = db.students.filter(function (s) { return s.cls === ex.cls; });
  var rows = roster.map(function (s) {
    var mk = db.marks.find(function (m) { return m.examId === ex.id && m.studentId === s.id; });
    return '<tr><td><b>' + esc(s.name) + '</b></td><td>' + s.roll + '</td>' +
      '<td><input type="number" min="0" step="0.5" max="' + ex.total + '" value="' + (mk ? mk.marks : '') + '" placeholder="—" style="width:90px" id="mk-' + s.id + '"> / ' + ex.total + '</td>' +
      '<td>' + (mk ? '<b>' + Math.round(mk.marks / ex.total * 100) + '%</b>' : '<span class="muted">' + t('tNotEntered') + '</span>') + '</td></tr>';
  }).join('');
  var opts = db.exams.map(function (e) { return '<option value="' + e.id + '" ' + (ex.id === e.id ? 'selected' : '') + '>' + esc(e.name) + ' — ' + esc(e.cls) + ' (' + esc(e.subject) + ')</option>'; }).join('');
  var avg = 0, n = 0;
  db.marks.forEach(function (m) { if (m.examId === ex.id) { avg += m.marks; n++; } });
  return '<div class="page-head"><div><h2>' + t('exams') + '</h2><p>' + esc(ex.name) + ' • ' + esc(ex.cls) + ' • ' + esc(ex.subject) + ' • ' + esc(ex.date) + '</p></div>' +
    '<div class="toolbar"><select onchange="state.examId=this.value;renderPage()">' + opts + '</select>' +
    '<button class="btn green" onclick="saveMarks(\'' + ex.id + '\')">✓ ' + t('saveMarks') + '</button></div></div>' +
    '<div class="card"><div class="head-row"><div><h3>' + t('enterMarks') + '</h3><p class="card-sub">' + (n ? t('classAvg') + ': ' + Math.round(avg / n / ex.total * 100) + '% (' + n + ' ' + t('studentsMarked') + ')' : t('tNoMarks')) + '</p></div></div>' +
    '<div class="tbl-wrap"><table><thead><tr><th>' + t('thStudent') + '</th><th>' + t('thRoll') + '</th><th>' + t('thMarks') + '</th><th>' + t('thResult') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}
function saveMarks(examId) {
  var ex = db.exams.find(function (e) { return e.id === examId; });
  if (!ex) return;
  var saved = 0, bad = [];
  db.students.filter(function (s) { return s.cls === ex.cls; }).forEach(function (s) {
    var inp = $('mk-' + s.id);
    if (!inp) return;
    var mkIdx = -1;
    db.marks.forEach(function (m, i) { if (m.examId === examId && m.studentId === s.id) mkIdx = i; });
    if (inp.value === '') {
      if (mkIdx !== -1) { db.marks.splice(mkIdx, 1); saved++; } // empty = remove marks
      return;
    }
    var v = parseFloat(inp.value);
    if (isNaN(v) || v < 0) { bad.push(s.name + ' (invalid)'); return; }
    if (v > ex.total) { bad.push(s.name + ' (over ' + ex.total + ')'); return; } // never silently clamp
    if (mkIdx !== -1) db.marks[mkIdx].marks = v; else db.marks.push({ examId: examId, studentId: s.id, marks: v });
    saved++;
  });
  saveDB(db); renderApp();
  if (bad.length) toast(t('tNotSaved') + ': ' + bad.join(', ') + ' — ' + t('tCheckMarks') + ' (max ' + ex.total + ').');
  else if (saved) toast('✓ ' + t('tMarksSaved') + ' ' + saved + ' ' + t('tStudentsWord') + '.');
  else toast(t('tNoChanges'));
}
function meStudent() {
  if (state.role !== 'student' || !state.user) return null;
  var s = db.students.find(function (x) { return x.name === state.user.name; });
  return s || db.students[0] || null;
}
function riyaId() { var s = meStudent(); return s ? s.id : 'stu33'; }
function homeworkPage() {
  var isStudent = state.role === 'student';
  var me = meStudent();
  var myCls = me ? me.cls : '10th-A';
  var list = db.homework.filter(function (h) { return isStudent ? h.cls === myCls : true; });
  var items = list.map(function (h) {
    var done = me ? h.doneBy.indexOf(me.id) !== -1 : false;
    var box = isStudent
      ? '<input type="checkbox" ' + (done ? 'checked' : '') + ' onchange="toggleHw(\'' + h.id + '\', this.checked)" aria-label="Mark done">'
      : '';
    return '<div class="hw-item ' + (done ? 'done' : '') + '">' + box +
      '<div><b>' + esc(h.title) + '</b><span>' + esc(h.subject) + ' • Class ' + esc(h.cls) + ' • Due ' + esc(h.due) + (isStudent ? '' : ' • ' + h.doneBy.length + ' ' + t('doneSuffix')) + '</span></div></div>';
  }).join('');
  return '<div class="page-head"><div><h2>' + t('homework') + '</h2><p>' + (isStudent ? 'Class ' + esc(myCls) + ' — ' + t('tapDone') : t('subHomework')) + '</p></div>' +
    (isStudent ? '' : '<div class="toolbar"><button class="btn" onclick="homeworkForm()">+ ' + t('addHomework') + '</button></div>') + '</div>' +
    '<div class="card">' + (items || '<div class="empty">' + t('tNoHw') + '</div>') + '</div>';
}
function toggleHw(id, done) {
  if (state.role !== 'student') return; // only the student marks their own homework
  var h = db.homework.find(function (x) { return x.id === id; });
  if (!h) return;
  var me = meStudent();
  if (!me) return;
  var i = h.doneBy.indexOf(me.id);
  if (done && i === -1) h.doneBy.push(me);
  if (!done && i !== -1) h.doneBy.splice(i, 1);
  saveDB(db); renderPage();
  toast(done ? '✓ ' + t('tHwDone') : t('tHwNotDone'));
}
function homeworkForm() {
  var clsOpts = CLASSES.map(function (c) { return '<option>' + c + '</option>'; }).join('');
  var subOpts = SUBJECTS.map(function (s) { return '<option>' + s + '</option>'; }).join('');
  openModal('<h3>' + t('addHomework') + '</h3><form onsubmit="return saveHomework(event)"><div class="form-grid">' +
    '<div><label>' + t('fClass') + '</label><select id="fHwCls">' + clsOpts + '</select></div>' +
    '<div><label>' + t('fSubject') + '</label><select id="fHwSub">' + subOpts + '</select></div>' +
    '<div class="full"><label>' + t('fTitle') + '</label><input id="fHwTitle" required placeholder="e.g. Ex 5.2 — Q1 to Q10"></div>' +
    '<div><label>' + t('fDue') + '</label><input id="fHwDue" type="date" min="' + todayIST() + '" value="2026-11-12" required></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button><button class="btn" type="submit">' + t('assignHw') + '</button></div></form>');
}
function saveHomework(e) {
  e.preventDefault();
  if ($('fHwDue').value < todayIST()) { toast(t('tDueFuture')); return false; }
  db.homework.unshift({ id: 'hw' + Date.now(), cls: $('fHwCls').value, subject: $('fHwSub').value, title: $('fHwTitle').value.trim(), due: $('fHwDue').value, doneBy: [] });
  addActivity('📚', 'orange', 'Homework assigned', $('fHwSub').value + ' • Class ' + $('fHwCls').value);
  saveDB(db); closeModal(); renderApp();
  toast(t('tHwAssigned'));
  return false;
}
function noticesPage() {
  var items = db.notices.map(function (n) {
    return '<div class="notice"><b>' + esc(n.title) + '</b><span>' + esc(n.date) + '</span><p>' + esc(n.body) + '</p></div>';
  }).join('');
  var canPost = state.role !== 'student';
  return '<div class="page-head"><div><h2>' + t('notices') + '</h2><p>' + t('subNotices') + ' — ' + esc(db.profile.name) + '</p></div>' +
    (canPost ? '<div class="toolbar"><button class="btn" onclick="noticeForm()">+ ' + t('publishNotice') + '</button></div>' : '') + '</div>' +
    '<div class="card">' + items + '</div>';
}
function noticeForm() {
  openModal('<h3>' + t('publishNotice') + '</h3><form onsubmit="return saveNotice(event)"><div class="form-grid">' +
    '<div class="full"><label>' + t('fTitle') + '</label><input id="fNtTitle" required placeholder="e.g. Annual Sports Day"></div>' +
    '<div class="full"><label>' + t('fMessage') + '</label><textarea id="fNtBody" rows="3" required placeholder="Notice details…"></textarea></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button><button class="btn" type="submit">' + t('publishBtn') + '</button></div></form>');
}
function saveNotice(e) {
  e.preventDefault();
  db.notices.unshift({ id: 'n' + Date.now(), title: $('fNtTitle').value.trim(), date: todayIST(), body: $('fNtBody').value.trim() });
  addActivity('📢', 'orange', 'New notice published', $('fNtTitle').value.trim());
  saveDB(db); closeModal(); renderApp();
  toast(t('tNoticePub'));
  return false;
}
function reportsPage(role) {
  return '<div class="page-head"><div><h2>' + t('reports') + '</h2><p>' + t('subReports') + ' — ' + (role === 'super' ? t('thePlatform') : db.profile.name) + '</p></div></div>' +
  '<div class="grid2e">' +
  '<div class="card"><h3>' + t('studentsReport') + '</h3><p class="card-sub">' + t('repStudentsSub') + '</p><button class="btn" onclick="downloadReportCSV(\'students\')">⬇ ' + t('dlStudents') + '</button></div>' +
  '<div class="card"><h3>' + t('feesReport') + '</h3><p class="card-sub">' + t('repFeesSub') + '</p><button class="btn" onclick="downloadReportCSV(\'fees\')">⬇ ' + t('dlFees') + '</button></div>' +
  '<div class="card"><h3>' + t('attReport') + '</h3><p class="card-sub">Register — Class ' + state.attCls + ' • ' + (state.attDate || todayIST()) + '</p><button class="btn" onclick="downloadReportCSV(\'attendance\')">⬇ ' + t('dlAtt') + '</button></div>' +
  '<div class="card"><h3>' + t('schoolsReport') + '</h3><p class="card-sub">All ' + db.schools.length + ' ' + t('schools') + ' — ' + t('repSchoolsSub') + '</p><button class="btn" onclick="downloadReportCSV(\'schools\')">⬇ ' + t('dlSchools') + '</button></div>' +
  '</div>';
}
function downloadReportCSV(kind) {
  if (kind === 'students') {
    downloadCSV('school-saathi-students.csv', [['Name', 'Class', 'Roll', 'Guardian', 'Phone', 'Attendance %', 'Fee Status']]
      .concat(db.students.map(function (s) { return [s.name, s.cls, s.roll, s.guardian, s.phone, studentAttPct(s), studentFeeStatus(s.id)]; })));
  } else if (kind === 'fees') {
    downloadCSV('school-saathi-fees.csv', feeCSVRows());
  } else if (kind === 'attendance') {
    var aDate = state.attDate || todayIST();
    var recs = db.attendance[aDate + '|' + state.attCls] || {};
    downloadCSV('school-saathi-attendance.csv', [['Student', 'Class', 'Roll', 'Date', 'Status']]
      .concat(db.students.filter(function (s) { return s.cls === state.attCls; })
        .map(function (s) { return [s.name, s.cls, s.roll, aDate, recs[s.id] || 'Present']; })));
  } else {
    downloadCSV('school-saathi-schools.csv', [['School', 'City', 'Students', 'Users', 'Plan', 'Status']]
      .concat(db.schools.map(function (s) { return [s.name, s.city, s.students, s.users, s.plan, s.status]; })));
  }
  toast('✓ ' + t('tReportDl'));
}
function feeCSVRows() {
  return [['Student', 'Enr', 'Class', 'Month', 'Type', 'Amount (INR)', 'Date', 'Status']]
    .concat(db.feeRecords.map(function (r) { return [r.student, enrOf(r.studentId), r.cls, r.month, feeTypeOf(r), r.amount, r.date, r.status]; }));
}
function settingsPage() {
  pendingLogo = null;
  var p = db.profile, isSuper = state.role === 'super';
  return '<div class="page-head"><div><h2>' + t('settings') + '</h2><p>' + (isSuper ? t('subSettingsP') : t('subSettingsS')) + '</p></div></div>' +
  '<div class="card" style="max-width:680px"><h3>' + (isSuper ? t('platformH') : esc(p.name)) + '</h3><p class="card-sub">' + t('settingsSub') + '</p>' +
  '<form onsubmit="return saveSettings(event)"><div class="form-grid">' +
  '<div><label>' + t('fSchoolName') + '</label><input id="fPfName" value="' + esc(p.name) + '" ' + (isSuper ? 'disabled' : '') + '></div>' +
  '<div><label>' + t('fCity') + '</label><input id="fPfCity" value="' + esc(p.city) + '" ' + (isSuper ? 'disabled' : '') + '></div>' +
  '<div><label>' + t('fPrincipal') + '</label><input id="fPfPr" value="' + esc(p.principal) + '"></div>' +
  '<div><label>' + t('fPhone') + '</label><input id="fPfPh" value="' + esc(p.phone) + '"></div>' +
  '<div><label>' + t('fEmail') + '</label><input id="fPfEm" value="' + esc(p.email) + '"></div>' +
  '<div><label>' + t('fSession') + '</label><select id="fPfSe"><option ' + (p.session === '2025–26' ? 'selected' : '') + '>2025–26</option><option ' + (p.session === '2024–25' ? 'selected' : '') + '>2024–25</option><option ' + (p.session === '2026–27' ? 'selected' : '') + '>2026–27</option></select></div>' +
  '<div class="full"><label>' + t('fAddress') + '</label><input id="fPfAd" value="' + esc(p.address) + '"></div>' +
  (isSuper ? '' : '<div class="full"><label>' + t('logoLabel') + '</label><div class="photo-row"><span id="fPfLogoPrev">' + (p.logo ? '<img class="photo-prev" src="' + esc(p.logo) + '" alt="">' : '<span class="photo-prev">🎓</span>') + '</span>' +
  '<input type="file" id="fPfLogo" accept="image/*" onchange="onSchoolLogo(this)">' +
  '<button type="button" class="btn ghost sm" onclick="clearSchoolLogo()">' + t('removeLogo') + '</button></div>' +
  '<p class="muted">' + t('logoHint') + '</p></div>') +
  '</div><div class="actions" style="justify-content:flex-start"><button class="btn" type="submit">' + t('saveSettingsBtn') + '</button>' +
  '<button type="button" class="btn danger" onclick="resetAllData()">' + t('resetAllData') + '</button></div></form></div>' +
  (isSuper ? '' : '<div class="card" style="max-width:680px;margin-top:16px"><h3>' + t('sbTitle') + '</h3><p class="card-sub">' + sbStatusText() + '</p><div class="actions" style="justify-content:flex-start"><button type="button" class="btn" onclick="sbRetryMigration()">' + t('sbBackupNow') + '</button></div></div>');
}
function saveSettings(e) {
  e.preventDefault();
  var p = db.profile;
  var oldName = p.name;
  if (state.role !== 'super') {
    p.name = $('fPfName').value.trim(); p.city = $('fPfCity').value.trim();
    if (p.name !== oldName) {
      var sch = db.schools.find(function (x) { return x.name === oldName; });
      if (sch) sch.name = p.name;
    }
  }
  p.principal = $('fPfPr').value.trim(); p.phone = $('fPfPh').value.trim(); p.email = $('fPfEm').value.trim();
  p.session = $('fPfSe').value; p.address = $('fPfAd').value.trim();
  if (pendingLogo !== null) { if (pendingLogo) p.logo = pendingLogo; else delete p.logo; pendingLogo = null; }
  saveDB(db); renderApp();
  toast('✓ ' + t('tSettingsSaved'));
  return false;
}
PAGE_SCHOOL.exams = examsPage; PAGE_SCHOOL.homework = homeworkPage; PAGE_SCHOOL.notices = noticesPage;
PAGE_SCHOOL.reports = function () { return reportsPage('school'); }; PAGE_SCHOOL.settings = settingsPage; PAGE_SCHOOL.admissions = admissionRequestsPage; PAGE_SCHOOL.activityLog = activityLogPage;

/* ================= STUDENT view ================= */
function studentDashboard() {
  var me = meStudent();
  if (!me) return '<div class="phone"><div class="card"><div class="empty">' + t('tNoStudentData') + '</div></div></div>';
  var myHw = db.homework.filter(function (h) { return h.cls === me.cls; });
  var doneCount = myHw.filter(function (h) { return h.doneBy.indexOf(me.id) !== -1; }).length;
  var hwItems = myHw.map(function (h) {
    var done = h.doneBy.indexOf(me.id) !== -1;
    return '<div class="hw-item ' + (done ? 'done' : '') + '"><input type="checkbox" ' + (done ? 'checked' : '') + ' onchange="toggleHw(\'' + h.id + '\', this.checked)" aria-label="Mark done"><div><b>' + esc(h.title) + '</b><span>' + esc(h.subject) + ' • Due ' + esc(h.due) + '</span></div></div>';
  }).join('');
  var notices = db.notices.slice(0, 2).map(function (n) {
    return '<div class="notice"><b>' + esc(n.title) + '</b><span>' + esc(n.date) + '</span><p>' + esc(n.body) + '</p></div>';
  }).join('');
  return '<div class="phone"><div class="card"><div class="stu-hero">' + avatarHTML(me.photo, me.name, 'avatar') + '</div>' +
    '<h3>' + esc(me.name) + '</h3><p>Class ' + esc(me.cls) + ' • ' + esc(db.profile.name) + ', ' + esc(db.profile.city) + '</p></div>' +
    '<div class="tile-grid">' +
    '<div class="tile green"><div class="n">' + studentAttPct(me) + '%</div><div class="l">' + t('tileAtt') + '</div></div>' +
    '<div class="tile yellow"><div class="n">' + studentFeeStatus(me.id) + '</div><div class="l">' + t('tileFees') + '</div></div>' +
    '<div class="tile purple"><div class="n">' + me.result + '%</div><div class="l">' + t('tileResults') + '</div></div>' +
    '<div class="tile blue"><div class="n">' + myHw.length + '</div><div class="l">' + t('tileHw') + ' (' + doneCount + ' ' + t('doneSuffix') + ')</div></div>' +
    '</div></div>' +
    '<div class="card" style="margin-top:16px"><h3>' + t('myHomework') + '</h3><p class="card-sub">' + t('myHwSub') + '</p>' + hwItems + '</div>' +
    '<div class="card" style="margin-top:16px"><h3>' + t('noticesH') + '</h3><p class="card-sub">' + t('latestNotices') + '</p>' + notices + '</div></div>';
}
var PAGE_STUDENT = { dashboard: studentDashboard, homework: homeworkPage, notices: noticesPage };
var PAGE_PARENT = { dashboard: parentDashboard };

/* ================= init ================= */
document.addEventListener('DOMContentLoaded', function () {
  applyI18n();
  if (!restoreSession()) showLogin();
  sbBoot(); // password-reset links + stored server session / pending backup
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('popstate', onPopState); // Android back button
  }
  if ('serviceWorker' in navigator && window.location.protocol.indexOf('http') === 0) {
    try {
      navigator.serviceWorker.register('sw.js').then(function () { /* PWA ready */ }).catch(function () { /* offline mode still works without SW */ });
    } catch (e) { /* ignore — app works without SW */ }
  }
});
