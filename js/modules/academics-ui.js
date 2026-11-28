/* School Saathi — Exams, Homework, Timetable, Notices, Reports & Marksheets module (extracted from app.js in v175) */
/* ================= exams / homework / notices / reports / settings ================= */
function examsPage() {
  // B6: deleted exams never appear in the picker, the list or the
  // marks table — they live only in the "Deleted exams" card below
  // (school only), where they can be restored.
  var activeExams = db.exams.filter(isActiveExam);
  var ex = activeExams.find(function (e) { return e.id === state.examId; }) || activeExams[0];
  // v35: a teacher only ever sees exams for their own assigned classes.
  // v37: a teacher WITH classes but no exams in them falls through to
  // the "no exams yet" card below (with the Create button) — the old
  // code wrongly told them no classes were assigned at all.
  if (state.role === 'teacher') {
    var myClasses37 = teacherClasses();
    if (!myClasses37.length) return '<div class="page-head"><div><h2>' + t('exams') + '</h2></div></div><div class="card"><div class="empty">' + t('tchrNoClassesYet') + '</div></div>';
    var myExams35 = activeExams.filter(function (e) { return myClasses37.indexOf(e.cls) !== -1; });
    ex = myExams35.find(function (e) { return e.id === state.examId; }) || myExams35[0];
  }
  // v37: even with no exams yet, the school/teacher can create the first one.
  // v88: a principal sees only the empty card — no Create button.
  if (!ex) return '<div class="page-head"><div><h2>' + t('exams') + '</h2></div>' + (state.role === 'principal' ? '' : '<div class="toolbar"><button class="btn" onclick="examForm()">+ ' + t('createExam') + '</button></div>') + '</div><div class="card"><div class="empty">' + t('tNoExams') + '</div></div>' + deletedExamsSection();
  // v34 (P1-10): marks roster is enrolled students only — Cancelled/
  // Draft never get a marks row.
  var roster = db.students.filter(function (s) { return s.cls === ex.cls && isEnrolledStudent(s); });
  // One pass over db.marks (was a full scan per roster row for the mark
  // lookup, plus another full scan below for the average): first mark per
  // student wins, matching Array.find; the average counts every mark of
  // this exam, duplicates included, exactly as before.
  var examMarks = new Map(), avg = 0, n = 0;
  db.marks.forEach(function (m) {
    if (m.examId !== ex.id) return;
    avg += m.marks; n++;
    if (!examMarks.has(m.studentId)) examMarks.set(m.studentId, m);
  });
  var rows = roster.map(function (s) {
    var mk = examMarks.get(s.id);
    // v88: a principal sees the mark as text — no editable input.
    var markCell = state.role === 'principal' ? '<td>' + (mk ? '<b>' + mk.marks + '</b>' : '<span class="muted">—</span>') + ' / ' + ex.total + '</td>'
      : '<td><input type="number" min="0" step="0.5" max="' + ex.total + '" value="' + (mk ? mk.marks : '') + '" placeholder="—" style="width:90px" id="mk-' + s.id + '"> / ' + ex.total + '</td>';
    return '<tr><td><button class="linklike" onclick="openStudentProfile(\'' + s.id + '\')">' + esc(s.name) + '</button></td><td>' + s.roll + '</td>' +
      markCell +
      '<td>' + (mk ? '<b>' + Math.round(mk.marks / ex.total * 100) + '%</b>' : '<span class="muted">' + t('tNotEntered') + '</span>') + '</td></tr>';
  }).join('');
  var examList35 = state.role === 'teacher' ? activeExams.filter(function (e) { return teacherClasses().indexOf(e.cls) !== -1; }) : activeExams;
  var opts = examList35.map(function (e) { return '<option value="' + e.id + '" ' + (ex.id === e.id ? 'selected' : '') + '>' + esc(e.name) + ' — ' + esc(e.cls) + ' (' + esc(e.subject) + ')</option>'; }).join('');
  return '<div class="page-head"><div><h2>' + t('exams') + '</h2><p>' + esc(ex.name) + ' • ' + esc(ex.cls) + ' • ' + esc(ex.subject) + ' • ' + esc(ex.date) + '</p></div>' +
    '<div class="toolbar"><select onchange="state.examId=this.value;renderPage()">' + opts + '</select>' +
    (state.role === 'principal' ? '' : '<button class="btn" onclick="examForm()">+ ' + t('createExam') + '</button>' +
    '<button class="btn" onclick="editExam(\'' + ex.id + '\')">✎ ' + t('editExam') + '</button>' +
    (state.role === 'school' ? '<button class="btn danger" onclick="deleteExam(\'' + ex.id + '\')">🗑 ' + t('deleteExam') + '</button>' : '') +
    '<button class="btn green" onclick="saveMarks(\'' + ex.id + '\')">✓ ' + t('saveMarks') + '</button>') + '</div></div>' + // v88: a principal sees the exam picker + marks table only — no Create/Edit/Delete/Save
    '<div class="card"><div class="head-row"><div><h3>' + (state.role === 'principal' ? t('results') : t('enterMarks')) + '</h3><p class="card-sub">' + (n ? t('classAvg') + ': ' + Math.round(avg / n / ex.total * 100) + '% (' + n + ' ' + t('studentsMarked') + ')' : t('tNoMarks')) + '</p></div></div>' + // v88b: for a principal the card is "Results", not "Enter Marks"
    '<div class="tbl-wrap"><table><thead><tr><th>' + t('thStudent') + '</th><th>' + t('thRoll') + '</th><th>' + t('thMarks') + '</th><th>' + t('thResult') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' + bulkMarksCard100(ex) + deletedExamsSection();
}
function deletedExamsSection() {
  // B6: soft-deleted exams, school only, with a Restore button each.
  // Teachers never see deleted exams. The note states the linked-data
  // rule: marks are kept but hidden until the exam is restored.
  if (state.role !== 'school') return '';
  var del = db.exams.filter(function (e) { return !!e.deleted; });
  if (!del.length) return '';
  var rows = del.map(function (e) {
    return '<div class="hw-item"><div><b>' + esc(e.name) + '</b><span>' + esc(e.cls) + ' • ' + esc(e.subject) + ' • ' + esc(e.date) + '</span></div>' +
      '<button class="btn ml-auto" onclick="restoreExam(\'' + e.id + '\')">' + t('restoreExam') + '</button></div>';
  }).join('');
  return '<div class="card mt-16"><h3>' + t('examDeletedH') + '</h3><p class="card-sub">' + t('examDelNote') + '</p>' + rows + '</div>';
}
function saveMarks(examId) {
  var ex = db.exams.find(function (e) { return e.id === examId; });
  if (!ex || !isActiveExam(ex)) return; // B6: never enter marks on a deleted exam
  // v88: a principal is read-only — they never enter marks.
  if (state.role === 'principal') { toast(t('tNotAllowed')); return; }
  // v35: a teacher enters marks only for their own assigned class.
  if (state.role === 'teacher' && teacherClasses().indexOf(ex.cls) === -1) { toast(t('tNotAllowed')); return; }
  var saved = 0, removed = 0, removedNames = [], bad = [];
  var changes = []; // v62: {studentId, marks} — marks null clears an existing mark. Computed first, applied after the write lands.
  // A9 (M-25): one pass over db.marks into a Map (was a full scan per roster
  // student): key examId|studentId -> index, last match wins, matching
  // the old forEach scan. The Map is only read while collecting changes;
  // applyChanges rebuilds it after removals, so indexes never go stale.
  var marksByKey = new Map();
  db.marks.forEach(function (m, i) { marksByKey.set(m.examId + '|' + m.studentId, i); });
  // v34 (P1-10): new/updated marks are only saved for enrolled students
  // (Active/Inactive). An empty input still clears an EXISTING mark for
  // any student in the class — that is cleanup of a stale record, not a
  // new mark — so the roster filter never strands an old mark.
  db.students.filter(function (s) { return s.cls === ex.cls; }).forEach(function (s) {
    var inp = $('mk-' + s.id);
    if (!inp) return;
    var key = examId + '|' + s.id;
    var mkIdx = marksByKey.has(key) ? marksByKey.get(key) : -1;
    if (inp.value === '') {
      if (mkIdx !== -1) { changes.push({ studentId: s.id, marks: null }); removed++; removedNames.push(s.name); } // v123: empty = remove marks — a removal, never a save
      return;
    }
    if (!isEnrolledStudent(s)) return; // Cancelled/Draft: no new marks
    var v = parseFloat(inp.value);
    if (isNaN(v) || v < 0) { bad.push(s.name + ' (invalid)'); return; }
    if (v > ex.total) { bad.push(s.name + ' (over ' + ex.total + ')'); return; } // never silently clamp
    changes.push({ studentId: s.id, marks: v });
    saved++;
  });
  var applyChanges = function (list) {
    // Removals first, highest index first, so splices never shift an
    // index a later step still needs; then rebuild the Map once.
    var removals = [];
    list.forEach(function (c) {
      if (c.marks !== null) return;
      var key = examId + '|' + c.studentId;
      if (marksByKey.has(key)) removals.push(marksByKey.get(key));
    });
    removals.sort(function (a, b) { return b - a; }).forEach(function (i) { db.marks.splice(i, 1); });
    marksByKey.clear();
    db.marks.forEach(function (m, i) { marksByKey.set(m.examId + '|' + m.studentId, i); });
    list.forEach(function (c) {
      if (c.marks === null) return;
      var key = examId + '|' + c.studentId;
      var mkIdx = marksByKey.has(key) ? marksByKey.get(key) : -1;
      if (mkIdx !== -1) db.marks[mkIdx].marks = c.marks;
      else { db.marks.push({ examId: examId, studentId: c.studentId, marks: c.marks }); marksByKey.set(key, db.marks.length - 1); }
    });
  };
  var doneToast = function () {
    if (bad.length) toast(t('tNotSaved') + ': ' + bad.join(', ') + ' — ' + t('tCheckMarks') + ' (max ' + ex.total + ').');
    else if (saved) toast('✓ ' + t('tMarksSaved') + ' ' + saved + ' ' + t(saved === 1 ? 'tStudentWord' : 'tStudentsWord') + '.');
    else if (removed) toast('✓ ' + t('tMarksRemoved') + ' ' + removed + ' ' + t(removed === 1 ? 'tStudentWord' : 'tStudentsWord') + '.');
    else toast(t('tNoChanges'));
  };
  // v62: a cloud teacher writes through the server RPC (one call for the
  // whole save). The slice changes only after the server confirms, and
  // every student must resolve to a server id or the whole save aborts.
  // v98: a cloud staff member sets marks through the STAFF RPC (SQL 35).
  var mkToken98 = state.cloudTeacherToken || state.cloudStaffToken;
  var mkFn98 = state.cloudTeacherToken ? sbTeacherSetMarks : sbStaffSetMarks;
  if (mkToken98) {
    if (!ex.srvId) { toast(t('tNotSaved')); return; }
    var serverMarks = [];
    for (var ci = 0; ci < changes.length; ci++) {
      var cst = db.students.find(function (x) { return x.id === changes[ci].studentId; });
      if (!cst || !cst.srvId) { toast(t('tNotSaved')); return; }
      serverMarks.push({ student_id: cst.srvId, marks: changes[ci].marks });
    }
    mkFn98(mkToken98, ex.srvId, serverMarks).then(function (res) {
      if (!res || !res.ok) {
        if (res && res.error === 'bad_token') { toast(t('tCloudSessionExpired')); logout(); return; }
        toast(t('tNotSaved'));
        return;
      }
      applyChanges(changes);
      if (saved) sbLogAuditCloud(mkToken98, 'Marks saved', ex.name + ' • ' + ex.cls + ' • ' + saved + ' ' + (saved === 1 ? 'student' : 'students'), 'Marks saved', ex.name + ' • ' + ex.cls, '📝', 'blue');
      if (removed) sbLogAuditCloud(mkToken98, 'Marks removed', ex.name + ' • ' + ex.cls + ' • ' + removed + ' ' + (removed === 1 ? 'student' : 'students') + ' — ' + removedNames.join(', '), 'Marks removed', ex.name + ' • ' + ex.cls, '📝', 'blue');
      renderApp();
      doneToast();
    });
    return;
  }
  applyChanges(changes);
  // v97: a marks save never wrote an audit row (local or cloud) — the
  // Activity Log showed the exam being created, never the marks going
  // in. One save = one entry in each list, like attendance.
  if (saved) { logAudit('Marks saved', ex.name + ' • ' + ex.cls + ' • ' + saved + ' ' + (saved === 1 ? 'student' : 'students')); addActivity('📝', 'blue', 'Marks saved', ex.name + ' • ' + ex.cls); }
  if (removed) { logAudit('Marks removed', ex.name + ' • ' + ex.cls + ' • ' + removed + ' ' + (removed === 1 ? 'student' : 'students') + ' — ' + removedNames.join(', ')); addActivity('📝', 'blue', 'Marks removed', ex.name + ' • ' + ex.cls); }
  saveDB(db); renderApp();
  doneToast();
}
function fillAllMarks(examId) {
  // v100: fill every marks input with one value — the teacher still
  // taps Save Marks, so nothing is written until they confirm.
  if (state.role === 'principal') { toast(t('tNotAllowed')); return; }
  var ex = db.exams.find(function (e) { return e.id === examId; });
  if (!ex || !isActiveExam(ex)) return;
  var v = parseFloat(($('fillAllMarksInput') || {}).value);
  if (isNaN(v) || v < 0 || v > ex.total) { toast(t('tCheckMarks')); return; }
  var n = 0;
  db.students.filter(function (s) { return s.cls === ex.cls && isEnrolledStudent(s); }).forEach(function (s) {
    var inp = $('mk-' + s.id);
    if (!inp) return;
    inp.value = String(v);
    n++;
  });
  if (n) toast('✓ ' + t('tFillAllDone'));
}
function copyMarksFromExam(examId) {
  // v100: copy the stored marks of another exam in the same class into
  // this exam's inputs (inputs only — Save Marks still confirms).
  if (state.role === 'principal') { toast(t('tNotAllowed')); return; }
  var ex = db.exams.find(function (e) { return e.id === examId; });
  if (!ex || !isActiveExam(ex)) return;
  var srcId = ($('copyExamSelect') || {}).value;
  if (!srcId) { toast(t('tNoPrevExam')); return; }
  var src = db.exams.find(function (e) { return e.id === srcId; });
  if (!src) { toast(t('tNoPrevExam')); return; }
  var byStu = {};
  (db.marks || []).forEach(function (m) { if (m.examId === srcId) byStu[m.studentId] = m.marks; });
  var n = 0;
  db.students.filter(function (s) { return s.cls === ex.cls && isEnrolledStudent(s); }).forEach(function (s) {
    if (byStu[s.id] === undefined) return;
    var inp = $('mk-' + s.id);
    if (!inp) return;
    inp.value = String(byStu[s.id]);
    n++;
  });
  toast('✓ ' + n + ' ' + t('tCopyDone'));
}
function pasteMarks(examId) {
  // v100: paste tab/comma-separated admission-no + mark pairs (one per
  // line, copied from a spreadsheet) into the marks inputs. Unmatched
  // lines are reported, never silently dropped. Inputs only — Save
  // Marks still confirms.
  if (state.role === 'principal') { toast(t('tNotAllowed')); return; }
  var ex = db.exams.find(function (e) { return e.id === examId; });
  if (!ex || !isActiveExam(ex)) return;
  var box = $('pasteMarksBox');
  var text = box ? String(box.value || '') : '';
  var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return !!l; });
  if (!lines.length) { toast(t('tPasteBad')); return; }
  var byAdm = {};
  db.students.filter(function (s) { return s.cls === ex.cls; }).forEach(function (s) { byAdm[String(s.admissionNo || '').trim().toLowerCase()] = s; });
  var pasted = 0, skipped = 0;
  lines.forEach(function (line) {
    var parts = line.split(/[\t,;]+/).map(function (p) { return p.trim(); }).filter(function (p) { return !!p; });
    if (parts.length < 2) { skipped++; return; }
    var stu = byAdm[String(parts[0]).toLowerCase()];
    var v = parseFloat(parts[1]);
    if (!stu || isNaN(v) || v < 0 || v > ex.total) { skipped++; return; }
    var inp = $('mk-' + stu.id);
    if (!inp) { skipped++; return; }
    inp.value = String(v);
    pasted++;
  });
  toast('✓ ' + pasted + ' ' + t('tPasteDone') + (skipped ? ' ' + skipped + ' ' + t('tPasteSkipped') : ''));
}
function bulkMarksCard100(ex) {
  // v100: fill-all / copy-from-exam / paste-from-spreadsheet — all three
  // only fill the inputs; Save Marks still writes. A principal never
  // sees the card (their marks are read-only text).
  if (state.role === 'principal') return '';
  var others = db.exams.filter(function (e) { return isActiveExam(e) && e.cls === ex.cls && e.id !== ex.id; });
  var opts = others.map(function (e) { return '<option value="' + e.id + '">' + esc(e.name) + ' (' + esc(e.date) + ')</option>'; }).join('');
  return '<div class="card mt-16"><h3>' + t('bulkMarksH') + '</h3>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px"><input type="number" id="fillAllMarksInput" min="0" max="' + ex.total + '" step="0.5" placeholder="—" style="width:90px"><button class="btn" onclick="fillAllMarks(\'' + ex.id + '\')">' + t('fillAllMarks') + '</button>' +
    (others.length ? '<select id="copyExamSelect">' + opts + '</select><button class="btn" onclick="copyMarksFromExam(\'' + ex.id + '\')">' + t('copyFromExam') + '</button>' : '<span class="muted">' + t('tNoPrevExam') + '</span>') + '</div>' +
    '<textarea id="pasteMarksBox" rows="4" placeholder="' + t('pasteMarksHint') + '" class="w-full"></textarea>' +
    '<div class="mt-8"><button class="btn" onclick="pasteMarks(\'' + ex.id + '\')">' + t('pasteMarks') + '</button></div></div>';
}
function examForm(editId) {
  // v37: exam creation (audit item 6). A teacher only ever sees their
  // own assigned classes in the picker — the save re-checks it, so a
  // crafted value cannot slip through.
  // B6: with an id this is the EDIT form — same fields, prefilled.
  // Class is locked on edit (disabled select): the marks rows belong
  // to that class's roster, so changing it would strand them.
  if (state.role !== 'school' && state.role !== 'teacher') { toast(t('tNotAllowed')); return; }
  var editing = null;
  if (editId) {
    editing = db.exams.find(function (e) { return e.id === editId && isActiveExam(e); });
    if (!editing) { toast(t('tNotAllowed')); return; }
    if (state.role === 'teacher' && teacherClasses().indexOf(editing.cls) === -1) { toast(t('tNotAllowed')); return; }
    state.editExamId = editing.id;
  } else state.editExamId = null;
  var clsList = state.role === 'teacher' ? teacherClasses() : schoolClasses();
  if (!clsList.length) { toast(t('tchrNoClassesYet')); return; }
  var clsOpts = editing
    ? '<option selected>' + esc(editing.cls) + '</option>'
    : clsList.map(function (c) { return '<option>' + c + '</option>'; }).join('');
  var subOpts = schoolSubjectList().map(function (s) { return '<option' + (editing && editing.subject === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '<option' + (editing && editing.subject === 'All Subjects' ? ' selected' : '') + '>All Subjects</option>';
  openModal('<h3>' + (editing ? t('editExam') : t('createExam')) + '</h3><form onsubmit="return saveExam(event)"><div class="form-grid">' +
    '<div class="full"><label>' + t('examName') + ' *</label><input id="fExName" required placeholder="e.g. Unit Test 3" value="' + (editing ? esc(editing.name) : '') + '"></div>' +
    '<div><label>' + t('fClass') + ' *</label><select id="fExCls"' + (editing ? ' disabled' : '') + '>' + clsOpts + '</select></div>' +
    '<div><label>' + t('fSubject') + '</label><select id="fExSub">' + subOpts + '</select></div>' +
    '<div><label>' + t('fDate') + '</label><input id="fExDate" type="date" value="' + (editing ? esc(editing.date) : todayIST()) + '" required></div>' +
    '<div><label>' + t('examTotal') + ' *</label><input id="fExTotal" type="number" min="1" step="1" value="' + (editing ? editing.total : 100) + '" required></div>' +
    '</div>' + (editing ? '<p class="muted mt-8">' + t('examClsLocked') + ' ' + t('examMarksKept') + '</p>' : '') +
    '<div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button><button class="btn" type="submit">' + (editing ? t('saveBtn') : t('createExam')) + '</button></div></form>');
}
function saveExam(e) {
  e.preventDefault();
  if (state.role !== 'school' && state.role !== 'teacher') { toast(t('tNotAllowed')); return false; }
  var name = ($('fExName') ? $('fExName').value : '').trim();
  var cls = $('fExCls') ? $('fExCls').value : '';
  var subject = $('fExSub') ? $('fExSub').value : '';
  var date = $('fExDate') ? $('fExDate').value : '';
  var total = $('fExTotal') ? parseInt($('fExTotal').value, 10) : 0;
  if (!name || !cls || !date || !total || total < 1) { toast(t('tExamInvalid')); return false; }
  // v37: a teacher creates exams only for their own assigned classes.
  if (state.role === 'teacher' && teacherClasses().indexOf(cls) === -1) { toast(t('tNotAllowed')); return false; }
  if (state.editExamId) {
    // B6: EDIT — update in place. Class never changes (see examForm):
    // the marks rows belong to that class's roster. Marks already
    // entered stay exactly as entered — never silently changed or
    // deleted; percentages are recalculated against the new total,
    // and a mark above a lowered total is kept and flagged on the
    // next marks save (saveMarks rejects over-total values).
    var ex0 = db.exams.find(function (e) { return e.id === state.editExamId; });
    if (!ex0 || !isActiveExam(ex0)) { state.editExamId = null; toast(t('tNotAllowed')); return false; }
    var oldName = ex0.name;
    ex0.name = name; ex0.subject = subject; ex0.date = date; ex0.total = total;
    logAudit('Exam updated', oldName + ' → ' + name + ' • ' + ex0.cls + ' • ' + subject + ' • ' + date + ' • ' + total + ' marks');
    state.editExamId = null;
    saveDB(db); closeModal(); renderApp();
    toast('✓ ' + t('tExamUpdated'));
    return false;
  }
  var ex = { id: uniqueId('ex'), name: name, cls: cls, subject: subject, date: date, total: total };
  db.exams.push(ex);
  logAudit('Exam created', name + ' • ' + cls + ' • ' + subject + ' • ' + date + ' • ' + total + ' marks');
  state.examId = ex.id;
  saveDB(db); closeModal(); renderApp();
  toast('✓ ' + t('tExamCreated'));
  return false;
}
function editExam(id) {
  // B6: opens the same form as create, prefilled. School + teacher
  // (own classes only) — the role/class checks live in examForm.
  examForm(id);
}
function sbQueueExamChange58(ex) {
  // v58: a soft-delete / restore changes NO server payload field
  // (ss_exams has no deleted column), so the diff never queues it —
  // and without a pending outbox entry the v58 pull keep above has
  // nothing to key on. Queue it explicitly so the keep holds the
  // flag until the flush resolves it. v67 (SQL 20): the server row
  // now HAS the deleted column and sbMapExam carries it, so the
  // flush PATCH actually writes the flag — the push is no longer a
  // no-op, and the delete/restore travels to other devices. The
  // queue itself is still needed: the diff alone never queues a
  // delete, because only the flag changes.
  // live issue 15: the old code returned early with no live
  // session, so a delete made while logged in locally — exactly the
  // post-logout state, where the school IS server-linked but the
  // session is gone — never queued. The next pull then overwrote the
  // local deleted flag with the server's stale false and the deleted
  // exam reappeared in the list. The outbox is keyed by Supabase uid
  // and the pull keep reads the account's STORED sbUid too, so queue
  // under that when there is no live session. A school that never
  // linked has no sbUid at all and still skips (no pull can clobber
  // the flag there).
  try {
    var uid58 = (state.sb && state.sb.uid) || (state.user && state.user.sbUid) || '';
    if (!uid58 || !ex || !ex.id) return;
    sbOutboxAdd(uid58, { table: 'ss_exams', key: ex.id, op: 'upsert', row: JSON.parse(JSON.stringify(ex)), at: new Date().toISOString() });
  } catch (e58) {}
}
function deleteExam(id) {
  // B6: school only, same pattern as deleteStudent (soft delete).
  // SOFT DELETE only: the exam row and ALL of its marks stay saved —
  // nothing is ever hard-deleted here. The marks are hidden
  // everywhere (exam lists, results, latest-exam %) until the exam
  // is restored from the "Deleted exams" card. v67 (SQL 20): the
  // flag now rides the server row, so the delete syncs to other
  // devices — the merge-keep by the ss_exams pull holds it only
  // while the outbox entry is pending; once flushed, the server
  // value is the truth on every device.
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  var ex = db.exams.find(function (e) { return e.id === id && isActiveExam(e); });
  if (!ex) return;
  confirmModal(t('delExamMsg') + ' — ' + ex.name + ' • ' + ex.cls + ' • ' + ex.subject + '?', function () {
    ex.deleted = true;
    sbQueueExamChange58(ex); // v58: the diff never queues a delete (no payload field changes) — queue it so the pull keep holds the flag
    if (state.examId === id) {
      var next = db.exams.filter(isActiveExam)[0];
      state.examId = next ? next.id : null;
    }
    logAudit('Exam deleted', ex.name + ' • ' + ex.cls + ' • ' + ex.subject + ' • ' + ex.date + ' (soft delete — exam and marks kept)');
    saveDB(db); renderApp();
    toast(t('tExamDeleted'));
  });
}
function restoreExam(id) {
  // B6: undoes a soft delete — the exam and its marks come back
  // everywhere at once, because neither was ever removed.
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  var ex = db.exams.find(function (e) { return e.id === id && !!e.deleted; });
  if (!ex) return;
  ex.deleted = false;
  sbQueueExamChange58(ex); // v58: same as deleteExam — the diff never queues a restore on its own
  logAudit('Exam restored', ex.name + ' • ' + ex.cls + ' • ' + ex.subject + ' • ' + ex.date);
  saveDB(db); renderApp();
  toast('✓ ' + t('tExamRestored'));
}
function meStudent() {
  // v35: the logged-in student is found by id, never by name and never
  // by falling back to the first student in the list (the old code did
  // both — a name match could open the wrong child).
  // v86 (Phase 4): a parent is tied to the same ONE student
  // (state.user.studentId), so the parent portal reuses the student
  // views — the parent sees only that child's data.
  if ((state.role !== 'student' && state.role !== 'parent') || !state.user || !state.user.studentId) return null;
  return db.students.find(function (x) { return x.id === state.user.studentId; }) || null;
}
function homeworkPage() {
  var isStudent = state.role === 'student';
  var isTeacher = state.role === 'teacher';
  var isParent = state.role === 'parent';
  var isStaff = state.role === 'staff'; // v93: a staff member sees homework for their own assigned classes only (and may post it, like a teacher)
  var me = meStudent();
  var myCls = me ? me.cls : '10th-A';
  // v35: a teacher sees homework for their own assigned classes only
  // (and may post it); a student sees only their own class.
  // v86: a parent sees only their own child's class — never the whole
  // school's homework — and never gets the Add button.
  // v93: a staff member sees only their own assigned classes too.
  var list = db.homework.filter(function (h) { return (isStudent || isParent) ? h.cls === myCls : (isTeacher || isStaff) ? roleClasses().indexOf(h.cls) !== -1 : true; });
  var items = list.map(function (h) {
    var done = me ? h.doneBy.indexOf(me.id) !== -1 : false;
    // v124: Edit/Delete buttons — school + own-class teacher/staff only;
    // a student, parent or principal never gets them.
    var canEdit124 = !isStudent && !isParent && state.role !== 'principal' && ((isTeacher || isStaff) ? roleClasses().indexOf(h.cls) !== -1 : true);
    var btns124 = canEdit124 ? '<button class="btn" onclick="editHomework(\'' + h.id + '\')">✎ ' + t('editHomework') + '</button><button class="btn danger" onclick="deleteHomework(\'' + h.id + '\')">🗑 ' + t('deleteHomework') + '</button>' : '';
    var box = isStudent
      ? '<input type="checkbox" ' + (done ? 'checked' : '') + ' onchange="toggleHw(\'' + h.id + '\', this.checked)" aria-label="Mark done">'
      : '';
    return '<div class="hw-item ' + (done ? 'done' : '') + '">' + box +
      '<div><b>' + esc(h.title) + '</b><span>' + esc(h.subject) + ' • Class ' + esc(h.cls) + ' • Due ' + esc(h.due) + (isStudent ? '' : ' • ' + h.doneBy.length + ' ' + t('doneSuffix')) + '</span></div>' + btns124 + '</div>';
  }).join('');
  return '<div class="page-head"><div><h2>' + t('homework') + '</h2><p>' + (isStudent ? 'Class ' + esc(myCls) + ' — ' + t('tapDone') : t('subHomework')) + '</p></div>' +
    ((isStudent || isParent || state.role === 'principal') ? '' : '<div class="toolbar"><button class="btn" onclick="homeworkForm()">+ ' + t('addHomework') + '</button></div>') + '</div>' + // v88: a principal never gets the Add button either
    '<div class="card">' + (items || '<div class="empty">' + t('tNoHw') + '</div>') + '</div>';
}
function toggleHw(id, done) {
  if (state.role !== 'student') return; // only the student marks their own homework
  // v61: a cloud student is read-only — their homework status lives on
  // the server and cannot be saved from here. Re-render to uncheck.
  if (state.cloudDb) { toast(t('tCloudHwReadOnly')); renderPage(); return; }
  var h = db.homework.find(function (x) { return x.id === id; });
  if (!h) return;
  var me = meStudent();
  if (!me) return;
  var i = h.doneBy.indexOf(me.id);
  // v124: push the student ID, not the student object — pushing the
  // object meant indexOf(me.id) never found it again, so the checkbox
  // unchecked itself on re-render, the mark could never be undone, and
  // the sync mapper filtered the object out (the done state never
  // reached the server).
  var changed124 = (done && i === -1) || (!done && i !== -1);
  if (done && i === -1) h.doneBy.push(me.id);
  if (!done && i !== -1) h.doneBy.splice(i, 1);
  if (changed124) logAudit(done ? 'Homework done' : 'Homework not done', me.name + ' • ' + h.title + ' • Class ' + h.cls);
  saveDB(db); renderPage();
  toast(done ? '✓ ' + t('tHwDone') : t('tHwNotDone'));
}
function homeworkForm(editId) {
  // v35: a teacher assigns homework only to their own classes.
  // v93: a staff member assigns homework only to their own classes too.
  // v124: edit mode — the class is locked (the done list belongs to
  // that class's roster), subject/title/due are editable. The due-date
  // minimum is dropped in edit mode so an old homework (past due) can
  // still be fixed; the create form's default due is today (the old
  // hard-coded 2026-11-12 was already in the past).
  var hw124 = editId ? db.homework.find(function (x) { return x.id === editId; }) : null;
  var clsList35 = hw124 ? [hw124.cls] : ((state.role === 'teacher' || state.role === 'staff') ? roleClasses() : schoolClasses());
  var clsOpts = clsList35.map(function (c) { return '<option>' + c + '</option>'; }).join('');
  var subOpts = schoolSubjectList().map(function (x) { return '<option' + (hw124 && hw124.subject === x ? ' selected' : '') + '>' + x + '</option>'; }).join('');
  openModal('<h3>' + (hw124 ? t('editHomework') : t('addHomework')) + '</h3><form onsubmit="return saveHomework(event' + (hw124 ? ', \'' + hw124.id + '\'' : '') + ')"><div class="form-grid">' +
    '<div><label>' + t('fClass') + '</label><select id="fHwCls"' + (hw124 ? ' disabled' : '') + '>' + clsOpts + '</select>' + (hw124 ? '<div class="hint">' + t('hwClsLocked') + '</div>' : '') + '</div>' +
    '<div><label>' + t('fSubject') + '</label><select id="fHwSub">' + subOpts + '</select></div>' +
    '<div class="full"><label>' + t('fTitle') + '</label><input id="fHwTitle" required placeholder="e.g. Ex 5.2 — Q1 to Q10" value="' + (hw124 ? esc(hw124.title) : '') + '"></div>' +
    '<div><label>' + t('fDue') + '</label><input id="fHwDue" type="date"' + (hw124 ? '' : ' min="' + todayIST() + '"') + ' value="' + (hw124 ? hw124.due : todayIST()) + '" required></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button><button class="btn" type="submit">' + (hw124 ? t('saveBtn') : t('assignHw')) + '</button></div></form>');
}
function saveHomework(e, editId) {
  e.preventDefault();
  // v124: edit mode — update subject/title/due on the existing row
  // (class locked). A cloud teacher/staff member has no edit path to
  // the server, so only the school admin (or a local teacher/staff
  // member, whose change rides the school's sync) may edit. A past due
  // date is refused only when it CHANGES — an old homework keeps its
  // due unless the teacher moves it.
  if (editId) {
    var hw124 = db.homework.find(function (x) { return x.id === editId; });
    if (!hw124) return false;
    if (state.cloudTeacherToken || state.cloudStaffToken) { toast(t('tHwCloudReadOnly')); return false; }
    if (state.role === 'principal') { toast(t('tNotAllowed')); return false; }
    if ((state.role === 'teacher' || state.role === 'staff') && roleClasses().indexOf(hw124.cls) === -1) { toast(t('tNotAllowed')); return false; }
    var newDue124 = $('fHwDue').value;
    if (newDue124 < todayIST() && newDue124 !== hw124.due) { toast(t('tDueFuture')); return false; }
    hw124.subject = $('fHwSub').value; hw124.title = $('fHwTitle').value.trim(); hw124.due = newDue124;
    logAudit('Homework updated', hw124.title + ' • Class ' + hw124.cls + ' • due ' + hw124.due);
    saveDB(db); closeModal(); renderApp();
    toast(t('tHwUpdated'));
    return false;
  }
  if ($('fHwDue').value < todayIST()) { toast(t('tDueFuture')); return false; }
  // v88: a principal is read-only — they never post homework.
  if (state.role === 'principal') { toast(t('tNotAllowed')); return false; }
  // v35: a teacher posts homework only to their own assigned class.
  // v93: a staff member posts homework only to their own assigned
  // class too.
  if ((state.role === 'teacher' || state.role === 'staff') && roleClasses().indexOf($('fHwCls').value) === -1) { toast(t('tNotAllowed')); return false; }
  // v62: a cloud teacher posts through the server RPC. The row joins the
  // slice only after the server confirms it.
  // v98: a cloud staff member posts homework through the STAFF RPC (SQL 35).
  var hwToken98 = state.cloudTeacherToken || state.cloudStaffToken;
  var hwFn98 = state.cloudTeacherToken ? sbTeacherPostHomework : sbStaffPostHomework;
  if (hwToken98) {
    var hw = { id: uniqueId('hw'), cls: $('fHwCls').value, subject: $('fHwSub').value, title: $('fHwTitle').value.trim(), due: $('fHwDue').value, doneBy: [] };
    hwFn98(hwToken98, hw.cls, hw.subject, hw.title, hw.due, hw.id).then(function (res) {
      if (!res || !res.ok) {
        if (res && res.error === 'bad_token') { toast(t('tCloudSessionExpired')); logout(); return; }
        toast(t('tNotSaved'));
        return;
      }
      db.homework.unshift(hw);
      sbLogAuditCloud(hwToken98, 'Homework assigned', hw.subject + ' • Class ' + hw.cls + ' • due ' + hw.due, 'Homework assigned', hw.subject + ' • Class ' + hw.cls, '📚', 'orange');
      closeModal(); renderApp();
      toast(t('tHwAssigned'));
    });
    return false;
  }
  db.homework.unshift({ id: uniqueId('hw'), cls: $('fHwCls').value, subject: $('fHwSub').value, title: $('fHwTitle').value.trim(), due: $('fHwDue').value, doneBy: [] });
  // v97: homework wrote the dashboard activity but never the audit log.
  logAudit('Homework assigned', $('fHwSub').value + ' • Class ' + $('fHwCls').value + ' • due ' + $('fHwDue').value);
  addActivity('📚', 'orange', 'Homework assigned', $('fHwSub').value + ' • Class ' + $('fHwCls').value);
  saveDB(db); closeModal(); renderApp();
  toast(t('tHwAssigned'));
  return false;
}
function editHomework(id) {
  var h = db.homework.find(function (x) { return x.id === id; });
  if (!h) return;
  if (state.role === 'principal' || state.role === 'student' || state.role === 'parent') { toast(t('tNotAllowed')); return; }
  if ((state.role === 'teacher' || state.role === 'staff') && roleClasses().indexOf(h.cls) === -1) { toast(t('tNotAllowed')); return; }
  if (state.cloudTeacherToken || state.cloudStaffToken) { toast(t('tHwCloudReadOnly')); return; }
  homeworkForm(id);
}
function deleteHomework(id) {
  var h = db.homework.find(function (x) { return x.id === id; });
  if (!h) return;
  if (state.role === 'principal' || state.role === 'student' || state.role === 'parent') { toast(t('tNotAllowed')); return; }
  if ((state.role === 'teacher' || state.role === 'staff') && roleClasses().indexOf(h.cls) === -1) { toast(t('tNotAllowed')); return; }
  if (state.cloudTeacherToken || state.cloudStaffToken) { toast(t('tHwCloudReadOnly')); return; }
  confirmModal(t('delHwMsg') + ' — ' + h.title + ' • Class ' + h.cls + '?', function () {
    db.homework = db.homework.filter(function (x) { return x.id !== id; });
    logAudit('Homework deleted', h.title + ' • Class ' + h.cls + ' • ' + h.subject + ' • due ' + h.due);
    saveDB(db); renderApp();
    toast(t('tHwDeleted'));
  });
}
/* ================= Timetable (weekly class timetable) =================
   One row per class-slot: { id, cls, day 1-6 (Mon-Sat), period 1-8,
   subject, teacher }. A slot holds at most one subject — the save
   refuses a double-booking, and migrateTimetable dedupes on load.
   School admin edits every class; a teacher edits only their own
   classes; principal / student / parent read only (the student and
   parent see their own class alone). A cloud teacher has no server
   route for timetable rows, so they read like a principal — the
   school admin's edits ride the normal sync (ss_timetable, SQL 55). */
var TT_DAYS = [1, 2, 3, 4, 5, 6]; // Mon-Sat (Sunday is off)
var TT_PERIODS = 8; // periods 1-8 in a school day
var TT_DAY_KEYS = ['dayMon', 'dayTue', 'dayWed', 'dayThu', 'dayFri', 'daySat'];
function ttDayLabel(day) { return t(TT_DAY_KEYS[(day || 1) - 1] || 'dayMon'); }
function timetableForClass(cls) {
  return (db.timetable || []).filter(function (r) { return r.cls === cls; });
}
function timetableSlotTaken(cls, day, period, excludeId) {
  return (db.timetable || []).some(function (r) { return r.cls === cls && r.day === day && r.period === period && r.id !== excludeId; });
}
function timetableGrid(cls) {
  // grid[day][period] = entry, for the weekly table. Days 1-6,
  // periods 1-8; a slot holds at most one entry (enforced on save
  // and by migrateTimetable on load).
  var grid = {};
  TT_DAYS.forEach(function (d) { grid[d] = {}; });
  timetableForClass(cls).forEach(function (r) {
    if (grid[r.day]) grid[r.day][r.period] = r;
  });
  return grid;
}
function timetablePage() {
  var isStudent = state.role === 'student';
  var isParent = state.role === 'parent';
  var isTeacher = state.role === 'teacher';
  var isPrincipal = state.role === 'principal';
  var me = meStudent();
  // A student/parent sees only their own class; a teacher only
  // their assigned classes; the school + principal see every class.
  var myCls = me ? me.cls : null;
  var clsList = (isStudent || isParent)
    ? (myCls ? [myCls] : [])
    : (isTeacher ? roleClasses() : schoolClasses());
  var cls = state.ttCls && clsList.indexOf(state.ttCls) !== -1 ? state.ttCls : (clsList[0] || '');
  if (!cls) return '<div class="page-head"><div><h2>' + t('timetable') + '</h2><p>' + t('subTimetable') + '</p></div></div><div class="card"><div class="empty">' + t('tNoClasses') + '</div></div>';
  // A cloud teacher has no server route for timetable rows, so they
  // read the grid like a principal (the school admin's edits ride
  // the normal sync).
  var canEdit = !isStudent && !isParent && !isPrincipal && !state.cloudTeacherToken && !state.cloudStaffToken;
  var grid = timetableGrid(cls);
  var head = '<tr><th>' + t('fPeriod') + '</th>' + TT_DAYS.map(function (d) { return '<th>' + esc(ttDayLabel(d)) + '</th>'; }).join('') + '</tr>';
  var rows = '';
  for (var p = 1; p <= TT_PERIODS; p++) {
    var cells = '';
    TT_DAYS.forEach(function (d) {
      var e = grid[d][p];
      if (e) {
        var tone = (typeof ttSubjectTone === 'function') ? ttSubjectTone(e.subject) : 'tt-c0';
        cells += '<td><div class="tt-pill ' + tone + '"><b>' + esc(e.subject) + '</b>' + (e.teacher ? '<br><span class="muted">' + esc(e.teacher) + '</span>' : '') +
          (canEdit ? '<br><button class="btn ghost sm" onclick="editTimetable(\'' + e.id + '\')">✎</button> <button class="btn ghost sm" onclick="deleteTimetable(\'' + e.id + '\')">🗑</button>' : '') + '</div></td>';
      } else {
        cells += '<td>' + (canEdit ? '<button class="btn ghost sm" onclick="timetableForm(null, \'' + esc(cls) + '\', ' + d + ', ' + p + ')">+</button>' : '—') + '</td>';
      }
    });
    rows += '<tr><td><b>' + p + '</b></td>' + cells + '</tr>';
  }
  var clsSel = (isStudent || isParent || clsList.length <= 1) ? '' :
    '<select onchange="state.ttCls=this.value;renderPage()">' + clsList.map(function (c) { return '<option' + (c === cls ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select>';
  var hasRows = timetableForClass(cls).length > 0;
  return '<div class="page-head"><div><h2>' + t('timetable') + '</h2><p>' + t('subTimetable') + ' — Class ' + esc(cls) + '</p></div>' +
    '<div class="toolbar">' + clsSel + (canEdit ? '<button class="btn" onclick="timetableForm()">+ ' + t('addTimetable') + '</button>' : '') + '</div></div>' +
    '<div class="card"><div class="tbl-wrap"><table>' + head + rows + '</table></div>' +
    (hasRows ? '' : '<div class="empty">' + t('tNoTt') + '</div>') + '</div>';
}
function timetableForm(editId, preCls, preDay, prePeriod) {
  // Add/edit one period. The class is locked in edit mode (the slot
  // belongs to that class); a "+" cell pre-fills its day/period.
  var row = editId ? (db.timetable || []).find(function (x) { return x.id === editId; }) : null;
  var clsList = row ? [row.cls] : ((state.role === 'teacher') ? roleClasses() : schoolClasses());
  var cls = row ? row.cls : (preCls || state.ttCls || clsList[0] || '');
  var clsOpts = clsList.map(function (c) { return '<option' + (c === cls ? ' selected' : '') + '>' + c + '</option>'; }).join('');
  var day = row ? row.day : (preDay || 1);
  var dayOpts = TT_DAYS.map(function (d) { return '<option value="' + d + '"' + (d === day ? ' selected' : '') + '>' + esc(ttDayLabel(d)) + '</option>'; }).join('');
  var period = row ? row.period : (prePeriod || 1);
  var perOpts = [];
  for (var p = 1; p <= TT_PERIODS; p++) perOpts.push('<option value="' + p + '"' + (p === period ? ' selected' : '') + '>' + p + '</option>');
  var subOpts = schoolSubjectList().map(function (x) { return '<option' + (row && row.subject === x ? ' selected' : '') + '>' + x + '</option>'; }).join('');
  var teachers = (db.teachers || []).filter(function (x) { return !x.deleted; });
  var tOpts = '<option value="">—</option>' + teachers.map(function (x) { return '<option' + (row && row.teacher === x.name ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('');
  openModal('<h3>' + (row ? t('editTimetable') : t('addTimetable')) + '</h3><form onsubmit="return saveTimetable(event' + (row ? ', \'' + row.id + '\'' : '') + ')"><div class="form-grid">' +
    '<div><label>' + t('fClass') + '</label><select id="fTtCls"' + (row ? ' disabled' : '') + '>' + clsOpts + '</select></div>' +
    '<div><label>' + t('fDay') + '</label><select id="fTtDay">' + dayOpts + '</select></div>' +
    '<div><label>' + t('fPeriod') + '</label><select id="fTtPeriod">' + perOpts.join('') + '</select></div>' +
    '<div><label>' + t('fSubject') + '</label><select id="fTtSub">' + subOpts + '</select></div>' +
    '<div><label>' + t('fTeacher') + '</label><select id="fTtTeacher">' + tOpts + '</select></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button><button class="btn" type="submit">' + (row ? t('saveBtn') : t('addTimetable')) + '</button></div></form>');
}
function saveTimetable(e, editId) {
  e.preventDefault();
  if (state.role === 'principal' || state.role === 'student' || state.role === 'parent') { toast(t('tNotAllowed')); return false; }
  if (state.cloudTeacherToken || state.cloudStaffToken) { toast(t('tTtCloudReadOnly')); return false; }
  var row = editId ? (db.timetable || []).find(function (x) { return x.id === editId; }) : null;
  var cls = row ? row.cls : $('fTtCls').value;
  if ((state.role === 'teacher' || state.role === 'staff') && roleClasses().indexOf(cls) === -1) { toast(t('tNotAllowed')); return false; }
  var day = parseInt($('fTtDay').value, 10);
  var period = parseInt($('fTtPeriod').value, 10);
  if (TT_DAYS.indexOf(day) === -1 || period < 1 || period > TT_PERIODS) { toast(t('tNotSaved')); return false; }
  if (timetableSlotTaken(cls, day, period, editId || null)) { toast(t('tTtSlotTaken')); return false; }
  var subject = $('fTtSub').value;
  var teacher = $('fTtTeacher').value;
  if (row) {
    row.day = day; row.period = period; row.subject = subject; row.teacher = teacher;
    logAudit('Timetable updated', subject + ' • Class ' + cls + ' • ' + ttDayLabel(day) + ' • Period ' + period);
    saveDB(db); closeModal(); renderApp();
    toast(t('tTtUpdated'));
    return false;
  }
  if (!Array.isArray(db.timetable)) db.timetable = []; // a seed/old DB gains the list here if loadDB never migrated it
  db.timetable.unshift({ id: uniqueId('tt'), cls: cls, day: day, period: period, subject: subject, teacher: teacher });
  logAudit('Timetable added', subject + ' • Class ' + cls + ' • ' + ttDayLabel(day) + ' • Period ' + period);
  addActivity('🗓️', 'blue', 'Timetable added', subject + ' • Class ' + cls);
  saveDB(db); closeModal(); renderApp();
  toast(t('tTtSaved'));
  return false;
}
function editTimetable(id) {
  var row = (db.timetable || []).find(function (x) { return x.id === id; });
  if (!row) return;
  if (state.role === 'principal' || state.role === 'student' || state.role === 'parent') { toast(t('tNotAllowed')); return; }
  if ((state.role === 'teacher' || state.role === 'staff') && roleClasses().indexOf(row.cls) === -1) { toast(t('tNotAllowed')); return; }
  if (state.cloudTeacherToken || state.cloudStaffToken) { toast(t('tTtCloudReadOnly')); return; }
  timetableForm(id);
}
function deleteTimetable(id) {
  var row = (db.timetable || []).find(function (x) { return x.id === id; });
  if (!row) return;
  if (state.role === 'principal' || state.role === 'student' || state.role === 'parent') { toast(t('tNotAllowed')); return; }
  if ((state.role === 'teacher' || state.role === 'staff') && roleClasses().indexOf(row.cls) === -1) { toast(t('tNotAllowed')); return; }
  if (state.cloudTeacherToken || state.cloudStaffToken) { toast(t('tTtCloudReadOnly')); return; }
  confirmModal(t('delTtMsg') + ' — ' + row.subject + ' • Class ' + row.cls + ' • ' + ttDayLabel(row.day) + ' • Period ' + row.period + '?', function () {
    db.timetable = db.timetable.filter(function (x) { return x.id !== id; });
    logAudit('Timetable deleted', row.subject + ' • Class ' + row.cls + ' • ' + ttDayLabel(row.day) + ' • Period ' + row.period);
    saveDB(db); renderApp();
    toast(t('tTtDeleted'));
  });
}
function noticesPage() {
  // v126: the school can fix or remove a notice — every other role sees
  // the plain list (teachers view notices only, v35).
  var canEdit126 = state.role === 'school';
  var items = db.notices.map(function (n) {
    return '<div class="notice"><b>' + esc(n.title) + '</b><span>' + esc(n.date) + '</span><p>' + esc(n.body) + '</p>' +
      (canEdit126 ? '<button class="btn" onclick="editNotice(\'' + n.id + '\')">✎ ' + t('editNotice') + '</button><button class="btn danger" onclick="deleteNotice(\'' + n.id + '\')">🗑 ' + t('deleteNotice') + '</button>' : '') + '</div>';
  }).join('');
  // v96 (cons fix): an empty notices list showed a blank card with no
  // message — now it says so, so a school admin never wonders whether
  // the page failed to load.
  if (!items) items = '<div class="empty">' + t('tNoNotices') + '</div>';
  var canPost = state.role === 'school'; // v35: teachers view notices only
  return '<div class="page-head"><div><h2>' + t('notices') + '</h2><p>' + t('subNotices') + ' — ' + esc(db.profile.name) + '</p></div>' +
    (canPost ? '<div class="toolbar"><button class="btn" onclick="noticeForm()">+ ' + t('publishNotice') + '</button></div>' : '') + '</div>' +
    '<div class="card">' + items + '</div>';
}
function noticeForm(editId) {
  // v126: edit mode — title/body are editable, the publish date stays
  // (it is the record of when the notice went out).
  var nt126 = editId ? db.notices.find(function (x) { return x.id === editId; }) : null;
  openModal('<h3>' + (nt126 ? t('editNotice') : t('publishNotice')) + '</h3><form onsubmit="return saveNotice(event' + (nt126 ? ', \'' + nt126.id + '\'' : '') + ')"><div class="form-grid">' +
    '<div class="full"><label>' + t('fTitle') + '</label><input id="fNtTitle" required placeholder="e.g. Annual Sports Day" value="' + (nt126 ? esc(nt126.title) : '') + '"></div>' +
    '<div class="full"><label>' + t('fMessage') + '</label><textarea id="fNtBody" rows="3" required placeholder="Notice details…">' + (nt126 ? esc(nt126.body) : '') + '</textarea></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button><button class="btn" type="submit">' + (nt126 ? t('saveBtn') : t('publishBtn')) + '</button></div></form>');
}
function saveNotice(e, editId) {
  e.preventDefault();
  if (state.role !== 'school') { toast(t('tNotAllowed')); return false; }
  // v126: edit mode — title/body editable, the publish date stays.
  if (editId) {
    var nt126 = db.notices.find(function (x) { return x.id === editId; });
    if (!nt126) return false;
    var newTitle126 = $('fNtTitle').value.trim();
    var newBody126 = $('fNtBody').value.trim();
    if (nt126.title === newTitle126 && nt126.body === newBody126) { toast(t('tNoChanges')); return false; }
    nt126.title = newTitle126; nt126.body = newBody126;
    logAudit('Notice updated', nt126.title + ' • ' + nt126.date);
    saveDB(db); closeModal(); renderApp();
    toast(t('tNtUpdated'));
    return false;
  }
  var ntTitle126 = $('fNtTitle').value.trim();
  var ntBody126 = $('fNtBody').value.trim();
  var ntDate126 = todayIST();
  db.notices.unshift({ id: uniqueId('n'), title: ntTitle126, date: ntDate126, body: ntBody126 });
  // v126: publishing wrote the activity feed but never the audit log.
  logAudit('Notice published', ntTitle126 + ' • ' + ntDate126);
  addActivity('📢', 'orange', 'New notice published', ntTitle126);
  saveDB(db); closeModal(); renderApp();
  if (typeof sbPushSend === 'function') { sbPushSend(ntTitle126, ntBody126 || ntTitle126); }
  toast(t('tNoticePub'));
  return false;
}
function editNotice(id) {
  var n = db.notices.find(function (x) { return x.id === id; });
  if (!n) return;
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  noticeForm(id);
}
function deleteNotice(id) {
  var n = db.notices.find(function (x) { return x.id === id; });
  if (!n) return;
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  confirmModal(t('delNtMsg') + ' — ' + n.title + '?', function () {
    db.notices = db.notices.filter(function (x) { return x.id !== id; });
    logAudit('Notice deleted', n.title + ' • ' + n.date);
    saveDB(db); renderApp();
    toast(t('tNtDeleted'));
  });
}
/* ================= Report card / marksheet (print) =================
   Reuses the marks the app already stores — NO new marks model, no
   grade scale, no rank: the app computes neither, so the card shows
   subject-wise marks, total and percentage only. (Grade scale and
   class rank are owner decisions, not invented here.)
   Data model, as stored: one exam row = one subject paper
   {id, name, cls, subject, date, total, deleted}; one mark row =
   {examId, studentId, marks}. A report card groups the ACTIVE exam
   rows that share one exam NAME in the student's class — each row is
   one subject (an exam whose subject is 'All Subjects' is a single
   combined paper, so the card has one row). First mark per
   (exam, student) wins, matching examsPage. A subject with no mark
   yet shows '—' and still counts in the max total, so the percentage
   is obtained / full total — the missing-subjects note says how many.
   Print follows the receipt pattern: HTML into #printArea, then
   window.print() (print CSS in styles.css, .print-stmt). */
function buildReportCard(d, studentId, examName) {
  // Pure computation — returns null when there is nothing to show.
  if (!d || !studentId || !examName) return null;
  var s = (d.students || []).filter(function (x) { return x.id === studentId; })[0];
  if (!s) return null;
  var papers = (d.exams || []).filter(function (e) { return e.name === examName && e.cls === s.cls && isActiveExam(e); });
  if (!papers.length) return null;
  var markByExam = new Map();
  (d.marks || []).forEach(function (m) {
    if (m.studentId !== studentId) return;
    if (typeof m.marks !== 'number' || !isFinite(m.marks)) return;
    if (!markByExam.has(m.examId)) markByExam.set(m.examId, m.marks);
  });
  var rows = papers.map(function (e) {
    var mk = markByExam.has(e.id) ? markByExam.get(e.id) : null;
    return { examId: e.id, subject: e.subject || '', date: e.date || '', marks: mk, total: e.total || 100 };
  }).sort(function (a, b) { return a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0; });
  var obtained = 0, maxTotal = 0, entered = 0;
  rows.forEach(function (r) {
    maxTotal += r.total;
    if (r.marks !== null) { obtained += r.marks; entered++; }
  });
  var missing = rows.length - entered;
  return { student: s, examName: examName, cls: s.cls, rows: rows, obtained: obtained, maxTotal: maxTotal,
    pct: entered ? Math.round(obtained / maxTotal * 100) : null, entered: entered, missing: missing };
}
function reportCardTableHTML(rc) {
  // Subject table + totals, shared by the on-screen preview and print.
  var rows = rc.rows.map(function (r) {
    return '<tr><td><b>' + esc(r.subject) + '</b></td><td>' + (r.marks !== null ? r.marks : '<span class="muted">' + t('tNotEntered') + '</span>') + '</td><td>' + r.total + '</td><td>' + (r.marks !== null ? '<b>' + Math.round(r.marks / r.total * 100) + '%</b>' : '<span class="muted">—</span>') + '</td></tr>';
  }).join('');
  return '<table><thead><tr><th>' + t('rcSubject') + '</th><th>' + t('thMarks') + '</th><th>' + t('rcMaxMarks') + '</th><th>' + t('thResult') + '</th></tr></thead><tbody>' + rows +
    '</tbody></table><div class="tot"><span>' + t('rcObtained') + ': ' + rc.obtained + ' / ' + rc.maxTotal + '</span><span>' + t('rcPercentage') + ': ' + (rc.pct !== null ? rc.pct + '%' : '—') + '</span></div>' +
    (rc.missing ? '<p class="muted">' + rc.missing + ' ' + t('rcMissing') + '.</p>' : '');
}
function reportCardPrintHTML(rc) {
  var s = rc.student, p = db.profile || {};
  var logo = p.logo ? '<img class="print-logo" src="' + esc(sbDisplayPhoto(p.logo)) + '" alt="" onerror="this.remove()">' : '';
  var meta = '<div class="rc-meta">' +
    '<span><b>' + t('thStudent') + ':</b> ' + esc(s.name) + '</span><span><b>' + t('rcAdmNo') + '</b> ' + esc(s.admissionNo || '—') + '</span>' +
    '<span><b>' + t('thClass') + ':</b> ' + esc(rc.cls) + '</span><span><b>' + t('rcRoll') + '</b> ' + esc(s.roll == null ? '—' : String(s.roll)) + '</span>' +
    '<span><b>' + t('rcFather') + ':</b> ' + esc(s.fatherName || s.guardian || '—') + '</span><span><b>' + t('rcSession') + ':</b> ' + esc(s.session || p.session || '—') + '</span>' +
    '</div>';
  return '<div class="print-head">' + logo + '<div><h1>' + esc(p.name || '') + '</h1><p class="muted">' + esc(p.address || '') + ' • ' + esc(p.phone || '') + '</p></div></div>' +
    '<h2>' + esc(t('rcTitle')) + ' — ' + esc(rc.examName) + '</h2>' + meta + reportCardTableHTML(rc) +
    '<div class="sign-row"><div><div class="sign-line"></div>' + esc(t('rcSignTeacher')) + '</div><div><div class="sign-line"></div>' + esc(t('rcSignPrincipal')) + '</div></div>' +
    '<p class="muted">' + esc(t('thDate')) + ': ' + esc(todayIST()) + '</p>';
}
function printReportCard(studentId, examName) {
  var rc = buildReportCard(db, studentId, examName);
  if (!rc) return;
  $('printArea').innerHTML = '<div class="print-stmt">' + reportCardPrintHTML(rc) + '</div>';
  if (window.print) window.print();
}
function reportCardCard() {
  // Reports-page card (school + principal only — the accountant sees
  // the Reports page too, but not marks). Pick class, then exam name,
  // then student; the card previews below and prints via #printArea.
  if (state.role !== 'school' && state.role !== 'principal') return '';
  var classes = schoolClasses();
  var cls = classes.indexOf(state.rcCls) !== -1 ? state.rcCls : '';
  var examNames = [];
  db.exams.filter(isActiveExam).filter(function (e) { return !cls || e.cls === cls; }).forEach(function (e) { if (examNames.indexOf(e.name) === -1) examNames.push(e.name); });
  examNames.sort();
  var examName = examNames.indexOf(state.rcExam) !== -1 ? state.rcExam : '';
  var roster = cls ? db.students.filter(function (s) { return s.cls === cls && isEnrolledStudent(s); }) : [];
  var stu = roster.filter(function (s) { return s.id === state.rcStudent; })[0] || null;
  var rc = (stu && examName) ? buildReportCard(db, stu.id, examName) : null;
  var clsOpts = '<option value="">' + esc(t('rcChoose')) + '</option>' + classes.map(function (c) { return '<option value="' + esc(c) + '" ' + (c === cls ? 'selected' : '') + '>' + esc(c) + '</option>'; }).join('');
  var examOpts = '<option value="">' + esc(t('rcChoose')) + '</option>' + examNames.map(function (n) { return '<option value="' + esc(n) + '" ' + (n === examName ? 'selected' : '') + '>' + esc(n) + '</option>'; }).join('');
  var stuOpts = '<option value="">' + esc(t('rcChoose')) + '</option>' + roster.map(function (s) { return '<option value="' + esc(s.id) + '" ' + (stu && s.id === stu.id ? 'selected' : '') + '>' + esc(s.name) + ' (' + esc(s.roll) + ')</option>'; }).join('');
  var body = '<div class="toolbar"><select id="rcClsSel" aria-label="Class" onchange="state.rcCls=this.value;state.rcExam=\'\';state.rcStudent=\'\';renderPage()">' + clsOpts + '</select>' +
    '<select id="rcExamSel" aria-label="Exam" onchange="state.rcExam=this.value;state.rcStudent=\'\';renderPage()" ' + (cls ? '' : 'disabled') + '>' + examOpts + '</select>' +
    '<select id="rcStuSel" aria-label="Student" onchange="state.rcStudent=this.value;renderPage()" ' + (examName ? '' : 'disabled') + '>' + stuOpts + '</select></div>';
  if (cls && !examNames.length) body += '<p class="muted">' + esc(t('rcNoExams')) + '</p>';
  else if (cls && !roster.length) body += '<p class="muted">' + esc(t('rcNoStudents')) + '</p>';
  else if (rc) body += '<div class="tbl-wrap">' + reportCardTableHTML(rc) + '</div><div class="actions"><button class="btn" onclick="printReportCard(' + jsAttr(stu.id) + ', ' + jsAttr(examName) + ')">🖨 ' + t('rcPrint') + '</button></div>';
  else if (cls) body += '<p class="muted">' + esc(t('rcNoCard')) + '</p>';
  return '<div class="card"><h3>📄 ' + t('rcTitle') + '</h3><p class="card-sub">' + t('rcSub') + '</p>' + body + '</div>';
}
function reportsPage() {
  return '<div class="page-head"><div><h2>' + t('reports') + '</h2><p>' + t('subReports') + ' — ' + esc(db.profile.name) + '</p></div></div>' +
  '<div class="grid2e">' +
  '<div class="card"><h3>' + t('studentsReport') + '</h3><p class="card-sub">' + t('repStudentsSub') + '</p><button class="btn" onclick="downloadReportCSV(\'students\')">⬇ ' + t('dlStudents') + '</button></div>' +
  '<div class="card"><h3>' + t('feesReport') + '</h3><p class="card-sub">' + t('repFeesSub') + '</p><button class="btn" onclick="downloadReportCSV(\'fees\')">⬇ ' + t('dlFees') + '</button></div>' +
  '<div class="card"><h3>' + t('attReport') + '</h3><p class="card-sub">Register — Class ' + state.attCls + ' • ' + (state.attDate || todayIST()) + '</p><button class="btn" onclick="downloadReportCSV(\'attendance\')">⬇ ' + t('dlAtt') + '</button></div>' +
  '</div>' + reportCardCard();
}
function downloadReportCSV(kind) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  if (kind === 'students') {
    var fsmRep = feeStatusMap(); // Perf (v154): one pass for the whole export
    downloadCSV('school-saathi-students.csv', [['Name', 'Class', 'Roll', 'Guardian', 'Phone', 'Attendance %', 'Fee Status']]
      .concat(db.students.map(function (s) { return [s.name, s.cls, s.roll, s.guardian, s.phone, studentAttPct(s), fsmRep[s.id] || '—']; })));
  } else if (kind === 'fees') {
    downloadCSV('school-saathi-fees.csv', feeCSVRows());
  } else if (kind === 'attendance') {
    var aDate = state.attDate || todayIST();
    var recs = db.attendance[aDate + '|' + state.attCls] || {};
    downloadCSV('school-saathi-attendance.csv', [['Student', 'Class', 'Roll', 'Date', 'Status']]
      .concat(db.students.filter(function (s) { return s.cls === state.attCls && isEnrolledStudent(s); })
        .map(function (s) { return [s.name, s.cls, s.roll, aDate, recs[s.id] || t('attNotMarked')]; })));
  }
  toast('✓ ' + t('tReportDl'));
}
function feeCSVRows() {
  return [['Student', 'Enr', 'Class', 'Month', 'Type', 'Amount (INR)', 'Date', 'Status']]
    .concat(feeRecordsDeduped().map(function (r) { return [r.student, enrOf(r.studentId), r.cls, r.month, feeTypeOf(r), r.amount, r.date, r.status]; }));
}
