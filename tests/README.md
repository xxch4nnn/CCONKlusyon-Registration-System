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
