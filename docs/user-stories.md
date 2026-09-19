# User stories log

Status of every story as of 2026-09-19 (updated after the BUG-001 device verification). Vocabulary: **Done** = verified on live infra/device ·
**Built** = implemented and tested here, awaiting device/live verification · **Fixed (retest)** = bug fixed,
awaiting device retest · **Open** = logged, not built/fixed · **Not started**. Bugs live in [`bug-log.md`](./bug-log.md);
the Epic/Story/Task detail and the QA gates are in [`sprint-backlog.md`](./sprint-backlog.md).

## A. Product user stories (from the MVP planning docs)

| ID | Role | Story | Status | Evidence / gap |
|---|---|---|---|---|
| US-001 | Attendee | Receive an email pass with a clear QR, PIN and seat | **Done** | Beta send confirmed (Epic 2); QR = bare 5-digit code |
| US-002 | Entrance Usher | Scan passes in a phone browser and validate in under 3 s | **Built** | Works on device; false-duplicate bug **verified fixed**; phantom-decode fix awaiting retest; **≤3 s not yet demonstrated** (BUG-006) |
| US-003 | Entrance Usher | Type a 5-digit PIN and see name + tier colour | **Done** | Verified on device (Gold/Blue card) |
| US-004 | Usher Lead | Instant Telegram alert when a VIP arrives (≤3 s) | **Built** | Code complete; needs bot token/chat ID + timing test (Epic 4) |
| US-005 | Attendee | See my arrival acknowledged on the projector wall | **Built** | `display.html` verified with mocked data; not run on a real projector |
| US-006 | Entrance Usher | Scanner keeps working when cellular drops | **Done** | Offline queue + roster-cached VIP ID confirmed on device |
| US-007 | Entrance Usher | Scan late arrivals until 09:00 PM | **Built** | No lockout in code; cut-off is administrative only; unverified end-to-end |

## B. Sprint-backlog stories

| Story | Title | Status | Notes |
|---|---|---|---|
| 1.1 | Schema & data population | **Done** | Real 13-column schema; credentials generated |
| 1.2 | Code.gs core logic | **Done** | checkin/sync/recent/roster; lock-protected; ping + GET check-in added |
| 1.3 | Deploy & self-verify | **Done** | Contract + 5-way concurrency test passed (QA Gate 1 passed) |
| 2.1 | QR & template generation | **Done** | |
| 2.2 | Throttling | **Done** | |
| 2.3 | Beta send & manual check | **Done** | One pass per test address |
| 3.1 | Camera scan core | **Fixed (retest)** | Duplicate guard verified on device (BUG-001); decode guard for phantom pop-ups awaiting device retest (BUG-003/004) |
| 3.2 | Feedback layer | **Built** | Louder audio + haptics added; noisy-room test (3.2.3) still open |
| 3.3 | Manual PIN fallback | **Done** | |
| 3.4 | Offline resilience | **Done** | Airplane-mode test passed |
| 3.5 | Cross-device pass (iOS + Android) | **Deferred** | Android only so far; iOS waived for Gate 2 by the user, owed before Gate 5 |
| 4.1 | Wire the live alert | **Built — not closed** | Code is done (4.1.2/4.1.3). 4.1.1 (bot + Script Properties) and 4.1.4 (alert timing) are yours and unverified; the live server still runs the old `Code.gs`, so the current code isn't deployed |
| 5.1 | Build the wall | **Built** | One card per person, survives refresh, loading state (BUG-010/011) |
| 5.2 | Stability & display testing | **Not started** | 30-min soak and real 1080p/4K pending |
| 6.1 | Staging setup | **Built (tooling)** | `auditRoster()` and `resetTestCheckins()` added; populating the real roster is user-side |
| 6.2 | 7-test battery with CCO Councilmen | **Prepared** | Step-by-step runbook + pass criteria in `beta-runbook.md`; needs people and phones |
| 6.3 | Triage | **Prepared** | Triage log template in `beta-runbook.md`; failures go to `bug-log.md` |
| 7.1 | Data & script lockdown | **Built (tooling)** | `auditRoster()` flags duplicate/malformed PINs and live formulas; versioned deployment is a manual check |
| 7.2–7.3 | Re-verification, production dispatch | **Not started** | |
| 8.1–8.3 | Event day: pre-doors, live monitoring, close-out | **Not started** | |

QA gates: **1 passed** · **2 passed with waiver** (iOS deferred by the user; see `bug-log.md`) · 3 next (needs Telegram credentials + real-projector check) · 4, 5 not reached.

## C. Stories added from this round of device feedback

| ID | Story | Bug | Status |
|---|---|---|---|
| US-B01 | As an usher, I want one scan to produce exactly one result card, so a good check-in is never followed by a false "already checked in". | BUG-001 | **Done** (verified on device) |
| US-B02 | As an usher, I want no new scan to start while a result card is on screen unless I've turned on fast mode, and fast mode to reset each session. | BUG-002 | **Fixed (retest)** |
| US-B03 | As an usher, I want the scanner to stay silent unless a real pass is scanned, so I'm not alarmed by phantom pop-ups. | BUG-003, BUG-004 | **Fixed (retest)** — decode guard + hard-coded test corpus |
| US-B04 | As an usher, I want an unclear server reply to be handled automatically (retry, then save offline) without seeing raw error text. | BUG-005 | **Built** (root cause unproven) |
| US-B05 | As an usher lead, I want to see how long each check-in takes, so I can confirm the 3 s target on real devices. | BUG-006 | **Built** (Connection log records ms); target unproven |
| US-B06 | As the project lead, I want to audit the roster before the beta and before go-live (unique fixed PINs, no live formulas, complete rows), so I don't send 300 passes with a bad row. | — (Epic 6.1 / 7.1) | **Built** — `auditRoster()` |
| US-B07 | As the project lead, I want to reset just the beta rows between test rounds, safely, so I can repeat a failing test. | — (Epic 6.3) | **Built** — `resetTestCheckins()` (max 30 codes, explicit list) |
| US-B08 | As the project lead, I want a step-by-step beta runbook with pass criteria and an evidence trail, so the 7-test battery is repeatable. | — (Epic 6.2) | **Built** — `beta-runbook.md` |
| US-B09 | As an usher lead, I want every scanner to be named before it can scan, so each check-in is attributable to a station. | BUG-007 | **Fixed (retest)** — mandatory in-page gate |
| US-B10 | As an usher, I want only a pass held inside the on-screen frame to scan, so stray QR codes in view don't check anyone in. | BUG-008 | **Fixed (retest)** — verified with a fake-camera test |
| US-B11 | As an usher, I want every result card to say which pass it's about and to see when a check is still in progress, so a late card is never a mystery. | BUG-009 | **Built** — pass code on cards, "Checking…" chip, 8 s timeouts |
| US-B12 | As an attendee, I want to appear on the projector wall once, even if I'm checked in again during testing. | BUG-010 | **Fixed (retest)** |
| US-B13 | As the Secretariat, I want the wall to survive a browser refresh without going blank or losing arrivals. | BUG-011 | **Fixed (retest)** |
