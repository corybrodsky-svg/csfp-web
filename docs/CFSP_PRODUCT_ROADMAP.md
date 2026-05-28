# CFSP Product Roadmap

## Product Identity
Simulation operations command center for planning, staffing, communicating, and running simulation events live.

## Product Pillars
1. Live Org Operations
2. SP Self-Service Portal
3. Hybrid Communications
4. Guided Onboarding Assistant

## Completed Phases
- Phase 1: SP shift offers/responses/attendance foundation - `c99a4d36`
- Phase 2: Live attendance sync - `a1632ff0`
- Shift autofill polish - `1126d81f`
- Phase 3: SP Portal MVP - `191f3d93335e3194c608633461f5021a717b4492`
- Phase 4: Hybrid SP Communication Preferences - `e25dcd52fd6014058241f299cab902dd368f9194`
- Phase 4B: SP Portal Invite and Onboarding Flow - `e52f49d235d628a1988dad5d6a06554333643a23`
- Phase 5: Guided Onboarding Assistant - `8539cd50`
- Phase 6: Demo and Pilot Readiness Assets - `1997e26b`

## Current Phase
- Phase 6B: Demo Polish and Operator Flow

## Core MVP Loop
CFSP now has the core MVP loop needed for design partner conversations:

1. Admin creates a portal-visible open shift.
2. SP responds from the SP Portal.
3. Staff tracks communication and onboarding preferences.
4. Staff can invite SPs to the portal while preserving email, Microsoft Forms, and manual workflows.
5. Attendance updates live for day-of-event operations.
6. CFSP Guide supports first-time users through the main workflows.
7. Demo operators can use `/demo`, seed verification, demo badges, and a screenshot shot list to keep walkthroughs safe and repeatable.

## Why Phase 6 Matters
Phase 6 makes the product demo-ready by adding fake demo data guidance, repeatable seed tooling, a design partner demo script, a pilot readiness checklist, and smoke tests. Phase 6B adds seed verification, an authenticated demo operator checklist, a subtle `Demo Data` badge, screenshot guidance, and wording polish along the core demo path.

This keeps pilot conversations focused on workflow value without risking real institutional, student, patient, or SP data.

## Phase 6B Status
- `/demo` is an internal admin/Sim Ops operator page.
- `npm run seed:demo -- --verify` checks the seeded fake demo organization without writing data.
- Demo screenshots should follow `docs/CFSP_DEMO_SCREENSHOT_SHOTLIST.md`.
- Demo data must stay fake and clearly labeled. Do not add real institutional data.

## Next Phases
- Phase 4C: optional real email delivery for portal invites
- Phase 2B: staff presence
- Phase 7: design partner pilot packaging
- Phase 8: billing/licensing foundation

## Security Principle
SP users only see their own SP-facing information.

## Hybrid Transition Principle
CFSP must support portal, email, Microsoft Forms, and manual workflows during adoption.

## Demo Data Principle
Demo and pilot-readiness assets must use fake, clearly labeled data only. No PHI, real patient data, student grades, or real institutional data belongs in the demo organization.
