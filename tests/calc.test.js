// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calc.js');

function setup() {
  const state = {
    settings: { teacherShare: 70, payoutBasis: 'collected', billingStart: '2026-01' },
    counters: { student: 0, receipt: 0 },
    teachers: [{ id: 't1', name: 'Math Teacher', sharePct: '' }, { id: 't2', name: 'Eng Teacher', sharePct: 60 }],
    subjects: [
      { id: 'math', name: 'Math', teacherId: 't1', feeHistory: [{ from: '2026-01', tuition: 3000, stationery: 500 }, { from: '2026-03', tuition: 3500, stationery: 500 }] },
      { id: 'eng', name: 'English', teacherId: 't2', feeHistory: [{ from: '2026-01', tuition: 2000, stationery: 300 }] },
    ],
    students: [{ id: 's1', name: 'Ali', admissionDate: '2026-01-10', status: 'active', concession: 0, enrollments: [{ subjectId: 'math', from: '2026-01', to: null }, { subjectId: 'eng', from: '2026-02', to: null }] }],
    invoices: [],
    payouts: [],
  };
  return state;
}

test('fees are versioned by month', () => {
  const s = setup();
  assert.equal(C.feeFor(s.subjects[0], '2026-02').tuition, 3000);
  assert.equal(C.feeFor(s.subjects[0], '2026-03').tuition, 3500);
  assert.equal(C.feeFor(s.subjects[0], '2026-12').tuition, 3500);
  assert.equal(C.feeFor(s.subjects[0], '2025-12'), null);
});

test('monthly bill = tuition + stationery of enrolled subjects', () => {
  const s = setup();
  C.syncAll(s, '2026-03');
  const jan = s.invoices.find((i) => i.month === '2026-01');
  const feb = s.invoices.find((i) => i.month === '2026-02');
  const mar = s.invoices.find((i) => i.month === '2026-03');
  assert.equal(C.invoiceTotals(jan).net, 3500);
  assert.equal(C.invoiceTotals(feb).net, 3500 + 2300);
  assert.equal(C.invoiceTotals(mar).net, 4000 + 2300);
});

test('teacher gets share of tuition only (70% default, per-teacher override)', () => {
  const s = setup();
  s.settings.payoutBasis = 'billed';
  C.syncAll(s, '2026-03');
  const rep = C.teacherReport(s, '2026-03');
  assert.equal(rep.find((r) => r.teacher.id === 't1').payable, 3500 * 0.7);
  assert.equal(rep.find((r) => r.teacher.id === 't2').payable, 2000 * 0.6);
  const sm = C.monthSummary(s, '2026-03');
  assert.equal(sm.academyShare, 6300 - 2450 - 1200);
});

test('collected basis: teacher share follows payments; oldest month paid first', () => {
  const s = setup();
  C.syncAll(s, '2026-02');
  C.allocatePayment(s, 's1', 3500 + 2900, { date: '2026-02-10' }); // Jan full + half of Feb
  const jan = s.invoices.find((i) => i.month === '2026-01');
  const feb = s.invoices.find((i) => i.month === '2026-02');
  assert.equal(C.invoiceTotals(jan).status, 'paid');
  assert.equal(C.invoiceTotals(feb).paid, 2900);
  const feb1 = C.teacherReport(s, '2026-02').find((r) => r.teacher.id === 't1');
  assert.equal(feb1.payable, C.round2(3000 * 0.5 * 0.7));
  assert.equal(C.studentDue(s, 's1', '2026-03'), 2900);
});

test('unpaid bills follow fee changes, paid bills are locked', () => {
  const s = setup();
  C.syncAll(s, '2026-03');
  C.allocatePayment(s, 's1', 3500, { onlyMonth: '2026-01' });
  s.subjects[0].feeHistory[0].tuition = 9999; // change January+February fee
  C.syncAll(s, '2026-03');
  assert.equal(C.invoiceTotals(s.invoices.find((i) => i.month === '2026-01')).net, 3500); // locked
  assert.equal(C.invoiceTotals(s.invoices.find((i) => i.month === '2026-02')).tuition, 9999 + 2000); // refreshed
});

test('concession reduces tuition and teacher share proportionally', () => {
  const s = setup();
  s.settings.payoutBasis = 'billed';
  s.students[0].concession = 500;
  C.syncAll(s, '2026-02');
  const feb = s.invoices.find((i) => i.month === '2026-02');
  assert.equal(C.invoiceTotals(feb).net, 5800 - 500);
  const rep = C.teacherReport(s, '2026-02');
  const t1 = rep.find((r) => r.teacher.id === 't1').payable;
  const t2 = rep.find((r) => r.teacher.id === 't2').payable;
  assert.equal(C.round2(t1 + t2), C.round2((3000 * 0.7 + 2000 * 0.6) * (4500 / 5000)));
});

test('left students stop being billed after leaving month; billing start respected', () => {
  const s = setup();
  s.settings.billingStart = '2026-02';
  s.students[0].status = 'left';
  s.students[0].leftDate = '2026-03-15';
  C.syncAll(s, '2026-05');
  assert.deepEqual(s.invoices.map((i) => i.month).sort(), ['2026-02', '2026-03']);
});

test('dropping a subject with an end month', () => {
  const s = setup();
  s.students[0].enrollments[1].to = '2026-02';
  C.syncAll(s, '2026-03');
  assert.equal(s.invoices.find((i) => i.month === '2026-03').lines.length, 1);
});
