# Bug log & QA gate status

Living log. **Rule for this project:** a bug that a QA gate explicitly covers blocks that gate and gets
fixed before development continues; a bug the gates don't explicitly cover is logged here and does not
block progress. Status words: **Fixed (needs device retest)** = fixed in code and covered by an automated
test, not yet confirmed on a phone; **Logged** = recorded, not fixed; **Mitigated** = hardened, cause unproven.

## QA Gate 2 — Attendee-Facing Path (Epics 2 + 3) — verdict as of 2026-09-19: **NOT PASSED**

| # | Gate box | Evidence | State |
|---|---|---|---|
| 1 | Real test email → QR scanned → SUCCESS in under 3 s | Reported working on device. Latency not measured on device; the Apps Script call alone measured **1.3–4.4 s** from a PC (BUG-006) | ⚠ Works, ≤3 s not demonstrated |
| 2 | Duplicate scan correctly blocked and flagged | Duplicates *were* blocked server-side, but a good scan was followed by a **false duplicate card** (BUG-001) | ❌ Failed → fixed in code, **needs device retest** |
| 3 | PIN fallback produces the correct tier-coloured card | Verified on device earlier (manual entry); unchanged since | ✅ |
| 4 | Offline queue survives a real connectivity drop and syncs | Confirmed working on device (Sept 19) | ✅ |
| 5 | Verified on both iOS Safari and Android Chrome | Not done | ❌ Not verified |

**Consequence:** development does **not** proceed past Epic 3/4/5 verification (no Epic 6 beta scheduling)
until box 2 is re-tested on a phone and box 5 is done. Gate 3 (integration) and everything after it stay
blocked behind this gate, per the backlog's own gating.

## Bugs

### BUG-001 — Good scan is followed by a false "Already checked in" card
- **Reported:** "Scanning a QR leads to correct scan followed by a duplicate scan icon even when the first scan modal is still online."
- **QA mapping:** **Explicit** — Gate 2 box 2; Story 3.1.3 (scan-freeze debounce); US-002.
- **Root cause (confirmed by code read + reproduced):** the camera re-detects the same QR ~10×/s while it stays
  in frame. The 2 s scan-freeze expired *before* the server replied (replies take 1.3–4.4 s), and the
  "card is open" guard only became true once the reply arrived — so a second request for the same code went
  out and the server correctly answered `DUPLICATE`. Auto-dismiss (2.5 s) then reopened the window a third time.
  Reproduced deterministically in a headless browser: one scan produced two requests (`11111,11111`).
- **Fix:** `scanner.html` `onScanSuccess` — (a) no new scan accepted while a check-in is in flight (unless fast
  mode), (b) the **same code is ignored for 6 s** from when its answer arrived, regardless of card state or
  auto-dismiss, (c) existing card/settings guards kept. Genuine re-scans after the cooldown are still flagged
  as duplicates by the server.
- **Status:** **Fixed (needs device retest).** 10 automated scenarios pass; the same scenarios fail on the previous version.
- **Retest on device:** scan one QR and hold it in frame for 10 s — expect exactly one card, no duplicate; scan it
  again after ~10 s — expect the amber duplicate card.

### BUG-002 — Scanning continues while a result card is showing
- **Reported:** "Continuing scanning even though there is a modal present."
- **QA mapping:** Not an explicit gate item — but it shares its code path with BUG-001, so it was fixed together.
- **Root cause:** two contributors. (1) The in-flight gap above (the card wasn't open yet). (2) The
  "Keep scanning while a result card is showing" switch **was being saved across reloads** by the Sept 19
  settings rewrite, so a forgotten "on" silently made scans fire behind cards. It was per-session before.
- **Fix:** the switch is per-session again (defaults off on every load); same-code cooldown applies even in fast mode.
- **Status:** **Fixed (needs device retest)** with BUG-001. Fast mode is still *meant* to scan behind cards for a
  different attendee — that's its purpose.

### BUG-003 — Pop-ups appear even when not scanning
- **Reported:** "Pop-ups even though im not scanning at the moment."
- **QA mapping:** Not explicit in any gate → **logged, not fixed** (per the rule above).
- **Root cause:** *unconfirmed hypothesis.* The Sept 19 UI rewrite removed the fixed scan box (`qrbox`) so the
  whole camera frame is decoded, with the native `BarcodeDetector` enabled. Any decode is submitted as a
  check-in without checking that it looks like a pass, so a stray or noisy decode becomes a red
  "CODE NOT FOUND" card with a flash and buzz. Not ruled out: other QR codes/barcodes in view.
- **Proposed fix (not applied):** ignore decodes that aren't exactly 5 digits (silent or a small hint, no card/sound);
  require the same code on 2 consecutive frames; add rejected decodes to the Connection log to get real evidence;
  if it persists, restore a centred scan region.
- **Status:** **Logged — recommended next fix.** High field impact (false alarms at the door).

### BUG-004 — Alerts even when the camera isn't pointed at any real pass QR
- **Reported:** "alerts even when i did not point the camera to any existing qr."
- **QA mapping:** Not explicit → **logged, not fixed.**
- **Root cause / fix:** same suspected cause and proposed fix as BUG-003 (unvalidated whole-frame decodes).
  Kept separate because it was reported separately; close both together once verified.
- **Status:** **Logged.**

### BUG-005 — "Unknown action." on the first check-in
- **Reported:** earlier this session. **QA mapping:** affects Gate 2 box 1 indirectly.
- **State:** hardened (silent GET retry, offline queue fallback, Connection log) — root cause **unproven**;
  needs the `Code.gs` redeploy and the 10-scan trial in `tests/README.md`. See the Sept 19 entry in `CHANGES.md`.
- **Status:** **Mitigated.** Note: BUG-003/004 may partly overlap with this — check the Connection log for the
  request/response behind any unexpected card.

### BUG-006 — Door latency: 3 s target at risk (observation, not user-reported)
- **Observed:** Apps Script round trips measured 1.3–4.4 s from a PC, before any phone/cellular overhead.
  Spec target: ≤ 3 s scan-to-confirmation (US-002, NFR).
- **QA mapping:** Gate 2 box 1 ("under 3 s").
- **Proposed:** measure on device with the Connection log (it records ms per request); warm-up `ping` already
  added; consider GET-first check-ins if the redirect adds a hop.
- **Status:** **Logged.**

## Not bugs, but open verification items
iOS Safari + Android Chrome pass (Story 3.5); noisy-room audibility (3.2.3); bogus code via camera; Telegram alert
timing (4.1.4); projector wall on real 1080p/4K + 30-min soak (5.2.2/5.2.3).
