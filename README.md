# CCOnklusyon Registration & Check-in System

Zero-build, zero-cost registration, entry-pass and door check-in system for **CCO CCOnklusyon
2026** (USeP College of Computing, Oct 2, 2026). Built entirely on Google Workspace + GitHub
Pages — no servers, no paid services, no build pipeline.

**Start here:** [`AGENTS.md`](./AGENTS.md) — non-negotiables, live infrastructure, the confirmed
`Master_Attendance` schema, and the API contract. [`CHANGES.md`](./CHANGES.md) is the running
decision log (why things are the way they are).

## What's here

| File | What it is | Runs on |
|---|---|---|
| `apps-script/Code.gs` | Backend gateway — check-in, offline-sync flush, recent-arrivals feed, roster cache feed, VIP Telegram alert | Google Apps Script (Web App) |
| `apps-script/EmailBlaster.gs` | Entry-pass email sender, plus a generic reusable blast engine for any other event email | Google Apps Script |
| `scanner.html` | Usher-facing door scanner — camera QR scan, manual code fallback, offline queue, audio/visual feedback | Static, served via GitHub Pages |
| `display.html` | Projector live wall — hero banner of the 3 latest arrivals plus a grid of everyone else, Gold/Blue tier cards, polls every 4 s | Static, served via GitHub Pages |
| `HANDOFF.md` | Current status snapshot — what's built, what's next, open items | — |
| `docs/mvp-spec.md` | Original MVP spec (client + technical), with deviations noted at the top | — |
| `docs/sprint-backlog.md` | Epic / Story / Task backlog and the 5 QA gates | — |
| `docs/bug-log.md` | Bug log and QA gate status | — |
| `docs/user-stories.md` | Status of every user story | — |
| `docs/api-contract.md` | `checkin` / `sync` / `recent` / `roster` request and response shapes | — |
| `docs/db-schema.md` | The 13-column `Master_Attendance` schema | — |
| `tests/README.md` | curl contract checks against the deployed `/exec` URL | — |

## Deploying a change

**Backend (`apps-script/Code.gs` / `apps-script/EmailBlaster.gs`):** open the `Master_Attendance` tab's bound Apps
Script project → paste the updated file in → **Deploy → Manage deployments → Edit → New
version → Deploy**. `scanner.html`'s `CONFIG.API_BASE` must match that deployment's `/exec` URL.

**Frontend (`scanner.html`, `display.html`):** commit to `main` — GitHub Pages serves straight from the repo
root, no build step. Open on a phone to test the camera flow.

## Status

Epics 1-5 are built: Backend Gateway, Email Pass Blaster, Usher Scanner PWA, Telegram VIP alert (code
complete, waiting on bot credentials) and the Projector Wall. See `HANDOFF.md` for open items and
`CHANGES.md` for what's been verified live vs. still pending.
