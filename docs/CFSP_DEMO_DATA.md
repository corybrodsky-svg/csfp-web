# CFSP Sandbox Data

## Purpose
The shared sandbox data set is for external tester onboarding, design partner walkthroughs, internal QA, and pilot-readiness practice. It creates one fake organization:

- Name: **CFSP Sandbox Simulation Center**
- Slug: `cfsp-sandbox-simulation-center`

Do not create separate organizations per tester. Daniel from SimGhosts and future testers should request access to this same shared sandbox organization.

## Fake-Data-Only Rule
- Do not use PHI.
- Do not use real patient cases.
- Do not use student names, grades, IDs, emails, or performance data.
- Do not use real SP records, personal phone numbers, or personal email addresses.
- Seeded non-portal contacts use `.invalid` addresses.
- Portal test aliases use Cory-controlled `@conflictfreesp.com` addresses.
- The seed does not send email, create bulk outbound jobs, or create raw invite tokens.
- Treat invite links as sensitive if you create them manually through the app.

## Tester Entry Path
External testers should use `/request-access` with the organization access code:

```text
CFSP-SANDBOX
```

The access code defaults requests to `sim_ops` and requires manual approval. Approve external testers as `sim_ops` unless they explicitly need organization/user administration.

## Sandbox Manager Workflow
Use the deployed app instead of local terminal seeding for normal sandbox setup and repair.

1. Sign in as a `platform_owner` or `org_admin`.
2. Open `/admin/sandbox`.
3. Review the diagnostics for the shared sandbox org, access code, events, SP profiles, staff/faculty, assignments, and first five events.
4. If data is missing or mis-scoped, type the confirmation phrase shown on the page and run repair.
5. Open `/events` with the sandbox organization active and confirm the eight sandbox events are visible.

The Sandbox Manager uses server-side Supabase admin access only. It does not expose the service role key to the browser, does not send email, and does not create a Daniel Auth login.

## Legacy Terminal Fallback
Terminal seeding is now a fallback for local development only. Prefer `/admin/sandbox` for deployed repair.

The safe local planning command is:

```bash
npm run seed:demo -- --dry-run
```

To verify that sandbox records exist without writing data:

```bash
npm run seed:demo -- --verify
```

To write fake sandbox data to a non-production Supabase project only:

```bash
CFSP_ALLOW_DEMO_SEED=true CFSP_DEMO_SEED_TARGET=dev npm run seed:demo -- --write
```

To also create or update Daniel's guarded temporary tester login in a safe non-production project:

```bash
CFSP_ALLOW_DEMO_SEED=true CFSP_DEMO_SEED_TARGET=dev CFSP_DANIEL_TEST_OPERATOR_TEMP_PASSWORD="..." npm run seed:demo -- --write --create-daniel-auth
```

Do not run write mode against live/production Supabase until the target project/database has been explicitly reviewed.

## Required Environment Variables
Write and verify modes require:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`SUPABASE_URL` may be used instead of `NEXT_PUBLIC_SUPABASE_URL`.

Write mode also requires:

```bash
CFSP_ALLOW_DEMO_SEED=true
CFSP_DEMO_SEED_TARGET=dev
```

Do not commit `.env` files or service-role keys.

## Data Created
The seed creates or updates:

- Organization: `CFSP Sandbox Simulation Center`
- Organization access code: `CFSP-SANDBOX`, default requested role `sim_ops`, manual approval required
- Fake faculty and simulation-operations staff
- Fake SP profiles using `.invalid` addresses plus Cory-controlled SP portal aliases
- Organization communication settings with preview/test-safe messaging
- Daniel Test Operator (`daniel.tester@conflictfreesp.com`) as the visible Sim Ops owner on several events, especially **Neurologic Assessment: Stroke Warning Signs**
- SP communication preferences for portal, email-preview, Microsoft Forms-preview, and manual workflows
- Eight realistic events:
  - Acute Chest Pain Assessment OSCE
  - Interprofessional Discharge Planning Simulation
  - Behavioral Health De-escalation Encounter
  - Pediatric Asthma Caregiver Communication OSCE
  - Medication Reconciliation and Patient Education Lab
  - End-of-Life Goals of Care Conversation
  - Neurologic Assessment: Stroke Warning Signs
  - Telehealth Follow-Up Visit Simulation
- Event sessions for each event
- SP assignments and backup/at-risk coverage examples
- Portal-visible shift openings
- Attendance examples, including the showcase day-of risk

## Showcase Event
Use **Neurologic Assessment: Stroke Warning Signs** as the Event Command Center showcase.

Seeded day-of readiness issues:

- 1 SP not checked in
- Room 4 not ready
- Faculty guide pending final review
- Learner flow marked at risk
- Recommended next action points the operator to resolve the most urgent SP/Room 4 blocker before learner release

## Idempotency
The seed is designed to be idempotent. It looks up records by stable organization slug, access code, event names, SP email addresses, event/session keys, and event/SP assignment pairs before inserting. Running it again should update the sandbox data instead of duplicating organizations, events, SPs, staff, or assignments.

The seed also repairs the common sandbox-org mismatch where an org was created by name before the canonical slug existed. On write, it:

- Chooses the canonical org with slug `cfsp-sandbox-simulation-center`
- Moves duplicate sandbox memberships and access requests to the canonical org
- Retires duplicate sandbox org rows
- Recreates the eight sandbox events under the canonical organization id

This keeps `/events` aligned with the active organization filter used by the Events Board.

## Why `/events` Can Show 0 Events
The Events Board calls `/api/events`, and that endpoint scopes rows to the active organization id:

- `events.organization_id` must match the active organization.
- Legacy `events.organization_id = null` rows are intentionally excluded from the normal dashboard list.
- Rows written under a duplicate sandbox organization do not appear when the active organization is the canonical sandbox org.

The `/admin/sandbox` diagnostics compare the active organization id, canonical sandbox org id, sandbox-named event rows by org id, and null-org event counts. If events exist under the wrong org or not at all, repair recreates the eight sandbox events under `cfsp-sandbox-simulation-center`.

## Daniel Tester Login
Daniel is always included in seeded event owner/staff metadata as:

- Name: `Daniel Test Operator`
- Email: `daniel.tester@conflictfreesp.com`
- Role: `sim_ops`
- Organization: `CFSP Sandbox Simulation Center`

The app-based Sandbox Manager records Daniel visibly in sandbox staff/operator metadata and event notes. It does not create a Supabase Auth login for Daniel.

The legacy terminal seed links and updates Daniel if his Supabase Auth user already exists. It only creates a missing Daniel Auth login when `--create-daniel-auth` is included and `CFSP_DANIEL_TEST_OPERATOR_TEMP_PASSWORD` is provided. Do not commit or hardcode Daniel's password; share the temporary value out-of-band and rotate it after first login.

Manual Supabase Auth fallback:

1. Open the safe non-production Supabase project.
2. Go to Authentication -> Users.
3. Create `daniel.tester@conflictfreesp.com` with a temporary password and mark the email confirmed.
4. In `profiles`, upsert a row with the Auth user id, `full_name` `Daniel Test Operator`, `schedule_name` `Daniel Test Operator`, `email` `daniel.tester@conflictfreesp.com`, `role` `sim_op`, and `is_active` true.
5. In `organization_memberships`, upsert `organization_id` for `CFSP Sandbox Simulation Center`, the Daniel Auth `user_id`, `role` `sim_ops`, `status` `active`, and `approved_at` set.
6. Ask Daniel to change the temporary password after first login.

## Reset Or Reseed
For a normal refresh, rerun:

```bash
CFSP_ALLOW_DEMO_SEED=true CFSP_DEMO_SEED_TARGET=dev npm run seed:demo -- --write
```

For a cleanup, use reset mode only in a safe non-production sandbox target:

```bash
CFSP_ALLOW_DEMO_SEED=true CFSP_DEMO_SEED_TARGET=dev npm run seed:demo -- --reset
```

Reset mode deletes seeder-owned sandbox rows marked with `CFSP_SANDBOX_FAKE_DATA` in the sandbox organization. It does not send email.

## Known Limitations
- The seed represents linked/portal-ready SPs through communication preference status and Cory-controlled aliases; it does not automatically create external tester accounts.
- The seed does not send email.
- The seed does not create Microsoft Graph or SMTP configuration.
- The seed does not create real invite URLs or token hashes.
- Testers still need manual approval after submitting `/request-access`.
