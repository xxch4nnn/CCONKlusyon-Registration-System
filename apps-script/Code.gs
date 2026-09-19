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
  return jsonOut_({ status: 'SUCCESS', message: 'pong', ts: new Date().toISOString() });
}

/** Endpoint 1: check-in. */
function handleCheckin_(body) {
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
    try {
      notifyVipTelegram_(result.data);
    } catch (err) {
      console.error('VIP Telegram alert failed: ' + err); // never block or fail a check-in over Telegram
    }
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
    const r = handleCheckin_(item);
    results.push(JSON.parse(r.getContent()));
  });
  return jsonOut_({ status: 'SUCCESS', results: results });
}

/**
 * Epic 4 — VIP Telegram alert. Credentials live ONLY in Script Properties (Project Settings ->
 * Script properties): TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID. Never put them in this file.
 * Returns true if Telegram accepted the message; false if not provisioned or Telegram refused it.
 */
function notifyVipTelegram_(attendeeData) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_BOT_TOKEN');
  const chatId = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return false; // not provisioned — silently skip, do not throw

  const blank = function (v) { return v ? String(v) : '—'; };
  const club = attendeeData.club_name ? ' (' + attendeeData.club_name + ')' : '';
  const time = Utilities.formatDate(new Date(), 'GMT+8', 'h:mm:ss a');

  // Template per MVP spec, Component C.
  const text = '⭐ VIP ARRIVAL DETECTED ⭐\n' +
    'Name: ' + blank(attendeeData.full_name) + '\n' +
    'Role: ' + blank(attendeeData.designation) + club + '\n' +
    'Assigned Seat: ' + blank(attendeeData.table_allocation) + '\n' +
    'Time: ' + time + '\n\n' +
    '👉 Designated Escort: Usher Lead please acknowledge and proceed to Entrance.';

  const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: text }),
    muteHttpExceptions: true // read the status ourselves so a refusal is logged instead of thrown
  });
  if (res.getResponseCode() !== 200) {
    console.error('Telegram sendMessage failed: HTTP ' + res.getResponseCode() + ' ' + res.getContentText());
    return false;
  }
  return true;
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
  const sent = notifyVipTelegram_({
    full_name: 'TEST — Dr. Sample VIP',
    designation: 'Organization Adviser',
    club_name: 'Test Club',
    table_allocation: 'VIP Table 01'
  });
  console.log((sent ? 'Sent' : 'NOT sent (check Script Properties / logs)') + ' in ' + (Date.now() - t0) + ' ms');
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
