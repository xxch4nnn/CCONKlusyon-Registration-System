# Beta simulation runbook (Epic 6 → QA Gate 4)

The 7-test battery from `sprint-backlog.md` §6.2, with concrete steps, pass criteria and where to read the
evidence. Run it with a handful of CCO Councilmen on their own phones. **Use beta rows only** — never real
attendees' rows — and reset them between runs.

## 0. Before anyone arrives (you, ~20 min)

| Step | How | Done when |
|---|---|---|
| Latest code deployed | Paste `apps-script/Code.gs` → **Deploy → Manage deployments → pencil → New version** (never "+ New deployment"). `scanner.html`/`display.html` `CONFIG.API_BASE` must match that URL. | `?action=ping` returns `pong` |
| Beta rows staged | Beta group rows in `Master_Attendance` with static PINs, tables, at least 2 VIP rows with photos | — |
| Data audit | Editor → run **`auditRoster`** → read the execution log | `RESULT: READY (no errors)`; warnings understood |
| Telegram | Script properties `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`; run `testTelegramPing` then `testVipAlertTemplate` | Message arrives; round trip logged |
| Reset script | Script property `TEST_RESET_CODES` = the beta PINs (max 30) | `resetTestCheckins` logs the expected count |
| Wall open | `display.html` on the Secretariat laptop, F11 | Shows "Live" |
| Automated checks green | `node tests/run.js` on the dev machine | `ALL PASS` |

## 1. The 7 tests

For every test, after it: **Settings → Connection log → Copy** on each phone and keep the text with the result.
Apps Script **Executions** shows `doGet`/`doPost` per request — check for red (failed) executions.

| # | Test | Steps | Pass criteria | Evidence |
|---|---|---|---|---|
| 6.2.1 | **Dispatch** | Send the beta passes with `sendEventPassesBetaTest()` to Gmail, Outlook and Yahoo test inboxes | Lands in the inbox (not spam) on all three; QR renders and scans from the screen | Screenshots of each inbox |
| 6.2.2 | **Ingress latency** | Each usher scans 5 different passes from the emailed QR, phone on 4G/LTE (not Wi-Fi) | Scan → result card ≤ **3 s** for ≥ 95 % of scans | Connection log `checkin POST … ms` lines |
| 6.2.3 | **Duplicate** | Scan one pass; keep it in frame 10 s; scan again after 10 s | Exactly **one** success card; the later scan shows the amber duplicate card; sheet row written once | Card screenshots; sheet row |
| 6.2.4 | **Dead-phone PIN** | Enter a PIN by hand for a Regular and a VIP row | Card appears with correct name, table and **Gold/Blue** tier colour in ≤ 3 s | Screenshots |
| 6.2.5 | **VIP Telegram alert** | Check in a VIP row from the scanner | Alert in the usher group in ≤ **3 s** with name, role, seat | Stopwatch or message timestamp vs. scanner time |
| 6.2.6 | **Wall real-time** | Check in 5 rows while watching `display.html` | Each arrival appears within one poll (≤ **4 s**); VIP has gold border/badge; no photo → monogram | Video/photos of the wall |
| 6.2.7 | **Offline resilience** | Airplane mode on; scan 3 passes (cached roster should still identify them); restore connection | Cards say OFFLINE — QUEUED with the right tier; queue drains on reconnect; sheet shows all 3 exactly once | Connection log; sheet |
| — | **Concurrency drill** | 3+ ushers scan *different* passes in the same second, then two ushers scan the *same* pass together | Distinct passes all succeed; the same pass succeeds once and the other gets DUPLICATE | Sheet; `auditRoster` counts |
| — | **Noise check** (BUG-003/004) | Point cameras at empty space, a wall, a poster QR; leave open 5 min | No cards, flashes or sounds; a non-pass QR gives only a small "Not a CCOnklusyon pass" hint | Observation |

## 2. After each round

1. Editor → run **`auditRoster`**: `checked in` must equal the number of *distinct* passes actually scanned (proves no
   double check-ins), and no new errors.
2. Run **`resetTestCheckins`** before repeating.
3. Log every failure the moment it happens (triage table below) — exact steps, phone/browser, time.

## 3. Triage log (fill as you go)

| Time | Test # | Phone / browser | What happened | Repro steps | Connection-log excerpt | Severity | Status |
|---|---|---|---|---|---|---|---|

Fix and re-run **only the failing test**, not the whole battery.

## 4. QA Gate 4 — sign-off

- [ ] All 7 tests passed with zero unhandled exceptions (no red Executions)
- [ ] Zero duplicate check-ins recorded against the beta group
- [ ] No data collisions in the concurrent-scan drill

Any box unchecked → stop, don't touch production data, fix, re-run that test. Log the outcome in `bug-log.md`.
