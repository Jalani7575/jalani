/* Cerebrox Learning Academy — storage (browser localStorage) + backup + sample data. */
(function (root) {
  'use strict';
  const C = root.Calc;
  const KEY = 'cerebrox-academy-v1';

  function defaultState() {
    return {
      version: 1,
      settings: {
        academyName: 'Cerebrox Learning Academy',
        address: '',
        phone: '',
        currency: 'Rs',
        teacherShare: 70,
        payoutBasis: 'collected', // 'collected' = teacher earns 70% of tuition actually received; 'billed' = of tuition billed
        billingStart: C.thisMonth(),
      },
      counters: { student: 0, receipt: 0 },
      teachers: [],
      subjects: [],
      students: [],
      invoices: [],
      payouts: [],
    };
  }

  function normalize(data) {
    const base = defaultState();
    const s = Object.assign(base, data || {});
    s.settings = Object.assign(defaultState().settings, (data && data.settings) || {});
    s.counters = Object.assign({ student: 0, receipt: 0 }, (data && data.counters) || {});
    for (const k of ['teachers', 'subjects', 'students', 'invoices', 'payouts']) if (!Array.isArray(s[k])) s[k] = [];
    return s;
  }

  const Store = {
    KEY,
    defaultState,
    normalize,
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        return raw ? normalize(JSON.parse(raw)) : defaultState();
      } catch (e) {
        console.error('Could not read saved data', e);
        return defaultState();
      }
    },
    save(state) {
      state.savedAt = new Date().toISOString();
      localStorage.setItem(KEY, JSON.stringify(state));
    },
    validate(data) {
      if (!data || typeof data !== 'object') throw new Error('File is not a valid backup.');
      for (const k of ['teachers', 'subjects', 'students']) if (!Array.isArray(data[k])) throw new Error('Backup is missing "' + k + '".');
      return normalize(data);
    },

    sampleData() {
      const s = defaultState();
      const now = C.thisMonth();
      const m2 = C.addMonths(now, -2), m1 = C.addMonths(now, -1);
      s.settings.billingStart = m2;
      s.settings.address = 'Main Boulevard, City';
      s.settings.phone = '0300-0000000';
      const t = (name, phone) => { const x = { id: C.uid(), name, phone, sharePct: '', notes: '' }; s.teachers.push(x); return x; };
      const tA = t('Sir Ahmed Raza', '0301-1111111');
      const tB = t('Miss Sana Iqbal', '0302-2222222');
      const tC = t('Sir Bilal Khan', '0303-3333333');
      const tD = t('Miss Hina Tariq', '0304-4444444');
      const sub = (name, teacher, tuition, stationery, extra) => {
        const x = { id: C.uid(), name, teacherId: teacher.id, feeHistory: [{ from: m2, tuition, stationery }].concat(extra || []) };
        s.subjects.push(x); return x;
      };
      const math = sub('Mathematics', tA, 3000, 500, [{ from: now, tuition: 3500, stationery: 500 }]);
      const phy = sub('Physics', tC, 2500, 400);
      const chem = sub('Chemistry', tC, 2500, 400);
      const eng = sub('English', tB, 2000, 300);
      const bio = sub('Biology', tD, 2500, 400);
      const people = [
        ['Ali Hassan', 'Hassan Ali', '9th', [math, phy, chem], m2, 0],
        ['Fatima Noor', 'Noor Ahmed', '10th', [math, eng, bio], m2, 0],
        ['Usman Tariq', 'Tariq Mehmood', '9th', [math, phy], m2, 500],
        ['Ayesha Khan', 'Imran Khan', '11th', [phy, chem, bio], m1, 0],
        ['Hamza Iqbal', 'Iqbal Hussain', '10th', [math, eng], m1, 0],
        ['Zainab Ali', 'Ali Raza', '12th', [chem, bio, eng], m1, 0],
        ['Saad Ahmed', 'Ahmed Saeed', '11th', [math, phy, eng], now, 0],
        ['Maryam Javed', 'Javed Akhtar', '9th', [eng, bio], now, 0],
      ];
      for (const [name, father, cls, subs, from, concession] of people) {
        s.counters.student += 1;
        s.students.push({
          id: C.uid(), rollNo: 'CLA-' + String(s.counters.student).padStart(4, '0'), name, fatherName: father,
          phone: '03' + String(Math.floor(100000000 + Math.random() * 899999999)), className: cls, address: '',
          admissionDate: from + '-05', status: 'active', leftDate: '', concession,
          enrollments: subs.map((x) => ({ subjectId: x.id, from, to: null })),
        });
      }
      C.syncAll(s, now);
      // Pay all bills of the first past month, most of the second, a few of the current one.
      const pay = (inv, frac, date) => {
        const due = C.invoiceTotals(inv).due;
        if (due > 0) C.allocatePayment(s, inv.studentId, C.round2(due * frac), { date, mode: 'Cash', onlyMonth: inv.month });
      };
      C.invoicesOf(s, m2).forEach((i) => pay(i, 1, m2 + '-08'));
      C.invoicesOf(s, m1).forEach((i, n) => pay(i, n === 1 ? 0.5 : n === 4 ? 0 : 1, m1 + '-09'));
      C.invoicesOf(s, now).forEach((i, n) => { if (n % 3 === 0) pay(i, 1, now + '-06'); });
      s.payouts.push({ id: C.uid(), teacherId: tA.id, month: m2, amount: C.teacherReport(s, m2).find((r) => r.teacher.id === tA.id).payable, date: m2 + '-28', note: 'Full payment' });
      return s;
    },
  };

  root.Store = Store;
})(window);
