# CFSP Smoke Tests

Run these before external tester sessions, demos, production pushes, or pilot review sessions.

## Build And Tooling
- `npm run lint` passes.
- `npx tsc --noEmit` passes.
- `npm run build` passes.
- `/admin/sandbox` loads for platform owners and org admins only.
- `/admin/sandbox` diagnostics show the shared sandbox org, access code, events, SP profiles, staff/faculty, assignments, and first five events.
- Guarded Daniel login creation uses Supabase Auth admin tools or `CFSP_ALLOW_DEMO_SEED=true CFSP_DEMO_SEED_TARGET=dev CFSP_DANIEL_TEST_OPERATOR_TEMP_PASSWORD="..." npm run seed:demo -- --write --create-daniel-auth` only after the Supabase target is confirmed safe.
- `tsconfig.tsbuildinfo` is not staged or committed.

## Sandbox Operator
- Sign in as admin or Sim Ops.
- Open `/demo/operator`.
- Confirm SP users are not shown the operator checklist.
- Confirm the page reminds operators to use shared sandbox data only.
- Confirm the active organization is **CFSP Sandbox Simulation Center**.
- Confirm quick links to `/events`, `/settings`, and `/sp` work.
- Confirm readiness counts do not expose real SP emails, phone numbers, invite tokens, token hashes, or private notes.

## External Tester Access
- Open `/request-access`.
- Submit a request using access code `CFSP-SANDBOX`.
- Confirm the request appears for admin review.
- Approve the tester as `sim_ops` by default.
- Confirm the admin request row shows:
  - Auth user exists: Yes
  - Org membership exists: Yes
  - Assigned role: Sim Ops
  - Invite status: invite sent, setup link generated, or a clear not-sent state
- Use Send Invite and confirm the UI reports whether Supabase sent the invite email.
- Use Copy Invite Link and confirm the generated link is copied or displayed only after the explicit admin action.
- Confirm the tester can open the invite/setup link, set a password, and sign in.
- Confirm the tester lands in `/dashboard` or can open `/events` after login.

## Showcase Event
- Sign in as admin or Sim Ops.
- Open `/events`.
- Confirm the eight serious sandbox events appear on the Events Board for **CFSP Sandbox Simulation Center**.
- Open **Neurologic Assessment: Stroke Warning Signs**.
- Confirm the Event Command Center shows serious, realistic event content.
- Confirm Daniel Test Operator is visible as Sim Ops owner/staff for the showcase event.
- Confirm readiness risks are visible:
  - 1 SP not checked in
  - Room 4 not ready
  - Faculty guide pending final review
  - Learner flow at risk
- Confirm the recommended next action points toward the urgent SP/Room 4 fix.

## SP Assignment Or Replacement
- From the showcase event, inspect Staffing / SP Hiring.
- Confirm the assigned SPs and backup coverage are visible.
- Assign or replace an SP in a safe sandbox workflow.
- Refresh and confirm the assignment state persists.

## Room And Material Readiness
- Open Room Operations or the relevant readiness panel.
- Confirm Room 4 is marked not ready or described as the room readiness risk.
- Open Materials / Case Files.
- Confirm the faculty guide is pending final review.
- Confirm case/material links use fake/sandbox-safe URLs only.

## Communication Preview Safety
- Open Event Communication Coverage as admin or Sim Ops.
- Confirm seeded SP contacts are `.invalid` or Cory-controlled aliases.
- Preview communications without sending real bulk email.
- Confirm no raw invite URL or token hash is displayed except in an explicit invite creation response.

## Admin Creates Open Shift
- Sign in as admin or Sim Ops.
- Open an event command center.
- Create a shift opening with title, date, start time, end time, location/room, needed count, requirements, and notes.
- Confirm the shift appears in SP Shift Offers.
- Confirm optional panel failures show structured warnings, not raw HTML.

## SP Accepts Shift
- Sign in as a linked SP or use a safe Cory-controlled demo SP account.
- Open `/sp`.
- Confirm only portal-visible open shifts appear.
- Click Accept on a shift.
- Confirm `Saved` feedback appears only after backend success.
- Refresh `/sp` and confirm the response remains accepted.

## Attendance Persists
- As admin or Sim Ops, mark an SP arrived or checked in.
- Refresh the event page.
- Confirm the attendance status persists.
- Mark checked out and confirm checked-out time appears where expected.

## Attendance Live Sync
- Open the same event in two staff windows.
- Change SP attendance in one window.
- Confirm the other window updates through live sync or shows the refreshed state after the configured fallback.

## SP Own-Attendance Privacy
- Sign in as an SP.
- Open `/sp`.
- Confirm the SP sees only their own attendance records.
- Confirm they cannot modify attendance in this phase.
- Confirm no other SP names, emails, phone numbers, notes, invite history, or roster data appear.

## CFSP Guide
- Open CFSP Guide.
- Confirm the tester-oriented checklist includes the showcase event, readiness risks, SP replacement, rooms/materials, communications preview, new event creation, and feedback.
- Complete a step and confirm progress saves.
- Dismiss and reopen the guide.
- Confirm guide-state API failures do not break core dashboard/event loading.

## Settings Save
- Open the communication settings panel.
- Change default communication mode or workflow toggles.
- Save settings.
- Confirm saved state persists after refresh.
- Confirm failed saves show route/status/message diagnostics.

## Screenshot QA
- Capture fake sandbox data only.
- Confirm screenshots do not include real institutional names, real SP/student/patient data, raw invite URLs, token hashes, email addresses, phone numbers, or private notes.

## Migration Applied Checks
- Confirm organization tables exist: `organizations`, `organization_memberships`, `organization_access_codes`, and `access_requests`.
- Confirm communication tables exist: `organization_communication_settings`, `sp_communication_preferences`, and `sp_portal_invites`.
- Confirm onboarding table exists: `user_onboarding_states`.
- Confirm event operations tables exist for shift openings, shift responses, and SP attendance.
