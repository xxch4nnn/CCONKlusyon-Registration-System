# Bug log & QA gate status

Living log. **Rule for this project:** a bug that a QA gate explicitly covers blocks that gate and gets
fixed before development continues; a bug the gates don't explicitly cover is logged here and does not
block progress. Status words: **Verified** = confirmed on a real device · **Fixed (needs device retest)** = fixed
in code and covered by an automated test, not yet confirmed on a phone · **Logged** = recorded, not fixed ·
**Mitigated** = hardened, cause unproven. Automated tests: `node tests/run.js` (see `tests/README.md`).

## QA Gate 2 — Attendee-Facing Path (Epics 2 + 3) — verdict as of 2026-09-19: **PASSED WITH WAIVER**

| # | Gate box | Evidence | State |
|---|---|---|---|
| 1 | Real test email → QR scanned → SUCCESS in under 3 s | Works on device. Latency not measured on a phone; the Apps Script call alone measured **1.3–4.4 s** from a PC (BUG-006). The formal "sub-3 s on 4G/LTE" check is also a **Gate 5** box and is carried there | ✅ Works · ≤3 s carried to Gate 5 / beta test 6.2.2 |
| 2 | Duplicate scan correctly blocked and flagged | BUG-001 (false duplicate after a good scan) **verified fixed on device** by the user | ✅ |
| 3 | PIN fallback produces the correct tier-coloured card | Verified on device earlier; unchanged since | ✅ |
| 4 | Offline queue survives a real connectivity drop and syncs | Confirmed on device | ✅ |
| 5 | Verified on both iOS Safari and Android Chrome | **Waived by the user for now** (no iOS device available, 2026-09-19). Android Chrome is what has been tested | ⏸ Deferred — must be done before Gate 5 |

**Consequence:** development proceeds to Epic 6 preparation. The iOS pass is a standing risk: it is re-listed
under Gate 5 ("Audio & sensory feedback verified"), and the camera/permission behaviour on iOS Safari is
untested — including the new full-screen camera layout, the vibration fallback and the audio unlock.

## Bugs

### BUG-001 — Good scan is followed by a false "Already checked in" card
- **Reported:** correct scan followed by a duplicate card while the first card was still up. **QA mapping:** explicit
  (Gate 2 box 2; Story 3.1.3; US-002).
- **Root cause (confirmed):** the 2 s scan-freeze expired before the server's 1.3–4.4 s reply, and the "card open"
  guard only became true on reply, so the same QR still in frame produced a second request and a real `DUPLICATE`.
- **Fix:** no new scan accepted while a check-in is in flight (unless fast mode); same code ignored for 6 s after its answer arrives.
- **Status:** **Verified on device** (user, 2026-09-19). Regression tests G1–G8.

### BUG-002 — Scanning continues while a result card is showing
- **QA mapping:** not explicit; fixed together with BUG-001 (shared code path).
- **Root cause:** the in-flight gap above, plus the "Keep scanning" switch being persisted across reloads by the
  Sept 19 settings rewrite (a forgotten "on" scanned behind cards). Now per-session.
- **Status:** **Fixed (needs device retest)** — the user confirmed BUG-001 only. Regression tests G5–G8.

### BUG-003 — Pop-ups appear even when not scanning
### BUG-004 — Alerts even when the camera isn't pointed at any real pass QR
- **QA mapping:** not explicit in any gate; logged first, then fixed on the user's go-ahead ("proceed with development").
- **Audit-first evidence (hard-coded test suite, run against the unfixed scanner):** 14 of 57 checks failed. Any decoded
  text — one noisy frame, 60 noise decodes, a non-pass QR such as a URL, `CCO-48201`, a lone valid-looking frame,
  flickering between two codes — was sent to the server as a check-in (`DUPLICATE`/`NOT_FOUND` cards, flash, buzz), and
  noise even delayed a real scan (`junk0` was submitted before the real code). Ruled out by the same suite: app timers and
  background sync do **not** raise cards on their own (idle-60 s and queued-sync tests passed), so the cause is decode noise.
- **Root cause:** the Sept 19 UI rewrite decoded the whole camera frame (native BarcodeDetector) and passed *whatever came
  back* straight to the check-in call, with no check that it was a pass code and no requirement that it be seen twice.
- **Fix:** `scanner.html` decode guard — (1) `parsePassCode()` accepts only `10000–99999` (optionally `CCO-` prefixed);
  (2) the same text must be decoded **2 times within 1.2 s** (a real QR in view decodes every frame; noise almost never
  repeats); (3) a stable QR that isn't a pass gets one quiet "Not a CCOnklusyon pass" toast and a Connection-log line
  (`NOT-A-PASS`, rate-limited to once per 5 s) — never a card, flash or sound; (4) manual entry is untouched.
- **Result:** the same suite now passes 101/101 checks (0 failures), including the earlier BUG-001/BUG-005 regressions.
- **Trade-off (deliberate):** a pass now needs about one extra camera frame (~0.1–0.2 s) before it registers, and two
  different passes flickering in one frame will scan only once one dominates.
- **Status:** **Fixed (needs device retest).** Retest: point the camera at empty space, a wall, a poster QR and a
  non-pass QR for a few minutes — expect no cards/sounds; then scan a real pass — expect it to register normally.

### BUG-005 — "Unknown action." on the first check-in
- **State:** hardened (silent GET retry, offline queue fallback, Connection log) — root cause **unproven**; needs the
  `Code.gs` redeploy and the 10-scan trial in `tests/README.md`. **Status:** **Mitigated.**

### BUG-006 — Door latency: 3 s target at risk (observation)
- **Observed:** Apps Script round trips measured 1.3–4.4 s from a PC. Spec target ≤ 3 s (US-002).
- **Next:** measure on device in beta test 6.2.2 with the Connection log (records ms per request); consider GET-first
  check-ins if the redirect adds a hop. **Status:** **Logged.**

### BUG-007 — Station name prompt doesn't appear on the first run (and wasn't mandatory)
- **Reported:** "The station name prompt at the start isn't appearing on the first pass. It should be mandatory."
- **Root cause (by code read; the exact device path is unconfirmed):** the station name came from `window.prompt()`. Browsers can suppress or
  auto-dismiss it, **Cancel saved `Unassigned-Station` permanently** (so it never asked again), and nothing stopped scanning without a name.
- **Audit-first:** 8 new fresh-install tests failed 11/11 on the old build (there was no gate at all).
- **Fix:** an in-page **Name this station** gate that cannot be dismissed on first run; camera start, scanning and manual entry are blocked until a valid
  name (2–24 letters/digits/space/`-_.`, not `Unassigned-Station`, `Unknown`, …) is saved. A legacy saved `Unassigned-Station` counts as unset.
  "Change station name" reuses the gate (Cancel allowed). Tests F1–F8.
- **Status:** **Fixed (needs device retest).** Retest: clear the site's data (or open in a private tab) → the gate must appear before the camera does.

### BUG-008 — A QR outside the on-screen frame still scans
- **Reported:** "I tried scanning the QR for 61765 outside the box of the scanner yet it scanned."
- **Root cause (confirmed, reproduced):** my Sept 19 UI rewrite dropped the scan box (`qrbox`) and decoded the whole camera frame. The library maps its box
  using the video element's *layout* size, so a cropped (`object-fit: cover`) video can't be combined with a box — I removed the box instead of fixing the geometry.
- **Audit-first:** new **fake-camera test** (`node tests/camera.js`: headless Edge with a looped MJPEG of a QR at known positions, real decoding). Against the
  previous scanner: QRs *outside* the frame scanned (`outside_below`, `outside_corner`) — the exact report.
- **Fix:** the video is now sized to the stream's own aspect ratio, scaled to cover and centred; the library gets a `qrbox` equal to the frame drawn on screen
  (one shared size, `--reticle`). Result: 11/11 camera checks pass in a square and a tall window.
- **Known limit:** a height-only viewport change while running (offline banner appearing, on-screen keyboard) shifts the scan region by about half the change until
  the camera restarts; a width change (rotation) restarts the camera automatically. Not device-verified.
- **Status:** **Fixed (needs device retest).** Retest: hold a pass well outside the frame (corners/edges of the picture) — nothing should happen; inside the frame — scans.

### BUG-009 — "May already be checked in" cards, 10/10 pop-ups, pass 61765 "didn't record", card while pointing at a wall
- **Reported:** in a 10-pass trial every scan popped up but 61765 didn't record; a "MAY ALREADY BE CHECKED IN" card appeared twice while the camera faced a wall.
- **Audit findings (read-only checks of the live sheet/server):**
  1. **61765 was already `Checked-In` at 21:10:23** — a later scan of it can only be a duplicate; it can't "record" again. (Reset the row in the sheet first.)
  2. "MAY ALREADY BE CHECKED IN" is the **unconfirmed** card: the server never gave a definitive answer, so the scanner fell back to its cached roster — which still
     said Checked-In. It is not a server verdict.
  3. **The live server is still the old `Code.gs`** (`?action=ping` → "Unknown action."), so the GET-retry fallback and lost-reply recovery from earlier this session
     **cannot work yet**. This is the main reason unconfirmed cards keep appearing (BUG-005 unresolved).
  4. Worst-case time to a card was ~24 s (POST 12 s + GET 12 s), so a card could appear long after the scan, when the camera is already on something else.
  5. All 10 rows were Checked-In in the roster cache; after a sheet reset the phone's cache is stale for up to 5 min.
- **Fixes (client-side; tests L1–L5):** every card now shows **`PASS <code>`**; a **"Checking <code>…"** chip is visible from scan to card; request timeout 12 s → **8 s**
  (worst case 16 s); unconfirmed + cached "checked in" now reads **"NOT CONFIRMED — ROSTER SAYS CHECKED IN"** with a note that the roster copy may be out of date.
- **Still needs you:** redeploy `Code.gs`, then send the **Settings → Connection log** (Copy) after a bad run — it shows whether the POST arrived as a GET.
- **Status:** **Mitigated** (attribution/latency/wording fixed; underlying unconfirmed replies = BUG-005, blocked on the redeploy + log).

### BUG-010 — display.html shows duplicate cards
- **Reported:** "display.html displays duplicate cards when it shouldn't."
- **Root cause (reproduced):** cards were keyed by *name + timestamp* and never removed. The same person checking in again (row reset for testing) or the sheet writing the
  same instant in another format (`+08:00` vs `Z`) created a second card, and reset rows stayed forever.
- **Audit-first:** 9 wall tests failed 6 checks on the old build (`Ana Reyes | Ben Cruz | Ana Reyes`).
- **Fix:** one card per **person** (name + organisation); a later check-in replaces and re-animates the card; once a minute the wall re-reads the full list and drops
  anyone no longer checked in; the counter follows the sheet. **Status:** **Fixed (needs device retest).**

### BUG-011 — Refreshing display.html "deletes all records"
- **Reported:** "refreshing display.html deletes all record."
- **Audit:** the sheet is intact (read-only check: 10 rows, 9 Checked-In, 1 Pending) and the wall only issues `GET`s — it cannot delete anything. What you see is a **blank wall
  for ~2.4–3 s** after every refresh (the `recent` call takes that long), showing "Welcome…" as if nobody had checked in.
- **Fix:** the wall keeps its last state in the tab's session storage and repaints it instantly after a refresh, then reconciles with the sheet; before the first answer an empty
  wall says **"Loading arrivals…"**, not "Welcome". **Status:** **Fixed (needs device retest).** (Session storage is cleared when the tab closes.)

## Open verification items
iOS Safari + Android Chrome pass (Story 3.5 — waived for Gate 2, owed before Gate 5); noisy-room audibility (3.2.3);
Telegram alert timing (4.1.4); projector wall on real 1080p/4K + 30-min soak (5.2.2/5.2.3); device retest of BUG-002/003/004/007/008/009/010/011;
**redeploy of the new `Code.gs`** (live server still old as of 2026-09-19 — `?action=ping` returns Unknown action).
