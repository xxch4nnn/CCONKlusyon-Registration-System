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
| H | `qr_code_url` | Filled alongside G, via `api.qrserver.com`. Since 2026-09-30 the invitation email no longer reads it — it embeds a sharper QR built from G at send time (see `CHANGES.md`). |
| I | `table_allocation` | |
| J | `photo_url` | **Nullable by design for Regular Attendees** — VIPs use curated portraits; regular attendees fall back to name cards / monogram avatars (`CONFIG.SHOWCASE_MODE` in `display.html`, Epic 5). |
| K | `checkin_status` | Blank or `Pending` = not arrived; `Checked-In` written on first successful scan. |
| L | `checkin_timestamp` | ISO 8601, `GMT+8` (`yyyy-MM-dd'T'HH:mm:ssXXX`). |
| M | `checked_in_by` | Device/station id from the check-in payload. |
| N | `pass_sent` | **Added 2026-09-28.** Blank = not yet dispatched; `TRUE` written by `sendEventPassesLIVE` (the real send) right after each successful send (never by a test send). **Send rule (2026-10-01):** a row counts as sent only when N says yes (TRUE / ticked / TRUE-YES-Y-SENT-1-X-✓ text) **and** O is filled; if either is empty the next live run emails that row and re-stamps both. So rows added later get their pass on the next run, and clearing N re-sends one person. `previewEventPassesLIVE` lists who would be emailed. Add this header cell to the live sheet manually — `Code.gs`'s check-in path never reads or writes it. |
| O | `pass_sent_timestamp` | **Added 2026-09-28.** ISO 8601 timestamp of the successful dispatch, written alongside N. |
| P | `BATCH` | Added on the live sheet by the team (not by code); no script reads or writes it. |
| Q | `attendee_type` | **Added 2026-10-01** by `importFinalSeating` (RosterImport.gs) from Final Seating "Category": one of Alumni, Club Participant, Event Staff, External Partner, Former Adviser, Guest, Plus One, Student Leaders, USeP Office, USeP Personnel, VVIP, VIP. Shown on the pass chip; VVIP/VIP get the gold chip. `ticket_type` (F) is derived from it (VVIP/VIP → `VIP Pass`). |
| R | `reg_no` | **Added 2026-10-01.** Final Seating "No." — the key a re-import matches on, so updates never create duplicates or new codes. Blank = the row did not come from Final Seating (e.g. old test rows). |

Columns P–R are found by **header name**, never by position, so their order doesn't matter. A `full_name` of `(TBA)` means an unnamed slot: the pass says "One (1) representative of {club_name} — Please send 1 representative only." 

Tier colors (spec-locked): Gold `#B8860B` = VIP Pass, Royal Blue `#1A56DB` = Regular Attendee. The
invitation email (`EmailBlaster.gs`) now uses the CCOnklusyon 2026 identity (royal blue/gold,
Cinzel + Cormorant Garamond) for its overall look — see the 2026-09-28 `CHANGES.md` entry. The
spec-locked pair above still governs `scanner.html` and `display.html`, which are unchanged.

See [`AGENTS.md`](../AGENTS.md) for the rules that govern this file and
[`CHANGES.md`](../CHANGES.md) for why the schema differs from the spec.
