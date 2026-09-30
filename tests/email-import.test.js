// EmailBlaster.gs + RosterImport.gs (+ Code.gs for generateCredentials) against mocked Apps Script.
// Fictional data only. Run: node tests/email-import.test.js  (also run by tests/run.js)
const fs = require('fs'), vm = require('vm'), path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'apps-script', f), 'utf8');

let fail = 0;
const ok = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fail++; };

const MA_HEADERS = ['email', 'full_name', 'org_classification', 'club_name', 'designation', 'ticket_type', 'attendance_code', 'qr_code_url', 'table_allocation', 'photo_url', 'checkin_status', 'checkin_timestamp', 'checked_in_by', 'pass_sent', 'pass_sent_timestamp', 'BATCH'];
const SEAT_HEAD = ['No.', 'Table', 'Seat', 'Seating Area (floor plan)', 'Table Cluster', 'Category', 'Group / Club', 'Acronym', 'Cluster', 'Position', 'Title', 'First Name', 'Full Name', 'Other Name (as submitted)', 'Term', 'Email', 'Status', 'Remarks', 'Check-in'];
const seatRow = o => SEAT_HEAD.map(h => ({ 'No.': o.no, Table: o.table || '', Category: o.cat, 'Group / Club': o.club || '', Cluster: o.cluster || '', Position: o.pos || '', 'Full Name': o.name, Email: o.email || '', Status: o.status || 'Seated' }[h] ?? ''));

function world(maRows, seatRows, opts = {}) {
  const ma = { values: [MA_HEADERS.slice(), ...maRows.map(r => { const a = MA_HEADERS.map(() => ''); Object.keys(r).forEach(k => { a[MA_HEADERS.indexOf(k)] = r[k]; }); return a; })] };
  const maSheet = {
    getDataRange: () => ({ getValues: () => ma.values.map(r => r.slice()), getFormulas: () => ma.values.map(r => r.map(() => '')) }),
    getRange: (r, c, nr, nc) => ({
      setValue: v => { while (ma.values.length < r) ma.values.push([]); ma.values[r - 1][c - 1] = v; },
      setValues: grid => { for (let i = 0; i < nr; i++) { ma.values[r - 1 + i] = ma.values[r - 1 + i] || []; for (let j = 0; j < nc; j++) ma.values[r - 1 + i][c - 1 + j] = grid[i][j]; } }
    })
  };
  const seatValues = () => [['CCOnklusyon 2026 — Final Seating & Master List (updated 2026-10-01)'], ['One row per registration…'], SEAT_HEAD, ...seatRows.map(seatRow)]; // read live, so edits to SEATING show up on re-import
  const seatSheet = { getDataRange: () => ({ getValues: () => seatValues() }) };
  maSheet.getSheetId = () => 155323925;
  const sent = [], logs = [];
  const ctx = {
    console, JSON, Math, String, Date, Object, logs,
    Logger: { log: m => logs.push(String(m)) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: n => n === 'Final Seating' ? (opts.renamed ? null : seatSheet) : maSheet,
        getSheets: () => [maSheet, Object.assign({ getSheetId: () => 828790481 }, seatSheet)]
      }),
      openById: () => ({ getSheetByName: n => n === 'Final Seating' ? { getDataRange: () => ({ getValues: () => seatValues() }) } : null }),
      flush() {}
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === 'BETA_TEST_EMAILS' ? (opts.testEmails || 't1@x.test, t2@x.test') : null), setProperty() {} }) },
    MailApp: { getRemainingDailyQuota: () => 100, sendEmail: m => sent.push(m) },
    Utilities: { sleep() {}, formatDate: () => '2026-10-01T19:00:00+08:00', getUuid: () => 'u' },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getHeaders: () => ({ 'Content-Type': 'image/png' }), getBlob: () => ({ setName() { return this; } }) }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => "me@x.test" }) },
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
ok('preview: flags the old test row', w.logs.some(l => /did not come from Final Seating.*WILL get a pass.*delete any that are old test rows/.test(l)));
ok('preview: flags a category outside the 12 types', w.logs.some(l => /not in the 12 attendee types.*Sponsor/.test(l)));

// ---------- 1b. tab found by gid if renamed ----------
const wr = world(TEST_ROWS, SEATING, { renamed: true });
wr.run('importFinalSeatingPreview()');
ok('preview: Final Seating found by gid 828790481 when the tab is renamed', wr.logs.some(l => /PREVIEW.*Added 6/.test(l)));

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
ok('variety test: one pass per type + a TBA variant, only to test inboxes', w.sent.length >= 5 && w.sent.every(m => /^t\d@x\.test$/.test(m.to) && /^\[TEST SAMPLE\]/.test(m.subject)) && variety.includes('Club Participant+TBA') && variety.includes('Club Participant'), variety.join(' | '));
const realCodes = w.rowsAsObjects().map(r => String(r.attendance_code)).filter(Boolean);
const realNames = w.rowsAsObjects().map(r => String(r.full_name)).filter(n => n && n !== '(TBA)');
ok('variety test: no real attendee name or working code in any email', w.sent.every(m => realCodes.every(c => !m.htmlBody.includes(c) && !m.body.includes(c)) && realNames.every(n => !m.htmlBody.includes(n))));
ok('variety test: every pass says SAMPLE and uses code 00000', w.sent.every(m => /SAMPLE PASS/.test(m.htmlBody) && />00000</.test(m.htmlBody) && /^SAMPLE PASS/.test(m.body)));
ok('variety test: does not stamp pass_sent', w.rowsAsObjects().filter(r => r.pass_sent === true).length === 1);

// ---------- 6. real send skips a row with no email (on-duty TBA) ----------
w.sent.length = 0;
w.run('sendEventPassesLIVE()');
ok('real send: rows without email skipped; already-sent row skipped', !w.sent.some(m => /Marshal/.test(m.htmlBody)) && !w.sent.some(m => m.to === 'ben@x.test') && w.sent.some(m => m.to === 'club@x.test'));

// ---------- 7. the reported bug: test address must get ITS OWN pass ----------
// Sheet order: Sual, Mandin, Gabales, Genobisa, Gabutero. Test addresses: Sual, Mandin, Gabales, Gabutero.
// Before the fix, the 4th address (Gabutero) received the 4th ROW (Genobisa) — someone else's pass.
const PEOPLE = [['sual@x.test', 'John Sual', '11111'], ['mandin@x.test', 'Josh Mandin', '22222'], ['gabales@x.test', 'Irene Gabales', '33333'],
  ['genobisa@x.test', 'Nathalie Genobisa', '44444'], ['gabutero@x.test', 'Benjamin Gabutero', '55555'], ['office@x.test', 'Guest One', '66666'], ['office@x.test', 'Guest Two', '77777']]
  .map(([email, full_name, attendance_code]) => ({ email, full_name, attendance_code, ticket_type: 'Regular Attendee', club_name: 'CCO' }));
const w7 = world(PEOPLE, [], { testEmails: 'sual@x.test, mandin@x.test, gabales@x.test, GABUTERO@x.test , office@x.test, stranger@x.test' });
w7.run('sendEventPassesBetaTest()');
const to = a => w7.sent.filter(m => m.to.toLowerCase() === a);
ok('bug repro: Gabutero gets HIS pass (55555), not Genobisa\'s', to('gabutero@x.test').length === 1 && /Benjamin Gabutero/.test(to('gabutero@x.test')[0].htmlBody) && />55555</.test(to('gabutero@x.test')[0].htmlBody) && !w7.sent.some(m => /Genobisa|44444/.test(m.htmlBody)));
ok('own pass: every matched address gets exactly its own row', ['sual', 'mandin', 'gabales'].every((n, i) => to(n + '@x.test').length === 1 && to(n + '@x.test')[0].htmlBody.includes(PEOPLE[i].full_name)));
ok('shared address gets every pass the live send would send it (2)', to('office@x.test').length === 2 && /Guest One/.test(to('office@x.test')[0].htmlBody) && /Guest Two/.test(to('office@x.test')[1].htmlBody));
ok('address not in the list gets a [TEST SAMPLE] with code 00000, no real data', to('stranger@x.test').length === 1 && /^\[TEST SAMPLE\]/.test(to('stranger@x.test')[0].subject) && />00000</.test(to('stranger@x.test')[0].htmlBody) && !PEOPLE.some(p => to('stranger@x.test')[0].htmlBody.includes(p.full_name)));
ok('own passes use "[TEST]" (not SAMPLE) and carry no sample notice', to('sual@x.test')[0].subject.startsWith('[TEST] ') && !/SAMPLE PASS/.test(to('sual@x.test')[0].htmlBody));
ok('test send never emails a non-test address', w7.sent.every(m => /^(sual|mandin|gabales|gabutero|office|stranger)@x\.test$/i.test(m.to)));
ok('execution log shows who got what', w7.logs.some(l => /TEST PLAN: GABUTERO@x\.test <- their own pass: Benjamin Gabutero/.test(l)) && w7.logs.some(l => /TEST PLAN: stranger@x\.test <- SAMPLE/.test(l)));
ok('no pass_sent written by the test', w7.ma.values.slice(1).every(r => r[13] === '' || r[13] === undefined));

// ---------- 8. custom blast test mode pairs by email too ----------
w7.sent.length = 0;
w7.run("sendCustomBlast('Update', '<p>Hi {{full_name}}, code {{attendance_code}}</p>', 'Hi {{full_name}}', true, ['gabutero@x.test', 'stranger@x.test'])");
ok('custom blast test: own merge for a listed address, sample for an unlisted one', w7.sent.length === 2 && /Benjamin Gabutero, code 55555/.test(w7.sent[0].htmlBody) && /Sample Attendee, code 00000/.test(w7.sent[1].htmlBody) && /^\[TEST SAMPLE\]/.test(w7.sent[1].subject));

// ---------- 9. Run-dropdown safety ----------
ok('the only visible pass function that emails attendees is sendEventPassesLIVE', typeof w7.ctx.sendEventPasses === 'undefined' && typeof w7.ctx.sendEventPassesBetaTestFull === 'undefined' && typeof w7.ctx.sendEventPassesLIVE === 'function');
w7.sent.length = 0;
w7.run('sendEventPassesLIVE()');
ok('LIVE: every row to its own email, stamped', w7.sent.length === 7 && PEOPLE.every((p, i) => w7.sent[i].to === p.email && w7.sent[i].htmlBody.includes(p.full_name) && w7.sent[i].htmlBody.includes('>' + p.attendance_code + '<')) && w7.ma.values.slice(1).every(r => r[13] === true));

// ---------- 10. "already sent?" rule: send when pass_sent OR pass_sent_timestamp is empty ----------
const R = (email, name, code, sentFlag, ts) => ({ email, full_name: name, attendance_code: code, ticket_type: 'Regular Attendee', club_name: 'CCO', pass_sent: sentFlag, pass_sent_timestamp: ts });
const TS = '2026-10-01T20:00:00+08:00';
const w10 = world([
  R('both@x.test', 'Both Filled', '10001', true, TS),          // sent -> skip
  R('flag@x.test', 'Flag Only', '10002', true, ''),             // timestamp empty -> send
  R('ts@x.test', 'Timestamp Only', '10003', '', TS),            // pass_sent cleared -> send (re-send)
  R('unticked@x.test', 'Unticked Box', '10004', false, TS),     // checkbox unticked -> send
  R('text@x.test', 'Text FALSE', '10005', 'FALSE', TS),         // typed FALSE -> send
  R('yes@x.test', 'Typed Yes', '10006', 'Yes', TS),             // typed yes + ts -> skip
  R('new@x.test', 'Added Later', '', '', ''),                   // hand-added row, no code yet -> code generated, send
  R('', 'No Email Person', '10008', '', '')                     // no email -> skip
], []);
w10.run('previewEventPassesLIVE()');
ok('preview: sends nothing, writes nothing, counts right', w10.sent.length === 0 && w10.logs.some(l => /Next live run would email 5 of 8 row\(s\); 2 already sent; 1 have no email/.test(l)), w10.logs.find(l => /PREVIEW/.test(l)));
ok('preview: says the hand-added row gets a code first', w10.logs.some(l => /1 of them have no attendance code yet/.test(l)));
w10.run('sendEventPassesLIVE()');
const got = w10.sent.map(m => m.to).sort().join(',');
ok('LIVE: sends exactly the rows with pass_sent or timestamp empty', got === 'flag@x.test,new@x.test,text@x.test,ts@x.test,unticked@x.test', got);
ok('LIVE: skips rows with both filled (TRUE / typed Yes)', !w10.sent.some(m => /both@|yes@/.test(m.to)));
const newRow = w10.rowsAsObjects().find(r => r.email === 'new@x.test');
ok('LIVE: hand-added row got a code before sending, and its pass shows it', /^\d{5}$/.test(String(newRow.attendance_code)) && w10.sent.find(m => m.to === 'new@x.test').htmlBody.includes('>' + newRow.attendance_code + '<'));
ok('LIVE: every sent row now has both stamps', ['flag@x.test', 'ts@x.test', 'unticked@x.test', 'text@x.test', 'new@x.test'].every(e => { const r = w10.rowsAsObjects().find(x => x.email === e); return r.pass_sent === true && String(r.pass_sent_timestamp).trim() !== ''; }));
w10.sent.length = 0;
w10.run('sendEventPassesLIVE()');
ok('LIVE again: nobody is emailed twice', w10.sent.length === 0);
// someone added after the first run, and someone re-sent by clearing pass_sent
w10.ma.values.push(w10.ma.values[0].map(h => ({ email: 'late@x.test', full_name: 'Late Addition' }[h] ?? '')));
w10.ma.values.forEach((r, i) => { if (i && r[0] === 'both@x.test') r[13] = ''; });
w10.run('sendEventPassesLIVE()');
ok('LIVE after edits: only the new person and the cleared row are emailed', w10.sent.map(m => m.to).sort().join(',') === 'both@x.test,late@x.test', w10.sent.map(m => m.to).join(','));

console.log(fail ? '\nSOME FAILED' : '\nALL PASS');
process.exitCode = fail ? 1 : 0;
