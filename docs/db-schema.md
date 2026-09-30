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

| S | `token` | **Added 2026-10-01** by `assignTokens` (RosterImport.gs): `Gold Lei` \| `Blue & Gold Lei` \| `Ribbon` \| blank. Rules read designation / club / attendee_type (never names): Gold = VPAD, OSAS Director, CARESYSTEM, Federation of USeP Alumni, USeP Obrero Alumni; Blue & Gold = former CCO advisers; Ribbon = partners/beneficiaries and club/org advisers. Only blank cells are filled, so a hand-typed value wins; `none` / `-` = deliberately no token. `Code.gs` sends it with check-ins and the roster → scanner card + Telegram alert. |

Columns P–S are found by **header name**, never by position, so their order doesn't matter. A `full_name` of `(TBA)` means an unnamed slot: the pass says "One (1) representative of {club_name} — Please send 1 representative only." 

Tier colors: gold = VIP Pass, royal blue = Regular Attendee. The invitation email (`EmailBlaster.gs`, since
2026-09-28) and — since 2026-10-01 — `scanner.html` and `display.html` use the CCOnklusyon 2026 design system
(ground `#040e3f`/`#060d53`, gold `#fcdf93`/`#f1b763`/`#c98d45`, ink `#f5ffff`, Cinzel + Cormorant Garamond),
replacing the original `#B8860B` / `#1A56DB` pair. `roster-print.html` stays monochrome for paper.

**Special tables** (not a column): a row whose `table_allocation` is in the Script property `SPECIAL_TABLES`
(default VVIP, VIP, SL's, Alumni 1, Alumni 2, 41st CCO Officers, Externals — matched ignoring case, spaces and
apostrophes) triggers the Telegram alert and an "escort" note on the scanner card, whatever its ticket type.

See [`AGENTS.md`](../AGENTS.md) for the rules that govern this file and
[`CHANGES.md`](../CHANGES.md) for why the schema differs from the spec.
