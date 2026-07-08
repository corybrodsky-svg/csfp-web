import type { Metadata } from "next";
import Link from "next/link";

import { DemoFlowLink } from "./DemoFlowLink";

export const metadata: Metadata = {
  title: "Conflict-Free SP Demo | Guided Simulation Operations Workflow",
  description:
    "A guided public Conflict-Free SP demo showing how simulation teams can convert existing schedules, learner rosters, SP outreach, staffing decisions, and portal readiness into one event command center with fictional data.",
};

const scenarioFacts = [
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

const commandTools = [
  "Event Snapshot",
  "Staffing / SP Hiring",
  "Learner Roster",
  "Schedule Builder",
  "SP Portal Release",
  "Day-of Check-in",
] as const;

const eventSnapshotMetrics = [
  { label: "Learners", value: "32", detail: "Uploaded roster" },
  { label: "Rooms", value: "4", detail: "Exam rooms" },
  { label: "Primary SPs", value: "6/6", detail: "Coverage ready" },
  { label: "Backup SP", value: "0/1", detail: "Still needed" },
] as const;

const catches = [
  {
    title: "Existing Excel schedule becomes structured event cards",
    detail: "Room rotations, timing blocks, learner groups, SP assignments, and cases become readable schedule cards.",
  },
  {
    title: "SP poll responses become staffing decisions",
    detail: "Email or Microsoft Forms outreach can be recorded, imported, and turned into selected or confirmed SP coverage.",
  },
  {
    title: "Selected SPs are separated from outreach history",
    detail: "No-response recipients stay in outreach history instead of flooding the active staffing roster.",
  },
  {
    title: "Imported roster becomes the planning source",
    detail: "Learner count mismatches are visible before the schedule is trusted.",
  },
  {
    title: "Schedule capacity conflicts are caught before event day",
    detail: "CFSP checks rooms, learners, timing, learner slots, and rounds before the event is released.",
  },
  {
    title: "Portal release is controlled by admin readiness",
    detail: "SPs see only the schedule, cases, materials, arrival instructions, and acknowledgments that are ready.",
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
    href: "#schedule-builder",
    label: "Review Schedule Conflict",
    detail: "Catch timing, room, learner slot, and rotation problems before event day.",
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

const workflowConversion = [
  "Import learner rosters",
  "Convert existing schedule logic into event cards",
  "Support email and Microsoft Forms outreach during transition",
  "Track SP hiring and confirmation status",
  "Release only ready details to the SP portal",
  "Keep event readiness visible in one place",
] as const;

const oldScheduleRows = [
  ["Round 1", "Exam 1", "Learners 1-2", "SP TBD", "Stroke signs"],
  ["Round 1", "Exam 2", "Learners 3-4", "SP confirmed", "Focused neuro"],
  ["Round 2", "Exam 1", "Learners 9-10", "SP confirmed", "Stroke signs"],
] as const;

const scheduleCards = [
  {
    round: "Round 1",
    room: "Exam 1",
    learners: "Learner group A",
    sp: "Primary SP assigned",
    case: "Stroke warning signs",
    time: "8:20 - 8:50 AM",
  },
  {
    round: "Round 1",
    room: "Exam 2",
    learners: "Learner group B",
    sp: "Primary SP assigned",
    case: "Focused neuro exam",
    time: "8:20 - 8:50 AM",
  },
  {
    round: "Round 2",
    room: "Exam 1",
    learners: "Learner group E",
    sp: "Primary SP assigned",
    case: "Stroke warning signs",
    time: "8:55 - 9:25 AM",
  },
] as const;

const spLifecycle = [
  "Start with email lists, Microsoft Forms polls, spreadsheet responses, or manual outreach.",
  "Record or import outreach history so the team can see who was contacted and who responded.",
  "Move selected SPs into active staffing without pulling no-response recipients into the main roster.",
  "Track primary coverage, backup needs, hire confirmation status, and next actions.",
  "Release confirmed SPs into the portal when schedule, materials, and instructions are ready.",
] as const;

const learnerRosterRows = [
  ["Uploaded learners", "32"],
  ["Expected in settings", "16"],
  ["Mismatch action", "Update expected count or review settings"],
  ["Planning source", "Uploaded roster"],
] as const;

const portalReadiness = [
  ["Schedule", "Ready for confirmed SPs"],
  ["Location", "Ready"],
  ["Cases", "Released when approved"],
  ["Materials", "Ready"],
  ["Acknowledgments", "Pending release"],
] as const;

const dayOfSignals = [
  "SP check-in status",
  "Room or assignment overrides",
  "Learner attendance visibility",
  "Closeout and follow-up notes",
] as const;

const beforeItems = [
  "Excel schedule grid",
  "Microsoft Forms poll",
  "Email confirmations",
  "Learner roster attachment",
  "Manual SP tracking",
  "Separate faculty and materials notes",
] as const;

const afterItems = [
  "Event Command Center",
  "Schedule Builder event cards",
  "Learner roster source of truth",
  "SP outreach and hiring lifecycle",
  "Portal release controls",
  "Day-of check-in and closeout",
] as const;

const primaryCtas = [
  { href: "/request-demo", label: "Request a walkthrough", primary: true },
  { href: "/contact", label: "Share feedback", primary: false },
  { href: "#public-preview", label: "View public preview", primary: false },
] as const;

function CtaLink({ href, label, primary }: { href: string; label: string; primary?: boolean }) {
  const className = primary
    ? "inline-flex min-h-[46px] items-center rounded-lg border border-[#75b9ff8a] bg-[#1673c8] px-5 text-sm font-extrabold text-white no-underline transition hover:bg-[#1783e4]"
    : "inline-flex min-h-[46px] items-center rounded-lg border border-[#8eb9d575] bg-[#0e2439d4] px-5 text-sm font-extrabold text-[#eff8ff] no-underline transition hover:bg-[#173b5a]";

  if (href === "#public-preview") {
    return <DemoFlowLink className={className}>{label}</DemoFlowLink>;
  }

  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}

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
                CFSP is not just a roster app. It adapts the way a simulation program already works and turns event prep into one readiness command center.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                {primaryCtas.map((cta) => (
                  <CtaLink key={cta.label} href={cta.href} label={cta.label} primary={cta.primary} />
                ))}
              </div>
            </section>

            <aside className="rounded-2xl border border-[#8fb5d45c] bg-[#081b2be8] p-5 shadow-[0_22px_56px_rgba(2,10,19,0.46)]">
              <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9fcbf2]">Guided scenario</p>
              <h2 className="m-0 pt-2 text-[1.55rem] leading-tight font-black text-[#f6fbff]">
                Neurologic Assessment: Stroke Warning Signs
              </h2>
              <p className="m-0 pt-3 text-[0.98rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
                This fictional event shows the work CFSP is designed to replace: spreadsheets, inbox threads, manual rosters, unclear staffing state, and SPs asking what to prepare.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {scenarioFacts.map((fact) => (
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

      <section id="public-preview" className="scroll-mt-24 border-b border-[#5c799640] bg-[#f3f7fb] text-[#102338]">
        <div className="mx-auto grid w-full max-w-[1180px] gap-6 px-5 py-12 lg:py-14">
          <div className="grid gap-3 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
            <div>
              <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#176c65]">Public app-style preview</p>
              <h2 className="m-0 pt-2 text-[1.9rem] leading-tight font-black text-[#102338] md:text-[2.45rem]">
                A simplified Event Command Center, using fake sandbox data.
              </h2>
            </div>
            <p className="m-0 text-[1rem] leading-[1.7] font-semibold text-[#486176]">
              This is a public-safe visual walkthrough of the kind of operating picture CFSP gives a simulation team, focused on workflow rather than technical implementation details.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#cad8e5] bg-white shadow-[0_24px_60px_rgba(16,35,56,0.14)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8e4ee] bg-[#102338] px-4 py-3 text-white">
              <div>
                <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9eeade]">Event Command Center shell</p>
                <h3 className="m-0 pt-1 text-[1.12rem] font-black">Neurologic Assessment: Stroke Warning Signs</h3>
              </div>
              <span className="rounded-full border border-[#74eab666] bg-[#0d4d47] px-3 py-1 text-xs font-black text-[#d9fff7]">
                Fictional sandbox event
              </span>
            </div>

            <div className="grid min-h-[520px] lg:grid-cols-[220px_1fr]">
              <aside className="border-b border-[#d8e4ee] bg-[#ecf3f8] p-3 lg:border-r lg:border-b-0">
                <p className="m-0 px-2 py-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#60758a]">Command Tools</p>
                <div className="grid gap-2">
                  {commandTools.map((tool, index) => (
                    <div
                      key={tool}
                      className={
                        index === 0
                          ? "rounded-lg border border-[#2e8fba66] bg-white px-3 py-2 text-sm font-black text-[#102338] shadow-sm"
                          : "rounded-lg border border-[#d5e2ec] bg-[#f8fbfd] px-3 py-2 text-sm font-bold text-[#486176]"
                      }
                    >
                      {tool}
                    </div>
                  ))}
                </div>
              </aside>

              <div className="grid gap-4 p-4">
                <section id="event-snapshot" className="scroll-mt-24 rounded-xl border border-[#d8e4ee] bg-[#f8fbfd] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#176c65]">Event Snapshot readiness panel</p>
                      <h3 className="m-0 pt-1 text-[1.2rem] font-black text-[#102338]">CFSP turns scattered prep work into one operational readiness view.</h3>
                    </div>
                    <span className="rounded-full border border-[#f1b85b66] bg-[#fff7e8] px-3 py-1 text-xs font-black text-[#8c5a09]">
                      1 backup still needed
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {eventSnapshotMetrics.map((metric) => (
                      <div key={metric.label} className="rounded-lg border border-[#d8e4ee] bg-white p-3">
                        <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#60758a]">{metric.label}</p>
                        <p className="m-0 pt-1 text-[1.45rem] font-black text-[#102338]">{metric.value}</p>
                        <p className="m-0 pt-1 text-xs font-bold text-[#60758a]">{metric.detail}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                  <section className="rounded-xl border border-[#d8e4ee] bg-white p-4">
                    <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#176c65]">Staffing / SP Hiring panel</p>
                    <h3 className="m-0 pt-1 text-[1.05rem] font-black text-[#102338]">Polling becomes staffing decisions.</h3>
                    <div className="mt-3 grid gap-2">
                      {["6 selected primary SPs", "1 backup gap", "25 contacted SPs in outreach history", "No-response SPs hidden from active roster"].map((item) => (
                        <div key={item} className="rounded-lg border border-[#d8e4ee] bg-[#f8fbfd] px-3 py-2 text-sm font-bold text-[#31495f]">
                          {item}
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-xl border border-[#d8e4ee] bg-white p-4">
                    <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#176c65]">Schedule Builder preview</p>
                    <h3 className="m-0 pt-1 text-[1.05rem] font-black text-[#102338]">Excel-style rotations become event cards.</h3>
                    <div className="mt-3 grid gap-2">
                      {scheduleCards.slice(0, 2).map((card) => (
                        <div key={`${card.round}-${card.room}`} className="rounded-lg border border-[#d8e4ee] bg-[#f8fbfd] p-3">
                          <div className="flex flex-wrap justify-between gap-2 text-sm font-black text-[#102338]">
                            <span>{card.round} - {card.room}</span>
                            <span>{card.time}</span>
                          </div>
                          <p className="m-0 pt-2 text-xs font-bold text-[#60758a]">{card.learners} - {card.sp} - {card.case}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="demo-flow" className="scroll-mt-24 border-b border-[#5c799640] bg-[#0b1826]">
        <div className="mx-auto grid w-full max-w-[1180px] gap-6 px-5 py-12 lg:grid-cols-[0.9fr_1.1fr] lg:py-14">
          <div className="grid content-start gap-3">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9eeade]">Guided walkthrough</p>
            <h2 className="m-0 text-[1.9rem] leading-tight font-black text-[#f7fcff] md:text-[2.45rem]">
              Follow the operating story section by section.
            </h2>
            <p className="m-0 text-[1rem] leading-[1.7] font-semibold text-[#d0e3f3de]">
              The buttons below jump to the public-safe sections that explain how CFSP adapts existing simulation operations workflows.
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

      <section id="workflow-conversion" className="scroll-mt-24 border-b border-[#5c799640] bg-[#071421]">
        <div className="mx-auto grid w-full max-w-[1180px] gap-6 px-5 py-12 lg:grid-cols-[0.95fr_1.05fr] lg:py-14">
          <div>
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9eeade]">Workflow conversion</p>
            <h2 className="m-0 pt-2 text-[1.85rem] leading-tight font-black text-[#f7fcff] md:text-[2.35rem]">
              Built around how your simulation program already works.
            </h2>
            <p className="m-0 pt-4 text-[1rem] leading-[1.75] font-semibold text-[#d0e3f3de]">
              Every program schedules differently. CFSP is designed to absorb the way your team already works - Excel grids, room rotations, learner groups, SP assignments, timing blocks - and turn it into structured event cards that match your workflow.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {workflowConversion.map((item) => (
              <div key={item} className="rounded-xl border border-[#84a8c84a] bg-[#102236d9] px-4 py-3 text-sm font-bold leading-6 text-[#d7e8f6]">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#5c799640] bg-[#071421]">
        <div className="mx-auto grid w-full max-w-[1180px] gap-6 px-5 py-12 md:py-14">
          <div className="max-w-[800px]">
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

      <section id="sp-staffing" className="scroll-mt-24 border-b border-[#5c799640] bg-[#06111d]">
        <div className="mx-auto grid w-full max-w-[1180px] gap-6 px-5 py-12 lg:grid-cols-[0.85fr_1.15fr] lg:py-14">
          <div>
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9eeade]">SP polling, hiring, and onboarding</p>
            <h2 className="m-0 pt-2 text-[1.85rem] leading-tight font-black text-[#f7fcff] md:text-[2.25rem]">
              CFSP supports legacy outreach while teams transition into the portal workflow.
            </h2>
            <p className="m-0 pt-4 text-[1rem] leading-[1.75] font-semibold text-[#d0e3f3de]">
              CFSP does not require a program to abandon its current process on day one. Poll by email, use Microsoft Forms, import responses, or move selected SPs into the portal workflow when ready.
            </p>
          </div>
          <div className="grid gap-3">
            {spLifecycle.map((item, index) => (
              <div key={item} className="rounded-xl border border-[#84a8c84a] bg-[#102236d9] p-4">
                <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9dc9ee]">Step {index + 1}</p>
                <p className="m-0 pt-2 text-sm font-bold leading-6 text-[#d7e8f6]">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="learner-roster" className="scroll-mt-24 border-b border-[#5c799640] bg-[#071421]">
        <div className="mx-auto grid w-full max-w-[1180px] gap-6 px-5 py-12 lg:grid-cols-[0.85fr_1.15fr] lg:py-14">
          <div>
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9dc9ee]">Learner Roster</p>
            <h2 className="m-0 pt-2 text-[1.85rem] leading-tight font-black text-[#f7fcff] md:text-[2.25rem]">
              Imported rosters become the planning source.
            </h2>
            <p className="m-0 pt-4 text-[1rem] leading-[1.75] font-semibold text-[#d0e3f3de]">
              Import rosters, detect count mismatches, and keep schedule planning aligned with the actual learner list.
            </p>
          </div>
          <div className="rounded-2xl border border-[#8bb2d255] bg-[#102840d1] p-5">
            <div className="grid gap-2">
              {learnerRosterRows.map(([label, value]) => (
                <div key={label} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#84a8c84a] bg-[#0d2338d4] px-4 py-3">
                  <span className="text-sm font-bold text-[#d7e8f6]">{label}</span>
                  <span className="text-sm font-black text-[#f7fcff]">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="schedule-builder" className="scroll-mt-24 border-b border-[#5c799640] bg-[#f3f7fb] text-[#102338]">
        <div className="mx-auto grid w-full max-w-[1180px] gap-6 px-5 py-12 lg:py-14">
          <div className="max-w-[920px]">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#176c65]">Major Schedule Builder section</p>
            <h2 className="m-0 pt-2 text-[1.9rem] leading-tight font-black text-[#102338] md:text-[2.45rem]">
              Example: an Excel-style room/rotation schedule becomes CFSP event cards.
            </h2>
            <p className="m-0 pt-4 text-[1rem] leading-[1.75] font-semibold text-[#486176]">
              CFSP can take an organization's existing scheduling workflow and adapt it into structured event cards by round, room, learner group, SP, case, and timing. The same schedule can then support capacity checks, preview, print, and export.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <article className="rounded-2xl border border-[#cad8e5] bg-white p-5 shadow-[0_18px_46px_rgba(16,35,56,0.1)]">
              <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#8c5a09]">Old way</p>
              <h3 className="m-0 pt-2 text-[1.25rem] font-black text-[#102338]">Excel-style schedule grid</h3>
              <div className="mt-4 overflow-hidden rounded-xl border border-[#d8e4ee]">
                {oldScheduleRows.map((row) => (
                  <div key={row.join("-")} className="grid grid-cols-5 border-b border-[#e3ebf2] text-[11px] font-bold text-[#486176] last:border-b-0">
                    {row.map((cell) => (
                      <div key={cell} className="min-h-[46px] border-r border-[#e3ebf2] px-2 py-2 last:border-r-0">
                        {cell}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-[#cad8e5] bg-white p-5 shadow-[0_18px_46px_rgba(16,35,56,0.1)]">
              <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#176c65]">CFSP way</p>
              <h3 className="m-0 pt-2 text-[1.25rem] font-black text-[#102338]">Structured event cards</h3>
              <div className="mt-4 grid gap-3">
                {scheduleCards.map((card) => (
                  <div key={`${card.round}-${card.room}-${card.learners}`} className="rounded-xl border border-[#d8e4ee] bg-[#f8fbfd] p-4">
                    <div className="flex flex-wrap justify-between gap-2 text-sm font-black text-[#102338]">
                      <span>{card.round} - {card.room}</span>
                      <span>{card.time}</span>
                    </div>
                    <p className="m-0 pt-2 text-sm font-bold text-[#486176]">
                      {card.learners} - {card.sp} - {card.case}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            {["Capacity checks", "Learner slots", "Room assignments", "Printable/exportable schedule"].map((item) => (
              <div key={item} className="rounded-xl border border-[#cad8e5] bg-white px-4 py-3 text-sm font-black text-[#102338]">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="sp-portal" className="scroll-mt-24 border-b border-[#5c799640] bg-[#06111d]">
        <div className="mx-auto grid w-full max-w-[1180px] gap-6 px-5 py-12 lg:grid-cols-[0.85fr_1.15fr] lg:py-14">
          <div>
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9eeade]">SP Portal release</p>
            <h2 className="m-0 pt-2 text-[1.85rem] leading-tight font-black text-[#f7fcff] md:text-[2.25rem]">
              Admin readiness controls what SPs see.
            </h2>
            <p className="m-0 pt-4 text-[1rem] leading-[1.75] font-semibold text-[#d0e3f3de]">
              Release only the details SPs should see: schedule, location, cases, materials, arrival instructions, and acknowledgments.
            </p>
          </div>
          <div className="rounded-2xl border border-[#8bb2d255] bg-[#102840d1] p-5">
            <div className="grid gap-2">
              {portalReadiness.map(([label, value]) => (
                <div key={label} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#84a8c84a] bg-[#0d2338d4] px-4 py-3">
                  <span className="text-sm font-bold text-[#d7e8f6]">{label}</span>
                  <span className="text-sm font-black text-[#f7fcff]">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="day-of" className="scroll-mt-24 border-b border-[#5c799640] bg-[#071421]">
        <div className="mx-auto grid w-full max-w-[1180px] gap-6 px-5 py-12 lg:grid-cols-[0.85fr_1.15fr] lg:py-14">
          <div>
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9dc9ee]">Day-of Check-in</p>
            <h2 className="m-0 pt-2 text-[1.85rem] leading-tight font-black text-[#f7fcff] md:text-[2.25rem]">
              Planning carries into check-in, overrides, attendance, and closeout.
            </h2>
            <p className="m-0 pt-4 text-[1rem] leading-[1.75] font-semibold text-[#d0e3f3de]">
              Track check-in, overrides, attendance, and closeout so event-day changes do not disappear into side notes.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {dayOfSignals.map((item) => (
              <div key={item} className="rounded-xl border border-[#84a8c84a] bg-[#102236d9] px-4 py-3 text-sm font-bold leading-6 text-[#d7e8f6]">
                {item}
              </div>
            ))}
          </div>
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
              {primaryCtas.map((cta) => (
                <CtaLink key={cta.label} href={cta.href} label={cta.label} primary={cta.primary} />
              ))}
            </div>
          </article>

          <aside className="rounded-2xl border border-[#8bb2d255] bg-[#102840d1] p-5">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9eeade]">Safe demo note</p>
            <h2 className="m-0 pt-2 text-[1.45rem] leading-tight font-black text-[#f7fcff]">This demo uses fake sandbox data.</h2>
            <p className="m-0 pt-3 text-[1rem] leading-[1.68] font-semibold text-[#d3e6f5db]">
              Names, emails, events, and organizations are fictional. The workflow is modeled after real simulation operations problems.
            </p>
            <p className="m-0 pt-3 text-[0.95rem] leading-[1.6] font-semibold text-[#bfe3f8]">
              The public demo keeps the story focused on the workflow a simulation operations professional would evaluate in under two minutes.
            </p>
          </aside>
        </div>
      </section>
    </main>
  );
}
