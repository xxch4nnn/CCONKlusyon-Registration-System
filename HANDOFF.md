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
- **Epic 5 — Projector Wall** (`display.html`, repo root). Three tabs since 2026-09-20: **Spotlight** (audience view, one attendee at a
  time — Stage 2 §6.5), **Recent** (everyone, newest first) and **Attendance** (secretariat: counts, bar, per-club). 4 s polling, Gold/Blue cards, `SHOWCASE_MODE` 1|2|3,
  reconnect state. Layout verified with mocked data at 1080p; not yet run against the live sheet on a projector.
  The Attendance tab groups by club, not Stage 2's org cluster (the roster has no `org_classification`). `MAX_TILES` is 400, not Stage 2's ≤32 (Recent lists everyone) — see `CHANGES.md`.

## Stage 3 exit tracker (added 2026-09-21) — scope is Stage 3 ONLY

Stage 3's exit gate hands off *to* Stage 4; Epic 6 (beta), Epic 7 (hardening) and Epic 8 (event day) are Stage 4 and are **not started** until Stage 3 reports COMPLETE and you say go.
**Status today: INCOMPLETE.** Stage 3 exit DoD (build plan §13.4):

| # | Exit DoD item | Owner | State |
|---|---|---|---|
| 1 | All ~300 credentials in `Master_Attendance` frozen (static PINs + QR URLs) | you (roster) → `generateCredentials` | ⏳ only 10 test rows; waiting on the council's final roster |
| 2 | Bulk email merge run, spam-greylisting checked across institutional accounts | you | ⏳ one address per provider spot-checked only |
| 3 | Secretariat laptop + HDMI stage-switcher handshake certified | you | ⏳ `display.html` verified against mocked data only |
| 4 | Two paper rosters printed, laminated, staged at Usher Station 1 | you | ⏳ `roster-print.html` built; print waits on item 1 |

Component/integration verification (§13.1/13.2 — still Stage 3):

| Step | What | Owner | State |
|---|---|---|---|
| a | BUG-012 live redeploy | — | ✅ live is Version 6 / `2026-09-20.1` (probed 2026-09-21) |
| b | Access-key rollout (item 0 below, exact order) | you (Claude can check `ping` output) | ⏳ not started |
| c | Device-retest BUG-003/004/007/008/009/010/011 on iOS Safari + Android Chrome | you | ⏳ (iOS also owed to Gate 5) |
| d | Time a real VIP alert end-to-end, target ≤ 3 s (Story 4.1.4, `vipAlertReport`) | you | ⏳ |
| e | `display.html` on real 1080p/4K hardware (doubles as exit-DoD 3) | you | ⏳ |
| f | QA Gate 3 (`docs/sprint-backlog.md`) as one formal pass, once a–e pass | Claude drafts, you confirm | ⏳ |

Stop at Stage 3 COMPLETE / INCOMPLETE / BLOCKED and wait for a go-ahead before any Stage 4 work.

### Formal Stage 3 decision (2026-09-26, cross-checked against an external exit-checklist template)
**Decision: YELLOW — conditionally ready to test, once tested.** No P0/P1 implementation defect; core paths (checkin/sync/recent/roster, offline queue, VIP alert code, name search, access key) exist and pass `node tests/run.js` + `tests/camera.js` (rerun today, all green). What's missing for GREEN is entirely in row a-e above (device retests, timed alert, real hardware) plus a real roster — none of it a code defect.
**Release candidate:** local git tag `stage3-rc-2026-09-26` at commit `2d13970` (**not pushed** — ask before pushing tags). Re-tag after any further code change; don't let QA test a moving target.
**Schedule risk (the actual finding, not the checklist):** the original Sept 13 plan (`docs/private/sdlc-stage3-implementation.md` §5.1) put **today, Sept 26, as "VIP Roster Freeze"** and Sept 27 as "Production Bulk Email Dispatch" — 6 days before the Oct 2 event. As of this check the sheet still has 10 test rows, the access-key rollout (step b) hasn't started, and no device retest has happened since Sept 20. All four exit-DoD items above are unmoved since the Sept 21 tracker. If the roster isn't final soon, the Sept 27 email date and the Oct 2 date both come under pressure — this is worth flagging to whoever owns the timeline, independent of anything in this repo.

## Do next (user-side — nothing here can be done from a Claude session)

0. **ACCESS-KEY ROLL-OUT — zero downtime, in exactly this order.** (The live Version 6 ignores an extra `key` parameter — checked against the live URL — so devices can hold the key BEFORE the server starts enforcing it.
   Deploying the keyed backend first would lock every device out until they were all updated.)
   1. **Make the key.** Apps Script → Project settings → Script properties → add `API_KEY` = a long random string (24+ letters/digits, e.g. from a password manager). Adding a property needs no redeploy and Version 6 ignores it.
      **Never paste it in chat or the repo.** (`generateAccessKey` in the new `Code.gs` does the same job, but it isn't deployed yet.) — **⏳ still to do, as of 2026-09-26**
   2. ~~Push the frontend to GitHub Pages~~ — **✅ done and reverified 2026-09-26**: `scanner.html`, `display.html`, `roster-print.html` on GitHub Pages are byte-identical to this repo's `main`. Nothing changes for users yet: with no key stored the pages send none.
   3. **Give each device its private link:** `https://xxch4nnn.github.io/CCONKlusyon-Registration-System/scanner.html#key=<KEY>` for each phone; the same host's `display.html#key=<KEY>` once on the Secretariat laptop (the print page shares that laptop's storage). Everything keeps working —
      the pages now send the key and Version 6 simply ignores it. Delete the messages afterwards. — **⏳ blocked on step 1**
   4. **Then enforce it:** paste the current `apps-script/Code.gs` (`BACKEND_VERSION 2026-09-20.2`) → Deploy → Manage deployments → ✏️ → Version: **New version** → Deploy. Open `…/exec?action=ping&key=<KEY>` — it must show
      `"version":"2026-09-20.2"`, `"secured":true`, `"authorized":true`. Every device already holds the key, so the switch is invisible. — **⏳ blocked on steps 1 and 3**
   5. **Check:** no red dot on ⚙️ on any phone; Settings → Access key shows "ends …xxxx"; the wall says "Live"; `?action=roster` without a key now returns `UNAUTHORIZED`. A phone with a wrong/missing key says so plainly and keeps its scans.
   To rotate (e.g. after the event): edit the `API_KEY` property and re-issue links — no redeploy needed.
0. **Operator note for the wall:** open `display.html` on the Secretariat laptop, F11, leave it on tab **1** (audience view, clean); press **2** for the Recent list, **3** for the Attendance (secretariat) view, **1** to go back to the audience view.
   After a bad run: **Settings → Connection log → Copy** and send it. For any future `Code.gs` change: paste it, then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy** — never "+ New deployment"; bump `BACKEND_VERSION` and confirm `?action=ping`.

1. Telegram is provisioned and alerts arrive (Story 4.1.1 ✅). **Still to do (4.1.4):** check in a VIP test row from the scanner and time the alert with `vipAlertReport` (target ≤ 3 s).
4. **Device-test the new scanner** on real phones: camera still decodes with the full-screen preview,
   audio is loud enough, vibration works (Android), the switch/buttons fit on your smallest phone.
5. **Open `display.html`** on the Secretariat laptop (F11) and check a few rows in from the scanner —
   arrivals should appear within one 4 s poll. Then QA Gate 3 and the 30-minute long-run (5.2.2).
6. Epics 6-8 (Beta Simulation, Production Hardening/DoD, Event Day) — per `docs/sprint-backlog.md`.

## Open items

- **D-6 paper roster built (2026-09-20)**: `roster-print.html` (see `CHANGES.md`). Still to do: a real test print with the final ~300-row roster, then 2 copies at Usher Station 1 / the Secretariat desk.
- **Public PIN list — resolved (2026-09-20):** every data endpoint now needs the shared access key (see item 0 and `CHANGES.md`). Residual: anyone with the key or a keyed device can still read the roster; rotate `API_KEY` after the event. Not enforced on the live server until step 4 of the roll-out.
- **Name search** on the scanner (spec §1.4) is built and tested; device-test it with a dead-phone case (test 6.2.4 in the runbook).

- **QA Gate 2: passed with waiver** (iOS deferred). New device reports were fixed test-first and **all need a phone/laptop retest**: BUG-003/004 (phantom pop-ups),
  BUG-007 (station gate — clear site data, it must appear before the camera), BUG-008 (only scans inside the frame), BUG-009 (pass code on cards, "Checking…" chip),
  BUG-010/011 (wall: one card per person, survives refresh). See `docs/bug-log.md`. Run `node tests/run.js` and `node tests/camera.js` before any push.
- **Epic 4 is not closed**: code done and deployed (Version 6), Telegram works (4.1.1 ✅); 4.1.4 (a timed VIP alert through the deployed web app) is still unmeasured.
- **"Unknown action." on the first scan — mitigated, root cause unproven.** Hardening + a Connection log
  shipped (see the Sept 19 `CHANGES.md` entry). Needs: the 10-scan trial in
  `tests/README.md` against the now-current deployment (Version 6). If the log confirms a POST→GET downgrade, flip check-in to GET-primary.

- Still untested on Epic 3: bogus/invalid code via the camera (only tested via manual entry so far),
  noisy-room audibility (Story 3.2.3), and the iOS Safari + Android Chrome pass (Story 3.5).
- `qrbox` was removed from the scanner (whole frame is decoded). If scanning feels slower or less
  reliable than before on a low-end phone, that's the first thing to revisit.
- `CONFIG.API_BASE` in `scanner.html`, `display.html` and `roster-print.html` points at the deployment
  (`.../AKfycbyUZywdnh62McTK-FJwHlu5ltnrzWI6dnc1v1HMxNwG2PPM1vJO-xsXCz5T-rNrVPVi/exec`). The deployment ID is the same
  across Versions 4, 5 and 6, so this URL is the current one; it only changes if someone uses "+ New deployment".
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
