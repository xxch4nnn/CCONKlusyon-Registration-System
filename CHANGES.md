# Changes & Decisions Log

Reverse-chronological. One entry per meaningful change or correction — not a commit log,
a decision trail so "why is it like this" never needs re-asking.

---

## 2026-09-19 — Git push access, README, scanner UI/UX and offline-VIP fixes
**By:** user (device testing + feedback) + Claude
**What:** first round of real-device feedback on `scanner.html`, plus repo access follow-up:
- **Git access confirmed still blocked.** Session's git-push proxy has injected credentials
  (`GH_TOKEN`) but this repo isn't in the session's authorized repository set — retried `git
  push` and got the same 403 as before. User is uploading directly via GitHub's web UI instead;
  this workflow (Claude hands off files, user commits) continues until repo access is granted.
- **README.md written** — was a placeholder (repo name only). Now covers what's here, how to
  deploy a change, and current status, linking to `AGENTS.md`/`CHANGES.md`.
- **`CLAUDE.md` restored** — missing from the user's GitHub upload (only `AGENTS.md` was
  uploaded); re-added as the thin pointer `AGENTS.md` already expects to exist.
- **Horizontal scroll on phone fixed.** `html5-qrcode` sets pixel width/height directly on the
  injected `<video>`/`<canvas>`, which can exceed the container on some devices. Forced both to
  `width: 100% !important; height: auto !important`, added `overflow-x: hidden` on `html`/`body`,
  and switched the button row to a `grid` (wraps cleanly instead of overflowing once a 3rd/4th
  button is added).
- **Offline VIP identification gap fixed.** Reported problem: with no connection, a queued scan
  showed only a generic "no connection" message — no name, no tier — which defeats the door's
  primary job of spotting VIPs fast. Added a new read-only `GET ?action=roster` endpoint to
  `Code.gs` (full attendee list minus `email`) that `scanner.html` fetches and caches in
  `localStorage.cco_roster_cache` while online (on load, on reconnect, every 5 min). An offline
  scan now looks the code up in that cache first: if found, shows the normal tier-colored card
  (Gold/Blue) with name/designation/table so a VIP is still visually identifiable, labeled
  "OFFLINE — QUEUED" instead of "CHECKED IN" (or a duplicate-suspicion variant if the cached
  status was already "Checked-In" as of the last sync); only falls back to the old generic
  "can't identify, check paper roster" message if the code isn't in the cache at all (e.g. very
  first scan before any sync has happened). The actual check-in write is still queued and
  confirmed later via `/api/sync` either way — this only fixes what the usher sees in the moment.
- **Battery-saving camera toggle added.** New "Turn Camera Off" button (`Html5Qrcode.stop()`/
  `.start()`), independent of manual entry — an usher who's mostly doing manual/offline entry,
  or taking a break, can kill the live camera + decode loop without losing check-in capability.
- **Duplicate-scan UX pass verified working** on a real device (both fresh and duplicate scans
  tested via camera) — no further change needed there.
**Impact:** `Code.gs` gained one new read-only GET action (`roster`) — no write behavior change,
no schema change. `scanner.html` gained the roster cache layer and camera toggle; existing
check-in/offline-queue/sync logic unchanged.
**Not yet tested:** bogus code via camera, airplane-mode-mid-scan with the new roster-identified
offline card, noisy-room audibility. Still the Epic 3 device-testing checkpoint.

## 2026-09-19 — File restructuring reviewed, no move needed yet
**By:** Claude, on request
**What:** user asked whether the repo should be restructured (currently flat: `Code.gs`,
`EmailBlaster.gs`, `scanner.html`, docs, all at root — from a direct GitHub web upload rather
than a scripted commit).
**Decision:** leave it flat for now. Only two backend files exist; moving them into an
`apps-script/` folder buys nothing yet and GitHub Pages already serves `scanner.html` cleanly
from root. Revisit once Epic 4 (Telegram) or Epic 5 (`display.html`) adds enough files that a
flat root gets noisy — noted in `AGENTS.md` so it isn't forgotten, not acted on preemptively,
per "improvise only when necessary."

## 2026-09-19 — Scanner UX pass: smoother flash, stronger duplicate-scan indicator
**By:** user (feedback from manual-input testing) + Claude
**What:** manual PIN testing surfaced two UX issues before any camera/device testing began:
1. The full-screen state flash was an abrupt on/off strobe (flat color, 120ms).
2. DUPLICATE and SUCCESS looked too similar at a glance — same card layout, only the message
   text and an incidental color swap distinguished "already checked in" from a fresh check-in,
   which is a genuine UX risk when a usher is scanning quickly under time pressure.
**Fix:**
- Flash is now a soft radial pulse (fade in 160ms, hold, fade out 420ms with easing) instead
  of a hard strobe.
- DUPLICATE now renders with its own fixed amber bar (independent of the attendee's tier
  color), a warning icon, a one-shot pulse-ring animation around the card border, and a
  distinctly styled "First checked in: <timestamp>" chip — reads as unmistakably different
  from SUCCESS even at a glance, not just a color swap.
**Impact:** cosmetic/UX only — no change to the check-in logic, API calls, or data written.
**Verified:** confirmed working on a real device (camera scan) in the next round of testing.

## 2026-09-19 — Epic 3 (Usher Scanner PWA) built, stopped at device-testing checkpoint
**By:** Claude, against Sprint Backlog Stories 3.1-3.4 (Camera scan core, Feedback layer,
Manual PIN fallback, Offline resilience).
**Built:** `scanner.html` — single-file, zero-build, deployable as-is via GitHub Pages:
- 3.1 Camera scan core: `html5-qrcode` via jsdelivr CDN (per spec — "via CDN" is explicit in
  3.1.1), `facingMode: "environment"`, wired to live `POST /api/checkin`, 2.0s scan-freeze
  debounce, feature-detected flashlight toggle (`getRunningTrackCameraCapabilities().torchFeature()`,
  button stays hidden on devices/browsers without torch support instead of erroring).
- 3.2 Feedback layer: Web Audio tones (800→1200Hz success sweep, flat 440Hz duplicate, 200Hz
  error buzz), full-screen Green/Amber/Red flash, tier-colored result card (reuses the
  spec-locked Gold/Blue from AGENTS.md).
- 3.3 Manual PIN fallback: numeric input + Validate button, calls the same `submitCheckin()`
  path as a camera scan so behavior (tones, flash, modal) is identical either way.
- 3.4 Offline resilience: on `fetch` failure, the scan payload is queued in
  `localStorage.cco_offline_scans` instead of blocking entry; "Offline Mode" banner shows
  whenever the queue is non-empty or `navigator.onLine` is false; auto-flushes via
  `POST /api/sync` on the browser's `online` event and every 15s as a fallback, using the
  already-live `handleSync_` endpoint from Code.gs (Epic 1) — no backend change needed.
**Deviation (documented, not silent):** stories 3.1-3.4 specify an offline *queue*, not a fully
installable PWA — no `manifest.json` or service worker was added, since neither is in the
backlog for this epic and adding one would be scope creep beyond what was asked. Revisit only
if the user explicitly wants "Add to Home Screen" installability later.
**Roadblock (mandatory per-epic stop):** camera access, physical scanning, flashlight, audio
on a real device, and QA Gate 2's manual checks (curl contract tests already covered by Epic 1;
3.2.3 "test audibility in a noisy room"; offline drop/reconnect test) all need a real phone/
tablet and the live `/exec` URL — none of which Claude can execute. `CONFIG.API_BASE` in
`scanner.html` is already set to the same deployment Code.gs was contract-tested against; no
edit needed unless the deployment URL changes.

## 2026-09-19 — Beta test mode: round-robin replaced with one-sample-per-address default
**By:** user (reported confusing behavior) + Claude
**What:** first live beta run of `sendEventPassesBetaTest()` sent each test address several
passes for *different real attendees* (round-robin across all 10 rows via `idx % N`). Reported
by the user as unexpected — looked like a bug (wrong-name emails), not a feature.
**Root cause (by design, not a defect):** test mode intentionally ignores each row's real email
and cycles rows across the test addresses so a handful of test inboxes can preview every row's
rendering without emailing real attendees. Production mode (`sendEventPasses(false, [])`) was
never affected — it always sends each row to that row's own real email, one-to-one.
**Fix:** added a `sampleOnly` option to `sendMailBlast_`/`sendEventPasses`, defaulted to `true`.
`sendEventPassesBetaTest()` now sends exactly one pass per test address (first N rows, N = number
of test addresses) — no round-robin, one email per inbox. The old round-robin behavior is kept
as `sendEventPassesBetaTestFull()` for when every row's rendering genuinely needs eyeballing.
`sendCustomBlast()` got the same `sampleOnly` parameter for consistency.
**Impact:** no schema/API change. Documented here so "why did my test inbox get 4 emails" never
needs re-asking if `sendEventPassesBetaTestFull()` is used deliberately later.
**Verified:** user re-ran `sendEventPassesBetaTest()` after the fix — one pass per test address,
as intended. Epic 2 / Story 2.3 (beta send) confirmed working end-to-end on live infra.

## 2026-09-19 — EmailBlaster.gs generalized into a reusable blast engine
**By:** user (requirement) + Claude
**What:** user needs the blaster for more than the invitation pass — reminders, schedule
changes, general announcements — not just a one-off script for Story 2.3.
**Change:** split `EmailBlaster.gs` into two layers:
  - **Generic engine** (`sendMailBlast_`, `renderTemplate_`, `genericFieldMap_`): any HTML/
    plain-text template with `{{header_name}}` placeholders matching real `Master_Attendance`
    columns verbatim, merged and sent with the same throttle/quota/skip logic. Exposed via
    `sendCustomBlast(subject, htmlTemplate, plainTextTemplate, testMode, testEmailOverrides,
    rowFilter?)` — no code change needed for a new announcement, and `rowFilter` allows
    targeting a subset (e.g. VIPs only).
  - **Invitation layer** (`buildInvitationFieldMap_`, `INVITATION_HTML_TEMPLATE`,
    `sendEventPasses`, `sendEventPassesBetaTest`): unchanged behavior, now built on top of
    the generic engine instead of duplicating the send loop.
**Impact:** no schema or API contract change. Still zero-build/zero-cost (MailApp only).
Still respects "stick with the spec" — the invitation pass is unchanged, this only adds a
reusable path for the non-invitation sends the user flagged as needed.

## 2026-09-19 — `email` column filled, Epic 2 blocker cleared
**By:** user
**What:** all 10 real `Master_Attendance` rows now have real USeP institutional email
addresses (`@usep.edu.ph`) in column A. This was the one confirmed gap blocking a
production send in `EmailBlaster.gs`.
**Impact:** `sendEventPasses(false, [])` can now run for real (each row already has both
`email` and `attendance_code`). `AGENTS.md` schema table updated. Story 2.3 (beta/verify
send) is still the recommended next step before a production blast — confirms rendering
and inbox placement across clients first, per the spec's usual go-live caution — but
nothing in the schema blocks going straight to production if the user chooses to.

## 2026-09-19 — Epic 2 (Email Pass Blaster) started, stopped at beta-send checkpoint
**By:** user (supplied HTML template) + Claude
**What:** user handed off a raw HTML email template built against a *different* schema
(placeholders `{{Bg_Color}}`, `{{Card_Tint}}`, `{{Seat_Number}}` don't exist as
`Master_Attendance` columns). Per "stick with the spec, improvise only when necessary":
kept the template verbatim, added a mapping layer instead of inventing new sheet columns —
`{{Bg_Color}}`/`{{Card_Tint}}` are derived from `ticket_type` using the spec-locked tier
colors (Gold `#B8860B`/VIP, Royal Blue `#1A56DB`/Regular) already defined in AGENTS.md;
`{{Seat_Number}}` maps to the real `table_allocation` column.
**Built:** `apps-script/EmailBlaster.gs` (now at repo root, see the restructuring-review entry
above) — `buildPassHtml_`, compulsory `buildPassPlainText_` fallback (anti-spam requirement),
`rowsAsObjects_` generic header-keyed row reader, throttled (1 send/2s) quota-aware
`sendEventPasses(testMode, testEmailOverrides)`, and a `sendEventPassesBetaTest()` entry point
for Story 2.3.
**Roadblock (mandatory per-epic stop, since resolved — see the `email` column entry above):**
the `email` column was blank on all 10 real `Master_Attendance` rows at the time, blocking a
production send.

## 2026-09-19 — Spec correction: `org_classification` and `photo_url` are nullable
**By:** user
**What:** the MVP spec implied all attendee fields are populated. In practice:
- `org_classification` is legitimately blank for VIP rows (university dignitaries, guest
  speakers, advisers represent the institution, not one student org).
- `photo_url` is legitimately blank for Regular Attendee rows — they fall back to typographic
  name cards or monogram avatars (`CONFIG.SHOWCASE_MODE`) instead of a curated photo, which only
  VIPs get.
**Impact:** Code.gs schema comments updated (no logic change needed — code already treated
blanks as falsy/optional). `CLAUDE.md` schema table updated. Epic 5 (display.html) must implement
the two showcase-mode fallbacks when it's built.

## 2026-09-19 — Deployment access misconfigured ("Only myself" instead of "Anyone")
**By:** Claude (diagnosis) + user (fix)
**What:** contract-testing `POST /api/checkin` against the live `/exec` URL returned a generic
Google "Page Not Found" page instead of JSON. Root cause: the active deployment's "Who has
access" was set to "Only myself," so unauthenticated requests (from ushers' phones, from curl)
hit a login wall that renders as a generic error page rather than a clean 403.
**Fix:** redeploy with "Who has access: Anyone." No code change.
**Note for future debugging:** this failure mode (valid-looking 302 redirect, then a Drive-branded
"Page Not Found" HTML page instead of JSON) is the signature of an access-restricted Apps Script
deployment, not a code bug. Check deployment access settings before debugging Code.gs logic.

## 2026-09-19 — Real Master_Attendance schema confirmed, Code.gs rebuilt against it
**By:** user (provided real schema) + Claude
**What:** the MVP spec describes an idealized A-L column layout. The real `Master_Attendance` tab
(workbook `1memjsk0qCcFqAdL5yMXAYU0iFf5OkGk1cwg0e56FbOY`, gid=155323925) uses a different 13-column
order and swaps `seat_allocation` for `table_allocation`. Code.gs targets the real sheet.
**Impact:** full schema documented in `CLAUDE.md`. `generateCredentials()` added to fill
`attendance_code`/`qr_code_url` for the 10 existing test rows (CCO Councilmen), since those were
blank. Confirmed real gap: `email` is blank on all 10 rows — blocks Epic 2 until filled.

## 2026-09-19 — Apps Script Run-dropdown gotcha
**What:** a top-level function named with a trailing underscore (`generateCredentials_`) is
treated as private-by-convention and hidden from the editor's Run-function dropdown — not a save
or syntax issue. Renamed the manual entry point to `generateCredentials` (no underscore); internal
helpers (`handleCheckin_`, etc.) intentionally keep the underscore.

## 2026-09-19 — Epic 1 (Backend Gateway) started
Stories 1.1 (schema/credentials) and 1.2 (Code.gs core: doPost/doGet, LockService, VIP Telegram
stub) built and handed off as files. Story 1.3 (deploy/verify) is user-side — Claude has no Apps
Script execution access.
