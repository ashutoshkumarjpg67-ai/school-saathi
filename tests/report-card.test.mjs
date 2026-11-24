// tests/report-card.test.mjs — printable report card / marksheet.
//
// buildReportCard() groups the ACTIVE exam rows that share one exam
// NAME in the student's class (one exam row = one subject paper in
// the stored model) and sums the marks the app already stores. No
// grade scale and no rank exist in the app, so the card shows
// subject-wise marks, total and percentage only.
// Run: npm test   (node --test, Node built-ins only)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAppContext } from './harness.mjs';

// Seed + two extra Half Yearly papers, so the exam name groups three
// subjects for 10th-A: the seeded 'All Subjects' paper (ex3) plus
// Mathematics and Science. stu33 has marks for all three, stu34 only
// for the seeded paper, stu35 for none of them.
function seededMultiSubject(app) {
  app.run('db = seedDB(); saveDB(db);');
  app.run(`db.exams.push({id:'exM2', name:'Half Yearly Exam', cls:'10th-A', subject:'Mathematics', date:'2026-10-06', total:100});
    db.exams.push({id:'exS2', name:'Half Yearly Exam', cls:'10th-A', subject:'Science', date:'2026-10-07', total:100});
    db.exams.push({id:'exD1', name:'Half Yearly Exam', cls:'10th-A', subject:'Hindi', date:'2026-10-08', total:100, deleted:true});
    db.marks.push({examId:'exM2', studentId:'stu33', marks:88});
    db.marks.push({examId:'exS2', studentId:'stu33', marks:76});
    db.marks.push({examId:'exD1', studentId:'stu33', marks:100});`);
}

function card(app, studentId, examName) {
  app.run(`rc = buildReportCard(db, '${studentId}', '${examName}')`);
  return app.get('rc');
}

describe('buildReportCard (stored marks only)', () => {
  it('groups one exam name into subject rows and totals them (seed + added papers)', () => {
    const app = createAppContext();
    seededMultiSubject(app);
    const rc = card(app, 'stu33', 'Half Yearly Exam');
    assert.ok(rc, 'expected a card');
    assert.equal(app.run('rc.rows.length'), 3);
    // Rows sort by subject: All Subjects, Mathematics, Science.
    assert.equal(app.run('rc.rows[0].subject'), 'All Subjects');
    assert.equal(app.run('rc.rows[0].marks'), 95);
    assert.equal(app.run('rc.rows[1].subject'), 'Mathematics');
    assert.equal(app.run('rc.rows[1].marks'), 88);
    assert.equal(app.run('rc.rows[2].subject'), 'Science');
    assert.equal(app.run('rc.rows[2].marks'), 76);
    assert.equal(app.run('rc.obtained'), 259);
    assert.equal(app.run('rc.maxTotal'), 300);
    assert.equal(app.run('rc.pct'), 86); // 259/300 rounded
    assert.equal(app.run('rc.entered'), 3);
    assert.equal(app.run('rc.missing'), 0);
    assert.equal(app.run('rc.cls'), '10th-A');
  });

  it('a deleted paper is excluded even when it has marks', () => {
    const app = createAppContext();
    seededMultiSubject(app);
    card(app, 'stu33', 'Half Yearly Exam');
    // Hindi (deleted, 100 marks) must not appear or inflate the total.
    assert.equal(app.run("rc.rows.map(function (r) { return r.subject; }).indexOf('Hindi')"), -1);
    assert.equal(app.run('rc.maxTotal'), 300);
  });

  it('a subject with no mark shows null and still counts in the max total', () => {
    const app = createAppContext();
    seededMultiSubject(app);
    card(app, 'stu34', 'Half Yearly Exam');
    assert.equal(app.run('rc.rows[0].marks'), 90); // All Subjects only
    assert.equal(app.run('rc.rows[1].marks'), null);
    assert.equal(app.run('rc.rows[2].marks'), null);
    assert.equal(app.run('rc.obtained'), 90);
    assert.equal(app.run('rc.maxTotal'), 300);
    assert.equal(app.run('rc.pct'), 30); // 90/300, not 90/100
    assert.equal(app.run('rc.entered'), 1);
    assert.equal(app.run('rc.missing'), 2);
  });

  it('no marks at all: percentage is null, not 0', () => {
    const app = createAppContext();
    seededMultiSubject(app);
    card(app, 'stu35', 'Half Yearly Exam');
    assert.equal(app.run('rc.obtained'), 0);
    assert.equal(app.run('rc.maxTotal'), 300);
    assert.equal(app.run('rc.pct'), null);
    assert.equal(app.run('rc.entered'), 0);
    assert.equal(app.run('rc.missing'), 3);
  });

  it('single-paper exam names work on the untouched seed (Unit Test 1)', () => {
    const app = createAppContext();
    app.run('db = seedDB(); saveDB(db);');
    card(app, 'stu33', 'Unit Test 1');
    assert.equal(app.run('rc.rows.length'), 1);
    assert.equal(app.run('rc.rows[0].subject'), 'Mathematics');
    assert.equal(app.run('rc.rows[0].marks'), 95);
    assert.equal(app.run('rc.rows[0].total'), 100);
    assert.equal(app.run('rc.obtained'), 95);
    assert.equal(app.run('rc.maxTotal'), 100);
    assert.equal(app.run('rc.pct'), 95);
  });

  it('returns null for an unknown student, an unknown exam, or a wrong class', () => {
    const app = createAppContext();
    app.run('db = seedDB(); saveDB(db);');
    assert.equal(app.run("buildReportCard(db, 'nobody', 'Unit Test 1')"), null);
    assert.equal(app.run("buildReportCard(db, 'stu33', 'No Such Exam')"), null);
    // stu33 is 10th-A; 'Monthly Test' exists only for 8th-B.
    assert.equal(app.run("buildReportCard(db, 'stu33', 'Monthly Test')"), null);
    assert.equal(app.run('buildReportCard(db, null, "Unit Test 1")'), null);
    assert.equal(app.run('buildReportCard(null, "stu33", "Unit Test 1")'), null);
  });

  it('no grade and no rank are computed — the card carries only marks/total/percentage', () => {
    const app = createAppContext();
    seededMultiSubject(app);
    card(app, 'stu33', 'Half Yearly Exam');
    assert.equal(app.run("('grade' in rc)"), false);
    assert.equal(app.run("('rank' in rc)"), false);
  });
});

describe('report card print HTML + Reports page', () => {
  it('print HTML carries school, student, subjects, total and percentage', () => {
    const app = createAppContext();
    seededMultiSubject(app);
    card(app, 'stu33', 'Half Yearly Exam');
    app.run('rcHtml = reportCardPrintHTML(rc)');
    const html = app.run('rcHtml');
    assert.match(html, /St\. Xavier School/);
    assert.match(html, /Riya Kumari/);
    assert.match(html, /Mathematics/);
    assert.match(html, /Science/);
    assert.match(html, /259 \/ 300/);
    assert.match(html, /86%/);
    assert.match(html, /ADM-2025-033/);
    assert.match(html, /Principal/);
  });

  it('printReportCard writes the card into #printArea (receipt pattern)', () => {
    const app = createAppContext();
    seededMultiSubject(app);
    // The harness stub returns a fresh element per getElementById call,
    // so pin a persistent #printArea object first.
    app.run(`window.__pa = { innerHTML: '' };
      document.getElementById = function (id) { return id === 'printArea' ? window.__pa : { innerHTML: '', addEventListener: function () {}, classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } }, style: {}, setAttribute: function () {} }; };`);
    app.run("printReportCard('stu33', 'Half Yearly Exam')");
    const html = app.run('window.__pa.innerHTML');
    assert.match(html, /print-stmt/);
    assert.match(html, /Riya Kumari/);
    assert.match(html, /259 \/ 300/);
  });

  it('Reports page shows the report card card to school + principal, not to the accountant', () => {
    const app = createAppContext();
    app.run('db = seedDB(); saveDB(db);');
    app.run("state.role = 'school'; state.rcCls = '10th-A'; state.rcExam = 'Unit Test 1'; state.rcStudent = 'stu33';");
    const schoolHtml = app.run('reportsPage()');
    assert.match(schoolHtml, /Report Card/);
    assert.match(schoolHtml, /Riya Kumari/);
    assert.match(schoolHtml, /Print Report Card/);
    assert.match(schoolHtml, /95 \/ 100/);
    app.run("state.role = 'principal';");
    assert.match(app.run('reportsPage()'), /Report Card/);
    app.run("state.role = 'accountant';");
    assert.doesNotMatch(app.run('reportsPage()'), /Report Card/);
  });

  it('report card labels exist in English (v147: English-only UI)', () => {
    const app = createAppContext();
    assert.equal(app.run("t('rcTitle')"), 'Report Card');
    assert.equal(app.run("t('rcPrint')"), 'Print Report Card');
    assert.equal(app.run("t('rcSubject')"), 'Subject');
    assert.equal(app.run("t('rcPercentage')"), 'Percentage');
  });
});
