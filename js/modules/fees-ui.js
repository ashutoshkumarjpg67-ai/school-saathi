/* School Saathi — Fees, Receipts, Structure, Print & ID Cards module (extracted from app.js in v175) */
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
function feeRecordsDeduped() {
  // v52: the local DB can hold two rows for one fee id (live: the v46
  // verification double-POSTed each of the 3 collections, and a legacy
  // pull merged 6 server rows into the local list). Every total, chart,
  // list and export must sum the deduped view — first row per id wins,
  // the same rule the pull's mergeById uses — so the first pre-pull
  // render is already right (live v51: ₹4,800 on first login, ₹2,400
  // after the pull deduped to 3).
  var seen = {}, out = [];
  (db.feeRecords || []).forEach(function (r) {
    if (!r || !r.id || seen[r.id]) return;
    seen[r.id] = true; out.push(r);
  });
  return out;
}
function feeTotals() {
  var c = 0, p = 0;
  feeRecordsDeduped().forEach(function (r) { if (r.status === 'Collected') c += r.amount; else p += r.amount; });
  return { collected: c, pending: p };
}
function feeMonthsUsed() {
  // v37: the FULL academic year Apr–Mar, always all 12 months in
  // academic order — months with no collections show as zero in the
  // trend (feeChartData), never as a missing bar. A month found in
  // feeRecords that is not in MONTHS_ACAD (bad data) is appended
  // after the year, still sorted by month number.
  var seen = {}, list = [];
  MONTHS_ACAD.forEach(function (m) { seen[m] = 1; list.push(m); });
  db.feeRecords.forEach(function (r) { if (r.month && !seen[r.month]) { seen[r.month] = 1; list.push(r.month); } });
  var head = list.slice(0, 12);
  var tail = list.slice(12).sort(function (a, b) { return (MONTH_NUM[a] || 99) - (MONTH_NUM[b] || 99); });
  return head.concat(tail);
}
function feeRangeLabel() {
  var ms = feeMonthsUsed();
  return ms.length ? ms[0] + '–' + ms[ms.length - 1] : '';
}
function feeChartData() {
  // Month-wise totals computed LIVE from feeRecords, not the static seed ledger.
  // Perf (v154): feeRecordsDeduped() was rebuilt once per month (up to
  // 12x). Dedup once and accumulate all months in a single pass; the
  // output is identical (a month with no records still reads 0/0).
  var totals = {};
  feeRecordsDeduped().forEach(function (r) {
    if (!totals[r.month]) totals[r.month] = { collected: 0, pending: 0 };
    if (r.status === 'Collected') totals[r.month].collected += r.amount; else totals[r.month].pending += r.amount;
  });
  return feeMonthsUsed().map(function (m) {
    var t = totals[m] || { collected: 0, pending: 0 };
    return { label: m, collected: t.collected, pending: t.pending };
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
  feeRecordsDeduped().forEach(function (r) {
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
  return feeRecordsDeduped().filter(function (r) {
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
  state.feeLimit = 120; // a new search starts from the first page again
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
function feeStatusMap() {
  // Perf (v154): studentFeeStatus(id) scans ALL feeRecords for one
  // student, so any loop over all students paid O(students x records)
  // (studentStats, the fee filter, the CSV exports, fee generation).
  // One pass builds the status for every student; lookups are O(1).
  // Same rule as studentFeeStatus: Pending if ANY Pending record
  // exists, else Paid if ANY Collected record exists, else '—'
  // (callers read it as (map[id] || '—')).
  var m = {};
  (db.feeRecords || []).forEach(function (r) {
    if (!r || !r.studentId) return;
    if (r.status === 'Pending') m[r.studentId] = 'Pending';
    else if (r.status === 'Collected' && !m[r.studentId]) m[r.studentId] = 'Paid';
  });
  return m;
}

// ---------------- Phase 1: Student Management helpers ----------------
var GENDERS = ['Boy', 'Girl', 'Other'];
var BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
var CATEGORIES = ['General', 'OBC', 'SC', 'ST', 'Other'];
// Session options derive from the current academic year (Apr–Mar via
// sessionOfDate/todayIST), so the list never goes stale: the two past
// sessions, the current one, and next year. (Was a hardcoded 3-item list.)
function dynamicSessions() {
  var cur = sessionOfDate(todayIST());
  var m = /^(\d{4})/.exec(cur || '');
  var y = m ? parseInt(m[1], 10) : 2025;
  var out = [];
  [y - 2, y - 1, y, y + 1].forEach(function (yy) {
    out.push(yy + '–' + String((yy + 1) % 100).padStart(2, '0'));
  });
  return out;
}
var SESSIONS = dynamicSessions();
// Session <option> markup for a <select>: the dynamic SESSIONS list, plus
// the current value if it falls outside the range (e.g. an old profile
// session), so the saved value is never silently dropped from the list.
function sessionSelectOpts(cur) {
  var opts = SESSIONS.slice();
  if (cur && opts.indexOf(cur) === -1) opts.push(cur);
  return opts.map(function (s) { return '<option ' + (s === cur ? 'selected' : '') + '>' + s + '</option>'; }).join('');
}
var SECTIONS = ['A', 'B', 'C'];
var STU_PAGE_SIZE = 10;
var STU_STATUSES = ['Active', 'Inactive', 'Draft', 'Cancelled'];
// v34 (P0-3/P1-10): the roster rule — dues, attendance and marks are only
// for enrolled students. Draft (admission not finished) and Cancelled
// never get dues and never appear on a roster. Inactive students DO keep
// dues (they are still enrolled; only their attendance/marks stop).
function isEnrolledStudent(s) { var stt = (s && s.status) || 'Active'; return stt === 'Active' || stt === 'Inactive'; }
// B6: an exam is active unless it was soft-deleted (deleted: true).
// Marks, lists and stats all filter through this one helper.
function isActiveExam(e) { return !!e && !e.deleted; }
function classParts() {
  var out = [];
  schoolClasses().forEach(function (c) { var p = c.split('-')[0]; if (out.indexOf(p) === -1) out.push(p); });
  return out;
}
function classPartOf(cls) { return (cls || '').split('-')[0]; }
function sectionOf(cls) { return (cls || '').split('-')[1] || ''; }
function digitsOnly(v) { return String(v || '').replace(/[^0-9]/g, ''); }
function maskAadhaar(a) {
  var d = digitsOnly(a);
  if (d.length === 4) return '**** **** ' + d; // v36: only the last 4 are stored
  if (d.length === 12) return '**** **** ' + d.slice(8); // legacy in-memory value
  return '—';
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
  db.auditLog.unshift({ ts: new Date().toISOString(), actor: actor, action: action, details: details || '', localId: uniqueId('al') });
  if (db.auditLog.length > 200) db.auditLog.length = 200;
}
function findDupStudent(data, excludeId) {
  var d = null;
  db.students.some(function (s) {
    if (excludeId && s.id === excludeId) return false;
    if (data.admissionNo && s.admissionNo && s.admissionNo === data.admissionNo) { d = s; return true; }
    if (data.dob && s.dob && s.dob === data.dob && s.name.trim().toLowerCase() === String(data.name || '').trim().toLowerCase()) { d = s; return true; }
    if (data.phone && s.phone && digitsOnly(s.phone) === digitsOnly(data.phone) && s.name.trim().toLowerCase() === String(data.name || '').trim().toLowerCase()) { d = s; return true; }
    // v116 (Module 3): a roll number is unique inside one class. Only an
    // enrolled student (Active/Inactive) holds a roll — a Draft or a
    // Cancelled record frees it, and editing a student never clashes
    // with itself (excludeId is filtered above).
    if (data.roll && s.cls === data.cls && Number(s.roll) === Number(data.roll) && isEnrolledStudent(s)) { d = s; return true; }
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
  var vis = visibleStudents();
  var total = vis.length, active = 0, inactive = 0, draft = 0, cancelled = 0, boys = 0, girls = 0, unspec = 0, pend = 0;
  var byClass = {};
  var curSess = currentSession();
  var newAdm = 0;
  // live issue 17: the average is POOLED over marked days only —
  // attended / marked across every visible student. The old mean of
  // per-student %s counted a student with NO marked days at their stored
  // admission value (att: 100), so a fresh school read "Average
  // Attendance 100%" while the Dashboard's today donut — same marked
  // records, today only — read 0%. With nothing marked at all there is
  // no average to show: null renders as "—" (see studentsPage).
  var attPres = 0, attTot = 0;
  var fsmStats = feeStatusMap(); // Perf (v154): one pass over feeRecords, not one full scan per student
  vis.forEach(function (s) {
    var st = s.status || 'Active';
    if (st === 'Active') active++; else if (st === 'Inactive') inactive++; else if (st === 'Draft') draft++; else if (st === 'Cancelled') cancelled++;
    if (s.gender === 'Boy') boys++; else if (s.gender === 'Girl') girls++; else unspec++;
    if ((fsmStats[s.id] || '—') === 'Pending') pend++;
    // live issue 17: pooled marked days only — see below.
    var ac = studentAttCounts(s);
    attPres += ac.present; attTot += ac.total;
    byClass[s.cls] = (byClass[s.cls] || 0) + 1;
    if (s.admissionDate && sessionOfDate(s.admissionDate) === curSess) newAdm++;
  });
  return { total: total, active: active, inactive: inactive, draft: draft, cancelled: cancelled, boys: boys, girls: girls, unspec: unspec, pendFee: pend, avgAtt: attTot ? Math.round(attPres / attTot * 100) : null, newAdm: newAdm, byClass: byClass };
}
function classBarsHTML(byClass) {
  var max = 0;
  schoolClasses().forEach(function (c) { max = Math.max(max, byClass[c] || 0); });
  return schoolClasses().map(function (c) {
    var n = byClass[c] || 0;
    var w = max ? Math.round(n / max * 100) : 0;
    return '<div class="class-bar"><b>' + esc(c) + '</b><span class="bar-track"><span class="bar-fill" style="width:' + w + '%"></span></span><span class="n">' + n + '</span></div>';
  }).join('');
}
function stuFiltered() {
  var q = (state.stuSearch || '').trim().toLowerCase();
  // Perf (v154): the fee filter called studentFeeStatus() — a full
  // feeRecords scan — per student. The map is built once instead.
  var fsm = (state.stuFee !== 'All') ? feeStatusMap() : null;
  return visibleStudents().filter(function (s) {
    if (state.stuClass !== 'All' && s.cls !== state.stuClass) return false;
    if (state.stuSection !== 'All' && sectionOf(s.cls) !== state.stuSection) return false;
    if (state.stuSession !== 'All' && (s.session || '') !== state.stuSession) return false;
    if (state.stuGender !== 'All' && (s.gender || '') !== state.stuGender) return false;
    if (state.stuStatus !== 'All' && (s.status || 'Active') !== state.stuStatus) return false;
    if (state.stuFee !== 'All' && (fsm[s.id] || '—') !== state.stuFee) return false;
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
  // Perf (v154): sorting by attendance called studentAttPct() inside
  // the comparator — O(n log n) full attendance scans (measured 7.6 s
  // for 500 students in the harness). The % is computed once per
  // student up front now; Array.sort is stable, so the order is
  // identical to comparing the same values in the comparator.
  var attPct = null;
  if (col === 'att') {
    attPct = {};
    arr.forEach(function (s) { attPct[s.id] = studentAttPct(s); });
  }
  arr.sort(function (a, b) {
    var r = 0;
    if (col === 'name') r = a.name.localeCompare(b.name);
    else if (col === 'class') r = (schoolClasses().indexOf(a.cls) - schoolClasses().indexOf(b.cls)) || ((a.roll || 0) - (b.roll || 0));
    else if (col === 'admDate') {
      var da = a.admissionDate || '', dbv = b.admissionDate || '';
      r = !da && !dbv ? 0 : !da ? 1 : !dbv ? -1 : (da < dbv ? -1 : da > dbv ? 1 : 0);
    } else if (col === 'att') r = attPct[a.id] - attPct[b.id];
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
  var recs = feeRecordsDeduped().filter(function (r) { return r.studentId === sid; })
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
  var exs = db.exams.filter(function (e) { return e.cls === s.cls && isActiveExam(e); }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  for (var i = 0; i < exs.length; i++) {
    var mk = db.marks.find(function (m) { return m.examId === exs[i].id && m.studentId === s.id; });
    if (mk) return { pct: Math.round(mk.marks / exs[i].total * 100), name: exs[i].name };
  }
  return null;
}
var STU_CSV_HEAD = ['Name', 'Admission No', 'Enr', 'Class', 'Section', 'Roll', "Father's Name", "Mother's Name", 'Guardian', 'Mobile', 'Secondary Mobile', 'Parent Email', 'Attendance %', 'Fee Status', 'Status', 'Session', 'Admission Date', 'DOB', 'Gender', 'Category', 'Blood Group', 'Address', 'District', 'State', 'PIN', 'Previous School', 'Previous Class', 'Birth Cert', 'TC', 'TC Number'];
function studentCSVRow(s, fsm) {
  var d = s.documents || {};
  return [s.name, s.admissionNo || '', s.enr || '', s.cls, sectionOf(s.cls), s.roll,
    s.fatherName || s.guardian, s.motherName || '', s.guardian, s.phone, s.mobile2 || '', s.parentEmail || '',
    studentAttPct(s), fsm ? (fsm[s.id] || '—') : studentFeeStatus(s.id), s.status || 'Active', s.session || '', s.admissionDate || '', s.dob || '',
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
  var fsm = feeStatusMap(); // Perf (v154): one pass for the whole export
  downloadCSV('school-saathi-students-' + todayIST() + '.csv', [STU_CSV_HEAD].concat(list.map(function (s) { return studentCSVRow(s, fsm); })));
  toast('✓ ' + t('tCsvExported'));
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
  state.feeStudent = null; state.feeFormOpen = true; state.feePreselect = sid; state.feeEditId = null;
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
      '<td>' + (r.status === 'Pending' ? (state.role === 'principal' ? '<span class="muted">—</span>' : state.role === 'accountant' ? '<button class="btn green sm" onclick="openCollectFee(\'' + s.id + '\',\'' + r.id + '\')">' + t('collectBtn') + '</button> ' + waReminderBtn(r.id, s.id) : '<button class="btn green sm" onclick="openCollectFee(\'' + s.id + '\',\'' + r.id + '\')">' + t('collectBtn') + '</button> ' + waReminderBtn(r.id, s.id) + ' <button class="btn danger sm" onclick="deleteFeeRecord(\'' + r.id + '\')">' + t('deleteBtn') + '</button>') : '<span class="muted">—</span>') + '</td></tr>'; // v92: the fee-profile rows follow the same rule as the fee list — principal read-only, accountant collects but never deletes
  }).join('');
  return '<div class="page-head"><div class="prof-head">' + avatarHTML(s.photo, s.name, 'big-avatar') + '<div><h2>' + esc(s.name) + '</h2><p>' + t('thClass') + ' ' + esc(s.cls) + ' • ' + t('thEnr') + ' ' + esc(s.enr || '—') + ' • ' + t('thGuardian') + ' ' + esc(s.guardian || '—') + ' • ' + t('thPhone') + ' ' + esc(s.phone || '—') + '</p><p class="muted">' + t('feeProfileSub') + '</p></div></div>' +
    '<div class="toolbar"><button class="btn ghost" onclick="backFromFeeProfile()">← ' + t('backFees') + '</button>' +
    ((state.role === 'school' || state.role === 'accountant') ? '<button class="btn green" onclick="openCollectFee(\'' + s.id + '\')">💰 ' + t('collectFeeBtn') + '</button>' : '') + // v92: the fee-profile Collect button is school + accountant only — a principal never sees it
    (state.role === 'school' ? '<button class="btn" onclick="openAddFeeFor(\'' + s.id + '\')">+ ' + t('addFee') + '</button>' : '') + // v92: the Add Fee button is school-only (was visible to every role)
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
// v39: the receipt for one fee record — same student, same month,
// latest first; a receipt whose lines include the record's fee type
// wins over one that merely shares the month. A fee record carries
// no receipt id of its own, so the receipt view is found this way
// from the Fees list and the profile Fee History tab — stable entry
// points that do not depend on the fee profile's bottom card or on
// the one-shot view right after collecting.
function receiptForFeeRecord(r) {
  var list = (db.receipts || []).filter(function (rc) { return rc.studentId === r.studentId && rc.month === r.month && rc.receiptNo; });
  if (!list.length) return null;
  var ty = feeTypeOf(r);
  var typed = list.filter(function (rc) { return (rc.lines || []).some(function (ln) { return ln.type === ty; }); });
  var pick = typed.length ? typed : list;
  // Latest date first; among same-date receipts the EARLIEST number —
  // a receipt re-numbered by a past repair cycle is a duplicate of the
  // original, and the original number is the stable one to show (v41:
  // the v40 loop left 64 copies of each receipt under ever-higher
  // numbers; showing the latest number made the column change on
  // every render).
  pick.sort(function (a, b) { return (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.receiptNo < b.receiptNo ? -1 : 1)); });
  // v134: a receipt whose lines name THIS fee record (lines.recordId)
  // is the one that paid it — several restores can leave several
  // receipts for the same student+month+type on the same date, and the
  // earliest-number tie-break above then shows a stale number (live
  // 15 Nov: the Dec fee showed RCP-2026-006 although the collect
  // minted RCP-2026-008). Fall back to the sorted pick when no line
  // names this record (receipts that predate recordId lines).
  var exact134 = pick.filter(function (rc) { return (rc.lines || []).some(function (ln) { return String(ln.recordId || '') === String(r.id); }); });
  return exact134.length ? exact134[0] : pick[0];
}
function receiptCellForRecord(r) {
  // A receipt exists only for money already collected — a Pending
  // row never shows one, even when another record for the same
  // student and month was already paid (partial payments split one
  // due into a Collected part and a Pending remainder).
  if (r.status !== 'Collected') return '<span class="muted">—</span>';
  var rc = receiptForFeeRecord(r);
  if (!rc) return '<span class="muted">—</span>';
  return '<button class="linklike" onclick="openSavedReceipt(' + jsAttr(rc.receiptNo) + ')">' + esc(rc.receiptNo) + '</button>';
}
// live issue 16: collapse duplicate receipt rows for ONE
// collection — the same collapse the v42 pull mirror already does for
// server rows, applied to the local render too. Restores / repairs can
// leave several rows for one collection under different numbers; the
// list shows the earliest number once. A genuinely different collection
// (different total, date, fee type, or paid fee-record ids — see
// sbReceiptContentKey) keeps its own row.
function dedupeReceipts(list) {
  var earliestByContent = {}, out = [];
  (list || []).forEach(function (r) {
    if (!r || !r.receiptNo) { out.push(r); return; }
    var k = sbReceiptContentKey(r);
    var cur = earliestByContent[k];
    if (!cur) { earliestByContent[k] = r; out.push(r); return; }
    if (r.receiptNo < cur.receiptNo) { var i = out.indexOf(cur); if (i !== -1) out[i] = r; earliestByContent[k] = r; }
    // else: a later duplicate of the same collection — drop it.
  });
  return out;
}
function receiptListCard(sid) {
  var rcs = dedupeReceipts((db.receipts || []).filter(function (r) { return r.studentId === sid; })).slice().reverse();
  var rcRows = rcs.map(function (r) {
    return '<tr><td>' + esc(r.receiptNo) + '</td><td>' + esc(r.date) + '</td><td>' + esc(payModeLabel(r.payMode)) + '</td><td>' + inr(r.total) + '</td>' +
      '<td><button class="btn sm" onclick="openSavedReceipt(' + jsAttr(r.receiptNo) + ')">' + t('rcptView') + '</button> ' +
      '<button class="btn ghost sm" onclick="printReceipt(' + jsAttr(r.receiptNo) + ')">🖨 ' + t('rcptPrint') + '</button> ' +
      '<button class="btn ghost sm" onclick="waReceiptShare(' + jsAttr(r.receiptNo) + ')">💬 ' + t('waShareReceiptBtn') + '</button></td></tr>';
  }).join('');
  return '<div class="card"><h3>' + t('rcptReceipts') + '</h3><p class="card-sub">' + rcs.length + ' ' + t('recordsWord') + '</p><div class="tbl-wrap"><table><thead><tr><th>' + t('rcptReceiptNo') + '</th><th>' + t('rcptDate') + '</th><th>' + t('rcptPayMode') + '</th><th>' + t('rcptTotal') + '</th><th>' + t('thAction') + '</th></tr></thead><tbody>' + (rcRows || '<tr><td colspan="5"><div class="empty">' + t('rcptNoReceipts') + '</div></td></tr>') + '</tbody></table></div></div>';
}

/* ================= manual fee + fee structure + generate ================= */
function toggleFeeForm() { state.feeEditId = null; state.feeFormOpen = !state.feeFormOpen; if (!state.feeFormOpen) state.feePreselect = null; renderPage(); }
function toggleCustom(selId, wrapId) {
  var s = $(selId), w = $(wrapId);
  if (s && w) w.classList.toggle('hidden', s.value !== '__custom');
}
function feeTypeSelectOpts(sel) {
  return FEE_TYPES.map(function (x) { return '<option value="' + esc(x) + '"' + (sel === x ? ' selected' : '') + '>' + esc(feeTypeLabel(x)) + '</option>'; }).join('') + '<option value="__custom"' + (sel === '__custom' ? ' selected' : '') + '>' + t('customType') + '</option>';
}
function feeFormCard() {
  var btn = '<button class="btn ghost sm" onclick="toggleFeeForm()">' + (state.feeFormOpen ? '✕ ' + t('closeW') : '+ ' + t('addFee')) + '</button>';
  var body = '';
  if (state.feeFormOpen) {
    var er122 = state.feeEditId ? db.feeRecords.find(function (x) { return x.id === state.feeEditId; }) : null;
    var erCustom122 = !!er122 && FEE_TYPES.indexOf(er122.type) === -1;
    var stuOpts = db.students.map(function (s) {
      return '<option value="' + s.id + '" ' + (state.feePreselect === s.id || (er122 && er122.studentId === s.id) ? 'selected' : '') + '>' + esc(s.name) + ' — ' + esc(s.cls) + ' (' + esc(s.enr || '') + ')</option>';
    }).join('');
    var curM = new Date().toLocaleString('en', { month: 'short' });
    if (MONTHS_ACAD.indexOf(curM) === -1) curM = 'Sep';
    var moOpts = MONTHS_ACAD.map(function (m) { return '<option ' + (m === (er122 ? er122.month : curM) ? 'selected' : '') + '>' + m + '</option>'; }).join('');
    body = '<form onsubmit="return saveFeeRecord(event)" class="mt-14"><div class="form-grid">' +
      '<div><label>' + t('fStudent') + '</label><select id="fFeeStudent"' + (er122 ? ' disabled' : '') + '>' + stuOpts + '</select></div>' +
      '<div><label>' + t('fMonth') + '</label><select id="fFeeMonth">' + moOpts + '</select></div>' +
      '<div><label>' + t('fType') + '</label><select id="fFeeType" onchange="toggleCustom(\'fFeeType\',\'fFeeCustomWrap\')">' + feeTypeSelectOpts(er122 ? (erCustom122 ? '__custom' : er122.type) : undefined) + '</select></div>' +
      '<div><label>' + t('fAmount') + '</label><input id="fFeeAmount" type="number" min="1" step="1" placeholder="e.g. 1500" required value="' + (er122 ? er122.amount : '') + '"></div>' +
      '<div><label>' + t('fStatus') + '</label><select id="fFeeStatus"><option value="Pending"' + (er122 && er122.status === 'Pending' ? ' selected' : '') + '>' + t('pendingW') + '</option><option value="Collected"' + (er122 && er122.status === 'Collected' ? ' selected' : '') + '>' + t('collectedW') + '</option></select></div>' +
      '<div><label>' + t('fDate') + '</label><input id="fFeeDate" type="date" value="' + (er122 ? (er122.date || todayIST()) : todayIST()) + '"></div>' +
      '<div class="full' + (erCustom122 ? '' : ' hidden') + '" id="fFeeCustomWrap"><label>' + t('customType') + '</label><input id="fFeeCustom" placeholder="' + t('typeCustomPh') + '" value="' + (erCustom122 ? esc(er122.type) : '') + '"></div>' +
      '</div><div class="actions toolbar-start"><button class="btn" type="submit">' + t('saveFeeBtn') + '</button></div></form>';
  }
  return '<div class="card"><div class="head-row"><div><h3>' + (state.feeEditId ? t('editFee') : t('addFee')) + '</h3><p class="card-sub">' + (state.feeEditId ? t('editFeeSub') : t('addFeeSub')) + '</p></div>' + btn + '</div>' + body + '</div>';
}
function openEditFee(rid) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  // Only a Pending record can change — a Collected record is the
  // payment's evidence (same rule as deleteFeeRecord).
  var r = db.feeRecords.find(function (x) { return x.id === rid; });
  if (!r || r.status !== 'Pending') { toast(t('tNotAllowed')); return; }
  state.feeStudent = null; state.feeEditId = rid; state.feeFormOpen = true; state.feePreselect = r.studentId;
  renderApp();
}
function saveFeeRecord(e) {
  e.preventDefault();
  if (state.role !== 'school') { toast(t('tNotAllowed')); return false; }
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
  var mo122 = $('fFeeMonth').value, st122 = $('fFeeStatus').value, dt122 = $('fFeeDate').value || todayIST();
  // live issue 16: a manual add must not silently duplicate a
  // record Generate Fees already made (or one added before) — the same
  // student+month+type collected twice mints two receipts for one due.
  // Generate Fees already dedupes this way; the edit path above is
  // untouched (it updates in place), and the collect flow's own
  // partial-payment remainder is created by finishCollectFee, not here.
  if (!state.feeEditId && db.feeRecords.some(function (r) { return r.studentId === sid && r.month === mo122 && feeTypeOf(r) === ty; })) { toast(t('tFeeDuplicate')); return false; }
  if (state.feeEditId) {
    // Edit in place: the record keeps its id, so the server row updates instead of duplicating.
    var er = db.feeRecords.find(function (x) { return x.id === state.feeEditId; });
    if (!er || er.status !== 'Pending') { state.feeEditId = null; toast(t('tNotAllowed')); return false; }
    var oldAmt122 = er.amount;
    er.studentId = sid; er.student = s.name; er.cls = s.cls;
    er.month = mo122; er.type = ty; er.amount = amt; er.status = st122; er.date = dt122;
    refreshStudentFee(sid);
    logAudit('Fee record updated', s.name + ' • ' + mo122 + ' ' + feeTypeLabel(ty) + ' ' + inr(oldAmt122) + ' → ' + inr(amt));
    state.feeEditId = null; state.feePreselect = null;
    saveDB(db); renderApp();
    toast('✓ ' + t('tFeeUpdated'));
    return false;
  }
  db.feeRecords.push({ id: uniqueId('fee'), studentId: sid, student: s.name, cls: s.cls,
    month: mo122, type: ty, amount: amt, status: st122, date: dt122 });
  refreshStudentFee(sid);
  logAudit('Fee added', s.name + ' • ' + mo122 + ' ' + feeTypeLabel(ty) + ' ' + inr(amt));
  state.feePreselect = null;
  saveDB(db); renderApp();
  toast('✓ ' + t('tFeeAdded'));
  return false;
}
function feeStructureCard() {
  // live issue 12: rows render in central class order (stored order jumbles after a
  // pull). Each row keeps its ORIGINAL index for its input id / delete
  // button — saveFeeStructure reads amounts by that index.
  var rows = (db.feeStructure || []).map(function (row, i) { return { row: row, i: i }; })
    .sort(function (a, b) { return compareClass(a.row.cls, b.row.cls) || ((a.row.type || '') < (b.row.type || '') ? -1 : (a.row.type || '') > (b.row.type || '') ? 1 : 0); })
    .map(function (x) { var row = x.row, i = x.i;
    return '<tr><td>' + esc(row.cls) + '</td><td>' + esc(feeTypeLabel(row.type)) + '</td>' +
      '<td><input type="number" min="0" step="50" value="' + row.amount + '" id="fsAmt-' + i + '" style="width:120px"></td>' +
      '<td><button class="btn danger sm" onclick="deleteFeeStructureRow(' + i + ')">' + t('deleteBtn') + '</button></td></tr>';
  }).join('');
  var clsOpts = schoolClasses().map(function (c) { return '<option>' + c + '</option>'; }).join('');
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
    '<div class="toolbar mt-14"><select id="fsNewCls">' + clsOpts + '</select>' +
    '<select id="fsNewType" onchange="toggleCustom(\'fsNewType\',\'fsNewCustomWrap\')">' + feeTypeSelectOpts() + '</select>' +
    '<input id="fsNewAmt" type="number" min="1" step="50" placeholder="e.g. 1500" style="max-width:130px">' +
    '<button class="btn ghost sm" onclick="addFeeStructureRow()">+ ' + t('addRow') + '</button></div>' +
    '<div class="full hidden mt-10" id="fsNewCustomWrap"><input id="fsNewCustom" placeholder="' + t('typeCustomPh') + '" style="max-width:260px"></div>' +
    '<div class="toolbar" style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px"><label style="margin:0">' + t('fMonth') + '</label>' +
    '<select id="fGenMonth" onchange="state.feeGenMonth=this.value">' + moOpts + '</select>' +
    '<button class="btn green" onclick="generateFees()">' + t('genFees') + '</button></div></div>';
}
function saveFeeStructure() {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  var beforeStruct122 = JSON.stringify(db.feeStructure || []) + '|' + JSON.stringify(feeExtras());
  var rows = db.feeStructure || [];
  var exVals = {};
  var rowVals = {};
  var exKeys = ['admissionFee', 'cautionMoney', 'annualCharges', 'transportFee'];
  // Validate first, mutate nothing yet: an empty input keeps the stored
  // amount (same rule as the extras loop already had), an invalid one
  // aborts the whole save instead of leaving row 0 changed and the rest stale.
  var k, i;
  for (k = 0; k < exKeys.length; k++) {
    var exInp = $('fsEx-' + exKeys[k]);
    if (!exInp || exInp.value === '' || exInp.value == null) continue; // empty input: keep the stored amount
    var exV = parseFloat(exInp.value);
    if (isNaN(exV) || exV < 0) { toast(t('tAmtPositive')); return; }
    exVals[exKeys[k]] = exV;
  }
  for (i = 0; i < rows.length; i++) {
    var inp = $('fsAmt-' + i);
    if (!inp || inp.value === '' || inp.value == null) continue; // empty input: keep the stored amount
    var v = parseFloat(inp.value);
    if (isNaN(v) || v < 0) { toast(t('tAmtPositive')); return; }
    rowVals[i] = v;
  }
  for (i = 0; i < rows.length; i++) {
    if (rowVals[i] !== undefined) rows[i].amount = rowVals[i];
  }
  var ex = feeExtras();
  Object.keys(exVals).forEach(function (kk) { ex[kk] = exVals[kk]; });
  if (JSON.stringify(db.feeStructure || []) + '|' + JSON.stringify(feeExtras()) !== beforeStruct122) {
    logAudit('Fee structure updated', (db.feeStructure || []).length + ' rows • admission ₹' + ex.admissionFee + ' • caution ₹' + ex.cautionMoney + ' • annual ₹' + ex.annualCharges + ' • transport ₹' + ex.transportFee);
  }
  saveDB(db); renderPage();
  toast('✓ ' + t('tStructSaved'));
}
function addFeeStructureRow() {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
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
  logAudit('Fee structure row added', cls + ' • ' + feeTypeLabel(ty) + ' ₹' + amt);
  saveDB(db); renderPage();
  toast('✓ ' + t('tStructAdded'));
}
function deleteFeeStructureRow(i) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  if (!Array.isArray(db.feeStructure) || !db.feeStructure[i]) return;
  var row122 = db.feeStructure[i];
  db.feeStructure.splice(i, 1);
  logAudit('Fee structure row removed', row122.cls + ' • ' + feeTypeLabel(row122.type) + ' ₹' + row122.amount);
  saveDB(db); renderPage();
  toast(t('tStructRemoved'));
}
function deleteFeeRecord(rid) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
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
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  var month = state.feeGenMonth;
  var sel = $('fGenMonth');
  if (sel && sel.value) month = sel.value;
  state.feeGenMonth = month;
  // B3: 'YYYY-MM' of the month being billed (session-correct via B7's
  // monthStartDate) — compared against each student's admission month.
  var monthKey = monthStartDate(month).slice(0, 7);
  var existing = {};
  db.feeRecords.forEach(function (r) { if (r.month === month) existing[r.studentId + '|' + feeTypeOf(r)] = 1; });
  var made = 0, skipped = 0, notYetAdm = 0;
  db.students.forEach(function (s) {
    // v34 (P0-3): dues only for enrolled students — Draft (admission not
    // finished) and Cancelled never get a due.
    if (!isEnrolledStudent(s)) return;
    // B3: no bill for months before the student's admission month. A blank
    // admissionDate (old records) bills as before; the admission month
    // itself is billed in full — there is no pro-rata billing.
    var admMonth = String(s.admissionDate || '').slice(0, 7);
    if (admMonth && /^\d{4}-\d{2}$/.test(admMonth) && monthKey < admMonth) { notYetAdm++; return; }
    (db.feeStructure || []).forEach(function (row) {
      if (row.cls !== s.cls) return;
      var key = s.id + '|' + row.type;
      if (existing[key]) { skipped++; return; }
      // v34 (P0-3): a deterministic id — 'fee-gen-<student>-<month>-<type>'.
      // Two devices generating the same month create the SAME local_id, so
      // the upload pass dedupes by local_id and only one Pending row ever
      // lands on the server. (A unique constraint on ss_fee_records would
      // break partial payments, which create a second Collected record for
      // the same student/month/type — so the dedupe is by id, not by
      // constraint.)
      db.feeRecords.push({ id: 'fee-gen-' + s.id + '-' + month + '-' + row.type, studentId: s.id, student: s.name, cls: s.cls,
        month: month, type: row.type, amount: row.amount, status: 'Pending', date: monthStartDate(month) });
      existing[key] = 1; made++;
    });
  });
  if (made > 0) logAudit('Fees generated', made + ' records • ' + month);
  var fsmGen = feeStatusMap(); // Perf (v154): one pass, not one full scan per student
  db.students.forEach(function (s) { s.fee = fsmGen[s.id] || '—'; });
  saveDB(db); renderApp();
  var msg = '✓ ' + made + ' ' + t('tGenRecords') + ' ' + month + ' • ' + skipped + ' ' + t('tGenSkipped');
  if (notYetAdm) msg += ' • ' + notYetAdm + ' ' + t('tGenNotAdmitted');
  toast(msg + '.');
}

/* ================= print ================= */
function printRowsToArea(title, sub, headHtml, bodyHtml, totalsHtml) {
  var printLogoHtml = db.profile.logo ? '<img class="print-logo" src="' + esc(sbDisplayPhoto(db.profile.logo)) + '" alt="" onerror="this.remove()">' : '';
  $('printArea').innerHTML = '<div class="print-stmt"><div class="print-head">' + printLogoHtml + '<div><h1>' + esc(db.profile.name) + '</h1><p class="muted">' + esc(db.profile.address || '') + ' • ' + esc(db.profile.phone || '') + '</p></div></div>' +
    '<h2>' + esc(title) + '</h2><p>' + sub + '</p><table><thead><tr>' + headHtml + '</tr></thead><tbody>' + bodyHtml + '</tbody></table>' + totalsHtml +
    '<p class="muted mt-14">' + t('printGenOn') + ' ' + todayIST() + '</p></div>';
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
  printRowsToArea(t('printTitle'), esc(s.name) + ' • ' + t('thClass') + ' ' + esc(s.cls) + ' • ' + t('thEnr') + ' ' + esc(s.enr || '—') + ' • ' + t('thGuardian') + ' ' + esc(s.guardian || '—'),
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
  var logoHtml = db.profile.logo ? '<img class="id-logo-img" src="' + esc(sbDisplayPhoto(db.profile.logo)) + '" alt="" onerror="this.remove()">' : '<span class="id-logo-cap">🎓</span>';
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
  if (!ids.length) { toast(t('tNotAllowed')); return; }
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
// v34 (P0-2): a Paid amount above the net due (Due - Con) is never
// taken. Cap it and report the excess, so the fee records and the
// receipt total always agree — the old code stored rec.amount = net
// while the receipt total kept the full paid amount, so feeTotals()
// undercounted against receipts. Returns the excess amount capped.
function clampCollectLines(d) {
  var excess = 0;
  (d.lines || []).forEach(function (ln) {
    var net = Math.max(0, (+ln.due || 0) - (+ln.con || 0));
    var paid = +ln.paid || 0;
    if (paid > net) { excess += paid - net; ln.paid = net; }
  });
  return excess;
}
function reapplyLineEdits(oldLines, newLines) {
  newLines.forEach(function (nl) {
    var o = (oldLines || []).find(function (x) { return x.key === nl.key; });
    if (o) { nl.due = o.due; nl.con = o.con; nl.paid = o.paid; }
  });
  clampCollectLines({ lines: newLines }); // v34 (P0-2): a copied paid can exceed the new net
}
function newCollectDraft(sid, recordId) {
  var month = collectMonthDefault();
  var pref = recordId ? db.feeRecords.find(function (r) { return r.id === recordId; }) : null;
  if (pref) month = pref.month;
  return { studentId: sid, month: month, counterNo: 'COUNTER-1', payMode: 'Cash', payDate: todayIST(), bank: '', number: '', lines: buildCollectLines(sid, recordId, month), busIncluded: busDefault(sid) };
}
function openCollectFee(sid, recordId) {
  // v92: the accountant collects fees too — the school admin and the
  // accountant are the only roles that open the collect screen.
  if (state.role !== 'school' && state.role !== 'accountant') return;
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
  // v34 (P0-2): cap Paid at the net due here too (readCollectInputs reads
  // the raw inputs, unlike collectLineEdit which caps on every keystroke)
  // and write the capped values back so the screen shows what is taken.
  var capped = clampCollectLines(d);
  if (capped > 0) d.lines.forEach(function (ln) { var pv = $('rcptPaid-' + ln.key); if (pv) pv.value = ln.paid; });
  d.cappedExcess = capped;
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
// v47: the display student for a saved receipt, resolved from the
// receipt's own stored fields — never from a local-student lookup by
// id. A receipt carries its own student name, class and admission
// number (student_name / admission_no on the server row, name /
// admissionNo locally); the live test account proved why that
// matters: the local list still holds the demo-seed "Aarav Verma"
// under the same id (stu1794162292000) as the real V21 Test Kumar,
// so every id lookup renamed the receipt to Aarav while the fee list
// — which renders the fee record's own stored name — said V21. The
// local row supplies only the photo (the receipt carries no photo);
// name, class and admission number always come from the receipt
// itself, so even a stale local seed can never rename one.
function receiptStudent(rc) {
  var s = (db.students || []).find(function (x) { return x.id === rc.studentId; });
  return { id: rc.studentId, name: rc.name || (s && s.name) || '', cls: rc.cls || (s && s.cls) || '',
    admissionNo: rc.admissionNo || (s && s.admissionNo) || '', enr: rc.admissionNo || (s && s.enr) || '',
    photo: (s && s.photo) || null, session: rc.session || (s && s.session) || '' };
}
// One receipt renderer for the draft page, the saved view and print. Never
// includes Aadhaar (the receipt has no field for it by design).
function receiptHTML(rcpt, s, editable) {
  var logoHtml = db.profile.logo ? '<img class="rcpt-logo" src="' + esc(sbDisplayPhoto(db.profile.logo)) + '" alt="" onerror="this.remove()">' : '<span class="rcpt-logo-cap">🎓</span>';
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
  if (state.savedReceiptId) {
    var rc = (db.receipts || []).find(function (r) { return r.receiptNo === state.savedReceiptId; });
    if (rc) {
      // v47: the receipt resolves its student from its own stored
      // fields (see receiptStudent) — a local row with the same id
      // must never rename it (live: the seed "Aarav Verma" under the
      // V21 id renamed every receipt detail). v41's fallback survives
      // inside the helper: a missing local row still renders from the
      // receipt's own name, class and admission number.
      var s2 = receiptStudent(rc);
      return '<div class="page-head"><div><h2>' + t('rcptTitle') + '</h2><p>' + esc(s2.name) + ' • ' + esc(s2.cls) + ' • ' + esc(s2.admissionNo || '') + '</p></div>' +
        '<div class="toolbar"><button class="btn ghost" onclick="backFromReceipt()">← ' + t('backFees') + '</button></div></div>' +
        receiptHTML(rc, s2, false) +
        '<div class="actions"><button class="btn" onclick="printReceipt(' + jsAttr(rc.receiptNo) + ')">🖨 ' + t('rcptPrint') + '</button>' +
        '<button class="btn" onclick="waReceiptShare(' + jsAttr(rc.receiptNo) + ')">💬 ' + t('waShareReceiptBtn') + '</button>' +
        '<button class="btn green" onclick="openCollectFee(\'' + s2.id + '\')">' + t('rcptCollectAgain') + '</button></div>';
    }
    state.savedReceiptId = null;
  }
  if (!s) { state.collectStudent = null; return feesPage(); }
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
  // v92: only the school admin and the accountant ever collect a fee.
  if (state.role !== 'school' && state.role !== 'accountant') { toast(t('tNotAllowed')); return false; }
  var d = collectDraft; if (!d) return false;
  readCollectInputs();
  var s = db.students.find(function (x) { return x.id === d.studentId; });
  if (!s) return false;
  var total = collectDraftTotal(d);
  if (total <= 0) { toast(t('tCollectZero')); return false; }
  // v33: for a server account the receipt number comes from the server,
  // never from the local counter. Offline the receipt is saved WITHOUT
  // a number (numPending) and minted on the next sync. Local-only
  // accounts mint locally, exactly as before.
  var act33 = sbSyncActive();
  if (act33 && sbIsOnline()) {
    sbMintNewReceiptNumber(act33).then(function (no) { finishCollectFee(d, s, total, no, false); })
      .catch(function () { finishCollectFee(d, s, total, '', true); });
    return false;
  }
  if (act33) { finishCollectFee(d, s, total, '', true); return false; }
  finishCollectFee(d, s, total, nextReceiptNo(false), false);
  return false;
}
function finishCollectFee(d, s, total, receiptNo, numPending) {
  var today = d.payDate || todayIST();
  // v34 (P0-2): cap Paid at the net due and recompute the total from the
  // capped lines, so the fee records and the receipt total always agree.
  var cappedExcess = clampCollectLines(d);
  total = 0;
  d.lines.forEach(function (ln) { total += +ln.paid || 0; });
  var savedLines = [];
  d.lines.forEach(function (ln, i) {
    var paid = +ln.paid || 0, due = +ln.due || 0, con = +ln.con || 0;
    var net = Math.max(0, due - con);
    // B2: the saved line carries the id of the Collected fee record
    // this line paid. The receipt content key uses those ids to tell
    // two genuinely different same-day same-amount collections apart
    // (same student, month, total, date, name and fee type). A line
    // that paid nothing has no collection behind it, so it carries
    // no id. The id is the fee record's local id, which the server
    // already stores (ss_fee_records.local_id), so it survives the
    // upload/download round trip inside the receipt's lines.
    var sl = { desc: ln.desc, type: ln.type, month: ln.month, due: due, con: con, paid: paid, recordId: '' };
    savedLines.push(sl);
    if (paid <= 0) return;
    var rec = ln.recordId ? db.feeRecords.find(function (r) { return r.id === ln.recordId; }) : null;
    if (rec) {
      if (paid >= net) { rec.status = 'Collected'; rec.amount = net; rec.date = today; sl.recordId = rec.id; }
      else {
        rec.amount = net - paid; // remainder stays Pending
        var nr = { id: uniqueId('fee'), studentId: s.id, student: s.name, cls: s.cls, month: ln.month, type: ln.type, amount: paid, status: 'Collected', date: today };
        db.feeRecords.push(nr);
        sl.recordId = nr.id;
      }
    } else {
      var nr2 = { id: uniqueId('fee'), studentId: s.id, student: s.name, cls: s.cls, month: ln.month, type: ln.type, amount: paid, status: 'Collected', date: today };
      db.feeRecords.push(nr2);
      sl.recordId = nr2.id;
      if (paid < net) db.feeRecords.push({ id: uniqueId('fee'), studentId: s.id, student: s.name, cls: s.cls, month: ln.month, type: ln.type, amount: net - paid, status: 'Pending', date: today });
    }
  });
  var rc = { receiptNo: receiptNo, studentId: s.id, admissionNo: s.admissionNo || s.enr || '', name: s.name, cls: s.cls, session: s.session || currentSession(), date: today, month: d.month, counterNo: d.counterNo, lines: savedLines, payMode: d.payMode, payDate: d.payDate, bank: d.bank, number: d.number, total: total, totalWords: numberToWords(total), collector: state.user ? state.user.name : '' };
  if (numPending) rc.numPending = true;
  if (!Array.isArray(db.receipts)) db.receipts = [];
  db.receipts.push(rc);
  refreshStudentFee(s.id);
  logAudit('Fee collected', s.name + ' • ' + (receiptNo || 'pending') + ' • ₹' + total);
  addActivity('💰', 'green', 'Fee collected', s.name + ' • ' + (receiptNo || 'pending') + ' • ' + inr(total));
  saveDB(db);
  if (numPending) {
    // No receipt number yet: show the student's fee profile instead of
    // a receipt view (there is no receipt number to open).
    state.savedReceiptId = null; state.feeStudent = s.id; collectDraft = null;
    histReplaceTop({ view: 'fees', sub: 'profile:' + s.id });
    renderApp();
    toast(t('sbNumPendingReceipt') + (cappedExcess > 0 ? ' ' + t('tCollectCapped') : ''));
    return false;
  }
  state.savedReceiptId = receiptNo; collectDraft = null;
  histReplaceTop({ view: 'fees', sub: 'receipt:' + receiptNo }); // Back from the saved receipt goes to the fee profile, not the spent collect form
  renderApp();
  toast('✓ ' + t('tCollectSaved') + receiptNo + ' • ' + inr(total) + (cappedExcess > 0 ? ' • ' + t('tCollectCapped') : ''));
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
  // v47: same receiptStudent resolution as the detail view — the print
  // must never say Aarav when the receipt says V21, and a missing
  // local row must not blank the print (v41).
  var s = receiptStudent(rc);
  $('printArea').innerHTML = '<div class="print-rcpt">' + receiptHTML(rc, s, false) + '</div>';
  if (window.print) window.print();
}
var PAGE_SCHOOL = { dashboard: schoolDashboard, students: studentsPage, attendance: attendancePage, fees: feesPage, exams: null, homework: null, notices: null, reports: null, settings: null };


