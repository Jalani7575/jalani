/* Cerebrox Learning Academy — user interface. */
(function () {
  'use strict';
  const C = window.Calc;
  const S = window.Store;

  let state = S.load();
  let month = sessionStorage.getItem('cla-month') || C.thisMonth();
  const ui = { studentQuery: '', studentStatus: 'active', feeQuery: '', feeFilter: 'all', openTeacher: null };

  /* ---------------- helpers ---------------- */
  const $ = (sel, el) => (el || document).querySelector(sel);
  const esc = (v) => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(C.round2(n)).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const money = (n) => esc(state.settings.currency) + ' ' + fmt(n);
  const byId = (list, id) => list.find((x) => x.id === id);
  const teacherName = (id) => (byId(state.teachers, id) || {}).name || '—';
  const studentOf = (id) => byId(state.students, id) || { name: '(deleted student)', rollNo: '', fatherName: '', className: '' };
  const pct = (n) => fmt(n) + '%';
  const statusBadge = (st) => '<span class="badge ' + st + '">' + ({ paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid', active: 'Active', left: 'Left' }[st] || esc(st)) + '</span>';

  function save() { C.syncAll(state, month); S.save(state); }
  function persistAndRender(msg) { save(); render(); if (msg) toast(msg); }

  function toast(msg, kind) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'show ' + (kind || '');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.className = ''; }, 2800);
  }

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type: type || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  function downloadCSV(name, rows) {
    const csv = rows.map((r) => r.map((v) => {
      const s = String(v === null || v === undefined ? '' : v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
    downloadFile(name, '﻿' + csv, 'text/csv;charset=utf-8');
  }

  /* ---------------- modal ---------------- */
  function openModal(opts) {
    const root = $('#modal-root');
    root.innerHTML =
      '<div class="modal-backdrop"><form class="modal ' + (opts.wide ? 'wide' : '') + '" novalidate>' +
      '<header><h2>' + esc(opts.title) + '</h2><button type="button" class="icon-btn" data-close aria-label="Close">×</button></header>' +
      '<div class="modal-body">' + opts.body + '</div>' +
      '<footer>' + (opts.extraButtons || '') + '<span class="spacer"></span><button type="button" class="btn" data-close>' + (opts.onSubmit ? 'Cancel' : 'Close') + '</button>' +
      (opts.onSubmit ? '<button class="btn primary" type="submit">' + esc(opts.submitLabel || 'Save') + '</button>' : '') +
      '</footer></form></div>';
    const form = $('form', root);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const invalid = [...form.elements].find((el) => el.willValidate && !el.checkValidity());
      if (invalid) { invalid.reportValidity(); return; }
      const fd = new FormData(form);
      const data = Object.fromEntries(fd);
      try {
        if (opts.onSubmit(data, fd, form) !== false) closeModal();
      } catch (err) { toast(err.message, 'error'); }
    });
    root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    $('.modal-backdrop', root).addEventListener('mousedown', (e) => { if (e.target.classList.contains('modal-backdrop')) closeModal(); });
    if (opts.onOpen) opts.onOpen(form);
    const first = form.querySelector('input:not([type=hidden]):not([type=checkbox]),select,textarea');
    if (first) setTimeout(() => first.focus(), 30);
    return form;
  }
  function closeModal() { $('#modal-root').innerHTML = ''; }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  const field = (label, html, hint) => '<label class="field"><span>' + label + '</span>' + html + (hint ? '<small>' + hint + '</small>' : '') + '</label>';
  const input = (name, value, attrs) => '<input name="' + name + '" value="' + esc(value) + '" ' + (attrs || '') + '>';
  const select = (name, options, value, attrs) => '<select name="' + name + '" ' + (attrs || '') + '>' + options.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(v) === String(value) ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>';

  /* ---------------- printing ---------------- */
  function printHTML(html) {
    $('#print-area').innerHTML = html;
    window.print();
  }
  function letterhead() {
    const st = state.settings;
    return '<div class="lh"><div class="lh-logo">C</div><div><h2>' + esc(st.academyName) + '</h2><p>' + esc([st.address, st.phone].filter(Boolean).join(' · ')) + '</p></div></div>';
  }

  function receiptHTML(receiptNo) {
    const r = C.receipt(state, receiptNo);
    if (!r) return '<p>Receipt not found.</p>';
    const s = studentOf(r.studentId);
    const balance = C.studentDue(state, r.studentId);
    return '<div class="doc">' + letterhead() +
      '<div class="doc-title">FEE RECEIPT <span>' + esc(r.receiptNo) + '</span></div>' +
      '<div class="doc-meta"><div><b>Student:</b> ' + esc(s.name) + ' (' + esc(s.rollNo) + ')</div><div><b>Father:</b> ' + esc(s.fatherName) + '</div>' +
      '<div><b>Class:</b> ' + esc(s.className) + '</div><div><b>Date:</b> ' + esc(r.date) + ' · <b>Mode:</b> ' + esc(r.mode) + '</div></div>' +
      '<table class="tbl"><thead><tr><th>Fee month</th><th>Subjects</th><th class="num">Bill</th><th class="num">Received</th></tr></thead><tbody>' +
      r.rows.map((x) => '<tr><td>' + C.monthLabel(x.month) + '</td><td>' + x.invoice.lines.map((l) => esc(l.subjectName)).join(', ') + '</td><td class="num">' + money(C.invoiceTotals(x.invoice).net) + '</td><td class="num">' + money(x.amount) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><th colspan="3">Total received</th><th class="num">' + money(r.total) + '</th></tr>' +
      '<tr><td colspan="3">Remaining balance (all months)</td><td class="num">' + money(balance) + '</td></tr></tfoot></table>' +
      (r.note ? '<p><b>Note:</b> ' + esc(r.note) + '</p>' : '') +
      '<div class="sign"><span>Received by</span><span>Signature</span></div></div>';
  }

  function feeSlipHTML(inv) {
    const s = studentOf(inv.studentId);
    const t = C.invoiceTotals(inv);
    const prev = C.studentDue(state, inv.studentId, inv.month);
    return '<div class="doc">' + letterhead() +
      '<div class="doc-title">MONTHLY FEE SLIP <span>' + C.monthLabel(inv.month) + '</span></div>' +
      '<div class="doc-meta"><div><b>Student:</b> ' + esc(s.name) + ' (' + esc(s.rollNo) + ')</div><div><b>Father:</b> ' + esc(s.fatherName) + '</div><div><b>Class:</b> ' + esc(s.className) + '</div><div><b>Issued:</b> ' + C.today() + '</div></div>' +
      '<table class="tbl"><thead><tr><th>Subject</th><th class="num">Tuition</th><th class="num">Stationery</th><th class="num">Total</th></tr></thead><tbody>' +
      inv.lines.map((l) => '<tr><td>' + esc(l.subjectName) + '</td><td class="num">' + money(l.tuition) + '</td><td class="num">' + money(l.stationery) + '</td><td class="num">' + money(l.tuition + l.stationery) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td>Sub-total</td><td class="num">' + money(t.tuition) + '</td><td class="num">' + money(t.stationery) + '</td><td class="num">' + money(t.gross) + '</td></tr>' +
      (t.discount ? '<tr><td colspan="3">Concession</td><td class="num">− ' + money(t.discount) + '</td></tr>' : '') +
      '<tr><td colspan="3">This month fee</td><td class="num">' + money(t.net) + '</td></tr>' +
      (t.paid ? '<tr><td colspan="3">Already paid</td><td class="num">− ' + money(t.paid) + '</td></tr>' : '') +
      (prev ? '<tr><td colspan="3">Previous dues</td><td class="num">' + money(prev) + '</td></tr>' : '') +
      '<tr><th colspan="3">Total payable</th><th class="num">' + money(t.due + prev) + '</th></tr></tfoot></table>' +
      '<div class="sign"><span>Accounts office</span><span>Parent signature</span></div></div>';
  }

  function showReceipt(receiptNo) {
    openModal({
      title: 'Receipt ' + receiptNo,
      body: receiptHTML(receiptNo),
      wide: true,
      extraButtons: '<button type="button" class="btn primary" id="print-receipt">Print</button>',
      onOpen: (f) => $('#print-receipt', f).addEventListener('click', () => printHTML(receiptHTML(receiptNo))),
    });
  }

  /* ---------------- layout / routing ---------------- */
  const PAGES = {
    dashboard: { title: 'Dashboard', render: pageDashboard },
    students: { title: 'Students', render: pageStudents },
    student: { title: 'Student profile', render: pageStudent },
    fees: { title: 'Monthly Fees', render: pageFees },
    subjects: { title: 'Subjects & Fees', render: pageSubjects },
    teachers: { title: 'Teachers', render: pageTeachers },
    payouts: { title: 'Teacher Payments', render: pagePayouts },
    reports: { title: 'Reports', render: pageReports },
    settings: { title: 'Settings & Backup', render: pageSettings },
  };

  function route() {
    const parts = (location.hash || '#/dashboard').replace(/^#\/?/, '').split('/');
    return { page: PAGES[parts[0]] ? parts[0] : 'dashboard', id: parts[1] ? decodeURIComponent(parts[1]) : null };
  }

  function render() {
    const r = route();
    const page = PAGES[r.page];
    document.title = page.title + ' · ' + state.settings.academyName;
    $('#page-title').textContent = page.title;
    $('#brand-name').textContent = state.settings.academyName;
    $('#month-picker').value = month;
    $('#month-wrap').style.display = ['dashboard', 'fees', 'payouts', 'reports', 'subjects', 'teachers', 'students', 'student'].includes(r.page) ? '' : 'none';
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#/' + (r.page === 'student' ? 'students' : r.page)));
    $('#view').innerHTML = page.render(r.id);
    document.body.classList.remove('nav-open');
  }

  function setMonth(m) {
    if (!C.isMonth(m)) return;
    month = m;
    sessionStorage.setItem('cla-month', m);
    if (C.syncAll(state, month)) S.save(state);
    render();
  }

  /* ---------------- dashboard ---------------- */
  function kpi(label, value, sub, cls) {
    return '<div class="kpi ' + (cls || '') + '"><span>' + label + '</span><b>' + value + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
  }

  function pageDashboard() {
    if (!state.subjects.length && !state.students.length) {
      return '<div class="empty card"><h2>Welcome to ' + esc(state.settings.academyName) + '</h2>' +
        '<p>Start by adding your teachers and subjects (with monthly tuition &amp; stationery fees), then enroll students. Bills, dues and teacher payments are calculated automatically.</p>' +
        '<div class="row gap"><a class="btn primary" href="#/teachers">1. Add teachers</a><a class="btn primary" href="#/subjects">2. Add subjects &amp; fees</a><a class="btn primary" href="#/students">3. Enroll students</a></div>' +
        '<p class="muted">Want to explore first? <button class="link" data-action="load-sample">Load sample data</button></p></div>';
    }
    const sm = C.monthSummary(state, month);
    const arrears = state.invoices.filter((i) => i.month < month).reduce((a, i) => a + C.invoiceTotals(i).due, 0);
    const active = state.students.filter((s) => s.status !== 'left').length;
    const collectionRate = sm.billed ? (sm.collected / sm.billed) * 100 : 0;

    const payments = [];
    for (const inv of state.invoices) for (const p of inv.payments) payments.push({ p, inv });
    const recentByReceipt = new Map();
    payments.sort((a, b) => (b.p.date + b.p.receiptNo).localeCompare(a.p.date + a.p.receiptNo)).forEach(({ p, inv }) => {
      const r = recentByReceipt.get(p.receiptNo) || { receiptNo: p.receiptNo, date: p.date, studentId: inv.studentId, amount: 0 };
      r.amount += p.amount; recentByReceipt.set(p.receiptNo, r);
    });
    const recent = [...recentByReceipt.values()].slice(0, 8);

    const dues = state.students.map((s) => ({ s, due: C.studentDue(state, s.id) })).filter((x) => x.due > 0).sort((a, b) => b.due - a.due).slice(0, 8);

    return '<div class="kpis">' +
      kpi('Active students', active, sm.students + ' billed in ' + C.monthLabel(month)) +
      kpi('Fee billed', money(sm.billed), 'Tuition ' + money(sm.tuition - sm.discount) + ' · Stationery ' + money(sm.stationery)) +
      kpi('Collected', money(sm.collected), pct(collectionRate) + ' of this month', 'good') +
      kpi('Outstanding (this month)', money(sm.outstanding), sm.unpaidCount + ' unpaid · ' + sm.partialCount + ' partial', 'warn') +
      kpi('Previous arrears', money(arrears), 'Unpaid from earlier months', arrears ? 'bad' : '') +
      kpi('Teacher payable', money(sm.teacherPayable), money(sm.teacherPaid) + ' paid · basis: ' + state.settings.payoutBasis) +
      kpi('Academy share', money(sm.academyShare), (100 - state.settings.teacherShare) + '% tuition + all stationery', 'accent') +
      '</div>' +
      '<section class="card"><header class="card-h"><h3>Subject-wise · ' + C.monthLabel(month) + '</h3><a href="#/reports" class="link">Reports →</a></header>' + subjectTable(sm) + '</section>' +
      '<section class="card"><header class="card-h"><h3>Highest dues</h3><a href="#/fees" class="link">Collect fees →</a></header>' +
      (dues.length ? '<table class="tbl"><thead><tr><th>Student</th><th>Class</th><th class="num">Total due</th><th></th></tr></thead><tbody>' +
        dues.map((d) => '<tr><td><a href="#/student/' + d.s.id + '">' + esc(d.s.name) + '</a></td><td>' + esc(d.s.className) + '</td><td class="num">' + money(d.due) + '</td><td class="num"><button class="btn sm" data-action="collect" data-id="' + d.s.id + '">Collect</button></td></tr>').join('') +
        '</tbody></table>' : '<p class="muted pad">No dues. Everyone has paid. 🎉</p>') +
      '</section>' +
      '<section class="card"><header class="card-h"><h3>Recent payments</h3></header>' +
      (recent.length ? '<table class="tbl"><thead><tr><th>Receipt</th><th>Date</th><th>Student</th><th class="num">Amount</th></tr></thead><tbody>' +
        recent.map((r) => '<tr><td><button class="link" data-action="receipt" data-no="' + esc(r.receiptNo) + '">' + esc(r.receiptNo) + '</button></td><td>' + esc(r.date) + '</td><td>' + esc(studentOf(r.studentId).name) + '</td><td class="num">' + money(r.amount) + '</td></tr>').join('') +
        '</tbody></table>' : '<p class="muted pad">No payments recorded yet.</p>') + '</section></div>';
  }

  function subjectTable(sm) {
    if (!sm.perSubject.length) return '<p class="muted pad">No bills for this month.</p>';
    return '<div class="scroll"><table class="tbl"><thead><tr><th>Subject</th><th>Teacher</th><th class="num">Students</th><th class="num">Tuition</th><th class="num">Stationery</th><th class="num">Teacher share</th><th class="num">Academy share</th></tr></thead><tbody>' +
      sm.perSubject.map((x) => '<tr><td>' + esc(x.name) + '</td><td>' + esc(teacherName(x.teacherId)) + '</td><td class="num">' + x.students + '</td><td class="num">' + money(x.tuition) + '</td><td class="num">' + money(x.stationery) + '</td><td class="num">' + money(x.teacherShare) + '</td><td class="num">' + money(x.academyShare) + '</td></tr>').join('') +
      '</tbody></table></div>';
  }

  /* ---------------- students ---------------- */
  function monthlyFeeOf(s, m) {
    return C.buildLines(state, s, m).reduce((a, l) => a + l.tuition + l.stationery, 0) - (C.num(s.concession) || 0);
  }

  function pageStudents() {
    const q = ui.studentQuery.toLowerCase();
    const list = state.students
      .filter((s) => ui.studentStatus === 'all' || (ui.studentStatus === 'left' ? s.status === 'left' : s.status !== 'left'))
      .filter((s) => !q || [s.name, s.fatherName, s.rollNo, s.phone, s.className].join(' ').toLowerCase().includes(q))
      .sort((a, b) => a.rollNo.localeCompare(b.rollNo));
    return '<div class="toolbar"><input type="search" id="student-search" placeholder="Search name, roll no, phone, class…" value="' + esc(ui.studentQuery) + '">' +
      select('student-status', [['active', 'Active'], ['left', 'Left'], ['all', 'All']], ui.studentStatus, 'id="student-status"') +
      '<span class="spacer"></span><button class="btn" data-action="export-students">Export CSV</button><button class="btn primary" data-action="add-student">+ Enroll student</button></div>' +
      (!state.subjects.length ? '<div class="note">Add subjects first so you can enroll students in them. <a href="#/subjects">Go to Subjects →</a></div>' : '') +
      '<section class="card"><div class="scroll"><table class="tbl"><thead><tr><th>Roll no</th><th>Name</th><th>Father</th><th>Class</th><th>Phone</th><th>Subjects (' + C.monthLabel(month) + ')</th><th class="num">Monthly fee</th><th class="num">Total due</th><th>Status</th><th></th></tr></thead><tbody>' +
      (list.length ? list.map((s) => {
        const subs = C.enrolledSubjectIds(s, month).map((id) => (byId(state.subjects, id) || {}).name).filter(Boolean);
        const due = C.studentDue(state, s.id);
        return '<tr><td class="nowrap">' + esc(s.rollNo) + '</td><td><a href="#/student/' + s.id + '">' + esc(s.name) + '</a></td><td>' + esc(s.fatherName) + '</td><td>' + esc(s.className) + '</td><td>' + esc(s.phone) + '</td><td>' + subs.map((n) => '<span class="chip">' + esc(n) + '</span>').join(' ') + '</td>' +
          '<td class="num">' + money(Math.max(0, monthlyFeeOf(s, month))) + '</td><td class="num ' + (due ? 'bad-t' : '') + '">' + money(due) + '</td><td>' + statusBadge(s.status === 'left' ? 'left' : 'active') + '</td>' +
          '<td class="num nowrap"><button class="btn sm" data-action="collect" data-id="' + s.id + '"' + (due ? '' : ' disabled') + '>Collect</button> <button class="btn sm" data-action="edit-student" data-id="' + s.id + '">Edit</button></td></tr>';
      }).join('') : '<tr><td colspan="10" class="muted center">No students found.</td></tr>') +
      '</tbody></table></div></section>';
  }

  function studentForm(s) {
    const isNew = !s;
    s = s || { name: '', fatherName: '', phone: '', className: '', address: '', admissionDate: C.today(), status: 'active', leftDate: '', concession: 0, enrollments: [] };
    const effDefault = isNew ? '' : month;
    const enrolled = new Set(isNew ? [] : C.enrolledSubjectIds(s, month));
    const subjectChecks = state.subjects.length ? state.subjects.map((sub) => {
      const fee = C.feeFor(sub, month) || { tuition: 0, stationery: 0 };
      return '<label class="check"><input type="checkbox" name="subjects" value="' + sub.id + '"' + (enrolled.has(sub.id) ? ' checked' : '') + ' data-fee="' + (C.num(fee.tuition) + C.num(fee.stationery)) + '"><span><b>' + esc(sub.name) + '</b><small>' + esc(teacherName(sub.teacherId)) + ' · Tuition ' + money(fee.tuition) + ' + Stationery ' + money(fee.stationery) + '</small></span></label>';
    }).join('') : '<p class="muted">No subjects yet. Add them in “Subjects &amp; Fees”.</p>';

    openModal({
      title: isNew ? 'Enroll new student' : 'Edit ' + s.name,
      wide: true,
      submitLabel: isNew ? 'Enroll' : 'Save changes',
      body: '<div class="form-grid">' +
        field('Student name *', input('name', s.name, 'required')) +
        field('Father / guardian name', input('fatherName', s.fatherName)) +
        field('Phone', input('phone', s.phone, 'type="tel"')) +
        field('Class / grade', input('className', s.className, 'list="class-list"')) +
        field('Admission date *', input('admissionDate', s.admissionDate, 'type="date" required')) +
        field('Monthly concession (' + esc(state.settings.currency) + ')', input('concession', s.concession || 0, 'type="number" min="0" step="1"'), 'Deducted from tuition every month') +
        field('Address', input('address', s.address), '') +
        (isNew ? '' : field('Status', select('status', [['active', 'Active'], ['left', 'Left academy']], s.status === 'left' ? 'left' : 'active')) +
          field('Leaving date', input('leftDate', s.leftDate, 'type="date"'), 'Billing stops after this month')) +
        '</div>' +
        '<datalist id="class-list">' + [...new Set(state.students.map((x) => x.className).filter(Boolean))].map((c) => '<option value="' + esc(c) + '">').join('') + '</datalist>' +
        '<h4 class="section-h">Subjects</h4>' +
        (isNew ? '' : field('Subject changes take effect from', input('effective', effDefault, 'type="month" required'), 'Earlier months keep the old subjects')) +
        '<div class="checks">' + subjectChecks + '</div>' +
        '<div class="total-line">Monthly fee: <b id="fee-preview">—</b></div>',
      onOpen: (form) => {
        const upd = () => {
          const total = [...form.querySelectorAll('input[name=subjects]:checked')].reduce((a, c) => a + Number(c.dataset.fee), 0);
          const conc = Math.min(C.num(form.concession.value), total);
          $('#fee-preview', form).textContent = state.settings.currency + ' ' + fmt(Math.max(0, total - conc));
        };
        form.addEventListener('input', upd);
        upd();
      },
      onSubmit: (d, fd) => {
        const selected = new Set(fd.getAll('subjects'));
        if (!selected.size && !confirm('No subjects selected. The student will not be billed. Continue?')) return false;
        const admissionMonth = C.monthOf(d.admissionDate);
        const target = isNew ? { id: C.uid(), enrollments: [] } : s;
        Object.assign(target, {
          name: d.name.trim(), fatherName: d.fatherName.trim(), phone: d.phone.trim(), className: d.className.trim(),
          address: d.address.trim(), admissionDate: d.admissionDate, concession: Math.max(0, C.num(d.concession)),
          status: d.status === 'left' ? 'left' : 'active', leftDate: d.status === 'left' ? (d.leftDate || C.today()) : '',
        });
        const eff = isNew ? admissionMonth : (d.effective || month);
        // Close enrollments not selected any more (from `eff` onward).
        target.enrollments = target.enrollments.filter((e) => {
          if (selected.has(e.subjectId) || (e.to && e.to < eff)) return true;
          if (e.from >= eff) return false;
          e.to = C.addMonths(eff, -1);
          return true;
        });
        // Open enrollments for newly selected subjects.
        for (const id of selected) {
          const covering = target.enrollments.some((e) => e.subjectId === id && e.from <= eff && (!e.to || e.to >= eff));
          if (covering) continue;
          const future = target.enrollments.find((e) => e.subjectId === id && e.from > eff);
          if (future) future.from = eff;
          else target.enrollments.push({ subjectId: id, from: eff, to: null });
        }
        if (isNew) {
          state.counters.student += 1;
          target.rollNo = 'CLA-' + String(state.counters.student).padStart(4, '0');
          state.students.push(target);
        }
        persistAndRender(isNew ? target.name + ' enrolled (' + target.rollNo + ')' : 'Student updated');
      },
    });
  }

  function pageStudent(id) {
    const s = byId(state.students, id);
    if (!s) return '<div class="card pad">Student not found. <a href="#/students">Back to students</a></div>';
    const invs = C.studentInvoices(state, id).slice().reverse();
    const due = C.studentDue(state, id);
    const receipts = C.studentReceipts(state, id);
    const totalPaid = receipts.reduce((a, r) => a + r.total, 0);
    const enrollRows = (s.enrollments || []).slice().sort((a, b) => a.from.localeCompare(b.from)).map((e) =>
      '<tr><td>' + esc((byId(state.subjects, e.subjectId) || {}).name || '(removed)') + '</td><td>' + C.monthLabel(e.from) + '</td><td>' + (e.to ? C.monthLabel(e.to) : '<span class="muted">continuing</span>') + '</td></tr>').join('');

    return '<div class="toolbar"><a href="#/students" class="btn">← Students</a><span class="spacer"></span>' +
      '<button class="btn" data-action="edit-student" data-id="' + s.id + '">Edit / change subjects</button>' +
      '<button class="btn danger" data-action="delete-student" data-id="' + s.id + '">Delete</button>' +
      '<button class="btn primary" data-action="collect" data-id="' + s.id + '"' + (due ? '' : ' disabled') + '>Collect fee</button></div>' +
      '<div class="grid2">' +
      '<section class="card pad profile"><h2>' + esc(s.name) + ' ' + statusBadge(s.status === 'left' ? 'left' : 'active') + '</h2>' +
      '<dl><dt>Roll no</dt><dd>' + esc(s.rollNo) + '</dd><dt>Father / guardian</dt><dd>' + esc(s.fatherName || '—') + '</dd><dt>Class</dt><dd>' + esc(s.className || '—') + '</dd>' +
      '<dt>Phone</dt><dd>' + esc(s.phone || '—') + '</dd><dt>Address</dt><dd>' + esc(s.address || '—') + '</dd><dt>Admission</dt><dd>' + esc(s.admissionDate) + '</dd>' +
      (s.status === 'left' ? '<dt>Left on</dt><dd>' + esc(s.leftDate) + '</dd>' : '') +
      '<dt>Concession</dt><dd>' + money(s.concession || 0) + ' / month</dd></dl></section>' +
      '<section class="card"><div class="kpis compact">' + kpi('Total due', money(due), '', due ? 'bad' : 'good') + kpi('Total paid', money(totalPaid)) + kpi('Fee in ' + C.monthLabel(month), money(Math.max(0, monthlyFeeOf(s, month)))) + '</div>' +
      '<header class="card-h"><h3>Subject enrollment history</h3></header><table class="tbl"><thead><tr><th>Subject</th><th>From</th><th>Until</th></tr></thead><tbody>' + (enrollRows || '<tr><td colspan="3" class="muted">No subjects</td></tr>') + '</tbody></table></section></div>' +
      '<section class="card"><header class="card-h"><h3>Monthly bills</h3></header><div class="scroll"><table class="tbl"><thead><tr><th>Month</th><th>Subjects</th><th class="num">Tuition</th><th class="num">Stationery</th><th class="num">Concession</th><th class="num">Net</th><th class="num">Paid</th><th class="num">Due</th><th>Status</th><th></th></tr></thead><tbody>' +
      (invs.length ? invs.map((inv) => {
        const t = C.invoiceTotals(inv);
        return '<tr><td>' + C.monthLabel(inv.month) + (inv.payments.length ? ' <span title="Locked after payment">🔒</span>' : '') + '</td><td>' + inv.lines.map((l) => esc(l.subjectName)).join(', ') + '</td><td class="num">' + money(t.tuition) + '</td><td class="num">' + money(t.stationery) + '</td><td class="num">' + money(t.discount) + '</td><td class="num">' + money(t.net) + '</td><td class="num">' + money(t.paid) + '</td><td class="num">' + money(t.due) + '</td><td>' + statusBadge(t.status) + '</td><td class="num"><button class="btn sm" data-action="slip" data-inv="' + inv.id + '">Fee slip</button></td></tr>';
      }).join('') : '<tr><td colspan="10" class="muted center">No bills yet.</td></tr>') +
      '</tbody></table></div></section>' +
      '<section class="card"><header class="card-h"><h3>Payments &amp; receipts</h3></header><table class="tbl"><thead><tr><th>Receipt</th><th>Date</th><th>Months</th><th>Mode</th><th class="num">Amount</th><th></th></tr></thead><tbody>' +
      (receipts.length ? receipts.map((r) => '<tr><td>' + esc(r.receiptNo) + '</td><td>' + esc(r.date) + '</td><td>' + r.months.map(C.monthLabel).join(', ') + '</td><td>' + esc(r.mode) + '</td><td class="num">' + money(r.total) + '</td><td class="num nowrap"><button class="btn sm" data-action="receipt" data-no="' + esc(r.receiptNo) + '">View / print</button> <button class="btn sm danger" data-action="delete-receipt" data-no="' + esc(r.receiptNo) + '">Delete</button></td></tr>').join('') : '<tr><td colspan="6" class="muted center">No payments yet.</td></tr>') +
      '</tbody></table></section>';
  }

  function collectModal(studentId) {
    const s = byId(state.students, studentId);
    const open = C.studentInvoices(state, studentId).filter((i) => C.invoiceTotals(i).due > 0);
    if (!open.length) { toast('Nothing due for ' + s.name); return; }
    const total = open.reduce((a, i) => a + C.invoiceTotals(i).due, 0);
    openModal({
      title: 'Collect fee · ' + s.name,
      submitLabel: 'Save & make receipt',
      body: '<p class="muted">' + esc(s.rollNo) + ' · ' + esc(s.className) + ' · Payment is applied to the oldest unpaid month first.</p>' +
        '<table class="tbl"><thead><tr><th>Month</th><th class="num">Bill</th><th class="num">Paid</th><th class="num">Due</th></tr></thead><tbody>' +
        open.map((i) => { const t = C.invoiceTotals(i); return '<tr><td>' + C.monthLabel(i.month) + '</td><td class="num">' + money(t.net) + '</td><td class="num">' + money(t.paid) + '</td><td class="num">' + money(t.due) + '</td></tr>'; }).join('') +
        '</tbody><tfoot><tr><th colspan="3">Total due</th><th class="num">' + money(total) + '</th></tr></tfoot></table>' +
        '<div class="form-grid">' +
        field('Amount received *', input('amount', C.round2(total), 'type="number" min="1" step="any" max="' + C.round2(total) + '" required')) +
        field('Date *', input('date', C.today(), 'type="date" required')) +
        field('Payment mode', select('mode', [['Cash', 'Cash'], ['Bank transfer', 'Bank transfer'], ['Online / mobile wallet', 'Online / mobile wallet'], ['Cheque', 'Cheque']], 'Cash')) +
        field('Note', input('note', '')) + '</div>',
      onSubmit: (d) => {
        const amt = C.round2(d.amount);
        if (amt <= 0) throw new Error('Enter an amount greater than zero.');
        if (amt > C.round2(total) + 0.001) throw new Error('Amount is more than total due (' + fmt(total) + ').');
        const r = C.allocatePayment(state, studentId, amt, { date: d.date, mode: d.mode, note: d.note.trim() });
        save();
        render();
        toast('Payment saved · ' + r.receiptNo);
        setTimeout(() => showReceipt(r.receiptNo), 0);
      },
    });
  }

  /* ---------------- monthly fees ---------------- */
  function pageFees() {
    const all = C.invoicesOf(state, month);
    const sm = C.monthSummary(state, month);
    const q = ui.feeQuery.toLowerCase();
    const rows = all.map((inv) => ({ inv, s: studentOf(inv.studentId), t: C.invoiceTotals(inv), prev: C.studentDue(state, inv.studentId, month) }))
      .filter((r) => ui.feeFilter === 'all' || (ui.feeFilter === 'due' ? r.t.status !== 'paid' : r.t.status === ui.feeFilter))
      .filter((r) => !q || [r.s.name, r.s.rollNo, r.s.className, r.s.fatherName].join(' ').toLowerCase().includes(q))
      .sort((a, b) => a.s.rollNo.localeCompare(b.s.rollNo));
    return '<div class="kpis">' +
      kpi('Bills', sm.students, sm.paidCount + ' paid · ' + sm.partialCount + ' partial · ' + sm.unpaidCount + ' unpaid') +
      kpi('Tuition', money(sm.tuition), sm.discount ? 'Concession −' + money(sm.discount) : '') +
      kpi('Stationery', money(sm.stationery)) +
      kpi('Net billed', money(sm.billed)) +
      kpi('Collected', money(sm.collected), '', 'good') +
      kpi('Outstanding', money(sm.outstanding), '', sm.outstanding ? 'warn' : '') +
      '</div>' +
      '<div class="note">Bills for <b>' + C.monthLabel(month) + '</b> are created automatically for every enrolled student from the current subject fees. Unpaid bills update automatically when fees or subjects change; a bill is locked 🔒 once a payment is recorded.</div>' +
      '<div class="toolbar"><input type="search" id="fee-search" placeholder="Search student…" value="' + esc(ui.feeQuery) + '">' +
      select('fee-filter', [['all', 'All'], ['due', 'Unpaid + partial'], ['unpaid', 'Unpaid'], ['partial', 'Partial'], ['paid', 'Paid']], ui.feeFilter, 'id="fee-filter"') +
      '<span class="spacer"></span><button class="btn" data-action="export-fees">Export CSV</button><button class="btn" data-action="print-slips">Print all fee slips</button></div>' +
      '<section class="card"><div class="scroll"><table class="tbl"><thead><tr><th>Roll</th><th>Student</th><th>Subjects</th><th class="num">Tuition</th><th class="num">Stationery</th><th class="num">Concession</th><th class="num">Net</th><th class="num">Paid</th><th class="num">Due</th><th class="num">Prev. dues</th><th>Status</th><th></th></tr></thead><tbody>' +
      (rows.length ? rows.map((r) => '<tr><td class="nowrap">' + esc(r.s.rollNo) + '</td><td><a href="#/student/' + r.inv.studentId + '">' + esc(r.s.name) + '</a><br><small>' + esc(r.s.className) + '</small></td><td>' + r.inv.lines.map((l) => '<span class="chip" title="Tuition ' + fmt(l.tuition) + ' + Stationery ' + fmt(l.stationery) + '">' + esc(l.subjectName) + '</span>').join(' ') + '</td>' +
        '<td class="num">' + money(r.t.tuition) + '</td><td class="num">' + money(r.t.stationery) + '</td><td class="num"><button class="link" data-action="discount" data-inv="' + r.inv.id + '" title="Change concession for this month">' + money(r.t.discount) + '</button></td><td class="num"><b>' + money(r.t.net) + '</b></td><td class="num">' + money(r.t.paid) + '</td><td class="num">' + money(r.t.due) + '</td><td class="num ' + (r.prev ? 'bad-t' : '') + '">' + money(r.prev) + '</td><td>' + statusBadge(r.t.status) + (r.inv.payments.length ? ' 🔒' : '') + '</td>' +
        '<td><div class="acts"><button class="btn sm primary" data-action="collect" data-id="' + r.inv.studentId + '"' + (r.t.due + r.prev > 0 ? '' : ' disabled') + '>Collect</button><button class="btn sm" data-action="slip" data-inv="' + r.inv.id + '">Fee slip</button></div></td></tr>').join('')
        : '<tr><td colspan="12" class="muted center">' + (all.length ? 'No bills match the filter.' : 'No students are enrolled for ' + C.monthLabel(month) + '.') + '</td></tr>') +
      '</tbody></table></div></section>';
  }

  function discountModal(invId) {
    const inv = byId(state.invoices, invId);
    const s = studentOf(inv.studentId);
    const t = C.invoiceTotals(inv);
    openModal({
      title: 'Concession · ' + s.name + ' · ' + C.monthLabel(inv.month),
      body: '<p class="muted">Tuition this month: ' + money(t.tuition) + '. Concession is deducted from tuition, so teacher shares are calculated on the reduced tuition.</p>' +
        field('Concession for this month', input('discount', inv.discount || 0, 'type="number" min="0" step="any" max="' + t.tuition + '" required')) +
        '<label class="check inline"><input type="checkbox" name="reset" value="1"><span>Use the student’s default concession (' + money(s.concession || 0) + ')</span></label>',
      onSubmit: (d) => {
        if (d.reset) { inv.discountManual = false; inv.discount = C.num(s.concession); }
        else { inv.discountManual = true; inv.discount = Math.min(Math.max(0, C.num(d.discount)), t.tuition); }
        persistAndRender('Concession updated');
      },
    });
  }

  /* ---------------- subjects ---------------- */
  function pageSubjects() {
    const share = state.settings.teacherShare;
    return '<div class="note">Each subject has a <b>monthly tuition fee</b> and a <b>monthly stationery fee</b>. Use <b>Change fee</b> to set a new fee from any month; earlier months keep their old fee. The teacher gets their share (' + share + '% by default) of the <b>tuition only</b>.</div>' +
      '<div class="toolbar"><span class="muted">Fees shown for ' + C.monthLabel(month) + '</span><span class="spacer"></span><button class="btn primary" data-action="add-subject">+ Add subject</button></div>' +
      '<section class="card"><div class="scroll"><table class="tbl"><thead><tr><th>Subject</th><th>Teacher</th><th class="num">Tuition</th><th class="num">Stationery</th><th class="num">Monthly total</th><th class="num">Teacher gets / student</th><th class="num">Students</th><th>Fee since</th><th></th></tr></thead><tbody>' +
      (state.subjects.length ? state.subjects.slice().sort((a, b) => a.name.localeCompare(b.name)).map((sub) => {
        const fee = C.feeFor(sub, month);
        const n = state.students.filter((s) => C.isBillable(state, s, month) && C.enrolledSubjectIds(s, month).includes(sub.id)).length;
        const sp = sub.teacherId ? C.sharePct(state, sub.teacherId) : 0;
        return '<tr><td><b>' + esc(sub.name) + '</b></td><td>' + esc(teacherName(sub.teacherId)) + '</td>' +
          (fee ? '<td class="num">' + money(fee.tuition) + '</td><td class="num">' + money(fee.stationery) + '</td><td class="num"><b>' + money(C.num(fee.tuition) + C.num(fee.stationery)) + '</b></td><td class="num">' + money((C.num(fee.tuition) * sp) / 100) + ' <small class="muted">(' + sp + '%)</small></td>'
            : '<td colspan="4" class="muted">No fee set for this month</td>') +
          '<td class="num">' + n + '</td><td>' + (fee ? C.monthLabel(fee.from) : '—') + '</td>' +
          '<td class="num nowrap"><button class="btn sm primary" data-action="change-fee" data-id="' + sub.id + '">Change fee</button> <button class="btn sm" data-action="fee-history" data-id="' + sub.id + '">History</button> <button class="btn sm" data-action="edit-subject" data-id="' + sub.id + '">Edit</button> <button class="btn sm danger" data-action="delete-subject" data-id="' + sub.id + '">Delete</button></td></tr>';
      }).join('') : '<tr><td colspan="9" class="muted center">No subjects yet. Click “Add subject”.</td></tr>') +
      '</tbody></table></div></section>';
  }

  function teacherOptions() { return [['', '— No teacher (academy keeps 100%) —']].concat(state.teachers.map((t) => [t.id, t.name])); }

  function subjectForm(sub) {
    const isNew = !sub;
    openModal({
      title: isNew ? 'Add subject' : 'Edit subject',
      body: '<div class="form-grid">' +
        field('Subject name *', input('name', sub ? sub.name : '', 'required')) +
        field('Teacher', select('teacherId', teacherOptions(), sub ? sub.teacherId : '')) +
        (isNew ? field('Monthly tuition fee *', input('tuition', '', 'type="number" min="0" step="any" required')) +
          field('Monthly stationery fee *', input('stationery', '', 'type="number" min="0" step="any" required')) +
          field('Fee applies from *', input('from', state.settings.billingStart < month ? state.settings.billingStart : month, 'type="month" required')) : '') +
        '</div>' + (state.teachers.length ? '' : '<p class="muted">Tip: add teachers first in the Teachers page to assign them here.</p>') +
        (isNew ? '' : '<p class="muted">Changing the teacher updates unpaid bills. Bills that already have a payment keep the old teacher.</p>'),
      onSubmit: (d) => {
        const name = d.name.trim();
        if (state.subjects.some((x) => x.name.toLowerCase() === name.toLowerCase() && (!sub || x.id !== sub.id))) throw new Error('A subject with this name already exists.');
        if (isNew) {
          state.subjects.push({ id: C.uid(), name, teacherId: d.teacherId, feeHistory: [{ from: d.from, tuition: C.num(d.tuition), stationery: C.num(d.stationery) }] });
        } else {
          sub.name = name;
          sub.teacherId = d.teacherId;
        }
        persistAndRender(isNew ? 'Subject added' : 'Subject updated');
      },
    });
  }

  function changeFeeForm(sub) {
    const cur = C.feeFor(sub, month) || { tuition: 0, stationery: 0 };
    openModal({
      title: 'Change fee · ' + sub.name,
      body: '<p class="muted">Current fee in ' + C.monthLabel(month) + ': tuition ' + money(cur.tuition) + ' + stationery ' + money(cur.stationery) + '.</p>' +
        '<div class="form-grid">' +
        field('New fee applies from *', input('from', month, 'type="month" required'), 'Applies to this month and all later months') +
        field('Monthly tuition fee *', input('tuition', cur.tuition, 'type="number" min="0" step="any" required')) +
        field('Monthly stationery fee *', input('stationery', cur.stationery, 'type="number" min="0" step="any" required')) +
        '</div><div class="total-line" id="fee-calc"></div>',
      onOpen: (form) => {
        const upd = () => {
          const t = C.num(form.tuition.value), st = C.num(form.stationery.value), sp = sub.teacherId ? C.sharePct(state, sub.teacherId) : 0;
          $('#fee-calc', form).innerHTML = 'Student pays <b>' + money(t + st) + '</b> · Teacher gets <b>' + money((t * sp) / 100) + '</b> (' + sp + '% of tuition) · Academy keeps <b>' + money(t - (t * sp) / 100 + st) + '</b>';
        };
        form.addEventListener('input', upd); upd();
      },
      onSubmit: (d) => {
        if (!C.isMonth(d.from)) throw new Error('Choose a month.');
        const entry = { from: d.from, tuition: C.num(d.tuition), stationery: C.num(d.stationery) };
        const i = sub.feeHistory.findIndex((f) => f.from === d.from);
        if (i >= 0) sub.feeHistory[i] = entry; else sub.feeHistory.push(entry);
        sub.feeHistory.sort((a, b) => a.from.localeCompare(b.from));
        const locked = state.invoices.filter((inv) => inv.month >= d.from && inv.payments.length && inv.lines.some((l) => l.subjectId === sub.id)).length;
        persistAndRender('Fee updated from ' + C.monthLabel(d.from) + (locked ? ' · ' + locked + ' already-paid bill(s) kept as they were' : ''));
      },
    });
  }

  function feeHistoryModal(sub) {
    const rows = sub.feeHistory.slice().sort((a, b) => b.from.localeCompare(a.from));
    openModal({
      title: 'Fee history · ' + sub.name,
      body: '<table class="tbl"><thead><tr><th>From month</th><th class="num">Tuition</th><th class="num">Stationery</th><th class="num">Total</th><th></th></tr></thead><tbody>' +
        rows.map((f) => '<tr><td>' + C.monthLabel(f.from) + '</td><td class="num">' + money(f.tuition) + '</td><td class="num">' + money(f.stationery) + '</td><td class="num">' + money(C.num(f.tuition) + C.num(f.stationery)) + '</td><td class="num">' +
          (sub.feeHistory.length > 1 ? '<button type="button" class="btn sm danger" data-action="delete-fee" data-id="' + sub.id + '" data-from="' + f.from + '">Remove</button>' : '') + '</td></tr>').join('') +
        '</tbody></table>',
    });
  }

  /* ---------------- teachers ---------------- */
  function pageTeachers() {
    const report = new Map(C.teacherReport(state, month).map((r) => [r.teacher.id, r]));
    return '<div class="toolbar"><span class="muted">Default share: <b>' + state.settings.teacherShare + '% of tuition</b> (change in Settings, or per teacher)</span><span class="spacer"></span><button class="btn primary" data-action="add-teacher">+ Add teacher</button></div>' +
      '<section class="card"><div class="scroll"><table class="tbl"><thead><tr><th>Name</th><th>Phone</th><th>Subjects</th><th class="num">Share</th><th class="num">Students (' + C.monthLabel(month) + ')</th><th class="num">Payable</th><th class="num">Paid</th><th class="num">Balance</th><th></th></tr></thead><tbody>' +
      (state.teachers.length ? state.teachers.map((t) => {
        const r = report.get(t.id) || { students: 0, payable: 0, paid: 0, balance: 0 };
        const subs = state.subjects.filter((s) => s.teacherId === t.id).map((s) => '<span class="chip">' + esc(s.name) + '</span>').join(' ');
        return '<tr><td><b>' + esc(t.name) + '</b></td><td>' + esc(t.phone) + '</td><td>' + (subs || '<span class="muted">none</span>') + '</td><td class="num">' + C.sharePct(state, t.id) + '%</td><td class="num">' + r.students + '</td><td class="num">' + money(r.payable) + '</td><td class="num">' + money(r.paid) + '</td><td class="num">' + money(r.balance) + '</td>' +
          '<td class="num nowrap"><button class="btn sm" data-action="edit-teacher" data-id="' + t.id + '">Edit</button> <button class="btn sm danger" data-action="delete-teacher" data-id="' + t.id + '">Delete</button></td></tr>';
      }).join('') : '<tr><td colspan="9" class="muted center">No teachers yet.</td></tr>') +
      '</tbody></table></div></section>';
  }

  function teacherForm(t) {
    const isNew = !t;
    openModal({
      title: isNew ? 'Add teacher' : 'Edit teacher',
      body: '<div class="form-grid">' +
        field('Name *', input('name', t ? t.name : '', 'required')) +
        field('Phone', input('phone', t ? t.phone : '', 'type="tel"')) +
        field('Share of tuition (%)', input('sharePct', t ? t.sharePct : '', 'type="number" min="0" max="100" step="any" placeholder="' + state.settings.teacherShare + ' (default)"'), 'Leave empty to use the default ' + state.settings.teacherShare + '%') +
        field('Notes', input('notes', t ? t.notes : '')) + '</div>',
      onSubmit: (d) => {
        const data = { name: d.name.trim(), phone: d.phone.trim(), sharePct: d.sharePct === '' ? '' : Math.min(100, Math.max(0, C.num(d.sharePct))), notes: d.notes.trim() };
        if (isNew) state.teachers.push(Object.assign({ id: C.uid() }, data)); else Object.assign(t, data);
        persistAndRender(isNew ? 'Teacher added' : 'Teacher updated');
      },
    });
  }

  /* ---------------- teacher payouts ---------------- */
  function pagePayouts() {
    const rep = C.teacherReport(state, month).filter((r) => r.payable || r.paid || state.teachers.some((t) => t.id === r.teacher.id));
    const tot = rep.reduce((a, r) => ({ payable: a.payable + r.payable, paid: a.paid + r.paid, balance: a.balance + r.balance }), { payable: 0, paid: 0, balance: 0 });
    const basis = state.settings.payoutBasis;
    const list = state.payouts.filter((p) => p.month === month).sort((a, b) => b.date.localeCompare(a.date));
    return '<div class="note">Teacher payable for <b>' + C.monthLabel(month) + '</b> = share % × <b>' + (basis === 'billed' ? 'tuition billed' : 'tuition collected') + '</b> of their subjects (after concessions). Stationery is not shared. ' +
      (basis === 'collected' ? 'Amounts grow automatically as students pay this month’s fees.' : '') + ' <a href="#/settings">Change basis</a></div>' +
      '<div class="kpis">' + kpi('Total payable', money(tot.payable)) + kpi('Paid to teachers', money(tot.paid), '', 'good') + kpi('Balance to pay', money(tot.balance), '', tot.balance > 0 ? 'warn' : '') + '</div>' +
      '<section class="card"><div class="scroll"><table class="tbl"><thead><tr><th>Teacher</th><th class="num">Students</th><th class="num">Tuition billed</th><th class="num">Tuition collected</th><th class="num">Payable</th><th class="num">Paid</th><th class="num">Balance</th><th></th></tr></thead><tbody>' +
      (rep.length ? rep.map((r) => {
        const open = ui.openTeacher === r.teacher.id;
        return '<tr><td><button class="link" data-action="toggle-teacher" data-id="' + r.teacher.id + '">' + (open ? '▾ ' : '▸ ') + esc(r.teacher.name) + '</button></td><td class="num">' + r.students + '</td><td class="num">' + money(r.tuitionBilled) + '</td><td class="num">' + money(r.tuitionCollected) + '</td><td class="num"><b>' + money(r.payable) + '</b></td><td class="num">' + money(r.paid) + '</td><td class="num ' + (r.balance > 0 ? 'bad-t' : '') + '">' + money(r.balance) + '</td>' +
          '<td class="num"><button class="btn sm primary" data-action="pay-teacher" data-id="' + r.teacher.id + '"' + (r.balance > 0 ? '' : ' disabled') + '>Pay</button></td></tr>' +
          (open ? '<tr class="sub-row"><td colspan="8"><table class="tbl inner"><thead><tr><th>Subject</th><th class="num">Students</th><th class="num">Share</th><th class="num">Tuition billed</th><th class="num">Tuition collected</th><th class="num">Payable</th></tr></thead><tbody>' +
            (r.subjects.length ? r.subjects.map((s) => '<tr><td>' + esc(s.name) + '</td><td class="num">' + s.students + '</td><td class="num">' + s.sharePct + '%</td><td class="num">' + money(s.tuitionBilled) + '</td><td class="num">' + money(s.tuitionCollected) + '</td><td class="num">' + money(s.payable) + '</td></tr>').join('') : '<tr><td colspan="6" class="muted">No students this month</td></tr>') +
            '</tbody></table></td></tr>' : '');
      }).join('') : '<tr><td colspan="8" class="muted center">No teachers yet.</td></tr>') +
      '</tbody></table></div></section>' +
      '<section class="card"><header class="card-h"><h3>Payments made for ' + C.monthLabel(month) + '</h3></header><table class="tbl"><thead><tr><th>Date</th><th>Teacher</th><th>Note</th><th class="num">Amount</th><th></th></tr></thead><tbody>' +
      (list.length ? list.map((p) => '<tr><td>' + esc(p.date) + '</td><td>' + esc(teacherName(p.teacherId)) + '</td><td>' + esc(p.note) + '</td><td class="num">' + money(p.amount) + '</td><td class="num"><button class="btn sm danger" data-action="delete-payout" data-id="' + p.id + '">Delete</button></td></tr>').join('') : '<tr><td colspan="5" class="muted center">No teacher payments recorded for this month.</td></tr>') +
      '</tbody></table></section>';
  }

  function payTeacherModal(teacherId) {
    const r = C.teacherReport(state, month).find((x) => x.teacher.id === teacherId);
    openModal({
      title: 'Pay ' + r.teacher.name + ' · ' + C.monthLabel(month),
      body: '<p class="muted">Payable ' + money(r.payable) + ' · already paid ' + money(r.paid) + ' · balance <b>' + money(r.balance) + '</b></p><div class="form-grid">' +
        field('Amount *', input('amount', r.balance, 'type="number" min="1" step="any" required')) +
        field('Date *', input('date', C.today(), 'type="date" required')) +
        field('Note', input('note', '')) + '</div>',
      onSubmit: (d) => {
        const amt = C.round2(d.amount);
        if (amt <= 0) throw new Error('Enter an amount greater than zero.');
        if (amt > r.balance + 0.001 && !confirm('This is more than the balance (' + fmt(r.balance) + '). Record it anyway?')) return false;
        state.payouts.push({ id: C.uid(), teacherId, month, amount: amt, date: d.date, note: d.note.trim() });
        persistAndRender('Payment to ' + r.teacher.name + ' recorded');
      },
    });
  }

  /* ---------------- reports ---------------- */
  function pageReports() {
    const year = month.slice(0, 4);
    const months = Array.from({ length: 12 }, (_, i) => year + '-' + String(i + 1).padStart(2, '0'));
    const rows = months.map((m) => C.monthSummary(state, m));
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    const sm = C.monthSummary(state, month);
    const defaulters = state.students.map((s) => {
      const open = C.studentInvoices(state, s.id).filter((i) => C.invoiceTotals(i).due > 0);
      return { s, months: open.map((i) => i.month), due: open.reduce((a, i) => a + C.invoiceTotals(i).due, 0) };
    }).filter((x) => x.due > 0).sort((a, b) => b.due - a.due);

    return '<section class="card"><header class="card-h"><h3>Year ' + year + ' · month by month</h3><button class="btn sm" data-action="export-year">Export CSV</button></header><div class="scroll"><table class="tbl"><thead><tr><th>Month</th><th class="num">Students</th><th class="num">Tuition</th><th class="num">Stationery</th><th class="num">Concession</th><th class="num">Billed</th><th class="num">Collected</th><th class="num">Outstanding</th><th class="num">Teacher payable</th><th class="num">Teacher paid</th><th class="num">Academy share</th></tr></thead><tbody>' +
      rows.map((r) => '<tr' + (r.month === month ? ' class="hl"' : '') + '><td>' + C.monthLabel(r.month) + '</td><td class="num">' + r.students + '</td><td class="num">' + money(r.tuition) + '</td><td class="num">' + money(r.stationery) + '</td><td class="num">' + money(r.discount) + '</td><td class="num">' + money(r.billed) + '</td><td class="num">' + money(r.collected) + '</td><td class="num">' + money(r.outstanding) + '</td><td class="num">' + money(r.teacherPayable) + '</td><td class="num">' + money(r.teacherPaid) + '</td><td class="num"><b>' + money(r.academyShare) + '</b></td></tr>').join('') +
      '</tbody><tfoot><tr><th>Total</th><th></th><th class="num">' + money(sum('tuition')) + '</th><th class="num">' + money(sum('stationery')) + '</th><th class="num">' + money(sum('discount')) + '</th><th class="num">' + money(sum('billed')) + '</th><th class="num">' + money(sum('collected')) + '</th><th class="num">' + money(sum('outstanding')) + '</th><th class="num">' + money(sum('teacherPayable')) + '</th><th class="num">' + money(sum('teacherPaid')) + '</th><th class="num">' + money(sum('academyShare')) + '</th></tr></tfoot></table></div></section>' +
      '<section class="card"><header class="card-h"><h3>Subject-wise · ' + C.monthLabel(month) + '</h3></header>' + subjectTable(sm) + '</section>' +
      '<section class="card"><header class="card-h"><h3>Fee defaulters (all months)</h3><button class="btn sm" data-action="export-defaulters">Export CSV</button></header><div class="scroll"><table class="tbl"><thead><tr><th>Roll</th><th>Student</th><th>Class</th><th>Phone</th><th>Unpaid months</th><th class="num">Total due</th><th></th></tr></thead><tbody>' +
      (defaulters.length ? defaulters.map((d) => '<tr><td>' + esc(d.s.rollNo) + '</td><td><a href="#/student/' + d.s.id + '">' + esc(d.s.name) + '</a></td><td>' + esc(d.s.className) + '</td><td>' + esc(d.s.phone) + '</td><td>' + d.months.map(C.monthLabel).join(', ') + '</td><td class="num">' + money(d.due) + '</td><td class="num"><button class="btn sm" data-action="collect" data-id="' + d.s.id + '">Collect</button></td></tr>').join('') : '<tr><td colspan="7" class="muted center">No defaulters.</td></tr>') +
      '</tbody></table></div></section>';
  }

  /* ---------------- settings ---------------- */
  function pageSettings() {
    const st = state.settings;
    return '<section class="card pad"><h3>Academy</h3><form id="settings-form" class="form-grid">' +
      field('Academy name', input('academyName', st.academyName, 'required')) +
      field('Phone', input('phone', st.phone)) +
      field('Address', input('address', st.address)) +
      field('Currency symbol', input('currency', st.currency, 'required')) +
      field('Teacher share of tuition (%)', input('teacherShare', st.teacherShare, 'type="number" min="0" max="100" step="any" required'), 'Default for all teachers (can be changed per teacher)') +
      field('Teacher pay is calculated on', select('payoutBasis', [['collected', 'Tuition actually collected'], ['billed', 'Tuition billed (even if unpaid)']], st.payoutBasis)) +
      field('Start billing from month', input('billingStart', st.billingStart, 'type="month" required'), 'No bills are created before this month, even for older admissions') +
      '<div class="field"><span>&nbsp;</span><button class="btn primary" type="submit">Save settings</button></div></form></section>' +
      '<section class="card pad"><h3>Backup &amp; restore</h3><p class="muted">All data is saved in this browser on this computer' + (state.savedAt ? ' (last saved ' + new Date(state.savedAt).toLocaleString() + ')' : '') + '. Download a backup regularly and keep it safe, it is also how you move data to another computer.</p>' +
      '<div class="row gap"><button class="btn primary" data-action="backup">Download backup</button><label class="btn">Restore from backup<input type="file" id="restore-file" accept=".json,application/json" hidden></label></div></section>' +
      '<section class="card pad"><h3>Sample data &amp; reset</h3><div class="row gap"><button class="btn" data-action="load-sample">Load sample data</button><button class="btn danger" data-action="reset">Erase all data</button></div><p class="muted">Both replace everything currently saved. Download a backup first.</p></section>';
  }

  /* ---------------- actions ---------------- */
  const actions = {
    'add-student': () => studentForm(null),
    'edit-student': (d) => studentForm(byId(state.students, d.id)),
    'delete-student': (d) => {
      const s = byId(state.students, d.id);
      const paid = C.studentReceipts(state, s.id).length;
      if (!confirm('Delete ' + s.name + '?' + (paid ? '\n\nThis student has ' + paid + ' payment receipt(s); they will be deleted too. To keep history, mark the student as "Left academy" instead.' : ''))) return;
      state.students = state.students.filter((x) => x.id !== s.id);
      state.invoices = state.invoices.filter((i) => i.studentId !== s.id);
      location.hash = '#/students';
      persistAndRender('Student deleted');
    },
    collect: (d) => collectModal(d.id),
    receipt: (d) => showReceipt(d.no),
    'delete-receipt': (d) => {
      if (!confirm('Delete receipt ' + d.no + '? The months it paid will become due again.')) return;
      C.deleteReceipt(state, d.no);
      persistAndRender('Receipt deleted');
    },
    slip: (d) => {
      const inv = byId(state.invoices, d.inv);
      openModal({ title: 'Fee slip', wide: true, body: feeSlipHTML(inv), extraButtons: '<button type="button" class="btn primary" id="print-slip">Print</button>', onOpen: (f) => $('#print-slip', f).addEventListener('click', () => printHTML(feeSlipHTML(inv))) });
    },
    'print-slips': () => {
      const invs = C.invoicesOf(state, month).filter((i) => C.invoiceTotals(i).due > 0).sort((a, b) => studentOf(a.studentId).rollNo.localeCompare(studentOf(b.studentId).rollNo));
      if (!invs.length) return toast('No unpaid bills this month');
      printHTML(invs.map(feeSlipHTML).join('<div class="page-break"></div>'));
    },
    discount: (d) => discountModal(d.inv),
    'add-subject': () => subjectForm(null),
    'edit-subject': (d) => subjectForm(byId(state.subjects, d.id)),
    'change-fee': (d) => changeFeeForm(byId(state.subjects, d.id)),
    'fee-history': (d) => feeHistoryModal(byId(state.subjects, d.id)),
    'delete-fee': (d) => {
      const sub = byId(state.subjects, d.id);
      if (!confirm('Remove the fee that starts in ' + C.monthLabel(d.from) + '?')) return;
      sub.feeHistory = sub.feeHistory.filter((f) => f.from !== d.from);
      persistAndRender('Fee entry removed');
      feeHistoryModal(sub);
    },
    'delete-subject': (d) => {
      const sub = byId(state.subjects, d.id);
      if (state.invoices.some((i) => i.payments.length && i.lines.some((l) => l.subjectId === sub.id))) {
        return alert('“' + sub.name + '” has paid bills, so it cannot be deleted (history must stay correct). Remove it from students using “Edit / change subjects” instead.');
      }
      if (!confirm('Delete subject “' + sub.name + '”? It will be removed from all students.')) return;
      state.subjects = state.subjects.filter((x) => x.id !== sub.id);
      for (const s of state.students) s.enrollments = (s.enrollments || []).filter((e) => e.subjectId !== sub.id);
      persistAndRender('Subject deleted');
    },
    'add-teacher': () => teacherForm(null),
    'edit-teacher': (d) => teacherForm(byId(state.teachers, d.id)),
    'delete-teacher': (d) => {
      const t = byId(state.teachers, d.id);
      if (state.subjects.some((s) => s.teacherId === t.id)) return alert('Assign ' + t.name + '’s subjects to another teacher first (Subjects → Edit).');
      if (!confirm('Delete teacher ' + t.name + '?')) return;
      state.teachers = state.teachers.filter((x) => x.id !== t.id);
      persistAndRender('Teacher deleted');
    },
    'toggle-teacher': (d) => { ui.openTeacher = ui.openTeacher === d.id ? null : d.id; render(); },
    'pay-teacher': (d) => payTeacherModal(d.id),
    'delete-payout': (d) => {
      if (!confirm('Delete this teacher payment?')) return;
      state.payouts = state.payouts.filter((p) => p.id !== d.id);
      persistAndRender('Teacher payment deleted');
    },
    'export-students': () => downloadCSV('students.csv', [['Roll no', 'Name', 'Father', 'Class', 'Phone', 'Address', 'Admission', 'Status', 'Subjects (' + month + ')', 'Concession', 'Total due']]
      .concat(state.students.map((s) => [s.rollNo, s.name, s.fatherName, s.className, s.phone, s.address, s.admissionDate, s.status, C.enrolledSubjectIds(s, month).map((id) => (byId(state.subjects, id) || {}).name).join('; '), s.concession || 0, C.studentDue(state, s.id)]))),
    'export-fees': () => downloadCSV('fees-' + month + '.csv', [['Roll no', 'Student', 'Class', 'Subjects', 'Tuition', 'Stationery', 'Concession', 'Net', 'Paid', 'Due', 'Previous dues', 'Status']]
      .concat(C.invoicesOf(state, month).map((i) => { const s = studentOf(i.studentId), t = C.invoiceTotals(i); return [s.rollNo, s.name, s.className, i.lines.map((l) => l.subjectName).join('; '), t.tuition, t.stationery, t.discount, t.net, t.paid, t.due, C.studentDue(state, i.studentId, month), t.status]; }))),
    'export-year': () => {
      const y = month.slice(0, 4);
      downloadCSV('summary-' + y + '.csv', [['Month', 'Students', 'Tuition', 'Stationery', 'Concession', 'Billed', 'Collected', 'Outstanding', 'Teacher payable', 'Teacher paid', 'Academy share']]
        .concat(Array.from({ length: 12 }, (_, i) => C.monthSummary(state, y + '-' + String(i + 1).padStart(2, '0'))).map((r) => [r.month, r.students, r.tuition, r.stationery, r.discount, r.billed, r.collected, r.outstanding, r.teacherPayable, r.teacherPaid, r.academyShare])));
    },
    'export-defaulters': () => downloadCSV('defaulters.csv', [['Roll no', 'Student', 'Class', 'Phone', 'Unpaid months', 'Total due']]
      .concat(state.students.map((s) => ({ s, inv: C.studentInvoices(state, s.id).filter((i) => C.invoiceTotals(i).due > 0) })).filter((x) => x.inv.length)
        .map((x) => [x.s.rollNo, x.s.name, x.s.className, x.s.phone, x.inv.map((i) => i.month).join('; '), C.studentDue(state, x.s.id)]))),
    backup: () => downloadFile('cerebrox-backup-' + C.today() + '.json', JSON.stringify(state, null, 2), 'application/json'),
    'load-sample': () => {
      if ((state.students.length || state.subjects.length) && !confirm('Replace ALL current data with sample data?')) return;
      state = S.sampleData();
      month = C.thisMonth();
      sessionStorage.setItem('cla-month', month);
      location.hash = '#/dashboard';
      persistAndRender('Sample data loaded');
    },
    reset: () => {
      if (prompt('This erases every student, fee and payment. Type ERASE to confirm.') !== 'ERASE') return;
      state = S.defaultState();
      location.hash = '#/dashboard';
      persistAndRender('All data erased');
    },
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled) return;
    const fn = actions[b.dataset.action];
    if (fn) { e.preventDefault(); fn(b.dataset, b); }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'student-search') { ui.studentQuery = e.target.value; rerenderKeepingFocus(e.target); }
    if (e.target.id === 'fee-search') { ui.feeQuery = e.target.value; rerenderKeepingFocus(e.target); }
  });
  function rerenderKeepingFocus(el) {
    const id = el.id, pos = el.selectionStart;
    render();
    const n = document.getElementById(id);
    if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) { /* ignore */ } }
  }

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'month-picker') setMonth(t.value);
    if (t.id === 'student-status') { ui.studentStatus = t.value; render(); }
    if (t.id === 'fee-filter') { ui.feeFilter = t.value; render(); }
    if (t.id === 'restore-file' && t.files[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = S.validate(JSON.parse(reader.result));
          if (!confirm('Restore this backup? It replaces all current data (' + data.students.length + ' students, ' + data.subjects.length + ' subjects).')) return;
          state = data;
          persistAndRender('Backup restored');
        } catch (err) { toast('Restore failed: ' + err.message, 'error'); }
      };
      reader.readAsText(t.files[0]);
      t.value = '';
    }
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'settings-form') return;
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    Object.assign(state.settings, {
      academyName: d.academyName.trim() || 'Cerebrox Learning Academy', phone: d.phone.trim(), address: d.address.trim(),
      currency: d.currency.trim() || 'Rs', teacherShare: Math.min(100, Math.max(0, C.num(d.teacherShare))),
      payoutBasis: d.payoutBasis === 'billed' ? 'billed' : 'collected', billingStart: C.isMonth(d.billingStart) ? d.billingStart : state.settings.billingStart,
    });
    persistAndRender('Settings saved');
  });

  $('#month-prev').addEventListener('click', () => setMonth(C.addMonths(month, -1)));
  $('#month-next').addEventListener('click', () => setMonth(C.addMonths(month, 1)));
  $('#menu-btn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  window.addEventListener('hashchange', () => { closeModal(); render(); });
  window.addEventListener('afterprint', () => { $('#print-area').innerHTML = ''; });

  if (C.syncAll(state, month)) S.save(state);
  render();
})();
