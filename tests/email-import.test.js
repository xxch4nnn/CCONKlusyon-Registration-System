// EmailBlaster.gs + RosterImport.gs (+ Code.gs for generateCredentials) against mocked Apps Script.
// Fictional data only. Run: node tests/email-import.test.js  (also run by tests/run.js)
const fs = require('fs'), vm = require('vm'), path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'apps-script', f), 'utf8');

let fail = 0;
const ok = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fail++; };

const MA_HEADERS = ['email', 'full_name', 'org_classification', 'club_name', 'designation', 'ticket_type', 'attendance_code', 'qr_code_url', 'table_allocation', 'photo_url', 'checkin_status', 'checkin_timestamp', 'checked_in_by', 'pass_sent', 'pass_sent_timestamp', 'BATCH'];
const SEAT_HEAD = ['No.', 'Table', 'Seat', 'Seating Area (floor plan)', 'Table Cluster', 'Category', 'Group / Club', 'Acronym', 'Cluster', 'Position', 'Title', 'First Name', 'Full Name', 'Other Name (as submitted)', 'Term', 'Email', 'Status', 'Remarks', 'Check-in'];
const seatRow = o => SEAT_HEAD.map(h => ({ 'No.': o.no, Table: o.table || '', Category: o.cat, 'Group / Club': o.club || '', Cluster: o.cluster || '', Position: o.pos || '', 'Full Name': o.name, Email: o.email || '', Status: o.status || 'Seated' }[h] ?? ''));

function world(maRows, seatRows) {
  const ma = { values: [MA_HEADERS.slice(), ...maRows.map(r => { const a = MA_HEADERS.map(() => ''); Object.keys(r).forEach(k => { a[MA_HEADERS.indexOf(k)] = r[k]; }); return a; })] };
  const maSheet = {
    getDataRange: () => ({ getValues: () => ma.values.map(r => r.slice()), getFormulas: () => ma.values.map(r => r.map(() => '')) }),
    getRange: (r, c, nr, nc) => ({
      setValue: v => { while (ma.values.length < r) ma.values.push([]); ma.values[r - 1][c - 1] = v; },
      setValues: grid => { for (let i = 0; i < nr; i++) { ma.values[r - 1 + i] = ma.values[r - 1 + i] || []; for (let j = 0; j < nc; j++) ma.values[r - 1 + i][c - 1 + j] = grid[i][j]; } }
    })
  };
  const seatValues = () => [['CCOnklusyon 2026 — Final Seating & Master List (updated 2026-10-01)'], ['One row per registration…'], SEAT_HEAD, ...seatRows.map(seatRow)]; // read live, so edits to SEATING show up on re-import
  const sent = [], logs = [];
  const ctx = {
    console, JSON, Math, String, Date, Object, logs,
    Logger: { log: m => logs.push(String(m)) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: () => maSheet }),
      openById: () => ({ getSheetByName: n => n === 'Final Seating' ? { getDataRange: () => ({ getValues: () => seatValues() }) } : null }),
      flush() {}
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === 'BETA_TEST_EMAILS' ? 't1@x.test, t2@x.test' : null), setProperty() {} }) },
    MailApp: { getRemainingDailyQuota: () => 100, sendEmail: m => sent.push(m) },
    Utilities: { sleep() {}, formatDate: () => '2026-10-01T19:00:00+08:00', getUuid: () => 'u' },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getHeaders: () => ({ 'Content-Type': 'image/png' }), getBlob: () => ({ setName() { return this; } }) }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ setMimeType() { return this; } }) }
  };
  vm.createContext(ctx);
  vm.runInContext(read('Code.gs') + '\n' + read('EmailBlaster.gs') + '\n' + read('RosterImport.gs'), ctx);
  const rowsAsObjects = () => ma.values.slice(1).map(r => Object.fromEntries(ma.values[0].map((h, i) => [String(h).trim(), r[i] === undefined ? '' : r[i]])));
  return { ma, sent, logs, ctx, run: code => vm.runInContext(code, ctx), rowsAsObjects };
}

const SEATING = [
  { no: 254, table: 'VVIP', cat: 'VVIP', club: 'USeP Top Management', pos: 'VPAD', name: 'Dr. Ana Example', email: 'vvip@x.test' },
  { no: 10, table: '19', cat: 'Club Participant', club: 'Computing Society', cluster: 'Academic', pos: 'President', name: 'Ben Sample', email: 'ben@x.test' },
  { no: 11, table: '19', cat: 'club participant ', club: 'Computing Society', name: '(TBA)', email: 'club@x.test' },
  { no: 299, table: '—', cat: 'USeP Personnel', club: 'ROTC', pos: 'Marshal', name: '(TBA)', status: 'On duty (no table)' },
  { no: 300, table: '+1 Table 1', cat: 'Plus One', club: 'Guest of X', name: 'Cy Plus', email: 'cy@x.test' },
  { no: 301, cat: 'Nominee', name: 'Nom Inee', email: 'n@x.test' },
  { no: 302, table: '5', cat: 'Alumni', name: 'Wd Rawn', email: 'w@x.test', status: 'WITHDRAWN' },
  { no: 303, table: '6', cat: 'Sponsor', name: 'Odd Type', email: 'o@x.test' }
];
const TEST_ROWS = [{ email: 'old@x.test', full_name: 'Old Test Row', ticket_type: 'Regular Attendee', attendance_code: '11111' }];

// ---------- 1. preview writes nothing ----------
let w = world(TEST_ROWS, SEATING);
const before = JSON.stringify(w.ma.values);
w.run('importFinalSeatingPreview()');
ok('preview: nothing written', JSON.stringify(w.ma.values) === before);
ok('preview: reports 6 to add, 2 skipped', w.logs.some(l => /PREVIEW.*Added 6/.test(l)) && w.logs.some(l => /Skipped 2/.test(l)), w.logs[0]);
ok('preview: flags the old test row', w.logs.some(l => /did not come from Final Seating.*DELETE/.test(l)));
ok('preview: flags a category outside the 12 types', w.logs.some(l => /not in the 12 attendee types.*Sponsor/.test(l)));

// ---------- 2. import ----------
w.run('importFinalSeating()');
let rows = w.rowsAsObjects();
const by = no => rows.find(r => String(r.reg_no) === String(no));
ok('import: attendee_type and reg_no columns appended after BATCH', w.ma.values[0].slice(16).join() === 'attendee_type,reg_no', w.ma.values[0].join());
ok('import: 6 rows added (nominee + withdrawn skipped), test row kept', rows.length === 7 && !by(301) && !by(302));
ok('import: VVIP -> attendee_type VVIP, ticket_type VIP Pass', by(254).attendee_type === 'VVIP' && by(254).ticket_type === 'VIP Pass');
ok('import: category spelling normalised ("club participant " -> Club Participant)', by(11).attendee_type === 'Club Participant' && by(11).ticket_type === 'Regular Attendee');
ok('import: "—" table + on-duty status -> "On duty"', by(299).table_allocation === 'On duty');
ok('import: org_classification/club/designation mapped', by(10).org_classification === 'Academic' && by(10).club_name === 'Computing Society' && by(10).designation === 'President');
ok('import: codes generated for every new row (5 digits)', rows.filter(r => r.reg_no).every(r => /^\d{5}$/.test(String(r.attendance_code))));
ok('import: old test row untouched', rows[0].full_name === 'Old Test Row' && rows[0].attendance_code === '11111');

// ---------- 3. re-import after a table change keeps codes and pass_sent ----------
const codeBen = by(10).attendance_code;
w.ma.values.forEach((r, i) => { if (i && String(r[17]) === '10') { r[13] = true; r[14] = '2026-10-01T18:00:00+08:00'; } });
SEATING[1].table = '20';
w.logs.length = 0;
w.run('importFinalSeating()');
rows = w.rowsAsObjects();
ok('re-import: no duplicates added', rows.length === 7 && w.logs.some(l => /Added 0, updated 1/.test(l)), w.logs[0]);
ok('re-import: table updated, code + pass_sent kept', by(10).table_allocation === '20' && by(10).attendance_code === codeBen && by(10).pass_sent === true);
ok('re-import: warns the table changed after the pass was sent', w.logs.some(l => /changed AFTER their pass was sent.*No\. 10/.test(l)));

// ---------- 4. email states ----------
const html = no => w.ctx.buildPassHtml_(by(no));
const text = no => w.ctx.buildPassPlainText_(by(no));
ok('email named: "This invitation is for:" + full name', /This invitation is for:<\/div><div[^>]*>Ben Sample<\/div>/.test(html(10)));
ok('email named: no representative notice', !/representative/i.test(html(10)));
ok('email TBA: one representative of the club + "send 1 representative only"', /One \(1\) representative of Computing Society/.test(html(11)) && /Please send 1 representative only\./.test(html(11)));
ok('email TBA: never prints "(TBA)" as a name', !/\(TBA\)/.test(html(11)));
ok('email chip shows the attendee type', />Club Participant<\/span>/.test(html(10)) && />Plus One<\/span>/.test(html(300)) && />VVIP<\/span>/.test(html(254)));
ok('email chip: VVIP filled gold, others outlined', /background-color: #f1b763;[^>]*>VVIP</.test(html(254)) && /background-color: transparent;[^>]*>Club Participant</.test(html(10)));
ok('email: no unfilled placeholders', [254, 10, 11, 300].every(n => !/\{\{/.test(html(n))));
ok('plain text: both states', /This invitation is for: Ben Sample/.test(text(10)) && /One \(1\) representative of Computing Society\nPlease send 1 representative only\./.test(text(11)) && /Attendee type: Club Participant/.test(text(10)));
ok('email escapes names', /Dr\. Ana Example/.test(html(254)) && !/<script/.test(w.ctx.buildPassHtml_({ full_name: '<script>x</script>', attendance_code: '1', club_name: '' })));

// ---------- 5. variety beta test ----------
w.sent.length = 0;
w.run('sendEventPassesBetaTestVariety()');
const variety = w.sent.map(m => (m.htmlBody.match(/text-transform: uppercase;">([^<]+)<\/span>/) || [])[1] + (/representative only/.test(m.htmlBody) ? '+TBA' : ''));
ok('variety test: one pass per type + a TBA variant, only to test inboxes', w.sent.length >= 5 && w.sent.every(m => /^t\d@x\.test$/.test(m.to) && /^\[TEST\]/.test(m.subject)) && variety.includes('Club Participant+TBA') && variety.includes('Club Participant'), variety.join(' | '));
ok('variety test: does not stamp pass_sent', w.rowsAsObjects().filter(r => r.pass_sent === true).length === 1);

// ---------- 6. real send skips a row with no email (on-duty TBA) ----------
w.sent.length = 0;
w.run('sendEventPasses()');
ok('real send: rows without email skipped; already-sent row skipped', !w.sent.some(m => /Marshal/.test(m.htmlBody)) && !w.sent.some(m => m.to === 'ben@x.test') && w.sent.some(m => m.to === 'club@x.test'));

console.log(fail ? '\nSOME FAILED' : '\nALL PASS');
process.exitCode = fail ? 1 : 0;
