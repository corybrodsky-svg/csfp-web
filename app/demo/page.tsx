import type { Metadata } from "next";
import Link from "next/link";

import { DemoFlowLink } from "./DemoFlowLink";

export const metadata: Metadata = {
  title: "Conflict-Free SP Demo | Guided Simulation Operations Workflow",
  description:
    "A guided public Conflict-Free SP demo showing how simulation teams can catch staffing gaps, learner roster mismatches, schedule capacity issues, SP outreach status, materials readiness, and SP portal release risks with fictional data.",
};

const scenarioFacts = [
  "Neurologic Assessment: Stroke Warning Signs",
  "32 learners",
  "4 rooms",
  "4 cases",
  "6 primary SPs + 1 backup needed",
  "Learner roster imported",
  "Schedule capacity conflict detected",
  "SP coverage partially complete",
  "Materials ready",
  "SP portal release pending",
] as const;

const catches = [
  {
    title: "Staffing gap",
    detail: "1 backup still needed, separate from the primary SP coverage already selected.",
  },
  {
    title: "Learner roster mismatch",
    detail: "Roster count and Event Settings count are compared before schedule planning drifts.",
  },
  {
    title: "Schedule capacity conflict",
    detail: "Not enough rounds or learner slots is flagged before the event day schedule is trusted.",
  },
  {
    title: "SP outreach status",
    detail: "See who was contacted, who responded, who is selected, and who is confirmed.",
  },
  {
    title: "Materials and training readiness",
    detail: "Case files, prep details, faculty contacts, and training messages stay visible.",
  },
  {
    title: "SP portal release status",
    detail: "Release the right schedule, location, materials, and acknowledgments only when ready.",
  },
] as const;

const guidedNavigation = [
  {
    href: "#event-snapshot",
    label: "Start with Event Snapshot",
    detail: "See how CFSP turns scattered prep work into one operational readiness view.",
  },
  {
    href: "#sp-staffing",
    label: "See SP Staffing",
    detail: "Track primary coverage, backups, contacted SPs, confirmations, and remaining gaps.",
  },
  {
    href: "#learner-roster",
    label: "Import Learner Roster",
    detail: "Keep planning aligned with the actual uploaded learner list.",
  },
  {
    href: "#schedule",
    label: "Review Schedule Conflict",
    detail: "Catch timing and slot problems before event day.",
  },
  {
    href: "#sp-portal",
    label: "Preview SP Portal Readiness",
    detail: "Confirm what SPs should see before releasing portal details.",
  },
  {
    href: "#day-of",
    label: "See Day-of Check-in",
    detail: "Follow the handoff from planning to attendance, overrides, and closeout.",
  },
] as const;

const workflowSections = [
  {
    id: "event-snapshot",
    eyebrow: "Event Snapshot",
    title: "One readiness view for the event.",
    copy: "CFSP turns scattered prep work into one operational readiness view.",
    bullets: ["32 learners loaded", "4 rooms and 4 cases", "Materials ready", "Portal release pending"],
  },
  {
    id: "sp-staffing",
    eyebrow: "SP Staffing",
    title: "Active staffing stays separate from outreach history.",
    copy:
      "Track selected, confirmed, backup, contacted, and no-response SPs without losing the main active roster.",
    bullets: ["6 primary SPs covered", "1 backup still needed", "25 SPs contacted", "No-response recipients stay in outreach history"],
  },
  {
    id: "learner-roster",
    eyebrow: "Learner Roster",
    title: "The uploaded roster becomes the planning source.",
    copy:
      "Import rosters, detect count mismatches, and keep schedule planning aligned with the actual learner list.",
    bullets: ["32 uploaded learners", "Mismatch warning if settings still expect 16", "CSV and XLSX friendly", "Manual entry is fallback only"],
  },
  {
    id: "schedule",
    eyebrow: "Schedule",
    title: "Capacity conflicts are caught before the event.",
    copy: "Catch capacity conflicts before event day and offer next-step fixes.",
    bullets: ["4 rooms x 2 learners per room", "8 learner slots per round", "Rounds and unscheduled learners visible", "Suggested fixes are actionable"],
  },
  {
    id: "sp-portal",
    eyebrow: "SP Portal",
    title: "Release the right details, not the whole internal plan.",
    copy:
      "Release only the details SPs should see: schedule, location, cases, materials, arrival instructions, and acknowledgments.",
    bullets: ["Confirmed SP schedule", "Arrival and location details", "Case and materials release", "Acknowledgment status"],
  },
  {
    id: "day-of",
    eyebrow: "Day-of",
    title: "Operations continue after the schedule is built.",
    copy: "Track check-in, overrides, attendance, and closeout.",
    bullets: ["SP check-in", "Room overrides", "Attendance tracking", "Closeout follow-up"],
  },
] as const;

const beforeItems = [
  "Spreadsheets",
  "Inbox threads",
  "Manual rosters",
  "Unclear staffing state",
  "No single readiness view",
  "SPs asking where, when, and what to prepare",
] as const;

const afterItems = [
  "One event command center",
  "Staffing status and backup needs",
  "Roster and schedule readiness",
  "Portal release controls",
  "Outreach and contact history",
  "Day-of check-in tracking",
] as const;

const primaryCtas = [
  { href: "/request-demo", label: "Request a walkthrough", primary: true },
  { href: "/contact", label: "Share feedback", primary: false },
  { href: "#demo-flow", label: "View public preview", primary: false },
] as const;

export default function PublicDemoPage() {
  return (
    <main className="min-h-screen bg-[#07111c] text-[#edf7ff]">
      <section
        className="relative overflow-hidden border-b border-[#7fa6c84d] bg-[#07111c]"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(5, 11, 18, 0.95), rgba(7, 17, 28, 0.78), rgba(7, 17, 28, 0.66)), url('/branding/cfsp-hero-ops.svg')",
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <div className="mx-auto grid w-full max-w-[1180px] gap-12 px-5 py-8 md:py-12">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="text-[15px] font-black text-[#f5fbff] no-underline">
              Conflict-Free SP
            </Link>
            <nav className="flex flex-wrap gap-2" aria-label="Demo navigation">
              <Link
                href="/request-demo"
                className="inline-flex min-h-[42px] items-center rounded-lg border border-[#86c8ff70] bg-[#123553cf] px-4 text-sm font-extrabold text-[#eff8ff] no-underline transition hover:border-[#a4d7ff] hover:bg-[#174569]"
              >
                Request a walkthrough
              </Link>
              <Link
                href="/contact"
                className="inline-flex min-h-[42px] items-center rounded-lg border border-[#7ca5cb5f] bg-[#0d2237bf] px-4 text-sm font-bold text-[#e8f2fb] no-underline transition hover:border-[#96c0e2a2] hover:bg-[#143450]"
              >
                Share feedback
              </Link>
            </nav>
          </header>

          <div className="grid gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
            <section className="grid gap-5">
              <p className="m-0 w-fit rounded-full border border-[#85d9cc59] bg-[#0b2f35d9] px-3 py-1 text-xs font-extrabold uppercase tracking-[0.08em] text-[#9eeade]">
                Public guided demo
              </p>
              <h1 className="m-0 max-w-[820px] text-[2.5rem] leading-[1.02] font-black text-[#f8fcff] md:text-[4.25rem]">
                See how CFSP keeps an SP event from falling apart.
              </h1>
              <p className="m-0 max-w-[780px] text-[1.06rem] leading-[1.65] font-semibold text-[#dcecf9e0] md:text-[1.22rem]">
                Follow a realistic simulation event from staffing risk to schedule readiness, learner roster import, SP outreach, and portal release.
              </p>
              <p className="m-0 max-w-[760px] text-[0.98rem] leading-[1.58] font-semibold text-[#bfe3f8]">
                Built for simulation operations teams, SP program coordinators, clinical skills programs, and anyone trying to keep learner, SP, faculty, materials, and schedule work aligned before event day.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <DemoFlowLink
                  className="inline-flex min-h-[48px] items-center rounded-lg border border-[#75b9ff8a] bg-[#1673c8] px-5 text-sm font-extrabold text-white no-underline shadow-[0_18px_34px_rgba(10,38,67,0.42)] transition hover:-translate-y-px hover:bg-[#1783e4]"
                >
                  View public preview
                </DemoFlowLink>
                <Link
                  href="/request-demo"
                  className="inline-flex min-h-[48px] items-center rounded-lg border border-[#8eb9d575] bg-[#0e2439d4] px-5 text-sm font-extrabold text-[#eff8ff] no-underline transition hover:border-[#a8d0e9] hover:bg-[#173b5a]"
                >
                  Request a walkthrough
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex min-h-[48px] items-center rounded-lg border border-[#8eb9d575] bg-[#0e2439d4] px-5 text-sm font-extrabold text-[#eff8ff] no-underline transition hover:border-[#a8d0e9] hover:bg-[#173b5a]"
                >
                  Share feedback
                </Link>
              </div>
            </section>

            <aside className="rounded-2xl border border-[#8fb5d45c] bg-[#081b2be8] p-5 shadow-[0_22px_56px_rgba(2,10,19,0.46)]">
              <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9fcbf2]">Guided scenario</p>
              <h2 className="m-0 pt-2 text-[1.55rem] leading-tight font-black text-[#f6fbff]">
                Neurologic Assessment: Stroke Warning Signs
              </h2>
              <p className="m-0 pt-3 text-[0.98rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
                This scenario shows the work CFSP is designed to replace: spreadsheets, inbox threads, manual roster updates, unclear staffing state, and SPs asking what to prepare.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {scenarioFacts.slice(1).map((fact) => (
                  <div key={fact} className="rounded-xl border border-[#84a8c84a] bg-[#102236d9] px-3 py-2 text-sm font-bold leading-6 text-[#d7e8f6]">
                    {fact}
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-[#f1b85b66] bg-[#30230e] px-4 py-3 text-sm font-bold leading-6 text-[#fff6df]">
                Names, emails, events, and organizations are fictional. The workflow is modeled after real simulation operations problems.
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section id="demo-flow" className="scroll-mt-24 border-b border-[#5c799640] bg-[#0b1826]">
        <div className="mx-auto grid w-full max-w-[1180px] gap-6 px-5 py-12 lg:grid-cols-[0.9fr_1.1fr] lg:py-14">
          <div className="grid content-start gap-3">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9eeade]">Demo flow</p>
            <h2 className="m-0 text-[1.9rem] leading-tight font-black text-[#f7fcff] md:text-[2.45rem]">
              A two-minute walkthrough of the operational story.
            </h2>
            <p className="m-0 text-[1rem] leading-[1.7] font-semibold text-[#d0e3f3de]">
              Start with the event snapshot, then follow the places where CFSP catches risk before it becomes event-day chaos.
            </p>
          </div>
          <nav className="grid gap-3 sm:grid-cols-2" aria-label="Guided demo sections">
            {guidedNavigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-xl border border-[#84a8c84a] bg-[#102236d9] p-4 text-[#f4fbff] no-underline transition hover:-translate-y-px hover:border-[#9bd1ec]"
              >
                <span className="block text-[0.98rem] font-black">{item.label}</span>
                <span className="mt-2 block text-sm font-semibold leading-6 text-[#d0e3f3de]">{item.detail}</span>
              </a>
            ))}
          </nav>
        </div>
      </section>

      <section className="border-b border-[#5c799640] bg-[#071421]">
        <div className="mx-auto grid w-full max-w-[1180px] gap-6 px-5 py-12 md:py-14">
          <div className="max-w-[760px]">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9dc9ee]">What CFSP catches</p>
            <h2 className="m-0 pt-2 text-[1.8rem] leading-tight font-black text-[#f7fcff] md:text-[2.35rem]">
              The aha moments are the risks a coordinator should not have to find by hand.
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {catches.map((item) => (
              <article key={item.title} className="rounded-xl border border-[#8ab1d14a] bg-[#10263bd8] p-5">
                <h3 className="m-0 text-[1.05rem] font-black text-[#f7fcff]">{item.title}</h3>
                <p className="m-0 pt-3 text-sm leading-6 font-semibold text-[#d3e6f5db]">{item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#5c799640] bg-[#06111d]">
        <div className="mx-auto grid w-full max-w-[1180px] gap-5 px-5 py-12 md:py-14">
          {workflowSections.map((section) => (
            <article
              key={section.id}
              id={section.id}
              className="scroll-mt-24 rounded-2xl border border-[#8bb2d255] bg-[#102840d1] p-5"
            >
              <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
                <div>
                  <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9eeade]">{section.eyebrow}</p>
                  <h2 className="m-0 pt-2 text-[1.5rem] leading-tight font-black text-[#f7fcff] md:text-[1.9rem]">{section.title}</h2>
                  <p className="m-0 pt-3 text-[1rem] leading-[1.68] font-semibold text-[#d3e6f5db]">{section.copy}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {section.bullets.map((bullet) => (
                    <div key={bullet} className="rounded-xl border border-[#84a8c84a] bg-[#0d2338d4] px-4 py-3 text-sm font-bold leading-6 text-[#d7e8f6]">
                      {bullet}
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border-b border-[#5c799640] bg-[#071421]">
        <div className="mx-auto grid w-full max-w-[1180px] gap-6 px-5 py-12 lg:grid-cols-2 lg:py-14">
          <article className="rounded-2xl border border-[#f1b85b66] bg-[#30230e] p-5">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#ffd99b]">Before CFSP</p>
            <h2 className="m-0 pt-2 text-[1.55rem] leading-tight font-black text-[#fff6df]">The work is scattered.</h2>
            <ul className="m-0 mt-4 grid gap-2 p-0">
              {beforeItems.map((item) => (
                <li key={item} className="list-none rounded-xl border border-[#f1b85b33] bg-[#211807] px-4 py-3 text-sm font-bold text-[#fff6df]">
                  {item}
                </li>
              ))}
            </ul>
          </article>
          <article className="rounded-2xl border border-[#39d5aa66] bg-[#0b2f35] p-5">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9eeade]">With CFSP</p>
            <h2 className="m-0 pt-2 text-[1.55rem] leading-tight font-black text-[#eafffb]">The event has one operating picture.</h2>
            <ul className="m-0 mt-4 grid gap-2 p-0">
              {afterItems.map((item) => (
                <li key={item} className="list-none rounded-xl border border-[#39d5aa40] bg-[#08272c] px-4 py-3 text-sm font-bold text-[#eafffb]">
                  {item}
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="bg-[#06111d]">
        <div className="mx-auto grid w-full max-w-[1180px] gap-6 px-5 py-12 lg:grid-cols-[1fr_0.95fr] lg:items-start lg:py-14">
          <article className="rounded-2xl border border-[#8bb2d255] bg-[#102840d1] p-5">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9dc9ee]">Feedback ask</p>
            <h2 className="m-0 pt-2 text-[1.65rem] leading-tight font-black text-[#f7fcff]">
              Does this match how your SP or simulation events actually work?
            </h2>
            <p className="m-0 pt-3 text-[1rem] leading-[1.68] font-semibold text-[#d3e6f5db]">
              I am looking for feedback from simulation operations professionals, SP program coordinators, faculty partners, and program leads who manage this work in real life.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {primaryCtas.map((cta) => {
                const className = cta.primary
                  ? "inline-flex min-h-[46px] items-center rounded-lg border border-[#75b9ff8a] bg-[#1673c8] px-5 text-sm font-extrabold text-white no-underline transition hover:bg-[#1783e4]"
                  : "inline-flex min-h-[46px] items-center rounded-lg border border-[#8eb9d575] bg-[#0e2439d4] px-5 text-sm font-extrabold text-[#eff8ff] no-underline transition hover:bg-[#173b5a]";
                return cta.href === "#demo-flow" ? (
                  <DemoFlowLink key={cta.label} className={className}>
                    {cta.label}
                  </DemoFlowLink>
                ) : (
                  <Link key={cta.label} href={cta.href} className={className}>
                    {cta.label}
                  </Link>
                );
              })}
            </div>
          </article>

          <aside className="rounded-2xl border border-[#8bb2d255] bg-[#102840d1] p-5">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9eeade]">Safe demo note</p>
            <h2 className="m-0 pt-2 text-[1.45rem] leading-tight font-black text-[#f7fcff]">Fictional sandbox data only.</h2>
            <p className="m-0 pt-3 text-[1rem] leading-[1.68] font-semibold text-[#d3e6f5db]">
              Names, emails, events, and organizations are fictional. The workflow is modeled after real simulation operations problems.
            </p>
            <p className="m-0 pt-3 text-[0.95rem] leading-[1.6] font-semibold text-[#bfe3f8]">
              The public demo is meant to explain the value of Conflict-Free SP quickly. It intentionally avoids raw database diagnostics, internal route names, and legacy technical labels.
            </p>
          </aside>
        </div>
      </section>
    </main>
  );
}
