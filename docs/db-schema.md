# `Master_Attendance` schema

Live tab: workbook `1memjsk0qCcFqAdL5yMXAYU0iFf5OkGk1cwg0e56FbOY`, gid `155323925`.
Header row + one row per attendee. Column positions are mirrored in the `COL` constant in
[`apps-script/Code.gs`](../apps-script/Code.gs) — change both together.

**13 columns (A–M), not the A–L in the original MVP spec.** The real sheet reorders the spec's
fields, swaps `seat_allocation` for `table_allocation`, and stores `qr_code_url` as its own column
instead of generating it at send-time. Code targets the real sheet.

| Col | Field | Notes |
|---|---|---|
| A | `email` | USeP institutional addresses. Never returned by `roster`/`recent`. |
| B | `full_name` | |
| C | `org_classification` | **Nullable by design for VIPs** — they represent the institution, not one student org. |
| D | `club_name` | |
| E | `designation` | |
| F | `ticket_type` | `"VIP Pass"` \| `"Regular Attendee"` |
| G | `attendance_code` | Primary key, 5-digit. Filled by `generateCredentials()` (idempotent, collision-checked). |
| H | `qr_code_url` | Filled alongside G, via `api.qrserver.com`. |
| I | `table_allocation` | |
| J | `photo_url` | **Nullable by design for Regular Attendees** — VIPs use curated portraits; regular attendees fall back to name cards / monogram avatars (`CONFIG.SHOWCASE_MODE` in `display.html`, Epic 5). |
| K | `checkin_status` | Blank or `Pending` = not arrived; `Checked-In` written on first successful scan. |
| L | `checkin_timestamp` | ISO 8601, `GMT+8` (`yyyy-MM-dd'T'HH:mm:ssXXX`). |
| M | `checked_in_by` | Device/station id from the check-in payload. |

Tier colors (spec-locked): Gold `#B8860B` = VIP Pass, Royal Blue `#1A56DB` = Regular Attendee.

See [`AGENTS.md`](../AGENTS.md) for the rules that govern this file and
[`CHANGES.md`](../CHANGES.md) for why the schema differs from the spec.
