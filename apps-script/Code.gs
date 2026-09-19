/**
 * CCOnklusyon Registration & Check-in System — Backend Gateway (D-3)
 * Epic 1 / Stories 1.1-1.2 — REVISED against the real Master_Attendance tab
 * (workbook 1memjsk0qCcFqAdL5yMXAYU0iFf5OkGk1cwg0e56FbOY, gid=155323925)
 *
 * Confirmed live schema (13 columns, header row present, 10 data rows,
 * credentials not yet generated):
 *   A: email                (blank on all 10 rows currently — needs filling)
 *   B: full_name
 *   C: org_classification   NULLABLE by design — VIPs (dignitaries, guest speakers, advisers)
 *                            represent the institution as a whole, not one student org, so this
 *                            is legitimately blank/N-A for ticket_type "VIP Pass". Not a data gap.
 *   D: club_name
 *   E: designation
 *   F: ticket_type          ("VIP Pass" | "Regular Attendee")
 *   G: attendance_code      (blank — this script generates it)
 *   H: qr_code_url          (blank — this script generates it)
 *   I: table_allocation
 *   J: photo_url            NULLABLE for Regular Attendees by design — VIPs use curated portrait
 *                            URLs for the stage spotlight/alerts; regular attendees fall back to
 *                            typographic name cards or monogram avatars per CONFIG.SHOWCASE_MODE
 *                            (display.html, Epic 5). Frontends must handle this being empty.
 *   K: checkin_status       (blank — treated as "Pending" until written "Checked-In")
 *   L: checkin_timestamp
 *   M: checked_in_by
 *
 * IMPORTANT — SHEET_NAME below is a placeholder. I don't have the actual tab
 * title for gid=155323925 (Drive's file-content tools don't expose per-tab
 * names by gid). Set it to the real tab name before running anything.
 *
 * Deployment (yours — I can't execute Apps Script from here):
 *   1. Open the workbook -> the gid=155323925 tab -> Extensions -> Apps Script.
 *   2. Paste this whole file in as Code.gs. Fix SHEET_NAME (line below).
 *   3. Run `generateCredentials` once manually to fill attendance_code + qr_code_url
 *      for the 10 existing rows (idempotent — skips rows that already have a code).
 *   4. Deploy -> New deployment -> Web app. Execute as "Me", Access "Anyone".
 *   5. Copy the /exec URL back to me to contract-test, or curl it yourself.
 */

// Bump on every change you deploy. `ping` reports it, and the scanner shows a warning if the deployed script is older
// (editing this file in the Apps Script editor changes nothing for the phones until the DEPLOYMENT is moved to a new version).
const BACKEND_VERSION = '2026-09-20.1';

const SHEET_NAME = 'Master_Attendance';
const COL = {
  EMAIL: 1, FULL_NAME: 2, ORG_CLASS: 3, CLUB_NAME: 4, DESIGNATION: 5,
  TICKET_TYPE: 6, ATTENDANCE_CODE: 7, QR_URL: 8, TABLE_ALLOC: 9,
  PHOTO_URL: 10, CHECKIN_STATUS: 11, CHECKIN_TS: 12, CHECKED_IN_BY: 13
};

/**
 * Story 1.1: one-time credential generation for rows missing a code.
 * Idempotent — run it again after adding more rows and it only fills blanks.
 * Collision-checked against codes already present in the column.
 */
function generateCredentials() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const usedCodes = new Set();
  for (let r = 1; r < data.length; r++) {
    const c = data[r][COL.ATTENDANCE_CODE - 1];
    if (c) usedCodes.add(String(c));
  }

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (!row[COL.FULL_NAME - 1]) continue; // skip empty rows
    if (row[COL.ATTENDANCE_CODE - 1]) continue; // already has a code — don't touch

    let code;
    do {
      code = String(Math.floor(10000 + Math.random() * 90000));
    } while (usedCodes.has(code));
    usedCodes.add(code);

    const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + code;

    sheet.getRange(r + 1, COL.ATTENDANCE_CODE).setValue(code);
    sheet.getRange(r + 1, COL.QR_URL).setValue(qrUrl);
    if (!row[COL.CHECKIN_STATUS - 1]) {
      sheet.getRange(r + 1, COL.CHECKIN_STATUS).setValue('Pending');
    }
  }
}

/**
 * Router. Every request is logged in one line (visible under Executions in the Apps Script editor)
 * so a misrouted request — e.g. a POST that arrived as a GET with no params, which is what produces
 * "Unknown action." — can be seen after the fact.
 */
function doPost(e) {
  const params = (e && e.parameter) || {};
  const raw = e && e.postData && e.postData.contents;
  let body = {};
  let parseFailed = false;
  try {
    body = JSON.parse(raw);
  } catch (err) {
    parseFailed = true;
  }
  if (!body || typeof body !== 'object') body = {};

  // Tolerate the action (and a check-in's fields) arriving in the query string instead of the body.
  const action = body.action || params.action;
  console.log('doPost action=' + action + ' bodyLen=' + (raw ? raw.length : 0) + ' params=' + Object.keys(params).join(','));

  if (parseFailed && !action) return jsonOut_({ status: 'ERROR', message: 'Invalid JSON payload.' });

  if (action === 'checkin') return handleCheckin_(mergeCheckinParams_(body, params));
  if (action === 'sync') return handleSync_(body);
  if (action === 'ping') return handlePing_();
  return jsonOut_({ status: 'ERROR', message: 'Unknown action.' });
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = params.action;
  console.log('doGet action=' + action + ' params=' + Object.keys(params).join(','));

  if (action === 'recent') {
    const limit = parseInt(params.limit, 10) || 12;
    return handleRecent_(limit);
  }
  if (action === 'roster') return handleRoster_();
  // GET check-in: the scanner's fallback when a POST is downgraded/redirected and the body is lost.
  // Safe to repeat — the duplicate check under the script lock makes a second call a no-op.
  if (action === 'checkin') return handleCheckin_(mergeCheckinParams_({}, params));
  if (action === 'ping') return handlePing_();
  return jsonOut_({ status: 'ERROR', message: 'Unknown action.' });
}

/** Fill a check-in body's blanks from query-string params. */
function mergeCheckinParams_(body, params) {
  return {
    action: 'checkin',
    attendance_code: body.attendance_code || params.attendance_code,
    device_id: body.device_id || params.device_id
  };
}

/** Cheap no-op: lets the scanner warm the container and test the round trip without touching the sheet. */
function handlePing_() {
  return jsonOut_({ status: 'SUCCESS', message: 'pong', version: BACKEND_VERSION, ts: new Date().toISOString() });
}

/** Endpoint 1: check-in. */
function handleCheckin_(body, opts) {
  const t0 = Date.now();
  const code = String(body.attendance_code || '').trim();
  const deviceId = body.device_id || 'unknown';
  if (!code) return jsonOut_({ status: 'ERROR', message: 'Missing attendance_code.' });

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return jsonOut_({ status: 'ERROR', message: 'System busy, retry shortly.' });
  }

  let result;
  try {
    result = processCheckin_(code, deviceId);
  } finally {
    lock.releaseLock();
  }

  // Telegram runs AFTER the lock is released: the HTTP call takes hundreds of ms, and holding the
  // script lock across it would make every other usher's scan wait behind a VIP alert.
  if (result.status === 'SUCCESS' && result.data.ticket_type === 'VIP Pass') {
    let info;
    try {
      info = notifyVipTelegram_(result.data, { delayed: !!(opts && opts.delayed) });
    } catch (err) {
      console.error('VIP Telegram alert failed: ' + err); // never block or fail a check-in over Telegram
      info = { ok: false, attempts: 0, ms: 0, error: String(err) };
    }
    if (!info.skipped) recordVipAlert_(info, Date.now() - t0); // Story 4.1.4 evidence; see vipAlertReport()
  }

  return jsonOut_(result);
}

/** Sheet lookup + write for one check-in. Caller MUST hold the script lock. Returns a plain object. */
function processCheckin_(code, deviceId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (String(row[COL.ATTENDANCE_CODE - 1]).trim() !== code) continue;

    if (row[COL.CHECKIN_STATUS - 1] === 'Checked-In') {
      return {
        status: 'DUPLICATE',
        message: 'Attendee has already checked in.',
        data: {
          full_name: row[COL.FULL_NAME - 1],
          initial_checkin_timestamp: row[COL.CHECKIN_TS - 1],
          table_allocation: row[COL.TABLE_ALLOC - 1],
          checked_in_by: row[COL.CHECKED_IN_BY - 1]
        }
      };
    }

    const nowIso = Utilities.formatDate(new Date(), 'GMT+8', "yyyy-MM-dd'T'HH:mm:ssXXX");
    sheet.getRange(r + 1, COL.CHECKIN_STATUS).setValue('Checked-In');
    sheet.getRange(r + 1, COL.CHECKIN_TS).setValue(nowIso);
    sheet.getRange(r + 1, COL.CHECKED_IN_BY).setValue(deviceId);

    return {
      status: 'SUCCESS',
      message: 'Attendee validated successfully.',
      data: {
        attendance_code: code,
        full_name: row[COL.FULL_NAME - 1],
        club_name: row[COL.CLUB_NAME - 1],
        designation: row[COL.DESIGNATION - 1],
        ticket_type: row[COL.TICKET_TYPE - 1],
        table_allocation: row[COL.TABLE_ALLOC - 1],
        photo_url: row[COL.PHOTO_URL - 1],
        checkin_timestamp: nowIso
      }
    };
  }

  return { status: 'NOT_FOUND', message: 'Attendance code does not exist in master records.' };
}

/** Endpoint 2: recent arrivals feed for the projector wall (D-5). */
function handleRecent_(limit) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const attendees = [];

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (row[COL.CHECKIN_STATUS - 1] === 'Checked-In') {
      attendees.push({
        full_name: row[COL.FULL_NAME - 1],
        club_name: row[COL.CLUB_NAME - 1],
        designation: row[COL.DESIGNATION - 1],
        ticket_type: row[COL.TICKET_TYPE - 1],
        table_allocation: row[COL.TABLE_ALLOC - 1],
        photo_url: row[COL.PHOTO_URL - 1],
        checkin_timestamp: row[COL.CHECKIN_TS - 1]
      });
    }
  }

  attendees.sort((a, b) => new Date(b.checkin_timestamp) - new Date(a.checkin_timestamp));
  return jsonOut_({ status: 'SUCCESS', count: Math.min(limit, attendees.length), attendees: attendees.slice(0, limit) });
}

/**
 * Endpoint: full roster, for the scanner PWA to cache client-side (Epic 3, offline VIP
 * identification mitigation — added post-Epic-3 build, see CHANGES.md). Deliberately excludes
 * `email` (no reason a door device needs it). Read-only — does not write to the sheet.
 */
function handleRoster_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const attendees = [];

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (!row[COL.FULL_NAME - 1] || !row[COL.ATTENDANCE_CODE - 1]) continue; // skip empty/uncredentialed rows
    attendees.push({
      attendance_code: String(row[COL.ATTENDANCE_CODE - 1]),
      full_name: row[COL.FULL_NAME - 1],
      club_name: row[COL.CLUB_NAME - 1],
      designation: row[COL.DESIGNATION - 1],
      ticket_type: row[COL.TICKET_TYPE - 1],
      table_allocation: row[COL.TABLE_ALLOC - 1],
      checkin_status: row[COL.CHECKIN_STATUS - 1] || 'Pending'
    });
  }

  return jsonOut_({ status: 'SUCCESS', count: attendees.length, attendees: attendees });
}

/** Endpoint 3: bulk offline-queue flush from the scanner PWA. */
function handleSync_(body) {
  const items = body.items || [];
  const results = [];
  items.forEach(function (item) {
    const r = handleCheckin_(item, { delayed: true }); // a queued offline scan: any VIP alert it raises is late
    results.push(JSON.parse(r.getContent()));
  });
  return jsonOut_({ status: 'SUCCESS', results: results });
}

/**
 * Epic 4 — VIP Telegram alert. Credentials live ONLY in Script Properties (Project Settings ->
 * Script properties): TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID. Never put them in this file.
 * Returns { ok, attempts, ms, delaySec?, skipped? }: `skipped` when not provisioned; otherwise `ok` says whether Telegram
 * accepted the message. One retry on a transient failure (5xx, network error, 429 honouring retry_after up to 2 s);
 * permanent errors (bad token/chat) are not retried. Never throws.
 */
function notifyVipTelegram_(attendeeData, opts) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_BOT_TOKEN');
  const chatId = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return { ok: false, skipped: true, attempts: 0, ms: 0 }; // not provisioned — silently skip

  const payload = JSON.stringify({ chat_id: chatId, text: buildVipAlertText_(attendeeData, opts) });
  const started = Date.now();
  let attempts = 0, code = 0, body = '';
  while (attempts < 2) {
    attempts++;
    let wait = 400;
    try {
      const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'post',
        contentType: 'application/json',
        payload: payload,
        muteHttpExceptions: true // read the status ourselves so a refusal is logged instead of thrown
      });
      code = res.getResponseCode();
      body = res.getContentText();
      if (code === 200) return { ok: true, attempts: attempts, ms: Date.now() - started, delaySec: telegramDelaySec_(body, attendeeData) };
      if (code >= 400 && code < 500 && code !== 429) break; // permanent (bad token / chat): retrying can't help
      if (code === 429) { try { wait = Math.min(2000, (JSON.parse(body).parameters.retry_after || 1) * 1000); } catch (e) { wait = 1000; } }
    } catch (err) {
      body = String(err);
    }
    if (attempts < 2) Utilities.sleep(wait);
  }
  console.error('Telegram sendMessage failed after ' + attempts + ' attempt(s): HTTP ' + code + ' ' + body);
  return { ok: false, attempts: attempts, ms: Date.now() - started, code: code };
}

/** Seconds between the check-in and Telegram's own timestamp for the message (Telegram `date`), or null. */
function telegramDelaySec_(body, attendeeData) {
  try {
    const sent = JSON.parse(body).result.date; // unix seconds, set by Telegram
    const scanned = Date.parse(attendeeData.checkin_timestamp) / 1000;
    return isNaN(scanned) ? null : Math.max(0, Math.round(sent - scanned));
  } catch (e) { return null; }
}

/** "Not yet assigned" for a blank or 0 seat (the sheet currently holds 0 for unassigned rows). */
function seatText_(v) {
  const t = String(v == null ? '' : v).trim();
  return (!t || /^0+$/.test(t)) ? 'Not yet assigned' : t;
}

/** The alert text — MVP spec Component C template. Pure, so it can be unit-tested. `opts.delayed` marks a queued scan. */
function buildVipAlertText_(a, opts) {
  const blank = function (v) { return v ? String(v) : '—'; };
  const club = a.club_name ? ' (' + a.club_name + ')' : '';
  const time = Utilities.formatDate(new Date(), 'GMT+8', 'h:mm:ss a');
  return '⭐ VIP ARRIVAL DETECTED ⭐\n' +
    'Name: ' + blank(a.full_name) + '\n' +
    'Role: ' + blank(a.designation) + club + '\n' +
    'Assigned Seat: ' + seatText_(a.table_allocation) + '\n' +
    'Time: ' + time + '\n' +
    (opts && opts.delayed ? '⏱ Scanned while offline — the guest may have arrived a few minutes ago.\n' : '') +
    '\n👉 Designated Escort: Usher Lead please acknowledge and proceed to Entrance.';
}

// ---- Alert timing log (Story 4.1.4 / QA Gate 3: "VIP alert lands within 3 s of the scan") ------------------------------
const VIP_ALERT_LOG_KEY = 'VIP_ALERT_LOG';
const VIP_ALERT_LOG_MAX = 20;
function readVipAlertLog_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(VIP_ALERT_LOG_KEY) || '[]'); } catch (e) { return []; }
}
/** Keeps the last 20 alerts (no names): server time from request start, Telegram round trip, attempts, Telegram-side delay. */
function recordVipAlert_(info, totalMs) {
  try {
    const log = readVipAlertLog_();
    log.push({ t: new Date().toISOString(), ok: !!info.ok, ms: totalMs, tgMs: info.ms, attempts: info.attempts, delaySec: info.delaySec == null ? null : info.delaySec, code: info.code || null });
    PropertiesService.getScriptProperties().setProperty(VIP_ALERT_LOG_KEY, JSON.stringify(log.slice(-VIP_ALERT_LOG_MAX)));
  } catch (e) { console.error('Could not record VIP alert timing: ' + e); }
}
/**
 * Story 4.1.4 — run from the editor after checking in a few VIP test rows. Summarises the last 20 alerts. "Within 3 s" counts
 * SERVER time (request received -> Telegram accepted) plus Telegram's own timestamp delay; add the phone's network time
 * (see the scanner's Connection log) for the true door-to-phone figure.
 */
function vipAlertReport() {
  const log = readVipAlertLog_();
  const ok = log.filter(function (e) { return e.ok; });
  const ms = ok.map(function (e) { return e.ms; }).sort(function (x, y) { return x - y; });
  const delays = ok.map(function (e) { return e.delaySec; }).filter(function (d) { return d != null; });
  const report = {
    count: log.length, delivered: ok.length, failed: log.length - ok.length,
    within3s: ok.filter(function (e) { return e.ms <= 3000 && (e.delaySec == null || e.delaySec <= 3); }).length,
    medianMs: ms.length ? ms[Math.floor(ms.length / 2)] : null,
    maxMs: ms.length ? ms[ms.length - 1] : null,
    maxDelaySec: delays.length ? Math.max.apply(null, delays) : null
  };
  console.log('VIP ALERT REPORT — ' + report.count + ' alert(s): ' + report.delivered + ' delivered, ' + report.failed + ' failed; ' +
    report.within3s + ' within 3 s; server median ' + report.medianMs + ' ms, max ' + report.maxMs + ' ms; max Telegram delay ' + report.maxDelaySec + ' s');
  return report;
}

/**
 * Story 4.1.1 check — run from the editor after pasting the two Script Properties. Sends a plain
 * ping to the usher group (no attendee data) and logs whether Telegram accepted it. No underscore
 * in the name so it shows in the Run dropdown.
 */
function testTelegramPing() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_BOT_TOKEN');
  const chatId = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chatId) {
    console.log('Missing TELEGRAM_BOT_TOKEN and/or TELEGRAM_CHAT_ID. Add them under Project Settings -> Script properties.');
    return;
  }
  const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: '✅ CCOnklusyon check-in bot connected. (test ping)' }),
    muteHttpExceptions: true
  });
  console.log('Telegram responded HTTP ' + res.getResponseCode() + ': ' + res.getContentText());
}

/**
 * Story 4.1.3 / 4.1.4 helper — sends the real VIP alert template with obviously fake data and logs
 * how long the Telegram round-trip took (spec target: alert within 3s of the scan). Does NOT touch
 * the sheet. Run it, check the message in the group, then do the real end-to-end test by checking
 * in a VIP test row from the scanner.
 */
function testVipAlertTemplate() {
  const t0 = Date.now();
  const r = notifyVipTelegram_({
    full_name: 'TEST — Dr. Sample VIP',
    designation: 'Organization Adviser',
    club_name: 'Test Club',
    table_allocation: 'VIP Table 01'
  });
  console.log((r.ok ? 'Sent' : (r.skipped ? 'NOT sent — Script Properties not set' : 'NOT sent (see logs)')) + ' in ' + (Date.now() - t0) + ' ms (' + r.attempts + ' attempt(s))');
}

/* ------------------------------------------------------------------------------------------------
 * Pre-flight tooling for Epic 6 (beta staging) and Epic 7 (production lockdown).
 * Both are run by hand from the Apps Script editor (no trailing underscore => visible in the Run menu).
 * ---------------------------------------------------------------------------------------------- */

const TICKET_TYPES = ['VIP Pass', 'Regular Attendee'];
const CODE_RE = /^[1-9]\d{4}$/; // 5 digits, 10000-99999 (spec)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const QR_URL_PREFIX = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=';
const MAX_TEST_RESET = 30;

/**
 * Stories 6.1.1 / 7.1.1 — READ-ONLY data audit of Master_Attendance. Checks that every PIN is a unique,
 * hard-coded 5-digit number, that no live formulas remain, and that each row is complete enough to email and
 * seat. Results go to the execution log (row numbers and field names only — no names or emails are printed).
 * "READY" means zero errors; warnings are worth reading but don't block.
 */
function auditRoster() {
  const range = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME).getDataRange();
  const report = auditRosterRows_(range.getValues(), range.getFormulas());
  formatAudit_(report).forEach(function (line) { console.log(line); });
  return report;
}

/** Pure function over the sheet's values/formulas (2D arrays, header in row 1) so it can be unit-tested. */
function auditRosterRows_(values, formulas) {
  const errors = [], warnings = [];
  const add = function (list, row, field, message) { list.push({ row: row, field: field, message: message }); };
  const summary = { rows: 0, vip: 0, regular: 0, checkedIn: 0, pending: 0, formulas: 0 };
  const seenCodes = {}, seenEmails = {}, seenNames = {};
  const cell = function (row, col) { return String(row[col - 1] == null ? '' : row[col - 1]).trim(); };

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const rowNum = r + 1;

    // Live formulas anywhere in the data area (=RANDARRAY(...) etc. would re-roll PINs on every open).
    for (let c = 0; c < row.length; c++) {
      const f = formulas && formulas[r] && formulas[r][c];
      if (f && String(f).charAt(0) === '=') { summary.formulas++; add(errors, rowNum, 'column ' + (c + 1), 'live formula — replace with a fixed value'); }
    }

    const used = [COL.EMAIL, COL.FULL_NAME, COL.ATTENDANCE_CODE].some(function (c) { return cell(row, c) !== ''; });
    if (!used) continue; // blank row
    summary.rows++;

    const name = cell(row, COL.FULL_NAME);
    if (!name) add(errors, rowNum, 'full_name', 'blank');
    else if (seenNames[name.toLowerCase()]) add(warnings, rowNum, 'full_name', 'same name as row ' + seenNames[name.toLowerCase()]);
    else seenNames[name.toLowerCase()] = rowNum;

    const code = cell(row, COL.ATTENDANCE_CODE);
    if (!code) add(errors, rowNum, 'attendance_code', 'blank — run generateCredentials()');
    else if (!CODE_RE.test(code)) add(errors, rowNum, 'attendance_code', 'not a 5-digit code (10000-99999)');
    else if (seenCodes[code]) add(errors, rowNum, 'attendance_code', 'duplicate of row ' + seenCodes[code]);
    else seenCodes[code] = rowNum;

    const ticket = cell(row, COL.TICKET_TYPE);
    if (TICKET_TYPES.indexOf(ticket) < 0) add(errors, rowNum, 'ticket_type', 'must be "VIP Pass" or "Regular Attendee"');
    else if (ticket === 'VIP Pass') summary.vip++;
    else summary.regular++;

    const email = cell(row, COL.EMAIL);
    if (!email) add(errors, rowNum, 'email', 'blank');
    else if (!EMAIL_RE.test(email)) add(errors, rowNum, 'email', 'not a valid address');
    else if (seenEmails[email.toLowerCase()]) add(warnings, rowNum, 'email', 'same address as row ' + seenEmails[email.toLowerCase()]);
    else seenEmails[email.toLowerCase()] = rowNum;

    const qr = cell(row, COL.QR_URL);
    if (!qr) add(errors, rowNum, 'qr_code_url', 'blank — run generateCredentials()');
    else if (code && qr.indexOf('data=' + code) < 0) add(errors, rowNum, 'qr_code_url', 'does not encode this row\'s attendance_code');

    const status = cell(row, COL.CHECKIN_STATUS);
    if (['', 'Pending', 'Checked-In'].indexOf(status) < 0) add(errors, rowNum, 'checkin_status', 'must be blank, "Pending" or "Checked-In"');
    if (status === 'Checked-In') summary.checkedIn++; else summary.pending++;
    if (status !== 'Checked-In' && (cell(row, COL.CHECKIN_TS) || cell(row, COL.CHECKED_IN_BY))) {
      add(warnings, rowNum, 'checkin_timestamp/checked_in_by', 'filled although status is not Checked-In');
    }

    const table = cell(row, COL.TABLE_ALLOC);
    if (!table || /^(table\s*)?0+$/i.test(table)) add(warnings, rowNum, 'table_allocation', 'blank or 0 — no seat assigned yet (VIP alerts will say "Not yet assigned")');
    if (!cell(row, COL.DESIGNATION)) add(warnings, rowNum, 'designation', 'blank');
    if (!cell(row, COL.CLUB_NAME)) add(warnings, rowNum, 'club_name', 'blank');
    const photo = cell(row, COL.PHOTO_URL);
    if (ticket === 'VIP Pass' && !photo) add(warnings, rowNum, 'photo_url', 'VIP has no photo (wall will show a monogram)');
    if (photo && !/^https?:\/\//i.test(photo)) add(warnings, rowNum, 'photo_url', 'not an http(s) URL');
    if (ticket === 'Regular Attendee' && !cell(row, COL.ORG_CLASS)) add(warnings, rowNum, 'org_classification', 'blank for a Regular Attendee');
  }

  if (summary.checkedIn > 0) {
    add(warnings, 0, 'checkin_status', summary.checkedIn + ' row(s) are already Checked-In — reset before go-live (see resetTestCheckins)');
  }
  return { ready: errors.length === 0, summary: summary, errors: errors, warnings: warnings };
}

function formatAudit_(report) {
  const lines = [];
  const s = report.summary;
  lines.push('ROSTER AUDIT — ' + s.rows + ' rows (' + s.vip + ' VIP, ' + s.regular + ' Regular); ' +
    s.checkedIn + ' checked in, ' + s.pending + ' pending; ' + s.formulas + ' live formula cell(s)');
  const dump = function (title, list) {
    lines.push(title + ' (' + list.length + ')');
    list.slice(0, 50).forEach(function (x) { lines.push('  ' + (x.row ? 'row ' + x.row + ' · ' : '') + x.field + ': ' + x.message); });
    if (list.length > 50) lines.push('  … ' + (list.length - 50) + ' more');
  };
  if (report.errors.length) dump('ERRORS — fix before go-live', report.errors);
  if (report.warnings.length) dump('Warnings', report.warnings);
  lines.push(report.ready ? 'RESULT: READY (no errors)' : 'RESULT: NOT READY — ' + report.errors.length + ' error(s)');
  return lines;
}

/**
 * Story 6.3 helper — puts specific rows back to Pending so a beta test can be repeated. Deliberately narrow:
 * it only touches the codes listed in the Script property TEST_RESET_CODES (comma-separated, max 30), refuses
 * anything that isn't a valid code, and does nothing if the property is unset. Never run it against real
 * attendees during the event.
 */
function resetTestCheckins() {
  const raw = PropertiesService.getScriptProperties().getProperty('TEST_RESET_CODES');
  const codes = String(raw || '').split(',').map(function (c) { return c.trim(); }).filter(Boolean);
  if (!codes.length) { console.log('Set the Script property TEST_RESET_CODES (e.g. 48201,48202) first. Nothing changed.'); return { reset: 0 }; }
  const bad = codes.filter(function (c) { return !CODE_RE.test(c); });
  if (bad.length) { console.log('Refusing: not valid 5-digit codes: ' + bad.join(', ') + '. Nothing changed.'); return { reset: 0 }; }
  if (codes.length > MAX_TEST_RESET) { console.log('Refusing: ' + codes.length + ' codes listed, max is ' + MAX_TEST_RESET + '. Nothing changed.'); return { reset: 0 }; }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const wanted = {};
    codes.forEach(function (c) { wanted[c] = true; });
    let reset = 0;
    for (let r = 1; r < data.length; r++) {
      const code = String(data[r][COL.ATTENDANCE_CODE - 1]).trim();
      if (!wanted[code]) continue;
      sheet.getRange(r + 1, COL.CHECKIN_STATUS).setValue('Pending');
      sheet.getRange(r + 1, COL.CHECKIN_TS).setValue('');
      sheet.getRange(r + 1, COL.CHECKED_IN_BY).setValue('');
      delete wanted[code];
      reset++;
    }
    const missing = Object.keys(wanted);
    console.log('Reset ' + reset + ' row(s) to Pending.' + (missing.length ? ' Not found: ' + missing.join(', ') : ''));
    return { reset: reset, notFound: missing };
  } finally {
    lock.releaseLock();
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
