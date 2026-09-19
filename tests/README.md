# Contract tests

Manual curl checks against the deployed `/exec` URL (no test framework — zero-build mandate).
Set `URL` to the current deployment (same value as `CONFIG.API_BASE` in `scanner.html`).
`-L` follows Apps Script's `/exec` → `googleusercontent.com` redirect.

```bash
URL='https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec'

# NOT_FOUND — code that does not exist
curl -sL -X POST "$URL" -d '{"action":"checkin","attendance_code":"00000","device_id":"curl-test"}'

# SUCCESS, then DUPLICATE — use a real code from Master_Attendance (writes to the sheet!)
curl -sL -X POST "$URL" -d '{"action":"checkin","attendance_code":"<CODE>","device_id":"curl-test"}'
curl -sL -X POST "$URL" -d '{"action":"checkin","attendance_code":"<CODE>","device_id":"curl-test"}'

# Read-only feeds
curl -sL "$URL?action=recent&limit=5"
curl -sL "$URL?action=roster"
```

Expected shapes are in [`docs/api-contract.md`](../docs/api-contract.md). A test check-in leaves the
row `Checked-In` in the live sheet — reset `checkin_status`, `checkin_timestamp` and
`checked_in_by` for that row afterwards.

Manual device checks (camera scan, flashlight, audio in a noisy room, airplane-mode offline
queue) are tracked in `CHANGES.md`.

## Telegram VIP alert (Epic 4)

1. Apps Script editor → **Project Settings → Script properties** → add `TELEGRAM_BOT_TOKEN` and
   `TELEGRAM_CHAT_ID` (never paste them into chat, code, or the repo).
2. Run `testTelegramPing()` — the usher group should get a "bot connected" message; the log shows
   Telegram's HTTP status.
3. Run `testVipAlertTemplate()` — sends the real VIP template with fake data and logs the round-trip in ms
   (target: alert within 3 s of a scan).
4. Redeploy: **Deploy → Manage deployments → edit → New version → Deploy** (keeps the `/exec` URL).
5. From the scanner, check in a VIP test row and time the alert. Reset that row afterwards.

## Projector wall (display.html)

Open `display.html` (GitHub Pages URL), press F11. Check in a few rows from the scanner; each should
appear within one poll (≤ 4 s). Drop the network: the wall keeps its data and shows "Reconnecting…".

## First-scan / "Unknown action." check

After redeploying `Code.gs`, on the phone that showed the error: reload the scanner, wait a few minutes idle,
then scan/enter a test code; repeat ~10 times (reset rows afterwards). Then:

1. **Settings → Connection log** — look for `checkin POST → ERROR` (note text) followed by
   `checkin GET retry → SUCCESS`. `[200 direct]` vs `[200 redirected]`, and `NOT-JSON` / `TIMEOUT` rows, are
   the clues. Use **Copy** to send the log for analysis.
2. Apps Script editor → **Executions**: a failing scan that ran `doGet` with `action=undefined` (or a `doPost`
   with `bodyLen=0`) confirms the request was downgraded.
3. The usher should never see the words "Unknown action" — only a result card or the "saved, will sync" card.

## Automated suite (run this before every push)

```
node tests/run.js                 # everything
node tests/run.js --only decode   # scanner case files whose name contains "decode"
node tests/run.js --scanner some.html   # run the scanner cases against another copy
```

Needs Node and an installed Edge or Chrome (`BROWSER=<path>` to override). No npm packages.

- `tests/code-gs.test.js` — `Code.gs` against mocked Apps Script globals: routing, GET/POST check-in, sync, duplicate
  handling, ping, `auditRoster`, `resetTestCheckins`.
- `tests/scanner/` — `scanner.html` in a headless browser against a scripted fake server (virtual time, so a 60 s idle test
  runs in seconds). `cases/decode-guard.js` (BUG-003/004, includes the hard-coded pass-code accept/reject corpus),
  `cases/scan-guard.js` (BUG-001/002), `cases/retry-sync.js` (BUG-005 / offline queue / sync).
- The runner fails if a case file doesn't load, so a syntax error can't silently skip tests. When fixing a bug,
  add the failing case first, watch it fail, then fix.

### Suites in `node tests/run.js`
Apps Script mocks · `scanner.html` with a station saved (`tests/scanner/cases`) · `scanner.html` **fresh install** with nothing saved (`tests/scanner/fresh`,
BUG-007) · `display.html` wall (`tests/display`, BUG-010/011). Case files: `decode-guard`, `scan-guard`, `retry-sync`, `late-cards`, `station-gate`, `wall`.

### Camera test: `node tests/camera.js`
Real decoding against a **fake camera** (looped MJPEG clips in `tests/camera/clips`, regenerate with `python tests/camera/make-clips.py`; needs `qrcode` + `pillow`):
QRs inside the on-screen frame must scan; QRs outside it, and an empty frame, must not (BUG-008). ~2 minutes, real time, needs Node 22+.
`--scanner old.html` runs it against another copy — use it to prove a test catches the bug before fixing.
