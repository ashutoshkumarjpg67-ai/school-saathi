/* School Saathi — Transfer Certificate (TC) & Character Certificate Generator (v176)
   100% free, offline-capable, print-ready A4 certificates for Bihar schools.
   Never prints Aadhaar numbers. Routes school logo through sbDisplayPhoto() with onerror. */

function certDefaultNo(type, s) {
  var yr = (typeof todayIST === 'function' ? todayIST() : new Date().toISOString().slice(0, 10)).slice(0, 4);
  var tail = String((s && (s.admissionNo || s.roll || s.id)) || '001').replace(/[^A-Za-z0-9]/g, '').slice(-4) || '001';
  return (type === 'cc' ? 'CC' : 'TC') + '-' + yr + '-' + tail;
}

function buildCertificateHtml(s, opts) {
  opts = opts || {};
  var p = (typeof db !== 'undefined' && db && db.profile) ? db.profile : {};
  var type = opts.type === 'cc' ? 'cc' : 'tc';
  var certNo = opts.certNo || certDefaultNo(type, s);
  var issueDate = opts.issueDate || (typeof todayIST === 'function' ? todayIST() : new Date().toISOString().slice(0, 10));
  var leavingDate = opts.leavingDate || issueDate;
  var conduct = opts.conduct || 'Good';
  var reason = opts.reason || 'Higher Studies';
  var promoted = opts.promoted || 'Yes';
  var dues = opts.dues || 'All school dues cleared';
  var remarks = opts.remarks || 'Wishing the student a bright future.';

  var logoSrc = p.logo ? (typeof sbDisplayPhoto === 'function' ? sbDisplayPhoto(p.logo) : p.logo) : '';
  var logoHtml = logoSrc
    ? '<img class="cert-logo" src="' + esc(logoSrc) + '" alt="" onerror="this.remove()">'
    : '<span class="cert-logo-cap">🎓</span>';
  var stuPhotoSrc = s.photo ? (typeof sbDisplayPhoto === 'function' ? sbDisplayPhoto(s.photo) : s.photo) : '';
  var stuPhotoHtml = stuPhotoSrc
    ? '<div class="cert-photo"><img src="' + esc(stuPhotoSrc) + '" alt="" onerror="this.parentElement.remove()"></div>'
    : '';

  var schoolAddr = [p.address, p.city, p.phone ? 'Ph: ' + p.phone : ''].filter(Boolean).join(' • ');
  var header = '<div class="cert-head">' + logoHtml +
    '<div class="cert-school-info"><div class="cert-school">' + esc(p.name || 'School Saathi') + '</div>' +
    (schoolAddr ? '<div class="cert-addr">' + esc(schoolAddr) + '</div>' : '') +
    (p.session ? '<div class="cert-addr">Academic Session: ' + esc(p.session) + '</div>' : '') +
    '</div>' + stuPhotoHtml + '</div>';

  var metaBar = '<div class="cert-meta"><span><b>Certificate No.:</b> ' + esc(certNo) + '</span>' +
    '<span><b>Admission No.:</b> ' + esc(s.admissionNo || s.enr || '—') + '</span>' +
    '<span><b>Date:</b> ' + esc(issueDate) + '</span></div>';

  var bodyHtml = '';
  if (type === 'tc') {
    var rows = [
      ['1. Name of Student', s.name || '—'],
      ['2. Father\'s / Guardian\'s Name', s.fatherName || s.guardian || '—'],
      ['3. Mother\'s Name', s.motherName || '—'],
      ['4. Date of Birth', s.dob || '—'],
      ['5. Gender / Category', [s.gender || '—', s.category || ''].filter(Boolean).join(' / ')],
      ['6. Date of Admission in School', s.admissionDate || '—'],
      ['7. Class Last Studied', s.cls || '—'],
      ['8. Whether Qualified for Promotion', promoted],
      ['9. Date of Leaving School', leavingDate],
      ['10. Reason for Leaving', reason],
      ['11. School Dues Status', dues],
      ['12. General Conduct & Character', conduct],
      ['13. Remarks', remarks]
    ];
    bodyHtml = '<div class="cert-title">TRANSFER CERTIFICATE (स्थानांतरण प्रमाण-पत्र)</div>' +
      metaBar +
      '<table class="cert-table"><tbody>' +
      rows.map(function (r) {
        return '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>';
      }).join('') +
      '</tbody></table>';
  } else {
    var pron = (s.gender || '').toLowerCase() === 'female' ? 'daughter' : 'son';
    var subPron = (s.gender || '').toLowerCase() === 'female' ? 'She' : 'He';
    var possPron = (s.gender || '').toLowerCase() === 'female' ? 'her' : 'his';
    bodyHtml = '<div class="cert-title">CHARACTER CERTIFICATE (चरित्र प्रमाण-पत्र)</div>' +
      metaBar +
      '<div class="cert-body">' +
      '<p>This is to certify that <b>' + esc(s.name || '—') + '</b>, ' + pron + ' of Shri <b>' + esc(s.fatherName || s.guardian || '—') + '</b>' +
      (s.motherName ? ' and Smt. <b>' + esc(s.motherName) + '</b>' : '') +
      ', bearing Admission No. <b>' + esc(s.admissionNo || s.enr || '—') + '</b>, was a bonafide student of this school in Class <b>' + esc(s.cls || '—') + '</b>' +
      (p.session ? ' during the academic session <b>' + esc(p.session) + '</b>' : '') + '.</p>' +
      (s.dob ? '<p>As per the school admission register, ' + possPron + ' date of birth is <b>' + esc(s.dob) + '</b>.</p>' : '') +
      '<p>To the best of my knowledge and belief, ' + subPron.toLowerCase() + ' bears a <b>' + esc(conduct) + '</b> moral character and ' + possPron + ' conduct and behaviour in the school have been satisfactory.</p>' +
      (remarks ? '<p>' + esc(remarks) + '</p>' : '') +
      '</div>';
  }

  var footer = '<div class="cert-foot">' +
    '<div class="cert-sign"><div class="cert-sign-line"></div>Class Teacher / Clerk</div>' +
    '<div class="cert-seal">School Seal</div>' +
    '<div class="cert-sign"><div class="cert-sign-line"></div>Principal / Headmaster' + (p.principal ? '<br><small>' + esc(p.principal) + '</small>' : '') + '</div>' +
    '</div>';

  return '<div class="cert-doc"><div class="cert-border">' + header + bodyHtml + footer + '</div></div>';
}

function readCertFormOpts(s) {
  var g = function (id, fb) { var el = typeof $ === 'function' ? $(id) : null; return el ? (el.value || '').trim() : fb; };
  var type = g('certType', 'tc');
  return {
    type: type,
    certNo: g('certNo', certDefaultNo(type, s)),
    issueDate: g('certIssueDate', typeof todayIST === 'function' ? todayIST() : ''),
    leavingDate: g('certLeaveDate', typeof todayIST === 'function' ? todayIST() : ''),
    reason: g('certReason', 'Higher Studies'),
    promoted: g('certPromoted', 'Yes'),
    conduct: g('certConduct', 'Good'),
    dues: g('certDues', 'All school dues cleared'),
    remarks: g('certRemarks', 'Wishing the student a bright future.')
  };
}

function refreshCertPreview(sid) {
  var s = (db.students || []).find(function (x) { return x.id === sid; });
  if (!s) return;
  var opts = readCertFormOpts(s);
  var tcOnly = document.querySelectorAll('.cert-tc-only');
  for (var i = 0; i < tcOnly.length; i++) tcOnly[i].style.display = opts.type === 'tc' ? '' : 'none';
  var prev = $('certPreviewBox');
  if (prev) prev.innerHTML = buildCertificateHtml(s, opts);
}

function onCertTypeChange(sid) {
  var s = (db.students || []).find(function (x) { return x.id === sid; });
  if (!s) return;
  var typeEl = $('certType'), noEl = $('certNo');
  if (typeEl && noEl) noEl.value = certDefaultNo(typeEl.value, s);
  refreshCertPreview(sid);
}

function printCertificate(sid) {
  var s = (db.students || []).find(function (x) { return x.id === sid; });
  if (!s) return;
  var opts = readCertFormOpts(s);
  var html = buildCertificateHtml(s, opts);
  var pa = $('printArea');
  if (pa) pa.innerHTML = html;
  if (typeof logAudit === 'function') {
    logAudit(opts.type === 'cc' ? 'Character certificate printed' : 'TC printed',
      (s.name || '') + ' • ' + (s.admissionNo || '') + ' • ' + opts.certNo);
  }
  if (typeof window !== 'undefined' && window.print) window.print();
}

function openCertModal(sid) {
  if (state.role !== 'school' && state.role !== 'principal') {
    if (typeof toast === 'function') toast(t('tNotAllowed'));
    return;
  }
  var s = (db.students || []).find(function (x) { return x.id === sid; });
  if (!s) return;
  var hi = state.lang === 'hi';
  var sum = typeof feeSummaryFor === 'function' ? feeSummaryFor(s.id) : null;
  var defaultDues = (sum && sum.pending > 0)
    ? ('Pending Rs. ' + sum.pending)
    : 'All school dues cleared';
  var today = typeof todayIST === 'function' ? todayIST() : new Date().toISOString().slice(0, 10);
  var initOpts = {
    type: 'tc',
    certNo: certDefaultNo('tc', s),
    issueDate: today,
    leavingDate: today,
    reason: 'Higher Studies',
    promoted: 'Yes',
    conduct: 'Good',
    dues: defaultDues,
    remarks: 'Wishing the student a bright future.'
  };
  var body = '<h3>📜 ' + (hi ? 'टीसी और चरित्र प्रमाण-पत्र (TC / Character Certificate)' : 'TC & Character Certificate') + '</h3>' +
    '<div class="form-grid">' +
      '<div><label>' + (hi ? 'प्रमाण-पत्र प्रकार' : 'Certificate Type') + '</label>' +
        '<select id="certType" onchange="onCertTypeChange(\'' + s.id + '\')">' +
          '<option value="tc">Transfer Certificate (TC / स्थानांतरण प्रमाण-पत्र)</option>' +
          '<option value="cc">Character Certificate (चरित्र प्रमाण-पत्र)</option>' +
        '</select></div>' +
      '<div><label>' + (hi ? 'प्रमाण-पत्र संख्या' : 'Certificate No.') + '</label><input id="certNo" value="' + esc(initOpts.certNo) + '" oninput="refreshCertPreview(\'' + s.id + '\')"></div>' +
      '<div><label>' + (hi ? 'जारी दिनांक' : 'Issue Date') + '</label><input id="certIssueDate" type="date" value="' + esc(today) + '" onchange="refreshCertPreview(\'' + s.id + '\')"></div>' +
      '<div><label>' + (hi ? 'आचरण / चरित्र' : 'Conduct & Character') + '</label>' +
        '<select id="certConduct" onchange="refreshCertPreview(\'' + s.id + '\')">' +
          '<option value="Excellent">Excellent</option>' +
          '<option value="Very Good">Very Good</option>' +
          '<option value="Good" selected>Good</option>' +
          '<option value="Satisfactory">Satisfactory</option>' +
        '</select></div>' +
      '<div class="cert-tc-only"><label>' + (hi ? 'स्कूल छोड़ने की तिथि' : 'Date of Leaving') + '</label><input id="certLeaveDate" type="date" value="' + esc(today) + '" onchange="refreshCertPreview(\'' + s.id + '\')"></div>' +
      '<div class="cert-tc-only"><label>' + (hi ? 'अगली कक्षा में प्रोन्नत' : 'Promoted to Next Class') + '</label>' +
        '<select id="certPromoted" onchange="refreshCertPreview(\'' + s.id + '\')">' +
          '<option value="Yes" selected>Yes</option>' +
          '<option value="No">No</option>' +
          '<option value="Result Awaited">Result Awaited</option>' +
        '</select></div>' +
      '<div class="cert-tc-only"><label>' + (hi ? 'छोड़ने का कारण' : 'Reason for Leaving') + '</label><input id="certReason" value="Higher Studies" oninput="refreshCertPreview(\'' + s.id + '\')"></div>' +
      '<div class="cert-tc-only"><label>' + (hi ? 'फीस बकाया स्थिति' : 'School Dues Status') + '</label><input id="certDues" value="' + esc(defaultDues) + '" oninput="refreshCertPreview(\'' + s.id + '\')"></div>' +
      '<div class="full"><label>' + (hi ? 'टिप्पणी (Remarks)' : 'Remarks') + '</label><input id="certRemarks" value="' + esc(initOpts.remarks) + '" oninput="refreshCertPreview(\'' + s.id + '\')"></div>' +
    '</div>' +
    '<div id="certPreviewBox" class="mt-16">' + buildCertificateHtml(s, initOpts) + '</div>' +
    '<div class="actions">' +
      '<button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button>' +
      '<button type="button" class="btn" onclick="printCertificate(\'' + s.id + '\')">🖨️ ' + (hi ? 'प्रिंट / PDF सेव करें' : 'Print / Save PDF') + '</button>' +
    '</div>';
  openModal(body, { wide: true });
}
