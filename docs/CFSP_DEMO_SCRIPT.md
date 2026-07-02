# CFSP Sandbox Reviewer Walkthrough

Use this as a short, reviewer-ready walkthrough for an external simulation operations reviewer. It is for the authenticated sandbox app, not the public `/demo` marketing page.

## What CFSP Is

CFSP is a simulation operations command center. It helps a simulation team plan events, coordinate SP staffing, manage readiness, preview SP-facing release content, and run event-day operations from one shared workspace.

The reviewer should judge the real workflow: dashboard overview, Event Command Center, staffing, materials, SP portal release, SP portal preview, and check-in state.

## Sandbox Scenario

- Organization: **CFSP Sandbox Simulation Center**
- Reviewer role: `sim_ops`
- Showcase event: **Neurologic Assessment: Stroke Warning Signs**
- Event type: focused neurologic assessment and caregiver-communication simulation
- Fake case: fictional adult patient Jordan Price, age 64, with sudden facial droop, slurred speech, and right-arm weakness noticed during breakfast
- Fake SP behavior: calm but worried, occasional word-finding difficulty, mild frustration, and subtle right-sided weakness cues
- Safety boundary: no real PHI, patient records, student records, SP private records, institutional data, passwords, or real contact data

The showcase event intentionally includes realistic readiness issues:

- 1 SP not checked in
- Room 4 not ready
- Faculty guide pending final review
- Learner flow marked at risk
- Check-in not open yet — opens 2 hours before event start

## Tester Access Flow

1. Send the reviewer to `/request-access`.
2. Give them organization code `CFSP-SANDBOX`.
3. Approve the request as `sim_ops` from `/settings/users` or `/staff`.
4. Confirm the approved request shows Auth user, organization membership, role, and invite status.
5. Use **Send Invite** for normal Supabase email delivery.
6. If no email arrives, use **Copy Invite Link** and send the setup link manually.
7. The reviewer sets a password, signs in, lands on `/dashboard`, and opens the sandbox organization.

Approved membership does not necessarily mean the reviewer received a login invite. Use Send Invite or Copy Invite Link to complete onboarding.

## Reviewer Path

### 1. Dashboard / Organization View

Start on `/dashboard` with **CFSP Sandbox Simulation Center** active. Use Organization View as the global overview and launchpad. Good looks like: the reviewer understands this is a shared fictional sandbox and can find the showcase event quickly.

### 2. Events Board

Open `/events` and select **Neurologic Assessment: Stroke Warning Signs**. Good looks like: the eight sandbox events appear, and the showcase event feels serious and credible.

### 3. Event Command Center

Open the showcase event. Start with the first-screen Event Snapshot. Good looks like: a sim op can quickly see SPs needed, confirmed SPs, checked-in SPs, backup SPs, shortage, and the primary risk or next action.

### 4. Staffing / SP Hiring

Review staffing coverage, assigned SPs, confirmed SPs, backup coverage, shortage, and the next action. Good looks like: the reviewer can tell whether coverage is complete, partial, or at risk without decoding internal status terms.

### 5. Materials Preview

Preview the fictional SP case brief, faculty guide, learner flow preview, and Room 4 setup checklist. Good looks like: the materials feel realistic, presentation-ready, and clearly fake. The faculty guide pending review and Room 4 issue should be easy to spot.

### 6. Release To SP Portal

Open **Release to SP Portal**. Review what is released, hidden, ready to release, or needs info before release. Good looks like: unreleased content does not look like an SP failure, and the reviewer can tell what the SP will or will not see.

### 7. Admin SP Portal Preview

Open the admin preview inside the release workflow. Good looks like: it clearly says it is an admin preview and reflects the current release state. Hidden items should have simple admin-only notes explaining why they are hidden.

### 8. SP Portal Confirmed-Work View

Open `/sp` as a linked test SP account or use the admin preview if a test SP login is not available. Good looks like: the SP portal feels like a confirmed-work hub, not an availability poll hub. It should show released event details, role/case, schedule preview, training/materials, arrival instructions, acknowledgments, and check-in status only when those items are released.

### 9. Check-In Not-Open State

Confirm future-event check-in does not show SPs as checked in before the window. Good looks like: the visible state says **Check-in not open yet — opens 2 hours before event start**.

### 10. Create A New Event

Create a simple new event from `/events/new` if time allows. Good looks like: the reviewer can see how CFSP starts from event setup and then grows into staffing, readiness, materials, and command-center operations.

### 11. Submit Feedback

Use `/sandbox-feedback`, `/contact`, or the agreed follow-up channel. Ask the reviewer to focus on operational clarity, realism, and pilot readiness.

## What We Want Feedback On

- Is the event status understandable?
- Is staffing status understandable?
- Are assigned, confirmed, checked-in, backup, shortage, and risk states clearly different?
- Are released and hidden SP materials clear?
- Does the admin SP portal preview match what an SP should actually see?
- Does the SP portal make sense as a confirmed-work hub?
- Does the check-in not-open state feel clear and realistic?
- What feels confusing, unrealistic, or too busy?
- What would prevent your team from using this?
- What would make this valuable enough to pilot?

## Suggested Talk Track

"This sandbox event is intentionally close to a real event-day operations problem. One SP is not checked in, Room 4 is not ready, the faculty guide still needs final review, and learner flow is at risk. CFSP brings those signals into one place so the operator can decide the next action before learners are released."

## Closing Ask

What would need to be clearer, faster, or more trustworthy for your team to use this during a real simulation event?

## Do Not Do During The Review

- Do not enter real PHI, student data, SP private data, institutional data, passwords, or real contact details.
- Do not send real bulk email.
- Do not present Microsoft Graph, billing, true AI, or full production integrations as implemented.
- Do not use the public `/demo` page as the reviewer path for this sandbox workflow.
