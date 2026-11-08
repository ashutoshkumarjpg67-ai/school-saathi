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
function dbKeyFor(a) { return a.role === 'super' ? 'schoolSaathiDBv1' : 'schoolSaathiDB_' + a.uid; }
function applySchoolProfile(d, a) { d.profile.name = a.school; d.profile.principal = a.name; d.profile.email = a.email; return d; }

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
    admCounter: 41,
    auditLog: [],
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
function loadDB(override) {
  try {
    var raw = localStorage.getItem(DB_KEY);
    if (raw) {
      var d = JSON.parse(raw);
      if (d && d.v === 2) { var m = migrateStudentsV9(migrateFeesV7(migrateAttendance(d))); saveDB(m); return m; }
      // Unknown version: keep a backup, never wipe silently.
      try { localStorage.setItem(DB_KEY + '.bak', raw); } catch (e2) { /* ignore */ }
    }
  } catch (e) { /* storage unavailable — fall back to memory */ }
  var fresh = seedDB();
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
var state = { role: null, user: null, view: 'dashboard', lang: 'en', feeFilter: 'All', feeType: 'All', feeSearch: '', feeStudent: null, feeGenMonth: 'Sep', feeFormOpen: false, feePreselect: null, stuSearch: '', stuClass: 'All', stuSection: 'All', stuSession: 'All', stuGender: 'All', stuFee: 'All', stuStatus: 'All', stuPage: 1, stuSort: 'name', stuSortDir: 1, profileStudent: null, profileTab: 'overview', attCls: '10th-A', attDate: '', examId: 'ex1', attSnapKey: '', attSnap: {} };

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
    attSum += s.att || 0;
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
    } else if (col === 'att') r = (a.att || 0) - (b.att || 0);
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
    s.att, studentFeeStatus(s.id), s.status || 'Active', s.session || '', s.admissionDate || '', s.dob || '',
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
    loginWelcome: 'Log in or sign up<br>to continue', loginEmail: 'Email', loginPassword: 'Password', loginEmailPh: 'you@school.edu.in', loginPwPh: '••••••••', loginBtn: 'Login', authLogin: 'Log In', authSignup: 'Sign Up', authNote: 'One account per school. Your school’s data stays on this device until the server version arrives.', suSchool: 'School Name', suYourName: 'Your Name', suEmail: 'Email', suPw: 'Password', suPw2: 'Confirm Password', suBtn: 'Create Account', loginOr: 'Or continue with', demoTitle: '— One-tap demo login —', loginBack: '← Back to website',
    superDashboard: 'Super Admin Dashboard', schoolDashboard: 'School Admin Dashboard', studentDashboard: 'Student Dashboard',
    confirmTitle: 'Confirm', cancel: 'Cancel', confirmYes: 'Yes, continue', saveBtn: 'Save',
    addSchool: 'Add School', addStudent: 'Add Student', saveAttendance: 'Save Attendance', saveMarks: 'Save Marks', addHomework: 'Add Homework', publishNotice: 'Publish Notice', downloadReport: 'Download Report', approve: 'Approve', remove: 'Remove', editBtn: 'Edit', deleteBtn: 'Delete', collectBtn: 'Collect', saveSettingsBtn: 'Save Settings', resetDemo: 'Reset Demo Data', publishBtn: 'Publish', assignHw: 'Assign Homework', saveSchoolBtn: 'Save School', saveStudentBtn: 'Save Student',
    attOverview: 'Attendance Overview', todayAtt: 'Today\'s Attendance', feeTrend: 'Fee Collection Trend', feeTrendSub: 'Apr – Aug (Collected vs Pending)', feeTrendSub2: 'Apr to Aug (Collected vs Pending)', recentAct: 'Recent Activities', quickLinks: 'Quick Links', jumpTask: 'Jump to a task', top5: 'Top 5 Schools', byStrength: 'By student strength', schoolGrowth: 'School Growth', growthSub: 'New schools onboarded this week', growthWeek: 'This week (Mon–Sun)', subsStatus: 'Subscription Status', subsSub: 'Share of schools by plan status', quickActions: 'Quick Actions', qaSub: 'Common admin tasks', enterMarks: 'Enter Marks', myHomework: 'My Homework', noticesH: 'Notices', latestNotices: 'Latest from school', plansH: 'Plans', guidesH: 'Quick Guides', guidesSub: 'Most common tasks', contactH: 'Contact', contactSub: 'We reply within one working day', studentsReport: 'Students Report', feesReport: 'Fees Report', attReport: 'Attendance Report', schoolsReport: 'Schools Report',
    thName: 'Name', thClass: 'Class', thRoll: 'Roll', thGuardian: 'Guardian', thPhone: 'Phone', thAtt: 'Att.', thFee: 'Fee', thAction: 'Action', thStudent: 'Student', thMonth: 'Month', thAmount: 'Amount', thDate: 'Date', thStatus: 'Status', thSchool: 'School', thCity: 'City', thStudents: 'Students', thUsers: 'Users', thPlan: 'Plan', thMarks: 'Marks', thResult: 'Result', thSince: 'Since', thRole: 'Role',
    subSuperDash: 'Platform Overview & Management', subSchools: 'All schools on the platform', subUsers: 'Teachers, staff & students', subSubs: 'Plans & billing status', subAnalytics: 'Growth, attendance & fees', subAnalyticsFull: 'Growth, attendance & fees across the platform', subReports: 'Download CSV reports', subHelp: 'Guides & contact', subStudents: 'St. Xavier School, Patna', subAttendance: 'Mark & view attendance', subFees: 'Fee collection & pending dues', subExams: 'Exams & marks entry', subHomework: 'Assign & track homework', subNotices: 'Notice board',
    fSchoolName: 'School Name', fCity: 'City', fStudents: 'Students', fPlan: 'Plan', fStudentName: 'Student Name', fClass: 'Class', fRoll: 'Roll No', fGuardian: 'Guardian', fPhone: 'Phone', fTitle: 'Title', fSubject: 'Subject', fDue: 'Due Date', fMessage: 'Message', fPrincipal: 'Principal / Admin', fEmail: 'Email', fAddress: 'Address', fSession: 'Academic Session',
    tLoggedIn: 'Logged in as', tAccountCreated: 'Account created. Welcome, ', tInvalidCreds: 'Invalid email or password.', tFillAll: 'Please fill in all fields.', tInvalidEmail: 'Please enter a valid email address.', tPwShort: 'Password must be at least 6 characters.', tPwMismatch: 'Passwords do not match.', tEmailTaken: 'An account with this email already exists. Please log in.', tLoggedOut: 'Logged out. See you soon!', tSchoolAdded: 'School added — pending approval.', tSchoolRemoved: 'School removed.', tStudentAdded: 'Student added.', tStudentUpdated: 'Student updated.', tStudentDeleted: 'Student deleted.', tAttSaved: 'Attendance saved', tMarksSaved: 'Marks saved for', tHwDone: 'Homework marked done.', tHwNotDone: 'Homework marked not done.', tHwAssigned: 'Homework assigned.', tNoticePub: 'Notice published.', tReportDl: 'Report downloaded.', tSettingsSaved: 'Settings saved.', tDemoReset: 'Demo data reset.', tSessionChanged: 'Academic session changed to', tApproved: 'approved. Pending approvals:', tNoChanges: 'No changes.', tStudentsRange: 'Students must be between 1 and 100,000.', tFutureDate: 'Future date not allowed — showing today.', tDueFuture: 'Due date must be today or later.', tDemoLogin: 'Demo account — use one-tap login below.', tGoogleDemo: 'Demo build — please use a one-tap demo login.', tNoStudentData: 'No student data — ask your school admin to add students.', tNoExams: 'No exams yet.', tNoHw: 'No homework yet.', tNoMarks: 'No marks entered yet for this exam.', tNoMatch: 'No students match.', tNoSchoolsMatch: 'No schools match.', tNotEntered: 'Not entered', tCollectedFrom: 'collected from', tDupSchool: 'already exists.', tDupStudent: 'already exists in', tNotSaved: 'Not saved', tCheckMarks: 'check marks', tStudentsWord: 'students', tNoFeeData: 'No fee data yet.', tNoGrowthData: 'No growth data yet.',
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
    sampleList: 'sample list below', plansSub: 'Per-student monthly pricing', collectedW: 'Collected', pendingW: 'Pending', allW: 'All', editStudent: 'Edit Student', thePlatform: 'the platform', repSchoolsSub: 'city, students, plan, status', subActive: 'Active', subExpired: 'Expired', subTrial: 'Trial', feeTypeTuition: 'Tuition', feeTypeAdmission: 'Admission', feeTypeTransport: 'Transport', feeTypeExam: 'Exam', feeTypeLibrary: 'Library', feeTypeActivity: 'Activity', feeTypeComputer: 'Computer Lab', feeTypeOther: 'Other', allTypes: 'All Types', searchFee: 'Search name, enrollment no. or class…', thEnr: 'Enr. No.', thType: 'Type', feeByType: 'Fee by Type', feeByTypeSub: 'Collected and pending per fee type, computed live.', addFee: 'Add Fee', addFeeSub: 'Add one fee record manually for any student.', feeStruct: 'Fee Structure', feeStructSub: 'Monthly amount per class. Generate uses this to create fee records.', genFees: 'Generate Fees', saveStruct: 'Save Structure', addRow: 'Add Row', customType: 'Custom…', typeCustomPh: 'Type a custom fee type', fStudent: 'Student', fMonth: 'Month', fType: 'Fee Type', fAmount: 'Amount (₹)', fStatus: 'Status', fDate: 'Date', printList: 'Print List', printStmt: 'Print Statement', backFees: 'Back to All Fees', totalBilled: 'Total Billed', totalPaid: 'Paid', totalPending: 'Pending', feeRecsH: 'Fee Records', feeProfileSub: 'All fee records for this student in one place.', tFeeAdded: 'Fee record added.', tPickStudent: 'Please choose a student.', tAmtPositive: 'Amount must be more than 0.', tTypeRequired: 'Please type the custom fee type.', tStructSaved: 'Fee structure saved.', tStructAdded: 'Structure row added.', tStructRemoved: 'Structure row removed.', tGenRecords: 'fee records generated for', tGenSkipped: 'already existed', tNoFeeRecs: 'No fee records yet for this student.', printTitle: 'Fee Statement', printListTitle: 'Fee List', printGenOn: 'Generated on', closeW: 'Close', saveFeeBtn: 'Save Fee', photoLabel: 'Student Photo', photoHint: 'Photo is compressed automatically (max 512px, ~120KB).', removePhoto: 'Remove photo', logoLabel: 'School Logo', logoHint: 'Logo is compressed automatically (max 256px, PNG keeps transparency).', removeLogo: 'Remove logo', tPhotoTooBig: 'That photo is too large even after compression. Please choose a smaller photo.', tLogoTooBig: 'That logo is too large even after compression. Please choose a smaller logo.', tPhotoError: 'Could not read that image. Please choose another file.', aadhaarHint: 'Optional. Stored securely and never shown in full.', actActivate: 'Activate Student', actAtt: 'View Attendance', actDeactivate: 'Deactivate Student', actDownload: 'Download Details', actEdit: 'Edit Student', actFees: 'View Fees', actIdCard: 'Print ID Card', actResults: 'View Results', actTransfer: 'Transfer Student', actView: 'View Profile', actionsW: 'Actions', admNoAuto: 'Auto-generated', allClasses: 'All Classes', allFeeSt: 'All Fee Status', allGenders: 'All Genders', allSections: 'All Sections', allSessions: 'All Sessions', allStatus: 'All Statuses', attPct: 'Attendance', backDir: 'Back to Directory', cancelAdm: 'Cancel Admission', cancelAdmMsg: 'Cancel this admission? The student record will be kept with status Cancelled.', docMissing: 'Not received', docStatus: 'Received', docsNote: 'Document files will be uploaded in the server phase. This checklist records what has been received.', exportCsv: 'Export CSV', fAadhaar: 'Aadhaar Number (optional)', fAdmDate: 'Admission Date', fAdmNo: 'Admission Number', fBirthCert: 'Birth Certificate', fBlood: 'Blood Group', fCategory: 'Category', fDistrict: 'District', fDob: 'Date of Birth', fDocsOther: 'Other Documents (notes)', fFather: 'Father\'s Name', fGender: 'Gender', fMother: 'Mother\'s Name', fOccupation: 'Occupation', fParentEmail: 'Parent Email', fPhone2: 'Secondary Mobile', fPin: 'PIN Code', fPrevClass: 'Previous Class', fPrevSchool: 'Previous School', fSection: 'Section', fState: 'State', fTc: 'Transfer Certificate (TC)', fTcNo: 'Transfer Certificate No.', feeSt: 'Fee Status', hwDone: 'Done', hwPend: 'Pending', hwPending: 'Homework Pending', latestExam: 'Latest Exam', nextW: 'Next', noActivity: 'No activity recorded yet.', noAttRecs: 'No attendance records yet for this student.', noExamRecs: 'No examination results yet.', noHwRecs: 'No homework records for this class.', openFees: 'Open Fee Page', pgOf: 'of', pgPage: 'Page', phase3W: 'Phase 3', prevW: 'Previous', saveAddAnother: 'Save & Add Another', saveDraft: 'Save as Draft', secAcademic: 'Academic Details', secDocs: 'Documents', secParent: 'Parent / Guardian Details', secPersonal: 'Personal Details', stActive: 'Active Students', stAvgAtt: 'Average Attendance', stBoys: 'Boys', stByClass: 'Students by Class', stByClassSub: 'Number of students in each class-section.', stGenderDist: 'Boys & Girls', stGenderSub: 'Gender distribution across the school.', stGirls: 'Girls', stInactive: 'Inactive Students', stNewAdm: 'New Admissions', stNotSpec: 'Not specified', stPendFee: 'Students with Pending Fees', stTotal: 'Total Students', stuSearchPh: 'Search name, admission no. or mobile…', tActMsg: 'Activate student', tActivated: 'Student activated.', tAdmCancelled: 'Admission cancelled. The record is kept.', tAdmCreated: 'Admission saved. Admission No. ', tCsvExported: 'Student list exported.', tDeactMsg: 'Deactivate student', tDeactivated: 'Student deactivated.', tDraftSaved: 'Draft saved.', tDupFound: 'A matching student already exists: ', tInvalidAadhaar: 'Aadhaar must be 12 digits (optional).', tInvalidMobile: 'Enter a valid 10-digit mobile number.', tInvalidPin: 'PIN code must be 6 digits.', tPickClass: 'Please choose a class.', tReqFields: 'Please fill Student Name, Primary Mobile, Class and Section.', tStuCsvOne: 'Student details downloaded.', tTransferred: 'Student transferred.', tabAcademic: 'Academic Records', tabActivity: 'Activity History', tabAttendance: 'Attendance History', tabDocs: 'Documents', tabFees: 'Fee History', tabHomework: 'Homework Records', tabOverview: 'Overview', tabParent: 'Parent Information', tabPersonal: 'Personal Information', tabResults: 'Examination Results', thAdmNo: 'Admission No.', thExam: 'Exam', thFather: 'Father\'s Name', transferTitle: 'Transfer Student', transferTo: 'New Class & Section', idCardSoon: 'ID Card generator comes in Phase 3.'
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
    loginWelcome: 'लॉग इन करें या साइन अप करें<br>जारी रखने के लिए', loginEmail: 'ईमेल', loginPassword: 'पासवर्ड', loginEmailPh: 'आप@school.edu.in', loginPwPh: '••••••••', loginBtn: 'लॉगिन', authLogin: 'लॉग इन', authSignup: 'साइन अप', authNote: 'एक स्कूल, एक अकाउंट। सर्वर वर्शन आने तक आपके स्कूल का डेटा इसी डिवाइस पर रहेगा।', suSchool: 'स्कूल का नाम', suYourName: 'आपका नाम', suEmail: 'ईमेल', suPw: 'पासवर्ड', suPw2: 'पासवर्ड दोबारा डालें', suBtn: 'अकाउंट बनाएँ', loginOr: 'या जारी रखें', demoTitle: '— एक टैप में डेमो लॉगिन —', loginBack: '← वेबसाइट पर वापस',
    superDashboard: 'सुपर एडमिन डैशबोर्ड', schoolDashboard: 'स्कूल एडमिन डैशबोर्ड', studentDashboard: 'छात्र डैशबोर्ड',
    confirmTitle: 'पुष्टि करें', cancel: 'रद्द करें', confirmYes: 'हाँ, जारी रखें', saveBtn: 'सहेजें',
    addSchool: 'स्कूल जोड़ें', addStudent: 'छात्र जोड़ें', saveAttendance: 'उपस्थिति सहेजें', saveMarks: 'अंक सहेजें', addHomework: 'होमवर्क जोड़ें', publishNotice: 'नोटिस प्रकाशित करें', downloadReport: 'रिपोर्ट डाउनलोड करें', approve: 'स्वीकृत करें', remove: 'हटाएँ', editBtn: 'बदलें', deleteBtn: 'हटाएँ', collectBtn: 'वसूलें', saveSettingsBtn: 'सेटिंग्स सहेजें', resetDemo: 'डेमो डेटा रीसेट करें', publishBtn: 'प्रकाशित करें', assignHw: 'होमवर्क सौंपें', saveSchoolBtn: 'स्कूल सहेजें', saveStudentBtn: 'छात्र सहेजें',
    attOverview: 'उपस्थिति अवलोकन', todayAtt: 'आज की उपस्थिति', feeTrend: 'शुल्क संग्रह प्रवृत्ति', feeTrendSub: 'अप्रैल – अगस्त (संग्रह बनाम बकाया)', feeTrendSub2: 'अप्रैल से अगस्त (संग्रह बनाम बकाया)', recentAct: 'हाल की गतिविधियाँ', quickLinks: 'त्वरित लिंक', jumpTask: 'किसी कार्य पर जाएँ', top5: 'शीर्ष 5 स्कूल', byStrength: 'छात्र संख्या के अनुसार', schoolGrowth: 'स्कूल वृद्धि', growthSub: 'इस सप्ताह जुड़े नए स्कूल', growthWeek: 'इस सप्ताह (सोम–रवि)', subsStatus: 'सदस्यता स्थिति', subsSub: 'योजना स्थिति के अनुसार स्कूलों का हिस्सा', quickActions: 'त्वरित कार्य', qaSub: 'आम व्यवस्थापक कार्य', enterMarks: 'अंक भरें', myHomework: 'मेरा होमवर्क', noticesH: 'नोटिस', latestNotices: 'स्कूल से नवीनतम', plansH: 'योजनाएँ', guidesH: 'त्वरित मार्गदर्शिकाएँ', guidesSub: 'सबसे आम कार्य', contactH: 'संपर्क', contactSub: 'हम एक कार्य दिवस के भीतर जवाब देते हैं', studentsReport: 'छात्र रिपोर्ट', feesReport: 'शुल्क रिपोर्ट', attReport: 'उपस्थिति रिपोर्ट', schoolsReport: 'स्कूल रिपोर्ट',
    thName: 'नाम', thClass: 'कक्षा', thRoll: 'रोल', thGuardian: 'अभिभावक', thPhone: 'फ़ोन', thAtt: 'उप.', thFee: 'शुल्क', thAction: 'कार्रवाई', thStudent: 'छात्र', thMonth: 'महीना', thAmount: 'राशि', thDate: 'तारीख', thStatus: 'स्थिति', thSchool: 'स्कूल', thCity: 'शहर', thStudents: 'छात्र', thUsers: 'उपयोगकर्ता', thPlan: 'योजना', thMarks: 'अंक', thResult: 'परिणाम', thSince: 'से', thRole: 'भूमिका',
    subSuperDash: 'प्लेटफ़ॉर्म अवलोकन और प्रबंधन', subSchools: 'प्लेटफ़ॉर्म के सभी स्कूल', subUsers: 'शिक्षक, कर्मचारी और छात्र', subSubs: 'योजनाएँ और बिलिंग स्थिति', subAnalytics: 'वृद्धि, उपस्थिति और शुल्क', subAnalyticsFull: 'पूरे प्लेटफ़ॉर्म पर वृद्धि, उपस्थिति और शुल्क', subReports: 'CSV रिपोर्ट डाउनलोड करें', subHelp: 'मार्गदर्शिकाएँ और संपर्क', subStudents: 'सेंट ज़ेवियर स्कूल, पटना', subAttendance: 'उपस्थिति दर्ज करें और देखें', subFees: 'शुल्क संग्रह और बकाया', subExams: 'परीक्षा और अंक प्रविष्टि', subHomework: 'होमवर्क सौंपें और देखें', subNotices: 'नोटिस बोर्ड',
    fSchoolName: 'स्कूल का नाम', fCity: 'शहर', fStudents: 'छात्र', fPlan: 'योजना', fStudentName: 'छात्र का नाम', fClass: 'कक्षा', fRoll: 'रोल नंबर', fGuardian: 'अभिभावक', fPhone: 'फ़ोन', fTitle: 'शीर्षक', fSubject: 'विषय', fDue: 'देय तारीख', fMessage: 'संदेश', fPrincipal: 'प्रधानाचार्य / एडमिन', fEmail: 'ईमेल', fAddress: 'पता', fSession: 'शैक्षणिक सत्र',
    tLoggedIn: 'के रूप में लॉगिन हुआ', tAccountCreated: 'अकाउंट बन गया। स्वागत है, ', tInvalidCreds: 'ईमेल या पासवर्ड गलत है।', tFillAll: 'कृपया सभी फ़ील्ड भरें।', tInvalidEmail: 'कृपया सही ईमेल पता डालें।', tPwShort: 'पासवर्ड कम से कम 6 अक्षर का हो।', tPwMismatch: 'पासवर्ड मेल नहीं खाते।', tEmailTaken: 'इस ईमेल से अकाउंट पहले से बना है। कृपया लॉग इन करें।', tLoggedOut: 'लॉगआउट हो गया। फिर मिलते हैं!', tSchoolAdded: 'स्कूल जोड़ा गया — स्वीकृति लंबित।', tSchoolRemoved: 'स्कूल हटाया गया।', tStudentAdded: 'छात्र जोड़ा गया।', tStudentUpdated: 'छात्र अपडेट हुआ।', tStudentDeleted: 'छात्र हटाया गया।', tAttSaved: 'उपस्थिति सहेजी गई', tMarksSaved: 'अंक सहेजे गए', tHwDone: 'होमवर्क पूर्ण के रूप में चिह्नित।', tHwNotDone: 'होमवर्क अपूर्ण के रूप में चिह्नित।', tHwAssigned: 'होमवर्क सौंपा गया।', tNoticePub: 'नोटिस प्रकाशित हुआ।', tReportDl: 'रिपोर्ट डाउनलोड हुई।', tSettingsSaved: 'सेटिंग्स सहेजी गईं।', tDemoReset: 'डेमो डेटा रीसेट हुआ।', tSessionChanged: 'शैक्षणिक सत्र बदला गया', tApproved: 'स्वीकृत। लंबित स्वीकृतियाँ:', tNoChanges: 'कोई बदलाव नहीं।', tStudentsRange: 'छात्रों की संख्या 1 से 100,000 के बीच होनी चाहिए।', tFutureDate: 'भविष्य की तारीख नहीं चुन सकते — आज की तारीख दिखा रहे हैं।', tDueFuture: 'देय तारीख आज या आगे की होनी चाहिए।', tDemoLogin: 'डेमो खाता — नीचे एक-टैप लॉगिन इस्तेमाल करें।', tGoogleDemo: 'डेमो बिल्ड — कृपया एक-टैप डेमो लॉगिन इस्तेमाल करें।', tNoStudentData: 'कोई छात्र डेटा नहीं — अपने स्कूल एडमिन से छात्र जोड़ने को कहें।', tNoExams: 'अभी कोई परीक्षा नहीं है।', tNoHw: 'अभी कोई होमवर्क नहीं है।', tNoMarks: 'इस परीक्षा के लिए अभी कोई अंक नहीं भरे गए।', tNoMatch: 'कोई छात्र नहीं मिला।', tNoSchoolsMatch: 'कोई स्कूल नहीं मिला।', tNotEntered: 'नहीं भरा गया', tCollectedFrom: 'से वसूला गया', tDupSchool: 'पहले से मौजूद है।', tDupStudent: 'में पहले से मौजूद है', tNotSaved: 'सहेजा नहीं गया', tCheckMarks: 'अंक जाँचें', tStudentsWord: 'छात्र', tNoFeeData: 'अभी कोई शुल्क डेटा नहीं है।', tNoGrowthData: 'अभी कोई वृद्धि डेटा नहीं है।',
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
    sampleList: 'नमूना सूची नीचे', plansSub: 'प्रति छात्र मासिक मूल्य', collectedW: 'संग्रह', pendingW: 'बकाया', allW: 'सभी', editStudent: 'छात्र बदलें', thePlatform: 'पूरे प्लेटफ़ॉर्म', repSchoolsSub: 'शहर, छात्र, योजना, स्थिति', subActive: 'सक्रिय', subExpired: 'समाप्त', subTrial: 'परीक्षण', feeTypeTuition: 'ट्यूशन', feeTypeAdmission: 'प्रवेश', feeTypeTransport: 'परिवहन', feeTypeExam: 'परीक्षा', feeTypeLibrary: 'पुस्तकालय', feeTypeActivity: 'गतिविधि', feeTypeComputer: 'कंप्यूटर लैब', feeTypeOther: 'अन्य', allTypes: 'सभी प्रकार', searchFee: 'नाम, नामांकन संख्या या कक्षा खोजें…', thEnr: 'नामांकन सं.', thType: 'प्रकार', feeByType: 'प्रकार के अनुसार शुल्क', feeByTypeSub: 'प्रति प्रकार संग्रह और बकाया, लाइव गणना।', addFee: 'शुल्क जोड़ें', addFeeSub: 'किसी भी छात्र के लिए एक शुल्क रिकॉर्ड जोड़ें।', feeStruct: 'शुल्क संरचना', feeStructSub: 'प्रति कक्षा मासिक राशि। Generate इसी से रिकॉर्ड बनाता है।', genFees: 'शुल्क बनाएँ', saveStruct: 'संरचना सहेजें', addRow: 'पंक्ति जोड़ें', customType: 'कस्टम…', typeCustomPh: 'शुल्क का प्रकार लिखें', fStudent: 'छात्र', fMonth: 'महीना', fType: 'शुल्क प्रकार', fAmount: 'राशि (₹)', fStatus: 'स्थिति', fDate: 'तारीख', printList: 'सूची छापें', printStmt: 'विवरण छापें', backFees: 'सभी शुल्क पर वापस', totalBilled: 'कुल बिल', totalPaid: 'जमा', totalPending: 'बकाया', feeRecsH: 'शुल्क रिकॉर्ड', feeProfileSub: 'इस छात्र के सभी शुल्क रिकॉर्ड एक ही जगह।', tFeeAdded: 'शुल्क रिकॉर्ड जुड़ गया।', tPickStudent: 'कृपया छात्र चुनें।', tAmtPositive: 'राशि 0 से अधिक होनी चाहिए।', tTypeRequired: 'कृपया शुल्क का प्रकार लिखें।', tStructSaved: 'शुल्क संरचना सहेजी गई।', tStructAdded: 'संरचना पंक्ति जुड़ी।', tStructRemoved: 'संरचना पंक्ति हटाई गई।', tGenRecords: 'शुल्क रिकॉर्ड बने', tGenSkipped: 'पहले से थे', tNoFeeRecs: 'इस छात्र के लिए अभी कोई शुल्क रिकॉर्ड नहीं है।', printTitle: 'शुल्क विवरण', printListTitle: 'शुल्क सूची', printGenOn: 'बनाया गया', closeW: 'बंद करें', saveFeeBtn: 'शुल्क सहेजें', photoLabel: 'छात्र की फ़ोटो', photoHint: 'फ़ोटो अपने आप छोटी हो जाती है (अधिकतम 512px, ~120KB)।', removePhoto: 'फ़ोटो हटाएँ', logoLabel: 'स्कूल का लोगो', logoHint: 'लोगो अपने आप छोटा हो जाता है (अधिकतम 256px, PNG में पारदर्शिता रहती है)।', removeLogo: 'लोगो हटाएँ', tPhotoTooBig: 'यह फ़ोटो छोटी करने के बाद भी बड़ी है। कृपया छोटी फ़ोटो चुनें।', tLogoTooBig: 'यह लोगो छोटा करने के बाद भी बड़ा है। कृपया छोटा लोगो चुनें।', tPhotoError: 'यह तस्वीर पढ़ी नहीं जा सकी। कृपया दूसरी फ़ाइल चुनें।', aadhaarHint: 'वैकल्पिक। सुरक्षित रूप से सहेजा जाता है, पूरा कभी नहीं दिखाया जाता।', actActivate: 'छात्र सक्रिय करें', actAtt: 'उपस्थिति देखें', actDeactivate: 'छात्र निष्क्रिय करें', actDownload: 'विवरण डाउनलोड करें', actEdit: 'छात्र बदलें', actFees: 'शुल्क देखें', actIdCard: 'ID कार्ड छापें', actResults: 'परिणाम देखें', actTransfer: 'छात्र स्थानांतरित करें', actView: 'प्रोफ़ाइल देखें', actionsW: 'कार्रवाई', admNoAuto: 'स्वतः निर्मित', allClasses: 'सभी कक्षाएँ', allFeeSt: 'सभी शुल्क स्थितियाँ', allGenders: 'सभी लिंग', allSections: 'सभी अनुभाग', allSessions: 'सभी सत्र', allStatus: 'सभी स्थितियाँ', attPct: 'उपस्थिति', backDir: 'सूची पर वापस', cancelAdm: 'प्रवेश रद्द करें', cancelAdmMsg: 'यह प्रवेश रद्द करें? छात्र का रिकॉर्ड Cancelled स्थिति के साथ रखा जाएगा।', docMissing: 'प्राप्त नहीं', docStatus: 'प्राप्त', docsNote: 'दस्तावेज़ फ़ाइलें सर्वर चरण में अपलोड होंगी। यह सूची बताती है कि क्या प्राप्त हुआ है।', exportCsv: 'CSV निर्यात करें', fAadhaar: 'आधार संख्या (वैकल्पिक)', fAdmDate: 'प्रवेश तिथि', fAdmNo: 'प्रवेश संख्या', fBirthCert: 'जन्म प्रमाण पत्र', fBlood: 'रक्त समूह', fCategory: 'श्रेणी', fDistrict: 'जिला', fDob: 'जन्म तिथि', fDocsOther: 'अन्य दस्तावेज़ (नोट)', fFather: 'पिता का नाम', fGender: 'लिंग', fMother: 'माता का नाम', fOccupation: 'व्यवसाय', fParentEmail: 'अभिभावक ईमेल', fPhone2: 'दूसरा मोबाइल', fPin: 'पिन कोड', fPrevClass: 'पिछली कक्षा', fPrevSchool: 'पिछला स्कूल', fSection: 'अनुभाग', fState: 'राज्य', fTc: 'स्थानांतरण प्रमाण पत्र (TC)', fTcNo: 'TC संख्या', feeSt: 'शुल्क स्थिति', hwDone: 'पूर्ण', hwPend: 'बाकी', hwPending: 'होमवर्क बाकी', latestExam: 'हाल की परीक्षा', nextW: 'अगला', noActivity: 'अभी कोई गतिविधि दर्ज नहीं है।', noAttRecs: 'इस छात्र के लिए अभी कोई उपस्थिति रिकॉर्ड नहीं है।', noExamRecs: 'अभी कोई परीक्षा परिणाम नहीं है।', noHwRecs: 'इस कक्षा के लिए कोई होमवर्क रिकॉर्ड नहीं है।', openFees: 'शुल्क पेज खोलें', pgOf: 'का', pgPage: 'पृष्ठ', phase3W: 'Phase 3', prevW: 'पिछला', saveAddAnother: 'सहेजें और नया जोड़ें', saveDraft: 'ड्राफ़्ट सहेजें', secAcademic: 'शैक्षणिक विवरण', secDocs: 'दस्तावेज़', secParent: 'माता-पिता / अभिभावक विवरण', secPersonal: 'व्यक्तिगत विवरण', stActive: 'सक्रिय छात्र', stAvgAtt: 'औसत उपस्थिति', stBoys: 'लड़के', stByClass: 'कक्षा अनुसार छात्र', stByClassSub: 'प्रत्येक कक्षा-अनुभाग में छात्रों की संख्या।', stGenderDist: 'लड़के और लड़कियाँ', stGenderSub: 'पूरे स्कूल में लिंग वितरण।', stGirls: 'लड़कियाँ', stInactive: 'निष्क्रिय छात्र', stNewAdm: 'नए प्रवेश', stNotSpec: 'निर्दिष्ट नहीं', stPendFee: 'बकाया शुल्क वाले छात्र', stTotal: 'कुल छात्र', stuSearchPh: 'नाम, प्रवेश संख्या या मोबाइल खोजें…', tActMsg: 'छात्र सक्रिय करें', tActivated: 'छात्र सक्रिय हुआ।', tAdmCancelled: 'प्रवेश रद्द हुआ। रिकॉर्ड रखा गया है।', tAdmCreated: 'प्रवेश सहेजा गया। प्रवेश संख्या ', tCsvExported: 'छात्र सूची निर्यात हुई।', tDeactMsg: 'छात्र निष्क्रिय करें', tDeactivated: 'छात्र निष्क्रिय हुआ।', tDraftSaved: 'ड्राफ़्ट सहेजा गया।', tDupFound: 'मेल खाता छात्र पहले से मौजूद है: ', tInvalidAadhaar: 'आधार 12 अंकों का होना चाहिए (वैकल्पिक)।', tInvalidMobile: 'सही 10 अंकों का मोबाइल नंबर डालें।', tInvalidPin: 'पिन कोड 6 अंकों का होना चाहिए।', tPickClass: 'कृपया कक्षा चुनें।', tReqFields: 'कृपया छात्र का नाम, मुख्य मोबाइल, कक्षा और अनुभाग भरें।', tStuCsvOne: 'छात्र का विवरण डाउनलोड हुआ।', tTransferred: 'छात्र स्थानांतरित हुआ।', tabAcademic: 'शैक्षणिक रिकॉर्ड', tabActivity: 'गतिविधि इतिहास', tabAttendance: 'उपस्थिति इतिहास', tabDocs: 'दस्तावेज़', tabFees: 'शुल्क इतिहास', tabHomework: 'होमवर्क रिकॉर्ड', tabOverview: 'सारांश', tabParent: 'अभिभावक जानकारी', tabPersonal: 'व्यक्तिगत जानकारी', tabResults: 'परीक्षा परिणाम', thAdmNo: 'प्रवेश सं.', thExam: 'परीक्षा', thFather: 'पिता का नाम', transferTitle: 'छात्र स्थानांतरण', transferTo: 'नई कक्षा और अनुभाग', idCardSoon: 'ID कार्ड जनरेटर Phase 3 में आएगा।'
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
function showLogin() { showView('login'); $('loginId').focus(); }
function persistSession() {
  try {
    if (state.role && state.user) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role: state.role, email: state.user.email, view: state.view }));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch (e) { /* private mode — session just won't survive refresh */ }
}
function loginAs(a, opts) {
  state.role = a.role; state.user = a; state.view = 'dashboard';
  DB_KEY = dbKeyFor(a);
  db = loadDB(a.role === 'school' ? a : null);
  showView('app'); renderApp();
  persistSession();
  if (!opts || !opts.silent) toast(t('tLoggedIn') + ' ' + a.name);
}
function restoreSession() {
  try {
    var raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    var sv = JSON.parse(raw);
    var a = findAccount(sv.email);
    if (!a || a.role !== sv.role) return false;
    loginAs(a, { silent: true });
    state.view = (NAV[a.role] || []).some(function (n) { return n[0] === sv.view; }) ? sv.view : 'dashboard';
    renderApp();
    return true;
  } catch (e) { return false; }
}
function switchAuth(tab) {
  $('tabLogin').classList.toggle('on', tab === 'login');
  $('tabSignup').classList.toggle('on', tab === 'signup');
  $('loginForm').classList.toggle('hidden', tab !== 'login');
  $('signupForm').classList.toggle('hidden', tab !== 'signup');
  $('loginErr').classList.add('hidden');
  $('signupErr').classList.add('hidden');
  setTimeout(function () { $(tab === 'login' ? 'loginId' : 'suSchool').focus(); }, 50);
}
function doLogin(e) {
  e.preventDefault();
  var id = $('loginId').value.trim().toLowerCase(), pw = $('loginPw').value;
  var err = $('loginErr');
  var a = findAccount(id);
  var ok = a ? (a.role === 'super' ? pw === OWNER.pw : hashPw(pw) === a.pwHash) : false;
  if (!a || !ok) {
    err.textContent = t('tInvalidCreds');
    err.classList.remove('hidden');
    return false;
  }
  err.classList.add('hidden');
  loginAs(a);
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
  var a = { uid: 'u' + Date.now().toString(36), name: name, school: school, email: email, pwHash: hashPw(pw), role: 'school', sub: 'School Admin • ' + school, created: new Date().toISOString().slice(0, 10) };
  var list = loadAccounts(); list.push(a); saveAccounts(list);
  err.classList.add('hidden');
  toast(t('tAccountCreated') + name);
  loginAs(a, { silent: true });
  return false;
}
function logout() {
  state.role = null; state.user = null; state.view = 'dashboard';
  state.attSnapKey = ''; state.attSnap = {};
  state.feeStudent = null; state.feeSearch = ''; state.feeType = 'All'; state.feeFilter = 'All'; state.feeFormOpen = false; state.feePreselect = null;
  state.profileStudent = null; state.profileTab = 'overview'; state.stuPage = 1;
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  $('loginId').value = ''; $('loginPw').value = '';
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
  if (state.view !== 'fees') state.feeStudent = null;
  state.profileStudent = null;
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
  var me = state.role === 'student' ? meStudent() : null;
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
  if (state.view === 'fees' && !state.feeStudent && state.feeSearch) filterFees(state.feeSearch);
  runCountUps(p); animateDonuts(p); animateBars(p); animateLine(p);
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
  '<div class="card"><h3>' + t('feeTrend') + '</h3><p class="card-sub">' + esc(db.profile.name) + ' — ' + feeRangeLabel() + ' (' + t('collectedW') + ' / ' + t('pendingW') + ')</p><div class="chart-box">' + barChartSVG(feeChartData()) + '</div><p class="muted" style="margin-top:8px"><span style="color:' + BLUE + '">■</span> ' + t('collectedW') + ' &nbsp; <span style="color:' + ORANGE + '">■</span> ' + t('pendingW') + '</p></div></div>' +
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
    db = seedDB();
    if (state.user && state.user.role === 'school') applySchoolProfile(db, state.user);
    saveDB(db);
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
  var logoHtml = db.profile.logo ? '<img class="dash-logo" src="' + esc(db.profile.logo) + '" alt="">' : '';
  return '<div class="page-head"><div class="prof-head">' + logoHtml + '<div><h2>' + t('schoolDashboard') + '</h2><p>' + esc(db.profile.name) + ', ' + esc(db.profile.city) + '</p></div></div>' +
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
  if (state.profileStudent) return studentProfilePage(state.profileStudent);
  var st = studentStats();
  var list = stuSorted(stuFiltered());
  var pages = stuPageCount(list);
  var rows = stuPageRows(list);
  var sortArrow = function (col) { return state.stuSort === col ? (state.stuSortDir === 1 ? ' ▲' : ' ▼') : ''; };
  var trs = rows.map(function (s) {
    var fs = studentFeeStatus(s.id);
    var stt = s.status || 'Active';
    var badgeCls = stt === 'Active' ? 'green' : stt === 'Inactive' ? 'grey' : stt === 'Draft' ? 'blue' : 'red';
    return '<tr><td>' + avatarHTML(s.photo, s.name, 'mini-avatar') + '<button class="linklike" onclick="openStudentProfile(\'' + s.id + '\')">' + esc(s.name) + '</button></td>' +
      '<td>' + esc(s.admissionNo || '—') + '</td><td>' + esc(s.cls) + '</td><td>' + s.roll + '</td><td>' + esc(s.fatherName || s.guardian) + '</td><td>' + esc(s.phone) + '</td><td>' + s.att + '%</td>' +
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
    '<div class="card" style="margin-top:16px"><div class="tbl-wrap"><table><thead><tr>' +
    '<th onclick="sortStu(\'name\')" style="cursor:pointer">' + t('thName') + sortArrow('name') + '</th>' +
    '<th>' + t('thAdmNo') + '</th>' +
    '<th onclick="sortStu(\'class\')" style="cursor:pointer">' + t('thClass') + sortArrow('class') + '</th>' +
    '<th>' + t('thRoll') + '</th><th>' + t('thFather') + '</th><th>' + t('thPhone') + '</th>' +
    '<th onclick="sortStu(\'att\')" style="cursor:pointer">' + t('thAtt') + sortArrow('att') + '</th>' +
    '<th>' + t('thFee') + '</th><th>' + t('thStatus') + '</th><th>' + t('actionsW') + '</th></tr></thead><tbody>' +
    (trs || '<tr><td colspan="10"><div class="empty">' + t('tNoMatch') + '</div></td></tr>') + '</tbody></table></div>' +
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
function studentForm(id) {
  pendingPhoto = null;
  admEditingId = id || null;
  var s = id ? db.students.find(function (x) { return x.id === id; }) : null;
  var d = s ? (s.documents || {}) : {};
  var clsPart = s ? classPartOf(s.cls) : '6th';
  var secPart = s ? sectionOf(s.cls) : 'A';
  var clsOpts = classParts().map(function (c) { return '<option ' + (c === clsPart ? 'selected' : '') + '>' + c + '</option>'; }).join('');
  var secOpts = SECTIONS.map(function (x) { return '<option ' + (x === secPart ? 'selected' : '') + '>' + x + '</option>'; }).join('');
  var sessOpts = SESSIONS.map(function (x) { return '<option ' + ((s ? s.session : db.profile.session) === x ? 'selected' : '') + '>' + x + '</option>'; }).join('');
  var genOpts = [''].concat(GENDERS).map(function (g) { return '<option value="' + g + '" ' + ((s && s.gender === g) ? 'selected' : '') + '>' + (g || '—') + '</option>'; }).join('');
  var bloodOpts = [''].concat(BLOOD_GROUPS).map(function (b) { return '<option value="' + b + '" ' + ((s && s.bloodGroup === b) ? 'selected' : '') + '>' + (b || '—') + '</option>'; }).join('');
  var catOpts = [''].concat(CATEGORIES).map(function (c) { return '<option value="' + c + '" ' + ((s && s.category === c) ? 'selected' : '') + '>' + (c || '—') + '</option>'; }).join('');
  var admNo = s ? (s.admissionNo || '') : nextAdmNo(true);
  var admDate = s ? (s.admissionDate || '') : todayIST();
  var rollVal = s ? s.roll : nextRoll(clsPart + '-' + secPart);
  openModal('<h3>' + (s ? t('editStudent') : t('addStudent')) + '</h3>' +
    '<div id="fStErr" class="err hidden"></div>' +
    '<form onsubmit="return saveStudent(event,\'' + (id || '') + '\')"><div class="form-grid">' +
    '<div class="full sec-title">' + t('secPersonal') + '</div>' +
    '<div><label>' + t('fStudentName') + ' *</label><input id="fStName" required value="' + esc(s ? s.name : '') + '" placeholder="e.g. Aarav Kumar"></div>' +
    '<div><label>' + t('fDob') + '</label><input id="fStDob" type="date" value="' + esc(s ? (s.dob || '') : '') + '"></div>' +
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
    '<div><label>' + t('fPrevSchool') + '</label><input id="fStPrevSchool" value="' + esc(s ? (s.previousSchool || '') : '') + '"></div>' +
    '<div><label>' + t('fPrevClass') + '</label><input id="fStPrevClass" value="' + esc(s ? (s.previousClass || '') : '') + '"></div>' +
    '<div class="full sec-title">' + t('secParent') + '</div>' +
    '<div><label>' + t('fFather') + '</label><input id="fStFather" value="' + esc(s ? (s.fatherName || '') : '') + '" placeholder="Mr. Sharma"></div>' +
    '<div><label>' + t('fMother') + '</label><input id="fStMother" value="' + esc(s ? (s.motherName || '') : '') + '" placeholder="Mrs. Sharma"></div>' +
    '<div><label>' + t('fGuardian') + '</label><input id="fStG" value="' + esc(s ? s.guardian : '') + '" placeholder="Mr. Sharma"></div>' +
    '<div><label>' + t('fPhone') + ' *</label><input id="fStPh" value="' + esc(s ? s.phone : '') + '" placeholder="98XXXXXXXX"></div>' +
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
    Object.assign(s, data);
    s.status = mode === 'draft' ? 'Draft' : 'Active';
    if (pendingPhoto !== null) { if (pendingPhoto) s.photo = pendingPhoto; else delete s.photo; }
    logAudit('Student updated', s.name + ' • ' + (s.admissionNo || '') + ' • ' + s.cls);
    toast(t('tStudentUpdated'));
  } else {
    var nid = 'stu' + Date.now();
    var admNo = nextAdmNo();
    var newStu = Object.assign({ id: nid, att: 100, result: 0, fee: 'Pending', enr: nextEnr(), admissionNo: admNo, status: mode === 'draft' ? 'Draft' : 'Active' }, data);
    if (pendingPhoto) newStu.photo = pendingPhoto;
    db.students.push(newStu);
    if (mode !== 'draft') {
      db.feeRecords.push({ id: 'fee' + Date.now(), studentId: nid, student: name, cls: cls,
        month: new Date().toLocaleString('en', { month: 'short' }), type: 'Tuition', amount: 6000, status: 'Pending', date: todayIST() });
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
    '<button class="btn ghost" onclick="closeModal();toast(t(\'idCardSoon\'))">🪪 ' + t('actIdCard') + ' <span class="muted">(' + t('phase3W') + ')</span></button>' +
    '<button class="btn ghost" onclick="closeModal();downloadStudentCSV(\'' + s.id + '\')">' + t('actDownload') + '</button>' +
    '<button class="btn ghost" onclick="closeModal();transferStudent(\'' + s.id + '\')">' + t('actTransfer') + '</button>' +
    toggleBtn +
    '<button class="btn danger" onclick="closeModal();deleteStudent(\'' + s.id + '\')">' + t('deleteBtn') + '</button>' +
    '</div>');
}
function viewStudentAttendance(id) {
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) return;
  state.attCls = s.cls;
  go('attendance');
}
function viewStudentFees(id) {
  state.view = 'fees'; state.feeStudent = id;
  renderApp();
}
function viewStudentResults(id) {
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) return;
  var ex = db.exams.find(function (e) { return e.cls === s.cls; });
  if (ex) state.examId = ex.id;
  go('exams');
}
function transferStudent(id) {
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
function deactivateStudent(id) {
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
  state.profileStudent = id; state.profileTab = 'overview';
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
  return '<div class="page-head"><div class="prof-head">' + avatarHTML(s.photo, s.name, 'big-avatar') + '<div><h2>' + esc(s.name) + '</h2><p>' + esc(s.cls) + ' • ' + t('thAdmNo') + ' ' + esc(s.admissionNo || '—') + ' • ' + t('thEnr') + ' ' + esc(s.enr || '—') + ' • <span class="badge ' + badgeCls + '">' + stt + '</span></p></div></div>' +
    '<div class="toolbar"><button class="btn ghost" onclick="state.profileStudent=null;renderPage()">← ' + t('backDir') + '</button>' +
    '<button class="btn" onclick="studentForm(\'' + s.id + '\')">' + t('editStudent') + '</button></div></div>' +
    tabBar + '<div style="margin-top:16px">' + profileTabBody(s, state.profileTab || 'overview') + '</div>';
}
function profileTabBody(s, tab) {
  var d = s.documents || {};
  var kv = function (label, val) { return '<div class="kv"><b>' + label + '</b><span>' + val + '</span></div>'; };
  if (tab === 'personal') {
    return '<div class="card">' + kv(t('fStudentName'), esc(s.name)) + kv(t('fDob'), esc(s.dob || '—')) + kv(t('fGender'), esc(s.gender || '—')) + kv(t('fBlood'), esc(s.bloodGroup || '—')) + kv(t('fCategory'), esc(s.category || '—')) + kv(t('fAddress'), esc(s.address || '—')) + kv(t('fState'), esc(s.state || '—')) + kv(t('fDistrict'), esc(s.district || '—')) + kv(t('fPin'), esc(s.pin || '—')) + kv(t('fAadhaar'), maskAadhaar(s.aadhaar)) + '</div>';
  }
  if (tab === 'parent') {
    return '<div class="card">' + kv(t('fFather'), esc(s.fatherName || '—')) + kv(t('fMother'), esc(s.motherName || '—')) + kv(t('fGuardian'), esc(s.guardian)) + kv(t('fPhone'), esc(s.phone)) + kv(t('fPhone2'), esc(s.mobile2 || '—')) + kv(t('fParentEmail'), esc(s.parentEmail || '—')) + kv(t('fOccupation'), esc(s.occupation || '—')) + '</div>';
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
    return '<div class="card"><p class="muted">' + t('attPct') + ': <b>' + s.att + '%</b>' + (rows.length > 30 ? ' • ' + t('showingRec') + ' 30 ' + t('ofRec') + ' ' + rows.length : '') + '</p><div class="tbl-wrap"><table><thead><tr><th>' + t('thDate') + '</th><th>' + t('thClass') + '</th><th>' + t('thStatus') + '</th></tr></thead><tbody>' + (trs || '<tr><td colspan="3"><div class="empty">' + t('noAttRecs') + '</div></td></tr>') + '</tbody></table></div></div>';
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
      '<div class="card" style="margin-top:16px"><h3>' + t('feeRecsH') + '</h3><div class="tbl-wrap"><table><thead><tr><th>' + t('thMonth') + '</th><th>' + t('thType') + '</th><th>' + t('thAmount') + '</th><th>' + t('thDate') + '</th><th>' + t('thStatus') + '</th></tr></thead><tbody>' + (frs || '<tr><td colspan="5"><div class="empty">' + t('tNoFeeRecs') + '</div></td></tr>') + '</tbody></table></div>' +
      '<div class="toolbar" style="margin-top:12px"><button class="btn" onclick="viewStudentFees(\'' + s.id + '\')">' + t('openFees') + '</button></div></div>';
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
    statCard('📊', 'blue', t('attPct'), s.att, '', 'up', { suffix: '%' }) +
    statCard('💰', 'green', t('feeSt'), pendAmt, '', pendAmt ? 'down' : 'up', { prefix: '₹' }) +
    statCard('📝', 'orange', t('latestExam'), lex ? lex.pct : 0, lex ? lex.name : '', 'up', { suffix: '%' }) +
    statCard('📚', 'red', t('hwPending'), hwPend, '', 'up') +
    '</div>' +
    '<div class="card">' + kv(t('fGuardian'), esc(s.guardian)) + kv(t('fPhone'), esc(s.phone)) + kv(t('fAdmNo'), esc(s.admissionNo || '—')) + kv(t('thEnr'), esc(s.enr || '—')) + kv(t('fAdmDate'), esc(s.admissionDate || '—')) + kv(t('fSession'), esc(s.session || '—')) + kv(t('thStatus'), esc(s.status || 'Active')) + '</div>';
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
      '<td>' + (r.status === 'Pending' ? '<button class="btn green sm" onclick="collectFee(\'' + r.id + '\')">' + t('collectBtn') + '</button>' : '<span class="muted">—</span>') + '</td></tr>';
  }).join('');
  return '<div class="page-head"><div><h2>' + t('fees') + '</h2><p>' + t('collectedW') + ' ' + inr(ft.collected) + ' • ' + t('pendingW') + ' ' + inr(ft.pending) + ' (' + feeRangeLabel() + ')</p></div>' +
    '<div class="toolbar"><div class="pill-tabs">' + ['All', 'Pending', 'Collected'].map(function (x) {
      return '<button class="' + (f === x ? 'on' : '') + '" onclick="state.feeFilter=\'' + x + '\';renderPage()">' + (x === 'All' ? t('allW') : x === 'Pending' ? t('pendingW') : t('collectedW')) + '</button>';
    }).join('') + '</div>' +
    '<select onchange="state.feeType=this.value;renderPage()" aria-label="Fee type">' + typeOpts + '</select>' +
    '<input id="feeSearchInput" placeholder="' + t('searchFee') + '" value="' + esc(state.feeSearch) + '" oninput="state.feeSearch=this.value;filterFees(this.value)" style="min-width:200px">' +
    '<button class="btn ghost" onclick="printFeeList()">🖨 ' + t('printList') + '</button></div></div>' +
    '<div class="stats">' +
    statCard('💰', 'orange', t('feeCollected'), ft.collected, '↑ 78%', 'up', { prefix: '₹' }) +
    statCard('⏰', 'red', t('pendingFee'), ft.pending, '', 'down', { prefix: '₹' }) +
    '</div>' +
    '<div class="card"><h3>' + t('feeByType') + '</h3><p class="card-sub">' + t('feeByTypeSub') + '</p><div class="type-rows">' + (btRows || '<div class="empty">' + t('tNoFeeRecs') + '</div>') + '</div></div>' +
    '<div class="card"><h3>' + t('feeTrend') + '</h3><p class="card-sub">' + feeRangeLabel() + ' (' + t('collectedW') + ' / ' + t('pendingW') + ')</p><div class="chart-box">' + barChartSVG(feeChartData()) + '</div><p class="muted" style="margin-top:8px"><span style="color:' + BLUE + '">■</span> ' + t('collectedW') + ' &nbsp; <span style="color:' + ORANGE + '">■</span> ' + t('pendingW') + '</p></div>' +
    '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('thStudent') + '</th><th>' + t('thEnr') + '</th><th>' + t('thClass') + '</th><th>' + t('thMonth') + '</th><th>' + t('thType') + '</th><th>' + t('thAmount') + '</th><th>' + t('thDate') + '</th><th>' + t('thStatus') + '</th><th>' + t('thAction') + '</th></tr></thead><tbody id="feeBody">' +
    (rows || '<tr><td colspan="9"><div class="empty">' + t('tNoMatch') + '</div></td></tr>') + '<tr id="feeNoMatch" style="display:none"><td colspan="9"><div class="empty">' + t('tNoMatch') + '</div></td></tr></tbody></table></div>' +
    '<p class="muted" id="feeCount" style="margin-top:10px">' + t('showingRec') + ' ' + Math.min(120, list.length) + ' ' + t('ofRec') + ' ' + list.length + ' ' + t('recordsWord') + '</p></div>' +
    feeFormCard() + feeStructureCard();
}

/* ================= student fee profile ================= */
function openFeeProfile(sid, e) {
  if (e) e.preventDefault();
  state.feeStudent = sid;
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
      '<td>' + (r.status === 'Pending' ? '<button class="btn green sm" onclick="collectFee(\'' + r.id + '\')">' + t('collectBtn') + '</button>' : '<span class="muted">—</span>') + '</td></tr>';
  }).join('');
  return '<div class="page-head"><div class="prof-head">' + avatarHTML(s.photo, s.name, 'big-avatar') + '<div><h2>' + esc(s.name) + '</h2><p>' + t('thClass') + ' ' + esc(s.cls) + ' • ' + t('thEnr') + ' ' + esc(s.enr || '—') + ' • ' + t('thGuardian') + ' ' + esc(s.guardian) + ' • ' + t('thPhone') + ' ' + esc(s.phone) + '</p><p class="muted">' + t('feeProfileSub') + '</p></div></div>' +
    '<div class="toolbar"><button class="btn ghost" onclick="state.feeStudent=null;renderPage()">← ' + t('backFees') + '</button>' +
    '<button class="btn" onclick="openAddFeeFor(\'' + s.id + '\')">+ ' + t('addFee') + '</button>' +
    '<button class="btn ghost" onclick="printStudentStatement(\'' + s.id + '\')">🖨 ' + t('printStmt') + '</button></div></div>' +
    '<div class="stats">' +
    statCard('🧾', 'blue', t('totalBilled'), billed, '', 'up', { prefix: '₹' }) +
    statCard('✅', 'green', t('totalPaid'), paid, '', 'up', { prefix: '₹' }) +
    statCard('⏰', 'red', t('totalPending'), pend, '', 'down', { prefix: '₹' }) +
    '</div>' +
    '<div class="card"><h3>' + t('feeByType') + '</h3><p class="card-sub">' + t('feeByTypeSub') + '</p><div class="type-rows">' + (btRows || '<div class="empty">' + t('tNoFeeRecs') + '</div>') + '</div></div>' +
    '<div class="card"><h3>' + t('feeRecsH') + '</h3><p class="card-sub">' + recs.length + ' ' + t('recordsWord') + '</p><div class="tbl-wrap"><table><thead><tr><th>' + t('thMonth') + '</th><th>' + t('thType') + '</th><th>' + t('thAmount') + '</th><th>' + t('thDate') + '</th><th>' + t('thStatus') + '</th><th>' + t('thAction') + '</th></tr></thead><tbody>' + (rows || '<tr><td colspan="6"><div class="empty">' + t('tNoFeeRecs') + '</div></td></tr>') + '</tbody></table></div></div>';
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
  return '<div class="card"><div class="head-row"><div><h3>' + t('feeStruct') + '</h3><p class="card-sub">' + t('feeStructSub') + '</p></div><button class="btn sm" onclick="saveFeeStructure()">' + t('saveStruct') + '</button></div>' +
    '<div class="tbl-wrap"><table><thead><tr><th>' + t('thClass') + '</th><th>' + t('thType') + '</th><th>' + t('fAmount') + '</th><th>' + t('thAction') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
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
  for (var i = 0; i < rows.length; i++) {
    var inp = $('fsAmt-' + i);
    if (!inp) continue;
    var v = parseFloat(inp.value);
    if (isNaN(v) || v < 0) { toast(t('tAmtPositive')); return; }
    rows[i].amount = v;
  }
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
  if (pendingLogo !== null) { if (pendingLogo) p.logo = pendingLogo; else delete p.logo; pendingLogo = null; }
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
  return '<div class="phone"><div class="card"><div class="stu-hero">' + avatarHTML(me.photo, me.name, 'avatar') + '</div>' +
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
  if (!restoreSession()) showLogin();
  if ('serviceWorker' in navigator && window.location.protocol.indexOf('http') === 0) {
    try {
      navigator.serviceWorker.register('sw.js').then(function () { /* PWA ready */ }).catch(function () { /* offline mode still works without SW */ });
    } catch (e) { /* ignore — app works without SW */ }
  }
});
