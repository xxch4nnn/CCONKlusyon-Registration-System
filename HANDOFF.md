# Handoff — CCOnklusyon Registration & Check-in System

Written 2026-09-19, end of a cloud-session build stretch (Epics 1-3), for whoever/whatever
picks this up next — most likely a local Claude Code session with GitHub push access, since
that's where write access to this repo currently works from.

**Read `AGENTS.md` first, in full.** It's the canonical rules file (non-negotiables, live
infra, schema, API contract, gotchas) and this handoff assumes it, rather than repeating it.
`CHANGES.md` is the full decision log if "why is it built this way" ever comes up — this doc
is only the top-level status snapshot.

## What's built and working (all deployed/tested live, not just written)

- **Epic 1 — Backend Gateway** (`apps-script/Code.gs`). `doGet`/`doPost` against the real
  `Master_Attendance` sheet. Contract-tested live: check-in (success/duplicate/not-found),
  5-way concurrent race test (LockService confirmed atomic), recent-arrivals feed, and — as of
  today — a `roster` read endpoint for offline VIP identification. **Complete.**
- **Epic 2 — Email Pass Blaster** (`apps-script/EmailBlaster.gs`). Generalized into a reusable
  blast engine (`sendCustomBlast`, any future announcement) plus the invitation-pass layer on
  top of it. Beta-tested live, one pass per test address, confirmed working. **Complete.**
- **Epic 3 — Usher Scanner PWA** (`scanner.html`, repo root). Camera scan, manual PIN fallback,
  offline queue + auto-sync, audio/visual feedback, tier-colored result cards, battery-saving
  camera toggle, roster-cache offline VIP ID, a scan-buffer fix (pauses while a result card is
  open, with an opt-out checkbox), and manual "Refresh roster" / "Sync now" buttons. **Built and
  live-testing on a real device — see Open Items below.**

## Not started yet

- **Epic 4 — Telegram VIP Alerts.** `notifyVipTelegram_()` is stubbed in `Code.gs` (silently
  no-ops if `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` aren't set) but never wired up for real —
  needs the bot token/chat ID provisioned (never share those in chat — paste directly into
  Apps Script Script Properties).
- **Epic 5 — Projector Wall** (`display.html`, not built). Feeds off the already-live
  `GET /api/recent` endpoint. Must implement the two showcase-mode fallbacks noted in the
  schema table (VIP curated photo vs. Regular Attendee typographic/monogram card).
- **Epics 6-8** — Beta Simulation, Production Hardening/DoD, Event Day — per the Sprint Backlog
  doc, not touched.

## Open items on Epic 3 (in progress when this session ended)

- Roster caching and the offline-mode banner were both broken by a **deployment URL mismatch**
  (redeploying via "+ New deployment" instead of "Manage deployments → edit → New version" mints
  a new `/exec` URL and silently strands `scanner.html`'s `CONFIG.API_BASE` on the old one — see
  `CHANGES.md`, Sept 19 entries, and the gotcha now documented in `AGENTS.md`). Just fixed and
  pushed; **not yet re-verified against a real airplane-mode test** — that's the next thing to
  confirm before calling Epic 3 done.
- Still untested: bogus/invalid code via the camera (only tested via manual entry so far), and
  audibility of the feedback tones in an actual noisy room (Story 3.2.3, QA Gate 2 checklist).
- `CONFIG.API_BASE` in `scanner.html` currently points at the Version 4 deployment
  (`.../AKfycbyUZywdnh62McTK-FJwHlu5ltnrzWI6dnc1v1HMxNwG2PPM1vJO-xsXCz5T-rNrVPVi/exec`) — confirm
  this is still the deployment in use before debugging anything that looks like a connectivity
  issue; if it's been redeployed again since, check `AGENTS.md`'s gotcha section first.

## Process notes worth carrying forward

- **Mandatory stop after every epic**, and stop on any roadblock — that's been the working
  rule the whole build; keep it unless told otherwise.
- **Spec is the default; deviate only when the live data/infra forces it, and log every
  deviation in `CHANGES.md`.** Real examples already in the log: `Master_Attendance`'s real
  13-column schema vs. the spec's idealized A-L, nullable `org_classification`/`photo_url` for
  VIPs, the roster endpoint added beyond the original spec to fix a real usability gap.
  Continue that discipline rather than silently reinterpreting the spec.
- **Never write to any Google Sheet directly** — all Sheet/Apps Script changes ship as files
  for manual paste-and-deploy, since Apps Script execution isn't reachable from any Claude
  session, cloud or local.
- Live infra credentials (workbook ID, `Master_Attendance` gid, deployment URLs) are all in
  `AGENTS.md` — don't ask for them again, read the file.

## What's being attached alongside this handoff

- The original MVP spec (Google Doc, handed off Sept 13 — this repo doesn't have a copy of it
  in `docs/`, so it should probably land there once attached: `docs/mvp-spec.md`).
- The Sprint Backlog & QA Gates doc (the `1.x.x`-numbered Epic/Story/Task backlog with the 5 QA
  gates) — cross-check Epic 3's story numbers (3.1-3.4) against `CHANGES.md` if picking up
  where this session left off.
