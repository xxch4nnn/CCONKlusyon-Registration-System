# User stories log

Status of every story as of 2026-09-19. Vocabulary: **Done** = verified on live infra/device ·
**Built** = implemented and tested here, awaiting device/live verification · **Fixed (retest)** = bug fixed,
awaiting device retest · **Open** = logged, not built/fixed · **Not started**. Bugs live in [`bug-log.md`](./bug-log.md);
the Epic/Story/Task detail and the QA gates are in [`sprint-backlog.md`](./sprint-backlog.md).

## A. Product user stories (from the MVP planning docs)

| ID | Role | Story | Status | Evidence / gap |
|---|---|---|---|---|
| US-001 | Attendee | Receive an email pass with a clear QR, PIN and seat | **Done** | Beta send confirmed (Epic 2); QR = bare 5-digit code |
| US-002 | Entrance Usher | Scan passes in a phone browser and validate in under 3 s | **Built** | Scanner works on device; **≤3 s not demonstrated** (BUG-006); false-duplicate bug fixed, retest pending (BUG-001) |
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
| 3.1 | Camera scan core | **Fixed (retest)** | Duplicate re-scan guard (BUG-001); full-frame decode under suspicion (BUG-003/004) |
| 3.2 | Feedback layer | **Built** | Louder audio + haptics added; noisy-room test (3.2.3) still open |
| 3.3 | Manual PIN fallback | **Done** | |
| 3.4 | Offline resilience | **Done** | Airplane-mode test passed |
| 3.5 | Cross-device pass (iOS + Android) | **Not started** | Blocks QA Gate 2 |
| 4.1 | Wire the live alert | **Built** | 4.1.1 (bot + Script Properties) and 4.1.4 (timing) are user-side |
| 5.1 | Build the wall | **Built** | |
| 5.2 | Stability & display testing | **Not started** | 30-min soak and real 1080p/4K pending |
| 6.1–6.3 | Beta simulation: staging, 7-test battery, triage | **Not started** | Blocked behind QA Gate 2/3 |
| 7.1–7.3 | Data lockdown, re-verification, production dispatch | **Not started** | |
| 8.1–8.3 | Event day: pre-doors, live monitoring, close-out | **Not started** | |

QA gates: **1 passed** · **2 not passed** (see `bug-log.md`) · 3, 4, 5 not reached.

## C. Stories added from this round of device feedback

| ID | Story | Bug | Status |
|---|---|---|---|
| US-B01 | As an usher, I want one scan to produce exactly one result card, so a good check-in is never followed by a false "already checked in". | BUG-001 | **Fixed (retest)** |
| US-B02 | As an usher, I want no new scan to start while a result card is on screen unless I've turned on fast mode, and fast mode to reset each session. | BUG-002 | **Fixed (retest)** |
| US-B03 | As an usher, I want the scanner to stay silent unless a real pass is scanned, so I'm not alarmed by phantom pop-ups. | BUG-003, BUG-004 | **Open** |
| US-B04 | As an usher, I want an unclear server reply to be handled automatically (retry, then save offline) without seeing raw error text. | BUG-005 | **Built** (root cause unproven) |
| US-B05 | As an usher lead, I want to see how long each check-in takes, so I can confirm the 3 s target on real devices. | BUG-006 | **Built** (Connection log records ms); target unproven |
