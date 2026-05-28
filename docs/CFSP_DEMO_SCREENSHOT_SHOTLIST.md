# CFSP Demo Screenshot Shot List

Use this list for design partner screenshots and short demo recordings. Capture only fake data from **CFSP Demo Health Sciences Center** or another clearly labeled fake workspace.

## Privacy Reminder
- Do not show real institutional, SP, student, patient, faculty, roster, email, phone, invite, or token data.
- Keep invite links treated as sensitive. Raw invite links appear only once when created.
- Before capture, run `npm run seed:demo -- --verify` and confirm the active organization badge says `Demo Data`.

## Shots

### Demo Operator Page
- Purpose: Show the internal checklist, safety reminders, and readiness counts.
- Recommended fake demo data: Active organization `CFSP Demo Health Sciences Center`.
- What not to show: Browser history, real org switcher options, raw invite messages.
- Privacy reminder: Counts are enough; avoid drilling into any non-demo organization.

### Event Command Center
- Purpose: Show CFSP as the operations home for a simulation event.
- Recommended fake demo data: `Nursing Simulation Week`.
- What not to show: Real faculty names, real course IDs, real uploaded files.
- Privacy reminder: Keep the demo badge visible when possible.

### SP Shift Offers
- Purpose: Show open shift creation and response counts.
- Recommended fake demo data: `Morning inpatient case SP` or `Family member role`.
- What not to show: Real SP emails, phone numbers, private notes, or hidden/private shifts.
- Privacy reminder: Use seeded fake SPs only.

### SP Communication Coverage
- Purpose: Show hybrid portal, email, Microsoft Forms, manual, and do-not-contact coverage.
- Recommended fake demo data: Barbara Ellis, James Morton, Angela Price, Miguel Rivera, Linda Chen, Robert Graham, Evelyn Brooks, Priya Shah.
- What not to show: Real contact information, invite history, token hashes, or admin-only notes outside the admin UI.
- Privacy reminder: This panel is admin/operator-only and must not be shown from an SP account.

### Invite Onboarding Page
- Purpose: Show friendly invite validation and sign-in guidance.
- Recommended fake demo data: A newly created fake invite message, if safe.
- What not to show: Raw invite URL after the one-time creation moment unless the walkthrough explicitly needs it.
- Privacy reminder: Treat invite URLs like passwords during screenshots.

### SP Portal Open Shifts
- Purpose: Show the SP-safe view of available work.
- Recommended fake demo data: A linked fake SP account or narrated seeded open shifts.
- What not to show: Other SPs' attendance, responses, phone numbers, email addresses, roster data, invite history, or admin notes.
- Privacy reminder: SP users should only see their own SP-facing data.

### SP Response Saved
- Purpose: Show Accept, Maybe, or Decline saving after backend success.
- Recommended fake demo data: Accept `Morning inpatient case SP`.
- What not to show: Network inspector payloads with identifiers unless scrubbed.
- Privacy reminder: Do not show another SP's response.

### Live Attendance And Check-In
- Purpose: Show day-of status changing and syncing.
- Recommended fake demo data: `Live Event Command Center Demo`, Barbara Ellis checked in, Miguel Rivera arrived.
- What not to show: Real attendance, payroll details, or private staffing notes.
- Privacy reminder: SP portal attendance remains own-status only.

### CFSP Guide
- Purpose: Show guided onboarding and progress.
- Recommended fake demo data: Admin first-run guide or SP portal guide in fake account context.
- What not to show: Real user profile details or non-demo workspaces.
- Privacy reminder: The guide is rule-based, not true AI.

### Settings Communication Panel
- Purpose: Show organization-level hybrid communication defaults.
- Recommended fake demo data: Hybrid mode with portal, email, Microsoft Forms, and manual workflows enabled.
- What not to show: Real reply-to addresses, real Microsoft Forms URLs, or production email settings.
- Privacy reminder: Use `.invalid` addresses and fake Forms URLs.
