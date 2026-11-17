/*
 * Cerebrox Learning Academy — calculation engine.
 * Pure functions (no DOM) so they can be unit-tested with Node.
 *
 * Money rules
 *  - Every subject has a monthly fee made of TUITION + STATIONERY.
 *  - Fees are versioned by month: a fee entry applies from its `from` month
 *    until a newer entry takes over (so fees can change month by month).
 *  - A student's monthly bill = sum of (tuition + stationery) of every subject
 *    the student is enrolled in that month, minus any concession (on tuition).
 *  - Teacher share = sharePct (default 70%) of the TUITION of their subjects.
 *    Stationery is never shared; it stays with the academy.
 *  - Unpaid bills are always kept in sync with current fees/enrollments.
 *    Once a payment is recorded on a bill, that bill is locked (history stays true).
 */
(function (root) {
  'use strict';
  const C = {};

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH_RE = /^\d{4}-\d{2}$/;

  C.round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  C.num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  C.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  C.thisMonth = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  };
  C.today = () => C.thisMonth() + '-' + String(new Date().getDate()).padStart(2, '0');
  C.isMonth = (m) => MONTH_RE.test(m || '');
  C.monthOf = (d) => (d || '').slice(0, 7);
  C.addMonths = (m, k) => {
    const [y, mo] = m.split('-').map(Number);
    const t = y * 12 + (mo - 1) + k;
    return Math.floor(t / 12) + '-' + String((t % 12) + 1).padStart(2, '0');
  };
  C.monthsBetween = (a, b) => {
    const out = [];
    if (!C.isMonth(a) || !C.isMonth(b)) return out;
    for (let m = a; m <= b; m = C.addMonths(m, 1)) out.push(m);
    return out;
  };
  C.monthLabel = (m) => {
    if (!C.isMonth(m)) return m || '';
    const [y, mo] = m.split('-');
    return MONTH_NAMES[Number(mo) - 1] + ' ' + y;
  };

  /* ---------------- fees & enrollment ---------------- */

  /** Fee entry in force for a subject in a given month (latest `from` <= month). */
  C.feeFor = (subject, month) => {
    let best = null;
    for (const f of (subject && subject.feeHistory) || []) {
      if (f.from <= month && (!best || f.from > best.from)) best = f;
    }
    return best;
  };

  C.sharePct = (state, teacherId) => {
    const t = state.teachers.find((x) => x.id === teacherId);
    if (t && t.sharePct !== null && t.sharePct !== undefined && t.sharePct !== '') return C.num(t.sharePct);
    return C.num(state.settings.teacherShare);
  };

  /** First month a student can be billed: later of admission month and system billing start. */
  C.billingStartFor = (state, s) => {
    const a = C.monthOf(s.admissionDate);
    const b = state.settings.billingStart || a;
    return a > b ? a : b;
  };

  C.isBillable = (state, s, month) => {
    if (!C.isMonth(C.monthOf(s.admissionDate))) return false;
    if (month < C.billingStartFor(state, s)) return false;
    if (s.status === 'left' && s.leftDate && C.monthOf(s.leftDate) < month) return false;
    return true;
  };

  C.enrolledSubjectIds = (s, month) => {
    const ids = new Set();
    for (const e of s.enrollments || []) {
      if (e.from <= month && (!e.to || e.to >= month)) ids.add(e.subjectId);
    }
    return [...ids];
  };

  C.buildLines = (state, s, month) =>
    C.enrolledSubjectIds(s, month)
      .map((id) => {
        const sub = state.subjects.find((x) => x.id === id);
        if (!sub) return null;
        const fee = C.feeFor(sub, month) || { tuition: 0, stationery: 0 };
        return {
          subjectId: sub.id,
          subjectName: sub.name,
          teacherId: sub.teacherId || '',
          sharePct: sub.teacherId ? C.sharePct(state, sub.teacherId) : 0,
          tuition: C.num(fee.tuition),
          stationery: C.num(fee.stationery),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName));

  /* ---------------- invoices ---------------- */

  C.invoiceTotals = (inv) => {
    let tuition = 0, stationery = 0;
    for (const l of inv.lines || []) { tuition += C.num(l.tuition); stationery += C.num(l.stationery); }
    const discount = Math.min(Math.max(C.num(inv.discount), 0), tuition);
    const net = C.round2(tuition + stationery - discount);
    const paid = C.round2((inv.payments || []).reduce((a, p) => a + C.num(p.amount), 0));
    const due = C.round2(Math.max(0, net - paid));
    const status = due <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    return { tuition: C.round2(tuition), stationery: C.round2(stationery), gross: C.round2(tuition + stationery), discount: C.round2(discount), net, paid, due, status };
  };

  /**
   * Per-line tuition after concession, how much of it has been collected
   * (payments are spread proportionally over the bill), and teacher payable.
   */
  C.lineShares = (inv) => {
    const t = C.invoiceTotals(inv);
    const ratio = t.net > 0 ? Math.min(t.paid, t.net) / t.net : 0;
    const tf = t.tuition > 0 ? (t.tuition - t.discount) / t.tuition : 0;
    return (inv.lines || []).map((l) => {
      const netTuition = C.num(l.tuition) * tf;
      const collectedTuition = netTuition * ratio;
      const stationeryCollected = C.num(l.stationery) * ratio;
      const pct = l.teacherId ? C.num(l.sharePct) : 0;
      return Object.assign({}, l, {
        netTuition, collectedTuition, stationeryCollected,
        payableBilled: (netTuition * pct) / 100,
        payableCollected: (collectedTuition * pct) / 100,
      });
    });
  };

  function invoiceIndex(state) {
    const map = new Map();
    for (const inv of state.invoices) map.set(inv.studentId + '|' + inv.month, inv);
    return map;
  }

  /** Create / refresh / remove bills of one month. Returns true when something changed. */
  C.syncMonth = (state, month, idx) => {
    idx = idx || invoiceIndex(state);
    let changed = false;
    for (const s of state.students) {
      const key = s.id + '|' + month;
      const inv = idx.get(key);
      const lines = C.isBillable(state, s, month) ? C.buildLines(state, s, month) : [];
      if (!inv) {
        if (lines.length) {
          const created = { id: C.uid(), studentId: s.id, month, lines, discount: C.num(s.concession), discountManual: false, payments: [] };
          state.invoices.push(created);
          idx.set(key, created);
          changed = true;
        }
        continue;
      }
      if ((inv.payments || []).length) continue; // locked after first payment
      if (!lines.length) {
        state.invoices.splice(state.invoices.indexOf(inv), 1);
        idx.delete(key);
        changed = true;
        continue;
      }
      const disc = inv.discountManual ? C.num(inv.discount) : C.num(s.concession);
      if (JSON.stringify(inv.lines) !== JSON.stringify(lines) || disc !== inv.discount) {
        inv.lines = lines;
        inv.discount = disc;
        changed = true;
      }
    }
    return changed;
  };

  /** Keep every month from the earliest billable month up to `uptoMonth` (or today) in sync. */
  C.syncAll = (state, uptoMonth) => {
    // Drop unpaid bills of students that no longer exist.
    const ids = new Set(state.students.map((s) => s.id));
    const before = state.invoices.length;
    state.invoices = state.invoices.filter((i) => ids.has(i.studentId) || (i.payments || []).length);
    let changed = state.invoices.length !== before;

    let start = null;
    for (const s of state.students) {
      const b = C.billingStartFor(state, s);
      if (C.isMonth(b) && (!start || b < start)) start = b;
    }
    if (!start) return changed;
    let end = C.thisMonth();
    if (C.isMonth(uptoMonth) && uptoMonth > end) end = uptoMonth;
    const idx = invoiceIndex(state);
    for (const m of C.monthsBetween(start, end)) changed = C.syncMonth(state, m, idx) || changed;
    return changed;
  };

  C.invoicesOf = (state, month) => state.invoices.filter((i) => i.month === month);
  C.studentInvoices = (state, studentId) =>
    state.invoices.filter((i) => i.studentId === studentId).sort((a, b) => a.month.localeCompare(b.month));

  C.studentDue = (state, studentId, beforeMonth) =>
    C.round2(C.studentInvoices(state, studentId)
      .filter((i) => !beforeMonth || i.month < beforeMonth)
      .reduce((a, i) => a + C.invoiceTotals(i).due, 0));

  /* ---------------- payments ---------------- */

  C.nextReceiptNo = (state) => {
    state.counters.receipt = (state.counters.receipt || 0) + 1;
    return 'R-' + String(state.counters.receipt).padStart(5, '0');
  };

  /**
   * Record a payment for a student, settling the oldest dues first.
   * Returns { receiptNo, allocations: [{month, amount}], applied, leftover }.
   */
  C.allocatePayment = (state, studentId, amount, meta) => {
    meta = meta || {};
    let left = C.round2(amount);
    const receiptNo = C.nextReceiptNo(state);
    const allocations = [];
    for (const inv of C.studentInvoices(state, studentId)) {
      if (left <= 0) break;
      if (meta.onlyMonth && inv.month !== meta.onlyMonth) continue;
      const due = C.invoiceTotals(inv).due;
      if (due <= 0) continue;
      const pay = C.round2(Math.min(due, left));
      inv.payments.push({ id: C.uid(), receiptNo, date: meta.date || C.today(), amount: pay, mode: meta.mode || 'Cash', note: meta.note || '' });
      allocations.push({ month: inv.month, amount: pay });
      left = C.round2(left - pay);
    }
    return { receiptNo, allocations, applied: C.round2(amount - left), leftover: left };
  };

  C.receipt = (state, receiptNo) => {
    const rows = [];
    let studentId = null, date = '', mode = '', note = '';
    for (const inv of state.invoices) {
      for (const p of inv.payments || []) {
        if (p.receiptNo !== receiptNo) continue;
        studentId = inv.studentId; date = p.date; mode = p.mode; note = p.note;
        rows.push({ invoice: inv, month: inv.month, amount: p.amount });
      }
    }
    if (!rows.length) return null;
    rows.sort((a, b) => a.month.localeCompare(b.month));
    return { receiptNo, studentId, date, mode, note, rows, total: C.round2(rows.reduce((a, r) => a + r.amount, 0)) };
  };

  C.studentReceipts = (state, studentId) => {
    const map = new Map();
    for (const inv of C.studentInvoices(state, studentId)) {
      for (const p of inv.payments || []) {
        const r = map.get(p.receiptNo) || { receiptNo: p.receiptNo, date: p.date, mode: p.mode, note: p.note, total: 0, months: [] };
        r.total = C.round2(r.total + C.num(p.amount));
        r.months.push(inv.month);
        map.set(p.receiptNo, r);
      }
    }
    return [...map.values()].sort((a, b) => (b.date + b.receiptNo).localeCompare(a.date + a.receiptNo));
  };

  C.deleteReceipt = (state, receiptNo) => {
    for (const inv of state.invoices) inv.payments = (inv.payments || []).filter((p) => p.receiptNo !== receiptNo);
  };

  /* ---------------- teachers ---------------- */

  C.teacherReport = (state, month) => {
    const basis = state.settings.payoutBasis === 'billed' ? 'billed' : 'collected';
    const map = new Map();
    const blank = (teacher) => ({ teacher, subjects: new Map(), students: new Set(), tuitionBilled: 0, tuitionCollected: 0, payable: 0 });
    for (const t of state.teachers) map.set(t.id, blank(t));
    for (const inv of C.invoicesOf(state, month)) {
      for (const l of C.lineShares(inv)) {
        if (!l.teacherId) continue;
        if (!map.has(l.teacherId)) map.set(l.teacherId, blank({ id: l.teacherId, name: '(removed teacher)' }));
        const r = map.get(l.teacherId);
        const pay = basis === 'billed' ? l.payableBilled : l.payableCollected;
        r.students.add(inv.studentId);
        r.tuitionBilled += l.netTuition;
        r.tuitionCollected += l.collectedTuition;
        r.payable += pay;
        const sub = r.subjects.get(l.subjectId) || { subjectId: l.subjectId, name: l.subjectName, students: 0, sharePct: l.sharePct, tuitionBilled: 0, tuitionCollected: 0, payable: 0 };
        sub.students += 1; sub.tuitionBilled += l.netTuition; sub.tuitionCollected += l.collectedTuition; sub.payable += pay;
        r.subjects.set(l.subjectId, sub);
      }
    }
    return [...map.values()].map((r) => {
      const paid = C.round2(state.payouts.filter((p) => p.teacherId === r.teacher.id && p.month === month).reduce((a, p) => a + C.num(p.amount), 0));
      const payable = C.round2(r.payable);
      return {
        teacher: r.teacher,
        subjects: [...r.subjects.values()].map((s) => Object.assign(s, { tuitionBilled: C.round2(s.tuitionBilled), tuitionCollected: C.round2(s.tuitionCollected), payable: C.round2(s.payable) })),
        students: r.students.size,
        tuitionBilled: C.round2(r.tuitionBilled),
        tuitionCollected: C.round2(r.tuitionCollected),
        payable, paid, balance: C.round2(payable - paid), basis,
      };
    });
  };

  /* ---------------- summaries ---------------- */

  C.monthSummary = (state, month) => {
    const invs = C.invoicesOf(state, month);
    const s = { month, students: invs.length, tuition: 0, stationery: 0, discount: 0, billed: 0, collected: 0, outstanding: 0, paidCount: 0, partialCount: 0, unpaidCount: 0, teacherPayable: 0, teacherPaid: 0, teacherPayableIfAllPaid: 0, academyShare: 0 };
    const perSubject = new Map();
    for (const inv of invs) {
      const t = C.invoiceTotals(inv);
      s.tuition += t.tuition; s.stationery += t.stationery; s.discount += t.discount;
      s.billed += t.net; s.collected += Math.min(t.paid, t.net); s.outstanding += t.due;
      s[t.status + 'Count'] += 1;
      for (const l of C.lineShares(inv)) {
        s.teacherPayableIfAllPaid += l.payableBilled;
        const sub = perSubject.get(l.subjectId) || { subjectId: l.subjectId, name: l.subjectName, teacherId: l.teacherId, students: 0, tuition: 0, stationery: 0, collected: 0, teacherShare: 0 };
        sub.students += 1;
        sub.tuition += l.netTuition;
        sub.stationery += l.stationery;
        sub.collected += l.collectedTuition + l.stationeryCollected;
        sub.teacherShare += state.settings.payoutBasis === 'billed' ? l.payableBilled : l.payableCollected;
        perSubject.set(l.subjectId, sub);
      }
    }
    for (const r of C.teacherReport(state, month)) { s.teacherPayable += r.payable; s.teacherPaid += r.paid; }
    const base = state.settings.payoutBasis === 'billed' ? s.billed : s.collected;
    s.academyShare = base - s.teacherPayable;
    for (const k of Object.keys(s)) if (typeof s[k] === 'number') s[k] = C.round2(s[k]);
    s.perSubject = [...perSubject.values()]
      .map((x) => Object.assign(x, { tuition: C.round2(x.tuition), stationery: C.round2(x.stationery), collected: C.round2(x.collected), teacherShare: C.round2(x.teacherShare), academyShare: C.round2((state.settings.payoutBasis === 'billed' ? x.tuition + x.stationery : x.collected) - x.teacherShare) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return s;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  else root.Calc = C;
})(typeof window !== 'undefined' ? window : globalThis);
