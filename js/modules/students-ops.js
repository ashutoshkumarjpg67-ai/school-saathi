/* School Saathi — Bulk CSV Import, Promotion, Student Profile, WhatsApp & Attendance module (extracted from app.js in v175) */
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
      mobile2: phone2, parentEmail: email, occupation: String(row.occupation || '').trim(), aadhaar: aadhaarLast4(aadhaar),
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
    res = '<div class="card mt-12"><h3>' + t('impSummary') + '</h3><p>' + rs.imported + ' ' + t('impImported') + ' • ' + rs.skipped + ' ' + t('impSkipped') + '</p></div>';
  }
  return '<h3 class="mt-14">' + t('impPreview') + ' — ' + rows.length + ' ' + t('recordsWord') + '</h3>' +
    '<p class="muted">' + valid + ' ' + t('impValid') + ' • ' + errs + ' ' + t('impError') + ' • ' + dups + ' ' + t('impDuplicate') + (impd ? ' • ' + impd + ' ' + t('impImported') : '') + (importState.fileName ? ' • ' + esc(importState.fileName) : '') + '</p>' +
    '<div class="tbl-wrap imp-scroll"><table><thead><tr><th>#</th><th>' + t('thName') + '</th><th>' + t('thClass') + '</th><th>' + t('thPhone') + '</th><th>' + t('thStatus') + '</th><th>' + t('impReason') + '</th></tr></thead><tbody>' +
    (trs || '<tr><td colspan="6"><div class="empty">' + t('impNoRows') + '</div></td></tr>') + '</tbody></table></div>' +
    '<div class="actions toolbar-start">' +
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
  // v33: for a server account every number is minted from the server
  // first (one sequential pass, so no two rows share a number); offline
  // rows are imported without a number and minted on the next sync.
  // Local-only accounts mint locally, exactly as before.
  var act = sbSyncActive();
  if (act && sbIsOnline()) {
    var validCount = rows.filter(function (r) { return r.status === 'valid' && r.data; }).length;
    sbGetValidToken().then(function (tok) {
      if (!tok) throw new Error('no-token');
      return sbGetSchoolIdForSync(act.account, act.uid, tok).then(function (schoolId) {
        if (!schoolId) throw new Error('no-school-id');
        return sbFetchTakenNumbers(tok, schoolId).then(function (taken) {
          return sbMintManyAdmNos(tok, schoolId, taken, validCount);
        });
      });
    }).then(function (nums) { confirmImportRun(rows, nums); })
      .catch(function () { confirmImportRun(rows, 'pending'); });
    return;
  }
  confirmImportRun(rows, act ? 'pending' : null);
}
function confirmImportRun(rows, numberSource) {
  var imported = 0, skipped = 0;
  var numIdx = 0;
  rows.forEach(function (r, i) {
    if (r.status !== 'valid' || !r.data) { if (r.status === 'error' || r.status === 'duplicate') skipped++; return; }
    // Re-check duplicates at import time, so a second Confirm (or data that
    // changed since the preview) can never import the same student twice.
    var dup = findDupStudent(r.data, null);
    if (dup) { r.status = 'duplicate'; r.errors = [t('impErrDup') + ' ' + dup.name + ' (' + (dup.admissionNo || dup.enr || '') + ' • ' + dup.cls + ')']; skipped++; return; }
    var d = r.data;
    var nums;
    if (Array.isArray(numberSource)) nums = numberSource[numIdx++] || { admissionNo: '', enr: '' };
    else if (numberSource === 'pending') nums = { admissionNo: '', enr: '', numPending: true };
    else nums = { admissionNo: nextAdmNo(), enr: nextEnr() };
    var admNo = nums.admissionNo;
    var rec = { id: uniqueId('stu'), att: 100, result: 0, fee: '—', enr: nums.enr, admissionNo: admNo, status: 'Active' };
    if (nums.numPending) rec.numPending = true;
    Object.keys(d).forEach(function (k) { rec[k] = d[k]; });
    rec.parentPinHash = hashPin(randomPin()); // v54 (A1): imported students get a random PIN stored as a salted hash — never the phone's last 4 digits, never plaintext, and the value is never shown
    rec.roll = d.roll || nextRoll(d.cls);
    // No fee record is created on import: dues are created by Generate Fees.
    // (The single-admission form adds a ₹6,000 placeholder record; a bulk
    // import of many students must not silently inflate the fee totals.)
    db.students.push(rec);
    logAudit('Bulk import', rec.name + ' • ' + (admNo || 'pending') + ' • ' + rec.cls);
    r.status = 'imported';
    imported++;
  });
  importState.result = { imported: imported, skipped: skipped };
  saveDB(db);
  toast(t('tImpDone') + ' ' + imported + ' ' + t('impImported') + '.');
  openImportModal();
}
function donutPct(v, total) { return total ? Math.round(v / total * 100) : 0; }
function holidayFor(date, cls) {
  // v100: the holiday row for a class-day, or null. One holiday per
  // class per date (migrateV100 dedupes on load).
  return (db.holidays || []).find(function (h) { return h.date === date && h.cls === cls; }) || null;
}
function isHoliday(date, cls) {
  return !!holidayFor(date, cls);
}
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
    var kp100 = k.split('|');
    if (isHoliday(kp100[0], kp100[1])) return; // v100: a holiday class-day never counts
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
// live issue 17: the marked-day count, shared by studentAttPct
// and the Students-page average — ONE definition everywhere: marked
// records only, Present and Late count as attended, a holiday day
// never counts. A student with no marked days contributes nothing.
function studentAttCounts(s) {
  // Perf (v154): the old loop called isHoliday() — a linear .find over
  // db.holidays — for EVERY attendance key of EVERY student (1440 keys
  // x 500 students = 720K finds per full pass; measured 817 ms for 500
  // students in the harness). The holiday keys are collected into a
  // Set once per call now, and the attendance key itself IS the
  // 'date|cls' string, so no split is needed either. Same counts: a
  // key is skipped exactly when holidayFor(date, cls) would have found
  // a row for it (dates and class names never contain '|').
  var total = 0, attended = 0;
  var hol = {};
  (db.holidays || []).forEach(function (h) { if (h && h.date && h.cls) hol[h.date + '|' + h.cls] = true; });
  Object.keys(db.attendance || {}).forEach(function (k) {
    if (hol[k]) return; // v100: a holiday day never counts
    var recs = db.attendance[k] || {};
    var m = recs[s.id];
    if (!m) return;
    total++;
    if (m === 'Present' || m === 'Late') attended++;
  });
  return { present: attended, total: total };
}
function studentAttPct(s) {
  // v24: a student's attendance % is computed LIVE from the actual marked
  // records in db.attendance — so the figure moves the moment attendance
  // is marked. Present and Late both count as attended (the student was
  // there); Absent does not. Only when the student has NO marked days at
  // all do we fall back to the stored s.att (the seed / import / admission
  // value). Never write the computed value back into s.att — the stored
  // value stays the fallback.
  var c = studentAttCounts(s);
  return c.total ? Math.round(c.present / c.total * 100) : (s.att || 0);
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
  db.activities.unshift({ icon: icon, bg: bg, title: title, sub: sub, ts: new Date().toISOString(), localId: uniqueId('av') });
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
function closeModal() {
  $('modalRoot').innerHTML = '';
  stopPhotoWatch();
  // v152 (Bug B): closing the modal abandons the in-progress form,
  // including a picked-but-unsaved photo — drop it, or the re-mint
  // guard (sbHasPendingFile) would stay stuck on a dead pick.
  pendingPhoto = null;
}
var confirmCb = null;
function confirmModal(msg, cb) {
  confirmCb = cb;
  openModal('<h3>' + t('confirmTitle') + '</h3><p class="muted-sm">' + esc(msg) + '</p><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button><button type="button" class="btn danger" onclick="confirmYes()">' + t('confirmYes') + '</button></div>');
}
function confirmYes() { var cb = confirmCb; confirmCb = null; closeModal(); if (cb) cb(); }


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
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
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
    return schoolClasses().map(function (c) { return '<option ' + (c === cur ? 'selected' : '') + '>' + c + '</option>'; }).join('');
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
    resHtml = '<div class="card mt-16"><h3>' + t('promoDone') + '</h3><p>' + p.result.promoted + ' ' + t('promoPromoted') + ' • ' + p.result.retained + ' ' + t('promoRetained') + ' • ' + p.result.skipped + ' ' + t('impSkipped') + '</p></div>';
  }
  return '<div class="page-head"><div><h2>' + t('promoTitle') + '</h2><p>' + t('promoNote') + '</p></div>' +
    '<div class="toolbar"><button class="btn ghost" onclick="promoState=null;renderPage()">← ' + t('backDir') + '</button></div></div>' +
    (p.mode === 'single' ? '<p class="muted mb-12">' + t('promoSingleNote') + '</p>' : '') +
    '<div class="card"><div class="form-grid">' +
    '<div><label>' + t('promoFromSession') + '</label><select id="promoFromSession" onchange="onPromoFromChange()">' + sessOpts(p.fromSession) + '</select></div>' +
    '<div><label>' + t('promoFromClass') + '</label><select id="promoFromClass" onchange="onPromoFromChange()">' + clsOpts(p.fromCls) + '</select></div>' +
    '<div><label>' + t('promoToSession') + '</label><select id="promoToSession" onchange="onPromoToChange()">' + sessOpts(p.toSession) + '</select></div>' +
    '<div><label>' + t('promoToClass') + '</label><select id="promoToClass" onchange="onPromoToChange()">' + cpOpts(p.toCls) + '</select></div>' +
    '<div><label>' + t('promoToSection') + '</label><select id="promoToSection" onchange="onPromoToChange()">' + secOpts(p.toSec) + '</select></div>' +
    '</div></div>' +
    '<div class="card mt-16"><div class="head-row"><div><h3>' + list.length + ' ' + t('studentsW') + '</h3><p class="card-sub">' + selCount + ' ' + t('promoSelected') + '</p></div>' +
    '<div class="toolbar"><button class="btn ghost sm" onclick="togglePromoAll(true)">' + t('promoSelectAll') + '</button>' +
    '<button class="btn ghost sm" onclick="togglePromoAll(false)">' + t('promoSelectNone') + '</button></div></div>' +
    '<div class="promo-list">' + (rows || '<div class="empty">' + t('promoNoStudents') + '</div>') + '</div>' +
    '<div class="actions toolbar-start mt-16"><button class="btn green" onclick="doPromote(\'promote\')">' + t('promoPromote') + '</button>' +
    '<button class="btn ghost" onclick="doPromote(\'retain\')">' + t('promoRetain') + '</button></div></div>' + resHtml;
}
function deactivateStudent(id) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
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
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
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
  if (!canViewStudent(id)) { toast(t('tOwnProfileOnly')); return; }
  promoState = null;
  // Live #10: the profile only renders on the students view
  // (studentsPage returns the profile when profileStudent is set, and
  // renderPage dispatches on state.view) — without this, opening a
  // profile from Attendance / Exams / Fees set the id but re-rendered
  // the old view, so the tap visibly did nothing.
  state.view = 'students';
  state.profileStudent = id; state.profileTab = 'overview';
  persistSession();
  histPush({ view: 'students', sub: 'profile:' + id });
  renderPage();
  // v74 (P1-2): the cloud login no longer ships student photos — a cloud
  // teacher fetches the photo on demand when opening a profile.
  maybeLoadCloudStudentPhoto(id);
}
var _cloudPhotoLoading = {}; // v74 (P1-2): one in-flight photo fetch per student, so a profile re-open never double-fetches
function maybeLoadCloudStudentPhoto(id) {
  // Only a cloud teacher session has a token and a server photo to fetch.
  // The school's own device already has the photo locally (or none).
  if (!state.cloudTeacherToken || !state.user || !state.user.cloud) return;
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s || s.photo || !s.srvId || _cloudPhotoLoading[id]) return;
  _cloudPhotoLoading[id] = true;
  sbTeacherStudentPhoto(state.cloudTeacherToken, s.srvId).then(function (url) {
    _cloudPhotoLoading[id] = false;
    if (!url) return;
    var cur = db.students.find(function (x) { return x.id === id; });
    if (!cur) return;
    cur.photo = url;
    // Keep the photo in the saved cloud snapshot so a refresh keeps it.
    try { sessSet(CLOUD_TEACHER_KEY, JSON.stringify({ acct: state.user, slice: db, token: state.cloudTeacherToken })); } catch (e) {}
    if (state.profileStudent === id) renderPage();
  });
}
function setProfileTab(tab) { state.profileTab = tab; renderPage(); }
function studentProfilePage(id) {
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) {
    state.profileStudent = null;
    if (state.role !== 'school') return '<div class="card"><div class="empty">' + t('tNoStudentData') + '</div></div>';
    return studentsPage();
  }
  var stt = s.status || 'Active';
  var badgeCls = stt === 'Active' ? 'green' : stt === 'Inactive' ? 'grey' : stt === 'Draft' ? 'blue' : 'red';
  // v35: role-filtered tabs. A student sees their own record (no audit
  // log); a teacher never sees the fees tab (teachers cannot see fees).
  var allTabs = [['overview', 'tabOverview'], ['personal', 'tabPersonal'], ['parent', 'tabParent'], ['academic', 'tabAcademic'], ['attendance', 'tabAttendance'], ['fees', 'tabFees'], ['results', 'tabResults'], ['homework', 'tabHomework'], ['docs', 'tabDocs'], ['activity', 'tabActivity']];
  var tabs = allTabs.filter(function (tb) {
    if (tb[0] === 'activity') return state.role === 'school';
    if (tb[0] === 'fees') return state.role !== 'teacher';
    return true;
  });
  var tabBar = '<div class="tabs">' + tabs.map(function (tb) {
    return '<button class="tab-btn' + (state.profileTab === tb[0] ? ' on' : '') + '" onclick="setProfileTab(\'' + tb[0] + '\')">' + t(tb[1]) + '</button>';
  }).join('') + '</div>';
  var toolbar = state.role === 'school'
    ? '<div class="toolbar"><button class="btn ghost" onclick="backFromProfile()">← ' + t('backDir') + '</button>' +
    '<button class="btn" onclick="studentForm(\'' + s.id + '\')">' + t('editStudent') + '</button>' +
    '<button class="btn ghost" onclick="printIdCard(\'' + s.id + '\')">🪪 ' + t('actIdCard') + '</button>' +
    '<button class="btn ghost" onclick="openCertModal(\'' + s.id + '\')">📜 TC / Certificate</button>' + waChatBtn(s.id) +
    ((stt === 'Active' || stt === 'Inactive') ? '<button class="btn ghost" onclick="promoteSingle(\'' + s.id + '\')">⬆️ ' + t('promoSingle') + '</button>' : '') + '</div>'
    : state.role === 'principal'
    ? '<div class="toolbar"><button class="btn ghost" onclick="backFromProfile()">← ' + t('backDir') + '</button>' +
    '<button class="btn ghost" onclick="printIdCard(\'' + s.id + '\')">🪪 ' + t('actIdCard') + '</button>' +
    '<button class="btn ghost" onclick="openCertModal(\'' + s.id + '\')">📜 TC / Certificate</button></div>'
    : state.role === 'teacher'
    ? '<div class="toolbar"><button class="btn ghost" onclick="backFromProfile()">← ' + t('backDir') + '</button>' +
    '<button class="btn ghost" onclick="printIdCard(\'' + s.id + '\')">🪪 ' + t('actIdCard') + '</button>' + waChatBtn(s.id) + '</div>'
    : '<div class="toolbar"><button class="btn ghost" onclick="backFromProfile()">← ' + t('backDir') + '</button><button class="btn ghost" onclick="printIdCard(\'' + s.id + '\')">🪪 ' + t('actIdCard') + '</button></div>';
  return '<div class="page-head"><div class="prof-head">' + avatarHTML(s.photo, s.name, 'big-avatar') + '<div><h2>' + esc(s.name) + '</h2><p>' + esc(s.cls) + ' • ' + t('thAdmNo') + ' ' + esc(s.admissionNo || '—') + ' • ' + t('thEnr') + ' ' + esc(s.enr || '—') + ' • <span class="badge ' + badgeCls + '">' + stt + '</span></p></div></div>' +
    toolbar + '</div>' +
    tabBar + '<div class="mt-16">' + profileTabBody(s, state.profileTab || 'overview') + '</div>';
}
function profileTabBody(s, tab) {
  var d = s.documents || {};
  var kv = function (label, val) { return '<div class="kv"><b>' + label + '</b><span>' + val + '</span></div>'; };
  // v35: tabs hidden by role are also refused here, so a direct
  // setProfileTab call cannot open them either.
  if (tab === 'activity' && state.role !== 'school') return '<div class="card"><div class="empty">' + t('tNotAllowed') + '</div></div>';
  if (tab === 'fees' && state.role === 'teacher') return '<div class="card"><div class="empty">' + t('tNotAllowed') + '</div></div>';
  if (tab === 'personal') {
    return '<div class="card">' + kv(t('fStudentName'), esc(s.name)) + kv(t('fDob'), esc(s.dob || '—')) + kv(t('fGender'), esc(s.gender || '—')) + kv(t('fBlood'), esc(s.bloodGroup || '—')) + kv(t('fCategory'), esc(s.category || '—')) + kv(t('fAddress'), esc(s.address || '—')) + kv(t('fState'), esc(s.state || '—')) + kv(t('fDistrict'), esc(s.district || '—')) + kv(t('fPin'), esc(s.pin || '—')) + kv(t('fAadhaar'), maskAadhaar(s.aadhaar)) + '</div>';
  }
  if (tab === 'parent') {
    var base = '<div class="card">' + kv(t('fFather'), esc(s.fatherName || '—')) + kv(t('fMother'), esc(s.motherName || '—')) + kv(t('fGuardian'), esc(s.guardian || '—')) + kv(t('fPhone'), esc(s.phone || '—')) + kv(t('fPhone2'), esc(s.mobile2 || '—')) + kv(t('fParentEmail'), esc(s.parentEmail || '—')) + kv(t('fOccupation'), esc(s.occupation || '—')) + '</div>';
    if (state.role !== 'school') return base;
    var pinSet54 = pinHasPin(s); // v54 (A2): the PIN value is never rendered — at most "PIN set / not set"
    var pinBox = '<div class="card mt-16"><h3>' + t('stuPinTitle') + '</h3>' +
      '<div class="kv"><b>' + t('stuPinNow') + '</b><span>' + (pinSet54 ? t('stuPinSet') : '—') + '</span></div>' +
      '<p class="muted" style="margin:8px 0">' + t('tPinAuto') + (pinSet54 ? '' : ' ' + t('stuPinNone')) + '</p>' +
      '<div class="form-grid"><div><label>' + t('stuPinNew') + '</label><input id="fStuPinNew" type="password" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="4–6 digits"></div></div>' +
      '<div class="toolbar mt-12"><button class="btn" onclick="setStudentPin(\'' + s.id + '\')">' + t('stuPinSetBtn') + '</button>' +
      '<button class="btn" onclick="generateStudentPin(\'' + s.id + '\')">' + t('stuPinGenerate') + '</button>' +
      '<button class="btn ghost" onclick="clearStudentPin(\'' + s.id + '\')">' + t('stuPinClear') + '</button></div></div>';
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
      return '<tr><td>' + r.month + '</td><td>' + esc(feeTypeLabel(feeTypeOf(r))) + '</td><td>' + inr(r.amount) + '</td><td>' + esc(r.date) + '</td><td><span class="badge ' + (r.status === 'Collected' ? 'green' : 'orange') + '">' + r.status + '</span></td><td>' + receiptCellForRecord(r) + '</td></tr>';
    }).join('');
    return '<div class="stats">' + statCard('🧾', 'blue', t('totalBilled'), sum.billed, '', 'up', { prefix: '₹' }) + statCard('✅', 'green', t('totalPaid'), sum.paid, '', 'up', { prefix: '₹' }) + statCard('⏰', 'red', t('totalPending'), sum.pend, '', 'down', { prefix: '₹' }) + '</div>' +
      '<div class="card"><h3>' + t('feeByType') + '</h3>' + (btRows || '<p class="muted">' + t('tNoFeeRecs') + '</p>') + '</div>' +
      '<div class="card mt-16"><h3>' + t('feeRecsH') + '</h3><div class="tbl-wrap fee-hist-tbl"><table><thead><tr><th>' + t('thMonth') + '</th><th>' + t('thType') + '</th><th>' + t('thAmount') + '</th><th>' + t('thDate') + '</th><th>' + t('thStatus') + '</th><th>' + t('thReceipt') + '</th></tr></thead><tbody>' + (frs || '<tr><td colspan="6"><div class="empty">' + t('tNoFeeRecs') + '</div></td></tr>') + '</tbody></table></div>' +
      (state.role !== 'school' ? '' : '<div class="toolbar mt-12"><button class="btn" onclick="viewStudentFees(\'' + s.id + '\')">' + t('openFees') + '</button></div>') + '</div>';
  }
  if (tab === 'results') {
    var exs = db.exams.filter(function (e) { return e.cls === s.cls && isActiveExam(e); }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
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
    return '<div class="card">' + docRow(t('fBirthCert'), !!d.birthCert) + docRow(t('fTc'), !!d.tc) + kv(t('fTcNo'), esc(d.tcNumber || '—')) + kv(t('fDocsOther'), esc(d.other || '—')) + '<p class="muted mt-10">' + t('docsNote') + '</p></div>';
  }
  if (tab === 'activity') {
    var acts = dedupeAuditRows((db.auditLog || []).filter(function (a) {
      var det = a.details || '';
      if (s.admissionNo) return det.indexOf(s.admissionNo) !== -1;
      return det.indexOf(s.name) !== -1;
    }));
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
  // v38: pending dues with a per-due WhatsApp reminder. This is also
  // the teacher's entry point for fee reminders (teachers cannot open
  // the Fees page) — waReminderBtn enforces the assigned-class rule,
  // and a student never sees a button here.
  var pendRecs38 = (db.feeRecords || []).filter(function (r) { return r.studentId === s.id && r.status === 'Pending'; });
  var pendHtml38 = '';
  if (pendRecs38.length && state.role !== 'student') {
    pendHtml38 = '<div class="card mt-16"><h3>' + t('pendingW') + '</h3>' + pendRecs38.map(function (r) {
      return '<div class="type-row"><b>' + esc(r.month) + ' • ' + esc(feeTypeLabel(feeTypeOf(r))) + '</b><span>' + inr(r.amount) + ' ' + waReminderBtn(r.id, s.id) + '</span></div>';
    }).join('') + '</div>';
  }
  return '<div class="stats">' +
    statCard('📊', 'blue', t('attPct'), studentAttPct(s), '', 'up', { suffix: '%' }) +
    statCard('💰', 'green', t('feeSt'), pendAmt, '', pendAmt ? 'down' : 'up', { prefix: '₹' }) +
    statCard('📝', 'orange', t('latestExam'), lex ? lex.pct : '—', lex ? lex.name : t('tNotEntered'), 'up', lex ? { suffix: '%' } : {}) +
    statCard('📚', 'red', t('hwPending'), hwPend, '', 'up') +
    '</div>' +
    '<div class="card">' + kv(t('fGuardian'), esc(s.guardian || '—')) + kv(t('fPhone'), esc(s.phone || '—')) + kv(t('fAdmNo'), esc(s.admissionNo || '—')) + kv(t('thEnr'), esc(s.enr || '—')) + kv(t('fAdmDate'), esc(s.admissionDate || '—')) + kv(t('fSession'), esc(s.session || '—')) + kv(t('thStatus'), esc(s.status || 'Active')) + '</div>' + pendHtml38;
}
function setStudentPin(id) {
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s || state.role !== 'school') return;
  var v = digitsOnly($('fStuPinNew') ? $('fStuPinNew').value : '');
  if (v.length !== 6) { toast(t('tPinLen6')); return; } // v146: new PINs are 6 digits (4-digit was too weak)
  s.parentPinHash = hashPin(v); delete s.parentPin; // v54 (A1): stored as a salted hash, never plaintext
  logAudit('Student PIN set', s.name + ' • ' + (s.admissionNo || '') + ' • ' + s.cls);
  saveDB(db); renderPage();
  toast(t('tPinSet'));
}
// v146: admin-issued parent PIN reset — the ONLY reset path now (the
// DOB self-service is gone, SQL 54). The school generates a fresh
// 6-digit random PIN and shares it with the parent out-of-band (in
// person / phone / the school's own WhatsApp). The PIN is shown ONCE
// here — it is never stored in plaintext, never rendered again, and
// never sent anywhere except the admin RPC (over TLS) and the student
// upsert (as a salted hash). The local lock is cleared at once; the
// server lock clears through the admin RPC when online, else on the
// parent's first successful login with the new PIN.
function generateStudentPin(id) {
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s || state.role !== 'school') return;
  var pin = randomPin();
  s.parentPinHash = hashPin(pin); delete s.parentPin;
  logAudit('Parent PIN reset (admin-issued)', s.name + ' • ' + (s.admissionNo || '') + ' • ' + s.cls);
  try { pinFailClear(state.user.uid, s.id); } catch (e) {}
  saveDB(db);
  var srvId = null;
  try { srvId = sbServerSchoolMap()[state.user.uid] || null; } catch (e2) { srvId = null; }
  if (srvId && sbIsOnline()) sbAdminResetParentPin(srvId, s.admissionNo || '', pin);
  renderPage();
  openModal('<h3>' + t('stuPinIssuedTitle') + '</h3><p class="muted-sm">' + t('stuPinShowOnce') + '</p><p style="font-size:34px;letter-spacing:8px;text-align:center;margin:16px 0"><b>' + esc(pin) + '</b></p><div class="actions"><button type="button" class="btn" onclick="closeModal()">' + t('stuPinGotIt') + '</button></div>');
}
function clearStudentPin(id) {
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s || state.role !== 'school') return;
  delete s.parentPinHash; s.parentPin = ''; // v54 (A1): clearing removes the hash and leaves the empty-string sentinel — deleting the field too would let migrateV12 assign a fresh random PIN hash on the next load (a cleared PIN would come back)
  logAudit('Student PIN cleared', s.name + ' • ' + (s.admissionNo || '') + ' • ' + s.cls);
  saveDB(db); renderPage();
  toast(t('tPinCleared'));
}
function deleteStudent(id) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
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

/* ================= v38: WhatsApp via wa.me links (MANUAL send only) =================
   HARD RULES (the user's own decisions — never break these):
   - NO automation, NO WhatsApp API, NO unofficial bot/library, NO
     auto-send, NO bulk send. The app only OPENS a wa.me chat with the
     message prefilled; the user presses Send inside WhatsApp. Same
     safe pattern as the Target Academy fee-receipt wa.me button.
   - NEVER anything that could disconnect the school's WhatsApp
     number: no WhatsApp login, no session, no QR — only wa.me links.
   - HONEST wording everywhere: the app opens WhatsApp, it cannot
     know whether the user pressed Send — buttons and logs say
     "Open WhatsApp" / "WhatsApp opened", never "Sent".
   - Templates never carry Aadhaar, PINs, passwords or any other
     sensitive field — only school name, student name, class, month,
     amount and date. */
function waNormalizePhone(raw) {
  // Indian mobiles only: 10-digit, 0-prefixed, +91-prefixed, spaces /
  // dashes all normalise to 91XXXXXXXXXX. Anything else is rejected
  // (the button is disabled and the action toasts the reason).
  var d = digitsOnly(raw);
  if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
  else if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
  if (d.length !== 10) return '';
  if ('6789'.indexOf(d.charAt(0)) === -1) return ''; // Indian mobiles start 6-9
  return '91' + d;
}
function waFill(tpl, map) {
  // Placeholder fill without regexes: {school}, {student}, {cls},
  // {month}, {amount}, {date}, {receipt}.
  var out = tpl;
  Object.keys(map).forEach(function (k) { out = out.split('{' + k + '}').join(map[k]); });
  return out;
}
function waSchoolPhoneLine() {
  // The school's contact number, when the school profile has one.
  var ph = (db.profile && db.profile.phone) ? String(db.profile.phone).trim() : '';
  return ph ? '\n' + t('waSchoolContact') + ': ' + ph : '';
}
function waOpenUrl(url) {
  // The ONE place that opens WhatsApp. wa.me only opens the chat with
  // the message prefilled — nothing is sent by the app itself.
  try { if (typeof window !== 'undefined' && window.open) window.open(url, '_blank'); } catch (e) {}
  return url;
}
function waLogOpen(kind, s) {
  // "WhatsApp opened", never "sent" — the app cannot know whether the
  // user pressed Send inside WhatsApp.
  logAudit('WhatsApp opened', kind + ' • ' + s.name + ' • ' + (s.admissionNo || '') + ' • ' + s.cls);
  saveDB(db);
}
function waCanUse(studentId) {
  // Shared role guard for every WhatsApp action (v35 roles): a student
  // can never open one; a parent neither — the button would open wa.me
  // to the child's own phone number (the parent messaging themself).
  // A teacher / staff member only for students in the classes they
  // work with; the accountant reminds too (v92: collects + reminds);
  // the principal is read-only and never messages. The school admin
  // can use them all.
  if (state.role === 'student') return false;
  if (state.role === 'parent') return false;
  if (state.role === 'teacher') return canViewStudent(studentId);
  if (state.role === 'staff') {
    var st = db.students.find(function (x) { return x.id === studentId; });
    if (!st) return false;
    return roleClasses().indexOf(st.cls) !== -1;
  }
  if (state.role === 'accountant') return true;
  return state.role === 'school';
}
function waFeeReminder(recordId) {
  var r = db.feeRecords.find(function (x) { return x.id === recordId; });
  if (!r || r.status !== 'Pending') return false;
  var s = db.students.find(function (x) { return x.id === r.studentId; });
  if (!s) return false;
  if (!waCanUse(s.id)) { toast(t('tNotAllowed')); return false; }
  var norm = waNormalizePhone(s.phone);
  if (!norm) { toast(t('waNoNumber')); return false; }
  var msg = waFill(t('waFeeReminderMsg'), { school: db.profile.name, student: s.name, cls: s.cls, amount: inr(r.amount), month: r.month }) + waSchoolPhoneLine();
  waOpenUrl('https://wa.me/' + norm + '?text=' + encodeURIComponent(msg));
  waLogOpen('Fee reminder', s);
  toast(t('waOpened'));
  return true;
}
function waAbsentAlert(studentId) {
  var s = db.students.find(function (x) { return x.id === studentId; });
  if (!s) return false;
  if (!waCanUse(s.id)) { toast(t('tNotAllowed')); return false; }
  var date = state.attDate || todayIST();
  var recs = db.attendance[date + '|' + s.cls] || {};
  var mark = recs[studentId];
  if (mark !== 'Absent' && mark !== 'Late') { toast(t('waNotAbsent')); return false; }
  var norm = waNormalizePhone(s.phone);
  if (!norm) { toast(t('waNoNumber')); return false; }
  var msg = waFill(t(mark === 'Absent' ? 'waAbsentMsg' : 'waLateMsg'), { school: db.profile.name, student: s.name, cls: s.cls, date: date }) + waSchoolPhoneLine();
  waOpenUrl('https://wa.me/' + norm + '?text=' + encodeURIComponent(msg));
  waLogOpen(mark === 'Absent' ? 'Absent alert' : 'Late alert', s);
  toast(t('waOpened'));
  return true;
}
function waReceiptShare(receiptNo) {
  // School only: fees are not a teacher's area, and a student never
  // shares receipts.
  if (state.role !== 'school') { toast(t('tNotAllowed')); return false; }
  var rc = (db.receipts || []).find(function (x) { return x.receiptNo === receiptNo; });
  if (!rc) return false;
  // v47: the message names the student from the receipt itself (see
  // receiptStudent) — a stale local seed row must never rename the
  // message. The phone still comes from the local row: the receipt
  // carries no phone number.
  var rs = receiptStudent(rc);
  var s = db.students.find(function (x) { return x.id === rc.studentId; });
  if (!s) return false;
  var norm = waNormalizePhone(s.phone);
  if (!norm) { toast(t('waNoNumber')); return false; }
  var msg = waFill(t('waReceiptMsg'), { school: db.profile.name, student: rs.name, cls: rs.cls, receipt: rc.receiptNo, amount: inr(rc.total), month: rc.month, date: rc.date }) + waSchoolPhoneLine();
  waOpenUrl('https://wa.me/' + norm + '?text=' + encodeURIComponent(msg));
  waLogOpen('Receipt share', s);
  toast(t('waOpened'));
  return true;
}
function waProfileChat(studentId) {
  var s = db.students.find(function (x) { return x.id === studentId; });
  if (!s) return false;
  if (!waCanUse(s.id)) { toast(t('tNotAllowed')); return false; }
  var norm = waNormalizePhone(s.phone);
  if (!norm) { toast(t('waNoNumber')); return false; }
  var msg = waFill(t('waGreetMsg'), { school: db.profile.name, student: s.name, cls: s.cls }) + waSchoolPhoneLine();
  waOpenUrl('https://wa.me/' + norm + '?text=' + encodeURIComponent(msg));
  waLogOpen('Profile chat', s);
  toast(t('waOpened'));
  return true;
}
function waReminderBtn(recordId, studentId) {
  // The fee-reminder button for one pending due row. v125: it renders
  // only when the action can work (waCanUse) — a parent or principal
  // used to see a button whose click only toasted 'Not allowed', and
  // the accountant's button was dead too (waCanUse never allowed the
  // role). A missing parent number still shows an honest DISABLED
  // button with the reason in its title, not a dead control.
  var s = db.students.find(function (x) { return x.id === studentId; });
  if (!s) return '';
  if (!waCanUse(studentId)) return '';
  if (!waNormalizePhone(s.phone)) return '<button class="btn ghost sm" disabled title="' + esc(t('waNoNumber')) + '">💬 ' + t('waReminderBtn') + '</button>';
  return '<button class="btn ghost sm" onclick="waFeeReminder(\'' + recordId + '\')">💬 ' + t('waReminderBtn') + '</button>';
}
function waChatBtn(studentId) {
  // The profile WhatsApp button. v125: same rule as waReminderBtn —
  // render only when waCanUse allows it, so a parent or principal
  // never sees a button whose click only toasts 'Not allowed'.
  // Disabled with the reason when the parent number is unusable.
  var s = db.students.find(function (x) { return x.id === studentId; });
  if (!s) return '';
  if (!waCanUse(studentId)) return '';
  if (!waNormalizePhone(s.phone)) return '<button class="btn ghost" disabled title="' + esc(t('waNoNumber')) + '">💬 ' + t('waChatBtn') + '</button>';
  return '<button class="btn ghost" onclick="waProfileChat(\'' + studentId + '\')">💬 ' + t('waChatBtn') + '</button>';
}
function onAttCls148(v) { attClsPicked148 = true; state.attCls = v; renderPage(); } // v148 (bug 8): a picked class sticks — the first-open fallback never overrides it
function attendancePage() {
  if (!state.attDate) state.attDate = todayIST();
  // v35: a teacher only ever sees their own assigned classes — the class
  // picker is restricted, and a stale attCls outside the assignment is
  // pulled back to the first assigned class.
  // v93: a staff member is restricted the same way (their own classes).
  if (state.role === 'teacher' || state.role === 'staff') {
    var myCls35 = roleClasses();
    if (!myCls35.length) return '<div class="page-head"><div><h2>' + t('attendance') + '</h2></div></div><div class="card"><div class="empty">' + t('tchrNoClassesYet') + '</div></div>';
    if (myCls35.indexOf(state.attCls) === -1) state.attCls = myCls35[0];
  }
  // v148 (bug 8): Attendance opened on 10th-A by default, which has no
  // students here — an empty register on open. On first open (or when
  // the class no longer exists), fall back to the first class that
  // actually has enrolled students. Once the admin picks a class the
  // choice sticks — even an empty class stays open (holidays, new
  // sections); the fallback never yanks it away.
  if (!attClsPicked148 || roleClasses().indexOf(state.attCls) === -1) {
    var with148 = roleClasses().filter(function (c) { return db.students.some(function (s) { return s.cls === c && isEnrolledStudent(s); }); });
    if (with148.length && with148.indexOf(state.attCls) === -1) state.attCls = with148[0];
  }
  var cls = state.attCls;
  // v34 (P1-10): rosters are enrolled students only — Cancelled/Draft
  // never appear on the register.
  var roster = db.students.filter(function (s) { return s.cls === cls && isEnrolledStudent(s); });
  var key = state.attDate + '|' + cls;
  var hol100 = holidayFor(state.attDate, cls); // v100: a holiday day has no register
  var recs = db.attendance[key] || {};
  var rows = roster.map(function (s) {
    // Live #8: an unmarked student must NOT look Present. The old
    // default ('Present') lit the Present button green while the header
    // counts (correctly) said 0 Present — v88b fixed the counts but
    // left the button default. No mark now means no button is 'on'.
    var cur = recs[s.id] || '';
    if (hol100) return '<tr><td><button class="linklike" onclick="openStudentProfile(\'' + s.id + '\')">' + esc(s.name) + '</button></td><td>' + s.roll + '</td><td><span class="badge orange">' + t('holidayWord') + '</span></td><td><span class="muted">—</span></td></tr>';
    // v38: an Absent/Late student can be notified on WhatsApp (manual
    // wa.me chat, parent presses nothing here — the admin presses Send
    // inside WhatsApp). The button appears only for Absent/Late marks.
    // v88: a principal sees the status as text — no mark buttons, no
    // WhatsApp button. v88b: an unmarked student shows "Not marked", not
    // "Present" — the row used to default to Present while the header
    // counts (correctly) said Not marked.
    if (state.role === 'principal') {
      var curP = recs[s.id];
      var badgeP = curP ? '<span class="badge ' + (curP === 'Present' ? 'green' : curP === 'Absent' ? 'red' : 'orange') + '">' + curP + '</span>' : '<span class="badge grey">' + t('attNotMarked') + '</span>';
      return '<tr><td><button class="linklike" onclick="openStudentProfile(\'' + s.id + '\')">' + esc(s.name) + '</button></td><td>' + s.roll + '</td><td>' + badgeP + '</td><td><span class="muted">—</span></td></tr>';
    }
    var notifyCell = (cur === 'Absent' || cur === 'Late')
      ? '<button class="btn ghost sm" onclick="waAbsentAlert(\'' + s.id + '\')">💬 ' + t('waNotifyBtn') + '</button>'
      : '<span class="muted">—</span>';
    return '<tr><td><button class="linklike" onclick="openStudentProfile(\'' + s.id + '\')">' + esc(s.name) + '</button></td><td>' + s.roll + '</td><td><div class="mark-btns">' +
      ['Present', 'Absent', 'Late'].map(function (m) {
        return '<button class="' + m[0].toLowerCase() + (cur === m ? ' on' : '') + '" onclick="markAtt(\'' + s.id + '\',\'' + m + '\')">' + (m === 'Present' ? t('presBtn') : m === 'Absent' ? t('absBtn') : t('lateBtn')) + '</button>';
      }).join('') + (recs[s.id] ? '<button class="btn ghost sm" title="' + esc(t('attClear')) + '" onclick="clearAttMark(\'' + s.id + '\')">\u2715</button>' : '') + '</div></td><td>' + notifyCell + '</td></tr>';
  }).join('');
  // v34 (P1-9): an unmarked student is "Not marked", not Present — the
  // Present default lives only in the marking buttons above. Counting an
  // unmarked student as Present inflated the day's attendance.
  var counts = { Present: 0, Absent: 0, Late: 0, NotMarked: 0 };
  roster.forEach(function (s) {
    var m = recs[s.id];
    if (!m) counts.NotMarked++;
    else if (m === 'Present') counts.Present++;
    else if (m === 'Absent') counts.Absent++;
    else counts.Late++;
  });
  var clsOpts = roleClasses().map(function (c) { return '<option ' + (cls === c ? 'selected' : '') + '>' + c + '</option>'; }).join(''); // v35: a teacher's picker is their own classes; v93: a staff member's too
  var ta = todayAtt();
  // v100: mark-all + holiday tools. A principal sees none of them; a
  // teacher/staff member gets mark-all only (holidays are a school
  // decision — a teacher's slice cannot sync them, so only the school
  // role marks or removes a holiday). On a holiday day the only tool
  // is Remove Holiday (school only); there is nothing to save.
  var attTools = '';
  if (state.role !== 'principal') {
    if (hol100) { if (state.role === 'school') attTools = '<button class="btn ghost" onclick="removeHoliday()">' + t('removeHoliday') + '</button>'; }
    else {
      if (state.role === 'school') attTools = '<button class="btn" onclick="markHoliday()">🎉 ' + t('markHoliday') + '</button>';
      attTools += '<button class="btn" onclick="markAllAtt(\'Present\')">' + t('markAllPresent') + '</button><button class="btn" onclick="markAllAtt(\'Absent\')">' + t('markAllAbsent') + '</button><button class="btn green" onclick="saveAttendance()">✓ ' + t('saveAttendance') + '</button><button class="btn ghost" onclick="clearAttDay()">' + t('attClearDay') + '</button>';
    }
  }
  return '<div class="page-head"><div><h2>' + t('attendance') + '</h2><p>Class ' + esc(cls) + ' • ' + esc(state.attDate) + ' — ' + (hol100 ? t('holidayWord') : counts.Present + ' ' + t('presBtn') + ', ' + counts.Absent + ' ' + t('absBtn') + ', ' + counts.Late + ' ' + t('lateBtn') + (counts.NotMarked ? ', ' + counts.NotMarked + ' ' + t('attNotMarked') : '')) + '</p></div>' +
    '<div class="toolbar"><select onchange="onAttCls148(this.value)">' + clsOpts + '</select>' +
    '<input type="date" value="' + esc(state.attDate) + '" max="' + todayIST() + '" onchange="onAttDate(this.value)" style="min-width:160px">' +
    attTools + '</div></div>' + // v88b: a principal never sees the Save Attendance button; v100: mark-all + holiday tools live in attTools
    '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('thStudent') + '</th><th>' + t('thRoll') + '</th><th>' + t('thStatus') + '</th><th>' + t('waNotifyCol') + '</th></tr></thead><tbody>' + (rows || '<tr><td colspan="4"><div class="empty">' + t('attNoStudents') + '</div></td></tr>') + '</tbody></table></div>' +
    (state.role === 'teacher' ? '' : '<p class="muted mt-12">School-wide today: ' + num(ta.present) + ' Present • ' + num(ta.absent) + ' Absent • ' + num(ta.late) + ' Late (' + donutPct(ta.present, ta.total) + '% attendance).</p>') + '</div>' + holidaysCard100(cls);
}
function onAttDate(v) {
  if (v > todayIST()) { toast(t('tFutureDate')); state.attDate = todayIST(); }
  else state.attDate = v;
  renderPage();
}
function markAtt(id, m) {
  // v35: a teacher marks only their own assigned class, and only a
  // student on this class's roster.
  // v93: a staff member marks only their own assigned class too.
  // v88: a principal is read-only — they never mark attendance.
  if (state.role === 'principal') { toast(t('tNotAllowed')); return; }
  if ((state.role === 'teacher' || state.role === 'staff') && roleClasses().indexOf(state.attCls) === -1) { toast(t('tNotAllowed')); return; }
  var stu = db.students.find(function (x) { return x.id === id; });
  if (stu && stu.cls !== state.attCls) { toast(t('tNotAllowed')); return; }
  var key = state.attDate + '|' + state.attCls;
  // v121: a (re-)mark supersedes any prior delete of the same student-day.
  // The delete's tombstone would otherwise make the next pull treat the
  // re-created server row as a zombie (skip it + re-queue its delete),
  // and the flush then marks the key synced — so the pull drops the local
  // mark too (live v120: a mark saved at 14:19:03 IST vanished by the
  // next cycle, and the server row was deleted by the re-queued delete).
  var tombUid121 = (typeof state !== 'undefined' && state.sb && state.sb.uid) || '';
  if (tombUid121) sbTombRemove(tombUid121, 'ss_attendance', state.attDate + '|' + state.attCls + '|' + id);
  // v62: a cloud teacher writes through the server RPC, not the local
  // DB. Optimistic: the slice updates at once, and a failed call reverts
  // it. A dead token logs the teacher out (re-login mints a new one).
  // v98: a cloud staff member writes through the STAFF RPCs (SQL 35) —
  // before v98 their taps only ever reached the local slice.
  var attToken98 = state.cloudTeacherToken || state.cloudStaffToken;
  var attFn98 = state.cloudTeacherToken ? sbTeacherMarkAttendance : sbStaffMarkAttendance;
  if (attToken98) {
    if (!stu || !stu.srvId) { toast(t('tNotSaved')); return; }
    var prev = (db.attendance[key] || {})[id];
    if (!db.attendance[key]) db.attendance[key] = {};
    db.attendance[key][id] = m;
    renderPage();
    attFn98(attToken98, state.attDate, state.attCls, stu.srvId, m).then(function (res) {
      if (res && res.ok) return;
      if (prev === undefined) delete db.attendance[key][id]; else db.attendance[key][id] = prev;
      if (res && res.error === 'bad_token') { toast(t('tCloudSessionExpired')); logout(); return; }
      toast(t('tNotSaved'));
      renderPage();
    });
    return;
  }
  if (!db.attendance[key]) db.attendance[key] = {};
  db.attendance[key][id] = m;
  saveDB(db); // autosave — marks are never lost on page change
  renderPage();
}
function saveAttendance() {
  // v88b: a principal is read-only — they never save attendance.
  if (state.role === 'principal') { toast(t('tNotAllowed')); return; }
  // v35: a teacher saves only their own assigned class.
  // v93: a staff member saves only their own assigned class too.
  if ((state.role === 'teacher' || state.role === 'staff') && roleClasses().indexOf(state.attCls) === -1) { toast(t('tNotAllowed')); return; }
  var key = state.attDate + '|' + state.attCls;
  var recs = db.attendance[key] || {};
  // v25: attendance saves go to the audit log too, so the full Activity
  // Log shows them. Recent Activities keeps its own db.activities entry
  // (addActivity below) — one save = one entry in each list, never two
  // in either. v34 (P1-9): counts treat unmarked as "Not marked" (a
  // separate count), matching the page header; v34 (P1-10): Cancelled/
  // Draft students are not on the roster and not in the counts.
  // v97: the counts are computed BEFORE the cloud branch now, because
  // both paths log the same summary — the local path to db.auditLog,
  // the cloud path to the server via sbLogAuditCloud (SQL 34).
  var counts = { Present: 0, Absent: 0, Late: 0, NotMarked: 0 };
  db.students.filter(function (s) { return s.cls === state.attCls && isEnrolledStudent(s); }).forEach(function (s) {
    var m = recs[s.id];
    if (!m) counts.NotMarked++;
    else if (m === 'Present') counts.Present++;
    else if (m === 'Absent') counts.Absent++;
    else counts.Late++;
  });
  var attSummary = 'Class ' + state.attCls + ' • ' + state.attDate + ' • ' + counts.Present + ' Present, ' + counts.Absent + ' Absent, ' + counts.Late + ' Late' + (counts.NotMarked ? ', ' + counts.NotMarked + ' Not marked' : '');
  // v62: a cloud teacher's taps already went to the server one by one —
  // there is nothing local to save. v97: the save STILL writes an audit
  // row — via the server RPC, never a local row (the v62 harness pins
  // that a cloud save leaves the local audit list untouched).
  // v98: a cloud staff member's save logs the same way — the audit RPC
  // (SQL 34) already accepts staff tokens.
  var attSaveToken98 = state.cloudTeacherToken || state.cloudStaffToken;
  if (attSaveToken98) {
    sbLogAuditCloud(attSaveToken98, 'Attendance updated', attSummary, 'Attendance updated', 'Class ' + state.attCls, '✅', 'blue');
    toast('✓ ' + t('tAttSaved') + ' — Class ' + state.attCls + ' (' + state.attDate + ').');
    return;
  }
  logAudit('Attendance updated', attSummary);
  addActivity('✅', 'blue', 'Attendance updated', 'Class ' + state.attCls);
  saveDB(db);
  toast('✓ ' + t('tAttSaved') + ' — Class ' + state.attCls + ' (' + state.attDate + ').');
}
function markAllAtt(m) {
  // v100: one tap marks the whole register Present or Absent — a
  // 40-student class no longer needs 40 taps. Same guards as markAtt:
  // a principal is read-only; a teacher/staff member only their own
  // assigned class. Local: one map write + one saveDB. Cloud: one RPC
  // per student (the existing per-tap RPCs — no bulk RPC yet); a failed
  // call reverts only that student, the rest stay marked.
  if (state.role === 'principal') { toast(t('tNotAllowed')); return; }
  if ((state.role === 'teacher' || state.role === 'staff') && roleClasses().indexOf(state.attCls) === -1) { toast(t('tNotAllowed')); return; }
  if (m !== 'Present' && m !== 'Absent') return;
  if (holidayFor(state.attDate, state.attCls)) { toast(t('tHolidayExists')); return; }
  var roster = db.students.filter(function (s) { return s.cls === state.attCls && isEnrolledStudent(s); });
  if (!roster.length) return;
  var key = state.attDate + '|' + state.attCls;
  // v121: same tombstone clear as markAtt, for the whole roster at once —
  // a re-marked day supersedes any prior delete of those keys.
  var tombUid121b = (typeof state !== 'undefined' && state.sb && state.sb.uid) || '';
  if (tombUid121b) roster.forEach(function (s) { sbTombRemove(tombUid121b, 'ss_attendance', state.attDate + '|' + state.attCls + '|' + s.id); });
  var attToken100 = state.cloudTeacherToken || state.cloudStaffToken;
  var attFn100 = state.cloudTeacherToken ? sbTeacherMarkAttendance : sbStaffMarkAttendance;
  if (attToken100) {
    if (!db.attendance[key]) db.attendance[key] = {};
    var prevs = {};
    roster.forEach(function (s) {
      prevs[s.id] = db.attendance[key][s.id];
      if (!s.srvId) return;
      db.attendance[key][s.id] = m;
    });
    renderPage();
    roster.forEach(function (s) {
      if (!s.srvId) return;
      attFn100(attToken100, state.attDate, state.attCls, s.srvId, m).then(function (res) {
        if (res && res.ok) return;
        if (prevs[s.id] === undefined) delete db.attendance[key][s.id]; else db.attendance[key][s.id] = prevs[s.id];
        if (res && res.error === 'bad_token') { toast(t('tCloudSessionExpired')); logout(); return; }
        toast(t('tNotSaved'));
        renderPage();
      });
    });
    return;
  }
  if (!db.attendance[key]) db.attendance[key] = {};
  roster.forEach(function (s) { db.attendance[key][s.id] = m; });
  saveDB(db);
  renderPage();
}
function clearAttMark(id) {
  // v120: un-mark one student — a wrong tap goes back to "Not marked".
  // Same guards as markAtt: a principal is read-only; a teacher/staff
  // member only their own assigned class; the student must be on this
  // class's roster. Unlike a tap, a removal IS audited at once — it is
  // a destructive change, like deleteStudent/deleteTeacher (a mark tap
  // is only audited when the day is saved). Local: delete the mark,
  // saveDB, audit row. Cloud: optimistic delete + the mark RPC with
  // status 'Clear' (SQL 43); a failed call reverts the slice, a dead
  // token logs the teacher out — the markAtt pattern.
  if (state.role === 'principal') { toast(t('tNotAllowed')); return; }
  if ((state.role === 'teacher' || state.role === 'staff') && roleClasses().indexOf(state.attCls) === -1) { toast(t('tNotAllowed')); return; }
  var stu = db.students.find(function (x) { return x.id === id; });
  if (stu && stu.cls !== state.attCls) { toast(t('tNotAllowed')); return; }
  var key = state.attDate + '|' + state.attCls;
  if (!db.attendance[key] || db.attendance[key][id] === undefined) { toast(t('attNothingToClear')); return; }
  var details120 = (stu ? stu.name : id) + ' \u2022 Class ' + state.attCls + ' \u2022 ' + state.attDate;
  var attToken120 = state.cloudTeacherToken || state.cloudStaffToken;
  var attFn120 = state.cloudTeacherToken ? sbTeacherMarkAttendance : sbStaffMarkAttendance;
  if (attToken120) {
    if (!stu || !stu.srvId) { toast(t('tNotSaved')); return; }
    var prev120 = db.attendance[key][id];
    delete db.attendance[key][id];
    renderPage();
    attFn120(attToken120, state.attDate, state.attCls, stu.srvId, 'Clear').then(function (res) {
      if (res && res.ok) { sbLogAuditCloud(attToken120, 'Attendance mark removed', details120, 'Attendance mark removed', 'Class ' + state.attCls, '\u2705', 'blue'); return; }
      db.attendance[key][id] = prev120;
      if (res && res.error === 'bad_token') { toast(t('tCloudSessionExpired')); logout(); return; }
      toast(t('tNotSaved'));
      renderPage();
    });
    return;
  }
  delete db.attendance[key][id];
  logAudit('Attendance mark removed', details120);
  saveDB(db);
  renderPage();
  toast('\u2713 ' + t('attMarkRemoved'));
}
function clearAttDay() {
  // v120: clear the whole class-day register — e.g. the wrong date or
  // class was marked. School + teacher/staff (own class); a principal
  // is read-only; a holiday day has no register to clear. A day with no
  // marks is a no-op (toast, no modal, no audit row). Otherwise a
  // confirm modal; the callback deletes the day (local) or one 'Clear'
  // RPC per student (cloud, the markAllAtt pattern — a failed call
  // keeps only that student marked).
  if (state.role === 'principal') { toast(t('tNotAllowed')); return; }
  if ((state.role === 'teacher' || state.role === 'staff') && roleClasses().indexOf(state.attCls) === -1) { toast(t('tNotAllowed')); return; }
  if (holidayFor(state.attDate, state.attCls)) { toast(t('tHolidayExists')); return; }
  var key = state.attDate + '|' + state.attCls;
  var recs = db.attendance[key] || {};
  var ids = Object.keys(recs);
  if (!ids.length) { toast(t('attNothingToClear')); return; }
  var n120 = ids.length, cls120 = state.attCls, date120 = state.attDate;
  confirmModal(t('attClearDayMsg'), function () {
    var attToken120 = state.cloudTeacherToken || state.cloudStaffToken;
    var attFn120 = state.cloudTeacherToken ? sbTeacherMarkAttendance : sbStaffMarkAttendance;
    if (attToken120) {
      ids.forEach(function (sid) {
        var stu = db.students.find(function (x) { return x.id === sid; });
        if (!stu || !stu.srvId) return;
        var prev = db.attendance[key] && db.attendance[key][sid];
        if (db.attendance[key]) delete db.attendance[key][sid];
        attFn120(attToken120, date120, cls120, stu.srvId, 'Clear').then(function (res) {
          if (res && res.ok) return;
          if (!db.attendance[key]) db.attendance[key] = {};
          if (prev !== undefined) db.attendance[key][sid] = prev;
          if (res && res.error === 'bad_token') { toast(t('tCloudSessionExpired')); logout(); return; }
          toast(t('tNotSaved'));
          renderPage();
        });
      });
      sbLogAuditCloud(attToken120, 'Attendance cleared', 'Class ' + cls120 + ' \u2022 ' + date120 + ' \u2022 ' + n120 + ' marks removed', 'Attendance cleared', 'Class ' + cls120, '\u2705', 'blue');
      renderPage();
      toast('\u2713 ' + t('attCleared'));
      return;
    }
    delete db.attendance[key];
    logAudit('Attendance cleared', 'Class ' + cls120 + ' \u2022 ' + date120 + ' \u2022 ' + n120 + ' marks removed');
    saveDB(db);
    renderPage();
    toast('\u2713 ' + t('attCleared'));
  });
}
function markHoliday() {
  // v100: declare the viewed class-day a holiday — the register shows
  // Holiday, no marking, and the day drops out of every attendance %.
  // SCHOOL ROLE ONLY: a holiday is a school decision, and a teacher's
  // cloud slice cannot sync it (no sync cycle on slices — the v98
  // lesson). One holiday per class per date; a second tap toasts
  // instead of duplicating. Syncs like a notice (SQL 38).
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  var date = state.attDate, cls = state.attCls;
  if (holidayFor(date, cls)) { toast(t('tHolidayExists')); return; }
  db.holidays = db.holidays || [];
  db.holidays.push({ id: uniqueId('hol-'), date: date, cls: cls, reason: '' });
  logAudit('Holiday marked', 'Class ' + cls + ' • ' + date);
  saveDB(db);
  toast('✓ ' + t('tHolidaySet') + ' — Class ' + cls + ' (' + date + ').');
  renderPage();
}
function removeHoliday(holId) {
  // v100: un-declare a holiday — by id from the holidays card, or the
  // viewed class-day when called from the toolbar with no id. School
  // role only, like marking.
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  var hol = holId ? (db.holidays || []).find(function (h) { return h.id === holId; }) : holidayFor(state.attDate, state.attCls);
  if (!hol) return;
  db.holidays = (db.holidays || []).filter(function (h) { return h.id !== hol.id; });
  logAudit('Holiday removed', 'Class ' + hol.cls + ' • ' + hol.date);
  saveDB(db);
  toast('✓ ' + t('tHolidayRemoved') + ' — Class ' + hol.cls + ' (' + hol.date + ').');
  renderPage();
}
function holidaysCard100(cls) {
  // v100: the class's holidays, newest first, with a remove button each
  // (school only). Empty when the class has no holidays.
  var list = (db.holidays || []).filter(function (h) { return h.cls === cls; }).slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
  if (!list.length) return '';
  var rows = list.map(function (h) {
    return '<div class="hw-item"><div><b>' + esc(h.date) + '</b><span>' + esc(h.reason || t('holidayWord')) + '</span></div>' +
      (state.role === 'school' ? '<button class="btn ghost sm ml-auto" onclick="removeHoliday(\'' + h.id + '\')">' + t('removeHoliday') + '</button>' : '') + '</div>';
  }).join('');
  return '<div class="card mt-16"><h3>' + t('holidaysH') + ' — Class ' + esc(cls) + '</h3>' + rows + '</div>';
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
  // Load-more: the first feeLimit rows render (default 120, as before);
  // older records are one tap away instead of unreachable.
  var shown = Math.min(state.feeLimit || 120, list.length);
  var rows = list.slice(0, state.feeLimit || 120).map(function (r) {
    return '<tr><td><button class="linklike" onclick="return openFeeProfile(\'' + r.studentId + '\', event)">' + esc(r.student) + '</button></td><td>' + esc(enrOf(r.studentId)) + '</td><td>' + esc(r.cls) + '</td><td>' + r.month + '</td><td>' + esc(feeTypeLabel(feeTypeOf(r))) + '</td><td>' + inr(r.amount) + '</td><td>' + esc(r.date) + '</td>' +
      '<td><span class="badge ' + (r.status === 'Collected' ? 'green' : 'orange') + '">' + r.status + '</span></td>' +
      '<td>' + receiptCellForRecord(r) + '</td>' +
      '<td>' + (r.status === 'Pending' ? (state.role === 'principal' ? '<span class="muted">—</span>' : state.role === 'accountant' ? '<button class="btn green sm" onclick="openCollectFee(\'' + r.studentId + '\',\'' + r.id + '\')">' + t('collectBtn') + '</button> ' + waReminderBtn(r.id, r.studentId) : '<button class="btn green sm" onclick="openCollectFee(\'' + r.studentId + '\',\'' + r.id + '\')">' + t('collectBtn') + '</button> ' + waReminderBtn(r.id, r.studentId) + ' <button class="btn ghost sm" onclick="openEditFee(\'' + r.id + '\')">' + t('editBtn') + '</button> <button class="btn danger sm" onclick="deleteFeeRecord(\'' + r.id + '\')">' + t('deleteBtn') + '</button>') : '<span class="muted">—</span>') + '</td></tr>'; // v88: a principal sees the fee list read-only — no Collect/Delete/WhatsApp; v92: an accountant collects + reminds but never deletes (deleteFeeRecord refuses non-school anyway)
  }).join('');
  return '<div class="page-head"><div><h2>' + t('fees') + '</h2><p>' + t('collectedW') + ' ' + inr(ft.collected) + ' • ' + t('pendingW') + ' ' + inr(ft.pending) + ' (' + feeRangeLabel() + ')</p></div>' +
    '<div class="toolbar"><div class="pill-tabs">' + ['All', 'Pending', 'Collected'].map(function (x) {
      return '<button class="' + (f === x ? 'on' : '') + '" onclick="state.feeFilter=\'' + x + '\';state.feeLimit=120;renderPage()">' + (x === 'All' ? t('allW') : x === 'Pending' ? t('pendingW') : t('collectedW')) + '</button>';
    }).join('') + '</div>' +
    '<select onchange="state.feeType=this.value;state.feeLimit=120;renderPage()" aria-label="Fee type">' + typeOpts + '</select>' +
    '<input id="feeSearchInput" placeholder="' + t('searchFee') + '" value="' + esc(state.feeSearch) + '" oninput="state.feeSearch=this.value;filterFees(this.value)" class="minw-200">' +
    '<button class="btn ghost" onclick="printFeeList()">🖨 ' + t('printList') + '</button></div></div>' +
    '<div class="stats">' +
    statCard('💰', 'orange', t('feeCollected'), ft.collected, '', 'up', { prefix: '₹' }) +
    statCard('⏰', 'red', t('pendingFee'), ft.pending, '', 'down', { prefix: '₹' }) +
    '</div>' +
    '<div class="card"><h3>' + t('feeByType') + '</h3><p class="card-sub">' + t('feeByTypeSub') + '</p><div class="type-rows">' + (btRows || '<div class="empty">' + t('tNoFeeRecs') + '</div>') + '</div></div>' +
    '<div class="card"><h3>' + t('feeTrend') + '</h3><p class="card-sub">' + feeRangeLabel() + ' (' + t('collectedW') + ' / ' + t('pendingW') + ')</p><div class="chart-box">' + barChartSVG(feeChartData()) + '</div><p class="muted mt-8"><span style="color:' + BLUE + '">■</span> ' + t('collectedW') + ' &nbsp; <span style="color:' + ORANGE + '">■</span> ' + t('pendingW') + '</p></div>' +
    '<div class="card"><div class="tbl-wrap fee-list-tbl"><table><thead><tr><th>' + t('thStudent') + '</th><th>' + t('thEnr') + '</th><th>' + t('thClass') + '</th><th>' + t('thMonth') + '</th><th>' + t('thType') + '</th><th>' + t('thAmount') + '</th><th>' + t('thDate') + '</th><th>' + t('thStatus') + '</th><th>' + t('thReceipt') + '</th><th>' + t('thAction') + '</th></tr></thead><tbody id="feeBody">' +
    (rows || '<tr><td colspan="10"><div class="empty">' + t('tNoMatch') + '</div></td></tr>') + '<tr id="feeNoMatch" style="display:none"><td colspan="10"><div class="empty">' + t('tNoMatch') + '</div></td></tr></tbody></table></div>' +
    '<p class="muted mt-10" id="feeCount">' + t('showingRec') + ' ' + shown + ' ' + t('ofRec') + ' ' + list.length + ' ' + t('recordsWord') + '</p>' +
    (list.length > shown ? '<div class="mt-10"><button class="btn ghost" onclick="state.feeLimit=(state.feeLimit||120)+120;renderPage()">' + t('loadMore') + '</button></div>' : '') + '</div>' +
    (state.role === 'school' ? feeFormCard() + feeStructureCard() : ''); // v88: the fee-entry + fee-structure cards are school-only — a principal never sees them; v92: an accountant never sees them either
}

