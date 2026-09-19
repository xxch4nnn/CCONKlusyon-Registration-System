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
