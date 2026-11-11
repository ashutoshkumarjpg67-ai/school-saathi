// seed-fixtures.js — School Saathi test/harness fixtures ONLY (Phase D, audit L-8).
//
// Moved verbatim out of app.js (v67): the demo seed set — 24 fake platform
// schools, 40 students (6th-10th), 12 teachers, fee records, exams, marks,
// homework, notices — plus the St. Xavier demo profile. NOTHING in this
// file may populate a real school: since v36 no app path calls seedDB(),
// and the boot path never seeds either (a fresh device starts empty).
// It lives on ONLY because (a) the external harness asserts against these
// fixtures, and (b) the v45 demo-seed quarantine fingerprints are
// precomputed from exactly this set (see SB_SEED_FINGERPRINTS in app.js —
// regenerate that table if this file ever changes).
//
// Load AFTER app.js in the harness VM (seedDB needs its globals
// FEE_MONTHS, defaultFeeStructure, todayIST). In node:
//   const { seedDB } = require('./seed-fixtures');  // after loading app.js the same way
// This file is NOT loaded by index.html and NOT precached by sw.js.

// Seed platform schools. INVARIANT (v30 — the v26 count mismatch): the
// account status and the plan must tell the same story, or every count
// derived from them disagrees. Allowed pairs only:
//   status 'active'  <-> plan 'Active' or 'Trial'   (account is live)
//   status 'pending' <-> plan 'Pending'             (awaiting approval)
//   status 'expired' <-> plan 'Expired'             (subscription lapsed)
// So: active-status == Active-plan + Trial-plan; expired == Expired;
// pending == Pending. The harness asserts this agreement.
var SCHOOL_NAMES = [
  ['St. Xavier School','Patna',1250,'active','Active'], ['DAV Public School','Gaya',1100,'active','Active'],
  ['Bright Future School','Muzaffarpur',980,'active','Active'], ['Holy Child School','Bhagalpur',860,'active','Active'],
  ['Sunrise Academy','Darbhanga',750,'active','Active'], ['Saraswati Vidya Mandir','Gopalganj',620,'active','Active'],
  ['Gyanlok Public School','Baliwan Sagar',500,'active','Trial'], ['St. Joseph\'s School','Siwan',940,'active','Active'],
  ['Delhi Public School','Patna',1480,'active','Active'], ['Notre Dame Academy','Patna',1120,'active','Active'],
  ['Kendriya Vidyalaya','Chhapra',890,'expired','Expired'], ['Bal Vidyapeeth','Hajipur',430,'active','Trial'],
  ['St. Mary\'s School','Motihari',760,'active','Active'], ['Rose Public School','Bettiah',540,'active','Active'],
  ['Modern Public School','Samastipur',690,'active','Active'], ['Vidya Niketan','Ara',610,'active','Active'],
  ['Little Scholars Public School','Siwan',380,'pending','Pending'], ['Gyan Jyoti Vidyalaya','Chhapra',290,'pending','Pending'],
  ['Carmel High School','Patna',1050,'active','Active'], ['Don Bosco Academy','Patna',980,'active','Active'],
  ['St. Karen\'s School','Patna',870,'expired','Expired'], ['Radiant Public School','Gopalganj',450,'active','Active'],
  ['Oxford Public School','Muzaffarpur',720,'expired','Expired'], ['Mount Carmel School','Gaya',660,'expired','Expired']
];
var FIRST = ['Aarav','Vivaan','Aditya','Arjun','Sai','Reyansh','Krishna','Ishaan','Rohan','Kabir','Ananya','Diya','Aadhya','Myra','Sara','Ira','Priya','Riya','Anika','Navya','Aarush','Vihaan','Aryan','Dhruv','Meera','Kavya','Sneha','Pooja','Nikhil','Varun','Rahul','Sana','Ishita','Tanvi','Yash','Om','Dev','Rudra','Aisha','Zara','Farhan','Imran','Nisha','Kiran','Manav','Shreya'];
var LAST = ['Kumar','Singh','Sharma','Verma','Gupta','Mishra','Tiwari','Yadav','Jha','Pandey','Choudhary','Ranjan','Srivastava','Dubey','Sinha','Patel','Das','Roy','Kumari','Devi'];
var GIRL_NAMES = ['Ananya', 'Diya', 'Aadhya', 'Myra', 'Sara', 'Ira', 'Priya', 'Riya', 'Anika', 'Navya', 'Meera', 'Kavya', 'Sneha', 'Pooja', 'Sana', 'Ishita', 'Tanvi', 'Aisha', 'Zara', 'Nisha', 'Shreya'];

// v37: the demo seed still covers only the original 6th–10th classes
// (40 students) — the fixture's counts, fee splits and harness
// assumptions stay exact. New classes get real students through
// admission, never through the seed.
var SEED_CLASSES = ['6th-A','6th-B','7th-A','7th-B','8th-A','8th-B','9th-A','9th-B','10th-A','10th-B'];

function seedDB() {
  // Phase D (L-8): moved out of app.js — test/harness fixtures ONLY.
  // Needs the app's globals (FEE_MONTHS, defaultFeeStructure(),
  // todayIST()), so load app.js first (the harness VM does). The
  // check below fails loudly instead of building a wrong fixture set.
  if (typeof FEE_MONTHS === 'undefined' || typeof defaultFeeStructure !== 'function' || typeof todayIST !== 'function') {
    throw new Error('seedDB needs app.js loaded first (FEE_MONTHS, defaultFeeStructure, todayIST)');
  }
  var schools = SCHOOL_NAMES.map(function (s, i) {
    return { id: 'sch' + (i + 1), name: s[0], city: s[1], students: s[2], status: s[3], plan: s[4],
      users: 180 + ((i * 137) % 900), since: '202' + (i % 5) + '-0' + ((i % 9) + 1) + '-15' };
  });
  // 40 students, 4 per class-section; first two are Riya & Priya (10th-A).
  // v37: the seed covers SEED_CLASSES only (6th–10th) — see CLASSES.
  var students = [];
  var fi = 0;
  SEED_CLASSES.forEach(function (cls, ci) {
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

// Node: let a harness require the fixtures directly (browser: `module`
// is undefined, so this is a no-op there).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { seedDB: seedDB, SCHOOL_NAMES: SCHOOL_NAMES, FIRST: FIRST, LAST: LAST, GIRL_NAMES: GIRL_NAMES, SEED_CLASSES: SEED_CLASSES };
}
