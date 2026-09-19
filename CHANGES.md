# Changes & Decisions Log

Reverse-chronological. One entry per meaningful change or correction — not a commit log,
a decision trail so "why is it like this" never needs re-asking.

---

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
