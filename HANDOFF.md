# Handoff — CCOnklusyon Registration & Check-in System

Written 2026-09-19, updated after the Epic 4/5 build in a local session, for whoever/whatever
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
  offline queue + auto-sync, tier-colored result cards, battery-saving camera toggle, roster-cache
  offline VIP ID (**confirmed working on a real device**), scan-buffer fix, and — after device
  feedback — a fixed-height layout (nothing below the fold), louder audio, haptics (Android),
  auto-dismissing cards and a settings sheet. See the Sept 19 `CHANGES.md` entries.
- **Epic 4 — Telegram VIP Alert** (`apps-script/Code.gs`). Code complete: real `sendMessage` call with
  the spec's template, sent after the script lock is released, failures logged not thrown. **Blocked
  on credentials** — see "Do next" below.
- **Epic 5 — Projector Wall** (`display.html`, repo root). Built to spec (4 s polling, hero + grid,
  Gold/Blue cards, monogram/typographic fallbacks, reconnect state). Layout verified with mocked
  data at 1080p and 4K; not yet run against the live sheet on a projector.

## Do next (user-side — nothing here can be done from a Claude session)

0. **URGENT — the live server is still the OLD `Code.gs`** (`?action=ping` → "Unknown action." on 2026-09-19). Until it is redeployed the scanner's GET retry
   and lost-reply recovery can't work and "unconfirmed" cards keep appearing. Then, after a bad run, **Settings → Connection log → Copy** and send it.
0. **Redeploy `Code.gs`** (adds `auditRoster`, `resetTestCheckins`, GET check-in, `ping`), then run `auditRoster` in the editor and
   fix any ERRORS. Then follow `docs/beta-runbook.md` (Epic 6) once Telegram is provisioned.

1. **Redeploy `Code.gs`**: paste `apps-script/Code.gs` into the Apps Script project, then
   **Deploy → Manage deployments → pencil/edit → Version: New version → Deploy**. (Never "+ New
   deployment" — it mints a new URL and strands `scanner.html`/`display.html`. See `AGENTS.md`.)
2. **Provision Telegram** (Story 4.1.1): create a bot via @BotFather, add it to the usher leadership
   group as admin, get the group's `chat_id`, and paste both into **Project Settings → Script
   properties** as `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. Never paste them into chat or the repo.
3. In the editor run `testTelegramPing()`, then `testVipAlertTemplate()` (logs round-trip ms), then
   check in a VIP test row from the scanner and time the alert (target ≤ 3 s).
4. **Device-test the new scanner** on real phones: camera still decodes with the full-screen preview,
   audio is loud enough, vibration works (Android), the switch/buttons fit on your smallest phone.
5. **Open `display.html`** on the Secretariat laptop (F11) and check a few rows in from the scanner —
   arrivals should appear within one 4 s poll. Then QA Gate 3 and the 30-minute long-run (5.2.2).
6. Epics 6-8 (Beta Simulation, Production Hardening/DoD, Event Day) — per `docs/sprint-backlog.md`.

## Open items

- **QA Gate 2: passed with waiver** (iOS deferred). New device reports were fixed test-first and **all need a phone/laptop retest**: BUG-003/004 (phantom pop-ups),
  BUG-007 (station gate — clear site data, it must appear before the camera), BUG-008 (only scans inside the frame), BUG-009 (pass code on cards, "Checking…" chip),
  BUG-010/011 (wall: one card per person, survives refresh). See `docs/bug-log.md`. Run `node tests/run.js` and `node tests/camera.js` before any push.
- **Epic 4 is not closed**: code done, but 4.1.1/4.1.4 unverified and the deployed script is old.
- **"Unknown action." on the first scan — mitigated, root cause unproven.** Hardening + a Connection log
  shipped (see the Sept 19 `CHANGES.md` entry). Needs: redeploy `Code.gs`, then the 10-scan trial in
  `tests/README.md`. If the log confirms a POST→GET downgrade, flip check-in to GET-primary.

- Still untested on Epic 3: bogus/invalid code via the camera (only tested via manual entry so far),
  noisy-room audibility (Story 3.2.3), and the iOS Safari + Android Chrome pass (Story 3.5).
- `qrbox` was removed from the scanner (whole frame is decoded). If scanning feels slower or less
  reliable than before on a low-end phone, that's the first thing to revisit.
- `CONFIG.API_BASE` in **both** `scanner.html` and `display.html` points at the Version 4 deployment
  (`.../AKfycbyUZywdnh62McTK-FJwHlu5ltnrzWI6dnc1v1HMxNwG2PPM1vJO-xsXCz5T-rNrVPVi/exec`) — confirm this is
  still the deployment in use before debugging anything that looks like a connectivity issue.
- Load note: the wall polls every 4 s (~8,100 executions over a 9-hour day) plus scanners and the 20 s
  roster poll. The spec's 20,000/day figure is for *outbound* URL Fetch calls (Telegram), which polling
  doesn't use — polling costs Apps Script execution time instead. Watch the Executions dashboard during the
  Epic 6 beta, and only leave the wall open during the event window, not overnight.

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
