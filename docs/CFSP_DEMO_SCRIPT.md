# CFSP Sandbox Walkthrough Script

## Opening Pitch
CFSP is a simulation operations command center for planning, staffing, communicating, and running simulation events live.

Use this as a 7-10 minute external tester walkthrough. Keep the tone concrete: the goal is to show the serious operations workflow, not the public marketing demo.

## Pre-Walkthrough Setup
- Confirm the active organization is **CFSP Sandbox Simulation Center**.
- Open `/admin/sandbox` as a platform owner or org admin and confirm the sandbox diagnostics are healthy.
- Use the repair action on `/admin/sandbox` if events, SP profiles, staff/faculty, or assignments are missing.
- If Daniel needs a direct temporary login, create it separately with Supabase Auth admin tools or the guarded legacy seed command using `CFSP_DANIEL_TEST_OPERATOR_TEMP_PASSWORD`.
- Open `/demo/operator` as an admin or Sim Ops user if you want the internal checklist.
- Do not use real institutional, student, patient, faculty, SP, invite, phone, email, or roster data.
- Do not send bulk email from seeded sandbox data.

## Tester Access Flow
1. Send testers to `/request-access`.
2. Give them the organization access code `CFSP-SANDBOX`.
3. Approve requests as `sim_ops` by default.
4. After login, send testers to `/events` and ask them to open **Neurologic Assessment: Stroke Warning Signs**.

## Walkthrough Flow
1. Open `/events`.
2. Open **Neurologic Assessment: Stroke Warning Signs**.
3. Confirm Daniel Test Operator is visible as the Sim Ops owner/staff contact for the showcase event.
4. In the Event Command Center, find the readiness risks:
   - 1 SP not checked in
   - Room 4 not ready
   - Faculty guide pending final review
   - Learner flow at risk
5. Use staffing coverage to decide whether to contact the missing SP or move the backup into Room 4.
6. Review Room Operations and Materials for Room 4 setup, case files, and the faculty guide.
7. Preview SP communications and communication coverage without sending real bulk email.
8. Create a new event from `/events/new`.
9. Submit feedback through `/contact` or the agreed tester feedback channel.

## Value Points
- Replaces spreadsheet and email chaos with one operations workspace.
- Makes day-of readiness risks visible across staffing, rooms, materials, and learner flow.
- Supports partial SP onboarding instead of forcing a big-bang portal rollout.
- Preserves email-preview, Microsoft Forms-preview, and manual workflows during adoption.
- Gives simulation operations teams a live operating picture.
- Keeps SP users inside a privacy-safe view of only their own SP-facing information.

## Suggested Talk Track
"This sandbox event is intentionally close to a real event-day problem. One SP is not checked in, Room 4 is not ready, the faculty guide still needs final review, and learner flow is at risk. CFSP brings those signals into one place so the operator can decide the next action before learners are released."

## Closing Ask
What would need to be clearer, faster, or more trustworthy for your team to use this during a real simulation event?

## Follow-Up Questions
- Which readiness risk would your team handle first?
- Where would your current workflow track that SP or room issue?
- Which communications should remain preview-only until explicitly approved?
- What would your staff need to trust this during a live event?
