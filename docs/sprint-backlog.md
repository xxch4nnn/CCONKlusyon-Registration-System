# Sprint Backlog & QA Gates

> Extracted from `Sprint Backlog & QA Gates.docx` (Sept 19, 2026 status). Epic/Story/Task numbering (e.g. 3.1.2) is referenced from `scanner.html` and `CHANGES.md`.

Agile-run, waterfall-ordered (each epic gates the next; stories inside an epic can reorder freely). Numbering is Epic.Story.Task (e.g. 1.2.3). QA sits at 5 milestone gates total, not per task — see the closing section for why.

## 1. Epic: Backend Gateway (D-3)

**Status: Epic 1 COMPLETE (2026-09-19).** Built against the real Master_Attendance tab (gid=155323925), 13-column schema. Found and fixed a deployment access bug ("Only myself" instead of "Anyone" — not a code bug). org_classification/photo_url documented as intentionally nullable per spec correction (see CHANGES.md). Live-tested: SUCCESS/DUPLICATE/NOT_FOUND/recent all match spec exactly; 5-concurrent-request load test produced exactly 1 SUCCESS + 4 DUPLICATE with zero duplicate writes; VIP path doesn't crash without a Telegram token. Remaining real gap (not a blocker for Epic 1): email still blank on all 10 rows — will block Epic 2 until filled.

**1.1 Story — Schema & data population**
- 1.1.1 Bind Code.gs to Master_Attendance sheet
- 1.1.2 Populate columns A-H for all attendees (or ~10-row test subset first)
- 1.1.3 Generate unique hardcoded 5-digit attendance_code values (col G) — no live formulas
- 1.1.4 Pre-fill I-L as blank/PENDING defaults

**1.2 Story — Code.gs core logic**
- 1.2.1 doPost(e): action: "checkin" — lookup, branch SUCCESS/DUPLICATE/NOT_FOUND per spec JSON contracts
- 1.2.2 Wrap all cell writes in LockService.getScriptLock() (10s wait window)
- 1.2.3 doGet(e): action: "recent" + limit param, return spec's attendees array shape
- 1.2.4 action: "sync" bulk endpoint for offline queue flush, chunked batches
- 1.2.5 Stub the Telegram webhook call point (real wiring in Epic 4)

**1.3 Story — Deploy & self-verify**
- 1.3.1 Deploy as Web App (Execute as "Me", Access "Anyone")
- 1.3.2 Contract-test via curl: valid checkin, duplicate checkin, bogus code, /recent?limit=5
- 1.3.3 Concurrency test: 5 simultaneous POSTs, confirm zero duplicate writes

### 🔵 QA Gate 1 — Backend Contract Sign-off

One pass, run once Epic 1 is fully built — not after each story above.
- ☐ All 4 response shapes (SUCCESS / DUPLICATE / NOT_FOUND / recent) match the spec's JSON exactly, field for field
- ☐ Concurrency test: 0 duplicate writes across 5 simultaneous requests
- ☐ No PII or token values are hardcoded in Code.gs (ScriptProperties only)

**Verdict:** PASS (2026-09-19, live-tested against the real deployment). Waiting on go-ahead for Epics 2 & is gate only (not the whole epic).

## 2. Epic: Email Pass Blaster (D-1)

**Status: COMPLETE (2026-09-19).** All 3 stories done and verified on live infra. 2.1 (template merge + tier-color derivation) and 2.2 (2s throttle, quota check) built as EmailBlaster.gs. Generalized on request into a reusable two-layer engine — sendCustomBlast() for any future HTML/text announcement merged against real sheet columns, sendEventPasses() for the invitation pass specifically. email column gap resolved (all 10 real rows filled). 2.3 (beta send) run live by the user via sendEventPassesBetaTest(); initial run surfaced a round-robin preview behavior that read as a bug (one test inbox receiving passes for several different real attendees) — fixed by defaulting beta mode to one sample per test address (sampleOnly), full round-robin kept as sendEventPassesBetaTestFull(). Retested and confirmed working as intended. **QA Gate 2 can proceed.**

**2.1 Story — QR & template generation**
- 2.1.1 sendSpamProofBetaTest(): iterate rows, generate QuickChart QR URL per attendance_code
- 2.1.2 Build 600px table-based responsive HTML email template with wallpaper wrapper + sender branding
- 2.1.3 Compulsory plain-text fallback version
- 2.1.4 Embed QR + PIN + table/seat + event guidelines into template

**2.2 Story — Throttling**
- 2.2.1 Confirm actual MailApp daily quota that applies (100/day free Gmail vs 1,500/day Workspace)
- 2.2.2 Implement send-rate throttle matching that quota

**2.3 Story — Beta send & manual check**
- 2.3.1 Send test batch (3-5 addresses across Gmail/Outlook/Yahoo)
- 2.3.2 Manually confirm inbox placement, mobile rendering, QR scannability from rendered email

## 3. Epic: Usher Scanner PWA (D-2)

**Status: BUILT; offline mode confirmed working on device (2026-09-19); UI/audio/haptics revised after device feedback — see CHANGES.md. Still to verify: bogus code via camera, noisy-room audibility, iOS + Android pass (3.5).** Original status: BUILT, stopped at device-testing checkpoint. All 4 stories (3.1 Camera scan core, 3.2 Feedback layer, 3.3 Manual PIN fallback, 3.4 Offline resilience) implemented in a single scanner.html, wired to the live Code.gs API contract. Deviation: no manifest.json/service worker added — not in the story list, offline handling is done at the app level via localStorage per 3.4.1/3.4.2 as specified. Roadblock: camera, flashlight, audio, and the noisy-room/offline-drop QA checks all need a real phone/tablet — user-side from here. Mandatory per-epic stop — awaiting go-ahead before Epic 4.

**3.1 Story — Camera scan core**
- 3.1.1 Single-file scanner.html, html5-qrcode via CDN, facingMode: "environment"
- 3.1.2 Wire scan → POST /api/checkin → render SUCCESS/DUPLICATE/NOT_FOUND
- 3.1.3 2.0s scan-freeze debounce
- 3.1.4 Flashlight toggle (feature-detected)

**3.2 Story — Feedback layer**
- 3.2.1 Web Audio tones: success (800→1200Hz), duplicate (440Hz), error (200Hz)
- 3.2.2 Full-screen color flash per state (Green/Amber/Red)
- 3.2.3 Test audibility in a noisy room

**3.3 Story — Manual PIN fallback**
- 3.3.1 Numeric field + Search/Validate button
- 3.3.2 Tier-colored modal card (Gold/Blue) with name, designation, table/seat
- 3.3.3 (spec §1.2A / §1.4) Search by surname/name when there is no PIN — **built 2026-09-20** (Code / Name toggle, cached roster, confirm step)
- (added) Shared access key on every data endpoint — **built 2026-09-20**; live only after the roll-out in `HANDOFF.md`

**3.4 Story — Offline resilience**
- 3.4.1 localStorage.offline_scans write on fetch failure
- 3.4.2 "Offline Mode" banner
- 3.4.3 Auto-flush to /api/sync on navigator.onLine
- 3.4.4 Airplane-mode test: scan 3, restore, verify sync

**3.5 Story — Cross-device pass**
- 3.5.1 iOS Safari + Android Chrome, real cellular, real hardware
- 3.5.2 Camera permission persists across screen sleep/wake

### 🔵 QA Gate 2 — Attendee-Facing Path Sign-off

Covers Epics 2 + 3 together, once both are built — this is the full attendee journey (email → scan → confirmation), so it's tested as one flow, not two.
- ☐ End-to-end: real test email received → QR scanned from that email → SUCCESS confirmation, under 3s
- ☐ Duplicate scan correctly blocked and flagged
- ☐ PIN fallback path produces correct tier-colored card
- ☐ Offline queue survives a real connectivity drop and syncs
- ☐ Verified on both iOS Safari and Android Chrome

**Verdict:** Pass → proceed to Epics 4 & 5. Fail → fix and re-run this gate only.

**Current status (2026-09-19): PASSED WITH WAIVER** — box 2 verified on device (BUG-001 fixed); box 5 (iOS Safari + Android Chrome) waived by the user for now and owed before Gate 5; the ≤3 s latency check is carried to Gate 5 / beta test 6.2.2. Details: [`bug-log.md`](./bug-log.md).

## 4. Epic: Telegram VIP Relay (D-4)

**Status (2026-09-20): 4.1.1 ✅ and 4.1.2 ✅ (alerts arrive in the VIP group); 4.1.3 ⚠ (live alerts still use the old template — the corrected script isn't deployed); 4.1.4 ⏳ (never timed). Not closed.** Full audit: [`audit-2026-09-20.md`](./audit-2026-09-20.md). Earlier note: CODE COMPLETE, NOT CLOSED (2026-09-19). Story 4.1.4 (time a real VIP alert) hasn't happened, 4.1.1 (bot + Script Properties) is unconfirmed, and the live deployment is still the *old* `Code.gs`. Original note: code complete, awaiting credentials. 4.1.2/4.1.3 done in `Code.gs` (alert sent after the lock is released; template per spec). 4.1.1 is user-side; 4.1.4 needs a VIP test row. Run `testTelegramPing()` then `testVipAlertTemplate()` in the Apps Script editor after adding the Script Properties, then redeploy as a new version of the existing deployment.

**4.1 Story — Wire the live alert**
- 4.1.1 You: create bot via @BotFather, add as Admin to Usher Leadership group, retrieve chat_id — paste both into ScriptProperties yourself (never shared in chat)
- 4.1.2 Replace Epic 1's stub with the real sendMessage call in doPost, triggered on ticket_type === "VIP Pass"
- 4.1.3 Message template exactly per spec (name, role/club, seat, time, escort CTA)
- 4.1.4 Check in a VIP test row, time the alert

## 5. Epic: Projector Live Wall (D-5)

**Status: BUILT (2026-09-19); reworked 2026-09-20 into three tabs — Spotlight (audience view, one attendee at a time, per Stage 2 §6.5), Recent (everyone, newest first, the earlier hero + grid) and Attendance (secretariat: checked in / expected, bar, VIP/Regular, per-club).** Layout verified with mocked data at 1080p. 5.1.x done in `display.html`; 5.2.1 error handling built in. The Attendance tab groups by club rather than Stage 2's org cluster (roster has no `org_classification`). Still to do on real hardware: 5.2.2 (30+ min heap watch), 5.2.3 (real 1080p/4K projector) and the spotlight timing/animation on a projector (6.2.6).

**5.1 Story — Build the wall**
- 5.1.1 Single-file display.html, poll GET /api/recent?limit=16 every 4000ms
- 5.1.2 Hero banner (last 3, large cards) + main masonry grid
- 5.1.3 Card styling: VIP gold #B8860B border+glow+badge; Regular royal blue #1A56DB border+badge
- 5.1.4 300ms fade-in/slide-up transition on new arrivals
- 5.1.5 SVG/Canvas monogram fallback for missing photo_url

**5.2 Story — Stability & display testing**
- 5.2.1 Error handling so a failed poll never crashes the tab
- 5.2.2 Long-run test (30+ min, watch heap in dev tools)
- 5.2.3 Test on 1080p and 4K external display, no horizontal scroll

### 🔵 QA Gate 3 — Full System Integration Sign-off

This is the gate that matters most before you involve other people (Epic 6 is a live beta with real Councilmen) — every deliverable exists and talks to every other one.
- ☐ One scan triggers all three downstream effects correctly: Sheet write, Telegram alert (if VIP), projector wall update
- ☐ VIP alert lands within 3s of scan
- ☐ Projector wall reflects arrivals within one poll cycle (≤4s)
- ☐ All 5 deliverables (D-1 through D-5) deployed to their real/staging URLs, not localhost

**Verdict:** Pass → schedule and run Epic 6 (live beta). Fail → do not schedule the beta until this passes — a failed integration gate wastes other people's time in Epic 6.

## 6. Epic: Beta Simulation Sprint (Sept 25-26)

**6.1 Story — Staging setup**
- 6.1.1 Populate real ~300-row roster (replace test rows), confirm PINs static/locked
- 6.1.2 Stage dummy attendance codes for the beta test group, seat allocations assigned

**6.2 Story — Run the 7-test battery live with CCO Councilmen**
- 6.2.1 Dispatch test — confirm inbox, not spam
- 6.2.2 Ingress QR scan latency test
- 6.2.3 Duplicate scan test
- 6.2.4 Dead-phone PIN fallback test
- 6.2.5 VIP Telegram alert test (≤3s)
- 6.2.6 Visual wall real-time test
- 6.2.7 Offline resiliency test (cut connection mid-test, verify auto-sync)

**6.3 Story — Triage**
- 6.3.1 Log every failure with exact repro steps as it happens
- 6.3.2 Fix and re-test only the failing paths (don't re-run the full battery per fix)

### 🔴 QA Gate 4 — Beta Sign-off (highest-stakes gate before real people)
- ☐ All 7 battery tests passed with zero unhandled exceptions
- ☐ Zero duplicate check-ins recorded against the beta group
- ☐ No data collisions during the concurrent-scan portion of the drill

**Verdict:** Pass → proceed straight into Epic 7 hardening. Fail on any box → stop, do not touch production data, fix the specific failure, re-run only that failed test (not the whole battery) before advancing.

## 7. Epic: Production Hardening & Go-Live Prep (Sept 27-29)

**7.1 Story — Data & script lockdown**
- 7.1.1 Re-verify all 300 PINs unique/static, zero live formulas remain
- 7.1.2 Apps Script deployed with versioning enabled, ContentService.MimeType.JSON on all responses

**7.2 Story — Re-verification after beta fixes**
- 7.2.1 Re-run camera permission test on both OS/browser combos (only if Epic 3 code changed post-beta)
- 7.2.2 Re-check projector resolution (only if Epic 5 code changed post-beta)
- 7.2.3 Repeat the 5-concurrent-request load test on the production deployment

**7.3 Story — Production dispatch**
- 7.3.1 Production email send to all ~300 attendees, throttled
- 7.3.2 Print + laminate 2 copies of the master roster (D-6), stage at Usher Station 1 — **tool built 2026-09-20** (`roster-print.html`, 27 automated checks, viewed against the live 10-row roster); the printing itself waits for the final ~300-row roster with seats, and a real test print

### 🔴 QA Gate 5 — Definition of Done / Production Send Go-No-Go

This IS the source doc's Master DoD, run once, right before the irreversible step (sending 300 real passes).
- ☐ Schema & PIN lockdown confirmed
- ☐ Concurrency lock load-tested on production
- ☐ Audio & sensory feedback verified in noisy conditions
- ☐ Sub-3s latency confirmed on 4G/LTE
- ☐ Telegram dispatch operational, ≤3s
- ☐ Beta Simulation passed (QA Gate 4)
- ☐ Paper failsafe printed and staged

**Verdict:** All boxes checked → send production emails, proceed to Epic 8. Any box unchecked → do not send — a sent pass can't be recalled.

## 8. Epic: Event Day (Oct 2, 12:00 PM – 9:00 PM)

**8.1 Story — Pre-doors checks**
- 8.1.1 Arrive early, open scanner.html + display.html, confirm live connectivity
- 8.1.2 Test scan against a dummy row

**8.2 Story — Live monitoring**
- 8.2.1 Watch Apps Script executions/quota periodically
- 8.2.2 Apply the autonomous decision matrix for edge cases (scope creep → reject; lock contention → backoff; unlisted attendee → Secretariat desk, don't halt line; missing photo → monogram fallback)
- 8.2.3 If API degrades, ushers fall back to Offline Mode + paper roster without halting entry

**8.3 Story — Close-out**
- 8.3.1 At 1:00 PM cutoff, run PENDING-status filter for the no-show billing list
- 8.3.2 Post-event: export final Sheet as the audit-trail record

## Why QA sits at 5 gates, not 33 tasks

As solo developer, QA-per-task would just be you re-checking your own work twice, immediately, with no distance from it — that's not QA, that's double-authoring. QA earns its name when it's a distinct pass with a different question in mind ("does this meet the spec's contract" vs. "did I finish the task"), run at a point where failing actually changes what you do next.

That's why gates sit only where a real decision hinges on the answer:
- **Gate 1** — before anything else can be built on top of the API
- **Gate 2** — before the attendee-facing path is considered usable
- **Gate 3** — before you involve other people (the beta test)
- **Gate 4** 🔴 — before you commit to production hardening
- **Gate 5** 🔴 — before the irreversible step (sending 300 real passes)

The two 🔴 gates are the ones that actually block an irreversible action; treat those as non-negotiable stops. The 🔵 gates are checkpoints — worth doing, but if you're confident and time-pressed, you can compress them into a quick self-check rather than a formal pass.

Every story/task list above stays a build checklist, not a QA list — "done" there means built and self-tested inline, same as always.
