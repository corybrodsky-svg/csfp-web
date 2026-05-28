# CFSP Design Partner Demo Script

## Opening Pitch
CFSP is a simulation operations command center for planning, staffing, communicating, and running simulation events live.

Use this as a 7-10 minute design partner walkthrough. Keep the tone concrete: the goal is to show how CFSP reduces coordinator friction without forcing every SP into a portal on day one.

## Pre-Demo Setup
- Confirm the active organization is **CFSP Demo Health Sciences Center** and the app shows the `Demo Data` badge.
- Run `npm run seed:demo -- --dry-run`.
- Run `npm run seed:demo -- --verify`.
- Open `/demo` as an admin or Sim Ops user and use the checklist during the walkthrough.
- Do not use real institutional, student, patient, faculty, SP, invite, phone, email, or roster data.

## Demo Flow
1. Open `/demo` and confirm the safety reminders.
2. Open the demo organization, **CFSP Demo Health Sciences Center**.
3. Show the dashboard and event list, then use **Recently Worked On** if it is available from prior activity.
4. Open **Nursing Simulation Week**.
5. Show the Event Command Center and point out SP Shift Offers.
6. Add or review a portal-visible open shift using event/session context.
7. Show **SP Communication Coverage** and explain hybrid adoption: portal, email, Microsoft Forms, phone/manual, and do-not-contact statuses can coexist.
8. Invite an SP to the portal if safe in the environment, or show an already invited/linked demo status.
9. Switch to `/sp` as a demo SP if a safe demo account exists; otherwise narrate the SP view and show that SPs only see their own shifts, responses, and attendance.
10. Accept an open shift from the SP portal or narrate the same-origin API response flow.
11. Return to the admin event page and show the response surfaced for staff.
12. Mark an SP checked in from the attendance area.
13. Open a second staff window if available and describe the live attendance sync concept.
14. Open the CFSP Guide and show how first-time users can find the right workflow without needing a virtual assistant yet.

## Value Points
- Replaces spreadsheet and email chaos with one operations workspace.
- Supports partial SP onboarding instead of forcing a big-bang portal rollout.
- Preserves email, Microsoft Forms, and manual workflows during adoption.
- Gives day-of-event teams a live operating picture.
- Reduces coordinator mental load by connecting planning, staffing, communication, and live attendance.
- Keeps SP users inside a privacy-safe view of only their own SP-facing information.

## Suggested Talk Track
"A lot of simulation teams are not missing effort. They are missing a shared operating system. CFSP gives coordinators a place to plan the event, create SP shift needs, track who has responded, manage how each SP prefers to communicate, invite portal-ready SPs gradually, and run attendance live on event day."

## Closing Ask
Would a 30-60 day design partner pilot be useful for your program?

## Screenshot Support
Use `docs/CFSP_DEMO_SCREENSHOT_SHOTLIST.md` for the recommended Phase 6B screenshot sequence. Capture fake demo data only.

## Follow-Up Questions
- Which part of your current workflow creates the most coordinator rework?
- How many SPs would realistically use a portal in the first 30 days?
- Which workflows must remain email or Microsoft Forms during adoption?
- What would need to be true for your team to trust this during a live event?
