# Changes & Decisions Log

Reverse-chronological. One entry per meaningful change or correction — not a commit log,
a decision trail so "why is it like this" never needs re-asking.

---

## 2026-09-26 — Stage 3 formally scored (YELLOW); schedule risk flagged; local release-candidate tag
**By:** user (dropped two external, ChatGPT-authored SDLC framework docs with no accompanying request — an "SDLC position" memo and a generic Stage 3 exit checklist) + Claude
**What was done:** read both documents, confirmed they're generic templates (not project-specific facts), and cross-checked their checklist against the real repo state rather than transcribing it. Re-probed the live `/exec` URL (read-only): still Version 6, `2026-09-20.1`, key not enforced — **nothing on the live infra has changed since 2026-09-21**. Reran `node tests/run.js` + `tests/camera.js`: all green, repo clean.
**Decision:** Stage 3 = **YELLOW — conditionally ready**, using the new document's own GREEN/YELLOW/RED rubric (see `HANDOFF.md`). No code defect blocks it; every gap is a device test, a real roster, or the access-key rollout — all user-side.
**Release candidate:** created local git tag `stage3-rc-2026-09-26` at `2d13970` (**not pushed**, per the project's "only push when asked" rule).
**The actual finding:** the original Sept 13 plan (`docs/private/sdlc-stage3-implementation.md`) scheduled **today as the VIP Roster Freeze** and tomorrow as the production email dispatch, 6 days before Oct 2. The roster is still 10 test rows and none of the four Stage 3 exit-DoD items (added 2026-09-21) have moved. This is a schedule risk, not a build gap — flagged in `HANDOFF.md`, not something a Claude session can close.
**Not changed:** no code. Docs only (`HANDOFF.md`, this entry).

## 2026-09-21 — Stage 3 exit scoped; BUG-012 closed; exit tracker added to HANDOFF
**By:** user (pasted a Stage 3-only prompt: Stage 3 hands off *to* Stage 4, so Epic 6 beta / Epic 7 hardening / Epic 8 event day are out of scope until Stage 3 is COMPLETE) + Claude
**Audit (read-only, nothing deployed or changed on the live system):** the pasted prompt said the live Apps Script was stale (BUG-012). Probe of the `/exec` URL: `?action=ping` → `pong`, `"version":"2026-09-20.1"` = Version 6, same URL. BUG-012 is therefore resolved
(the repo's `2026-09-20.2` is the *keyed* backend and is deliberately not deployed until the access-key rollout step 4). The repo was clean and level with `origin/main` (`310a44e`).
**Change (docs only):** `docs/bug-log.md` BUG-012 → Resolved and the open-items line corrected; `HANDOFF.md` gains a **Stage 3 exit tracker** (the four exit-DoD items + the component/integration steps a–f, each with owner and state).
**Not changed / not claimed:** no code, no push. Everything in the tracker marked "you" needs a phone, the Apps Script editor, Telegram or hardware, which no Claude session can reach. Stage 3 status today: **INCOMPLETE** (not BLOCKED — the only hard block is the final roster for exit-DoD 1 and 4).
**Note:** `docs/audit-2026-09-20.md` is a dated snapshot and still says the redeploy is a Gate 3 blocker; left as written, superseded by this entry.

## 2026-09-20 — Shared access key on every data endpoint; name search on the scanner
**By:** user ("add a shared secret key. adapt surname search on the scanner.") + Claude
**Why (the "public PIN list" decision):** the `/exec` URL is in a public repo and the deployment is "Anyone", so `roster` handed every name and PIN to anyone with the URL, and a PIN alone could check anyone in.
**Backend (`Code.gs`, BACKEND_VERSION `2026-09-20.2`, test-first — 10 checks failed before):** `check-in` (POST + GET), `sync`, `recent` and `roster` require the key (query `key=` or POST-body `key`). Stored only in Script property `API_KEY`;
run **`generateAccessKey`** once in the editor (24 random characters, shown once in the execution log, never overwritten). **Fail closed:** no key configured → `KEY_NOT_SET`; missing/wrong → `UNAUTHORIZED`; nothing is read or written and no
Telegram alert is sent. Constant-pattern comparison; the key is never logged and never echoed. `ping` stays open and now reports `secured` and `authorized`, so a device can check its key without touching data.
**Devices:** the key arrives once through a private link ending `#key=…` (stored in `localStorage.cco_access_key`, then removed from the address bar) or, on the scanner, by pasting it in ⚙️ Settings → Access key (only the last 4 characters are ever shown).
The scanner, wall and print page share one origin, so a laptop opened once covers the wall and the print page.
**Scanner:** the key is added in `callApi`, the single request path. **A rejected key is never queued blindly** (previously an error reply would have looked like a lost connection: retry, queue, "will sync" — forever): one request, a card that says
"ACCESS KEY PROBLEM — NOT RECORDED", the scan is kept, ⚙️ gets a red dot and a specific warning (no key on this device / rejected / server has none), the offline queue and roster fetch stop hammering, and everything clears by itself once a request succeeds.
**Wall / print page:** send the key; a key problem is spelled out to the operator (tabs 2/3 status, Attendance tab, print page message) and shown to the audience only as the small dot. **Wall polling now has one guarded, resettable loop**
(timer handle + no overlapping polls) — found while adding tests: a stale back-off timer made an unrelated test order-dependent.
**Name search (spec §1.2A / §1.4, previously only PIN entry existed; test-first — 12 of 13 checks failed before):** the manual panel has a **Code / Name** toggle. Name mode searches the roster already cached on the phone: every typed word
must match, accents/punctuation/spacing ignored ("nino" finds Niño, "dela cruz" finds De La Cruz), word-start matches first, 8 shown plus "N more", VIP and "checked in" tags. Picking a name shows a **confirmation** (name, role, club, table) — nothing is sent until
"✓ Check in", so a stray tap can't check the wrong person in — then the ordinary check-in runs (server duplicate rules, offline queue and VIP identification all unchanged). Works offline. Code mode is untouched.
**Suite:** Apps Script pass, scanner 203 (66 new), fresh-install 42, wall 102, print 37; `camera.js` pass. **Mutation-checked** (23 broken copies across server, scanner, wall and print page — length-blind compare, unguarded roster/sync, fail-open, key echoed/logged/sent
nowhere, no retry guard, no confirm step, `innerHTML`, accents, row limit, wrong pass code…): 21 caught first time; the 2 survivors exposed real test gaps (a stale key error shown during a plain outage; a key problem worded as a connection problem) and are now caught.
**Rollout order matters (see HANDOFF item 0):** checked against the live Version 6 that it ignores an unexpected `key` parameter (roster/recent/ping all answer normally), so the zero-downtime order is: set `API_KEY` by hand → push the frontend → send each
device its `#key=…` link → only then deploy the keyed `Code.gs`. Deploying it first would lock every device out until each was updated.
**Not verified:** any of this on a real phone or against the live deployment (the live server is still Version 6, without the key). **Residual risk, stated plainly:** anyone holding the key (or a device that has it) can still read the roster; the key protects
against strangers who find the repo, not against a leaked link. Rotate it after the event by editing `API_KEY`.

## 2026-09-20 — Secretariat view added (tab 3 "Attendance"); "Council of Clubs and Organizations" confirmed
**By:** user ("Add the secretariat view"; confirmed the welcome-screen wording) + Claude
**What (test-first: 16 of 20 new checks failed before; wall suite now 84):** `display.html` gets a third tab, key `3`: **checked in / expected** in large type with a percentage and a progress bar, **VIP x / y**, **Regular x / y**,
**Not yet arrived**, and a **per-club breakdown** (alphabetical, `x / y` with a mini bar, green when a club is complete, club-less people last as "No club listed"). It refreshes the moment the tab opens and then with the existing 20 s roster poll;
a failed refresh keeps the last figures and says "Could not refresh — showing the figures from hh:mm:ss"; before the first answer it shows dashes and "Loading…", never zeros. The audience view (tab 1) carries none of it.
**Deviation (deliberate):** Stage 2 grouped the breakdown by org cluster (Academic / Socio-Civic / Executive VIPs), which needs `org_classification`. The roster feed doesn't carry it, and adding it means a `Code.gs` change + redeploy and more data on
the public endpoint, so the breakdown is **by club** — which is what "who is here / who is absent" needs anyway (spec §1.2B). Revisit if you want the cluster split.
**Privacy:** the tab keeps only club, ticket type and status from the roster — no names, PINs or emails are stored or shown (test T7). Club text is written with `textContent` (test T7: hostile text stays text).
**Mutation-checked** (7 broken copies — wrong percentage, no club merging, no refresh on open, failure wipes data, no empty guard, club-less sorted first, `innerHTML`): each failed the suite; one survived first (weak test data) and the test was strengthened.
**Suite:** Apps Script pass, scanner 137, fresh-install 42, wall 84, print 27; `camera.js` pass. Layout viewed at 1080p with a fictional 56-row roster. **Not verified:** a real ~300-row roster (scrolling of a long club list) and the live roster endpoint on this tab.

## 2026-09-20 — Version 6 verified live; audience view (tab 1) made clean and formal
**By:** user (Version 6 deployed 2:01 AM; "pressing 1 or 2 changes the tab, it shouldn't be shown in tab 1 — tab 1 is shown to all the audience, it must have high UX, clear and formal") + Claude
**Deployment:** `?action=ping` now returns `"version":"2026-09-20.1"` — the deployed script is the current `Code.gs`. D-3 is fully ✅ (Epic 4 timing test and `auditRoster` are the next user-side steps).
**Wall, tab 1 (test-first: 7 checks failed before, 61 pass now):** the header, tab bar, live indicator and counter are **not shown** on Spotlight — the stage is only the card or the welcome. Keys `1`/`2` still switch (the operator
tells the crew); the tab bar and status header appear only on Recent. The ambient screen is now a formal welcome ("Welcome to / CCOnklusyon 2026 / Council of Clubs and Organizations" — **confirm that wording**) instead of
"Next check-in will automatically spotlight"; a small event wordmark sits under the card. The card: serif name with balanced wrapping, a thin tier-coloured rule, role, club in small caps, and an "Assigned table" block. Connection trouble
is a small wordless amber dot on the stage (never "Reconnecting…" text); Recent still spells it out. Removed the idle-fade of the tab bar (no longer needed).
**Mutation-checked** (5 broken copies: header shown on stage, dot never shown / never cleared, operator wording back, tab attribute not set): each failed the suite. Layout viewed at 1080p; entrance animations still unverified on a real projector.
**Telemetry (Stage 2 Tab 3), for the record (built in the entry above):** a secretariat view — total checked in / expected (e.g. 142 / 300), a progress bar with a percentage, and a cluster breakdown (Academic Orgs / Socio-Civic / Executive VIPs as x / y (%)). The roster
endpoint has no `org_classification`, so only the count, bar and VIP/Regular split are possible without a backend change. Not built.

## 2026-09-20 — Wall reworked to two tabs (Spotlight + Recent); Version 5 live but not the current file; scanner detector gap closed
**By:** user (deployed Version 5; asked for "2 tabs: Recent showing all recency, and a Single-Attendee Spotlight"; "use recency instead of just because Stage 2 stated it") + Claude
**Deployment finding:** Version 5 (Sep 20 1:40 AM) is live — `?action=ping` → `pong`, GET check-in answers "Missing attendance_code." — **but the pong has no `version` field**, while the repo's `handlePing_` returns
`version: '2026-09-20.1'`. So the running script knows `ping` and GET check-in but predates the version marker; the cause isn't established from here. **Check:** paste the current `apps-script/Code.gs`, Deploy → Manage
deployments → ✏️ → New version → Deploy, then open `…/exec?action=ping` — it must contain `"version":"2026-09-20.1"` (the dialog's number is not the test).
**Scanner (test-first, B6: 3 checks failed before):** a `pong` with no `version` was treated as *current* ("backend ?", no warning) — exactly the state above. It now counts as outdated (red dot + warning).
**Wall (`display.html`, test-first: 20 of 21 new checks failed before):** two tabs — **Spotlight** (default; exactly one attendee at a time: name, role, club, table) and **Recent** (everyone, newest first — the previous
hero + grid, unchanged, *not* Stage 2's "last 16", by your instruction). Keys `1`/`2` (tab bar only on Recent — see the entry above). Spotlight rules (Stage 2 §6.5/§11.2): each arrival held 5 s (2 s when 3+ are waiting), a VIP jumps ahead
of waiting regulars, oldest-first within a burst, the last card stays until 30 s of quiet then the ambient welcome returns, people already checked in when the wall opens are **never replayed**, queue capped at 20 (dropped
people stay on Recent). `SHOWCASE_MODE` is now `1|2|3` per Stage 2/TC-DEV-018 (1 = VIP-only spotlight, 2 = regulars get a name card, 3 = regulars get a monogram); a photo-less VIP always gets a monogram.
**Deviations, all deliberate:** (1) **No Tab 3 (telemetry dashboard)** — you asked for two tabs and Stage 3 §16 marks it P2 "DEFER / DROP"; the header still shows checked-in / total. (2) **`MAX_TILES` stays 400, not ≤32** —
Stage 2 §11.2 / Stage 3 §8.5 cap the DOM at 32 nodes, but the Recent tab must list everyone (~300); the spotlight DOM is exactly one card, and the store/queue stay bounded. (3) **Default `SHOWCASE_MODE` = 3**, which reproduces the
previous look (monograms) — Stage 2's recommended default is 2; flip one number to change it.
**Suite:** Apps Script pass, scanner 137, fresh-install 42, wall 51 (33 new), print 27; `camera.js` pass. Mutation-checked (7 broken copies — replay on first load, no VIP priority, no queue cap, append-not-replace, no idle
return, newest-first order, Mode 1 ignored): each failed the suite. Layout viewed at 1080p with fictional data (animations disabled in the screenshot tool — headless virtual time freezes them).
**Not verified:** the 400 ms/600 ms entrance animations and the timing on a real projector, a real VIP photo in the spotlight, the 30-minute soak (5.2.2). Test with the beta (6.2.5/6.2.6).

## 2026-09-20 — D-6 paper failsafe roster built (`roster-print.html`, task 7.3.2)
**By:** Claude (user: "continue the development")
**Why this, why now:** the live `/exec` is still Version 4 (`?action=ping` → "Unknown action." re-probed this session), which blocks the redeploy-dependent items (Gate 3, timed VIP alert,
device retests). D-6 needs none of them — it only reads the `roster` endpoint, which **is** live in Version 4 (returned the 10 rows) — and it is required by spec §1.4 and Gate 5
("paper failsafe printed and staged"). **`Code.gs` deliberately untouched** so the undeployed backend delta does not grow.
**What:** `roster-print.html` (repo root, single file, zero-build). One `GET ?action=roster`; rows sorted by club (case-insensitive, club-less last under "No club listed") then name;
per person: blank tick box, name + designation, ticket (VIPs marked in words — paper is monochrome), seat (`0`/blank → "—", same rule as BUG-013), 5-digit PIN in large monospace. Header shows
counts and the generated time (so a stale copy is recognisable); print CSS keeps rows whole, repeats the header on every page, hides the toolbar, adds "Page N of M" where the browser supports
margin boxes. Ignores every field it doesn't print (no email). Load failure / server ERROR / empty roster each show a clear message instead of an empty printable sheet. Nothing is stored;
the page holds no attendee data, so the public repo stays clean.
**Tests (test-first — suite failed with a missing-file error before the page existed):** new suite `tests/print/` wired into `tests/run.js` (`--print <file>` to point at another copy):
14 cases / 27 checks, all pass. Mutation-checked against deliberately broken copies (no sort, `innerHTML`, seat 0 shown, no case-folding, no print CSS, swallowed server error): each failed the suite.
Not mutation-checked: P11 (email never rendered) — covered by design, since the page never reads `email`. Full suite: Apps Script pass, scanner 134, fresh-install 42, wall 18, print 27; `camera.js` pass.
**Verified visually** against the live 10-row roster (Edge headless): layout correct; a header tick-box artefact found there was fixed. **Not verified:** a real paper printout / page breaks across
a ~300-row roster (only 10 rows exist) and Chrome-vs-Edge margin-box page numbers — do a test print once the real roster is loaded.
**Needs you:** print only **after** the final seats/PINs are set (a paper copy does not update); 2 copies per spec, one at Usher Station 1 and one at the Secretariat triage desk. Treat the printout as
confidential — it lists every PIN. Publishing: the page is served from GitHub Pages once pushed, and anyone with the URL can load the same roster the `/exec` endpoint already exposes (see the
open security note in the session summary / HANDOFF).

## 2026-09-20 — Stale deployment diagnosed (Version 4); backend version check added
**By:** user (Manage-deployments screen + Executions log) + Claude
**Diagnosis:** the Executions log (`Sent in 474 ms (1 attempt(s))`) proves the editor holds the new code, but the deployment dialog still read **Version 4 · Sep 19, 5:08 PM** and the live
URL still answers `?action=ping` with "Unknown action." — the deployment was re-deployed **without choosing "New version"**, so the web app never moved. Also measured: Telegram round trip
**474 ms** (1 attempt) for a test alert.
**Change (test-first — 6 checks failed before):** `Code.gs` `BACKEND_VERSION = '2026-09-20.1'`, returned by `ping`; the scanner's `checkBackend()` shows a red dot on ⚙️ + a Settings warning when
a reachable server doesn't know `ping` (outdated), the version when current, and stays quiet when merely offline. Suite: Apps Script 64, scanner 134, fresh-install 42, wall 18.
**Parked/blocked:** device retests (user: not a QA gate), real roster + VIP photos (council still collecting). Epic 4: 4.1.3 and 4.1.4 still wait on a real redeploy.
**Bump `BACKEND_VERSION` whenever `Code.gs` changes**, so the scanner can tell you which version the phones are on.

## 2026-09-20 — Sprint-backlog audit; Epic 4 hardening (retry, timing log, seat 0, delayed-scan marker)
**By:** user (Telegram works; says Code.gs redeployed; nothing device-tested yet) + Claude
**Audit ([`docs/audit-2026-09-20.md`](../docs/audit-2026-09-20.md)):** read-only probes show the **new `Code.gs` is not live** (`?action=ping` → Unknown action), so the alerts in the
Telegram screenshot use the old template; GitHub Pages is current; the sheet has 10 rows with `table_allocation` = 0 everywhere and no VIP photos. QA Gate 3 is **not passed**
(blockers: real redeploy, timed VIP alert, wall latency). Epic 4: 4.1.1 ✅, 4.1.2 ✅, 4.1.3 ⚠, 4.1.4 ⏳.
**Epic 4 (`Code.gs`, test-first — 20 checks failed before, 63/63 pass now):** alert text built by `buildVipAlertText_` to the spec template ("Not yet assigned" for seat 0/blank; no empty
`()`; queued-offline scans marked); `notifyVipTelegram_` retries once (5xx, network error, 429 honouring `retry_after` ≤ 2 s; no retry on 4xx) and returns `{ok, attempts, ms, delaySec}`; a
never-throws guarantee so Telegram trouble can't fail a check-in; last 20 alert timings kept in Script property `VIP_ALERT_LOG` (no names) and summarised by `vipAlertReport()`; sync-path
alerts are marked delayed; `auditRoster` warns on seat 0.
**Scanner + wall:** unassigned seat (0/blank) no longer shows "Table/Seat: 0" / a seat pill (tests L6, W10). Suite: Apps Script 63, scanner 119, fresh-install 42, wall 18.
**Needs you:** a real redeploy (verify with `?action=ping`), then run `testVipAlertTemplate`, check in a VIP test row, run `vipAlertReport`.

## 2026-09-19 — Station gate, scan-only-inside-frame, card attribution, wall fixes (audit-first)
**By:** user (device reports) + Claude
**Reports:** station-name prompt missing on first run and not mandatory; a QR outside the scan box still scanned; a "duplicate" with no first card, 10/10 pop-ups, a
"May already be checked in" card while facing a wall; `display.html` showing duplicate cards; refreshing the wall "deleting all records". All logged as BUG-007…011.
**Audit first — read-only checks of the live system:** `?action=ping` → *Unknown action* ⇒ **the new `Code.gs` has never been deployed** (so the GET retry, lost-reply
recovery, `auditRoster`, etc. are not live). Pass 61765 was already Checked-In at 21:10:23. The sheet itself is intact (the wall only reads).
**Test infrastructure:** `tests/run.js` now runs four suites — Apps Script mocks, scanner (station preset), scanner **fresh install** (nothing saved), and the **wall** —
and `tests/camera.js` decodes real QR frames from a fake camera (`tests/camera/clips`, regenerate with `make-clips.py`). Each bug's tests were written and run
against the old code first: station gate 11/11 failing, card attribution 12/13, wall 6 failing, camera: outside-frame QRs scanned.
**Fixes:** `scanner.html` — mandatory in-page station gate; video sized to the stream aspect + `qrbox` = on-screen frame (scans only inside it); `PASS <code>` on every card,
"Checking <code>…" chip, request timeout 8 s, honest wording for unconfirmed replies. `display.html` — one card per person (update in place on re-check-in), full
re-read every 60 s to drop reset rows, sessionStorage snapshot restored instantly on refresh, "Loading arrivals…" state, counter follows the sheet.
**Results:** Apps Script 36/36, scanner 114/114, fresh-install 42/42, wall 17/17, camera 11/11. **None of it is device-verified yet.**
**Not fixed / blocked:** BUG-005 (unconfirmed replies) is unproven and blocked on the `Code.gs` redeploy plus your Connection log.
**Status of Epic 4:** code complete but **not closed** (4.1.1 and 4.1.4 unverified; deployed code is old).

## 2026-09-19 — BUG-001 verified; BUG-003/004 fixed test-first; Gate 2 passed with waiver; Epic 6/7 tooling
**By:** user (device result + go-ahead) + Claude
**Gate:** BUG-001 confirmed fixed on device. The user can't do the iOS pass right now, so **QA Gate 2 is recorded as passed
with a waiver** (iOS Safari deferred, owed before Gate 5) and development proceeds. Latency ≤ 3 s carried to Gate 5 / beta 6.2.2.
**BUG-003/004 (phantom pop-ups / alerts) — audit first:** built a committed, dependency-free test suite
(`tests/run.js`: Apps Script mocks in Node + `scanner.html` in headless Edge/Chrome against a scripted fake server, hard-coded
accept/reject corpus for pass codes). Run against the unfixed scanner: **14 of 57 checks failed** — any decoded text (noise, a
non-pass QR, a lone frame, flicker between codes) was submitted as a check-in and noise even delayed a real scan. The same
suite proved app timers and background sync are *not* the cause (idle-60 s and queued-sync tests passed).
**Fix:** `parsePassCode()` (10000–99999, optional `CCO-`), a stability gate (same decode 2× within 1.2 s), and a quiet
"Not a CCOnklusyon pass" hint + Connection-log line for stable non-pass QRs. Result: **101/101 scanner checks and 36/36 Apps Script
checks pass.** Trade-off: ~one extra camera frame before a pass registers. **Not yet retested on a phone.**
**Also found while building the suite:** a literal `</script>` inside a test string silently skipped a whole case file — the runner
now fails if any case file doesn't load.
**Epic 6/7 tooling (`Code.gs`, built test-first):** `auditRoster()` — read-only pre-flight audit (unique fixed 5-digit PINs, no live
formulas, valid ticket types/emails/QR URLs, completeness warnings; prints row numbers and field names only, no PII);
`resetTestCheckins()` — resets only the codes listed in Script property `TEST_RESET_CODES` (max 30, refuses malformed input).
**Docs:** `docs/beta-runbook.md` (the 7-test battery with steps, pass criteria and evidence), bug log / user stories / backlog updated.
**Needs:** redeploy `Code.gs` (new functions), then run `auditRoster`.

## 2026-09-19 — Device bug report logged; QA Gate 2 assessed (not passed); duplicate-scan bug fixed
**By:** user (device testing) + Claude
**Reported:** false "already checked in" card right after a good scan; scanning continuing while a card is
open; pop-ups while not scanning; alerts with no pass QR in view. Logged in [`docs/bug-log.md`](../docs/bug-log.md)
as BUG-001…004 (plus BUG-005 "Unknown action." and BUG-006 latency risk); all stories logged in
[`docs/user-stories.md`](../docs/user-stories.md).
**QA decision (per the rule: gate-explicit bugs block and get fixed, others are logged):** Gate 2 is **not
passed** — box 2 (duplicate correctly flagged) failed, box 5 (iOS + Android) was never done, box 1's
"under 3 s" isn't demonstrated. So development does not advance to the beta/Epic 6.
**Fixed (gate-explicit) — BUG-001/002:** the 2 s scan freeze expired before the server's 1.3–4.4 s reply and the
"card open" guard only turned true on reply, so the same QR still in frame produced a second request and a real
`DUPLICATE`. Now nothing new is accepted while a check-in is in flight (except different codes in fast mode), and
the same code is ignored for 6 s from when its answer arrives (survives auto-dismiss). The "keep scanning" switch,
which my settings rewrite had made persistent, is per-session again. Reproduced on the old code (one scan → two
requests) and passing on the new in a headless-browser test; **not yet confirmed on a phone.**
**Logged, not fixed — BUG-003/004:** phantom pop-ups/alerts. Suspected cause: my UI rewrite removed the fixed scan
box, so the whole frame is decoded (native BarcodeDetector) and any decode — noise or another QR — is submitted
without checking it looks like a 5-digit pass. Proposed fix is written up in the bug log and is the recommended next change.

## 2026-09-19 — "Unknown action." on the first check-in: audit, hardening, diagnostics
**By:** user (report) + Claude
**Symptom:** the first check-in scan often showed an error card reading "Unknown action…".
**Audit:**
- That text exists only in `Code.gs` (`doPost` when `body.action` isn't `checkin`/`sync`; `doGet` when
  there's no/unknown `?action=`). The scanner always sends a valid action, so the request that failed was
  almost certainly a POST that reached the script **as a GET with no parameters** (or without its body).
- Read-only probes of the live endpoint: an anonymous POST *does* reach `doPost` (bogus action →
  "Unknown action." via one 302 to `/macros/echo`), and a GET with no action returns the same text.
  Latency was 1.3–4.4 s, so this is not a cold-start failure. **So the fault depends on the phone's
  session/network path and could not be reproduced from here — root cause is NOT yet proven.** Leading
  hypothesis: a redirect that downgrades the POST to a GET for browsers carrying Google session state.
- Client weakness found: `submitCheckin` treated *any* failure (including a non-JSON HTML error page) as
  "offline", with no retry and no record of what the phone received. Also found: a scan queued while a sync
  was in flight was silently dropped when the queue was cleared.
**Changes (defense in depth — works whichever cause it turns out to be):**
- `Code.gs`: every request logs one line (visible in the editor's **Executions**); `doGet` accepts
  `?action=checkin&attendance_code=&device_id=` (safe to repeat: the duplicate check is atomic under the
  lock); `doPost` falls back to `?action=` / query fields when the body lacks them; new `ping` action;
  `DUPLICATE` now includes `checked_in_by`.
- `scanner.html`: all API calls go through `callApi()` (12 s timeout + classification: json / non-JSON /
  timeout / network). A check-in that doesn't get a definitive answer (`SUCCESS`/`DUPLICATE`/`NOT_FOUND`)
  is **silently retried once via GET**; if that also fails the scan is saved to the offline queue with a
  clear message — the raw server text is never shown. If a first attempt may have written before its reply
  was lost, the retry's "duplicate" is recognised as our own write (same device, written after the scan
  began) and shown as success. Sync falls back to per-item GET, keeps only items the server didn't confirm,
  and no longer drops scans made mid-sync. `ping` on load warms the container.
- **Diagnostics:** Settings → **Connection log** records the last 40 requests (method, status, whether it was
  redirected, final host/path, ms, outcome, error text; no attendee data, keys shortened) with Copy/Clear.
**Verification:** 17/17 mocked-Apps-Script checks (GET check-in, idempotent repeat, query-string fallback,
ping, unchanged routes) and 16/16 headless-browser scenarios against a scripted fake server (downgraded POST,
HTML reply, timeout, lost reply, busy lock, real duplicate, other-device duplicate, network failure, sync
fallback, sync race). Not verified on a phone.
**To close this out (user-side):** redeploy `Code.gs` (**Manage deployments → edit → New version**), then
do ~10 first-scans after idle on the affected phone. Read Settings → Connection log: a
`checkin POST → ERROR "Unknown action."` followed by `checkin GET retry → SUCCESS` proves the POST was being
downgraded, and the Executions dashboard will show a `doGet action=undefined` at that moment. If that's
confirmed, flip check-in to GET-primary (planned follow-up). If the log shows `NOT-JSON` or `TIMEOUT`
instead, that's the cause to chase.

## 2026-09-19 — Scanner UI overhaul + louder audio/haptics; Epic 4 wired; Epic 5 built
**By:** user (device feedback: offline mode confirmed working; layout overflow, weak audio) + Claude
**Scanner (`scanner.html`):**
- **Overflow fix.** Root cause: the page was a normal scrolling column (header wrapping to 3 rows +
  square camera + buttons + manual panel + checkbox) inside a `100vh` body, so on a phone the bottom —
  including the "Keep scanning…" checkbox — sat below the visible area. Rebuilt as a fixed-height
  `100dvh` shell: compact top bar, camera viewport that takes whatever height is left, and a bottom dock
  that is always on screen (safe-area aware). The keep-scanning control is now a switch in the dock.
  Header clutter (Refresh roster / Sync now / station rename / sound / haptics) moved into a settings sheet.
- **Camera** fills the viewport (`object-fit: cover`) with our own reticle + scan-line, and the reticle
  corners react to each result (green/amber/red/gold). The `qrbox` option was dropped — the whole frame is
  decoded — because a fixed-pixel qrbox assumes an uncropped video; QR-only formats + native
  BarcodeDetector enabled where supported.
- **Audio** made louder: square wave + octave harmonic, repeated beeps (double chirp / double buzz),
  compressor, Off/Normal/Loud setting (default Loud), and a distinct three-note VIP fanfare. Spec
  frequencies (800→1200 / 440 / 200 Hz) kept.
- **Haptics** via the Vibration API with distinct patterns (success, VIP, duplicate, error). Android
  only — iOS Safari doesn't implement it. Browsers ignore audio/vibration until the first tap, so a
  "tap once to enable" chip shows until then.
- **Dynamic UI:** result cards auto-dismiss (2.5 s; VIP 5 s; duplicates/errors never), with a countdown bar;
  VIP cards get a gold ring + star; session check-in counter; live connection dot; toasts for
  refresh/sync results; timestamps shown as times, not raw ISO strings.
**Epic 4 (`apps-script/Code.gs`):** Telegram alert wired for real, template exactly per spec ("Assigned
Seat", escort CTA). The send now happens **after** the script lock is released (previously it ran inside
the lock, so every scan waited on Telegram's HTTP round-trip). Failures are logged, never thrown; a
non-200 from Telegram is logged. Added `testTelegramPing()` and `testVipAlertTemplate()` (reports
round-trip ms). Mock-tested: SUCCESS/DUPLICATE/NOT_FOUND unchanged, alert fires after unlock.
**Epic 5 (`display.html`):** built to the spec — 4000 ms polling, hero (3 latest) + grid, Gold/Blue tier
cards with glow/badges, 300 ms fade/slide-up, monogram/typographic fallbacks, keyed DOM reuse, capped
DOM size, auto-drift when the grid overflows, "Reconnecting…" state that never blanks the screen.
Uses `recent` + the existing `roster` endpoint (for "N of total"); no backend change.
**Roadblocks (mandatory stop):** (1) Epic 4 needs the bot token + chat ID from the user, then a Code.gs
redeploy (**Manage deployments → edit → New version**). (2) Nothing here was run on real hardware — camera,
audio loudness, vibration, and the projector at 1080p/4K need device testing. Layout was verified in
headless Edge at 320-390 px, landscape, 1920x1080 and 3840x2160 with mocked data.

## 2026-09-19 — Handoff, MVP spec and sprint backlog extracted into the repo
**By:** user (supplied the docs) + Claude
**What:** added `HANDOFF.md`, `docs/mvp-spec.md` (Part 1 client + Part 2 technical, from the
Project Management dossier .docx) and `docs/sprint-backlog.md` (from `Sprint Backlog & QA
Gates.docx`). Google Docs equation images (times, limits, PHP amounts) don't survive a plain text
export, so they were read from the embedded images and restored; a few were cropped in the source
and inferred from context.
**Public-repo scrub:** the repo is public and the dossier names real students/advisers (roster
audit) and the spec's samples used a real name and `@usep.edu.ph` address. Those samples were
replaced with fictional values in `docs/mvp-spec.md`. The full PM dossier and SDLC Stages 1-3 were
extracted to `docs/private/` and **gitignored** — local reference only.
**Deviations flagged** at the top of `mvp-spec.md` (13 columns vs A-L, status values, bare 5-digit
QR payload vs `CCO-XXXXX`, added `roster` endpoint).
**Impact:** docs only, no code change.

## 2026-09-19 — Repo restructured: `apps-script/`, `docs/`, `tests/`
**By:** user (target layout) + Claude
**What:** moved `Code.gs` and `EmailBlaster.gs` into `apps-script/`; added `docs/api-contract.md`
(derived from `Code.gs`, includes the `roster` endpoint), `docs/db-schema.md` (the real 13-column
A-M schema, not the spec's A-L), and `tests/README.md` (curl contract checks). `scanner.html`
stays at the repo root so GitHub Pages serves it unchanged; `display.html` will sit beside it in
Epic 5. `README.md` and the "Repo structure" section of `AGENTS.md` updated to match. This
supersedes the earlier "leave it flat for now" decision.
**Not done:** `docs/mvp-spec.md` — the spec lives in the Google Docs handoff and wasn't available
to extract from, so it was not written from memory. `display.html` — Epic 5, not built.
**Impact:** no code changes. Apps Script is unaffected (files are pasted into the editor by name,
not by repo path); the restructure itself doesn't change the live `/exec` URL or `scanner.html`.

## 2026-09-19 — Root cause of roster/offline issues: deployment URL drift, not a code bug
**By:** user (redeploy attempt) + Claude
**What:** user redeployed `Code.gs` per the previous entry's instructions but the roster badge
still said "server doesn't support it yet," and the offline banner stayed up persistently even
on wifi. Root cause: the redeploy used **"+ New deployment"** rather than **"Manage deployments
→ pencil/edit → New version → Deploy."** The former creates an entirely new Deployment ID and
`/exec` URL; the latter updates the code behind the *existing* URL. Two new deployments (Version
3, Version 4) were created, each with its own new URL — meanwhile `scanner.html` was still
pointed at the *original* Epic 1 deployment URL, which never received the roster endpoint.
Explains both symptoms: roster fetch hit stale code (no `roster` action), and the offline queue
kept failing to sync against a URL whose behavior no longer matched what was being tested.
**Fix:** updated `CONFIG.API_BASE` in `scanner.html` to the newest (Version 4) deployment URL,
with an inline comment explaining the "New deployment" vs "New version" distinction so this
doesn't recur. Also added two manual buttons to the scanner header — "🔄 Refresh roster" and
"⏫ Sync now" — so caching/syncing state can be forced and verified immediately instead of
waiting on the 15s/5min background timers or guessing whether something "is working."
**Lesson for future redeploys:** always use the pencil/edit icon on the existing deployment in
"Manage deployments," never "+ New deployment," unless the intent is genuinely to mint a new URL
(in which case `scanner.html`'s `CONFIG.API_BASE` must be updated to match, every time).
**Not yet retested:** roster caching and offline-mode-clearing behavior against the corrected URL.

## 2026-09-19 — Scan buffer fix, continuous-scan checkbox, roster-fetch diagnosability
**By:** user (device testing) + Claude
**What:** two more rounds of feedback after the offline-VIP-ID fix:
1. **Repeat-scan buffer.** The camera keeps decoding in the background while the result card
   is on screen, and the same QR is usually still in frame — the old 2.0s debounce alone let a
   second check-in fire the moment it lapsed, even before the usher had read the first card.
   Fixed the default: scanning now pauses entirely while a result card is open, resuming only
   once it's dismissed ("Next scan"). Added a "Keep scanning while a result card is showing"
   checkbox (default off) for ushers who prefer to just keep waving codes through a fast line
   without tapping to dismiss each time — checked, it reverts to the old 2.0s-buffer-only
   behavior.
2. **Offline VIP ID still not working after the roster-cache fix.** User tested camera scan
   mid-airplane-mode and still got "code not in cache." Root cause is almost certainly a
   deployment-order issue, not a logic bug: the roster cache can only populate from a live
   fetch of `GET ?action=roster` *while online, before* going offline — and that endpoint only
   exists in the `Code.gs` handed off this session, which needs a fresh **Deploy > Manage
   deployments > Edit > New version > Deploy** in Apps Script to actually take effect on the
   live `/exec` URL (same gotcha as the "Who has access" and Run-dropdown issues earlier this
   project — editing Code.gs alone never republishes). If that step was skipped, `?action=roster`
   still 404s/errors against the old deployed code, the cache never populates, and every offline
   scan falls back to the generic message — indistinguishable from a real bug without visibility
   into what happened. Fixed the visibility gap: `fetchRoster()` now sets the header badge to
   "Roster: server doesn't support it yet (redeploy Code.gs)" on a non-SUCCESS response, instead
   of failing silently. **Action needed:** redeploy `Code.gs` (new version), reload `scanner.html`
   on the phone while online, confirm the header shows "Roster: N cached," *then* retest
   airplane mode.
**Impact:** UI/logic-only in `scanner.html`; `Code.gs` unchanged from the last handoff (still
needs that redeploy for the roster endpoint to go live).

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
