// tests/timetable.test.mjs — weekly class timetable (timetable feature).
//
// Data model: db.timetable rows { id, cls, day 1-6 (Mon-Sat), period 1-8,
// subject, teacher } — one subject per class-slot. Local-first like
// holidays: emptyDb() starts empty, migrateTimetable() adds/dedupes the
// list on load, sbMapTimetable() maps to ss_timetable (SQL 55), and the
// outbox/pull/verify/guard all cover the table through SB_SYNC_TABLES.
// The page renders a Mon-Sat x periods 1-8 grid per class; the school
// admin edits every class, a teacher edits only their own classes, and
// principal / student / parent read only (student/parent: own class).
// Run: npm test   (node --test, Node built-ins only)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAppContext } from './harness.mjs';

const TT_ROW = { id: 'tt-1', cls: '10th-A', day: 1, period: 2, subject: 'Mathematics', teacher: 'Sunita Sharma' };
const TT_ROW_9A = { id: 'tt-2', cls: '9th-A', day: 1, period: 2, subject: 'Biology-9ONLY', teacher: 'Anita Verma' };

function appWithTimetable(rows = [TT_ROW]) {
  const app = createAppContext();
  app.run('db = seedDB(); saveDB(db);');
  app.run(`db.timetable = ${JSON.stringify(rows)}; saveDB(db);`);
  return app;
}

function schoolPage(app, cls = '10th-A') {
  app.run(`state.role = 'school'; state.user = { email: 'test@school.in', name: 'Test School' }; state.view = 'timetable'; state.ttCls = '${cls}';`);
  return app.run('timetablePage()');
}

describe('timetable data model + migration', () => {
  it('emptyDb starts with an empty timetable list', () => {
    const app = createAppContext();
    assert.equal(app.run('JSON.stringify(emptyDb().timetable)'), '[]');
  });

  it('migrateTimetable adds the list to an older DB', () => {
    const app = createAppContext();
    assert.equal(app.run(`JSON.stringify(migrateTimetable({}).timetable)`), '[]');
    assert.equal(app.run(`JSON.stringify(migrateTimetable({ timetable: undefined }).timetable)`), '[]');
  });

  it('migrateTimetable dedupes a double-booked slot and drops invalid rows', () => {
    const app = createAppContext();
    const out = app.run(`migrateTimetable({ timetable: [
      { id: 'a', cls: '6th-A', day: 1, period: 1 },
      { id: 'b', cls: '6th-A', day: 1, period: 1 },
      { id: 'c', cls: '6th-A', day: 2, period: 1 },
      { id: 'd', cls: '', day: 1, period: 1 },
      { id: 'e', cls: '6th-A', day: 0, period: 1 },
      { id: 'f', cls: '6th-A', day: 1, period: 0 },
    ] }).timetable`);
    assert.equal(out.length, 2);
    assert.equal(app.run(`JSON.stringify(migrateTimetable({ timetable: [
      { id: 'a', cls: '6th-A', day: 1, period: 1 },
      { id: 'b', cls: '6th-A', day: 1, period: 1 },
      { id: 'c', cls: '6th-A', day: 2, period: 1 },
      { id: 'd', cls: '', day: 1, period: 1 },
      { id: 'e', cls: '6th-A', day: 0, period: 1 },
      { id: 'f', cls: '6th-A', day: 1, period: 0 },
    ] }).timetable.map(function (r) { return r.id; }))`), '["a","c"]');
  });

  it('a load of an older DB gains the timetable list (full migrate chain)', () => {
    const app = createAppContext();
    app.run(`localStorage.setItem(DB_KEY, JSON.stringify({ v: 2, profile: { name: 'T', city: 'C', session: '2025–26' } }))`);
    const loaded = app.run('loadDB()');
    assert.ok(Array.isArray(loaded.timetable));
    assert.equal(loaded.timetable.length, 0);
  });
});

describe('timetable sync mapping', () => {
  it('sbMapTimetable maps the local row to the server payload', () => {
    const app = createAppContext();
    assert.equal(
      app.run(`JSON.stringify(sbMapTimetable(${JSON.stringify(TT_ROW)}, 'srv-school-100'))`),
      JSON.stringify({ school_id: 'srv-school-100', local_id: 'tt-1', cls: '10th-A', day_of_week: 1, period: 2, subject: 'Mathematics', teacher: 'Sunita Sharma' }),
    );
  });

  it('ss_timetable is registered in the sync tables and deletable', () => {
    const app = createAppContext();
    assert.equal(app.get('SB_SYNC_TABLES').ss_timetable.local, 'timetable');
    assert.equal(app.get('SB_SYNC_TABLES').ss_timetable.key, 'id');
    assert.ok(app.get('SB_SYNC_DELETABLE').indexOf('ss_timetable') !== -1);
    assert.equal(app.get('SB_CONFLICT_TABLE_LABELS').ss_timetable, 'Timetable');
  });

  it('the sync counts and hashes include timetable rows', () => {
    const app = appWithTimetable();
    assert.equal(app.run('sbLocalCountsReal(db).timetable'), 1);
    const hash = app.run(`sbSyncTableHashes(db, 'srv-school-100', { stu: {}, exam: {} }).ss_timetable['tt-1'].hash`);
    assert.equal(hash, app.run(`JSON.stringify(sbMapTimetable(${JSON.stringify(TT_ROW)}, 'srv-school-100'))`));
    app.run(`db.timetable = []; saveDB(db);`);
    assert.equal(app.run('sbLocalCountsReal(db).timetable'), 0);
  });
});

describe('timetable slot rules (pure helpers)', () => {
  it('TT_DAYS is Mon-Sat and TT_PERIODS is 8', () => {
    const app = createAppContext();
    assert.equal(app.run('JSON.stringify(TT_DAYS)'), '[1,2,3,4,5,6]');
    assert.equal(app.get('TT_PERIODS'), 8);
    assert.equal(app.run('ttDayLabel(1)'), 'Monday');
    assert.equal(app.run('ttDayLabel(6)'), 'Saturday');
  });

  it('timetableSlotTaken refuses a double-booked slot, allows the rest', () => {
    const app = appWithTimetable();
    assert.equal(app.run(`timetableSlotTaken('10th-A', 1, 2, null)`), true);
    assert.equal(app.run(`timetableSlotTaken('10th-A', 1, 3, null)`), false);
    assert.equal(app.run(`timetableSlotTaken('10th-A', 2, 2, null)`), false);
    assert.equal(app.run(`timetableSlotTaken('9th-A', 1, 2, null)`), false);
    // Editing the row itself does not count as a clash.
    assert.equal(app.run(`timetableSlotTaken('10th-A', 1, 2, 'tt-1')`), false);
  });

  it('timetableGrid places each entry at its day/period and nothing else', () => {
    const app = appWithTimetable([TT_ROW, TT_ROW_9A]);
    const grid = app.run(`timetableGrid('10th-A')`);
    assert.equal(grid[1][2].subject, 'Mathematics');
    assert.equal(grid[1][2].teacher, 'Sunita Sharma');
    assert.equal(grid[1][3], undefined);
    assert.equal(grid[2][2], undefined);
    // The 9th-A row never lands in the 10th-A grid.
    assert.equal(JSON.stringify(app.run(`timetableGrid('10th-A')`)).indexOf('Biology-9ONLY'), -1);
  });

  it('classInUse blocks deleting a class that has timetable rows', () => {
    // 12th-A has no fixture students/teachers/exams/homework, so the
    // timetable row is the first blocker the check meets.
    const app = appWithTimetable([{ id: 'tt-12', cls: '12th-A', day: 1, period: 1, subject: 'Physics', teacher: '' }]);
    assert.ok(app.run(`classInUse('12th-A')`).indexOf('Timetable') !== -1);
    assert.equal(app.run(`classInUse('12th-B')`), null);
  });
});

describe('timetablePage rendering', () => {
  it('school admin sees the weekly grid with the entry and add controls', () => {
    const app = appWithTimetable([TT_ROW, TT_ROW_9A]);
    const html = schoolPage(app);
    assert.ok(html.indexOf('Timetable') !== -1);
    assert.ok(html.indexOf('Monday') !== -1 && html.indexOf('Saturday') !== -1);
    assert.ok(html.indexOf('Mathematics') !== -1);
    assert.ok(html.indexOf('Sunita Sharma') !== -1);
    assert.ok(html.indexOf('Add Period') !== -1);
    assert.ok(html.indexOf('timetableForm(') !== -1);
    // The 9th-A row is not in the 10th-A grid.
    assert.equal(html.indexOf('Biology-9ONLY'), -1);
  });

  it('school admin sees the empty message when the class has no periods', () => {
    const app = appWithTimetable([]);
    const html = schoolPage(app);
    assert.ok(html.indexOf('No timetable yet for this class.') !== -1);
  });

  it('a student sees only their own class, read-only', () => {
    const app = appWithTimetable([TT_ROW, TT_ROW_9A]);
    app.run(`state.role = 'student'; state.user = { studentId: 'stu33' }; state.view = 'timetable';`);
    const html = app.run('timetablePage()');
    assert.ok(html.indexOf('Mathematics') !== -1);
    assert.equal(html.indexOf('Biology-9ONLY'), -1);
    assert.equal(html.indexOf('Add Period'), -1);
    assert.equal(html.indexOf('timetableForm('), -1);
    assert.equal(html.indexOf('editTimetable('), -1);
  });

  it('a parent sees only their child’s class, read-only', () => {
    const app = appWithTimetable([TT_ROW, TT_ROW_9A]);
    app.run(`state.role = 'parent'; state.user = { studentId: 'stu33' }; state.view = 'timetable';`);
    const html = app.run('timetablePage()');
    assert.ok(html.indexOf('Mathematics') !== -1);
    assert.equal(html.indexOf('Biology-9ONLY'), -1);
    assert.equal(html.indexOf('Add Period'), -1);
  });

  it('a teacher sees only their assigned class, with edit controls', () => {
    const app = appWithTimetable([TT_ROW, TT_ROW_9A]);
    // t1 (Sunita Sharma) teaches 10th-A in the fixtures.
    app.run(`state.role = 'teacher'; state.user = { teacherId: 't1' }; state.view = 'timetable';`);
    const html = app.run('timetablePage()');
    assert.ok(html.indexOf('Mathematics') !== -1);
    assert.equal(html.indexOf('Biology-9ONLY'), -1);
    assert.ok(html.indexOf('Add Period') !== -1);
  });

  it('a principal sees the grid read-only', () => {
    const app = appWithTimetable();
    app.run(`state.role = 'principal'; state.user = { email: 'p@school.in' }; state.view = 'timetable'; state.ttCls = '10th-A';`);
    const html = app.run('timetablePage()');
    assert.ok(html.indexOf('Mathematics') !== -1);
    assert.equal(html.indexOf('Add Period'), -1);
    assert.equal(html.indexOf('editTimetable('), -1);
  });

  it('the timetable view is in NAV and PERMS for school, teacher, student, parent and principal', () => {
    const app = createAppContext();
    for (const role of ['school', 'teacher', 'student', 'parent', 'principal']) {
      assert.ok(app.run(`NAV['${role}'].some(function (n) { return n[0] === 'timetable'; })`), `NAV ${role} misses timetable`);
      assert.ok(app.run(`canAccessView('${role}', 'timetable')`), `PERMS ${role} misses timetable`);
    }
    for (const role of ['accountant', 'staff', 'superadmin']) {
      assert.equal(app.run(`canAccessView('${role}', 'timetable')`), false, `PERMS ${role} must not open timetable`);
    }
  });
});

describe('timetable i18n', () => {
  it('EN keys exist for the timetable strings (v147: English-only)', () => {
    const app = createAppContext();
    assert.equal(app.run(`t('timetable')`), 'Timetable');
    assert.equal(app.run(`t('subTimetable')`), 'Weekly timetable by class');
    assert.equal(app.run(`t('addTimetable')`), 'Add Period');
    assert.equal(app.run(`t('dayMon')`), 'Monday');
    assert.equal(app.run(`t('daySat')`), 'Saturday');
    assert.equal(app.run(`t('tTtSlotTaken')`), 'This day and period already has a subject for this class.');
  });
});
