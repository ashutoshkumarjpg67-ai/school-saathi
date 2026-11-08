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
var GROWTH = [ // School Growth Mon–Sun
  { d: 'Mon', v: 10 }, { d: 'Tue', v: 12 }, { d: 'Wed', v: 11 },
  { d: 'Thu', v: 14 }, { d: 'Fri', v: 13 }, { d: 'Sat', v: 18 }, { d: 'Sun', v: 24 }
];
var DEMO_ACCOUNTS = {
  super:  { id: 'super@school-saathi.in', pw: 'admin123', role: 'super',  name: 'Super Admin', sub: 'Platform Owner' },
  school: { id: 'rahul@stxavier.in',      pw: 'admin123', role: 'school', name: 'Rahul Kumar',  sub: 'School Admin • St. Xavier School' },
  student:{ id: 'riya@student.in',        pw: 'student123', role: 'student', name: 'Riya Kumari', sub: 'Student • Class 10th-A' }
};

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
var CLASSES = ['6th-A','6th-B','7th-A','7th-B','8th-A','8th-B','9th-A','9th-B','10th-A','10th-B'];
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
      var rec = { id: 'stu' + (idx + 1), name: name, cls: cls, roll: r,
        guardian: 'Mr. ' + LAST[(idx * 5 + 1) % LAST.length],
        phone: '98' + String(10000000 + ((idx * 7919) % 89999999)),
        att: 85 + ((idx * 7) % 14), result: 62 + ((idx * 11) % 36),
        fee: feePending ? 'Pending' : 'Paid' };
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
          month: mo.m, amount: amt, status: status, date: '2026-0' + (mi + 4) + '-' + String(3 + ((k * 5) % 24)).padStart(2, '0') });
      }
    }
    split(mo.collected, 10, 'Collected');
    split(mo.pending, 4, 'Pending');
  });
  // Riya Kumari (demo student) gets one Collected record so her "Paid" status is evidence-based (totals unchanged).
  var riyaStu = students.find(function (s) { return s.name === 'Riya Kumari'; });
  if (riyaStu) {
    var donorRec = feeRecords.find(function (r) { return r.month === 'Apr' && r.status === 'Collected' && r.studentId === students[27].id; });
    if (donorRec) { donorRec.studentId = riyaStu.id; donorRec.student = riyaStu.name; }
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
    attendanceAgg: { present: 1150, absent: 70, late: 30 },
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
      { icon: '💰', bg: 'green', title: 'New fee payment received', sub: 'by Priya Kumari', time: '2 min ago' },
      { icon: '✅', bg: 'blue', title: 'Attendance updated', sub: 'Class 10th-A', time: '5 min ago' },
      { icon: '📢', bg: 'orange', title: 'New notice published', sub: 'Annual Sports Day', time: '10 min ago' }
    ],
    profile: { name: 'St. Xavier School', city: 'Patna', principal: 'Rahul Kumar', phone: '+91 98350 12345', email: 'info@stxavierpatna.edu.in', session: '2025–26', address: 'Boring Road, Patna, Bihar — 800001' }
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
function loadDB() {
  try {
    var raw = localStorage.getItem(DB_KEY);
    if (raw) {
      var d = JSON.parse(raw);
      if (d && d.v === 2) return migrateAttendance(d);
      // Unknown version: keep a backup, never wipe silently.
      try { localStorage.setItem(DB_KEY + '.bak', raw); } catch (e2) { /* ignore */ }
    }
  } catch (e) { /* storage unavailable — fall back to memory */ }
  var fresh = seedDB();
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
var state = { role: null, user: null, view: 'dashboard', lang: 'en', feeFilter: 'All', stuSearch: '', stuClass: 'All', attCls: '10th-A', attDate: '', examId: 'ex1', attSnapKey: '', attSnap: {} };

/* ================= utils ================= */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
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
function countUp(el, target, opts) {
  opts = opts || {};
  var dur = opts.dur || 600, start = null, pre = opts.prefix || '', suf = opts.suffix || '';
  function step(ts) {
    if (!start) start = ts;
    var p = Math.min(1, (ts - start) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = pre + Math.round(target * e).toLocaleString('en-IN') + suf;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function runCountUps(root) {
  (root || document).querySelectorAll('[data-count]').forEach(function (el) {
    countUp(el, parseFloat(el.getAttribute('data-count')), { prefix: el.getAttribute('data-prefix') || '', suffix: el.getAttribute('data-suffix') || '' });
  });
}
function feeTotals() {
  var c = 0, p = 0;
  db.feeRecords.forEach(function (r) { if (r.status === 'Collected') c += r.amount; else p += r.amount; });
  return { collected: c, pending: p };
}
function feeChartData() {
  // Month-wise totals computed LIVE from feeRecords, not the static seed ledger.
  var months = ['Apr', 'May', 'Jun', 'Jul', 'Aug'];
  return months.map(function (m) {
    var c = 0, p = 0;
    db.feeRecords.forEach(function (r) { if (r.month === m) { if (r.status === 'Collected') c += r.amount; else p += r.amount; } });
    return { label: m, collected: c, pending: p };
  });
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
function donutPct(v, total) { return total ? Math.round(v / total * 100) : 0; }
function attTotal() { var a = db.attendanceAgg; return a.present + a.absent + a.late; }
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
function addActivity(icon, bg, title, sub) {
  db.activities.unshift({ icon: icon, bg: bg, title: title, sub: sub, time: 'Just now' });
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
function openModal(html) { $('modalRoot').innerHTML = '<div class="modal-back" onclick="if(event.target===this)closeModal()"><div class="modal">' + html + '</div></div>'; }
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
function lineChartSVG(data) {
  var W = 560, H = 250, padL = 40, padB = 28, padT = 18, maxV = 26;
  var iw = W - padL - 16, ih = H - padT - padB;
  if (!data || !data.length) return '<div class="empty">' + t('tNoGrowthData') + '</div>';
  var span = Math.max(1, data.length - 1);
  function px(i) { return padL + (iw / span) * i; }
  function py(v) { return padT + ih - (v / maxV) * ih; }
  var pts = data.map(function (d, i) { return [px(i), py(d.v)]; });
  var d = 'M' + pts.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' L');
  var area = d + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + (padT + ih) + ' L' + pts[0][0].toFixed(1) + ' ' + (padT + ih) + ' Z';
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="School growth chart">';
  [0, 0.5, 1].forEach(function (f) {
    var yy = padT + ih * (1 - f);
    s += '<line class="grid-ln" x1="' + padL + '" y1="' + yy + '" x2="' + (W - 10) + '" y2="' + yy + '"/>' +
      '<text class="axis-lbl" x="' + (padL - 6) + '" y="' + (yy + 4) + '" text-anchor="end">' + Math.round(f * maxV) + '</text>';
  });
  s += '<path d="' + area + '" fill="rgba(37,99,235,.10)" stroke="none"/>';
  s += '<path class="line-path" d="' + d + '" fill="none" stroke="' + BLUE + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
  data.forEach(function (dt, i) {
    s += '<circle cx="' + pts[i][0] + '" cy="' + pts[i][1] + '" r="5" fill="#fff" stroke="' + BLUE + '" stroke-width="2.5" data-tip="' + dt.d + ': ' + dt.v + ' Schools"/>';
    s += '<text class="axis-lbl" x="' + pts[i][0] + '" y="' + (H - 6) + '" text-anchor="middle">' + dt.d + '</text>';
  });
  s += '</svg>';
  return s;
}
function animateLine(root) {
  (root || document).querySelectorAll('.line-path').forEach(function (p) {
    var len = 0;
    try { len = p.getTotalLength(); } catch (e) { len = 900; }
    p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
    requestAnimationFrame(function () { p.style.strokeDashoffset = '0'; });
  });
}

/* ================= i18n ================= */
var I18N = {
  en: {
    dashboard: 'Dashboard', schools: 'Schools', users: 'Users', subscriptions: 'Subscriptions', analytics: 'Analytics', settings: 'Settings', reports: 'Reports', help: 'Help & Support', students: 'Student Management', attendance: 'Attendance', fees: 'Fees', exams: 'Examinations', homework: 'Homework', notices: 'Notices', totalSchools: 'Total Schools', totalUsers: 'Total Users', activeSchools: 'Active Schools', pendingApproval: 'Pending Approval', totalStudents: 'Total Students', totalTeachers: 'Total Teachers', feeCollected: 'Fee Collected', pendingFee: 'Pending Fee', logout: 'Logout',
    navFeatures: 'Features', navDashboards: 'Dashboards', navSchools: 'Schools', navLogin: 'Login',
    heroTitle: 'Next-Generation School Management System', heroSub: 'For a Smarter & Brighter Education Future — one app for the whole school: students, teachers, fees, attendance, exams and notices.', heroGetStarted: 'Get Started →', heroExplore: 'Explore Demo',
    statsTitle: 'Trusted by schools across Bihar', statsSub: 'Live platform figures from the School Saathi network.', todayAttendance: 'Today\'s Attendance', feeCollectedRange: 'Fee Collected (Apr–Aug)', up12: '↑ 12% this month', up18: '↑ 18% this month', presentOf: '1,150 present of 1,250', pendingAmt: '₹1,20,000 pending',
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
    loginWelcome: 'Welcome Back!<br>Login to continue', loginEmail: 'Email or Mobile Number', loginPassword: 'Password', loginEmailPh: 'e.g. rahul@stxavier.in', loginPwPh: '••••••••', loginForgot: 'Forgot Password?', loginBtn: 'Login', loginOr: 'Or continue with', demoTitle: '— One-tap demo login —', loginBack: '← Back to website',
    superDashboard: 'Super Admin Dashboard', schoolDashboard: 'School Admin Dashboard', studentDashboard: 'Student Dashboard',
    confirmTitle: 'Confirm', cancel: 'Cancel', confirmYes: 'Yes, continue', saveBtn: 'Save',
    addSchool: 'Add School', addStudent: 'Add Student', saveAttendance: 'Save Attendance', saveMarks: 'Save Marks', addHomework: 'Add Homework', publishNotice: 'Publish Notice', downloadReport: 'Download Report', approve: 'Approve', remove: 'Remove', editBtn: 'Edit', deleteBtn: 'Delete', collectBtn: 'Collect', saveSettingsBtn: 'Save Settings', resetDemo: 'Reset Demo Data', publishBtn: 'Publish', assignHw: 'Assign Homework', saveSchoolBtn: 'Save School', saveStudentBtn: 'Save Student',
    attOverview: 'Attendance Overview', todayAtt: 'Today\'s Attendance', feeTrend: 'Fee Collection Trend', feeTrendSub: 'Apr – Aug (Collected vs Pending)', feeTrendSub2: 'Apr to Aug (Collected vs Pending)', recentAct: 'Recent Activities', quickLinks: 'Quick Links', jumpTask: 'Jump to a task', top5: 'Top 5 Schools', byStrength: 'By student strength', schoolGrowth: 'School Growth', growthSub: 'New schools onboarded this week', growthWeek: 'This week (Mon–Sun)', subsStatus: 'Subscription Status', subsSub: 'Share of schools by plan status', quickActions: 'Quick Actions', qaSub: 'Common admin tasks', enterMarks: 'Enter Marks', myHomework: 'My Homework', noticesH: 'Notices', latestNotices: 'Latest from school', plansH: 'Plans', guidesH: 'Quick Guides', guidesSub: 'Most common tasks', contactH: 'Contact', contactSub: 'We reply within one working day', studentsReport: 'Students Report', feesReport: 'Fees Report', attReport: 'Attendance Report', schoolsReport: 'Schools Report',
    thName: 'Name', thClass: 'Class', thRoll: 'Roll', thGuardian: 'Guardian', thPhone: 'Phone', thAtt: 'Att.', thFee: 'Fee', thAction: 'Action', thStudent: 'Student', thMonth: 'Month', thAmount: 'Amount', thDate: 'Date', thStatus: 'Status', thSchool: 'School', thCity: 'City', thStudents: 'Students', thUsers: 'Users', thPlan: 'Plan', thMarks: 'Marks', thResult: 'Result', thSince: 'Since', thRole: 'Role',
    subSuperDash: 'Platform Overview & Management', subSchools: 'All schools on the platform', subUsers: 'Teachers, staff & students', subSubs: 'Plans & billing status', subAnalytics: 'Growth, attendance & fees', subAnalyticsFull: 'Growth, attendance & fees across the platform', subReports: 'Download CSV reports', subHelp: 'Guides & contact', subStudents: 'St. Xavier School, Patna', subAttendance: 'Mark & view attendance', subFees: 'Fee collection & pending dues', subExams: 'Exams & marks entry', subHomework: 'Assign & track homework', subNotices: 'Notice board',
    fSchoolName: 'School Name', fCity: 'City', fStudents: 'Students', fPlan: 'Plan', fStudentName: 'Student Name', fClass: 'Class', fRoll: 'Roll No', fGuardian: 'Guardian', fPhone: 'Phone', fTitle: 'Title', fSubject: 'Subject', fDue: 'Due Date', fMessage: 'Message', fPrincipal: 'Principal / Admin', fEmail: 'Email', fAddress: 'Address', fSession: 'Academic Session',
    tLoggedIn: 'Logged in as', tLoggedOut: 'Logged out. See you soon!', tSchoolAdded: 'School added — pending approval.', tSchoolRemoved: 'School removed.', tStudentAdded: 'Student added.', tStudentUpdated: 'Student updated.', tStudentDeleted: 'Student deleted.', tAttSaved: 'Attendance saved', tMarksSaved: 'Marks saved for', tHwDone: 'Homework marked done.', tHwNotDone: 'Homework marked not done.', tHwAssigned: 'Homework assigned.', tNoticePub: 'Notice published.', tReportDl: 'Report downloaded.', tSettingsSaved: 'Settings saved.', tDemoReset: 'Demo data reset.', tSessionChanged: 'Academic session changed to', tApproved: 'approved. Pending approvals:', tNoChanges: 'No changes.', tStudentsRange: 'Students must be between 1 and 100,000.', tFutureDate: 'Future date not allowed — showing today.', tDueFuture: 'Due date must be today or later.', tDemoLogin: 'Demo account — use one-tap login below.', tGoogleDemo: 'Demo build — please use a one-tap demo login.', tNoStudentData: 'No student data — ask your school admin to add students.', tNoExams: 'No exams yet.', tNoHw: 'No homework yet.', tNoMarks: 'No marks entered yet for this exam.', tNoMatch: 'No students match.', tNoSchoolsMatch: 'No schools match.', tNotEntered: 'Not entered', tCollectedFrom: 'collected from', tDupSchool: 'already exists.', tDupStudent: 'already exists in', tNotSaved: 'Not saved', tCheckMarks: 'check marks', tStudentsWord: 'students', tNoFeeData: 'No fee data yet.', tNoGrowthData: 'No growth data yet.',
    searchStudent: 'Search student…', searchSchool: 'Search school or city…', viewAll: 'View All →', classAvg: 'Class average', studentsMarked: 'students marked', ofWord: 'of', demoRecords: 'demo records shown (school total 1,250)', showingRec: 'Showing', ofRec: 'of', recordsWord: 'records.', tapDone: 'tap the box when done', myHwSub: 'Tap the box when you finish', tileAtt: 'Attendance', tileFees: 'Fees', tileResults: 'Results', tileHw: 'Homework', doneSuffix: 'done', presBtn: 'Present', absBtn: 'Absent', lateBtn: 'Late',
    qaAddSchool: 'Add School', qaAddSchoolD: 'Onboard a new school', qaManageUsers: 'Manage Users', qaManageUsersD: 'Roles & accounts', qaViewReports: 'View Reports', qaViewReportsD: 'Download CSV', qaSysSettings: 'System Settings', qaSysSettingsD: 'Platform config',
    qaAddStudent: 'Add Student', qaAddStudentD: 'New admission', qaMarkAtt: 'Mark Attendance', qaMarkAttD: 'Today\'s register', qaEnterMarks: 'Enter Marks', qaEnterMarksD: 'Exam results', qaGenReport: 'Generate Report', qaGenReportD: 'CSV download',
    dlStudents: 'Download Students CSV', dlFees: 'Download Fees CSV', dlAtt: 'Download Attendance CSV', dlSchools: 'Download Schools CSV',
    repStudentsSub: 'Name, class, roll, guardian, phone, attendance, fee status', repFeesSub: 'Student, class, month, amount, status — Apr to Aug',
    subSettingsP: 'Platform settings', subSettingsS: 'School profile', settingsSub: 'Edit and save — changes persist on this device.',
    sysSettings: 'System Settings', platformConfig: 'Platform configuration', platformH: 'Platform', supName: 'Platform name', supTagline: 'Tagline', supSession: 'Default session', supEmail: 'Support email', supStorage: 'Data storage', supStorageV: 'This device (localStorage) — demo build',
    schoolAdmins: 'School Admins', teachersW: 'Teachers', studentsW: 'Students', perSchool: '2 per school',
    schoolsOnPlatform: 'schools on the platform', pendingApprovalL: 'pending approval',
    planBasicT: 'Basic — ₹8 / student / month', planBasicD: 'Attendance, fees, notices', planStdT: 'Standard — ₹12 / student / month', planStdD: '+ Exams, homework, reports', planPremT: 'Premium — ₹15 / student / month', planPremD: '+ Analytics, WhatsApp, priority support', setupLine: 'Setup ₹4,999 one-time • 1 month free trial • Annual advance = 2 months free.',
    guide1t: 'Add a school', guide1d: 'Schools → + Add School → fill details → Save. New schools start as Pending until approved.', guide2t: 'Collect a fee', guide2d: 'School Admin → Fees → Collect on a pending record. Totals update instantly.', guide3t: 'Mark attendance', guide3d: 'School Admin → Attendance → pick class & date → Present / Absent / Late → Save.',
    contactPhone: 'Phone', contactHours: 'Hours', hoursV: 'Mon–Sat, 9 AM – 6 PM', raiseSupport: 'Raise a Support Request', supportNoted: 'Support request noted — we will call you back.',
    sampleList: 'sample list below', plansSub: 'Per-student monthly pricing', collectedW: 'Collected', pendingW: 'Pending', allW: 'All', editStudent: 'Edit Student', thePlatform: 'the platform', repSchoolsSub: 'city, students, plan, status', subActive: 'Active', subExpired: 'Expired', subTrial: 'Trial'
  },
  hi: {
    dashboard: 'डैशबोर्ड', schools: 'स्कूल', users: 'उपयोगकर्ता', subscriptions: 'सदस्यता', analytics: 'विश्लेषण', settings: 'सेटिंग्स', reports: 'रिपोर्ट', help: 'सहायता', students: 'छात्र प्रबंधन', attendance: 'उपस्थिति', fees: 'शुल्क', exams: 'परीक्षा', homework: 'होमवर्क', notices: 'नोटिस', totalSchools: 'कुल स्कूल', totalUsers: 'कुल उपयोगकर्ता', activeSchools: 'सक्रिय स्कूल', pendingApproval: 'स्वीकृति लंबित', totalStudents: 'कुल छात्र', totalTeachers: 'कुल शिक्षक', feeCollected: 'शुल्क संग्रह', pendingFee: 'बकाया शुल्क', logout: 'लॉगआउट',
    navFeatures: 'सुविधाएँ', navDashboards: 'डैशबोर्ड', navSchools: 'स्कूल', navLogin: 'लॉगिन',
    heroTitle: 'नेक्स्ट-जनरेशन स्कूल मैनेजमेंट सिस्टम', heroSub: 'बेहतर और उज्ज्वल शिक्षा के लिए — पूरे स्कूल के लिए एक ऐप: छात्र, शिक्षक, शुल्क, उपस्थिति, परीक्षा और नोटिस।', heroGetStarted: 'शुरू करें →', heroExplore: 'डेमो देखें',
    statsTitle: 'बिहार भर के स्कूलों का भरोसा', statsSub: 'School Saathi नेटवर्क के लाइव आंकड़े।', todayAttendance: 'आज की उपस्थिति', feeCollectedRange: 'शुल्क संग्रह (अप्रैल–अगस्त)', up12: '↑ इस महीने 12%', up18: '↑ इस महीने 18%', presentOf: '1,250 में से 1,150 उपस्थित', pendingAmt: '₹1,20,000 बकाया',
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
    loginWelcome: 'वापस स्वागत है!<br>जारी रखने के लिए लॉगिन करें', loginEmail: 'ईमेल या मोबाइल नंबर', loginPassword: 'पासवर्ड', loginEmailPh: 'जैसे rahul@stxavier.in', loginPwPh: '••••••••', loginForgot: 'पासवर्ड भूल गए?', loginBtn: 'लॉगिन', loginOr: 'या जारी रखें', demoTitle: '— एक टैप में डेमो लॉगिन —', loginBack: '← वेबसाइट पर वापस',
    superDashboard: 'सुपर एडमिन डैशबोर्ड', schoolDashboard: 'स्कूल एडमिन डैशबोर्ड', studentDashboard: 'छात्र डैशबोर्ड',
    confirmTitle: 'पुष्टि करें', cancel: 'रद्द करें', confirmYes: 'हाँ, जारी रखें', saveBtn: 'सहेजें',
    addSchool: 'स्कूल जोड़ें', addStudent: 'छात्र जोड़ें', saveAttendance: 'उपस्थिति सहेजें', saveMarks: 'अंक सहेजें', addHomework: 'होमवर्क जोड़ें', publishNotice: 'नोटिस प्रकाशित करें', downloadReport: 'रिपोर्ट डाउनलोड करें', approve: 'स्वीकृत करें', remove: 'हटाएँ', editBtn: 'बदलें', deleteBtn: 'हटाएँ', collectBtn: 'वसूलें', saveSettingsBtn: 'सेटिंग्स सहेजें', resetDemo: 'डेमो डेटा रीसेट करें', publishBtn: 'प्रकाशित करें', assignHw: 'होमवर्क सौंपें', saveSchoolBtn: 'स्कूल सहेजें', saveStudentBtn: 'छात्र सहेजें',
    attOverview: 'उपस्थिति अवलोकन', todayAtt: 'आज की उपस्थिति', feeTrend: 'शुल्क संग्रह प्रवृत्ति', feeTrendSub: 'अप्रैल – अगस्त (संग्रह बनाम बकाया)', feeTrendSub2: 'अप्रैल से अगस्त (संग्रह बनाम बकाया)', recentAct: 'हाल की गतिविधियाँ', quickLinks: 'त्वरित लिंक', jumpTask: 'किसी कार्य पर जाएँ', top5: 'शीर्ष 5 स्कूल', byStrength: 'छात्र संख्या के अनुसार', schoolGrowth: 'स्कूल वृद्धि', growthSub: 'इस सप्ताह जुड़े नए स्कूल', growthWeek: 'इस सप्ताह (सोम–रवि)', subsStatus: 'सदस्यता स्थिति', subsSub: 'योजना स्थिति के अनुसार स्कूलों का हिस्सा', quickActions: 'त्वरित कार्य', qaSub: 'आम व्यवस्थापक कार्य', enterMarks: 'अंक भरें', myHomework: 'मेरा होमवर्क', noticesH: 'नोटिस', latestNotices: 'स्कूल से नवीनतम', plansH: 'योजनाएँ', guidesH: 'त्वरित मार्गदर्शिकाएँ', guidesSub: 'सबसे आम कार्य', contactH: 'संपर्क', contactSub: 'हम एक कार्य दिवस के भीतर जवाब देते हैं', studentsReport: 'छात्र रिपोर्ट', feesReport: 'शुल्क रिपोर्ट', attReport: 'उपस्थिति रिपोर्ट', schoolsReport: 'स्कूल रिपोर्ट',
    thName: 'नाम', thClass: 'कक्षा', thRoll: 'रोल', thGuardian: 'अभिभावक', thPhone: 'फ़ोन', thAtt: 'उप.', thFee: 'शुल्क', thAction: 'कार्रवाई', thStudent: 'छात्र', thMonth: 'महीना', thAmount: 'राशि', thDate: 'तारीख', thStatus: 'स्थिति', thSchool: 'स्कूल', thCity: 'शहर', thStudents: 'छात्र', thUsers: 'उपयोगकर्ता', thPlan: 'योजना', thMarks: 'अंक', thResult: 'परिणाम', thSince: 'से', thRole: 'भूमिका',
    subSuperDash: 'प्लेटफ़ॉर्म अवलोकन और प्रबंधन', subSchools: 'प्लेटफ़ॉर्म के सभी स्कूल', subUsers: 'शिक्षक, कर्मचारी और छात्र', subSubs: 'योजनाएँ और बिलिंग स्थिति', subAnalytics: 'वृद्धि, उपस्थिति और शुल्क', subAnalyticsFull: 'पूरे प्लेटफ़ॉर्म पर वृद्धि, उपस्थिति और शुल्क', subReports: 'CSV रिपोर्ट डाउनलोड करें', subHelp: 'मार्गदर्शिकाएँ और संपर्क', subStudents: 'सेंट ज़ेवियर स्कूल, पटना', subAttendance: 'उपस्थिति दर्ज करें और देखें', subFees: 'शुल्क संग्रह और बकाया', subExams: 'परीक्षा और अंक प्रविष्टि', subHomework: 'होमवर्क सौंपें और देखें', subNotices: 'नोटिस बोर्ड',
    fSchoolName: 'स्कूल का नाम', fCity: 'शहर', fStudents: 'छात्र', fPlan: 'योजना', fStudentName: 'छात्र का नाम', fClass: 'कक्षा', fRoll: 'रोल नंबर', fGuardian: 'अभिभावक', fPhone: 'फ़ोन', fTitle: 'शीर्षक', fSubject: 'विषय', fDue: 'देय तारीख', fMessage: 'संदेश', fPrincipal: 'प्रधानाचार्य / एडमिन', fEmail: 'ईमेल', fAddress: 'पता', fSession: 'शैक्षणिक सत्र',
    tLoggedIn: 'के रूप में लॉगिन हुआ', tLoggedOut: 'लॉगआउट हो गया। फिर मिलते हैं!', tSchoolAdded: 'स्कूल जोड़ा गया — स्वीकृति लंबित।', tSchoolRemoved: 'स्कूल हटाया गया।', tStudentAdded: 'छात्र जोड़ा गया।', tStudentUpdated: 'छात्र अपडेट हुआ।', tStudentDeleted: 'छात्र हटाया गया।', tAttSaved: 'उपस्थिति सहेजी गई', tMarksSaved: 'अंक सहेजे गए', tHwDone: 'होमवर्क पूर्ण के रूप में चिह्नित।', tHwNotDone: 'होमवर्क अपूर्ण के रूप में चिह्नित।', tHwAssigned: 'होमवर्क सौंपा गया।', tNoticePub: 'नोटिस प्रकाशित हुआ।', tReportDl: 'रिपोर्ट डाउनलोड हुई।', tSettingsSaved: 'सेटिंग्स सहेजी गईं।', tDemoReset: 'डेमो डेटा रीसेट हुआ।', tSessionChanged: 'शैक्षणिक सत्र बदला गया', tApproved: 'स्वीकृत। लंबित स्वीकृतियाँ:', tNoChanges: 'कोई बदलाव नहीं।', tStudentsRange: 'छात्रों की संख्या 1 से 100,000 के बीच होनी चाहिए।', tFutureDate: 'भविष्य की तारीख नहीं चुन सकते — आज की तारीख दिखा रहे हैं।', tDueFuture: 'देय तारीख आज या आगे की होनी चाहिए।', tDemoLogin: 'डेमो खाता — नीचे एक-टैप लॉगिन इस्तेमाल करें।', tGoogleDemo: 'डेमो बिल्ड — कृपया एक-टैप डेमो लॉगिन इस्तेमाल करें।', tNoStudentData: 'कोई छात्र डेटा नहीं — अपने स्कूल एडमिन से छात्र जोड़ने को कहें।', tNoExams: 'अभी कोई परीक्षा नहीं है।', tNoHw: 'अभी कोई होमवर्क नहीं है।', tNoMarks: 'इस परीक्षा के लिए अभी कोई अंक नहीं भरे गए।', tNoMatch: 'कोई छात्र नहीं मिला।', tNoSchoolsMatch: 'कोई स्कूल नहीं मिला।', tNotEntered: 'नहीं भरा गया', tCollectedFrom: 'से वसूला गया', tDupSchool: 'पहले से मौजूद है।', tDupStudent: 'में पहले से मौजूद है', tNotSaved: 'सहेजा नहीं गया', tCheckMarks: 'अंक जाँचें', tStudentsWord: 'छात्र', tNoFeeData: 'अभी कोई शुल्क डेटा नहीं है।', tNoGrowthData: 'अभी कोई वृद्धि डेटा नहीं है।',
    searchStudent: 'छात्र खोजें…', searchSchool: 'स्कूल या शहर खोजें…', viewAll: 'सभी देखें →', classAvg: 'कक्षा औसत', studentsMarked: 'छात्रों के अंक भरे गए', ofWord: 'में से', demoRecords: 'डेमो रिकॉर्ड दिखाए गए (स्कूल कुल 1,250)', showingRec: 'दिखाए जा रहे हैं', ofRec: 'में से', recordsWord: 'रिकॉर्ड।', tapDone: 'पूरा होने पर बॉक्स पर टैप करें', myHwSub: 'पूरा होने पर बॉक्स पर टैप करें', tileAtt: 'उपस्थिति', tileFees: 'शुल्क', tileResults: 'परिणाम', tileHw: 'होमवर्क', doneSuffix: 'पूर्ण', presBtn: 'उपस्थित', absBtn: 'अनुपस्थित', lateBtn: 'देर से',
    qaAddSchool: 'स्कूल जोड़ें', qaAddSchoolD: 'नया स्कूल जोड़ें', qaManageUsers: 'उपयोगकर्ता प्रबंधित करें', qaManageUsersD: 'भूमिकाएँ और खाते', qaViewReports: 'रिपोर्ट देखें', qaViewReportsD: 'CSV डाउनलोड करें', qaSysSettings: 'सिस्टम सेटिंग्स', qaSysSettingsD: 'प्लेटफ़ॉर्म कॉन्फ़िग',
    qaAddStudent: 'छात्र जोड़ें', qaAddStudentD: 'नया प्रवेश', qaMarkAtt: 'उपस्थिति दर्ज करें', qaMarkAttD: 'आज का रजिस्टर', qaEnterMarks: 'अंक भरें', qaEnterMarksD: 'परीक्षा परिणाम', qaGenReport: 'रिपोर्ट बनाएँ', qaGenReportD: 'CSV डाउनलोड',
    dlStudents: 'छात्र CSV डाउनलोड करें', dlFees: 'शुल्क CSV डाउनलोड करें', dlAtt: 'उपस्थिति CSV डाउनलोड करें', dlSchools: 'स्कूल CSV डाउनलोड करें',
    repStudentsSub: 'नाम, कक्षा, रोल, अभिभावक, फ़ोन, उपस्थिति, शुल्क स्थिति', repFeesSub: 'छात्र, कक्षा, महीना, राशि, स्थिति — अप्रैल से अगस्त',
    subSettingsP: 'प्लेटफ़ॉर्म सेटिंग्स', subSettingsS: 'स्कूल प्रोफ़ाइल', settingsSub: 'बदलें और सहेजें — बदलाव इस डिवाइस पर सहेजे जाते हैं।',
    sysSettings: 'सिस्टम सेटिंग्स', platformConfig: 'प्लेटफ़ॉर्म कॉन्फ़िगरेशन', platformH: 'प्लेटफ़ॉर्म', supName: 'प्लेटफ़ॉर्म का नाम', supTagline: 'टैगलाइन', supSession: 'डिफ़ॉल्ट सत्र', supEmail: 'सहायता ईमेल', supStorage: 'डेटा संग्रहण', supStorageV: 'इस डिवाइस पर (localStorage) — डेमो बिल्ड',
    schoolAdmins: 'स्कूल एडमिन', teachersW: 'शिक्षक', studentsW: 'छात्र', perSchool: 'प्रति स्कूल 2',
    schoolsOnPlatform: 'प्लेटफ़ॉर्म पर स्कूल', pendingApprovalL: 'स्वीकृति लंबित',
    planBasicT: 'बेसिक — ₹8 / छात्र / माह', planBasicD: 'उपस्थिति, शुल्क, नोटिस', planStdT: 'स्टैंडर्ड — ₹12 / छात्र / माह', planStdD: '+ परीक्षा, होमवर्क, रिपोर्ट', planPremT: 'प्रीमियम — ₹15 / छात्र / माह', planPremD: '+ विश्लेषण, WhatsApp, प्राथमिकता सहायता', setupLine: 'सेटअप ₹4,999 एक बार • 1 महीना मुफ़्त ट्रायल • वार्षिक अग्रिम = 2 महीने मुफ़्त।',
    guide1t: 'स्कूल जोड़ें', guide1d: 'स्कूल → + स्कूल जोड़ें → विवरण भरें → सहेजें। नए स्कूल स्वीकृति तक लंबित रहते हैं।', guide2t: 'शुल्क वसूलें', guide2d: 'स्कूल एडमिन → शुल्क → बकाया रिकॉर्ड पर वसूलें दबाएँ। कुल तुरंत अपडेट होता है।', guide3t: 'उपस्थिति दर्ज करें', guide3d: 'स्कूल एडमिन → उपस्थिति → कक्षा और तारीख चुनें → उपस्थित / अनुपस्थित / देर से → सहेजें।',
    contactPhone: 'फ़ोन', contactHours: 'समय', hoursV: 'सोम–शनि, सुबह 9 – शाम 6', raiseSupport: 'सहायता अनुरोध भेजें', supportNoted: 'सहायता अनुरोध दर्ज हुआ — हम आपको कॉल करेंगे।',
    sampleList: 'नमूना सूची नीचे', plansSub: 'प्रति छात्र मासिक मूल्य', collectedW: 'संग्रह', pendingW: 'बकाया', allW: 'सभी', editStudent: 'छात्र बदलें', thePlatform: 'पूरे प्लेटफ़ॉर्म', repSchoolsSub: 'शहर, छात्र, योजना, स्थिति', subActive: 'सक्रिय', subExpired: 'समाप्त', subTrial: 'परीक्षण'
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
  applyI18n();
  refreshLandingStats();
  if (state.role) renderApp();
}

/* ================= auth & shell ================= */
function showView(which) {
  hideTip();
  if (which === 'landing') refreshLandingStats();
  ['landing', 'login', 'app'].forEach(function (id) { $(id).classList.toggle('hidden', id !== which); });
  window.scrollTo(0, 0);
}
function showLogin() { showView('login'); $('loginId').focus(); }
function backToLanding(e) { e.preventDefault(); showView('landing'); return false; }
function forgotPw(e) { e.preventDefault(); toast(t('tDemoLogin')); return false; }
function googleLogin() { toast(t('tGoogleDemo')); }
function persistSession() {
  try {
    if (state.role) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role: state.role, view: state.view }));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch (e) { /* private mode — session just won't survive refresh */ }
}
function restoreSession() {
  try {
    var raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    var sv = JSON.parse(raw);
    var a = DEMO_ACCOUNTS[sv.role];
    if (!a) return false;
    state.role = a.role; state.user = a;
    state.view = (NAV[a.role] || []).some(function (n) { return n[0] === sv.view; }) ? sv.view : 'dashboard';
    showView('app'); renderApp();
    return true;
  } catch (e) { return false; }
}
function demoLogin(key) {
  var a = DEMO_ACCOUNTS[key];
  state.role = a.role; state.user = a; state.view = 'dashboard';
  showView('app'); renderApp();
  persistSession();
  toast(t('tLoggedIn') + ' ' + a.name + ' (demo)');
}
function doLogin(e) {
  e.preventDefault();
  var id = $('loginId').value.trim().toLowerCase(), pw = $('loginPw').value;
  var err = $('loginErr');
  var found = null;
  Object.keys(DEMO_ACCOUNTS).forEach(function (k) { if (DEMO_ACCOUNTS[k].id === id && DEMO_ACCOUNTS[k].pw === pw) found = k; });
  if (!found) {
    err.textContent = 'Invalid credentials. Please use a one-tap demo login below.';
    err.classList.remove('hidden');
    return false;
  }
  err.classList.add('hidden');
  demoLogin(found);
  return false;
}
function logout() {
  state.role = null; state.user = null; state.view = 'dashboard';
  state.attSnapKey = ''; state.attSnap = {};
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  $('loginId').value = ''; $('loginPw').value = '';
  $('page').innerHTML = '';
  showView('landing');
  toast(t('tLoggedOut'));
}

var NAV = {
  super: [
    ['dashboard', '🏠', 'dashboard'], ['schools', '🏫', 'schools'], ['users', '👥', 'users'],
    ['subscriptions', '💳', 'subscriptions'], ['analytics', '📊', 'analytics'], ['settings', '⚙️', 'settings'],
    ['reports', '📄', 'reports'], ['help', '❓', 'help']
  ],
  school: [
    ['dashboard', '🏠', 'dashboard'], ['students', '🎒', 'students'], ['attendance', '✅', 'attendance'],
    ['fees', '💰', 'fees'], ['exams', '📝', 'exams'], ['homework', '📚', 'homework'],
    ['notices', '📢', 'notices'], ['reports', '📄', 'reports'], ['settings', '⚙️', 'settings']
  ],
  student: [
    ['dashboard', '🏠', 'dashboard'], ['homework', '📚', 'homework'], ['notices', '📢', 'notices']
  ]
};
var VIEW_TITLES = {
  dashboard: ['Dashboard', 'Platform Overview & Management'],
  schools: ['Schools', 'All schools on the platform'], users: ['Users', 'Teachers, staff & students'],
  subscriptions: ['Subscriptions', 'Plans & billing status'], analytics: ['Analytics', 'Growth, attendance & fees'],
  settings: ['Settings', 'Platform / school settings'], reports: ['Reports', 'Download CSV reports'],
  help: ['Help & Support', 'Guides & contact'],
  students: ['Student Management', 'St. Xavier School, Patna'], attendance: ['Attendance', 'Mark & view attendance'],
  fees: ['Fees', 'Fee collection & pending dues'], exams: ['Examinations', 'Exams & marks entry'],
  homework: ['Homework', 'Assign & track homework'], notices: ['Notices', 'Notice board']
};
function go(view) {
  var nav = NAV[state.role] || [];
  var ok = nav.some(function (n) { return n[0] === view; });
  state.view = ok ? view : 'dashboard';
  persistSession();
  toggleSidebar(false);
  renderApp();
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
  $('whoAvatar').textContent = u.name.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
  $('whoName').textContent = u.name;
  $('whoRole').textContent = u.sub;
  var prof = db.profile;
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
  var vt = VIEW_TITLES[state.view] || ['Dashboard', ''];
  $('topTitle').textContent = t(state.view) === state.view ? vt[0] : t(state.view);
  if (state.view === 'dashboard') $('topTitle').textContent = t('dashboard');
  $('topCrumb').textContent = state.role === 'super' ? t('superDashboard') : (state.role === 'school' ? prof.name + ', ' + prof.city : t('studentDashboard'));
  renderPage();
}
function changeSession(v) {
  db.profile.session = v; saveDB(db);
  toast(t('tSessionChanged') + ' ' + v);
}
function renderPage() {
  var p = $('page');
  hideTip();
  var pages = state.role === 'super' ? PAGE_SUPER : state.role === 'school' ? PAGE_SCHOOL : PAGE_STUDENT;
  var fn = pages[state.view] || pages.dashboard;
  p.innerHTML = fn();
  runCountUps(p); animateDonuts(p); animateBars(p); animateLine(p);
}

function hideTip() { var tip = $('chartTip'); if (tip) { tip.style.opacity = '0'; tip.textContent = ''; } }
function refreshLandingStats() {
  if (typeof db === 'undefined' || !db) return;
  var sc = schoolCounts(), ft = feeTotals(), agg = db.attendanceAgg || { present: 1150, absent: 70, late: 30 };
  var total = agg.present + agg.absent + agg.late;
  var pct = total ? Math.round(agg.present / total * 100) : 0;
  var vals = [sc.total, 12450, pct, ft.collected];
  var nums = document.querySelectorAll('#stats .mini-stat .n');
  nums.forEach(function (el, i) {
    if (vals[i] == null) return;
    el.setAttribute('data-count', vals[i]);
    var pre = el.getAttribute('data-prefix') || '', suf = el.getAttribute('data-suffix') || '';
    el.textContent = pre + num(vals[i]) + suf;
  });
  var pr = $('landPresent'), pe = $('landPending');
  if (pr) pr.textContent = state.lang === 'hi' ? num(total) + ' \u092e\u0947\u0902 \u0938\u0947 ' + num(agg.present) + ' \u0909\u092a\u0938\u094d\u0925\u093f\u0924' : num(agg.present) + ' present of ' + num(total);
  if (pe) pe.textContent = inr(ft.pending) + (state.lang === 'hi' ? ' \u092c\u0915\u093e\u092f\u093e' : ' pending');
}

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
  return '<div class="stat"><div class="ic ' + cls + '">' + ic + '</div><div><div class="lbl">' + esc(label) + '</div>' +
    '<div class="val" data-count="' + value + '"' + (co.prefix ? ' data-prefix="' + co.prefix + '"' : '') + (co.suffix ? ' data-suffix="' + co.suffix + '"' : '') + '>0</div>' +
    '<div class="chg ' + chgCls + '">' + chg + '</div></div></div>';
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
    statCard('🏫', 'blue', t('totalSchools'), sc.total, '↑ 12%', 'up') +
    statCard('👥', 'green', t('totalUsers'), 12450, '↑ 18%', 'up') +
    statCard('✅', 'green', t('activeSchools'), sc.active, '↑ 92%', 'up') +
    statCard('⏰', 'orange', t('pendingApproval'), sc.pending, '↓ 0%', 'down') +
  '</div>' +
  '<div class="grid2"><div class="card"><div class="head-row"><div><h3>' + t('schoolGrowth') + '</h3><p class="card-sub">' + t('growthSub') + '</p></div><span class="badge blue">' + sc.total + ' ' + t('schools') + '</span></div><div class="chart-box">' + lineChartSVG(GROWTH) + '</div></div>' +
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
  '</div></div></div>';
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
function filterStudents(q) {
  q = q.toLowerCase();
  var visible = 0;
  document.querySelectorAll('#stuBody tr').forEach(function (tr) {
    if (tr.id === 'stuNoMatch') return;
    var show = tr.textContent.toLowerCase().indexOf(q) !== -1;
    tr.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  var nm = document.getElementById('stuNoMatch');
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
function superUsers() {
  var rows = [
    ['Rahul Kumar', 'School Admin', 'St. Xavier School', 'Active'], ['Sunita Sharma', 'Teacher', 'St. Xavier School', 'Active'],
    ['Amit Jha', 'Teacher', 'DAV Public School', 'Active'], ['Neha Gupta', 'Teacher', 'Gyanlok Public School', 'Active'],
    ['Vikram Singh', 'School Admin', 'DAV Public School', 'Active'], ['Pooja Mishra', 'Teacher', 'Bright Future School', 'Trial'],
    ['Riya Kumari', 'Student', 'St. Xavier School', 'Active'], ['Priya Kumari', 'Student', 'St. Xavier School', 'Active'],
    ['Suresh Yadav', 'Teacher', 'Holy Child School', 'Active'], ['Kavita Tiwari', 'School Admin', 'Sunrise Academy', 'Expired']
  ].map(function (u) {
    return '<tr><td><b>' + u[0] + '</b></td><td>' + u[1] + '</td><td>' + u[2] + '</td><td><span class="badge ' + (u[3] === 'Active' ? 'green' : u[3] === 'Trial' ? 'orange' : 'red') + '">' + u[3] + '</span></td></tr>';
  }).join('');
  return '<div class="page-head"><div><h2>' + t('users') + '</h2><p>' + num(12450) + ' ' + t('totalUsers') + ' • ' + db.schools.length + ' ' + t('schools') + ' • ' + t('sampleList') + '</p></div></div>' +
    '<div class="stats">' +
    statCard('👥', 'blue', t('totalUsers'), 12450, '↑ 18%', 'up') +
    statCard('🏫', 'green', t('schoolAdmins'), 48, t('perSchool'), 'up') +
    statCard('📚', 'orange', t('teachersW'), 1240, '↑ 6%', 'up') +
    statCard('🎒', 'blue', t('studentsW'), 11162, '↑ 21%', 'up') +
    '</div><div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('thName') + '</th><th>' + t('thRole') + '</th><th>' + t('thSchool') + '</th><th>' + t('thStatus') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
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
  var ft = feeTotals();
  return '<div class="page-head"><div><h2>' + t('analytics') + '</h2><p>' + t('subAnalyticsFull') + '</p></div></div>' +
  '<div class="stats">' +
    statCard('🏫', 'blue', t('totalSchools'), schoolCounts().total, '↑ 12%', 'up') +
    statCard('👥', 'green', t('totalUsers'), 12450, '↑ 18%', 'up') +
    statCard('💰', 'orange', t('feeCollected'), ft.collected, '↑ 78%', 'up', { prefix: '₹' }) +
    statCard('⏰', 'red', t('pendingFee'), ft.pending, '↓ 4%', 'down', { prefix: '₹' }) +
  '</div>' +
  '<div class="grid2"><div class="card"><h3>' + t('schoolGrowth') + '</h3><p class="card-sub">' + t('growthWeek') + '</p><div class="chart-box">' + lineChartSVG(GROWTH) + '</div></div>' +
  '<div class="card"><h3>' + t('feeTrend') + '</h3><p class="card-sub">' + esc(db.profile.name) + ' — ' + t('feeTrendSub2') + '</p><div class="chart-box">' + barChartSVG(feeChartData()) + '</div><p class="muted" style="margin-top:8px"><span style="color:' + BLUE + '">■</span> ' + t('collectedW') + ' &nbsp; <span style="color:' + ORANGE + '">■</span> ' + t('pendingW') + '</p></div></div>' +
  '<div class="card"><h3>' + t('todayAtt') + ' — ' + esc(db.profile.name) + '</h3><p class="card-sub">' + num(attTotal()) + ' students • ' + donutPct(db.attendanceAgg.present, attTotal()) + '% present</p><div class="donut-wrap">' +
    donutSVG([{ value: db.attendanceAgg.present, color: GREEN, label: t('presBtn'), pct: donutPct(db.attendanceAgg.present, attTotal()) }, { value: db.attendanceAgg.absent, color: RED, label: t('absBtn'), pct: donutPct(db.attendanceAgg.absent, attTotal()) }, { value: db.attendanceAgg.late, color: ORANGE, label: t('lateBtn'), pct: donutPct(db.attendanceAgg.late, attTotal()) }], 190, donutPct(db.attendanceAgg.present, attTotal()) + '%', t('todayAtt')) +
    '<div class="legend"><div class="row"><span class="dot" style="background:' + GREEN + '"></span>' + t('presBtn') + '<b>' + num(db.attendanceAgg.present) + '</b></div>' +
    '<div class="row"><span class="dot" style="background:' + RED + '"></span>' + t('absBtn') + '<b>' + num(db.attendanceAgg.absent) + '</b></div>' +
    '<div class="row"><span class="dot" style="background:' + ORANGE + '"></span>' + t('lateBtn') + '<b>' + num(db.attendanceAgg.late) + '</b></div></div>' +
  '</div></div>';
}
function superSettings() {
  return '<div class="page-head"><div><h2>' + t('sysSettings') + '</h2><p>' + t('platformConfig') + '</p></div></div>' +
  '<div class="card" style="max-width:640px"><h3>' + t('platformH') + '</h3><p class="card-sub">School Saathi — Version 1.0.0</p>' +
  '<div class="kv"><b>' + t('supName') + '</b><span>School Saathi</span><b>' + t('supTagline') + '</b><span>Smart Education. Better Tomorrow.</span>' +
  '<b>' + t('supSession') + '</b><span>' + esc(db.profile.session) + '</span><b>' + t('supEmail') + '</b><span>support@school-saathi.in</span>' +
  '<b>' + t('supStorage') + '</b><span>' + t('supStorageV') + '</span></div>' +
  '<div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap"><button class="btn" onclick="toast(t(\'tSettingsSaved\'))">' + t('saveSettingsBtn') + '</button>' +
  '<button class="btn danger" onclick="resetDemo()">' + t('resetDemo') + '</button></div></div>';
}
function resetDemo() {
  confirmModal('Reset all demo data to the original seed? Your changes will be lost.', function () {
    try { localStorage.removeItem(DB_KEY); } catch (e) {}
    db = seedDB(); saveDB(db);
    state.attSnapKey = ''; state.attSnap = {};
    renderApp();
    toast(t('tDemoReset'));
  });
}
function superReports() { return reportsPage('super'); }
function superHelp() {
  return '<div class="page-head"><div><h2>' + t('help') + '</h2><p>' + t('subHelp') + '</p></div></div>' +
  '<div class="grid2e"><div class="card"><h3>' + t('guidesH') + '</h3><p class="card-sub">' + t('guidesSub') + '</p><div class="act-list">' +
  '<div class="act"><div class="ic" style="background:var(--blue-soft)">🏫</div><div><b>' + t('guide1t') + '</b><span>' + t('guide1d') + '</span></div></div>' +
  '<div class="act"><div class="ic" style="background:var(--green-soft)">💰</div><div><b>' + t('guide2t') + '</b><span>' + t('guide2d') + '</span></div></div>' +
  '<div class="act"><div class="ic" style="background:var(--orange-soft)">✅</div><div><b>' + t('guide3t') + '</b><span>' + t('guide3d') + '</span></div></div>' +
  '</div></div>' +
  '<div class="card"><h3>' + t('contactH') + '</h3><p class="card-sub">' + t('contactSub') + '</p><div class="kv"><b>' + t('fEmail') + '</b><span>support@school-saathi.in</span><b>' + t('contactPhone') + '</b><span>+91 63047 97341</span><b>' + t('contactHours') + '</b><span>' + t('hoursV') + '</span></div>' +
  '<div style="margin-top:16px"><button class="btn" onclick="toast(t(\'supportNoted\'))">' + t('raiseSupport') + '</button></div></div></div>';
}
var PAGE_SUPER = { dashboard: superDashboard, schools: superSchools, users: superUsers, subscriptions: superSubscriptions, analytics: superAnalytics, settings: superSettings, reports: superReports, help: superHelp };

/* ================= SCHOOL ADMIN pages ================= */
function schoolDashboard() {
  var ft = feeTotals(), agg = db.attendanceAgg;
  var acts = db.activities.map(function (a) {
    return '<div class="act"><div class="ic" style="background:var(--' + (a.bg === 'green' ? 'green' : a.bg === 'blue' ? 'blue' : 'orange') + '-soft)">' + a.icon + '</div><div><b>' + esc(a.title) + '</b><span>' + esc(a.sub) + ' • ' + esc(a.time) + '</span></div></div>';
  }).join('');
  return '<div class="page-head"><div><h2>' + t('schoolDashboard') + '</h2><p>' + esc(db.profile.name) + ', ' + esc(db.profile.city) + '</p></div>' +
    '<div class="toolbar"><button class="btn sm" onclick="downloadReportCSV(\'fees\')">⬇ ' + t('downloadReport') + '</button></div></div>' +
  '<div class="stats">' +
    statCard('🎒', 'blue', t('totalStudents'), 1250, '↑ 5%', 'up') +
    statCard('👩‍🏫', 'green', t('totalTeachers'), 85, '↑ 2%', 'up') +
    statCard('💰', 'orange', t('feeCollected'), ft.collected, '↑ 78%', 'up', { prefix: '₹' }) +
    statCard('⏰', 'red', t('pendingFee'), ft.pending, '', 'down', { prefix: '₹' }) +
  '</div>' +
  '<div class="grid2"><div class="card"><h3>' + t('attOverview') + '</h3><p class="card-sub">' + t('todayAtt') + '</p><div class="donut-wrap">' +
    donutSVG([{ value: agg.present, color: GREEN, label: t('presBtn'), pct: donutPct(agg.present, attTotal()) }, { value: agg.absent, color: RED, label: t('absBtn'), pct: donutPct(agg.absent, attTotal()) }, { value: agg.late, color: ORANGE, label: t('lateBtn'), pct: donutPct(agg.late, attTotal()) }], 190, donutPct(agg.present, attTotal()) + '%', t('todayAtt')) +
    '<div class="legend"><div class="row"><span class="dot" style="background:' + GREEN + '"></span>' + t('presBtn') + '<b>' + num(agg.present) + '</b></div>' +
    '<div class="row"><span class="dot" style="background:' + RED + '"></span>' + t('absBtn') + '<b>' + num(agg.absent) + '</b></div>' +
    '<div class="row"><span class="dot" style="background:' + ORANGE + '"></span>' + t('lateBtn') + '<b>' + num(agg.late) + '</b></div></div>' +
  '</div></div>' +
  '<div class="card"><h3>' + t('feeTrend') + '</h3><p class="card-sub">' + t('feeTrendSub') + '</p><div class="chart-box">' + barChartSVG(feeChartData()) + '</div><p class="muted" style="margin-top:8px"><span style="color:' + BLUE + '">■</span> ' + t('collectedW') + ' &nbsp; <span style="color:' + ORANGE + '">■</span> ' + t('pendingW') + '</p></div></div>' +
  '<div class="grid2"><div class="card"><div class="head-row"><div><h3>' + t('recentAct') + '</h3></div><a href="#" onclick="return false">' + t('viewAll') + '</a></div><div class="act-list">' + acts + '</div></div>' +
  '<div class="card"><h3>' + t('quickLinks') + '</h3><p class="card-sub">' + t('jumpTask') + '</p><div class="qa-grid">' +
    '<div class="qa" onclick="go(\'students\')"><div class="ic">🎒</div><b>' + t('qaAddStudent') + '</b><span>' + t('qaAddStudentD') + '</span></div>' +
    '<div class="qa" onclick="go(\'attendance\')"><div class="ic">✅</div><b>' + t('qaMarkAtt') + '</b><span>' + t('qaMarkAttD') + '</span></div>' +
    '<div class="qa" onclick="go(\'exams\')"><div class="ic">📝</div><b>' + t('qaEnterMarks') + '</b><span>' + t('qaEnterMarksD') + '</span></div>' +
    '<div class="qa" onclick="go(\'reports\')"><div class="ic">📄</div><b>' + t('qaGenReport') + '</b><span>' + t('qaGenReportD') + '</span></div>' +
  '</div></div></div>';
}
function studentsPage() {
  var q = state.stuSearch.toLowerCase(), cls = state.stuClass;
  var list = db.students.filter(function (s) {
    return (cls === 'All' || s.cls === cls) && (!q || s.name.toLowerCase().indexOf(q) !== -1);
  });
  var rows = list.map(function (s) {
    var fs = studentFeeStatus(s.id);
    return '<tr><td><b>' + esc(s.name) + '</b></td><td>' + esc(s.cls) + '</td><td>' + s.roll + '</td><td>' + esc(s.guardian) + '</td><td>' + esc(s.phone) + '</td><td>' + s.att + '%</td>' +
      '<td><span class="badge ' + (fs === 'Paid' ? 'green' : fs === 'Pending' ? 'orange' : 'grey') + '">' + fs + '</span></td>' +
      '<td><div class="row-actions"><button class="btn ghost sm" onclick="studentForm(\'' + s.id + '\')">' + t('editBtn') + '</button><button class="btn danger sm" onclick="deleteStudent(\'' + s.id + '\')">' + t('deleteBtn') + '</button></div></td></tr>';
  }).join('');
  var clsOpts = ['All'].concat(CLASSES).map(function (c) { return '<option ' + (cls === c ? 'selected' : '') + '>' + c + '</option>'; }).join('');
  return '<div class="page-head"><div><h2>' + t('students') + '</h2><p>' + list.length + ' ' + t('ofWord') + ' ' + db.students.length + ' ' + t('demoRecords') + '</p></div>' +
    '<div class="toolbar"><input placeholder="' + t('searchStudent') + '" value="' + esc(state.stuSearch) + '" oninput="state.stuSearch=this.value;filterStudents(this.value)" style="min-width:200px">' +
    '<select onchange="state.stuClass=this.value;renderPage()">' + clsOpts + '</select>' +
    '<button class="btn" onclick="studentForm()">+ ' + t('addStudent') + '</button></div></div>' +
    '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('thName') + '</th><th>' + t('thClass') + '</th><th>' + t('thRoll') + '</th><th>' + t('thGuardian') + '</th><th>' + t('thPhone') + '</th><th>' + t('thAtt') + '</th><th>' + t('thFee') + '</th><th>' + t('thAction') + '</th></tr></thead><tbody id="stuBody">' +
    (rows || '<tr><td colspan="8"><div class="empty">' + t('tNoMatch') + '</div></td></tr>') + '<tr id="stuNoMatch" style="display:none"><td colspan="8"><div class="empty">' + t('tNoMatch') + '</div></td></tr></tbody></table></div></div>';
}
function studentForm(id) {
  var s = id ? db.students.find(function (x) { return x.id === id; }) : null;
  var clsOpts = CLASSES.map(function (c) { return '<option ' + (s && s.cls === c ? 'selected' : '') + '>' + c + '</option>'; }).join('');
  openModal('<h3>' + (s ? t('editStudent') : t('addStudent')) + '</h3><form onsubmit="return saveStudent(event,\'' + (id || '') + '\')"><div class="form-grid">' +
    '<div><label>' + t('fStudentName') + '</label><input id="fStName" required value="' + esc(s ? s.name : '') + '" placeholder="e.g. Aarav Kumar"></div>' +
    '<div><label>' + t('fClass') + '</label><select id="fStCls">' + clsOpts + '</select></div>' +
    '<div><label>' + t('fRoll') + '</label><input id="fStRoll" type="number" min="1" value="' + (s ? s.roll : 1) + '" required></div>' +
    '<div><label>' + t('fGuardian') + '</label><input id="fStG" value="' + esc(s ? s.guardian : '') + '" placeholder="Mr. Sharma"></div>' +
    '<div><label>' + t('fPhone') + '</label><input id="fStPh" value="' + esc(s ? s.phone : '') + '" placeholder="98XXXXXXXX"></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button><button class="btn" type="submit">' + t('saveStudentBtn') + '</button></div></form>');
}
function saveStudent(e, id) {
  e.preventDefault();
  var name = $('fStName').value.trim();
  var cls = $('fStCls').value;
  var dup = db.students.find(function (x) { return x.name.toLowerCase() === name.toLowerCase() && x.cls === cls && x.id !== id; });
  if (dup) { toast(name + ' ' + t('tDupStudent') + ' ' + cls + '.'); return false; }
  var data = { name: name, cls: cls, roll: parseInt($('fStRoll').value, 10) || 1,
    guardian: $('fStG').value.trim() || '—', phone: $('fStPh').value.trim() || '—' };
  if (id) {
    var s = db.students.find(function (x) { return x.id === id; });
    if (s) { Object.assign(s, data); toast(t('tStudentUpdated')); }
  } else {
    var nid = 'stu' + Date.now();
    db.students.push(Object.assign({ id: nid, att: 100, result: 0, fee: 'Pending' }, data));
    // New admission owes the first month's fee (average pending amount).
    db.feeRecords.push({ id: 'fee' + Date.now(), studentId: nid, student: name, cls: cls,
      month: new Date().toLocaleString('en', { month: 'short' }), amount: 6000, status: 'Pending', date: todayIST() });
    toast(t('tStudentAdded'));
  }
  saveDB(db); closeModal(); renderApp();
  return false;
}
function deleteStudent(id) {
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) return;
  confirmModal('Delete ' + s.name + '? Their fee records, marks, attendance and homework progress will also be removed.', function () {
    db.students = db.students.filter(function (x) { return x.id !== id; });
    db.feeRecords = db.feeRecords.filter(function (r) { return r.studentId !== id; });
    db.marks = db.marks.filter(function (m) { return m.studentId !== id; });
    Object.keys(db.attendance).forEach(function (k) { delete db.attendance[k][id]; });
    db.homework.forEach(function (h) { h.doneBy = h.doneBy.filter(function (x) { return x !== id; }); });
    saveDB(db); renderApp();
    toast(t('tStudentDeleted'));
  });
}
function attendancePage() {
  if (!state.attDate) state.attDate = todayIST();
  var cls = state.attCls;
  var roster = db.students.filter(function (s) { return s.cls === cls; });
  var key = state.attDate + '|' + cls;
  var recs = db.attendance[key] || {};
  if (state.attSnapKey !== key) { state.attSnapKey = key; state.attSnap = JSON.parse(JSON.stringify(recs)); }
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
  return '<div class="page-head"><div><h2>' + t('attendance') + '</h2><p>Class ' + esc(cls) + ' • ' + esc(state.attDate) + ' — ' + counts.Present + ' ' + t('presBtn') + ', ' + counts.Absent + ' ' + t('absBtn') + ', ' + counts.Late + ' ' + t('lateBtn') + '</p></div>' +
    '<div class="toolbar"><select onchange="state.attCls=this.value;renderPage()">' + clsOpts + '</select>' +
    '<input type="date" value="' + esc(state.attDate) + '" max="' + todayIST() + '" onchange="onAttDate(this.value)" style="min-width:160px">' +
    '<button class="btn green" onclick="saveAttendance()">✓ ' + t('saveAttendance') + '</button></div></div>' +
    '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('thStudent') + '</th><th>' + t('thRoll') + '</th><th>' + t('thStatus') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<p class="muted" style="margin-top:12px">School-wide today: ' + num(db.attendanceAgg.present) + ' Present • ' + num(db.attendanceAgg.absent) + ' Absent • ' + num(db.attendanceAgg.late) + ' Late (' + donutPct(db.attendanceAgg.present, attTotal()) + '% attendance).</p></div>';
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
  if (state.attDate === todayIST()) {
    // Recompute school-wide aggregate by DELTA vs the snapshot taken at page open.
    var prev = state.attSnap || {};
    db.students.filter(function (s) { return s.cls === state.attCls; }).forEach(function (s) {
      var oldSt = prev[s.id] || 'Present';
      var newSt = recs[s.id] || 'Present';
      if (oldSt !== newSt) {
        if (oldSt === 'Present') db.attendanceAgg.present--; else if (oldSt === 'Absent') db.attendanceAgg.absent--; else db.attendanceAgg.late--;
        if (newSt === 'Present') db.attendanceAgg.present++; else if (newSt === 'Absent') db.attendanceAgg.absent++; else db.attendanceAgg.late++;
      }
    });
    state.attSnap = JSON.parse(JSON.stringify(recs));
  }
  addActivity('✅', 'blue', 'Attendance updated', 'Class ' + state.attCls);
  saveDB(db);
  toast('✓ ' + t('tAttSaved') + ' — Class ' + state.attCls + ' (' + state.attDate + ').');
}
function feesPage() {
  var ft = feeTotals(), f = state.feeFilter;
  var list = db.feeRecords.filter(function (r) { return f === 'All' || r.status === f; });
  var rows = list.slice(0, 120).map(function (r) {
    return '<tr><td><b>' + esc(r.student) + '</b></td><td>' + esc(r.cls) + '</td><td>' + r.month + '</td><td>' + inr(r.amount) + '</td><td>' + esc(r.date) + '</td>' +
      '<td><span class="badge ' + (r.status === 'Collected' ? 'green' : 'orange') + '">' + r.status + '</span></td>' +
      '<td>' + (r.status === 'Pending' ? '<button class="btn green sm" onclick="collectFee(\'' + r.id + '\')">' + t('collectBtn') + '</button>' : '<span class="muted">—</span>') + '</td></tr>';
  }).join('');
  return '<div class="page-head"><div><h2>' + t('fees') + '</h2><p>' + t('collectedW') + ' ' + inr(ft.collected) + ' • ' + t('pendingW') + ' ' + inr(ft.pending) + ' (Apr–Aug)</p></div>' +
    '<div class="toolbar"><div class="pill-tabs">' + ['All', 'Pending', 'Collected'].map(function (x) {
      return '<button class="' + (f === x ? 'on' : '') + '" onclick="state.feeFilter=\'' + x + '\';renderPage()">' + (x === 'All' ? t('allW') : x === 'Pending' ? t('pendingW') : t('collectedW')) + '</button>';
    }).join('') + '</div></div></div>' +
    '<div class="stats">' +
    statCard('💰', 'orange', t('feeCollected'), ft.collected, '↑ 78%', 'up', { prefix: '₹' }) +
    statCard('⏰', 'red', t('pendingFee'), ft.pending, '', 'down', { prefix: '₹' }) +
    '</div>' +
    '<div class="card"><h3>' + t('feeTrend') + '</h3><p class="card-sub">' + t('feeTrendSub') + '</p><div class="chart-box">' + barChartSVG(feeChartData()) + '</div><p class="muted" style="margin-top:8px"><span style="color:' + BLUE + '">■</span> ' + t('collectedW') + ' &nbsp; <span style="color:' + ORANGE + '">■</span> ' + t('pendingW') + '</p></div>' +
    '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('thStudent') + '</th><th>' + t('thClass') + '</th><th>' + t('thMonth') + '</th><th>' + t('thAmount') + '</th><th>' + t('thDate') + '</th><th>' + t('thStatus') + '</th><th>' + t('thAction') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<p class="muted" style="margin-top:10px">' + t('showingRec') + ' ' + Math.min(120, list.length) + ' ' + t('ofRec') + ' ' + list.length + ' ' + t('recordsWord') + '</p></div>';
}
function collectFee(id) {
  var r = db.feeRecords.find(function (x) { return x.id === id; });
  if (!r || r.status !== 'Pending') return;
  r.status = 'Collected';
  addActivity('💰', 'green', 'New fee payment received', 'by ' + r.student + ' • ' + inr(r.amount));
  saveDB(db); renderApp();
  toast('✓ ' + inr(r.amount) + ' ' + t('tCollectedFrom') + ' ' + r.student + '.');
}
var PAGE_SCHOOL = { dashboard: schoolDashboard, students: studentsPage, attendance: attendancePage, fees: feesPage, exams: null, homework: null, notices: null, reports: null, settings: null };

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
      .concat(db.students.map(function (s) { return [s.name, s.cls, s.roll, s.guardian, s.phone, s.att, studentFeeStatus(s.id)]; })));
  } else if (kind === 'fees') {
    downloadCSV('school-saathi-fees.csv', [['Student', 'Class', 'Month', 'Amount (INR)', 'Date', 'Status']]
      .concat(db.feeRecords.map(function (r) { return [r.student, r.cls, r.month, r.amount, r.date, r.status]; })));
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
function settingsPage() {
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
  '</div><div class="actions" style="justify-content:flex-start"><button class="btn" type="submit">' + t('saveSettingsBtn') + '</button>' +
  '<button type="button" class="btn danger" onclick="resetDemo()">' + t('resetDemo') + '</button></div></form></div>';
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
  saveDB(db); renderApp();
  toast('✓ ' + t('tSettingsSaved'));
  return false;
}
PAGE_SCHOOL.exams = examsPage; PAGE_SCHOOL.homework = homeworkPage; PAGE_SCHOOL.notices = noticesPage;
PAGE_SCHOOL.reports = function () { return reportsPage('school'); }; PAGE_SCHOOL.settings = settingsPage;

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
  return '<div class="phone"><div class="card"><div class="stu-hero"><div class="avatar">RK</div>' +
    '<h3>' + esc(me.name) + '</h3><p>Class ' + esc(me.cls) + ' • ' + esc(db.profile.name) + ', ' + esc(db.profile.city) + '</p></div>' +
    '<div class="tile-grid">' +
    '<div class="tile green"><div class="n">' + me.att + '%</div><div class="l">' + t('tileAtt') + '</div></div>' +
    '<div class="tile yellow"><div class="n">' + studentFeeStatus(me.id) + '</div><div class="l">' + t('tileFees') + '</div></div>' +
    '<div class="tile purple"><div class="n">' + me.result + '%</div><div class="l">' + t('tileResults') + '</div></div>' +
    '<div class="tile blue"><div class="n">' + myHw.length + '</div><div class="l">' + t('tileHw') + ' (' + doneCount + ' ' + t('doneSuffix') + ')</div></div>' +
    '</div></div>' +
    '<div class="card" style="margin-top:16px"><h3>' + t('myHomework') + '</h3><p class="card-sub">' + t('myHwSub') + '</p>' + hwItems + '</div>' +
    '<div class="card" style="margin-top:16px"><h3>' + t('noticesH') + '</h3><p class="card-sub">' + t('latestNotices') + '</p>' + notices + '</div></div>';
}
var PAGE_STUDENT = { dashboard: studentDashboard, homework: homeworkPage, notices: noticesPage };

/* ================= init ================= */
document.addEventListener('DOMContentLoaded', function () {
  applyI18n();
  refreshLandingStats();
  if (!restoreSession()) runCountUps(document);
  if ('serviceWorker' in navigator && window.location.protocol.indexOf('http') === 0) {
    try {
      navigator.serviceWorker.register('sw.js').then(function () { /* PWA ready */ }).catch(function () { /* offline mode still works without SW */ });
    } catch (e) { /* ignore — app works without SW */ }
  }
});
