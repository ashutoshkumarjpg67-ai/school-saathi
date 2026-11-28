import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAppContext } from '../harness.mjs';

test('v176: Transfer Certificate (TC) renders school details, student details, and never leaks Aadhaar', () => {
  const app = createAppContext();
  const html = app.run(`(function () {
    db.profile = { name: 'Don Basco Public School', address: 'Manikpur, Gopalganj', city: 'Bihar', phone: '9876543210', principal: 'A. Kumar', session: '2026–27' };
    var stu = { id: 's1', name: 'Aarav Verma', fatherName: 'Rajesh Verma', motherName: 'Sunita Devi', dob: '2014-05-12', cls: '6th-A', admissionNo: 'ADM-2026-001', admissionDate: '2024-04-01', gender: 'Male', aadhaar: '123456789012' };
    return buildCertificateHtml(stu, { type: 'tc', certNo: 'TC-2026-001', reason: 'Parent Transfer', conduct: 'Very Good', promoted: 'Yes', dues: 'All school dues cleared' });
  })()`);
  assert.match(html, /TRANSFER CERTIFICATE/);
  assert.match(html, /Don Basco Public School/);
  assert.match(html, /Aarav Verma/);
  assert.match(html, /Rajesh Verma/);
  assert.match(html, /TC-2026-001/);
  assert.match(html, /Parent Transfer/);
  assert.match(html, /Very Good/);
  assert.doesNotMatch(html, /123456789012/, 'Aadhaar must never appear on TC');
});

test('v176: Character Certificate renders formal bonafide text and escapes HTML safely', () => {
  const app = createAppContext();
  const html = app.run(`(function () {
    db.profile = { name: 'Sunrise School', session: '2026–27' };
    var stu = { id: 's2', name: 'Priya <script>x</script>', fatherName: 'Mohan Lal', cls: '10th-A', admissionNo: 'ADM-10', gender: 'Female' };
    return buildCertificateHtml(stu, { type: 'cc', certNo: 'CC-2026-010', conduct: 'Excellent' });
  })()`);
  assert.match(html, /CHARACTER CERTIFICATE/);
  assert.match(html, /daughter of Shri/);
  assert.match(html, /Excellent/);
  assert.doesNotMatch(html, /<script>/, 'student name must be HTML-escaped');
});

test('v176: Student Profile toolbar exposes TC / Certificate button for school admin', () => {
  const app = createAppContext();
  const html = app.run(`(function () {
    db = seedDB();
    state.role = 'school';
    state.user = { role: 'school', name: 'Admin' };
    return studentProfilePage(db.students[0].id);
  })()`);
  assert.match(html, /openCertModal\(/);
  assert.match(html, /TC \/ Certificate/);
});
