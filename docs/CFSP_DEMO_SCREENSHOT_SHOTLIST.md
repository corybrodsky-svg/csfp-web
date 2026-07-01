# CFSP Sandbox Screenshot Shot List

Use this list for design partner screenshots and short recordings. Capture only fake data from **CFSP Sandbox Simulation Center**.

## Privacy Reminder
- Do not show real institutional, SP, student, patient, faculty, roster, email, phone, invite, or token data.
- Keep invite links treated as sensitive. Raw invite links appear only once when created.
- Before capture, run `npm run seed:demo -- --dry-run`; run verify only against a known safe sandbox Supabase target.
- Confirm the active organization is **CFSP Sandbox Simulation Center**.
- Do not send bulk email from seeded sandbox data.

## Shots

### Sandbox Operator Page
- Purpose: Show the internal checklist, safety reminders, and readiness counts.
- Recommended fake data: Active organization `CFSP Sandbox Simulation Center`.
- What not to show: Browser history, real org switcher options, raw invite messages.
- Privacy reminder: Counts are enough; avoid drilling into any non-sandbox organization.

### Event Command Center
- Purpose: Show CFSP as the operations home for a simulation event.
- Recommended fake data: `Neurologic Assessment: Stroke Warning Signs`.
- What to show: one SP not checked in, Room 4 not ready, faculty guide pending final review, learner flow at risk, and recommended next action.
- What not to show: Real faculty names, real course IDs, real uploaded files.

### SP Staffing And Replacement
- Purpose: Show how operators identify coverage and decide whether to contact the missing SP or move the backup into Room 4.
- Recommended fake data: Showcase event staffing/coverage area.
- What not to show: Real SP emails, phone numbers, private notes, or hidden/private shifts.
- Privacy reminder: Use seeded fake SPs only.

### Room And Material Readiness
- Purpose: Show room and materials readiness in the same command center context.
- Recommended fake data: Room 4 readiness issue and pending faculty guide.
- What not to show: Real case files, real institution files, real learner rosters, or production storage URLs.
- Privacy reminder: Seeded file URLs are fake sandbox placeholders.

### SP Communication Preview
- Purpose: Show hybrid portal, email-preview, Microsoft Forms-preview, and manual coverage.
- Recommended fake data: Seeded `.invalid` SP contacts and Cory-controlled portal aliases.
- What not to show: Real contact information, invite history, token hashes, or admin-only notes outside the admin UI.
- Privacy reminder: This panel is admin/operator-only and must not be shown from an SP account.

### Invite Onboarding Page
- Purpose: Show friendly invite validation and sign-in guidance.
- Recommended fake data: A newly created fake invite message, if safe.
- What not to show: Raw invite URL after the one-time creation moment unless the walkthrough explicitly needs it.
- Privacy reminder: Treat invite URLs like passwords during screenshots.

### SP Portal Open Shifts
- Purpose: Show the SP-safe view of available work.
- Recommended fake data: A linked Cory-controlled demo SP account or narrated seeded open shifts.
- What not to show: Other SPs' attendance, responses, phone numbers, email addresses, roster data, invite history, or admin notes.
- Privacy reminder: SP users should only see their own SP-facing data.

### SP Response Saved
- Purpose: Show Accept, Maybe, or Decline saving after backend success.
- Recommended fake data: A seeded sandbox open shift.
- What not to show: Network inspector payloads with identifiers unless scrubbed.
- Privacy reminder: Do not show another SP's response.

### Live Attendance And Check-In
- Purpose: Show day-of status changing and syncing.
- Recommended fake data: Showcase event with one SP not checked in and backup coverage ready.
- What not to show: Real attendance, payroll details, or private staffing notes.
- Privacy reminder: SP portal attendance remains own-status only.

### CFSP Guide
- Purpose: Show guided onboarding and progress.
- Recommended fake data: Tester-oriented admin guide or Event Command Center guide.
- What not to show: Real user profile details or non-sandbox workspaces.
- Privacy reminder: The guide is rule-based, not true AI.

### Settings Communication Panel
- Purpose: Show organization-level hybrid communication defaults.
- Recommended fake data: Hybrid mode with portal, email-preview, Microsoft Forms-preview, and manual workflows enabled.
- What not to show: Real reply-to addresses, real Microsoft Forms URLs, or production email settings.
- Privacy reminder: Use `.invalid` addresses and fake Forms URLs.
