# MVP Specification (as handed off Sept 13, 2026)

> **Snapshot of the original spec — not the live truth.** Extracted from the Project Management
> hand-off dossier. Where the built system deviates, the deviation is intentional and logged in
> [`CHANGES.md`](../CHANGES.md); the current rules are in [`AGENTS.md`](../AGENTS.md). Known
> deviations from what's written below:
> - Sheet is **13 columns (A–M)**, not A–L: `seat_allocation` → `table_allocation`, plus a separate
>   `qr_code_url` column. See [`db-schema.md`](./db-schema.md).
> - `checkin_status` is blank/`Pending` → `Checked-In` (not `PENDING`/`CHECKED_IN`/`ATTENDED`).
> - The QR encodes the **bare 5-digit code**, not `CCO-XXXXX` (`generateCredentials()` in `Code.gs`).
> - Responses use `table_allocation`; a `GET ?action=roster` endpoint was added beyond this spec
>   ([`api-contract.md`](./api-contract.md)).
> - Sample names/emails below were replaced with fictional placeholders for the public repo.

# CCO CCOnklusyon Registration & Check-in System: MVP Specification

**Target Event:** CCO CCOnklusyon 2026

**Audience Size:** ~300 Registered Attendees (Club/Org Officers, Members, Advisers, and VIPs)

**Document Goal:** Establish a shared, unambiguous baseline between the Event Directorate (Client) and the Technical Team (Developers) for the Minimum Viable Product (MVP) to be deployed on October 2, 2026.

# PART 1: FOR THE CLIENT & EVENT STAKEHOLDERS

*(Plain-language explanation of what the system does, how it works on event day, and what guarantees it provides.)*

### 1.1 Executive Summary

The CCOnklusyon Registration System is an automated, zero-stress entry management solution designed to replace long registration lines, manual paper lookups, and awkward seating confusion.

Instead of writing names on clipboards or searching through a 300-row printout:
- Every attendee arrives with a personalized digital pass containing a secure QR code and 5-digit PIN on their smartphone.
- Ushers scan the pass in less than 3 seconds at the door.
- The guest instantly sees their name, designated table, and assigned seat.
- If the guest is a VIP, leadership ushers are instantly alerted via mobile phone to escort them.
- Inside the hall, a live projector screen welcomes guests as they arrive, displaying their photo and name with colored badges (Gold for VIPs, Royal Blue for Regular Delegates). - This is optional and up for coordination with the Tech.
- The official attendance log updates in real time, automatically protecting the organization from ₱500 no-show disputes.

### 1.2 The Experience on Event Day

#### A. What the Attendee Experiences
- **Before Arrival:** The attendee opens their official entry email sent days prior. The email features their unique QR code, attendance PIN, table/seat number, and event guidelines.
- **At the Entrance:** The attendee presents their phone screen to an usher at the triage door.
- **The Scan:** Within 2 seconds, the usher’s phone beeps green and confirms: *"Welcome, [Attendee Name]! Table 4 - Seat 12."*
- **Entering the Hall:** As they walk in, their face and name flash on the projector screen with a welcome badge. If they are a VIP, an usherette is already waiting to walk them directly to their table.
- **If Their Phone Dies:** The attendee simply gives their name or 5-digit PIN. The usher enters it manually on the scanning screen, confirming them immediately.

#### B. What the Ushers & Committee Experience
- **Entrance Ushers (Ushers 1 & 2):** Equipped with standard smartphones running a clean camera scanner webpage. No downloads or installations required. One tap to open, point camera at attendee pass, instant confirmation.
- **Walkway Usher (Usher 3):** Stationed past the doors to direct delegates smoothly toward the left or right wings without crowding the entrance.
- **Mobile VIP Escorts (Ushers 4, 5, & 6):** Receive a subtle, silent buzz on Telegram the exact second a VIP checks in at the door:*"🚨 VIP Check-in: [Adviser / Guest Name] has arrived. Assigned to VIP Table 1."*
This allows leadership to step up immediately and provide seamless red-carpet guidance.
- **Secretariat & Finance Committee:** Real-time visibility on exact numbers. At any point, they can check how many of the 300 attendees have entered, who is late, and who is absent.

#### C. What the Audience Sees Inside the Hall (Live Projector Wall)
- A high-resolution welcome board projected on stage or side screens.
- **Right/Top Feed:** Displays the most recent arrivals in real time.
  - **VIPs:** Framed in a bold **Gold border** with an executive badge.
  - **Regular Attendees:** Framed in an elegant **Royal Blue border**.
- **Main Wall Area:** A modern mosaic grid displaying all confirmed attendees, giving a strong sense of community and celebration.

### 1.3 What is IN the MVP vs. What is OUT of Scope

To guarantee 100% reliability on event day without technical overcomplication, we strictly define the MVP boundaries:

| **Core Feature (IN the MVP)** | **Out of Scope for MVP (Future Nice-to-Haves)** | **Why This Decision Was Made** |
|---|---|---|
| **Email Pass Delivery** with high-availability QR codes and 5-digit backup PINs | Native iOS/Android apps from the App Store / Play Store | Web-based links eliminate download friction and app-store approval delays. |
| **Mobile Web Scanner** used by entrance ushers on standard phones | Physical laser barcode hardware / RFID turnstiles | Phone cameras are flexible, free, and instantly replaceable if dropped. |
| **Instant VIP Telegram Alerts** for leadership escorts | Complex custom SMS gateways | Telegram uses existing mobile data and costs ₱0.00. |
| **Live Projector Wall** with Gold/Blue borders and recent arrivals | Facial recognition camera scanning at the doorway | Face recognition is brittle in low light; QR scanning is 99.9% reliable. |
| **Google Sheets Database** with automatic check-in timestamps | Self-hosted enterprise SQL server | Google Sheets allows instant manual overrides by secretariat members if needed. |


### 1.4 Failsafes & Contingency Rules (What If Things Go Wrong?)
- **What if the venue Wi-Fi slows down or drops?**
  - *Contingency:* The scanner web application caches attendee rosters locally. If the internet drops for 60 seconds, it continues validating passes offline and syncs the records once connectivity returns. A printed physical master roster sorted alphabetically by club with 5-digit PINs is kept at Usher Station 1 as an ultimate fallback.
- **What if an attendee's phone battery is drained?**
  - *Contingency:* The usher types their 5-digit code or surname into the search bar on the scanner screen. Check-in takes under 5 seconds.
- **What if an unlisted or proxy attendee shows up?**
  - *Contingency:* The scanner alerts the usher with *"Unrecognized Code"*. The usher directs the attendee to the Secretariat Helpdesk immediately, keeping the main entrance line moving freely.
- **How does this enforce the ₱500 No-Show Penalty?**
  - *Contingency:* The moment registration closes at 01:00 PM, a single spreadsheet filter extracts all rows with "Check-in Status: Pending". This creates the official, dispute-free non-attendance billing list within 10 seconds.

### 1.5 Client Acceptance Criteria (How We Know the MVP Succeeded)
- **Speed:** Entrance processing takes ≤ 3 seconds per attendee under steady line conditions.
- **Zero Duplicate Entries:** Scanning the same pass a second time immediately displays *"Already Checked In at [Time]"* in bright orange.
- **VIP Notification Latency:** Telegram alerts arrive on leadership phones within 3 seconds of the door scan.
- **Data Accuracy:** 100% match between attendees who entered and final marked rows in Google Sheets.

# PART 2: FOR THE DEVELOPERS & TECHNICAL TEAM

*(Technical architecture, component responsibilities, data contracts, API schemas, and deployment protocols.)*

### 2.1 System Architecture & Data Flow

[ Attendee Mobile Pass ] (QR Code payload: "CCO-XXXXX")
         │
         ▼
[ Usher Web Scanner (PWA) ] ──(HTTPS POST /api/checkin)──► [ Google Apps Script Gateway ]
         │                                                            │
         │ (Instant Audio/Visual Feedback)                            ├──► [ Google Sheets DB ] (Master Attendance Log)
         │                                                            │      - Write status: "ATTENDED"
         │                                                            │      - Write timestamp: ISO8601
         │                                                            │
         ▼                                                            ├──► [ Telegram Bot API ] (VIP Trigger Only)
[ Projector Display App ] ◄──(HTTPS GET /api/recent?limit=10)────────┘      - Escort notification payload
  (Polls every 4000ms for live visual wall)

### 2.2 Database Schema (Google Sheets Master Record)

The database resides in a Google Sheet tab named Master_Attendance. Columns **A** through **H** are populated pre-event. Columns **I** through **K** are written dynamically by the check-in engine.

| **Col** | **Field Name** | **Data Type** | **Sample Value** | **Description / Constraints** |
|---|---|---|---|---|
| **A** | email | String | sample.attendee@example.com | Unique attendee email |
| **B** | full_name | String | Juan D. Dela Cruz | Display name |
| **C** | org_classification | String | Academic Organization | Academic or Independent |
| **D** | club_name | String | Civil Engineering Students Association | Full organization name |
| **E** | designation | String | Outgoing President (AY 2025-2026) | Official role |
| **F** | ticket_type | Enum | Regular Attendee \| VIP Pass | Determines UI theme and alert triggers |
| **G** | attendance_code | String(5) | 48201 | Unique, non-repeating 5-digit number (Primary Key) |
| **H** | seat_allocation | String | Table 04 - Seat 02 | Physical seat assignment |
| **I** | photo_url | String(URL) | https://cdn.usep.edu.ph/photos/48201.jpg | Publicly accessible photo link (or fallback avatar) |
| **J** | checkin_status | Enum | PENDING \| CHECKED_IN | Default: PENDING |
| **K** | checkin_timestamp | ISO String | 2026-10-02T12:14:32+08:00 | Populated upon first successful scan |
| **L** | checked_in_by | String | Station 1 - Usher Alpha | Client identifier for audit logging |


### 2.3 API Interface & Endpoints (Google Apps Script Backend)

The Apps Script project must be deployed as a **Web App** with access set to:
- **Execute as:** *Me (Owner)*
- **Who has access:** *Anyone* (CORS-friendly for client-side JavaScript calls)

#### Endpoint 1: Attendee Check-In
- **Method:** POST
- **Content-Type:** application/json
- **Route Logic:** Handled via doPost(e)

##### Request Payload:

{
  "action": "checkin",
  "attendance_code": "48201",
  "device_id": "Scanner_Entrance_01"
}

##### Success Response (HTTP 200 equivalent / JSON return):

{
  "status": "SUCCESS",
  "message": "Attendee validated successfully.",
  "data": {
    "attendance_code": "48201",
    "full_name": "Juan D. Dela Cruz",
    "club_name": "Civil Engineering Students Association",
    "designation": "Outgoing President (AY 2025-2026)",
    "ticket_type": "Regular Attendee",
    "seat_allocation": "Table 04 - Seat 02",
    "photo_url": "https://placehold.co/150x150/1A56DB/ffffff.png?text=JDC",
    "checkin_timestamp": "2026-10-02T12:14:32+08:00"
  }
}

##### Duplicate Scan Response (HTTP 200 / Warning state):

{
  "status": "DUPLICATE",
  "message": "Attendee has already checked in.",
  "data": {
    "full_name": "Juan D. Dela Cruz",
    "initial_checkin_timestamp": "2026-10-02T12:14:32+08:00",
    "seat_allocation": "Table 04 - Seat 02"
  }
}

##### Not Found Response:

{
  "status": "NOT_FOUND",
  "message": "Attendance code does not exist in master records."
}

#### Endpoint 2: Recent Attendees Feed (For Live Projector Wall)
- **Method:** GET
- **Route Logic:** Handled via doGet(e) with query parameter action=recent

##### Query Parameters:
- action: recent
- limit: integer (default: 12)

##### Success Response:

{
  "status": "SUCCESS",
  "count": 3,
  "attendees": [
    {
      "full_name": "Dr. Maria S. Santos",
      "club_name": "United Physical Education Major Students",
      "designation": "Organization Adviser",
      "ticket_type": "VIP Pass",
      "seat_allocation": "VIP Table 01 - Seat 03",
      "photo_url": "https://placehold.co/150x150/B8860B/ffffff.png?text=MSS",
      "checkin_timestamp": "2026-10-02T12:20:11+08:00"
    },
    {
      "full_name": "Juan D. Dela Cruz",
      "club_name": "Civil Engineering Students Association",
      "designation": "Outgoing President (AY 2025-2026)",
      "ticket_type": "Regular Attendee",
      "seat_allocation": "Table 04 - Seat 02",
      "photo_url": "https://placehold.co/150x150/1A56DB/ffffff.png?text=JDC",
      "checkin_timestamp": "2026-10-02T12:14:32+08:00"
    }
  ]
}

### 2.4 Front-End Component Specifications

#### Component A: Usher Mobile Scanner (scanner.html)
- **Core Engine:** Integrated html5-qrcode library (minified, single file via CDN).
- **Camera Controls:** Defaults to environmental back camera (facingMode: "environment"). Includes flashlight toggle button if supported by hardware.
- **Scan Throttling & Debounce:** Once a QR code string is detected, freeze scanner frame for 2.0 seconds to prevent multiple duplicate requests over the network.
- **Audio Feedback Engine:**
  - **Success:** High-pitch two-tone chime (audio/wav synth or Web Audio API 800Hz -> 1200Hz).
  - **Duplicate:** Mid-pitch warning alert (440Hz -> 440Hz).
  - **Not Found / Error:** Low-pitch buzz (200Hz).
- **UI Color Flash:**
  - Full-screen background flashes **Green** on success.
  - Full-screen background flashes **Amber** on duplicate.
  - Full-screen background flashes **Red** on error.
- **Manual Fallback Input:** Persistent numeric text field at bottom with a large Search / Validate button for typing 5-digit PINs.

#### Component B: Projector Live Visual Wall (display.html)
- **Polling Cycle:** Automatically triggers GET ?action=recent&limit=16 every 4000 ms.
- **Layout Grid:**
  - **Top Hero Banner:** "Recent Arrivals" row featuring the last 3 attendees with large animated portrait cards.
  - **Main Body:** Fluid masonry/grid showing all checked-in attendees.
- **Card Styling Specification:**
  - **VIP Attendees:** Border: 3px solid #B8860B (Gold), Badge background: #B8860B, Badge text: "VIP PASS". Soft golden card glow (box-shadow: 0 0 15px rgba(184, 134, 11, 0.4)).
  - **Regular Attendees:** Border: 3px solid #1A56DB (Royal Blue), Badge background: #1A56DB, Badge text: "DELEGATE".
- **Transition Dynamics:** CSS fade-in and slide-up transformations (300ms ease-out) when new attendees arrive to ensure visual polish on the big screen.

#### Component C: VIP Notification Relay (Telegram Webhook)

Triggered within the Apps Script doPost function whenever ticket_type === "VIP Pass".
- **API Target:** https://api.telegram.org/bot<BOT_TOKEN>/sendMessage
- **Chat ID:** Target Usher Leadership Group Chat ID.
- **Message Template:**
⭐ VIP ARRIVAL DETECTED ⭐
Name: {full_name}
Role: {designation} ({club_name})
Assigned Seat: {seat_allocation}
Time: {formatted_time}

👉 Designated Escort: Usher Lead please acknowledge and proceed to Entrance.

### 2.5 Reliability, Concurrency & Security Guardrails
- **Google Sheets Concurrency Handling:**
  - Apps Script functions executing cell writes must be wrapped inside LockService.getScriptLock():
const lock = LockService.getScriptLock();
try {
  lock.waitLock(10000); // Wait up to 10 seconds for open lock
  // Perform Sheet lookup & update
} finally {
  lock.releaseLock();
}
  - This prevents race conditions when Usher 1 and Usher 2 scan attendees at the exact same millisecond.
- **Quota Management:**
  - Google Apps Script allows up to 20,000 URL fetch calls/day and 6 minutes execution time per call.
  - A batch of 300 attendees scanning over a 60-minute window will consume less than 2% of the daily quota.
- **Network Resilience (Local Storage Buffer):**
  - If fetch() fails due to venue signal dropout, the scanner records the code and timestamp in localStorage.getItem("offline_scans").
  - A flashing yellow status banner appears: *"Offline Mode - Recording Locally"*.
  - When connectivity resumes, the scanner dispatches the queued array to an /api/sync bulk endpoint.

### 2.6 Developer Pre-Flight Deployment Checklist
- [ ] **Data Sanitization:** Validate that all 300 attendees have unique, locked 5-digit PINs in Column G. No live formulas (=CHOOSEROWS(...) or =RANDARRAY(...)) remain in the sheet.
- [ ] **Locking Script Deployment:** Verify Apps Script web app is deployed with versioning enabled and CORS headers present (ContentService.MimeType.JSON).
- [ ] **Telegram Bot Token:** Confirm the Telegram bot is added as an administrator to the Usher Leadership group chat and test a dummy ping.
- [ ] **Camera Permission Testing:** Test scanner.html on both Android (Chrome) and iOS (Safari) to ensure permissions persist across screen sleep cycles.
- [ ] **Projector Resolution Check:** Open display.html on an external 1080p and 4K display output to verify layout responsiveness without horizontal scrollbars.
- [ ] **Paper Backup Printing:** Print 2 copies of the alphabetical master checklist with seat numbers and PINs for the Secretariat triage desk.

