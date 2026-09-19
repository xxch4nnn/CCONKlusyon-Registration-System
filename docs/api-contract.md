# API contract

Served by the Apps Script web app in [`apps-script/Code.gs`](../apps-script/Code.gs)
(`doPost` / `doGet`). Deployed as **Execute as: Me, Who has access: Anyone**. Do not change
field names or shapes without updating this file and `AGENTS.md`.

Requests go to the deployment's `/exec` URL. `POST` bodies are JSON sent as the raw request body
(the scanner uses `fetch(url, { method: 'POST', body: JSON.stringify(...) })` with no custom
headers, which avoids a CORS preflight). Every response is JSON with a `status` field.

## `POST` `{action:"checkin"}`

Request: `{ "action": "checkin", "attendance_code": "12345", "device_id": "Entrance-1" }`

| `status` | Meaning | Extra fields |
|---|---|---|
| `SUCCESS` | First valid scan; row written `Checked-In` | `data`: `attendance_code, full_name, club_name, designation, ticket_type, table_allocation, photo_url, checkin_timestamp` |
| `DUPLICATE` | Already checked in; nothing written | `data`: `full_name, initial_checkin_timestamp, table_allocation, checked_in_by` |
| `NOT_FOUND` | Code not in `Master_Attendance` | — |
| `ERROR` | Bad JSON, missing code, unknown action, or lock timeout (`System busy, retry shortly.`) | `message` |

The sheet write is wrapped in `LockService.getScriptLock()` (10 s wait), so concurrent scans of
the same code cannot both succeed. A `VIP Pass` success also fires the Telegram alert (skipped
silently if `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` script properties are unset; a Telegram
failure never blocks the check-in).

### Also: `GET ?action=checkin&attendance_code=12345&device_id=Entrance-1`

Same handler and same responses as the POST above. Exists so a client whose POST was downgraded to a
GET (body lost) can retry safely — the duplicate check under the script lock makes a repeat harmless.
The scanner uses it as its automatic retry. `doPost` also accepts `action` (and the check-in fields)
from the query string if the body lacks them.

## `POST` `{action:"sync"}`

Request: `{ "action": "sync", "items": [ { "action": "checkin", "attendance_code": "...", "device_id": "..." }, ... ] }`

Bulk flush of the scanner's offline queue. Each item is processed exactly like a single
`checkin`. Response: `{ "status": "SUCCESS", "results": [ <one checkin response per item> ] }`.

## `GET ?action=recent&limit=N`

Feeds the projector wall. `limit` defaults to 12. Newest check-ins first.

Response: `{ "status": "SUCCESS", "count": n, "attendees": [ { full_name, club_name, designation, ticket_type, table_allocation, photo_url, checkin_timestamp } ] }`

## `GET ?action=roster`

Read-only full attendee list for the scanner's offline cache. **Excludes `email`.** Rows without
a name or attendance code are skipped.

Response: `{ "status": "SUCCESS", "count": n, "attendees": [ { attendance_code, full_name, club_name, designation, ticket_type, table_allocation, checkin_status } ] }`
(`checkin_status` is `"Pending"` when the sheet cell is blank.)

## `GET ?action=ping` (also accepted via POST)

No sheet access. Response: `{ "status": "SUCCESS", "message": "pong", "ts": "<ISO time>" }`. The scanner calls it on
load to warm the Apps Script container and to log a round trip.

## Gotchas

- Every request is logged by the script (`doGet action=… params=…` / `doPost action=… bodyLen=…`); see the
  editor's **Executions** to tell whether a failing request arrived as a GET or a POST.

- Editing `Code.gs` does not change the live endpoint. Redeploy: **Deploy → Manage deployments →
  Edit → New version → Deploy**. A new endpoint (like `roster`) returns an error against the old
  deployed version.
- A Drive-branded "Page Not Found" HTML page instead of JSON means the deployment's access is not
  set to "Anyone" — not a code bug.
