/**
 * CCOnklusyon Registration & Check-in System — Email Blaster (D-1)
 * Epic 2 / Story 2.1-2.3
 *
 * Two layers:
 *   1. A GENERIC blast engine (sendMailBlast_, renderTemplate_, genericFieldMap_) that merges
 *      any HTML/plain-text template against Master_Attendance rows by column header name.
 *      Use this for anything that isn't the entry pass — reminders, schedule changes, thank-you
 *      notes, whatever the event needs later. No code change required for a new blast: pass a
 *      new template string into sendCustomBlast().
 *   2. The INVITATION pass, built on top of layer 1 — same throttling/quota/skip logic, styled
 *      against the CCOnklusyon 2026 identity (royal blue/gold, Cinzel + Cormorant Garamond —
 *      see BRAND below), plus dispatch tracking so a re-run never double-sends an attendee.
 *
 * Run manually from the Apps Script editor. IMPORTANT: after pasting/editing this file, save it
 * (Ctrl+S / Cmd+S) — the function dropdown next to Run only lists functions from the LAST SAVED
 * version, so a new function won't appear there until you save. First run of any function that
 * touches Gmail/Sheets will also prompt a Google "Authorization required" screen — that's normal
 * for a script only you own; Review permissions -> Advanced -> Go to (project name) -> Allow.
 * Since the images became embedded (2026-09-30) the pass also needs "Connect to an external
 * service" (UrlFetchApp fetches the banner once per run and each attendee's QR) — one more
 * Allow on the first run after pasting.
 *
 * Dispatch tracking (added 2026-09-28): Master_Attendance needs two new header cells added
 * MANUALLY, right after column M (`checked_in_by`) — this script never writes schema, only data:
 *   N  pass_sent            blank or TRUE
 *   O  pass_sent_timestamp  blank or the send time, GMT+8 (e.g. 2026-09-30T19:05:12+08:00)
 * See docs/db-schema.md and CHANGES.md (2026-09-28) for why. The real send (`sendEventPassesLIVE`)
 * emails only rows where pass_sent OR pass_sent_timestamp is empty (rule: isAlreadyDispatched_) and
 * stamps both right after each successful send. Clear someone's pass_sent to re-send them.
 * `previewEventPassesLIVE` lists who the next live run would email, without sending.
 * (flushed to the sheet immediately). A real send refuses to start if either header is missing.
 * Test sends (sendEventPassesBetaTest / sendEventPassesBetaTestVariety) never read or write these
 * columns. A test address only ever receives its OWN pass, or a clearly marked SAMPLE pass with the
 * unusable code 00000 — never another attendee's pass (fixed 2026-10-01; see pairTestAddresses_).
 */

const SENDER_NAME = 'CCO CCOnklusyon 2026';

/**
 * CCOnklusyon 2026 design-system tokens used in the email (subset of project/tokens.json from the
 * "CCOnklusyon 2026" Design System — kept inline since Apps Script can't import a remote token
 * file, and an email needs hex values baked into inline styles anyway). Sync by hand if the
 * design system's tokens change.
 */
const BRAND = {
  royalBlue: '#060d53',      // color.royal-blue — the ground
  navyDeep: '#040e3f',       // color.navy-deep — cards/panels on the ground
  gold: '#fcdf93',           // color.gold — names, headings
  goldMid: '#f1b763',        // color.gold-mid — gold fills (accent-strong)
  goldDeep: '#c98d45',       // color.gold-deep — rules, card edges
  ink: '#f5ffff',            // color.ink — body copy on the dark ground
  onAccent: '#040e3f',       // color.on-accent — text on a gold fill
  fontDisplay: "'Cinzel', 'Trajan Pro', Georgia, serif",     // type.families.display
  fontText: "'Cormorant Garamond', Garamond, Georgia, serif", // type.families.text
  // Running text (greeting, reminders, links): a system sans stack. Thin serifs at 15-17px on navy
  // read blurry on phones, and most mail clients never load the web fonts anyway. Serif faces are
  // kept for the ceremonial parts: the tier tag, attendance code, section labels and sign-off.
  fontBody: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
};

// =====================================================================================
// LAYER 1 — generic blast engine. Reusable for any future email, not just the invite.
// =====================================================================================

/**
 * Replaces every {{Key}} in `template` with `fieldMap[Key]`, for every key present in
 * fieldMap. Unmatched placeholders (a key not present in fieldMap) are left as-is rather
 * than silently blanked, so a bad template/mapping fails loudly and doesn't ship broken.
 */
function renderTemplate_(template, fieldMap) {
  let out = template;
  Object.keys(fieldMap).forEach(function (key) {
    const value = fieldMap[key] === undefined || fieldMap[key] === null ? '' : String(fieldMap[key]);
    out = out.split('{{' + key + '}}').join(value);
  });
  return out;
}

/** Opens Master_Attendance once and returns {sheet, headers} — shared by reads and writes. */
function openBlastSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  // Trimmed, so a stray space in a header cell ("pass_sent ") can't silently break tracking.
  const headers = sheet.getDataRange().getValues()[0].map(function (h) { return String(h).trim(); });
  return { sheet: sheet, headers: headers };
}

/** Reads Master_Attendance into an array of plain objects keyed by header name. */
function rowsAsObjects_() {
  const ctx = openBlastSheet_();
  const data = ctx.sheet.getDataRange().getValues();
  const headers = ctx.headers;
  const rows = [];
  for (let r = 1; r < data.length; r++) {
    if (!data[r][COL.FULL_NAME - 1]) continue; // skip empty rows
    const obj = {};
    headers.forEach(function (h, i) { obj[h] = data[r][i]; });
    obj._rowIndex = r + 1; // 1-based sheet row
    rows.push(obj);
  }
  return rows;
}

/**
 * Writes TRUE + a GMT+8 timestamp into the row's dispatch-tracking columns, found by HEADER NAME
 * (not a hardcoded column letter), so this keeps working even if the sheet's columns get
 * reordered. sendMailBlast_ checks both headers exist BEFORE sending anything in production.
 * Flushed immediately: Apps Script otherwise holds sheet writes until the run ends, and a run
 * cut off by the ~6-minute limit would lose the record of emails that did go out.
 */
function markDispatched_(headers, sheet, rowIndex, fieldName, tsFieldName) {
  const fCol = headers.indexOf(fieldName);
  const tCol = headers.indexOf(tsFieldName);
  sheet.getRange(rowIndex, fCol + 1).setValue(true);
  if (tCol !== -1) {
    const stamp = Utilities.formatDate(new Date(), 'GMT+8', "yyyy-MM-dd'T'HH:mm:ssXXX");
    sheet.getRange(rowIndex, tCol + 1).setValue(stamp);
  }
  SpreadsheetApp.flush();
}

/**
 * Generic field map for a custom (non-invitation) blast: every real sheet column, verbatim
 * by header name, so a custom template just references {{email}}, {{full_name}}, {{ticket_type}},
 * {{club_name}}, {{designation}}, {{table_allocation}}, etc. — whatever's in Master_Attendance.
 */
function genericFieldMap_(row) {
  const map = {};
  Object.keys(row).forEach(function (k) {
    if (k === '_rowIndex') return;
    map[k] = row[k];
  });
  return map;
}

function escapeHtml_(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The actual send loop — shared by every blast (invitation or custom).
 * opts:
 *   subject          string, or function(row) -> string
 *   buildHtml        function(row) -> html string
 *   buildText        function(row) -> plain-text string (compulsory anti-spam fallback)
 *   requiredFields   array of row keys that must be truthy, else the row is skipped
 *   testMode         true -> only the testEmailOverrides addresses receive anything, "[TEST]" subject,
 *                    and pass_sent is never read or written. Each test address gets EXACTLY what the
 *                    real send would give it: the email of every row whose `email` is that address —
 *                    never another attendee's. An address that isn't in the list gets a "[TEST SAMPLE]"
 *                    built by sampleRowFor (fictional name, code 00000), or nothing if there is none.
 *                    (Until 2026-10-01 test mode paired rows and addresses BY POSITION, so a tester
 *                    could receive someone else's pass and working QR code.)
 *   testEmailOverrides  array of addresses, used only when testMode is true
 *   sampleRowFor     (test mode, optional) function(address) -> a fictional row marked _sample: true
 *   testTargets      (test mode, optional) explicit [{row, to}] list — used by the variety test
 *   throttleMs       ms to sleep between sends (default 2000 = 1 send / 2s)
 *   maxRunMs         stop sending after this long (default 5 min, under Apps Script's ~6 min cap)
 *   dispatchField    (optional) header name used for duplicate-send protection, e.g. 'pass_sent'.
 *                    Ignored in test mode. In production: a row whose dispatchField is already
 *                    truthy is skipped (unless forceResend); a successful send writes TRUE
 *                    (+ dispatchTsField) back to the sheet.
 *   dispatchTsField  (optional) header name for the matching timestamp column.
 *   forceResend      (optional) true = ignore dispatchField and send/re-stamp everyone anyway.
 *   buildInlineImages (optional) function(row) -> { key: Blob } embedded in the message and
 *                    referenced in the HTML as <img src="cid:key">. If it throws, the row is skipped.
 */
function sendMailBlast_(rows, opts) {
  const throttleMs = opts.throttleMs || 2000;
  const requiredFields = opts.requiredFields || [];
  const quotaRemaining = MailApp.getRemainingDailyQuota();
  Logger.log('Remaining MailApp daily quota: ' + quotaRemaining);

  const trackDispatch = !opts.testMode && !!opts.dispatchField;
  const sheetCtx = trackDispatch ? openBlastSheet_() : null; // one open, reused for every write
  if (trackDispatch) {
    // Fail BEFORE the first email, not after: a real send that can't record itself would leave
    // no trace of who got a pass, and a re-run would email everyone again.
    const missingCols = [opts.dispatchField, opts.dispatchTsField].filter(function (h) {
      return h && sheetCtx.headers.indexOf(h) === -1;
    });
    if (missingCols.length) {
      throw new Error('Nothing was sent: Master_Attendance has no "' + missingCols.join('" / "') +
        '" header. Add it in row 1 (see the top of EmailBlaster.gs), then run again.');
    }
  }
  // Stop cleanly before Apps Script's ~6-minute execution limit; a re-run skips rows already
  // marked sent, so it simply continues where this run stopped.
  const maxRunMs = opts.maxRunMs || 5 * 60 * 1000;
  const startedAt = Date.now();
  let stopped = false;

  // WHO GETS WHAT. Real send: every row goes to that row's own email. Test send: see testMode above.
  const targets = !opts.testMode ? rows.map(function (r) { return { row: r, to: r.email }; })
    : (opts.testTargets || pairTestAddresses_(rows, opts.testEmailOverrides || [], opts.sampleRowFor));

  let sent = 0, skipped = 0, alreadyDispatched = 0, failed = 0;

  targets.forEach(function (target) {
    const row = target.row;
    const targetEmail = target.to;

    if (!targetEmail) {
      Logger.log('SKIP (no email): ' + row.full_name);
      skipped++;
      return;
    }
    const missing = requiredFields.filter(function (f) { return !row[f]; });
    if (missing.length) {
      Logger.log('SKIP (missing ' + missing.join(', ') + '): ' + row.full_name);
      skipped++;
      return;
    }
    if (trackDispatch && !opts.forceResend && isAlreadyDispatched_(row, opts.dispatchField, opts.dispatchTsField)) {
      Logger.log('SKIP (already sent ' + row[opts.dispatchTsField] + '): ' + row.full_name);
      alreadyDispatched++;
      return;
    }
    if (stopped) return;
    if (sent >= quotaRemaining) {
      Logger.log('STOP: daily quota reached at ' + sent + ' sends. Run again after the quota resets.');
      stopped = true;
      return;
    }
    if (Date.now() - startedAt > maxRunMs) {
      Logger.log('STOP: time limit near after ' + sent + ' sends. Run again to continue — rows already marked sent are skipped.');
      stopped = true;
      return;
    }

    // Embedded images are fetched BEFORE sending: if one can't be fetched, the row is skipped
    // (not stamped as sent), so a re-run picks it up — nobody gets a pass without a QR code.
    let inlineImages = null;
    if (opts.buildInlineImages) {
      try {
        inlineImages = opts.buildInlineImages(row);
      } catch (err) {
        Logger.log('SKIP (image fetch failed: ' + err.message + '): ' + row.full_name);
        skipped++;
        return;
      }
    }

    const subject = typeof opts.subject === 'function' ? opts.subject(row) : opts.subject;
    const finalSubject = opts.testMode ? (row._sample ? '[TEST SAMPLE] ' : '[TEST] ') + subject : subject;

    const message = {
      to: targetEmail,
      subject: finalSubject,
      body: opts.buildText(row),
      htmlBody: opts.buildHtml(row),
      name: SENDER_NAME
    };
    if (inlineImages) message.inlineImages = inlineImages;
    try {
      MailApp.sendEmail(message);
    } catch (err) {
      // Quota/limit errors: every later send would fail too, so stop. Anything else (a malformed
      // address, "N/A", a stray character) is that row's problem: log it, leave it unmarked so a
      // later run retries it once the address is fixed, and carry on with everyone else.
      if (/too many times|quota|limit exceeded/i.test(err.message)) {
        Logger.log('STOP: Gmail refused to send more today (' + err.message + ') after ' + sent + ' sends. Run again tomorrow.');
        stopped = true;
        return;
      }
      Logger.log('FAILED (' + err.message + '): ' + row.full_name + ' <' + targetEmail + '> — not marked sent; fix the address in Master_Attendance, then run again.');
      failed++;
      return;
    }

    if (trackDispatch) {
      try {
        markDispatched_(sheetCtx.headers, sheetCtx.sheet, row._rowIndex, opts.dispatchField, opts.dispatchTsField);
      } catch (err) {
        // The email went out but could not be recorded. Stop rather than keep sending unrecorded
        // passes (a re-run would email all of them again).
        Logger.log('STOP: sent to ' + row.full_name + ' <' + targetEmail + '> but could NOT write pass_sent (' + err.message +
          '). Tick that row by hand, fix the column (protected range? data validation?), then run again.');
        sent++;
        stopped = true;
        return;
      }
    }

    Logger.log((opts.testMode ? '[TEST] ' : '') + 'Sent to ' + targetEmail + ' for ' + row.full_name);
    sent++;
    Utilities.sleep(throttleMs);
  });

  Logger.log((stopped ? 'Stopped early. ' : 'Done. ') + 'Sent: ' + sent + ', Skipped: ' + skipped + ', Failed: ' + failed +
    (trackDispatch ? ', Already sent (skipped): ' + alreadyDispatched : '') +
    (failed ? ' — search the log for FAILED.' : ''));
}

function normEmail_(e) { return String(e || '').trim().toLowerCase(); }

/**
 * THE "ALREADY SENT?" RULE for the live send (one place, used by the send and by the preview):
 * a row counts as sent only when BOTH `pass_sent` says yes AND `pass_sent_timestamp` is filled.
 * If EITHER is empty, the next sendEventPassesLIVE() sends to that row and fills both again. So:
 *   - rows added later (both blank)                         -> get their pass on the next live run
 *   - to re-send one person (new table, fixed email, lost email) -> clear their pass_sent cell
 * "Yes" = TRUE / a ticked checkbox, or the text TRUE, YES, Y, SENT, 1, X, ✓. FALSE, an unticked
 * checkbox or anything else counts as empty.
 */
function isAlreadyDispatched_(row, fieldName, tsFieldName) {
  const flag = row[fieldName];
  const flagSet = flag === true || /^(true|yes|y|sent|1|x|✓|✔)$/i.test(String(flag == null ? '' : flag).trim());
  if (!tsFieldName) return flagSet;
  const ts = row[tsFieldName];
  return flagSet && String(ts == null ? '' : ts).trim() !== '';
}

/**
 * Test-mode pairing: for each test address, the rows the REAL send would email to that address
 * (matched on `email`, case-insensitive). No match -> a SAMPLE row if sampleRowFor can build one.
 * Logs the plan, so the Execution log shows exactly who got what.
 */
function pairTestAddresses_(rows, addresses, sampleRowFor) {
  const targets = [];
  addresses.forEach(function (addr) {
    const own = rows.filter(function (r) { return normEmail_(r.email) === normEmail_(addr); });
    if (own.length) {
      own.forEach(function (r) { targets.push({ row: r, to: addr }); });
      Logger.log('TEST PLAN: ' + addr + ' <- their own pass' + (own.length > 1 ? 'es (' + own.length + ' rows share this address)' : '') + ': ' +
        own.map(function (r) { return r.full_name; }).join(', '));
      return;
    }
    const sample = sampleRowFor ? sampleRowFor(addr) : null;
    if (sample) {
      targets.push({ row: sample, to: addr });
      Logger.log('TEST PLAN: ' + addr + ' <- SAMPLE pass (this address is not in Master_Attendance; code 00000 will not work at the door)');
    } else {
      Logger.log('TEST PLAN: ' + addr + ' <- nothing (not in Master_Attendance)');
    }
  });
  return targets;
}

/** Placeholder code on SAMPLE passes. Real codes are 10000-99999, so this never checks anyone in. */
const SAMPLE_CODE = '00000';

/** A fictional row for a custom-blast test: every column filled, clearly marked as a sample. */
function sampleRowGeneric_(rows, addr) {
  const row = { _sample: true };
  Object.keys(rows[0] || {}).forEach(function (k) { if (k !== '_rowIndex') row[k] = 'Sample'; });
  row.email = addr;
  row.full_name = 'Sample Attendee';
  row.attendance_code = SAMPLE_CODE;
  return row;
}

/**
 * Send ANY custom HTML/plain-text blast to some or all attendees. Templates use {{header_name}}
 * placeholders matching real Master_Attendance columns exactly.
 *
 * Example — a schedule-change notice to everyone:
 *   sendCustomBlast('Venue update for CCOnklusyon 2026',
 *     '<p>Hi {{full_name}}, the venue has moved to...</p>',
 *     'Hi {{full_name}}, the venue has moved to...', false, []);
 *
 * @param {function} [rowFilter]  optional function(row) -> boolean, e.g. row => row.ticket_type === 'VIP Pass'
 */
function sendCustomBlast(subjectText, htmlTemplateText, plainTextTemplateText, testMode, testEmailOverrides, rowFilter) {
  let rows = rowsAsObjects_();
  if (typeof rowFilter === 'function') rows = rows.filter(rowFilter);
  const allRows = rows;

  sendMailBlast_(rows, {
    subject: subjectText,
    buildHtml: function (row) { return renderTemplate_(htmlTemplateText, genericFieldMap_(row)); },
    buildText: function (row) { return renderTemplate_(plainTextTemplateText, genericFieldMap_(row)); },
    requiredFields: [],
    testMode: !!testMode,
    testEmailOverrides: testEmailOverrides || [],
    sampleRowFor: function (addr) { return sampleRowGeneric_(allRows, addr); }
    // No dispatchField on purpose: an announcement isn't the invite and must not touch pass_sent.
  });
}

/** Convenience entry point — edit the fields below, then Run this function. */
function sendCustomBlastExample() {
  const SUBJECT = 'Update: CCOnklusyon 2026';
  const HTML = '<p>Hi {{full_name}},</p><p>Write your announcement HTML here. Any {{header_name}} placeholder works.</p>';
  const TEXT = 'Hi {{full_name}},\n\nWrite your announcement text here.';
  const TEST_MODE = true; // flip to false only when ready to send for real
  const TEST_EMAILS = [
    // <-- put 1+ real test addresses here before running with TEST_MODE = true
  ];
  if (TEST_MODE && TEST_EMAILS.length === 0) {
    Logger.log('Add at least one address to TEST_EMAILS before running in test mode.');
    return;
  }
  sendCustomBlast(SUBJECT, HTML, TEXT, TEST_MODE, TEST_EMAILS);
}

// =====================================================================================
// LAYER 2 — the invitation pass. Built on the generic engine above.
// =====================================================================================

// ATTENDEE TYPES (2026-10-01). Master_Attendance column `attendee_type` holds one of these (filled
// from the Final Seating "Category" by importFinalSeating in RosterImport.gs). The pass chip shows
// it; VVIP and VIP get the filled gold chip. ticket_type stays "VIP Pass" | "Regular Attendee"
// because the scanner, wall and Telegram VIP alert key off it.
const VIP_ATTENDEE_TYPES = ['VVIP', 'VIP'];

/** True when the row is an unnamed slot: full_name "(TBA)", "TBA", "To be announced" or blank. */
function isTbaName_(name) {
  const n = String(name || '').trim();
  return n === '' || /^\(?\s*(tba|to be announced|representative)\s*\)?\.?$/i.test(n);
}

/**
 * Who the pass is for — the two states:
 *   named  -> "This invitation is for:" + the full name
 *   (TBA)  -> one (1) representative of the club/office; "Please send 1 representative only."
 */
function buildInviteeHtml_(row) {
  const label = 'font-family: ' + BRAND.fontBody + '; font-size: 14px; line-height: 20px; color: ' + BRAND.ink + ';';
  const big = 'font-family: ' + BRAND.fontDisplay + '; font-size: 20px; line-height: 28px; font-weight: 700; color: ' + BRAND.gold + '; margin-top: 4px;';
  if (isTbaName_(row.full_name)) {
    const group = String(row.club_name || '').trim();
    return '<div style="' + label + '">This invitation is for:</div>' +
      '<div style="' + big + '">One (1) representative' + (group ? ' of ' + escapeHtml_(group) : '') + '</div>' +
      '<div style="' + label + ' margin-top: 8px; font-weight: 700; color: ' + BRAND.gold + ';">Please send 1 representative only.</div>';
  }
  return '<div style="' + label + '">This invitation is for:</div>' +
    '<div style="' + big + '">' + escapeHtml_(String(row.full_name).trim()) + '</div>';
}

function buildInviteeText_(row) {
  if (isTbaName_(row.full_name)) {
    const group = String(row.club_name || '').trim();
    return 'This invitation is for: One (1) representative' + (group ? ' of ' + group : '') + '\n' +
      'Please send 1 representative only.\n';
  }
  return 'This invitation is for: ' + String(row.full_name).trim() + '\n';
}

/** The chip text: the attendee type when the row has one, else the old ticket type. */
function passLabel_(row) {
  return String(row.attendee_type || '').trim() || String(row.ticket_type || '').trim();
}

function isVipRow_(row) {
  return VIP_ATTENDEE_TYPES.indexOf(String(row.attendee_type || '').trim()) >= 0 || row.ticket_type === 'VIP Pass';
}

/**
 * Field map for the invitation template.
 *   {{Pass_Label}}       <- attendee_type (e.g. "Club Participant", "VVIP"), falling back to ticket_type
 *   {{Invitee_Block}}    <- "This invitation is for: NAME", or the (TBA) one-representative notice
 *   {{QR_Link}}          <- a web link to the same QR image (the "Open my QR code" fallback button)
 *   {{Attendance_Code}}  <- attendance_code
 *   {{Table_Number}}     <- table_allocation (0/blank = "To be announced")
 *   {{Tag_Bg}} / {{Tag_Text_Color}}  <- VVIP/VIP = filled gold chip; everyone else = outlined gold chip
 * The QR itself is embedded (cid:qrCode), built from attendance_code — see qrImageUrl_.
 */
function buildInvitationFieldMap_(row) {
  const isVip = isVipRow_(row);
  const table = row.table_allocation;
  return {
    Pass_Label: escapeHtml_(passLabel_(row)),
    Invitee_Block: buildInviteeHtml_(row),
    QR_Link: qrImageUrl_(row.attendance_code),
    Attendance_Code: escapeHtml_(row.attendance_code),
    Table_Number: escapeHtml_(table && String(table) !== '0' ? table : 'To be announced'),
    Tag_Bg: isVip ? BRAND.goldMid : 'transparent',
    Tag_Text_Color: isVip ? BRAND.onAccent : BRAND.gold,
    Sample_Notice: row._sample ? SAMPLE_NOTICE_HTML_ : ''
  };
}

/** Shown on top of the card on SAMPLE passes only (test sends to addresses not in the list). */
const SAMPLE_NOTICE_HTML_ = '<tr><td align="center" style="padding: 20px 20px 0 20px;">' +
  '<div style="border: 2px dashed ' + BRAND.gold + '; border-radius: 12px; padding: 10px 14px; font-family: ' + BRAND.fontBody +
  '; font-size: 14px; line-height: 20px; font-weight: 700; color: ' + BRAND.gold + ';">SAMPLE PASS — for checking the design only.<br>' +
  'This QR code and attendance code will not work at the door.</div></td></tr>';

/**
 * A fictional pass row for a test send: the attendee type, club and table (and the "(TBA)" state)
 * of `base` if given, but a made-up name and the unusable code 00000 — so a tester can check how a
 * pass looks without ever receiving a real attendee's name or working QR code.
 */
function samplePassRow_(addr, base) {
  base = base || {};
  const type = String(base.attendee_type || '').trim() || 'Club Participant';
  const tba = String(base.full_name || '').trim() !== '' && isTbaName_(base.full_name);
  return {
    _sample: true,
    email: addr,
    full_name: tba ? '(TBA)' : 'Sample Attendee',
    attendee_type: type,
    ticket_type: VIP_ATTENDEE_TYPES.indexOf(type) >= 0 ? 'VIP Pass' : 'Regular Attendee',
    club_name: base.club_name || 'Council of Clubs and Organizations',
    table_allocation: base.table_allocation || '7',
    attendance_code: SAMPLE_CODE
  };
}

// ================================ IMAGES ================================
// Both images are EMBEDDED in each email (inline cid: attachments), not linked. Linked images
// depend on the phone's mail app loading remote content: "Ask before displaying external
// images", data saver, and weak signal at the venue door all leave a blank box where the pass
// should be. An embedded image travels inside the message, so it shows wherever the email opens.
//
// HERO BANNER — the only image you manage by hand. It already carries the CCO seal + wordmark.
// Fetched ONCE per run from this repo (docs/assets/hero-banner.jpg on main), then attached to
// every email. To change it, replace that file and push; to move it, change only this URL.
const HERO_BANNER_URL = 'https://raw.githubusercontent.com/xxch4nnn/CCONKlusyon-Registration-System/main/docs/assets/hero-banner.jpg';

// QR CODE — generated from attendance_code at send time (the sheet's qr_code_url column is no
// longer used by the email). 600 px source so it stays sharp on 3x phone screens at 200 px;
// qzone=2 bakes a white quiet zone into the image itself, so it still scans if a dark-mode mail
// app darkens the white frame around it; ecc=M adds error correction for screen-to-camera scans.
const QR_IMAGE_BASE = 'https://api.qrserver.com/v1/create-qr-code/?size=600x600&qzone=2&ecc=M&format=png&data=';

function qrImageUrl_(attendanceCode) {
  return QR_IMAGE_BASE + encodeURIComponent(String(attendanceCode));
}

/** Fetches an image as a named Blob; throws (so the row is skipped) unless it is really an image. */
function fetchImageBlob_(url, name) {
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const headers = res.getHeaders();
  const type = String(headers['Content-Type'] || headers['content-type'] || '');
  if (res.getResponseCode() !== 200 || type.indexOf('image/') !== 0) {
    throw new Error('HTTP ' + res.getResponseCode() + ' (' + type + ') from ' + url);
  }
  return res.getBlob().setName(name);
}

let heroBannerBlobCache_ = null; // one fetch per run, reused for every email
function getHeroBannerBlob_() {
  if (!heroBannerBlobCache_) heroBannerBlobCache_ = fetchImageBlob_(HERO_BANNER_URL, 'hero-banner.jpg');
  return heroBannerBlobCache_;
}

/** The two embedded images for one attendee: <img src="cid:heroBanner"> and <img src="cid:qrCode">. */
function buildPassInlineImages_(row) {
  return {
    heroBanner: getHeroBannerBlob_(),
    qrCode: fetchImageBlob_(qrImageUrl_(row.attendance_code), 'qr-' + row.attendance_code + '.png')
  };
}
// ===========================================================================

// GENERAL INFORMATION LINKS — edit labels/URLs here only; the HTML list and the plain-text
// fallback are both built from this array.
const INFO_LINKS = [
  { label: 'Event Primer', url: 'https://drive.google.com/file/d/1tJN_6Ic2Q5VSVY9aUbjeWHwx90qHZNlE/view' },
  { label: 'General Information Sheet (Pamphlet/Flyer)', url: 'https://drive.google.com/file/d/1jnWHG-kHZuoEF9rYWLxgd-F2TE8CeMZs/view' },
  { label: 'Seating Plan', url: 'https://drive.google.com/file/d/1U2gYQyopdGnAFLLYB6dkr6rGKrB8DBXm/view' },
  { label: 'Floor Plan (3D)', url: 'https://drive.google.com/file/d/1k-MicOsWupFw-llJW3Y4V0c6IZ4SjjHR/view' },
  { label: 'Emergency Plan', url: 'https://drive.google.com/file/d/10D_TVU_7xZ9nxBlL5kM7zsvlX_V-deLG/view' }
];

// One row per link: hairline-divided list, ink label, gold arrow, no default underline.
// The padding sits on the <a> itself (not the cell), so the whole 44 px row is the tap target.
const INFO_LINKS_HTML = INFO_LINKS.map(function (l, i) {
  const rule = i === 0 ? '' : ' border-top: 1px solid rgba(201, 141, 69, 0.35);';
  return '<tr><td style="padding: 0;' + rule + '">' +
    '<a href="' + l.url + '" target="_blank" style="display: block; padding: 12px 0; font-family: ' + BRAND.fontBody + '; font-size: 16px; line-height: 20px; font-weight: 600; color: ' + BRAND.ink + '; text-decoration: none;">' +
    escapeHtml_(l.label) + '&nbsp;<span style="color: ' + BRAND.gold + ';">&rarr;</span></a></td></tr>'; // &nbsp; keeps the arrow with the last word
}).join('\n            ');

const INVITATION_HTML_TEMPLATE = `
  <!DOCTYPE html><html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Cormorant+Garamond:wght@500;600&display=swap" rel="stylesheet">
    <style>
      /* Phones: 20 px side margins instead of 30 px (Gmail and Apple Mail honour this; anything
         that strips <style> just keeps the 30 px inline value). */
      @media only screen and (max-width: 480px) {
        .px { padding-left: 20px !important; padding-right: 20px !important; }
        .card-px { padding-left: 16px !important; padding-right: 16px !important; }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 32px 0; background-color: ${BRAND.royalBlue}; font-family: ${BRAND.fontBody};">
    <table role="presentation" align="center" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${BRAND.royalBlue}" style="max-width: 600px; margin: 0 auto; background-color: ${BRAND.royalBlue}; border-radius: 24px; overflow: hidden; border: 1px solid ${BRAND.goldDeep};">

      <!-- ===== HERO BANNER — embedded image (cid:heroBanner), see HERO_BANNER_URL above =====
           Styled alt text so a mail app that still hides it shows gold text, not a broken box.
           Its own top corners are rounded: Gmail ignores overflow:hidden on the card. -->
      <tr><td align="center" bgcolor="${BRAND.royalBlue}"><img src="cid:heroBanner" alt="CCOnklusyon 2026: The Legacy CContinues" width="600" style="width:100%; max-width:600px; height:auto; display:block; border:0; border-radius: 23px 23px 0 0; font-family: ${BRAND.fontDisplay}; font-size: 20px; line-height: 28px; font-weight: 700; color: ${BRAND.gold};"></td></tr>
      <!-- ===== END HERO BANNER ===== -->

      <tr>
        <td class="px" style="padding: 32px 30px 8px 30px; font-family: ${BRAND.fontBody}; font-size: 16px; line-height: 1.6; text-align: justify; color: ${BRAND.ink};">
          <h1 style="margin: 0 0 20px 0; font-family: ${BRAND.fontDisplay}; font-size: 24px; line-height: 32px; font-weight: 700; letter-spacing: 0.5px; color: ${BRAND.gold};">Your Invitation &amp; Entry Pass</h1>
          <p style="margin: 0 0 16px 0;">Greetings in the name of genuine student service!</p>
          <p style="margin: 0 0 16px 0;">We are thrilled to officially welcome you to <strong style="color: ${BRAND.gold}; font-weight:600;">CCOnklusyon 2026: The Legacy CContinues!</strong> As we culminate a year of collective leadership, passion, and student initiative, we cannot wait to celebrate these shared milestones with you.</p>
          <p style="margin: 0 0 4px 0;">This is your official invitation. Below is your official entry pass and unique attendance record:</p>
        </td>
      </tr>

      <!-- ===== ENTRY PASS CARD ===== -->
      <tr>
        <td class="px" style="padding: 16px 30px 8px 30px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${BRAND.navyDeep}" style="background-color: ${BRAND.navyDeep}; border: 2px solid ${BRAND.goldDeep}; border-radius: 24px; border-collapse: separate;">
            {{Sample_Notice}}
            <tr>
              <td align="center" class="card-px" style="padding: 24px 20px 8px 20px;">
                <span style="display:inline-block; padding: 6px 18px; background-color: {{Tag_Bg}}; border: 1px solid ${BRAND.goldDeep}; border-radius: 8px; color: {{Tag_Text_Color}}; font-family: ${BRAND.fontDisplay}; font-weight: 700; font-size: 14px; letter-spacing: 1.5px; text-transform: uppercase;">{{Pass_Label}}</span>
              </td>
            </tr>
            <!-- WHO THIS PASS IS FOR — built by buildInviteeHtml_ -->
            <tr>
              <td align="center" class="card-px" style="padding: 12px 20px 4px 20px;">
                {{Invitee_Block}}
              </td>
            </tr>
            <tr>
              <td align="center" class="card-px" style="padding: 12px 20px 28px 20px;">
                <!-- QR CODE — embedded image (cid:qrCode) built from attendance_code; white quiet zone is inside the image -->
                <table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#FFFFFF" style="background-color: #FFFFFF; padding: 8px; border-radius: 12px;"><img src="cid:qrCode" alt="QR code for attendance code {{Attendance_Code}}" width="200" height="200" style="display:block; width:200px; height:200px; border:0; font-family: ${BRAND.fontBody}; font-size: 14px; color: ${BRAND.onAccent};"></td></tr></table>
                <div style="margin-top: 18px; font-family: ${BRAND.fontText}; font-size: 14px; color: ${BRAND.gold}; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">Attendance Code</div>
                <div style="font-family: ${BRAND.fontDisplay}; font-size: 30px; font-weight: 700; letter-spacing: 4px; color: ${BRAND.gold}; margin-top: 6px;">{{Attendance_Code}}</div>
                <div style="margin-top: 16px; padding: 7px 18px; display: inline-block; border-radius: 20px; border: 1px solid ${BRAND.goldDeep}; font-family: ${BRAND.fontBody}; font-size: 14px; font-weight: 600; color: ${BRAND.ink};">Table Number: <span style="color: ${BRAND.gold}; font-weight: 700;">{{Table_Number}}</span></div>
                <!-- Fallback button: opens the same QR as a web image (handy for a screenshot). 16 px text, 48 px tall. -->
                <table role="presentation" align="center" border="0" cellpadding="0" cellspacing="0" style="margin-top: 20px;"><tr><td align="center" style="border: 1px solid ${BRAND.goldDeep}; border-radius: 10px;"><a href="{{QR_Link}}" target="_blank" style="display: inline-block; padding: 14px 24px; font-family: ${BRAND.fontBody}; font-size: 16px; line-height: 20px; font-weight: 700; color: ${BRAND.gold}; text-decoration: none;">Open my QR code</a></td></tr></table>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- ===== ENTRY REMINDERS ===== -->
      <tr>
        <td class="px" style="padding: 24px 30px 8px 30px; font-family: ${BRAND.fontBody}; font-size: 15px; line-height: 1.6; text-align: justify; color: ${BRAND.ink};">
          <h2 style="margin: 0 0 12px 0; font-family: ${BRAND.fontDisplay}; font-size: 22px; line-height: 30px; font-weight: 700; letter-spacing: 0.5px; color: ${BRAND.gold};">Important Entry Reminders</h2>
          <p style="margin: 0 0 12px 0;"><strong style="color: ${BRAND.gold};">Present to Enter:</strong> Please present this email or keep a clear screenshot of your QR code ready on your mobile device at the registration terminal upon arrival.</p>
          <p style="margin: 0 0 12px 0;"><strong style="color: ${BRAND.gold};">One-Time Scan:</strong> This QR code is uniquely tied to your profile and will serve as your official entry verification and attendance log.</p>
          <p style="margin: 0;"><strong style="color: ${BRAND.gold};">Early Check-in:</strong> Registration opens at 12:00 PM. We encourage arriving early to avoid long queues and ensure a smooth entrance before the ceremonies begin.</p>
        </td>
      </tr>

      <!-- ===== GENERAL INFORMATION LINKS (Google Drive — swap any href below) ===== -->
      <tr>
        <td class="px" style="padding: 24px 30px 20px 30px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid ${BRAND.goldDeep};">
            <tr><td style="padding-top: 20px; padding-bottom: 6px;"><h2 style="margin: 0; font-family: ${BRAND.fontDisplay}; font-size: 22px; line-height: 30px; font-weight: 700; letter-spacing: 0.5px; color: ${BRAND.gold};">General Information</h2></td></tr>
            ${INFO_LINKS_HTML}
          </table>
        </td>
      </tr>

      <!-- ===== CLOSING + FOOTER (one centred block) ===== -->
      <tr>
        <td align="center" class="px" style="padding: 24px 30px 28px 30px; border-top: 1px solid ${BRAND.goldDeep};">
          <p style="font-family: ${BRAND.fontDisplay}; font-size: 22px; line-height: 30px; font-weight: 600; letter-spacing: 0.5px; color: ${BRAND.gold}; margin: 4px 0 18px 0;">We can't wait to see you there!</p>
          <p style="font-family: ${BRAND.fontDisplay}; font-size: 16px; font-weight: 700; letter-spacing: 1px; color: ${BRAND.gold}; margin: 0 0 6px 0;">One Council, One Vision.</p>
          <p style="font-family: ${BRAND.fontText}; font-size: 14px; letter-spacing: 0.5px; color: ${BRAND.ink}; margin: 0;">41st Council of Clubs and Organizations &bull; CCOnklusyon: The Legacy CContinues</p>
        </td>
      </tr>
    </table>
  </body></html>`;

/** Builds the HTML pass for one attendee row. */
function buildPassHtml_(row) {
  return renderTemplate_(INVITATION_HTML_TEMPLATE, buildInvitationFieldMap_(row));
}

/** Compulsory plain-text fallback (spec requirement — anti-spam). */
function buildPassPlainText_(row) {
  const table = row.table_allocation && String(row.table_allocation) !== '0' ? row.table_allocation : 'To be announced';
  return (row._sample ? 'SAMPLE PASS — for checking the design only. This QR code and attendance code will not work at the door.\n\n' : '') +
    'Greetings in the name of genuine student service!\n\n' +
    'We are thrilled to officially welcome you to CCOnklusyon 2026: The Legacy CContinues! ' +
    'As we culminate a year of collective leadership, passion, and student initiative, we ' +
    'cannot wait to celebrate these shared milestones with you.\n\n' +
    'This is your official invitation. Your entry pass and unique attendance record:\n\n' +
    buildInviteeText_(row) +
    'Attendee type: ' + passLabel_(row) + '\n' +
    'Attendance code: ' + row.attendance_code + '\n' +
    'Table Number: ' + table + '\n' +
    'QR code (opens in your browser): ' + qrImageUrl_(row.attendance_code) + '\n\n' +
    'IMPORTANT ENTRY REMINDERS\n' +
    '- Present to Enter: present this email or a clear screenshot of your QR code at the registration terminal upon arrival.\n' +
    '- One-Time Scan: this QR code is uniquely tied to your profile and serves as your official entry verification and attendance log.\n' +
    '- Early Check-in: registration opens at 12:00 PM. We encourage arriving early to avoid long queues.\n\n' +
    'GENERAL INFORMATION\n' +
    INFO_LINKS.map(function (l) { return '- ' + l.label + ': ' + l.url; }).join('\n') + '\n\n' +
    'We can\'t wait to see you there!\n\n' +
    'One Council, One Vision.\n' +
    '41st Council of Clubs and Organizations - CCOnklusyon: The Legacy CContinues';
}

/**
 * The invitation send, gated by testMode.
 *   testMode = true  -> only sends to testEmailOverrides; ignores real emails and dispatch status.
 *   testMode = false -> sends to each row's real email; skips anyone already marked pass_sent,
 *                        then stamps pass_sent/pass_sent_timestamp on a successful send.
 * Throttled at 1 send per 2 seconds. Check MailApp.getRemainingDailyQuota() before a real run —
 * 100/day on a free Gmail account vs 1,500/day on Workspace.
 *
 * @param {boolean} [forceResend]  production only, default false — re-send and re-stamp everyone,
 *                                 ignoring pass_sent. Use deliberately, never as a default.
 */
/**
 * THE REAL SEND — emails every attendee their own pass and stamps pass_sent / pass_sent_timestamp.
 * Named in capitals on purpose: it is the only function in the Run dropdown that emails attendees.
 * Only rows whose pass_sent or pass_sent_timestamp is empty are sent (isAlreadyDispatched_), so it
 * is safe to run again after adding or editing rows: only those people get an email.
 * Rows added by hand without an attendance_code get one first (generateCredentials in Code.gs).
 */
function sendEventPassesLIVE() {
  fillMissingCodes_();
  sendEventPasses_(false, [], false);
}

/**
 * DRY RUN of the live send: writes nothing, sends nothing — logs who the next
 * sendEventPassesLIVE() would email, who is already done, and who can't get one.
 */
function previewEventPassesLIVE() {
  const rows = rowsAsObjects_();
  const headers = openBlastSheet_().headers;
  ['pass_sent', 'pass_sent_timestamp'].forEach(function (h) {
    if (headers.indexOf(h) === -1) Logger.log('PROBLEM: no "' + h + '" header in Master_Attendance — the live send will refuse to start until it is added.');
  });
  const willSend = [], alreadySent = [], noEmail = [];
  rows.forEach(function (r) {
    if (isAlreadyDispatched_(r, 'pass_sent', 'pass_sent_timestamp')) alreadySent.push(r);
    else if (!String(r.email || '').trim()) noEmail.push(r);
    else willSend.push(r);
  });
  const needCode = willSend.filter(function (r) { return !String(r.attendance_code || '').trim(); });
  const names = function (list) { return list.map(function (r) { return r.full_name + ' <' + (r.email || 'no email') + '>'; }).join('; '); };
  Logger.log('PREVIEW — nothing sent. Next live run would email ' + willSend.length + ' of ' + rows.length + ' row(s); ' +
    alreadySent.length + ' already sent; ' + noEmail.length + ' have no email. Quota left today: ' + MailApp.getRemainingDailyQuota() + '.');
  if (needCode.length) Logger.log(needCode.length + ' of them have no attendance code yet — the live run generates it first.');
  if (willSend.length) Logger.log('Would email: ' + names(willSend));
  if (noEmail.length) Logger.log('No email (give them their code another way): ' + names(noEmail));
}

/** Codes + QR URLs for rows that have a name but no attendance_code (hand-added rows). */
function fillMissingCodes_() {
  const missing = rowsAsObjects_().filter(function (r) { return !String(r.attendance_code || '').trim(); }).length;
  if (!missing) return;
  if (typeof generateCredentials !== 'function') {
    Logger.log('WARNING: ' + missing + ' row(s) have no attendance code and generateCredentials (Code.gs) is missing — they will be skipped.');
    return;
  }
  generateCredentials();
  SpreadsheetApp.flush();
  Logger.log('Generated attendance codes for ' + missing + ' new row(s).');
}

/** Shared by the live send and the tests. Underscore = hidden from the Run dropdown. */
function sendEventPasses_(testMode, testEmailOverrides, forceResend) {
  sendMailBlast_(rowsAsObjects_(), passBlastOptions_(testMode, testEmailOverrides, forceResend));
}

function passBlastOptions_(testMode, testEmailOverrides, forceResend) {
  return {
    subject: 'Your Official Invitation & Entry Pass — CCOnklusyon 2026',
    buildHtml: buildPassHtml_,
    buildText: buildPassPlainText_,
    buildInlineImages: buildPassInlineImages_,
    requiredFields: ['attendance_code'],
    testMode: !!testMode,
    testEmailOverrides: testEmailOverrides || [],
    sampleRowFor: function (addr) { return samplePassRow_(addr); },
    dispatchField: 'pass_sent',
    dispatchTsField: 'pass_sent_timestamp',
    forceResend: !!forceResend
  };
}

/**
 * Test addresses live in the Script property BETA_TEST_EMAILS (comma-separated), NOT in this
 * file: the repo is public, and a property also survives re-pasting this file from GitHub.
 * Set it once: Apps Script -> Project Settings -> Script properties -> Add script property.
 */
function betaTestEmails_() {
  const raw = PropertiesService.getScriptProperties().getProperty('BETA_TEST_EMAILS') || '';
  const list = raw.split(/[\s,;]+/).filter(function (e) { return e.indexOf('@') > 0; });
  if (list.length === 0) {
    Logger.log('No test addresses: add the Script property BETA_TEST_EMAILS (comma-separated) under Project Settings, then run again.');
  } else {
    Logger.log('Test addresses: ' + list.join(', '));
  }
  return list;
}

/**
 * Test send: each BETA_TEST_EMAILS address receives exactly what the live send would send it —
 * its OWN pass (every row whose email is that address), with "[TEST]" in the subject. An address
 * that isn't in Master_Attendance gets a "[TEST SAMPLE]" pass (fictional name, code 00000).
 * Never sends one attendee's pass to someone else. Never reads or writes pass_sent.
 */
function sendEventPassesBetaTest() {
  const emails = betaTestEmails_();
  if (emails.length === 0) return;
  sendEventPasses_(true, emails, false);
}

/**
 * Design check of every variant: one SAMPLE pass per attendee type in the list, plus a "(TBA)"
 * version, spread across the BETA_TEST_EMAILS inboxes. Each shows that type's chip, club and table
 * but a made-up name and the unusable code 00000 — no real attendee's pass is sent.
 */
function sendEventPassesBetaTestVariety() {
  const emails = betaTestEmails_();
  if (emails.length === 0) return;
  const seen = {};
  const bases = rowsAsObjects_().filter(function (r) {
    const key = passLabel_(r) + (isTbaName_(r.full_name) ? ' + (TBA)' : '');
    if (!passLabel_(r) || seen[key]) return false;
    seen[key] = true;
    return true;
  });
  const targets = bases.map(function (base, i) {
    return { row: samplePassRow_(emails[i % emails.length], base), to: emails[i % emails.length] };
  });
  Logger.log('Variety test: ' + targets.length + ' SAMPLE pass(es): ' + Object.keys(seen).join(' | '));
  const opts = passBlastOptions_(true, emails, false);
  opts.testTargets = targets;
  sendMailBlast_([], opts);
}
