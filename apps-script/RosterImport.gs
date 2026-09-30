/**
 * CCOnklusyon Registration & Check-in System — Roster import (2026-10-01)
 *
 * Loads the "Final Seating" tab (one row per registration; same workbook as Master_Attendance)
 * into Master_Attendance, so the passes, the scanner and the wall all work from the
 * final list. Paste this as a NEW script file (Apps Script editor: + -> Script -> name it
 * RosterImport) next to Code.gs and EmailBlaster.gs, save, then:
 *
 *   1. Run importFinalSeatingPreview()  — reads both sheets, WRITES NOTHING, logs what would change.
 *   2. Run importFinalSeating()         — does it, then generates attendance codes for new rows.
 *   3. Run auditRoster() (Code.gs) and sendEventPassesBetaTestVariety() (EmailBlaster.gs).
 *
 * Safe to re-run after the seating list changes: rows are matched on the registration "No.", so a
 * re-run UPDATES name/club/table/type in place and never touches attendance_code, qr_code_url,
 * check-in columns, pass_sent, pass_sent_timestamp or BATCH. Nothing is ever deleted: rows that
 * left the list, and rows that never came from it (the old test rows), are only reported.
 *
 * Mapping (Final Seating -> Master_Attendance):
 *   No.              -> reg_no          (new column, the match key)
 *   Category         -> attendee_type   (new column; one of ATTENDEE_TYPES)
 *   Category         -> ticket_type     ("VIP Pass" for VVIP/VIP, else "Regular Attendee")
 *   Full Name        -> full_name       (blank -> "(TBA)")
 *   Email            -> email
 *   Cluster          -> org_classification
 *   Group / Club     -> club_name
 *   Position         -> designation
 *   Table            -> table_allocation ("—"/blank -> blank; "On duty" status -> "On duty")
 * Skipped: Category "Nominee" (on hold until results), Status withdrawn/cancelled/on hold.
 */

/**
 * Where "Final Seating" lives. Since 2026-10-01 it is a tab in THIS workbook (CCOnklusyon Event
 * Checklist, gid 828790481), so SEATING_SPREADSHEET_ID is blank = "the workbook this script is in"
 * (no extra permission needed). Put a spreadsheet ID here only if the tab moves to another file.
 */
const SEATING_SPREADSHEET_ID = '';
const SEATING_SHEET_NAME = 'Final Seating';
const SEATING_SHEET_GID = 828790481; // fallback if the tab gets renamed

/** The 12 attendee types, spelled exactly as the email should show them. */
const ATTENDEE_TYPES = [
  'Alumni', 'Club Participant', 'Event Staff', 'External Partner', 'Former Adviser', 'Guest',
  'Plus One', 'Student Leaders', 'USeP Office', 'USeP Personnel', 'VVIP', 'VIP'
];

/** Columns this import owns in Master_Attendance (everything else it leaves alone). */
const IMPORT_OWNED_FIELDS = [
  'email', 'full_name', 'org_classification', 'club_name', 'designation',
  'ticket_type', 'table_allocation', 'attendee_type', 'reg_no'
];
const IMPORT_NEW_HEADERS = ['attendee_type', 'reg_no'];

function importFinalSeatingPreview() { return importFinalSeating_(true); }
function importFinalSeating() { return importFinalSeating_(false); }

/** "student leader", "+1", "USEP personnel " ... -> the canonical type, or '' if unknown. */
function normalizeAttendeeType_(raw) {
  const k = String(raw || '').toLowerCase().replace(/[^a-z0-9+]/g, '');
  const aliases = {
    alumni: 'Alumni', alumnus: 'Alumni', alumna: 'Alumni',
    clubparticipant: 'Club Participant', clubparticipants: 'Club Participant', participant: 'Club Participant',
    eventstaff: 'Event Staff', staff: 'Event Staff',
    externalpartner: 'External Partner', externalpartners: 'External Partner', external: 'External Partner',
    formeradviser: 'Former Adviser', formeradvisers: 'Former Adviser', formeradvisor: 'Former Adviser', formeradvisors: 'Former Adviser',
    guest: 'Guest', guests: 'Guest',
    plusone: 'Plus One', '+1': 'Plus One', plusones: 'Plus One',
    studentleaders: 'Student Leaders', studentleader: 'Student Leaders',
    usepoffice: 'USeP Office', usepoffices: 'USeP Office',
    useppersonnel: 'USeP Personnel',
    vvip: 'VVIP', vip: 'VIP'
  };
  return aliases[k] || '';
}

function isSkippedRegistration_(category, status) {
  if (/^nominee/i.test(String(category || '').trim())) return 'nominee (on hold)';
  if (/withdraw|cancel|on\s*hold|void/i.test(String(status || ''))) return 'status: ' + String(status).trim();
  return '';
}

/** Reads Final Seating into plain records. Header row = first row (of the top 10) with "Full Name" and "Category". */
function readFinalSeating_(values) {
  let h = -1;
  for (let r = 0; r < Math.min(values.length, 10); r++) {
    const cells = values[r].map(function (c) { return String(c).trim().toLowerCase(); });
    if (cells.indexOf('full name') >= 0 && cells.indexOf('category') >= 0) { h = r; break; }
  }
  if (h < 0) throw new Error('Final Seating: no header row with "Full Name" and "Category" in the first 10 rows.');
  const head = values[h].map(function (c) { return String(c).trim().toLowerCase(); });
  const col = function (name) { return head.indexOf(name); };
  const need = ['no.', 'category', 'full name', 'email', 'table', 'status'];
  const missing = need.filter(function (n) { return col(n) < 0; });
  if (missing.length) throw new Error('Final Seating is missing column(s): ' + missing.join(', '));
  const get = function (row, name) { const i = col(name); return i < 0 ? '' : String(row[i] == null ? '' : row[i]).trim(); };

  const out = [];
  for (let r = h + 1; r < values.length; r++) {
    const row = values[r];
    const regNo = get(row, 'no.');
    const name = get(row, 'full name');
    const category = get(row, 'category');
    if (!regNo && !name && !category) continue; // blank line
    out.push({
      sheetRow: r + 1, reg_no: regNo, category: category, status: get(row, 'status'),
      full_name: name, email: get(row, 'email'), cluster: get(row, 'cluster'),
      club: get(row, 'group / club'), position: get(row, 'position'), table: get(row, 'table')
    });
  }
  return out;
}

/** One Final Seating record -> the Master_Attendance fields this import owns. */
function toAttendanceFields_(rec) {
  const type = normalizeAttendeeType_(rec.category);
  let table = /^[—–\-\s]*$/.test(rec.table) ? '' : rec.table;
  if (!table && /duty/i.test(rec.status)) table = 'On duty';
  return {
    email: rec.email,
    full_name: rec.full_name || '(TBA)',
    org_classification: rec.cluster,
    club_name: rec.club,
    designation: rec.position,
    ticket_type: VIP_TYPES_FOR_TICKET_.indexOf(type) >= 0 ? 'VIP Pass' : 'Regular Attendee',
    table_allocation: table,
    attendee_type: type || rec.category, // unknown categories are kept as written (and reported)
    reg_no: rec.reg_no
  };
}
const VIP_TYPES_FOR_TICKET_ = ['VVIP', 'VIP'];

/**
 * Pure planning step (no Apps Script calls, so it is unit-testable): given Master_Attendance's
 * values and the Final Seating records, returns the new values grid plus a report.
 */
function planRosterImport_(maValues, records) {
  const headers = maValues[0].map(function (h) { return String(h).trim(); });
  const addedHeaders = IMPORT_NEW_HEADERS.filter(function (h) { return headers.indexOf(h) < 0; });
  const allHeaders = headers.concat(addedHeaders);
  const width = allHeaders.length;
  const idx = {};
  allHeaders.forEach(function (h, i) { if (h && idx[h] === undefined) idx[h] = i; });
  const missingCore = IMPORT_OWNED_FIELDS.filter(function (f) { return idx[f] === undefined; });
  if (missingCore.length) throw new Error('Master_Attendance is missing column(s): ' + missingCore.join(', '));

  const grid = maValues.map(function (row) {
    const r = row.slice(0, width);
    while (r.length < width) r.push('');
    return r;
  });
  grid[0] = allHeaders.slice();

  const byReg = {};
  const noRegRows = [];
  for (let r = 1; r < grid.length; r++) {
    const reg = String(grid[r][idx.reg_no] || '').trim();
    const hasName = String(grid[r][idx.full_name] || '').trim() !== '';
    if (reg) byReg[reg] = r;
    else if (hasName) noRegRows.push(r + 1);
  }

  const report = {
    addedHeaders: addedHeaders, added: 0, updated: 0, unchanged: 0, skipped: [], unknownTypes: {},
    changedAfterSend: [], notInList: [], noRegNoRows: noRegRows, duplicateRegNos: [], byType: {}, tba: 0
  };
  const seenReg = {};
  records.forEach(function (rec) {
    const why = isSkippedRegistration_(rec.category, rec.status);
    if (why) { report.skipped.push('No. ' + (rec.reg_no || '?') + ' — ' + why); return; }
    if (!rec.reg_no) { report.skipped.push('sheet row ' + rec.sheetRow + ' — no registration No.'); return; }
    if (seenReg[rec.reg_no]) { report.duplicateRegNos.push(rec.reg_no); return; }
    seenReg[rec.reg_no] = true;

    const f = toAttendanceFields_(rec);
    if (!normalizeAttendeeType_(rec.category)) report.unknownTypes[rec.category || '(blank)'] = (report.unknownTypes[rec.category || '(blank)'] || 0) + 1;
    report.byType[f.attendee_type] = (report.byType[f.attendee_type] || 0) + 1;
    if (f.full_name === '(TBA)' || /^\(?\s*tba\s*\)?$/i.test(f.full_name)) report.tba++;

    const at = byReg[rec.reg_no];
    if (at === undefined) {
      const row = new Array(width).fill('');
      IMPORT_OWNED_FIELDS.forEach(function (k) { row[idx[k]] = f[k]; });
      grid.push(row);
      report.added++;
      return;
    }
    let changed = false;
    IMPORT_OWNED_FIELDS.forEach(function (k) {
      if (String(grid[at][idx[k]]).trim() !== String(f[k])) { grid[at][idx[k]] = f[k]; changed = true; }
    });
    if (changed) {
      report.updated++;
      const sent = idx.pass_sent !== undefined && grid[at][idx.pass_sent] !== '' && grid[at][idx.pass_sent] !== false;
      if (sent) report.changedAfterSend.push('No. ' + rec.reg_no + ' (row ' + (at + 1) + ')');
    } else {
      report.unchanged++;
    }
  });
  Object.keys(byReg).forEach(function (reg) { if (!seenReg[reg]) report.notInList.push('No. ' + reg + ' (row ' + (byReg[reg] + 1) + ')'); });
  return { grid: grid, report: report };
}

function logImportReport_(report, dryRun) {
  const L = function (m) { Logger.log(m); };
  L((dryRun ? 'PREVIEW — nothing written. ' : 'IMPORTED. ') + 'Added ' + report.added + ', updated ' + report.updated + ', unchanged ' + report.unchanged + '.');
  if (report.addedHeaders.length) L('New columns ' + (dryRun ? 'to add' : 'added') + ' at the end of row 1: ' + report.addedHeaders.join(', '));
  L('By attendee type: ' + Object.keys(report.byType).sort().map(function (k) { return k + ' ' + report.byType[k]; }).join(', ') + ' — (TBA) slots: ' + report.tba);
  if (report.skipped.length) L('Skipped ' + report.skipped.length + ': ' + report.skipped.join('; '));
  if (Object.keys(report.unknownTypes).length) L('CHECK: Category not in the 12 attendee types (kept as written): ' + JSON.stringify(report.unknownTypes));
  if (report.duplicateRegNos.length) L('CHECK: duplicate No. in Final Seating (only the first was used): ' + report.duplicateRegNos.join(', '));
  if (report.changedAfterSend.length) L('CHECK: details changed AFTER their pass was sent (re-send if the table changed): ' + report.changedAfterSend.join(', '));
  if (report.notInList.length) L('CHECK: in Master_Attendance but no longer in Final Seating (NOT deleted): ' + report.notInList.join(', '));
  if (report.noRegNoRows.length) L('CHECK: ' + report.noRegNoRows.length + ' Master_Attendance row(s) did not come from Final Seating (old test rows?) — sheet rows ' + report.noRegNoRows.join(', ') + '. DELETE them before the real send, or they will get a pass too.');
}

/** The Final Seating tab: by name, else by gid, in this workbook (or SEATING_SPREADSHEET_ID if set). */
function findSeatingSheet_() {
  let book;
  try {
    book = SEATING_SPREADSHEET_ID ? SpreadsheetApp.openById(SEATING_SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    let who = '';
    try { who = Session.getEffectiveUser().getEmail(); } catch (e) { /* not available */ }
    throw new Error('Could not open the spreadsheet ' + SEATING_SPREADSHEET_ID + (who ? ' as ' + who : '') +
      '. Make sure this Google account can open it, then run again. (' + err.message + ')');
  }
  let sheet = book.getSheetByName(SEATING_SHEET_NAME);
  if (!sheet && typeof book.getSheets === 'function') {
    sheet = book.getSheets().filter(function (sh) { return sh.getSheetId() === SEATING_SHEET_GID; })[0] || null;
  }
  if (!sheet) throw new Error('No "' + SEATING_SHEET_NAME + '" tab (gid ' + SEATING_SHEET_GID + ') in this workbook. Check the tab name, then run again.');
  return sheet;
}

function importFinalSeating_(dryRun) {
  const source = findSeatingSheet_();
  Logger.log('Reading "' + SEATING_SHEET_NAME + '" from the seating workbook…');
  const records = readFinalSeating_(source.getDataRange().getValues());

  const lock = LockService.getScriptLock(); // same lock as check-ins: no scan can land mid-write
  lock.waitLock(30000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const range = sheet.getDataRange();
    const values = range.getValues();
    const formulas = range.getFormulas();
    const plan = planRosterImport_(values, records);
    logImportReport_(plan.report, dryRun);
    if (dryRun) return plan.report;

    // Keep any formulas that were in the existing cells (setValues writes "=..." back as a formula).
    for (let r = 0; r < formulas.length; r++) {
      for (let c = 0; c < formulas[r].length; c++) {
        if (formulas[r][c]) plan.grid[r][c] = formulas[r][c];
      }
    }
    sheet.getRange(1, 1, plan.grid.length, plan.grid[0].length).setValues(plan.grid);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  if (typeof generateCredentials === 'function') {
    generateCredentials(); // Code.gs: codes + QR URLs for rows that have none; existing codes kept
    Logger.log('Attendance codes generated for new rows.');
  }
  return true;
}
