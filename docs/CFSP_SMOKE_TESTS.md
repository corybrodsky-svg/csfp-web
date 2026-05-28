# CFSP Smoke Tests

Run these before demos, production pushes, or pilot review sessions.

## Build And Tooling
- `npm run lint` passes.
- `npx tsc --noEmit` passes.
- `npm run build` passes.
- `npm run seed:demo -- --dry-run` prints the fake demo data plan without writing.
- `npm run seed:demo -- --verify` passes when demo data is seeded, or exits with a controlled missing-data message that points to `CFSP_ALLOW_DEMO_SEED=true npm run seed:demo -- --write`.
- `tsconfig.tsbuildinfo` is not staged or committed.

## Demo Operator
- Sign in as admin or SimOps.
- Open `/demo`.
- Confirm SP users are not shown the operator checklist.
- Confirm the page reminds operators to use fake demo data only.
- Confirm the active demo organization shows `Demo Data`.
- Confirm quick links to `/events`, `/settings`, and `/sp` work.
- Confirm readiness counts do not expose SP emails, phone numbers, invite tokens, token hashes, or private notes.

## Admin Creates Open Shift
- Sign in as admin or SimOps.
- Open an event command center.
- Create a shift opening with title, date, start time, end time, location/room, needed count, requirements, and notes.
- Confirm the shift appears in SP Shift Offers.
- Confirm optional panel failures show structured warnings, not raw HTML.

## SP Accepts Shift
- Sign in as a linked SP or use a safe demo SP account.
- Open `/sp`.
- Confirm only portal-visible open shifts appear.
- Click Accept on a shift.
- Confirm `Saved` feedback appears only after backend success.
- Refresh `/sp` and confirm the response remains accepted.

## Admin Sees Response
- Return to the event command center.
- Refresh shift responses.
- Confirm the accepted response is visible to staff.
- Confirm other SP private data is not exposed in the SP portal.

## Attendance Persists
- As admin/SimOps, mark an SP arrived or checked in.
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

## Communication Preference Update
- Open Event Communication Coverage as admin/SimOps.
- Change an SP preferred mode and portal status.
- Save the row.
- Refresh and confirm the saved values remain.
- Confirm counts update without exposing email or phone unless already present in admin-only UI.

## Portal Invite Create, Accept, Revoke
- Create a portal invite for an unlinked SP.
- Confirm raw invite URL/message appears only in the creation response/UI.
- Confirm token hash is never displayed.
- Open the invite page while signed out and confirm the sign-in guidance is friendly.
- Sign in with the matching email and accept the invite.
- Confirm redirect to `/sp`.
- Create another invite and revoke it.
- Confirm revoked invite cannot be accepted.

## CFSP Guide
- Open CFSP Guide.
- Complete a step and confirm progress saves.
- Dismiss and reopen the guide.
- Reset progress if the UI exposes reset.
- Confirm guide-state API failures do not break core dashboard/event loading.

## Settings Save
- Open the communication settings panel.
- Change default communication mode or workflow toggles.
- Save settings.
- Confirm saved state persists after refresh.
- Confirm failed saves show route/status/message diagnostics.

## Screenshot QA
- Use `docs/CFSP_DEMO_SCREENSHOT_SHOTLIST.md`.
- Capture fake demo data only.
- Confirm screenshots do not include real institutional names, real SP/student/patient data, raw invite URLs, token hashes, email addresses, phone numbers, or private notes.

## Migration Applied Checks
- Confirm Phase 4 tables exist: `organization_communication_settings` and `sp_communication_preferences`.
- Confirm Phase 4B table exists: `sp_portal_invites`.
- Confirm Phase 5 table exists: `user_onboarding_states`.
- Confirm Phase 1/2 tables exist for shift openings, shift responses, and SP attendance.
