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
 *   2. The INVITATION pass, built on top of layer 1 — same throttling/quota/skip logic, but with
 *      its own field mapping because the user's HTML template uses placeholder names
 *      ({{Bg_Color}}, {{Card_Tint}}, {{Seat_Number}}) that don't exist as real sheet columns and
 *      have to be derived (see buildInvitationFieldMap_ below).
 *
 * Run manually from the Apps Script editor. IMPORTANT: after pasting/editing this file, save it
 * (Ctrl+S / Cmd+S) — the function dropdown next to Run only lists functions from the LAST SAVED
 * version, so a new function won't appear there until you save. First run of any function that
 * touches Gmail/Sheets will also prompt a Google "Authorization required" screen — that's normal
 * for a script only you own; Review permissions -> Advanced -> Go to (project name) -> Allow.
 */

const SENDER_NAME = 'CCO CCOnklusyon 2026';

const TIER_COLORS = {
  'VIP Pass': { bg: '#B8860B', tint: '#FFFDF0' },
  'Regular Attendee': { bg: '#1A56DB', tint: '#F0F5FF' }
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

/** Reads Master_Attendance into an array of plain objects keyed by header name. */
function rowsAsObjects_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
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
 *   testMode         true -> ignores each row's real email, sends to testEmailOverrides instead
 *   testEmailOverrides  array of addresses, used only when testMode is true
 *   sampleOnly       (test mode only) true = each test address gets exactly ONE row's pass
 *                     (one-to-one, first N rows where N = testEmailOverrides.length) instead of
 *                     every row round-robined across the test addresses. Default true — a
 *                     round-robin preview of every row is available via `sampleOnly: false` but
 *                     floods each test inbox with several differently-named passes, which reads
 *                     as a bug on first glance rather than a feature. Prefer sampleOnly unless you
 *                     specifically need to eyeball every row's rendering.
 *   throttleMs       ms to sleep between sends (default 2000 = 1 send / 2s)
 */
function sendMailBlast_(rows, opts) {
  const throttleMs = opts.throttleMs || 2000;
  const requiredFields = opts.requiredFields || [];
  const quotaRemaining = MailApp.getRemainingDailyQuota();
  Logger.log('Remaining MailApp daily quota: ' + quotaRemaining);

  let targetRows = rows;
  if (opts.testMode && opts.sampleOnly !== false) {
    targetRows = rows.slice(0, opts.testEmailOverrides.length);
    Logger.log('sampleOnly: sending ' + targetRows.length + ' row(s), one per test address (no round-robin).');
  }

  let sent = 0, skipped = 0;

  targetRows.forEach(function (row, idx) {
    const targetEmail = opts.testMode
      ? opts.testEmailOverrides[idx % opts.testEmailOverrides.length]
      : row.email;

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
    if (sent >= quotaRemaining) {
      Logger.log('STOP: daily quota reached at ' + sent + ' sends.');
      return;
    }

    const subject = typeof opts.subject === 'function' ? opts.subject(row) : opts.subject;
    const finalSubject = opts.testMode ? '[TEST] ' + subject : subject;

    MailApp.sendEmail({
      to: targetEmail,
      subject: finalSubject,
      body: opts.buildText(row),
      htmlBody: opts.buildHtml(row),
      name: SENDER_NAME
    });

    Logger.log((opts.testMode ? '[TEST] ' : '') + 'Sent to ' + targetEmail + ' for ' + row.full_name);
    sent++;
    Utilities.sleep(throttleMs);
  });

  Logger.log('Done. Sent: ' + sent + ', Skipped: ' + skipped);
}

/**
 * Story 2.1-2.3, generalized: send ANY custom HTML/plain-text blast to some or all attendees.
 * Templates use {{header_name}} placeholders matching real Master_Attendance columns exactly
 * (email, full_name, org_classification, club_name, designation, ticket_type, attendance_code,
 * qr_code_url, table_allocation, photo_url, checkin_status, checkin_timestamp, checked_in_by).
 *
 * Example — a schedule-change notice to everyone:
 *   sendCustomBlast(
 *     'Venue update for CCOnklusyon 2026',
 *     '<p>Hi {{full_name}}, the venue has moved to...</p>',
 *     'Hi {{full_name}}, the venue has moved to...',
 *     false, []
 *   );
 *
 * @param {string} subjectText        plain subject line
 * @param {string} htmlTemplateText   HTML with {{header_name}} placeholders
 * @param {string} plainTextTemplateText  plain-text fallback with the same placeholders
 * @param {boolean} testMode          true = only sends to testEmailOverrides
 * @param {string[]} testEmailOverrides  used only when testMode is true
 * @param {function} [rowFilter]      optional function(row) -> boolean, e.g. row => row.ticket_type === 'VIP Pass'
 */
function sendCustomBlast(subjectText, htmlTemplateText, plainTextTemplateText, testMode, testEmailOverrides, rowFilter, sampleOnly) {
  let rows = rowsAsObjects_();
  if (typeof rowFilter === 'function') rows = rows.filter(rowFilter);

  sendMailBlast_(rows, {
    subject: subjectText,
    buildHtml: function (row) { return renderTemplate_(htmlTemplateText, genericFieldMap_(row)); },
    buildText: function (row) { return renderTemplate_(plainTextTemplateText, genericFieldMap_(row)); },
    requiredFields: [],
    testMode: !!testMode,
    testEmailOverrides: testEmailOverrides || [],
    sampleOnly: sampleOnly !== false
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

/**
 * Story 2.1: field map for the invitation pass template (placeholder names -> derived/aliased
 * values). Kept separate from genericFieldMap_ because the template's placeholder names
 * ({{Name}}, {{Bg_Color}}, {{Card_Tint}}, {{Seat_Number}}) don't match real column names —
 * see the mapping notes below.
 *   {{Name}}             <- full_name
 *   {{Ticket_Type}}      <- ticket_type
 *   {{QR_Code_URL}}      <- qr_code_url
 *   {{Attendance_Code}}  <- attendance_code
 *   {{Seat_Number}}      <- table_allocation
 *   {{Bg_Color}}         <- derived from ticket_type (spec-locked: Gold #B8860B VIP / Blue #1A56DB Regular)
 *   {{Card_Tint}}        <- derived from ticket_type (light tint of the same pair)
 */
function buildInvitationFieldMap_(row) {
  const tier = TIER_COLORS[row.ticket_type] || TIER_COLORS['Regular Attendee'];
  return {
    Name: escapeHtml_(row.full_name),
    Ticket_Type: escapeHtml_(row.ticket_type),
    QR_Code_URL: row.qr_code_url,
    Attendance_Code: row.attendance_code,
    Seat_Number: escapeHtml_(row.table_allocation || 'To be announced'),
    Bg_Color: tier.bg,
    Card_Tint: tier.tint
  };
}

const INVITATION_HTML_TEMPLATE = `
  <!DOCTYPE html><html><body style="margin: 0; padding: 20px 0; background-color: #F4F6F8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 8px; overflow: hidden; border: 1px solid #E5E7EB;">
      <tr><td align="center" style="padding: 24px 20px 16px 20px;"><img src="https://placehold.co/360x100/ffffff/1A56DB.png?text=START-DOST+LOGO" width="180" height="50" style="display:block; margin:0 auto;"></td></tr>
      <tr><td align="center"><img src="https://placehold.co/1200x500/1A56DB/ffffff.png?text=CCOnklusyon+Hero+Banner" width="600" style="width:100%; max-width:600px; display:block;"></td></tr>
      <tr>
        <td style="padding: 28px 30px 14px 30px; font-size: 15px; line-height: 1.6; color: #2B2B2B;">
          <p style="margin: 0 0 14px 0; font-size: 20px; font-weight: 700; color: #111827;">An electric day, {{Name}}!</p>
          <p style="margin: 0 0 12px 0;">We are thrilled to welcome you to <strong>CCO CCOnklusyon</strong>. Below is your official entry pass and unique attendance record.</p>
          <p style="margin: 0;">Please present this email or have your unique QR code ready on your mobile device at the registration terminal.</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 30px 24px 30px;">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: {{Card_Tint}}; border: 2px solid {{Bg_Color}}; border-radius: 12px; border-collapse: separate; overflow: hidden;">
            <tr><td align="center" style="background-color: {{Bg_Color}}; padding: 12px 20px; color: #FFFFFF; font-weight: 800; font-size: 14px; letter-spacing: 1.5px; text-transform: uppercase;">{{Ticket_Type}}</td></tr>
            <tr>
              <td align="center" style="padding: 24px 20px 20px 20px;">
                <table border="0" cellpadding="0" cellspacing="0"><tr><td align="center" style="background-color: #FFFFFF; padding: 10px; border-radius: 8px; border: 1px solid #E5E7EB;"><img src="{{QR_Code_URL}}" alt="Attendance QR Code" width="160" height="160" style="display:block;"></td></tr></table>
                <div style="margin-top: 16px; font-size: 12px; color: #6B7280; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Attendance Code</div>
                <div style="font-size: 32px; font-weight: 800; letter-spacing: 5px; color: {{Bg_Color}}; margin-top: 4px;">{{Attendance_Code}}</div>
                <div style="margin-top: 14px; padding: 6px 16px; background-color: #FFFFFF; display: inline-block; border-radius: 20px; border: 1px solid #D1D5DB; font-size: 13px; font-weight: 600; color: #374151;">Assigned Seat: <span style="color: #111827; font-weight: 700;">{{Seat_Number}}</span></div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 30px 24px 30px;">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid #E5E7EB; padding-top: 20px;">
            <tr><td style="font-size: 14px; line-height: 1.8; color: #374151;">&bull; <strong>Event Primer:</strong> <a href="https://yourdomain.org/primer" target="_blank" style="color: #1A56DB; font-weight: 600;">Download Briefing Document</a><br>&bull; <strong>Venue Floor Plan:</strong> <a href="https://yourdomain.org/floorplan" target="_blank" style="color: #1A56DB; font-weight: 600;">Seating & Terminal Map</a></td></tr>
          </table>
        </td>
      </tr>
      <tr><td align="center" style="padding: 0 30px 24px 30px;"><img src="https://placehold.co/1080x600/e5e7eb/1f2937.png?text=Event+Community+Photo" width="540" style="width:100%; max-width:540px; border-radius:8px; display:block;"></td></tr>
      <tr>
        <td align="center" style="padding: 20px 30px 16px 30px; border-top: 1px solid #F3F4F6;">
          <img src="https://placehold.co/360x90/ffffff/1A56DB.png?text=START-DOST+Branding" width="180" height="45" style="display:block; margin-bottom: 8px;">
          <p style="font-size: 13px; font-weight: 700; color: #1A56DB; margin: 0 0 6px 0;">Connecting Regions, Creating Impact.</p>
          <p style="font-size: 11px; color: #6B7280; margin: 0;">Department of Science and Technology &bull; START Program Management</p>
        </td>
      </tr>
    </table>
  </body></html>`;

/** Story 2.1: builds the HTML pass for one attendee row. */
function buildPassHtml_(row) {
  return renderTemplate_(INVITATION_HTML_TEMPLATE, buildInvitationFieldMap_(row));
}

/** Story 2.1: compulsory plain-text fallback (spec requirement — anti-spam). */
function buildPassPlainText_(row) {
  return 'An electric day, ' + row.full_name + '!\n\n' +
    'You are confirmed for CCO CCOnklusyon.\n\n' +
    'Ticket type: ' + row.ticket_type + '\n' +
    'Attendance code: ' + row.attendance_code + '\n' +
    'Assigned seat: ' + (row.table_allocation || 'To be announced') + '\n\n' +
    'Your QR code (view in an HTML-capable mail client): ' + row.qr_code_url + '\n\n' +
    'Present this email or your attendance code at the registration terminal.\n' +
    'Department of Science and Technology — START Program Management';
}

/**
 * Story 2.1 + 2.2: the invitation send, gated by testMode.
 *   testMode = true  -> only sends to testEmailOverrides (Story 2.3 beta check),
 *                        ignores each row's real email, logs what WOULD have sent.
 *   testMode = false -> sends to each row's real email.
 * Throttled at 1 send per 2 seconds. Check MailApp.getRemainingDailyQuota() before a real
 * run — 100/day on a free Gmail account vs 1,500/day on Workspace.
 */
function sendEventPasses(testMode, testEmailOverrides, sampleOnly) {
  const rows = rowsAsObjects_();
  sendMailBlast_(rows, {
    subject: 'Your CCOnklusyon 2026 Entry Pass',
    buildHtml: buildPassHtml_,
    buildText: buildPassPlainText_,
    requiredFields: ['attendance_code'],
    testMode: !!testMode,
    testEmailOverrides: testEmailOverrides || [],
    sampleOnly: sampleOnly !== false
  });
}

/**
 * Story 2.3, default beta check: ONE pass per test address (first N rows, N = number of test
 * addresses) — no round-robin, so each test inbox gets exactly one email and it's obvious which
 * row it corresponds to. Edit the array, then Run this function.
 */
function sendEventPassesBetaTest() {
  const BETA_TEST_EMAILS = [
    // <-- put 3-5 real test addresses here across Gmail/Outlook/Yahoo before running
  ];
  if (BETA_TEST_EMAILS.length === 0) {
    Logger.log('Add at least one address to BETA_TEST_EMAILS before running.');
    return;
  }
  sendEventPasses(true, BETA_TEST_EMAILS, true);
}

/**
 * Story 2.3, thorough variant: round-robins EVERY row across the test addresses, so each test
 * inbox receives several passes for DIFFERENT real attendees (by design — see sendMailBlast_'s
 * sampleOnly doc comment). Use this only when you specifically want to eyeball every row's
 * rendering (e.g. every VIP vs every Regular Attendee), not for a routine beta check.
 */
function sendEventPassesBetaTestFull() {
  const BETA_TEST_EMAILS = [
    // <-- put 3-5 real test addresses here across Gmail/Outlook/Yahoo before running
  ];
  if (BETA_TEST_EMAILS.length === 0) {
    Logger.log('Add at least one address to BETA_TEST_EMAILS before running.');
    return;
  }
  sendEventPasses(true, BETA_TEST_EMAILS, false);
}
