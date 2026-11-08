/* School Saathi — static build. All data lives in localStorage (seeded once, never overwritten). */
'use strict';

/* ================= constants ================= */
var DB_KEY = 'schoolSaathiDBv1';
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
        var st = students[(mi * 9 + k * 3) % students.length];
        feeRecords.push({ id: 'fee' + (fid++), studentId: st.id, student: st.name, cls: st.cls,
          month: mo.m, amount: amt, status: status, date: '2026-0' + (mi + 4) + '-' + String(3 + ((k * 5) % 24)).padStart(2, '0') });
      }
    }
    split(mo.collected, 10, 'Collected');
    split(mo.pending, 4, 'Pending');
  });
  var today = new Date().toISOString().slice(0, 10);
  var attRecords = {};
  students.filter(function (s) { return s.cls === '10th-A'; }).forEach(function (s, i) {
    attRecords[s.id] = (i === 2) ? 'Absent' : (i === 3) ? 'Late' : 'Present';
  });
  return {
    v: 1,
    schools: schools,
    students: students,
    teachers: teachers,
    feeMonths: FEE_MONTHS,
    feeRecords: feeRecords,
    attendanceAgg: { present: 1150, absent: 70, late: 30 },
    attendance: { date: today, cls: '10th-A', records: attRecords },
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
function loadDB() {
  try {
    var raw = localStorage.getItem(DB_KEY);
    if (raw) { var d = JSON.parse(raw); if (d && d.v === 1) return d; }
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
var state = { role: null, user: null, view: 'dashboard', lang: 'en', feeFilter: 'All', stuSearch: '', stuClass: 'All', attCls: '10th-A', attDate: '', examId: 'ex1' };

/* ================= utils ================= */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function inr(n) { return '₹' + Number(n).toLocaleString('en-IN'); }
function num(n) { return Number(n).toLocaleString('en-IN'); }
var toastTimer = null;
function toast(msg) {
  var t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
}
function countUp(el, target, opts) {
  opts = opts || {};
  var dur = opts.dur || 1100, start = null, pre = opts.prefix || '', suf = opts.suffix || '';
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
function downloadCSV(filename, rows) {
  var csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function openModal(html) { $('modalRoot').innerHTML = '<div class="modal-back" onclick="if(event.target===this)closeModal()"><div class="modal">' + html + '</div></div>'; }
function closeModal() { $('modalRoot').innerHTML = ''; }

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
  var W = 560, H = 260, padL = 46, padB = 30, padT = 14, maxV = 0;
  data.forEach(function (d) { maxV = Math.max(maxV, d.collected, d.pending); });
  maxV = Math.ceil(maxV / 50000) * 50000;
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
    s += '<rect class="bar" x="' + (cx - bw - 3) + '" y="' + base + '" width="' + bw + '" height="0" fill="' + BLUE + '" rx="3" data-y="' + y(d.collected) + '" data-h="' + (base - y(d.collected)) + '" data-tip="' + d.label + ' Collected: ' + inr(d.collected) + '"/>';
    s += '<rect class="bar" x="' + (cx + 3) + '" y="' + base + '" width="' + bw + '" height="0" fill="' + ORANGE + '" rx="3" data-y="' + y(d.pending) + '" data-h="' + (base - y(d.pending)) + '" data-tip="' + d.label + ' Pending: ' + inr(d.pending) + '"/>';
    s += '<text class="axis-lbl" x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + d.label + '</text>';
  });
  s += '</svg>';
  return s;
}
function animateBars(root) {
  (root || document).querySelectorAll('.bar').forEach(function (b, i) {
    setTimeout(function () { b.setAttribute('y', b.getAttribute('data-y')); b.setAttribute('height', b.getAttribute('data-h')); }, 80 + i * 70);
  });
}
function lineChartSVG(data) {
  var W = 560, H = 250, padL = 40, padB = 28, padT = 18, maxV = 26;
  var iw = W - padL - 16, ih = H - padT - padB;
  function px(i) { return padL + (iw / (data.length - 1)) * i; }
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
  en: { dashboard: 'Dashboard', schools: 'Schools', users: 'Users', subscriptions: 'Subscriptions', analytics: 'Analytics', settings: 'Settings', reports: 'Reports', help: 'Help & Support', students: 'Student Management', attendance: 'Attendance', fees: 'Fees', exams: 'Examinations', homework: 'Homework', notices: 'Notices', totalSchools: 'Total Schools', totalUsers: 'Total Users', activeSchools: 'Active Schools', pendingApproval: 'Pending Approval', totalStudents: 'Total Students', totalTeachers: 'Total Teachers', feeCollected: 'Fee Collected', pendingFee: 'Pending Fee', logout: 'Logout' },
  hi: { dashboard: 'डैशबोर्ड', schools: 'स्कूल', users: 'उपयोगकर्ता', subscriptions: 'सदस्यता', analytics: 'विश्लेषण', settings: 'सेटिंग्स', reports: 'रिपोर्ट', help: 'सहायता', students: 'छात्र प्रबंधन', attendance: 'उपस्थिति', fees: 'शुल्क', exams: 'परीक्षा', homework: 'होमवर्क', notices: 'नोटिस', totalSchools: 'कुल स्कूल', totalUsers: 'कुल उपयोगकर्ता', activeSchools: 'सक्रिय स्कूल', pendingApproval: 'स्वीकृति लंबित', totalStudents: 'कुल छात्र', totalTeachers: 'कुल शिक्षक', feeCollected: 'शुल्क संग्रह', pendingFee: 'बकाया शुल्क', logout: 'लॉगआउट' }
};
function t(k) { return (I18N[state.lang] && I18N[state.lang][k]) || I18N.en[k] || k; }
function setLang(l) {
  state.lang = l;
  $('langEn').classList.toggle('on', l === 'en');
  $('langHi').classList.toggle('on', l === 'hi');
  if (state.role) renderApp();
}

/* ================= auth & shell ================= */
function showView(which) {
  ['landing', 'login', 'app'].forEach(function (id) { $(id).classList.toggle('hidden', id !== which); });
  window.scrollTo(0, 0);
}
function showLogin() { showView('login'); $('loginId').focus(); }
function backToLanding(e) { e.preventDefault(); showView('landing'); return false; }
function forgotPw(e) { e.preventDefault(); toast('Demo account — use one-tap login below.'); return false; }
function googleLogin() { toast('Demo build — please use a one-tap demo login.'); }
function demoLogin(key) {
  var a = DEMO_ACCOUNTS[key];
  state.role = a.role; state.user = a; state.view = 'dashboard';
  showView('app'); renderApp();
  toast('Logged in as ' + a.name + ' (demo)');
}
function doLogin(e) {
  e.preventDefault();
  var id = $('loginId').value.trim().toLowerCase(), pw = $('loginPw').value;
  var err = $('loginErr');
  var found = null;
  Object.keys(DEMO_ACCOUNTS).forEach(function (k) { if (DEMO_ACCOUNTS[k].id === id && DEMO_ACCOUNTS[k].pw === pw) found = k; });
  if (!found) {
    err.textContent = 'Invalid credentials. Demo: use a one-tap login below, or super@school-saathi.in / admin123.';
    err.classList.remove('hidden');
    return false;
  }
  err.classList.add('hidden');
  demoLogin(found);
  return false;
}
function logout() {
  state.role = null; state.user = null; state.view = 'dashboard';
  $('loginId').value = ''; $('loginPw').value = '';
  showView('landing');
  toast('Logged out. See you soon!');
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
  state.view = view;
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
      var o = document.createElement('option'); o.value = s; o.textContent = 'Academic Session ' + s; sess.appendChild(o);
    });
  }
  sess.value = prof.session;
  var vt = VIEW_TITLES[state.view] || ['Dashboard', ''];
  $('topTitle').textContent = t(state.view) === state.view ? vt[0] : t(state.view);
  if (state.view === 'dashboard') $('topTitle').textContent = t('dashboard');
  $('topCrumb').textContent = state.role === 'super' ? 'Super Admin Dashboard' : (state.role === 'school' ? prof.name + ', ' + prof.city : 'Student Dashboard');
  renderPage();
}
function changeSession(v) {
  db.profile.session = v; saveDB(db);
  toast('Academic session changed to ' + v);
}
function renderPage() {
  var p = $('page');
  var fn = (state.role === 'super' ? PAGE_SUPER : state.role === 'school' ? PAGE_SCHOOL : PAGE_STUDENT)[state.view] || PAGE_SUPER.dashboard;
  p.innerHTML = fn();
  runCountUps(p); animateDonuts(p); animateBars(p); animateLine(p);
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
  var top5 = db.schools.slice().sort(function (a, b) { return b.students - a.students; }).slice(0, 5);
  var rows = top5.map(function (s, i) {
    return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(s.name) + '</b></td><td>' + esc(s.city) + '</td><td>' + num(s.students) + '</td><td><span class="badge ' + (s.status === 'active' ? 'green' : 'orange') + '">' + (s.status === 'active' ? 'Active' : 'Pending') + '</span></td></tr>';
  }).join('');
  return '' +
  '<div class="page-head"><div><h2>Super Admin Dashboard</h2><p>Platform Overview &amp; Management</p></div>' +
  '<div class="toolbar"><button class="btn sm" onclick="go(\'schools\')">+ Add School</button></div></div>' +
  '<div class="stats">' +
    statCard('🏫', 'blue', t('totalSchools'), sc.total, '↑ 12%', 'up') +
    statCard('👥', 'green', t('totalUsers'), 12450, '↑ 18%', 'up') +
    statCard('✅', 'green', t('activeSchools'), sc.active, '↑ 92%', 'up') +
    statCard('⏰', 'orange', t('pendingApproval'), sc.pending, '↓ 0%', 'down') +
  '</div>' +
  '<div class="grid2"><div class="card"><div class="head-row"><div><h3>School Growth</h3><p class="card-sub">New schools onboarded this week</p></div><span class="badge blue">' + sc.total + ' Schools</span></div><div class="chart-box">' + lineChartSVG(GROWTH) + '</div></div>' +
  '<div class="card"><h3>Subscription Status</h3><p class="card-sub">Share of schools by plan status</p><div class="donut-wrap">' +
    donutSVG([{ value: subs.Active, color: GREEN, label: 'Active', pct: 75 }, { value: subs.Expired, color: RED, label: 'Expired', pct: 17 }, { value: subs.Trial, color: ORANGE, label: 'Trial', pct: 8 }], 190, '75%', 'Active') +
    '<div class="legend"><div class="row"><span class="dot" style="background:' + GREEN + '"></span>Active<b>' + subs.Active + '</b></div>' +
    '<div class="row"><span class="dot" style="background:' + RED + '"></span>Expired<b>' + subs.Expired + '</b></div>' +
    '<div class="row"><span class="dot" style="background:' + ORANGE + '"></span>Trial<b>' + subs.Trial + '</b></div></div>' +
  '</div></div></div>' +
  '<div class="grid2"><div class="card"><div class="head-row"><div><h3>Top 5 Schools</h3><p class="card-sub">By student strength</p></div><a href="#" onclick="go(\'schools\');return false">View All →</a></div>' +
    '<div class="tbl-wrap"><table><thead><tr><th>#</th><th>School Name</th><th>City</th><th>Students</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
  '<div class="card"><h3>Quick Actions</h3><p class="card-sub">Common admin tasks</p><div class="qa-grid">' +
    '<div class="qa" onclick="go(\'schools\')"><div class="ic">🏫</div><b>Add School</b><span>Onboard a new school</span></div>' +
    '<div class="qa" onclick="go(\'users\')"><div class="ic">👥</div><b>Manage Users</b><span>Roles &amp; accounts</span></div>' +
    '<div class="qa" onclick="go(\'reports\')"><div class="ic">📊</div><b>View Reports</b><span>Download CSV</span></div>' +
    '<div class="qa" onclick="go(\'settings\')"><div class="ic">⚙️</div><b>System Settings</b><span>Platform config</span></div>' +
  '</div></div></div>';
}
function superSchools() {
  var rows = db.schools.map(function (s) {
    return '<tr><td><b>' + esc(s.name) + '</b></td><td>' + esc(s.city) + '</td><td>' + num(s.students) + '</td><td>' + num(s.users) + '</td>' +
      '<td><span class="badge ' + (s.plan === 'Active' ? 'green' : s.plan === 'Trial' ? 'orange' : 'red') + '">' + s.plan + '</span></td>' +
      '<td><span class="badge ' + (s.status === 'active' ? 'green' : 'orange') + '">' + (s.status === 'active' ? 'Active' : 'Pending') + '</span></td>' +
      '<td><div class="row-actions">' + (s.status === 'pending'
        ? '<button class="btn green sm" onclick="approveSchool(\'' + s.id + '\')">Approve</button>'
        : '<button class="btn ghost sm" onclick="removeSchool(\'' + s.id + '\')">Remove</button>') + '</div></td></tr>';
  }).join('');
  return '<div class="page-head"><div><h2>Schools</h2><p>' + db.schools.length + ' schools on the platform — ' + schoolCounts().pending + ' pending approval</p></div>' +
    '<div class="toolbar"><input id="schSearch" placeholder="Search school or city…" oninput="filterSchools(this.value)" style="min-width:220px"><button class="btn" onclick="schoolForm()">+ Add School</button></div></div>' +
    '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>School</th><th>City</th><th>Students</th><th>Users</th><th>Plan</th><th>Status</th><th>Action</th></tr></thead><tbody id="schBody">' + rows + '</tbody></table></div></div>';
}
function filterSchools(q) {
  q = q.toLowerCase();
  document.querySelectorAll('#schBody tr').forEach(function (tr) {
    tr.style.display = tr.textContent.toLowerCase().indexOf(q) === -1 ? 'none' : '';
  });
}
function filterStudents(q) {
  q = q.toLowerCase();
  document.querySelectorAll('#stuBody tr').forEach(function (tr) {
    tr.style.display = tr.textContent.toLowerCase().indexOf(q) === -1 ? 'none' : '';
  });
}
function schoolForm() {
  openModal('<h3>Add School</h3><form onsubmit="return saveSchool(event)"><div class="form-grid">' +
    '<div><label>School Name</label><input id="fSchName" required placeholder="e.g. Sunrise Public School"></div>' +
    '<div><label>City</label><input id="fSchCity" required placeholder="e.g. Gopalganj"></div>' +
    '<div><label>Students</label><input id="fSchStu" type="number" min="1" value="300" required></div>' +
    '<div><label>Plan</label><select id="fSchPlan"><option>Active</option><option>Trial</option><option>Expired</option></select></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" type="submit">Save School</button></div></form>');
}
function saveSchool(e) {
  e.preventDefault();
  db.schools.push({ id: 'sch' + Date.now(), name: $('fSchName').value.trim(), city: $('fSchCity').value.trim(),
    students: parseInt($('fSchStu').value, 10) || 0, status: 'pending', plan: $('fSchPlan').value, users: 0, since: new Date().toISOString().slice(0, 10) });
  saveDB(db); closeModal(); renderApp();
  toast('School added — pending approval.');
  return false;
}
function approveSchool(id) {
  var s = db.schools.find(function (x) { return x.id === id; });
  if (!s) return;
  s.status = 'active'; saveDB(db); renderApp();
  toast('✓ ' + s.name + ' approved. Pending approvals: ' + schoolCounts().pending);
}
function removeSchool(id) {
  var s = db.schools.find(function (x) { return x.id === id; });
  if (!s) return;
  if (!confirm('Remove ' + s.name + ' from the platform?')) return;
  db.schools = db.schools.filter(function (x) { return x.id !== id; });
  saveDB(db); renderApp();
  toast('School removed.');
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
  return '<div class="page-head"><div><h2>Users</h2><p>12,450 users across 24 schools (sample list below)</p></div></div>' +
    '<div class="stats">' +
    statCard('👥', 'blue', t('totalUsers'), 12450, '↑ 18%', 'up') +
    statCard('🏫', 'green', 'School Admins', 48, '2 per school', 'up') +
    statCard('📚', 'orange', 'Teachers', 1240, '↑ 6%', 'up') +
    statCard('🎒', 'blue', 'Students', 11162, '↑ 21%', 'up') +
    '</div><div class="card"><div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>School</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}
function superSubscriptions() {
  var subs = subCounts();
  var rows = db.schools.map(function (s) {
    return '<tr><td><b>' + esc(s.name) + '</b></td><td>' + esc(s.city) + '</td><td><span class="badge ' + (s.plan === 'Active' ? 'green' : s.plan === 'Trial' ? 'orange' : 'red') + '">' + s.plan + '</span></td><td>' + esc(s.since) + '</td></tr>';
  }).join('');
  return '<div class="page-head"><div><h2>Subscriptions</h2><p>18 Active • 4 Expired • 2 Trial — 75% active</p></div></div>' +
    '<div class="grid2e"><div class="card"><h3>Subscription Status</h3><p class="card-sub">Share of schools by plan status</p><div class="donut-wrap">' +
    donutSVG([{ value: subs.Active, color: GREEN, label: 'Active', pct: 75 }, { value: subs.Expired, color: RED, label: 'Expired', pct: 17 }, { value: subs.Trial, color: ORANGE, label: 'Trial', pct: 8 }], 190, '75%', 'Active') +
    '<div class="legend"><div class="row"><span class="dot" style="background:' + GREEN + '"></span>Active<b>' + subs.Active + '</b></div>' +
    '<div class="row"><span class="dot" style="background:' + RED + '"></span>Expired<b>' + subs.Expired + '</b></div>' +
    '<div class="row"><span class="dot" style="background:' + ORANGE + '"></span>Trial<b>' + subs.Trial + '</b></div></div>' +
    '</div></div>' +
    '<div class="card"><h3>Plans</h3><p class="card-sub">Per-student monthly pricing</p><div class="act-list">' +
    '<div class="act"><div class="ic green" style="background:var(--green-soft)">✓</div><div><b>Basic — ₹8 / student / month</b><span>Attendance, fees, notices</span></div></div>' +
    '<div class="act"><div class="ic" style="background:var(--blue-soft)">★</div><div><b>Standard — ₹12 / student / month</b><span>+ Exams, homework, reports</span></div></div>' +
    '<div class="act"><div class="ic orange" style="background:var(--orange-soft)">◆</div><div><b>Premium — ₹15 / student / month</b><span>+ Analytics, WhatsApp, priority support</span></div></div>' +
    '</div><p class="muted" style="margin-top:14px">Setup ₹4,999 one-time • 1 month free trial • Annual advance = 2 months free.</p></div></div>' +
    '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>School</th><th>City</th><th>Plan</th><th>Since</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}
function superAnalytics() {
  var ft = feeTotals();
  return '<div class="page-head"><div><h2>Analytics</h2><p>Growth, attendance &amp; fees across the platform</p></div></div>' +
  '<div class="stats">' +
    statCard('🏫', 'blue', t('totalSchools'), schoolCounts().total, '↑ 12%', 'up') +
    statCard('👥', 'green', t('totalUsers'), 12450, '↑ 18%', 'up') +
    statCard('💰', 'orange', t('feeCollected'), ft.collected, '↑ 78%', 'up', { prefix: '₹' }) +
    statCard('⏰', 'red', t('pendingFee'), ft.pending, '↓ 4%', 'down', { prefix: '₹' }) +
  '</div>' +
  '<div class="grid2"><div class="card"><h3>School Growth</h3><p class="card-sub">This week (Mon–Sun)</p><div class="chart-box">' + lineChartSVG(GROWTH) + '</div></div>' +
  '<div class="card"><h3>Fee Collection Trend</h3><p class="card-sub">St. Xavier School — Apr to Aug (Collected vs Pending)</p><div class="chart-box">' + barChartSVG(db.feeMonths) + '</div><p class="muted" style="margin-top:8px"><span style="color:' + BLUE + '">■</span> Collected &nbsp; <span style="color:' + ORANGE + '">■</span> Pending</p></div></div>' +
  '<div class="card"><h3>Today\'s Attendance — St. Xavier School</h3><p class="card-sub">1,250 students • 92% present</p><div class="donut-wrap">' +
    donutSVG([{ value: 1150, color: GREEN, label: 'Present', pct: 92 }, { value: 70, color: RED, label: 'Absent', pct: 6 }, { value: 30, color: ORANGE, label: 'Late', pct: 2 }], 190, '92%', 'Today\'s Attendance') +
    '<div class="legend"><div class="row"><span class="dot" style="background:' + GREEN + '"></span>Present<b>1,150</b></div>' +
    '<div class="row"><span class="dot" style="background:' + RED + '"></span>Absent<b>70</b></div>' +
    '<div class="row"><span class="dot" style="background:' + ORANGE + '"></span>Late<b>30</b></div></div>' +
  '</div></div>';
}
function superSettings() {
  return '<div class="page-head"><div><h2>System Settings</h2><p>Platform configuration</p></div></div>' +
  '<div class="card" style="max-width:640px"><h3>Platform</h3><p class="card-sub">School Saathi — Version 1.0.0</p>' +
  '<div class="kv"><b>Platform name</b><span>School Saathi</span><b>Tagline</b><span>Smart Education. Better Tomorrow.</span>' +
  '<b>Default session</b><span>' + esc(db.profile.session) + '</span><b>Support email</b><span>support@school-saathi.in</span>' +
  '<b>Data storage</b><span>This device (localStorage) — demo build</span></div>' +
  '<div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap"><button class="btn" onclick="toast(\'Settings saved.\')">Save Settings</button>' +
  '<button class="btn danger" onclick="resetDemo()">Reset Demo Data</button></div></div>';
}
function resetDemo() {
  if (!confirm('Reset all demo data to the original seed? Your changes will be lost.')) return;
  try { localStorage.removeItem(DB_KEY); } catch (e) {}
  db = seedDB(); saveDB(db); renderApp();
  toast('Demo data reset.');
}
function superReports() { return reportsPage('super'); }
function superHelp() {
  return '<div class="page-head"><div><h2>Help &amp; Support</h2><p>Guides &amp; contact</p></div></div>' +
  '<div class="grid2e"><div class="card"><h3>Quick Guides</h3><p class="card-sub">Most common tasks</p><div class="act-list">' +
  '<div class="act"><div class="ic" style="background:var(--blue-soft)">🏫</div><div><b>Add a school</b><span>Schools → + Add School → fill details → Save. New schools start as Pending until approved.</span></div></div>' +
  '<div class="act"><div class="ic" style="background:var(--green-soft)">💰</div><div><b>Collect a fee</b><span>School Admin → Fees → Collect on a pending record. Totals update instantly.</span></div></div>' +
  '<div class="act"><div class="ic" style="background:var(--orange-soft)">✅</div><div><b>Mark attendance</b><span>School Admin → Attendance → pick class &amp; date → Present / Absent / Late → Save.</span></div></div>' +
  '</div></div>' +
  '<div class="card"><h3>Contact</h3><p class="card-sub">We reply within one working day</p><div class="kv"><b>Email</b><span>support@school-saathi.in</span><b>Phone</b><span>+91 63047 97341</span><b>Hours</b><span>Mon–Sat, 9 AM – 6 PM</span></div>' +
  '<div style="margin-top:16px"><button class="btn" onclick="toast(\'Support request noted — we will call you back.\')">Raise a Support Request</button></div></div></div>';
}
var PAGE_SUPER = { dashboard: superDashboard, schools: superSchools, users: superUsers, subscriptions: superSubscriptions, analytics: superAnalytics, settings: superSettings, reports: superReports, help: superHelp };

/* ================= SCHOOL ADMIN pages ================= */
function schoolDashboard() {
  var ft = feeTotals(), agg = db.attendanceAgg;
  var acts = db.activities.map(function (a) {
    return '<div class="act"><div class="ic" style="background:var(--' + (a.bg === 'green' ? 'green' : a.bg === 'blue' ? 'blue' : 'orange') + '-soft)">' + a.icon + '</div><div><b>' + esc(a.title) + '</b><span>' + esc(a.sub) + ' • ' + esc(a.time) + '</span></div></div>';
  }).join('');
  return '<div class="page-head"><div><h2>School Admin Dashboard</h2><p>' + esc(db.profile.name) + ', ' + esc(db.profile.city) + '</p></div>' +
    '<div class="toolbar"><button class="btn sm" onclick="downloadReportCSV(\'fees\')">⬇ Download Report</button></div></div>' +
  '<div class="stats">' +
    statCard('🎒', 'blue', t('totalStudents'), 1250, '↑ 5%', 'up') +
    statCard('👩‍🏫', 'green', t('totalTeachers'), 85, '↑ 2%', 'up') +
    statCard('💰', 'orange', t('feeCollected'), ft.collected, '↑ 78%', 'up', { prefix: '₹' }) +
    statCard('⏰', 'red', t('pendingFee'), ft.pending, '', 'down', { prefix: '₹' }) +
  '</div>' +
  '<div class="grid2"><div class="card"><h3>Attendance Overview</h3><p class="card-sub">Today\'s Attendance</p><div class="donut-wrap">' +
    donutSVG([{ value: agg.present, color: GREEN, label: 'Present', pct: 92 }, { value: agg.absent, color: RED, label: 'Absent', pct: 6 }, { value: agg.late, color: ORANGE, label: 'Late', pct: 2 }], 190, '92%', 'Today\'s Attendance') +
    '<div class="legend"><div class="row"><span class="dot" style="background:' + GREEN + '"></span>Present<b>' + num(agg.present) + '</b></div>' +
    '<div class="row"><span class="dot" style="background:' + RED + '"></span>Absent<b>' + num(agg.absent) + '</b></div>' +
    '<div class="row"><span class="dot" style="background:' + ORANGE + '"></span>Late<b>' + num(agg.late) + '</b></div></div>' +
  '</div></div>' +
  '<div class="card"><h3>Fee Collection Trend</h3><p class="card-sub">Apr – Aug (Collected vs Pending)</p><div class="chart-box">' + barChartSVG(db.feeMonths) + '</div><p class="muted" style="margin-top:8px"><span style="color:' + BLUE + '">■</span> Collected &nbsp; <span style="color:' + ORANGE + '">■</span> Pending</p></div></div>' +
  '<div class="grid2"><div class="card"><div class="head-row"><div><h3>Recent Activities</h3></div><a href="#" onclick="return false">View All →</a></div><div class="act-list">' + acts + '</div></div>' +
  '<div class="card"><h3>Quick Links</h3><p class="card-sub">Jump to a task</p><div class="qa-grid">' +
    '<div class="qa" onclick="go(\'students\')"><div class="ic">🎒</div><b>Add Student</b><span>New admission</span></div>' +
    '<div class="qa" onclick="go(\'attendance\')"><div class="ic">✅</div><b>Mark Attendance</b><span>Today\'s register</span></div>' +
    '<div class="qa" onclick="go(\'exams\')"><div class="ic">📝</div><b>Enter Marks</b><span>Exam results</span></div>' +
    '<div class="qa" onclick="go(\'reports\')"><div class="ic">📄</div><b>Generate Report</b><span>CSV download</span></div>' +
  '</div></div></div>';
}
function studentsPage() {
  var q = state.stuSearch.toLowerCase(), cls = state.stuClass;
  var list = db.students.filter(function (s) {
    return (cls === 'All' || s.cls === cls) && (!q || s.name.toLowerCase().indexOf(q) !== -1);
  });
  var rows = list.map(function (s) {
    return '<tr><td><b>' + esc(s.name) + '</b></td><td>' + esc(s.cls) + '</td><td>' + s.roll + '</td><td>' + esc(s.guardian) + '</td><td>' + esc(s.phone) + '</td><td>' + s.att + '%</td>' +
      '<td><span class="badge ' + (s.fee === 'Paid' ? 'green' : 'orange') + '">' + s.fee + '</span></td>' +
      '<td><div class="row-actions"><button class="btn ghost sm" onclick="studentForm(\'' + s.id + '\')">Edit</button><button class="btn danger sm" onclick="deleteStudent(\'' + s.id + '\')">Delete</button></div></td></tr>';
  }).join('');
  var clsOpts = ['All'].concat(CLASSES).map(function (c) { return '<option ' + (cls === c ? 'selected' : '') + '>' + c + '</option>'; }).join('');
  return '<div class="page-head"><div><h2>Student Management</h2><p>' + list.length + ' of ' + db.students.length + ' demo records shown (school total 1,250)</p></div>' +
    '<div class="toolbar"><input placeholder="Search student…" value="' + esc(state.stuSearch) + '" oninput="state.stuSearch=this.value;filterStudents(this.value)" style="min-width:200px">' +
    '<select onchange="state.stuClass=this.value;renderPage()">' + clsOpts + '</select>' +
    '<button class="btn" onclick="studentForm()">+ Add Student</button></div></div>' +
    '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Class</th><th>Roll</th><th>Guardian</th><th>Phone</th><th>Att.</th><th>Fee</th><th>Action</th></tr></thead><tbody id="stuBody">' +
    (rows || '<tr><td colspan="8"><div class="empty">No students match.</div></td></tr>') + '</tbody></table></div></div>';
}
function studentForm(id) {
  var s = id ? db.students.find(function (x) { return x.id === id; }) : null;
  var clsOpts = CLASSES.map(function (c) { return '<option ' + (s && s.cls === c ? 'selected' : '') + '>' + c + '</option>'; }).join('');
  openModal('<h3>' + (s ? 'Edit Student' : 'Add Student') + '</h3><form onsubmit="return saveStudent(event,\'' + (id || '') + '\')"><div class="form-grid">' +
    '<div><label>Student Name</label><input id="fStName" required value="' + esc(s ? s.name : '') + '" placeholder="e.g. Aarav Kumar"></div>' +
    '<div><label>Class</label><select id="fStCls">' + clsOpts + '</select></div>' +
    '<div><label>Roll No</label><input id="fStRoll" type="number" min="1" value="' + (s ? s.roll : 1) + '" required></div>' +
    '<div><label>Guardian</label><input id="fStG" value="' + esc(s ? s.guardian : '') + '" placeholder="Mr. Sharma"></div>' +
    '<div><label>Phone</label><input id="fStPh" value="' + esc(s ? s.phone : '') + '" placeholder="98XXXXXXXX"></div>' +
    '<div><label>Fee Status</label><select id="fStFee"><option ' + (s && s.fee === 'Paid' ? 'selected' : '') + '>Paid</option><option ' + (s && s.fee === 'Pending' ? 'selected' : '') + '>Pending</option></select></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" type="submit">Save Student</button></div></form>');
}
function saveStudent(e, id) {
  e.preventDefault();
  var data = { name: $('fStName').value.trim(), cls: $('fStCls').value, roll: parseInt($('fStRoll').value, 10) || 1,
    guardian: $('fStG').value.trim() || '—', phone: $('fStPh').value.trim() || '—', fee: $('fStFee').value };
  if (id) {
    var s = db.students.find(function (x) { return x.id === id; });
    if (s) { Object.assign(s, data); toast('Student updated.'); }
  } else {
    db.students.push(Object.assign({ id: 'stu' + Date.now(), att: 100, result: 0 }, data));
    toast('Student added.');
  }
  saveDB(db); closeModal(); renderApp();
  return false;
}
function deleteStudent(id) {
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s || !confirm('Delete ' + s.name + '?')) return;
  db.students = db.students.filter(function (x) { return x.id !== id; });
  saveDB(db); renderApp();
  toast('Student deleted.');
}
function attendancePage() {
  if (!state.attDate) state.attDate = db.attendance.date;
  var cls = state.attCls;
  var roster = db.students.filter(function (s) { return s.cls === cls; });
  var recs = (db.attendance.cls === cls && db.attendance.date === state.attDate) ? db.attendance.records : {};
  var rows = roster.map(function (s) {
    var cur = recs[s.id] || 'Present';
    return '<tr><td><b>' + esc(s.name) + '</b></td><td>' + s.roll + '</td><td><div class="mark-btns">' +
      ['Present', 'Absent', 'Late'].map(function (m) {
        return '<button class="' + m[0].toLowerCase() + (cur === m ? ' on' : '') + '" onclick="markAtt(\'' + s.id + '\',\'' + m + '\')">' + m + '</button>';
      }).join('') + '</div></td></tr>';
  }).join('');
  var counts = { Present: 0, Absent: 0, Late: 0 };
  roster.forEach(function (s) { counts[recs[s.id] || 'Present']++; });
  var clsOpts = CLASSES.map(function (c) { return '<option ' + (cls === c ? 'selected' : '') + '>' + c + '</option>'; }).join('');
  return '<div class="page-head"><div><h2>Attendance</h2><p>Class ' + esc(cls) + ' • ' + esc(state.attDate) + ' — ' + counts.Present + ' Present, ' + counts.Absent + ' Absent, ' + counts.Late + ' Late</p></div>' +
    '<div class="toolbar"><select onchange="state.attCls=this.value;renderPage()">' + clsOpts + '</select>' +
    '<input type="date" value="' + esc(state.attDate) + '" onchange="state.attDate=this.value;renderPage()" style="min-width:160px">' +
    '<button class="btn green" onclick="saveAttendance()">✓ Save Attendance</button></div></div>' +
    '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Student</th><th>Roll</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<p class="muted" style="margin-top:12px">School-wide today: 1,150 Present • 70 Absent • 30 Late (92% attendance).</p></div>';
}
function markAtt(id, m) {
  if (db.attendance.cls !== state.attCls || db.attendance.date !== state.attDate) {
    db.attendance = { date: state.attDate, cls: state.attCls, records: {} };
  }
  db.attendance.records[id] = m;
  renderPage();
}
function saveAttendance() {
  saveDB(db);
  addActivity('✅', 'blue', 'Attendance updated', 'Class ' + state.attCls);
  saveDB(db);
  toast('✓ Attendance saved for Class ' + state.attCls + ' (' + state.attDate + ').');
}
function feesPage() {
  var ft = feeTotals(), f = state.feeFilter;
  var list = db.feeRecords.filter(function (r) { return f === 'All' || r.status === f; });
  var rows = list.slice(0, 120).map(function (r) {
    return '<tr><td><b>' + esc(r.student) + '</b></td><td>' + esc(r.cls) + '</td><td>' + r.month + '</td><td>' + inr(r.amount) + '</td><td>' + esc(r.date) + '</td>' +
      '<td><span class="badge ' + (r.status === 'Collected' ? 'green' : 'orange') + '">' + r.status + '</span></td>' +
      '<td>' + (r.status === 'Pending' ? '<button class="btn green sm" onclick="collectFee(\'' + r.id + '\')">Collect</button>' : '<span class="muted">—</span>') + '</td></tr>';
  }).join('');
  return '<div class="page-head"><div><h2>Fees</h2><p>Collected ' + inr(ft.collected) + ' • Pending ' + inr(ft.pending) + ' (Apr–Aug)</p></div>' +
    '<div class="toolbar"><div class="pill-tabs">' + ['All', 'Pending', 'Collected'].map(function (x) {
      return '<button class="' + (f === x ? 'on' : '') + '" onclick="state.feeFilter=\'' + x + '\';renderPage()">' + x + '</button>';
    }).join('') + '</div></div></div>' +
    '<div class="stats">' +
    statCard('💰', 'orange', t('feeCollected'), ft.collected, '↑ 78%', 'up', { prefix: '₹' }) +
    statCard('⏰', 'red', t('pendingFee'), ft.pending, '', 'down', { prefix: '₹' }) +
    '</div>' +
    '<div class="card"><h3>Fee Collection Trend</h3><p class="card-sub">Apr – Aug (Collected vs Pending)</p><div class="chart-box">' + barChartSVG(db.feeMonths) + '</div><p class="muted" style="margin-top:8px"><span style="color:' + BLUE + '">■</span> Collected &nbsp; <span style="color:' + ORANGE + '">■</span> Pending</p></div>' +
    '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>Month</th><th>Amount</th><th>Date</th><th>Status</th><th>Action</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<p class="muted" style="margin-top:10px">Showing ' + Math.min(120, list.length) + ' of ' + list.length + ' records.</p></div>';
}
function collectFee(id) {
  var r = db.feeRecords.find(function (x) { return x.id === id; });
  if (!r || r.status !== 'Pending') return;
  r.status = 'Collected';
  var st = db.students.find(function (x) { return x.id === r.studentId; });
  if (st) st.fee = 'Paid';
  addActivity('💰', 'green', 'New fee payment received', 'by ' + r.student + ' • ' + inr(r.amount));
  saveDB(db); renderApp();
  toast('✓ ' + inr(r.amount) + ' collected from ' + r.student + '.');
}
var PAGE_SCHOOL = { dashboard: schoolDashboard, students: studentsPage, attendance: attendancePage, fees: feesPage, exams: null, homework: null, notices: null, reports: null, settings: null };

/* ================= exams / homework / notices / reports / settings ================= */
function examsPage() {
  var ex = db.exams.find(function (e) { return e.id === state.examId; }) || db.exams[0];
  var roster = db.students.filter(function (s) { return s.cls === ex.cls; });
  var rows = roster.map(function (s) {
    var mk = db.marks.find(function (m) { return m.examId === ex.id && m.studentId === s.id; });
    return '<tr><td><b>' + esc(s.name) + '</b></td><td>' + s.roll + '</td>' +
      '<td><input type="number" min="0" max="' + ex.total + '" value="' + (mk ? mk.marks : '') + '" placeholder="—" style="width:90px" id="mk-' + s.id + '"> / ' + ex.total + '</td>' +
      '<td>' + (mk ? '<b>' + Math.round(mk.marks / ex.total * 100) + '%</b>' : '<span class="muted">Not entered</span>') + '</td></tr>';
  }).join('');
  var opts = db.exams.map(function (e) { return '<option value="' + e.id + '" ' + (ex.id === e.id ? 'selected' : '') + '>' + esc(e.name) + ' — ' + esc(e.cls) + ' (' + esc(e.subject) + ')</option>'; }).join('');
  var avg = 0, n = 0;
  db.marks.forEach(function (m) { if (m.examId === ex.id) { avg += m.marks; n++; } });
  return '<div class="page-head"><div><h2>Examinations</h2><p>' + esc(ex.name) + ' • ' + esc(ex.cls) + ' • ' + esc(ex.subject) + ' • ' + esc(ex.date) + '</p></div>' +
    '<div class="toolbar"><select onchange="state.examId=this.value;renderPage()">' + opts + '</select>' +
    '<button class="btn green" onclick="saveMarks(\'' + ex.id + '\')">✓ Save Marks</button></div></div>' +
    '<div class="card"><div class="head-row"><div><h3>Enter Marks</h3><p class="card-sub">' + (n ? 'Class average: ' + Math.round(avg / n) + '% (' + n + ' students marked)' : 'No marks entered yet for this exam.') + '</p></div></div>' +
    '<div class="tbl-wrap"><table><thead><tr><th>Student</th><th>Roll</th><th>Marks</th><th>Result</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}
function saveMarks(examId) {
  var ex = db.exams.find(function (e) { return e.id === examId; });
  var saved = 0;
  db.students.filter(function (s) { return s.cls === ex.cls; }).forEach(function (s) {
    var inp = $('mk-' + s.id);
    if (!inp || inp.value === '') return;
    var v = Math.max(0, Math.min(ex.total, parseInt(inp.value, 10) || 0));
    var mk = db.marks.find(function (m) { return m.examId === examId && m.studentId === s.id; });
    if (mk) mk.marks = v; else db.marks.push({ examId: examId, studentId: s.id, marks: v });
    saved++;
  });
  saveDB(db); renderApp();
  toast('✓ Marks saved for ' + saved + ' students.');
}
function riyaId() { var s = db.students.find(function (x) { return x.name === 'Riya Kumari'; }); return s ? s.id : 'stu33'; }
function homeworkPage() {
  var isStudent = state.role === 'student';
  var list = db.homework.filter(function (h) { return isStudent ? h.cls === '10th-A' : true; });
  var me = riyaId();
  var items = list.map(function (h) {
    var done = h.doneBy.indexOf(me) !== -1;
    return '<div class="hw-item ' + (done ? 'done' : '') + '">' +
      '<input type="checkbox" ' + (done ? 'checked' : '') + ' onchange="toggleHw(\'' + h.id + '\', this.checked)" aria-label="Mark done">' +
      '<div><b>' + esc(h.title) + '</b><span>' + esc(h.subject) + ' • Class ' + esc(h.cls) + ' • Due ' + esc(h.due) + (isStudent ? '' : ' • ' + h.doneBy.length + ' done') + '</span></div></div>';
  }).join('');
  return '<div class="page-head"><div><h2>Homework</h2><p>' + (isStudent ? 'Class 10th-A — tap the box when done' : 'Assign &amp; track homework') + '</p></div>' +
    (isStudent ? '' : '<div class="toolbar"><button class="btn" onclick="homeworkForm()">+ Add Homework</button></div>') + '</div>' +
    '<div class="card">' + (items || '<div class="empty">No homework yet.</div>') + '</div>';
}
function toggleHw(id, done) {
  var h = db.homework.find(function (x) { return x.id === id; });
  if (!h) return;
  var me = riyaId();
  var i = h.doneBy.indexOf(me);
  if (done && i === -1) h.doneBy.push(me);
  if (!done && i !== -1) h.doneBy.splice(i, 1);
  saveDB(db); renderPage();
  toast(done ? '✓ Homework marked done.' : 'Homework marked not done.');
}
function homeworkForm() {
  var clsOpts = CLASSES.map(function (c) { return '<option>' + c + '</option>'; }).join('');
  var subOpts = SUBJECTS.map(function (s) { return '<option>' + s + '</option>'; }).join('');
  openModal('<h3>Add Homework</h3><form onsubmit="return saveHomework(event)"><div class="form-grid">' +
    '<div><label>Class</label><select id="fHwCls">' + clsOpts + '</select></div>' +
    '<div><label>Subject</label><select id="fHwSub">' + subOpts + '</select></div>' +
    '<div class="full"><label>Title</label><input id="fHwTitle" required placeholder="e.g. Ex 5.2 — Q1 to Q10"></div>' +
    '<div><label>Due Date</label><input id="fHwDue" type="date" value="2026-11-12" required></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" type="submit">Assign Homework</button></div></form>');
}
function saveHomework(e) {
  e.preventDefault();
  db.homework.unshift({ id: 'hw' + Date.now(), cls: $('fHwCls').value, subject: $('fHwSub').value, title: $('fHwTitle').value.trim(), due: $('fHwDue').value, doneBy: [] });
  addActivity('📚', 'orange', 'Homework assigned', $('fHwSub').value + ' • Class ' + $('fHwCls').value);
  saveDB(db); closeModal(); renderApp();
  toast('Homework assigned.');
  return false;
}
function noticesPage() {
  var items = db.notices.map(function (n) {
    return '<div class="notice"><b>' + esc(n.title) + '</b><span>' + esc(n.date) + '</span><p>' + esc(n.body) + '</p></div>';
  }).join('');
  var canPost = state.role !== 'student';
  return '<div class="page-head"><div><h2>Notices</h2><p>Notice board — ' + esc(db.profile.name) + '</p></div>' +
    (canPost ? '<div class="toolbar"><button class="btn" onclick="noticeForm()">+ Publish Notice</button></div>' : '') + '</div>' +
    '<div class="card">' + items + '</div>';
}
function noticeForm() {
  openModal('<h3>Publish Notice</h3><form onsubmit="return saveNotice(event)"><div class="form-grid">' +
    '<div class="full"><label>Title</label><input id="fNtTitle" required placeholder="e.g. Annual Sports Day"></div>' +
    '<div class="full"><label>Message</label><textarea id="fNtBody" rows="3" required placeholder="Notice details…"></textarea></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" type="submit">Publish</button></div></form>');
}
function saveNotice(e) {
  e.preventDefault();
  db.notices.unshift({ id: 'n' + Date.now(), title: $('fNtTitle').value.trim(), date: new Date().toISOString().slice(0, 10), body: $('fNtBody').value.trim() });
  addActivity('📢', 'orange', 'New notice published', $('fNtTitle').value.trim());
  saveDB(db); closeModal(); renderApp();
  toast('Notice published.');
  return false;
}
function reportsPage(role) {
  return '<div class="page-head"><div><h2>Reports</h2><p>Download CSV reports for ' + (role === 'super' ? 'the platform' : db.profile.name) + '</p></div></div>' +
  '<div class="grid2e">' +
  '<div class="card"><h3>Students Report</h3><p class="card-sub">Name, class, roll, guardian, phone, attendance, fee status</p><button class="btn" onclick="downloadReportCSV(\'students\')">⬇ Download Students CSV</button></div>' +
  '<div class="card"><h3>Fees Report</h3><p class="card-sub">Student, class, month, amount, status — Apr to Aug</p><button class="btn" onclick="downloadReportCSV(\'fees\')">⬇ Download Fees CSV</button></div>' +
  '<div class="card"><h3>Attendance Report</h3><p class="card-sub">Today\'s register — Class 10th-A</p><button class="btn" onclick="downloadReportCSV(\'attendance\')">⬇ Download Attendance CSV</button></div>' +
  '<div class="card"><h3>Schools Report</h3><p class="card-sub">All 24 schools — city, students, plan, status</p><button class="btn" onclick="downloadReportCSV(\'schools\')">⬇ Download Schools CSV</button></div>' +
  '</div>';
}
function downloadReportCSV(kind) {
  if (kind === 'students') {
    downloadCSV('school-saathi-students.csv', [['Name', 'Class', 'Roll', 'Guardian', 'Phone', 'Attendance %', 'Fee Status']]
      .concat(db.students.map(function (s) { return [s.name, s.cls, s.roll, s.guardian, s.phone, s.att, s.fee]; })));
  } else if (kind === 'fees') {
    downloadCSV('school-saathi-fees.csv', [['Student', 'Class', 'Month', 'Amount (INR)', 'Date', 'Status']]
      .concat(db.feeRecords.map(function (r) { return [r.student, r.cls, r.month, r.amount, r.date, r.status]; })));
  } else if (kind === 'attendance') {
    var recs = db.attendance.records;
    downloadCSV('school-saathi-attendance.csv', [['Student', 'Class', 'Roll', 'Date', 'Status']]
      .concat(db.students.filter(function (s) { return s.cls === db.attendance.cls; })
        .map(function (s) { return [s.name, s.cls, s.roll, db.attendance.date, recs[s.id] || 'Present']; })));
  } else {
    downloadCSV('school-saathi-schools.csv', [['School', 'City', 'Students', 'Users', 'Plan', 'Status']]
      .concat(db.schools.map(function (s) { return [s.name, s.city, s.students, s.users, s.plan, s.status]; })));
  }
  toast('✓ Report downloaded.');
}
function settingsPage() {
  var p = db.profile, isSuper = state.role === 'super';
  return '<div class="page-head"><div><h2>Settings</h2><p>' + (isSuper ? 'Platform settings' : 'School profile') + '</p></div></div>' +
  '<div class="card" style="max-width:680px"><h3>' + (isSuper ? 'Platform' : esc(p.name)) + '</h3><p class="card-sub">Edit and save — changes persist on this device.</p>' +
  '<form onsubmit="return saveSettings(event)"><div class="form-grid">' +
  '<div><label>School Name</label><input id="fPfName" value="' + esc(p.name) + '" ' + (isSuper ? 'disabled' : '') + '></div>' +
  '<div><label>City</label><input id="fPfCity" value="' + esc(p.city) + '" ' + (isSuper ? 'disabled' : '') + '></div>' +
  '<div><label>Principal / Admin</label><input id="fPfPr" value="' + esc(p.principal) + '"></div>' +
  '<div><label>Phone</label><input id="fPfPh" value="' + esc(p.phone) + '"></div>' +
  '<div><label>Email</label><input id="fPfEm" value="' + esc(p.email) + '"></div>' +
  '<div><label>Academic Session</label><select id="fPfSe"><option ' + (p.session === '2025–26' ? 'selected' : '') + '>2025–26</option><option ' + (p.session === '2024–25' ? 'selected' : '') + '>2024–25</option><option ' + (p.session === '2026–27' ? 'selected' : '') + '>2026–27</option></select></div>' +
  '<div class="full"><label>Address</label><input id="fPfAd" value="' + esc(p.address) + '"></div>' +
  '</div><div class="actions" style="justify-content:flex-start"><button class="btn" type="submit">Save Settings</button>' +
  '<button type="button" class="btn danger" onclick="resetDemo()">Reset Demo Data</button></div></form></div>';
}
function saveSettings(e) {
  e.preventDefault();
  var p = db.profile;
  if (state.role !== 'super') { p.name = $('fPfName').value.trim(); p.city = $('fPfCity').value.trim(); }
  p.principal = $('fPfPr').value.trim(); p.phone = $('fPfPh').value.trim(); p.email = $('fPfEm').value.trim();
  p.session = $('fPfSe').value; p.address = $('fPfAd').value.trim();
  saveDB(db); renderApp();
  toast('✓ Settings saved.');
  return false;
}
PAGE_SCHOOL.exams = examsPage; PAGE_SCHOOL.homework = homeworkPage; PAGE_SCHOOL.notices = noticesPage;
PAGE_SCHOOL.reports = function () { return reportsPage('school'); }; PAGE_SCHOOL.settings = settingsPage;

/* ================= STUDENT view ================= */
function studentDashboard() {
  var me = db.students.find(function (s) { return s.name === 'Riya Kumari'; }) || db.students[0];
  var myHw = db.homework.filter(function (h) { return h.cls === '10th-A'; });
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
    '<div class="tile green"><div class="n">' + me.att + '%</div><div class="l">Attendance</div></div>' +
    '<div class="tile yellow"><div class="n">Paid</div><div class="l">Fees</div></div>' +
    '<div class="tile purple"><div class="n">' + me.result + '%</div><div class="l">Results</div></div>' +
    '<div class="tile blue"><div class="n">' + myHw.length + '</div><div class="l">Homework (' + doneCount + ' done)</div></div>' +
    '</div></div>' +
    '<div class="card" style="margin-top:16px"><h3>My Homework</h3><p class="card-sub">Tap the box when you finish</p>' + hwItems + '</div>' +
    '<div class="card" style="margin-top:16px"><h3>Notices</h3><p class="card-sub">Latest from school</p>' + notices + '</div></div>';
}
var PAGE_STUDENT = { dashboard: studentDashboard, homework: homeworkPage, notices: noticesPage };

/* ================= init ================= */
document.addEventListener('DOMContentLoaded', function () {
  runCountUps(document);
  if ('serviceWorker' in navigator && window.location.protocol.indexOf('http') === 0) {
    try {
      navigator.serviceWorker.register('sw.js').then(function () { /* PWA ready */ }).catch(function () { /* offline mode still works without SW */ });
    } catch (e) { /* ignore — app works without SW */ }
  }
});
