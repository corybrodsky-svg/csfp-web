# CFSP Pilot Readiness Checklist

## Security And Privacy
- Confirm no PHI is entered into demo or pilot events.
- Confirm no real patient data is used in demo records.
- Confirm no student grades or assessment outcomes are stored in CFSP.
- Confirm pilot users understand invite links are sensitive.
- Confirm raw invite tokens are shown only once and are never stored in the database.
- Confirm token hashes, private notes, invite history, other SP data, phone numbers, and email addresses are not exposed to SP users.

## SP Data Boundaries
- SP portal users can see only their own open-shift responses and attendance status.
- SP portal users cannot see other SPs' attendance, responses, private notes, emails, phone numbers, invite history, or raw invite URLs.
- Admin-only communication notes stay out of `/sp` and `/api/sp/portal`.
- Event Communication Coverage is admin/operator-only.

## Demo Data Rules
- Use only fake SP names, fake events, and `.invalid` emails.
- Clearly label demo records as fake.
- Do not seed real institutional data into the demo organization.
- Do not create real auth users unless a dedicated safe demo auth pattern exists.

## Organization Setup
- Confirm organization access code and membership behavior works.
- Confirm active organization switching does not expose another organization's events.
- Confirm platform-owner event visibility fallback still works where expected.
- Confirm organization communication settings can be loaded and saved.

## SP Onboarding
- Confirm linked SP detection resolves the correct SP account.
- Confirm unlinked SP users receive a friendly linked-profile message.
- Confirm portal-ready, invited, needs-help, disabled, and not-invited statuses display clearly.
- Confirm invite acceptance rejects mismatched email addresses when an invite email exists.

## Shift Offers
- Admin can create an open shift from event context.
- Required shift date, start time, and end time are captured.
- Portal-visible shifts appear in `/sp` only when visibility allows it.
- Email-only/private shifts do not leak to SP portal users.

## SP Portal
- SP can view open shifts.
- SP can respond Accept, Maybe, or Decline.
- SP response source is saved as `portal`.
- SP sees saved response feedback after backend success.
- SP can view their own responses and upcoming accepted items.
- SP can view their own attendance status only.

## Communication Preferences
- Admin can save organization defaults.
- Admin can save SP-level preferred mode and portal status.
- Communication Coverage counts update after preference changes.
- Email, Microsoft Forms, manual, do-not-contact, and portal-ready states are represented.

## Invite Flow
- Admin can create an invite for an unlinked SP.
- Raw invite URL is shown only once at creation time.
- Token hash is never returned to the UI.
- Invite landing page handles valid, invalid, expired, and unauthenticated states.
- Revoke flow prevents a revoked invite from being accepted.

## Live Attendance
- Admin can mark SP arrived, checked in, checked out, no-show, or excused.
- Attendance persists after reload.
- Live sync updates another staff window without manual refresh where supported.
- SP portal remains display-only for attendance in this phase.

## Guide And Onboarding
- CFSP Guide opens for the current role.
- Guide progress can be saved, dismissed, completed, and reset.
- Guide state failures do not break the dashboard or event page.
- Guide copy does not imply true AI behavior yet.

## Known Limitations
- Real email sending is not implemented yet.
- Microsoft Graph integration is not implemented yet.
- The guide is rule-based, not a true AI assistant.
- Demo SPs may be represented by communication status without real auth accounts.
- Pilot teams may need manual migration checks before enabling Phase 4/4B tables in production.

## Pre-Demo QA Checklist
- Run `npm run lint`.
- Run `npx tsc --noEmit`.
- Run `npm run build`.
- Run `npm run seed:demo -- --dry-run`.
- Confirm `/dashboard` loads.
- Confirm an event command center loads without raw HTML error bodies.
- Confirm `/sp` blocks or explains unlinked SP access safely.
- Confirm invite landing page invalid-token state is friendly.

## Post-Demo Feedback Questions
- What felt closest to your real workflow?
- What felt too complicated for coordinators?
- Which SP population would use the portal first?
- Which communication workflow must remain outside the portal longest?
- What information would you need on the dashboard to trust it during event week?
