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

## Seed Strategy
The preferred safe local planning command is:

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
