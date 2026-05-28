# CFSP Demo Data

## Purpose
The CFSP demo data set is for design partner walkthroughs, internal QA, and pilot-readiness practice. It creates a fake demo organization named **CFSP Demo Health Sciences Center** with fake events, fake SPs, fake shift openings, fake responses, fake attendance statuses, and fake communication preferences.

CFSP demo data must never contain real institutional, student, patient, faculty, or standardized patient data.

## Fake-Data-Only Rule
- Do not use PHI.
- Do not use real patient cases.
- Do not use student names, grades, IDs, emails, or performance data.
- Do not use real SP phone numbers or personal email addresses.
- Use `.invalid` email domains for seeded demo contacts.
- Treat invite links as sensitive if you create them manually through the app.
- Raw invite tokens are only shown once by the invite creation route and are not created by the demo seed script.

## Seed Strategy
The preferred seed path is the guarded script:

```bash
npm run seed:demo -- --dry-run
```

To verify that the fake demo organization and core records exist without writing data:

```bash
npm run seed:demo -- --verify
```

To write fake demo data to Supabase, run only after confirming the target environment is safe for demo data:

```bash
CFSP_ALLOW_DEMO_SEED=true npm run seed:demo -- --write
```

The script refuses to write unless `CFSP_ALLOW_DEMO_SEED=true` is present. If verify mode reports missing demo data, run the guarded write command above in a safe demo environment only.

## Required Environment Variables
Write mode requires:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
CFSP_ALLOW_DEMO_SEED=true
```

`SUPABASE_URL` may be used instead of `NEXT_PUBLIC_SUPABASE_URL`.

Verify mode uses the same Supabase URL and service-role key, but it does not mutate data and does not require `CFSP_ALLOW_DEMO_SEED`.

Do not commit `.env` files or service-role keys.

## Phase 6B Demo Operator
Phase 6B adds `/demo`, an authenticated internal operator page for admins and Sim Ops. Use it before design partner conversations to confirm the active organization is demo-safe, follow the walkthrough checklist, and remind the team to run dry-run, verify, and smoke tests.

SP users should not use `/demo`. They should remain in `/sp`, where they can see only their own SP-facing shifts, responses, and attendance status.

## Data Created
The seed creates or updates:

- Organization: `CFSP Demo Health Sciences Center`
- Fake SPs: Barbara Ellis, James Morton, Angela Price, Miguel Rivera, Linda Chen, Robert Graham, Evelyn Brooks, Priya Shah
- Fake events: Nursing Simulation Week, PA OSCE Clinical Reasoning Lab, SP Training Workshop, Multi-room IPE Event, Live Event Command Center Demo
- Event sessions for each event
- SP assignments where supported by the current schema
- Portal-visible shift openings
- Shift responses with portal, email, Microsoft Forms, and manual sources
- SP attendance examples for not arrived, arrived, checked in, checked out, no-show, and excused states
- Organization communication settings
- SP communication preferences for portal-ready, email-only, Microsoft Forms, manual, do-not-contact, invited, and needs-help examples

The script does not create auth users and does not create raw invite tokens.

## Idempotency
The seed is designed to be idempotent. It looks up demo records by stable organization slug, event names, SP names, event/opening keys, and SP relationships before inserting. Running it again should update the demo data instead of duplicating it.

## Reset Or Reseed
For a normal refresh, rerun:

```bash
CFSP_ALLOW_DEMO_SEED=true npm run seed:demo -- --write
```

For a full cleanup, remove records marked with `CFSP_PHASE6_DEMO_FAKE_DATA` and the demo organization only after confirming you are not in a real pilot workspace.

## Known Limitations
- The seed represents linked/portal-ready SPs through communication preference status only; it does not create real auth users.
- The seed does not send email.
- The seed does not create Microsoft Graph or SMTP configuration.
- The seed does not create real invite URLs or token hashes.
- The seed assumes Phase 1 through Phase 4B database tables have been applied.
