# Cerebrox Learning Academy: Academy Manager

A web app for running **Cerebrox Learning Academy**: student enrollment, monthly fees per subject (tuition + stationery), fee collection with receipts, and automatic teacher payments (70% of tuition).

No installation, no server and no internet needed. It runs in any modern browser.

## How to start

**Option 1: open the file.** Double-click `index.html`. It opens in Chrome, Edge or Firefox.

**Option 2: run a local web server** (recommended, behaves exactly like a website):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

**Option 3: put it online.** Enable GitHub Pages for this repository (Settings → Pages → deploy from branch, root folder) and open the link from any computer. Each computer/browser keeps its **own** data (see *Data & backup* below).

> First time? Go to **Settings & Backup → Load sample data** to see the app filled with example students, then **Erase all data** when you're ready to enter your own.

## Setup order

1. **Teachers**: add each teacher. The default share is 70% of tuition; you can set a different % for a specific teacher.
2. **Subjects & Fees**: add each subject with its teacher, **monthly tuition fee**, **monthly stationery fee**, and the month the fee starts from.
3. **Students**: enroll a student, tick their subjects, optionally set a monthly concession.
4. **Monthly Fees**: bills are already there. Click **Collect** to take payment and print a receipt.
5. **Teacher Payments**: shows how much each teacher must be paid. Click **Pay** to record it.

## What is calculated automatically

| Item | Rule |
|---|---|
| Subject fee | Tuition + stationery. Fees are kept **per month**: “Change fee” sets a new fee from a chosen month onward; earlier months keep the old fee (see *History*). |
| Student monthly bill | Sum of (tuition + stationery) of every subject the student is enrolled in **that month**, minus the concession (concession reduces tuition). |
| Monthly bills | Created automatically every month for every active student, from their admission month (or the *billing start* month in Settings). |
| Subject changes | Adding/removing a subject takes effect from a month you choose; earlier months are unchanged. |
| Payments | Applied to the **oldest unpaid month first**. Partial payments are allowed. Each payment gets a receipt number (R-00001…). |
| Previous dues / arrears | Unpaid amounts from earlier months are carried forward and shown on fee slips and receipts. |
| Teacher share | **70% (or the teacher’s own %) of tuition** for their subjects. Stationery is never shared. |
| Payout basis | Settings: *Tuition collected* (default: the teacher earns as students pay) or *Tuition billed* (teacher earns on the full bill, paid or not). |
| Academy share | Fee (collected or billed) − teacher share = 30% of tuition + all stationery. |
| Locking | A bill updates itself when fees/subjects change **until a payment is recorded on it**; after that it is locked 🔒 so history stays correct. To correct a paid bill, delete its receipt (student profile), and it recalculates. |
| Left students | Mark a student as *Left academy* with a leaving date; billing stops after that month and their history is kept. |

## Pages

- **Dashboard**: students, billed, collected, outstanding, previous arrears, teacher payable, academy share, subject-wise summary, highest dues, recent payments.
- **Students**: search and filter, enroll and edit, CSV export, student profile with enrollment history, all monthly bills, receipts.
- **Monthly Fees**: every bill for the selected month, per-month concession, collect payment, printable fee slips (single or all unpaid).
- **Subjects & Fees**: current fee per month, change fee from any month, fee history, teacher share per student.
- **Teachers**: subjects taught, share %, payable/paid/balance for the month.
- **Teacher Payments**: payable per teacher with subject breakdown, record payments.
- **Reports**: 12-month summary for the year, subject-wise report, fee defaulters, all exportable to CSV (opens in Excel).
- **Settings & Backup**: academy name/address/phone (printed on receipts), currency, default teacher %, payout basis, billing start month, backup/restore.

Use the month selector (top right) to move between months.

## Data & backup

Data is saved automatically in the browser (localStorage) on the computer you use. It is **not** shared between computers or browsers, and clearing browser data deletes it. So:

- Use **Settings → Download backup** regularly (e.g. weekly) and keep the `.json` file safe (USB / Google Drive).
- To move to another computer, download a backup there and use **Restore from backup**.

## Project structure

```
index.html        app shell and navigation
css/styles.css    styling (including print layout for receipts / fee slips)
js/calc.js        all fee / payment / teacher-share calculations (no UI)
js/store.js       saving, backup validation, sample data
js/app.js         pages, forms and actions
tests/            unit tests for the calculations
```

Run the tests (Node 18+):

```bash
node --test tests/*.test.js
```
