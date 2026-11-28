/* School Saathi — Admissions, Teachers, Staff, Classes & Student Portal module (extracted from app.js in v175) */
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
var admReqPublicCache = null; // server schools from ss_list_public_schools()
function admReqSchoolOptions() {
  // Server schools first (from the RPC), then local-only schools that are
  // not on the server yet. Values: 'srv:<uuid>' or 'local:<dbKey>'.
  // v136: a disabled placeholder forces a deliberate school choice - the
  // first real school is never pre-selected, so an untouched form cannot
  // silently route an application to the wrong school.
  var opts = '<option value="" disabled selected>' + esc(t('admReqPickSchool')) + '</option>';
  var map = sbServerSchoolMap();
  var seenSrv = {};
  (admReqPublicCache || []).forEach(function (s) {
    seenSrv[s.id] = true;
    opts += '<option value="srv:' + esc(s.id) + '">' + esc(s.name) + (s.city ? ' • ' + esc(s.city) : '') + '</option>';
  });
  loadAccounts().filter(function (a) { return a.role === 'school'; }).filter(function (a) { return !!readDbByKey(dbKeyFor(a)); }).forEach(function (a) {
    var sid = map[a.uid];
    if (sid && seenSrv[sid]) return; // already listed from the server
    opts += '<option value="local:' + esc(dbKeyFor(a)) + '">' + esc(a.school) + '</option>';
  });
  return opts;
}
function openAdmissionApply() {
  var schools = loadAccounts().filter(function (a) { return a.role === 'school'; }).filter(function (a) { return !!readDbByKey(dbKeyFor(a)); });
  var schOpts = admReqSchoolOptions();
  var clsOpts = classParts().map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
  var genOpts = [''].concat(GENDERS).map(function (g) { return '<option value="' + g + '">' + (g || '—') + '</option>'; }).join('');
  openModal('<h3>' + t('admReqFormTitle') + '</h3>' +
    (schools.length ? '' : '<p class="err" id="admReqNoSchoolMsg">' + t('admReqNoSchool') + '</p>') +
    '<form onsubmit="return saveAdmissionRequest(event)"><div class="form-grid">' +
    '<div class="full"><label>' + t('admReqSchool') + '</label><select id="fArSchool">' + schOpts + '</select></div>' +
    '<div><label>' + t('fStudentName') + ' *</label><input id="fArName" required placeholder="e.g. Aarav Kumar"></div>' +
    '<div><label>' + t('fDob') + '</label><input id="fArDob" type="date"></div>' +
    '<div><label>' + t('fGender') + '</label><select id="fArGender">' + genOpts + '</select></div>' +
    '<div><label>' + t('admReqClassApply') + ' *</label><select id="fArClass">' + clsOpts + '</select></div>' +
    '<div><label>' + t('fGuardian') + '</label><input id="fArGuardian" placeholder="Mr. Sharma"></div>' +
    '<div><label>' + t('fPhone') + ' *</label><input id="fArPhone" inputmode="numeric" placeholder="98XXXXXXXX"></div>' +
    '<div class="full"><label>' + t('fPrevSchool') + '</label><input id="fArPrevSchool" placeholder="Previous school (if any)"></div>' +
    '<div class="full" id="admTurnstile"></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button>' +
    '<button class="btn" type="submit" id="admReqSubmitBtn" ' + (schools.length ? '' : 'disabled') + '>' + t('admReqApply') + '</button></div></form>', true);
  if (typeof sbTurnstileMount === 'function') sbTurnstileMount('admission', 'admTurnstile', 'admission_apply');
  // v34 (P1-8): the school list is not only the accounts on THIS device
  // — fetch the public list from the server so any parent can apply to
  // any school. When it returns, refresh the picker and enable the form.
  if (sbIsOnline()) {
    sbRest('POST', 'rpc/ss_list_public_schools', SB_ANON_KEY, {}).then(function (r) {
      if (!r.ok || !Array.isArray(r.data)) return;
      admReqPublicCache = r.data;
      var sel = $('fArSchool');
      if (!sel) return; // modal closed
      var prev = sel.value; // keep a choice the parent already made
      sel.innerHTML = admReqSchoolOptions();
      if (prev) sel.value = prev;
      var msg = $('admReqNoSchoolMsg');
      if (msg) msg.classList.add('hidden');
      var btn = $('admReqSubmitBtn');
      if (btn) btn.disabled = false;
    }).catch(function () {});
  }
}
function saveAdmissionRequest(e) {
  e.preventDefault();
  var req = { id: uniqueId('ar'), name: ($('fArName') ? $('fArName').value : '').trim(),
    dob: $('fArDob') ? $('fArDob').value : '', gender: $('fArGender') ? $('fArGender').value : '',
    classApply: $('fArClass') ? $('fArClass').value : '', guardianName: ($('fArGuardian') ? $('fArGuardian').value : '').trim(),
    phone: ($('fArPhone') ? $('fArPhone').value : '').trim(), previousSchool: ($('fArPrevSchool') ? $('fArPrevSchool').value : '').trim(),
    status: 'Pending', reason: '', submitted: todayIST(), studentId: '' };
  var errs = validateAdmissionRequest(req);
  if (errs.length) { toast(errs.join(' ')); return false; }
  var sel = $('fArSchool') ? $('fArSchool').value : '';
  if (!sel) { toast(t('tAdmReqPickSchool')); return false; }
  if (sel.indexOf('srv:') === 0) {
    // A server school (chosen from the public list): the application
    // lives on the server only — there is no local DB for it on this
    // device. A failed post is queued and retried, never lost silently.
    var sid = sel.slice(4);
    var admTsTok = (typeof sbTurnstileToken === 'function') ? sbTurnstileToken('admission') : '';
    if (typeof sbTurnstileReset === 'function') sbTurnstileReset('admission');
    sbPostAdmission(sid, req, admTsTok).then(function (r) {
      if (!r.ok) sbAdmReqQueue(sid, req);
    }).catch(function () { sbAdmReqQueue(sid, req); });
    closeModal();
    toast(t('admReqSubmitted'));
    return false;
  }
  // Local school: 'local:<dbKey>' (a bare dbKey also works).
  var key = sel.indexOf('local:') === 0 ? sel.slice(6) : sel;
  if (!key || !saveAdmissionRequestToSchool(key, req)) { toast(t('tAdmReqFailed')); return false; }
  // Also send to the server when this school is already backed up there.
  // v34 (P1-8): a failed or offline post is QUEUED and retried — the
  // local save above is the source of truth, so a failed server post
  // never blocks the application.
  try {
    var map = sbServerSchoolMap();
    var acct = loadAccounts().filter(function (x) { return dbKeyFor(x) === key; })[0];
    var sid2 = acct && map[acct.uid];
    if (sid2) {
      if (sbIsOnline()) {
        sbPostAdmission(sid2, req).then(function (r) { if (!r.ok) sbAdmReqQueue(sid2, req); }).catch(function () { sbAdmReqQueue(sid2, req); });
      } else {
        sbAdmReqQueue(sid2, req);
      }
    }
  } catch (e2) {}
  closeModal();
  toast(t('admReqSubmitted'));
  return false;
}
function admReqStatusLabel(status) {
  // Live #7: the admReqApproved / admReqRejected i18n keys are TOAST
  // strings ('Admission request approved.') — they must never label a
  // status badge or a filter option. The short labels live in the *St
  // keys; Pending has no *St key because admReqPending is already short.
  if (status === 'Approved') return t('admReqApprovedSt');
  if (status === 'Rejected') return t('admReqRejectedSt');
  return t('admReqPending');
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
      '<td><span class="badge ' + badge + '">' + admReqStatusLabel(r.status) + '</span></td>' +
      '<td><div class="row-actions"><button class="btn ghost sm" onclick="viewAdmissionRequest(\'' + r.id + '\')">' + t('admReqView') + '</button>' +
      (r.status === 'Pending' ? '<button class="btn green sm" onclick="approveAdmissionRequest(\'' + r.id + '\')">' + t('admReqApprove') + '</button>' +
      '<button class="btn danger sm" onclick="rejectAdmissionRequest(\'' + r.id + '\')">' + t('admReqReject') + '</button>' : '') +
      '</div></td></tr>';
  }).join('');
  var fOpts = ['All', 'Pending', 'Approved', 'Rejected'].map(function (x) {
    var lbl = x === 'All' ? t('admReqAll') : admReqStatusLabel(x);
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
    kv(t('admReqStatus'), '<span class="badge ' + badge + '">' + admReqStatusLabel(r.status) + '</span>') +
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

/* ================= TEACHERS view (v35) =================
   The school admin creates teacher login accounts here: name, subject,
   classes taught, email + password. The account is a local device
   account (role 'teacher', djb2 hash — v36 replaces the hash) linked to
   the teacher record by teacherId; the teacher opens the school's DB.
   Teacher records (incl. classes[]) sync to the server like any other
   row; the login account itself is local-only in v35. */
var tchrFormClasses = []; // in-memory class selection for the teacher form
function toggleTchrClass(cls, on) {
  var i = tchrFormClasses.indexOf(cls);
  if (on && i === -1) tchrFormClasses.push(cls);
  if (!on && i !== -1) tchrFormClasses.splice(i, 1);
}
function viewTeacher(id) {
  // Live #10: teachers had no detail view at all — the list showed only
  // Edit/Delete. Read-only modal reusing the viewAdmissionRequest kv
  // pattern; the school role also gets an Edit button. No password hash
  // is ever shown (the login account row carries only the email).
  var te = (db.teachers || []).find(function (x) { return x.id === id; });
  if (!te) return;
  var acct = loadAccounts().find(function (a) { return a.role === 'teacher' && a.teacherId === te.id; });
  var clsList = Array.isArray(te.classes) && te.classes.length ? te.classes : (te.cls ? [te.cls] : []);
  var n = db.students.filter(function (s) { return clsList.indexOf(s.cls) !== -1 && isEnrolledStudent(s); }).length;
  var kv = function (label, val) { return '<div class="kv"><b>' + label + '</b><span>' + val + '</span></div>'; };
  openModal('<h3>' + esc(te.name) + '</h3><div class="card">' +
    kv(t('tchrName'), esc(te.name)) + kv(t('tchrSubject'), esc(te.subject || '—')) +
    kv(t('tchrClasses'), esc(clsList.join(', ') || '—')) +
    kv(t('tchrEmail'), acct ? esc(acct.email) : t('tchrNoLogin')) +
    kv(t('totalStudents'), String(n)) +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button>' +
    (state.role === 'school' ? '<button type="button" class="btn" onclick="closeModal();teacherForm(\'' + te.id + '\')">' + t('editBtn') + '</button>' : '') +
    '</div>');
}
function teachersPage() {
  if (state.role !== 'school' && state.role !== 'principal') return '<div class="card"><div class="empty">' + t('tNotAllowed') + '</div></div>';
  var isPrincipal = state.role === 'principal';
  var cards = (db.teachers || []).filter(function (te) { return !te.deleted; }).map(function (te) {
    var acct = loadAccounts().find(function (a) { return a.role === 'teacher' && a.teacherId === te.id; });
    var clsList = Array.isArray(te.classes) && te.classes.length ? te.classes : (te.cls ? [te.cls] : []);
    var ini = String(te.name || 'T').trim().slice(0, 1).toUpperCase();
    return '<div class="tchr-card"><div class="tchr-av">' + esc(ini) + '</div>' +
      '<button class="linklike tchr-name" onclick="viewTeacher(\'' + te.id + '\')">' + esc(te.name) + '</button>' +
      '<span class="tchr-subj">' + esc(te.subject || '—') + '</span>' +
      '<div class="tchr-meta">' + esc(clsList.join(', ') || '—') + '<br>' + (acct ? esc(acct.email) : esc(t('tchrNoLogin'))) + '</div>' +
      '<div class="tchr-acts"><button class="btn ghost sm" onclick="viewTeacher(\'' + te.id + '\')">' + t('admReqView') + '</button>' +
      (isPrincipal ? '' : '<button class="btn ghost sm" onclick="teacherForm(\'' + te.id + '\')">' + t('editBtn') + '</button><button class="btn ghost sm danger" onclick="deleteTeacher(\'' + te.id + '\')">' + t('deleteBtn') + '</button>') + '</div></div>';
  }).join('');
  return '<div class="page-head"><div><h2>' + t('teachers') + '</h2><p>' + t('teachersSub') + '</p></div>' +
    (isPrincipal ? '' : '<div class="toolbar"><button class="btn green" onclick="teacherForm()">+ ' + t('tchrAdd') + '</button></div>') + '</div>' +
    (cards ? '<div class="tchr-grid">' + cards + '</div>' : '<div class="card"><div class="empty">' + t('tNoTeachers') + '</div></div>');
}
function teacherForm(id) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  var te = id ? db.teachers.find(function (x) { return x.id === id; }) : null;
  var acct = te ? loadAccounts().find(function (a) { return a.role === 'teacher' && a.teacherId === te.id; }) : null;
  tchrFormClasses = te ? (Array.isArray(te.classes) && te.classes.length ? te.classes.slice() : (te.cls ? [te.cls] : [])) : [];
  var clsBoxes = schoolClasses().map(function (c) {
    return '<label class="check"><input type="checkbox" ' + (tchrFormClasses.indexOf(c) !== -1 ? 'checked' : '') + ' onchange="toggleTchrClass(' + jsAttr(c) + ', this.checked)"> ' + esc(c) + '</label>';
  }).join('');
  var subOpts = schoolSubjectList().map(function (s) { return '<option ' + (te && te.subject === s ? 'selected' : '') + '>' + esc(s) + '</option>'; }).join('');
  openModal('<h3>' + (te ? t('tchrEdit') : t('tchrAdd')) + '</h3>' +
    '<div id="fTchrErr" class="err hidden"></div>' +
    '<form onsubmit="return saveTeacher(event,\'' + (id || '') + '\')"><div class="form-grid">' +
    '<div><label>' + t('tchrName') + ' *</label><input id="fTchrName" required value="' + esc(te ? te.name : '') + '" placeholder="e.g. Sunita Sharma"></div>' +
    '<div><label>' + t('tchrSubject') + '</label><select id="fTchrSub">' + subOpts + '</select></div>' +
    '<div class="full"><label>' + t('tchrClasses') + ' *</label><div style="display:flex;flex-wrap:wrap;gap:8px 16px">' + clsBoxes + '</div></div>' +
    '<div><label>' + t('tchrEmail') + ' *</label><input id="fTchrEmail" type="email" required value="' + esc(acct ? acct.email : '') + '" placeholder="teacher@school.edu.in" autocomplete="off"></div>' +
    '<div><label>' + t('tchrPw') + (acct ? '' : ' *') + '</label><input id="fTchrPw" type="password" ' + (acct ? '' : 'required') + ' placeholder="••••••••" autocomplete="new-password"><p class="muted">' + t('tchrPwHint') + '</p></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button><button class="btn" type="submit">' + t('saveBtn') + '</button></div></form>', true);
}
function saveTeacher(e, id) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return false; }
  e.preventDefault();
  var errEl = $('fTchrErr');
  var name = ($('fTchrName') ? $('fTchrName').value : '').trim();
  var email = ($('fTchrEmail') ? $('fTchrEmail').value : '').trim().toLowerCase();
  var pw = $('fTchrPw') ? $('fTchrPw').value : '';
  var subject = $('fTchrSub') ? $('fTchrSub').value : '';
  if (!name || !email) return failInto(errEl, t('tFillAll'), true);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return failInto(errEl, t('tInvalidEmail'), true);
  if (!tchrFormClasses.length) return failInto(errEl, t('tchrNoClasses'), true);
  var list = loadAccounts();
  var te = id ? db.teachers.find(function (x) { return x.id === id; }) : null;
  var ownAcct = te ? list.find(function (a) { return a.role === 'teacher' && a.teacherId === te.id; }) : null;
  var existing = list.find(function (a) { return a.email === email; });
  if (existing && (!ownAcct || existing.uid !== ownAcct.uid)) return failInto(errEl, t('tchrEmailTaken'), true);
  if (!ownAcct && pwProblem(pw)) return failInto(errEl, t(pwProblem(pw)), true);
  if (ownAcct && pw && pwProblem(pw)) return failInto(errEl, t(pwProblem(pw)), true);
  if (!te) {
    te = { id: uniqueId('t'), name: name, subject: subject, cls: tchrFormClasses[0], classes: tchrFormClasses.slice() };
    db.teachers.push(te);
  } else {
    te.name = name; te.subject = subject; te.classes = tchrFormClasses.slice(); te.cls = tchrFormClasses[0] || '';
  }
  if (ownAcct) {
    ownAcct.name = name; ownAcct.email = email; ownAcct.sub = t('tchrSub') + ' • ' + db.profile.name;
    if (pw) { ownAcct.pwHash = hashPwNew(pw); ownAcct.hashScheme = hashSchemeOf(ownAcct.pwHash); }
  } else {
    var pwH = hashPwNew(pw);
    list.push({ uid: uniqueId('u'), name: name, school: db.profile.name, email: email, pwHash: pwH, hashScheme: hashSchemeOf(pwH), role: 'teacher', sub: t('tchrSub') + ' • ' + db.profile.name, teacherId: te.id, schoolUid: state.user.uid, created: todayIST() });
  }
  saveAccounts(list);
  logAudit(ownAcct ? 'Teacher updated' : 'Teacher added', name + ' • ' + (te.classes || []).join(', '));
  saveDB(db); closeModal(); renderApp();
  toast(t('tchrSaved'));
  return false;
}
function deleteTeacher(id) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  var te = db.teachers.find(function (x) { return x.id === id; });
  if (!te) return;
  // Soft delete only: the record and ALL of its history (attendance,
  // marks, homework the teacher posted) are kept. The linked login
  // account is revoked at the same time, so a removed teacher cannot
  // log in again — locally or from the cloud (SQL 41 refuses deleted
  // rows in the login + token-owner functions).
  confirmModal(t('tchrDelMsg') + ' — ' + te.name + '?', function () {
    te.deleted = true;
    var list = loadAccounts().filter(function (a) { return !(a.role === 'teacher' && a.teacherId === te.id); });
    saveAccounts(list);
    logAudit('Teacher removed', te.name + ' • ' + (te.classes || []).join(', ') + ' (soft delete — record kept)');
    saveDB(db); renderApp();
    toast(t('tchrRemoved'));
  });
}
/* ================= STAFF view (v90, Phase 4) =================
   The school admin creates staff login accounts here: name, role
   (Principal / Accountant / Staff), classes for the Staff role, email +
   password. The account is a local device account (role 'principal' /
   'accountant' / 'staff', bcrypt hash) linked to the staff record by
   staffId; the staff member opens the school's DB. Staff records sync
   to ss_staff like teacher records do (sbMapStaff); the login account
   itself is local-only, and the hash never pulls back down. */
var staffFormClasses = []; // in-memory class selection for the staff form
function toggleStaffClass(cls, on) {
  var i = staffFormClasses.indexOf(cls);
  if (on && i === -1) staffFormClasses.push(cls);
  if (!on && i !== -1) staffFormClasses.splice(i, 1);
}
function staffRoleLabel(role) {
  return role === 'principal' ? t('staffRolePrincipal') : role === 'accountant' ? t('staffRoleAccountant') : t('staffRoleStaff');
}
function staffPage() {
  if (state.role !== 'school') return '<div class="card"><div class="empty">' + t('tNotAllowed') + '</div></div>';
  var seenSt = {};
  var rows = (db.staff || []).filter(function (st) { if (st.deleted || seenSt[st.id]) return false; seenSt[st.id] = true; return true; }).map(function (st) {
    var acct = loadAccounts().find(function (a) { return (a.role === 'principal' || a.role === 'accountant' || a.role === 'staff') && a.staffId === st.id; });
    var clsList = Array.isArray(st.classes) && st.classes.length ? st.classes.join(', ') : (st.role === 'staff' ? '—' : t('allClasses'));
    return '<tr><td><b>' + esc(st.name) + '</b></td><td>' + esc(staffRoleLabel(st.role)) + '</td><td>' + esc(clsList) + '</td><td>' + (acct ? esc(acct.email) : '<span class="muted">' + t('staffNoLogin') + '</span>') + '</td><td><button class="btn ghost sm" onclick="staffForm(\'' + st.id + '\')">' + t('editBtn') + '</button> <button class="btn ghost sm danger" onclick="deleteStaff(\'' + st.id + '\')">' + t('deleteBtn') + '</button></td></tr>';
  }).join('');
  return '<div class="page-head"><div><h2>' + t('staffPage') + '</h2><p>' + t('staffPageSub') + '</p></div>' +
    '<div class="toolbar"><button class="btn" onclick="staffForm()">+ ' + t('staffAdd') + '</button></div></div>' +
    '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('thName') + '</th><th>' + t('staffRole') + '</th><th>' + t('staffClasses') + '</th><th>' + t('loginEmail') + '</th><th></th></tr></thead><tbody>' + (rows || '<tr><td colspan="5"><div class="empty">' + t('tNoStaff') + '</div></td></tr>') + '</tbody></table></div></div>'; // v91: the empty state said "No teachers yet."
}
function staffForm(id) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  var st = id ? (db.staff || []).find(function (x) { return x.id === id; }) : null;
  var acct = st ? loadAccounts().find(function (a) { return (a.role === 'principal' || a.role === 'accountant' || a.role === 'staff') && a.staffId === st.id; }) : null;
  staffFormClasses = st ? (Array.isArray(st.classes) ? st.classes.slice() : []) : [];
  var clsBoxes = schoolClasses().map(function (c) {
    return '<label class="check"><input type="checkbox" ' + (staffFormClasses.indexOf(c) !== -1 ? 'checked' : '') + ' onchange="toggleStaffClass(' + jsAttr(c) + ', this.checked)"> ' + esc(c) + '</label>';
  }).join('');
  var roleOpts = ['principal', 'accountant', 'staff'].map(function (r) { return '<option value="' + r + '" ' + (st && st.role === r ? 'selected' : '') + '>' + staffRoleLabel(r) + '</option>'; }).join('');
  openModal('<h3>' + (st ? t('staffEdit') : t('staffAdd')) + '</h3>' +
    '<div id="fStaffErr" class="err hidden"></div>' +
    '<form onsubmit="return saveStaff(event,\'' + (id || '') + '\')"><div class="form-grid">' +
    '<div class="field"><label>' + t('staffName') + '</label><input id="fStaffName" value="' + esc(st ? st.name : '') + '"></div>' +
    '<div class="field"><label>' + t('staffRole') + '</label><select id="fStaffRole" onchange="document.getElementById(\'fStaffClasses\').style.display = this.value === \'staff\' ? \'block\' : \'none\'">' + roleOpts + '</select></div>' +
    '<div class="field" id="fStaffClasses" style="display:' + (st && st.role === 'staff' ? 'block' : 'none') + '"><label>' + t('staffClasses') + '</label><div class="check-grid">' + clsBoxes + '</div></div>' +
    '<div class="field"><label>' + t('loginEmail') + '</label><input id="fStaffEmail" type="email" value="' + esc(acct ? acct.email : '') + '"></div>' +
    '<div class="field"><label>' + t('loginPassword') + '</label><input id="fStaffPw" type="password" placeholder="' + (acct ? t('tchrPwHint') : '') + '"></div>' +
    '</div><p class="muted" style="font-size:12.5px">' + t('staffRoleHint') + '</p>' +
    '<div class="modal-actions"><button class="btn ghost" type="button" onclick="closeModal()">' + t('cancel') + '</button><button class="btn" type="submit">' + t('saveBtn') + '</button></div></form>');
}
function saveStaff(e, id) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return false; }
  e.preventDefault();
  var errEl = $('fStaffErr');
  var name = ($('fStaffName') ? $('fStaffName').value : '').trim();
  var email = ($('fStaffEmail') ? $('fStaffEmail').value : '').trim().toLowerCase();
  var pw = $('fStaffPw') ? $('fStaffPw').value : '';
  var role = $('fStaffRole') ? $('fStaffRole').value : 'staff';
  if (!name || !email) return failInto(errEl, t('tFillAll'), true);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return failInto(errEl, t('tInvalidEmail'), true);
  if (role === 'staff' && !staffFormClasses.length) return failInto(errEl, t('tchrNoClasses'), true);
  var list = loadAccounts();
  var st = id ? (db.staff || []).find(function (x) { return x.id === id; }) : null;
  var ownAcct = st ? list.find(function (a) { return (a.role === 'principal' || a.role === 'accountant' || a.role === 'staff') && a.staffId === st.id; }) : null;
  var existing = list.find(function (a) { return a.email === email; });
  if (existing && (!ownAcct || existing.uid !== ownAcct.uid)) return failInto(errEl, t('tchrEmailTaken'), true);
  if (!ownAcct && pwProblem(pw)) return failInto(errEl, t(pwProblem(pw)), true);
  if (ownAcct && pw && pwProblem(pw)) return failInto(errEl, t(pwProblem(pw)), true);
  if (!st) {
    if ((db.staff || []).some(function (x) { return !x.deleted && String(x.name || '').trim().toLowerCase() === name.toLowerCase() && x.role === role; })) return failInto(errEl, t('staffDuplicate'), true);
    st = { id: uniqueId('stf'), name: name, role: role, classes: role === 'staff' ? staffFormClasses.slice() : [] };
    if (!Array.isArray(db.staff)) db.staff = []; // v90: a DB loaded without the migration still gets the list
    db.staff.push(st);
  } else {
    st.name = name; st.role = role; st.classes = role === 'staff' ? staffFormClasses.slice() : [];
  }
  if (ownAcct) {
    ownAcct.name = name; ownAcct.email = email; ownAcct.role = role; ownAcct.sub = staffRoleLabel(role) + ' • ' + db.profile.name;
    if (pw) { ownAcct.pwHash = hashPwNew(pw); ownAcct.hashScheme = hashSchemeOf(ownAcct.pwHash); }
  } else {
    var pwH = hashPwNew(pw);
    list.push({ uid: uniqueId('u'), name: name, school: db.profile.name, email: email, pwHash: pwH, hashScheme: hashSchemeOf(pwH), role: role, sub: staffRoleLabel(role) + ' • ' + db.profile.name, staffId: st.id, schoolUid: state.user.uid, created: todayIST() });
  }
  saveAccounts(list);
  logAudit(ownAcct ? 'Staff updated' : 'Staff added', name + ' • ' + staffRoleLabel(role) + (role === 'staff' ? ' • ' + (st.classes || []).join(', ') : ''));
  saveDB(db); closeModal(); renderApp();
  toast(t('staffSaved'));
  return false;
}
function deleteStaff(id) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  var st = (db.staff || []).find(function (x) { return x.id === id; });
  if (!st) return;
  // Soft delete only: the record is kept. The linked login account is
  // revoked at the same time, so a removed staff member cannot log in
  // again — locally or from the cloud (SQL 41 refuses deleted rows in
  // the login + token-owner functions).
  confirmModal(t('staffDelMsg') + ' — ' + st.name + '?', function () {
    st.deleted = true;
    var list = loadAccounts().filter(function (a) { return !((a.role === 'principal' || a.role === 'accountant' || a.role === 'staff') && a.staffId === st.id); });
    saveAccounts(list);
    logAudit('Staff removed', st.name + ' • ' + staffRoleLabel(st.role) + ' (soft delete — record kept)');
    saveDB(db); renderApp();
    toast(t('staffRemoved'));
  });
}
/* ================= Classes view (v119, Phase 5, Module 5) =================
   The school admin manages the class list here: add a section, rename
   a class (every reference moves with it), delete an empty class, and
   set which subjects each class teaches. The list drives every class
   dropdown in the app (schoolClasses / schoolSubjects); the hardcoded
   CLASSES / SUBJECTS globals are only the seed. Class rows sync to
   ss_classes like teacher rows do (sbMapClass); a rename is a delete
   of the old key + an upsert of the new one, handled by the diff. */
var clsFormSubjects = []; // in-memory subject selection for the class form
function toggleClsSubject(sub, on) {
  var i = clsFormSubjects.indexOf(sub);
  if (on && i === -1) clsFormSubjects.push(sub);
  if (!on && i !== -1) clsFormSubjects.splice(i, 1);
}
function classesPage() {
  if (state.role !== 'school') return '<div class="card"><div class="empty">' + t('tNotAllowed') + '</div></div>';
  var rows = schoolClasses().map(function (cls) {
    var subs = schoolSubjects(cls);
    return '<tr><td><b>' + esc(cls) + '</b></td><td>' + esc(subs.join(', ') || '—') + '</td><td><button class="btn ghost sm" onclick="classForm(' + jsAttr(cls) + ')">' + t('editBtn') + '</button> <button class="btn ghost sm danger" onclick="deleteClass(' + jsAttr(cls) + ')">' + t('deleteBtn') + '</button></td></tr>';
  }).join('');
  return '<div class="page-head"><div><h2>' + t('classes') + '</h2><p>' + t('classesSub') + '</p></div>' +
    '<div class="toolbar"><button class="btn" onclick="classForm()">+ ' + t('clsAdd') + '</button></div></div>' +
    '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('thClass') + '</th><th>' + t('thSubjects') + '</th><th></th></tr></thead><tbody>' + (rows || '<tr><td colspan="3"><div class="empty">' + t('tNoClasses') + '</div></td></tr>') + '</tbody></table></div></div>';
}
function classForm(oldCls) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  var row = oldCls ? classRow(oldCls) : null;
  clsFormSubjects = row ? (row.subjects || []).slice() : SUBJECTS.slice();
  var subBoxes = schoolSubjectList().map(function (s) {
    return '<label class="check"><input type="checkbox" ' + (clsFormSubjects.indexOf(s) !== -1 ? 'checked' : '') + ' onchange="toggleClsSubject(' + jsAttr(s) + ', this.checked)"> ' + esc(s) + '</label>';
  }).join('');
  openModal('<h3>' + (row ? t('clsEdit') : t('clsAdd')) + '</h3>' +
    '<div id="fClsErr" class="err hidden"></div>' +
    '<form onsubmit="return saveClass(event,\'' + (oldCls || '') + '\')"><div class="form-grid">' +
    '<div class="full"><label>' + t('clsName') + ' *</label><input id="fClsName" required value="' + esc(oldCls || '') + '" placeholder="e.g. 6th-C"></div>' +
    '<div class="full"><label>' + t('clsSubjects') + '</label><div class="check-grid">' + subBoxes + '</div></div>' +
    '<div class="full"><label>' + t('clsNewSub') + '</label><input id="fClsNewSub" placeholder="e.g. Computer Science"></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button><button class="btn" type="submit">' + t('saveBtn') + '</button></div></form>');
}
function saveClass(e, oldCls) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return false; }
  e.preventDefault();
  var errEl = $('fClsErr');
  var name = ($('fClsName') ? $('fClsName').value : '').trim();
  if (!/^[A-Za-z0-9]+-[A-Za-z]$/.test(name)) return failInto(errEl, t('clsInvalid'), true);
  var newSub = ($('fClsNewSub') ? $('fClsNewSub').value : '').trim();
  var subjects = clsFormSubjects.slice();
  if (newSub && subjects.indexOf(newSub) === -1) subjects.push(newSub);
  if (!subjects.length) return failInto(errEl, t('tFillAll'), true);
  if (!Array.isArray(db.classes)) db.classes = defaultClasses();
  var row = oldCls ? classRow(oldCls) : null;
  if (!oldCls) {
    if (classRow(name)) return failInto(errEl, t('clsDuplicate'), true);
    db.classes.push({ id: name, cls: name, subjects: subjects });
    if (!db.feeStructure.some(function (f) { return f.cls === name && f.type === 'Tuition'; })) {
      db.feeStructure.push({ cls: name, type: 'Tuition', amount: defaultTuitionAmt(classPartOf(name)) });
    }
    logAudit('Class added', name + ' • ' + subjects.join(', '));
    saveDB(db); closeModal(); renderApp();
    toast(t('clsAdded'));
    return false;
  }
  if (!row) return failInto(errEl, t('tNotAllowed'), true);
  if (name !== oldCls && classRow(name)) return failInto(errEl, t('clsDuplicate'), true);
  // A subject dropped from the class must not be in use by an exam of it.
  var removed = (row.subjects || []).filter(function (x) { return subjects.indexOf(x) === -1; });
  var blocked = null;
  removed.forEach(function (x) {
    if (!blocked && (db.exams || []).some(function (ex) { return ex.cls === oldCls && ex.subject === x && isActiveExam(ex); })) blocked = x;
  });
  if (blocked) return failInto(errEl, t('clsSubjectInUse') + ' — ' + blocked, true);
  var added = subjects.filter(function (x) { return (row.subjects || []).indexOf(x) === -1; });
  if (name !== oldCls) renameClassRefs(oldCls, name);
  row.cls = name; row.id = name; row.subjects = subjects;
  if (name !== oldCls) logAudit('Class renamed', oldCls + ' → ' + name);
  added.forEach(function (x) { logAudit('Subject added', name + ' • ' + x); });
  removed.forEach(function (x) { logAudit('Subject removed', name + ' • ' + x); });
  saveDB(db); closeModal(); renderApp();
  toast(t('clsSaved'));
  return false;
}
function renameClassRefs(oldCls, newCls) {
  // v119: a class rename moves every reference — students, teacher and
  // staff class lists, fee rows, exams, homework, attendance keys and
  // holidays. Nothing is left pointing at the old name.
  (db.students || []).forEach(function (s) { if (s.cls === oldCls) s.cls = newCls; });
  (db.teachers || []).forEach(function (te) { if (Array.isArray(te.classes)) te.classes = te.classes.map(function (c) { return c === oldCls ? newCls : c; }); if (te.cls === oldCls) te.cls = newCls; });
  (db.staff || []).forEach(function (st) { if (Array.isArray(st.classes)) st.classes = st.classes.map(function (c) { return c === oldCls ? newCls : c; }); });
  (db.feeStructure || []).forEach(function (f) { if (f.cls === oldCls) f.cls = newCls; });
  (db.exams || []).forEach(function (ex) { if (ex.cls === oldCls) ex.cls = newCls; });
  (db.homework || []).forEach(function (h) { if (h.cls === oldCls) h.cls = newCls; });
  (db.holidays || []).forEach(function (h) { if (h.cls === oldCls) h.cls = newCls; });
  Object.keys(db.attendance || {}).forEach(function (k) {
    var parts = k.split('|');
    if (parts[1] === oldCls) {
      db.attendance[parts[0] + '|' + newCls] = db.attendance[k];
      delete db.attendance[k];
    }
  });
}
function classInUse(cls) {
  // v119: a class is deletable only when nothing references it. The
  // first blocker is named so the admin knows what to move first.
  var st = (db.students || []).filter(function (s) { return s.cls === cls; })[0];
  if (st) return t('students') + ': ' + st.name;
  var te = (db.teachers || []).filter(function (x) { return (x.classes || []).indexOf(cls) !== -1 || x.cls === cls; })[0];
  if (te) return t('teachers') + ': ' + te.name;
  var sf = (db.staff || []).filter(function (x) { return (x.classes || []).indexOf(cls) !== -1; })[0];
  if (sf) return t('staff') + ': ' + sf.name;
  var ex = (db.exams || []).filter(function (x) { return x.cls === cls && isActiveExam(x); })[0];
  if (ex) return t('exams') + ': ' + ex.name;
  var hw = (db.homework || []).filter(function (x) { return x.cls === cls; })[0];
  if (hw) return t('homework') + ': ' + (hw.title || '');
  var att = Object.keys(db.attendance || {}).some(function (k) { return k.split('|')[1] === cls && Object.keys(db.attendance[k] || {}).length; });
  if (att) return t('attendance');
  var hol = (db.holidays || []).filter(function (x) { return x.cls === cls; })[0];
  if (hol) return 'Holiday';
  var tt = (db.timetable || []).filter(function (x) { return x.cls === cls; })[0];
  if (tt) return t('timetable') + ': ' + (tt.subject || '');
  return null;
}
function deleteClass(cls) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  var row = classRow(cls);
  if (!row) return;
  var blocker = classInUse(cls);
  if (blocker) { toast(t('clsInUse') + ' — ' + blocker); return; }
  confirmModal(t('clsDelMsg') + ' — ' + cls + '?', function () {
    db.classes = (db.classes || []).filter(function (c) { return c.cls !== cls; });
    db.feeStructure = (db.feeStructure || []).filter(function (f) { return f.cls !== cls; });
    logAudit('Class removed', cls);
    saveDB(db); renderApp();
    toast(t('clsRemoved'));
  });
}

PAGE_SCHOOL.exams = examsPage; PAGE_SCHOOL.homework = homeworkPage; PAGE_SCHOOL.timetable = timetablePage; PAGE_SCHOOL.notices = noticesPage;
PAGE_SCHOOL.teachers = teachersPage; PAGE_SCHOOL.staff = staffPage; PAGE_SCHOOL.classes = classesPage; PAGE_SCHOOL.reports = function () { return reportsPage(); }; PAGE_SCHOOL.settings = settingsPage; PAGE_SCHOOL.admissions = admissionRequestsPage; PAGE_SCHOOL.activityLog = activityLogPage;

/* ================= STUDENT view ================= */
function studentDashboard() {
  var me = meStudent();
  if (!me) return '<div class="phone"><div class="card"><div class="empty">' + t('tNoStudentData') + '</div></div></div>';
  // Full profile (opened from the "View full profile" button below).
  if (state.profileStudent === me.id) return studentProfilePage(me.id);
  var myHw = db.homework.filter(function (h) { return h.cls === me.cls; });
  var doneCount = myHw.filter(function (h) { return h.doneBy.indexOf(me.id) !== -1; }).length;
  // v66: the Results tile showed the STORED result field (0 when the
  // school never set one) even when live marks existed — Ankit scored
  // 42/50 but the tile read 0%. The profile overview already prefers
  // the live marks (latestExamPct); the tile follows it, falling back
  // to the stored value only when no marks exist at all.
  var lex66 = latestExamPct(me);
  // live issue 13: a stored 0 is "never set", not a 0% result — show "—" when
  // neither live marks nor a stored result exist (same rule as the
  // profile overview's Latest Exam card).
  var resShow66 = lex66 ? lex66.pct : (me.result || null);
  var hwItems = myHw.map(function (h) {
    var done = h.doneBy.indexOf(me.id) !== -1;
    // v86: only the student gets the Mark-done checkbox — a parent sees
    // the same item read-only (toggleHw would refuse anyway, so the
    // checkbox must not render for a parent at all).
    var box86 = state.role === 'student' ? '<input type="checkbox" ' + (done ? 'checked' : '') + ' onchange="toggleHw(\'' + h.id + '\', this.checked)" aria-label="Mark done">' : '';
    return '<div class="hw-item ' + (done ? 'done' : '') + '">' + box86 + '<div><b>' + esc(h.title) + '</b><span>' + esc(h.subject) + ' • Due ' + esc(h.due) + '</span></div></div>';
  }).join('');
  var notices = db.notices.slice(0, 2).map(function (n) {
    return '<div class="notice"><b>' + esc(n.title) + '</b><span>' + esc(n.date) + '</span><p>' + esc(n.body) + '</p></div>';
  }).join('');
  return '<div class="phone"><div class="card"><div class="stu-hero">' + avatarHTML(me.photo, me.name, 'avatar') + '</div>' +
    '<h3>' + esc(me.name) + '</h3><p>Class ' + esc(me.cls) + ' • ' + esc(db.profile.name) + ', ' + esc(db.profile.city) + '</p>' +
    '<div class="toolbar" style="justify-content:center;margin-top:10px"><button class="btn" onclick="openStudentProfile(\'' + me.id + '\')">' + t('actView') + '</button></div></div>' +
    '<div class="tile-grid">' +
    '<div class="tile green pointer" onclick="go(\'attendance\')"><div class="n">' + studentAttPct(me) + '%</div><div class="l">' + t('tileAtt') + '</div></div>' +
    '<div class="tile yellow pointer" onclick="go(\'fees\')"><div class="n">' + studentFeeStatus(me.id) + '</div><div class="l">' + t('tileFees') + '</div></div>' +
    '<div class="tile purple pointer" onclick="go(\'results\')"><div class="n">' + (resShow66 === null ? '—' : resShow66 + '%') + '</div><div class="l">' + t('tileResults') + '</div></div>' +
    '<div class="tile blue pointer" onclick="go(\'homework\')"><div class="n">' + myHw.length + '</div><div class="l">' + t('tileHw') + ' (' + doneCount + ' ' + t('doneSuffix') + ')</div></div>' +
    '</div></div>' +
    '<div class="card mt-16"><h3>' + t('myHomework') + '</h3><p class="card-sub">' + t('myHwSub') + '</p>' + hwItems + '</div>' +
    '<div class="card mt-16"><h3>' + t('noticesH') + '</h3><p class="card-sub">' + t('latestNotices') + '</p>' + notices + '</div></div>';
}
// v65: parent features live in the student portal — no separate parent
// login. A parent logs in with the child's admission number + PIN (the
// PIN field IS parent_pin) and gets three first-class pages: attendance,
// fees and results. Each reuses the full profile's tab body, so the
// detail is identical to what the school sees — only the student's own
// rows, read-only. The fees tab's receipt button is rendered as plain
// text here: openSavedReceipt jumps to the school fees page, which a
// student login cannot open (renderPage refuses it).
function studentAttendancePage() {
  var me = meStudent();
  if (!me) return '<div class="phone"><div class="card"><div class="empty">' + t('tNoStudentData') + '</div></div></div>';
  return '<div class="page-head"><div><h2>' + t('attendance') + '</h2><p>' + t('myAttSub') + '</p></div></div>' + profileTabBody(me, 'attendance');
}
function studentFeesPage() {
  var me = meStudent();
  if (!me) return '<div class="phone"><div class="card"><div class="empty">' + t('tNoStudentData') + '</div></div></div>';
  // v125: a parent/student can finally OPEN a receipt. The receipt
  // number used to be a dead end — openSavedReceipt landed on this
  // same list (the detail lived only in the school feesPage), and the
  // v65 regex only stripped the button here, not in the profile tab.
  // The detail is read-only (Back + Print); the receipt must belong
  // to this child, or the id is cleared and the list renders instead.
  if (state.savedReceiptId) {
    var rc125 = (db.receipts || []).find(function (r) { return r.receiptNo === state.savedReceiptId; });
    if (rc125 && rc125.studentId === me.id) {
      var s2125 = receiptStudent(rc125);
      return '<div class="page-head"><div><h2>' + t('rcptTitle') + '</h2><p>' + esc(s2125.name) + ' • ' + esc(s2125.cls) + ' • ' + esc(s2125.admissionNo || '') + '</p></div>' +
        '<div class="toolbar"><button class="btn ghost" onclick="backFromReceipt()">\u2190 ' + t('backFees') + '</button></div></div>' +
        receiptHTML(rc125, s2125, false) +
        '<div class="actions"><button class="btn" onclick="printReceipt(' + jsAttr(rc125.receiptNo) + ')">\u1f5a8 ' + t('rcptPrint') + '</button></div>';
    }
    state.savedReceiptId = null;
  }
  // v125: the v65 plain-text strip is gone — the receipt number is a
  // link now, and it opens the receipt view above.
  return '<div class="page-head"><div><h2>' + t('fees') + '</h2><p>' + t('myFeesSub') + '</p></div></div>' + profileTabBody(me, 'fees');
}
function studentResultsPage() {
  var me = meStudent();
  if (!me) return '<div class="phone"><div class="card"><div class="empty">' + t('tNoStudentData') + '</div></div></div>';
  return '<div class="page-head"><div><h2>' + t('results') + '</h2><p>' + t('myResultsSub') + '</p></div></div>' + profileTabBody(me, 'results');
}
var PAGE_STUDENT = { dashboard: studentDashboard, attendance: studentAttendancePage, fees: studentFeesPage, results: studentResultsPage, homework: homeworkPage, timetable: timetablePage, notices: noticesPage };
var PAGE_TEACHER = { dashboard: teacherDashboard, students: studentsPage, attendance: attendancePage, exams: examsPage, homework: homeworkPage, timetable: timetablePage, notices: noticesPage };
// v85 (Phase 4): the five new roles start with dashboard + notices.
// Their own pages land in their step (parent v86, principal v87,
// accountant v88, staff v89, superadmin v90).
// v88 (Phase 4): the Principal's page map. The dashboard is the
// read-only school overview; the other pages are the school pages with
// their edit controls hidden for a principal (see the isPrincipal
// gating in each page). Notices and reports are read-only by
// construction (canPost is school-only; reports only download).
var PAGE_PRINCIPAL = { dashboard: principalDashboard, students: studentsPage, teachers: teachersPage, attendance: attendancePage, fees: feesPage, exams: examsPage, homework: homeworkPage, timetable: timetablePage, notices: noticesPage, reports: reportsPage, activityLog: activityLogPage }; // v129: the principal may open the read-only Activity Log
var PAGE_ACCOUNTANT = { dashboard: roleDashboard, fees: feesPage, reports: reportsPage, notices: noticesPage }; // v92: the accountant opens the fees + reports pages (the principal's read-only fees stay untouched)
var PAGE_STAFF = { dashboard: roleDashboard, attendance: attendancePage, homework: homeworkPage, notices: noticesPage }; // v93: a staff member opens attendance + homework (scoped to their classes) + notices
// v86 (Phase 4): the Parent role reuses the student portal's read-only
// views — the parent sees only their own child's data (meStudent() now
// covers the parent role). Homework is scoped to the child's class and
// has no Add button for a parent; toggleHwDone already refuses
// non-students.
var PAGE_PARENT = { dashboard: studentDashboard, attendance: studentAttendancePage, fees: studentFeesPage, results: studentResultsPage, homework: homeworkPage, timetable: timetablePage, notices: noticesPage };
var PAGE_SUPERADMIN = { dashboard: superAdminDashboard, schools: schoolsPage, notices: noticesPage }; // Super Admin dashboard (totals + read-only schools list); no school-data editing, no login-as-school, no wipe/delete here

