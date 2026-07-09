import type { Metadata } from "next";
import Link from "next/link";

import { DemoFlowLink } from "./DemoFlowLink";
import GuidedProductDemo from "./GuidedProductDemo";

export const metadata: Metadata = {
  title: "Conflict-Free SP Demo | Event Command Center for Simulation Teams",
  description:
    "A polished public Conflict-Free SP demo showing how simulation teams convert rosters, schedules, SP outreach, portal release, and day-of check-in into one Event Command Center with fictional data.",
};

const outcomeCards = [
  "One event readiness view",
  "Roster + schedule aligned",
  "SP outreach tracked",
  "Portal release controlled",
  "Day-of check-in visible",
] as const;

const beforeItems = [
  "Excel schedule grids",
  "Microsoft Forms SP polls",
  "Email confirmations",
  "Learner roster attachments",
  "Manual backup tracking",
  "Materials in separate folders",
  "SPs asking what, where, and when",
] as const;

const afterItems = [
  "Event Command Center",
  "Schedule Builder event cards",
  "Learner roster source of truth",
  "SP outreach and hiring lifecycle",
  "Active roster separate from outreach history",
  "Portal release controls",
  "Check-in and closeout",
] as const;

const whoFor = [
  "SP Program Coordinators",
  "Simulation Operations Teams",
  "Clinical Skills Centers",
  "Nursing, PA, Medicine, PT, and OT programs",
  "Programs still using spreadsheets, email, or Microsoft Forms",
] as const;

const builtAround = [
  {
    title: "Upload rosters",
    detail: "Use CSV or XLSX rosters as the planning source instead of retyping learners.",
  },
  {
    title: "Convert schedule grids",
    detail: "Turn timing blocks, rooms, learner groups, SP assignments, and cases into event cards.",
  },
  {
    title: "Import or record SP poll responses",
    detail: "Keep email and Microsoft Forms workflows during transition.",
  },
  {
    title: "Track hiring and backup coverage",
    detail: "Separate active staffing from outreach history and no-response recipients.",
  },
  {
    title: "Release portal details gradually",
    detail: "SPs see only what the simulation team has released.",
  },
  {
    title: "Keep day-of status visible",
    detail: "Carry check-in, overrides, attendance, and closeout into the same event record.",
  },
] as const;

const scenarioFacts = [
  ["32", "learners"],
  ["4", "rooms"],
  ["4", "cases"],
  ["6 + 1", "SP coverage target"],
] as const;

function PrimaryPreviewLink({ children }: { children: string }) {
  return (
    <DemoFlowLink className="inline-flex min-h-[48px] items-center justify-center rounded-[8px] border border-[#0a615a] bg-[#0b746b] px-5 text-sm font-black text-white no-underline shadow-[0_14px_34px_rgba(13,117,109,0.24)] transition hover:-translate-y-px hover:bg-[#095f58]">
      {children}
    </DemoFlowLink>
  );
}

function SecondaryLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[48px] items-center justify-center rounded-[8px] border border-[#c9d8e4] bg-white px-5 text-sm font-black text-[#123044] no-underline transition hover:-translate-y-px hover:border-[#0d756d] hover:text-[#0d756d]"
    >
      {children}
    </Link>
  );
}

function HeroMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <div className="rounded-[8px] border border-[#c9d8e4] bg-white shadow-[0_28px_80px_rgba(18,48,68,0.18)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8e3ec] px-4 py-3">
          <div>
            <div className="text-[11px] font-black uppercase text-[#0d756d]">Event Command Center</div>
            <div className="mt-1 text-sm font-black text-[#123044]">Neurologic Assessment: Stroke Warning Signs</div>
          </div>
          <span className="rounded-full border border-[#f0d08a] bg-[#fff8e8] px-3 py-1 text-[10px] font-black text-[#765103]">
            1 backup gap
          </span>
        </div>

        <div className="grid gap-3 p-4 lg:grid-cols-[150px_1fr]">
          <aside className="grid content-start gap-2">
            {["Snapshot", "Schedule", "SP Hiring", "Roster", "Portal"].map((item, index) => (
              <div
                key={item}
                className={
                  index === 1
                    ? "rounded-[8px] border border-[#0d756d] bg-[#eefaf7] px-3 py-2 text-xs font-black text-[#0d5f55]"
                    : "rounded-[8px] border border-[#d8e3ec] bg-[#f7fafc] px-3 py-2 text-xs font-bold text-[#536a7d]"
                }
              >
                {item}
              </div>
            ))}
          </aside>

          <main className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["Learners", "32 imported"],
                ["Schedule", "Capacity warning"],
                ["SPs", "6 primary covered"],
                ["Portal", "Release pending"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[8px] border border-[#d8e3ec] bg-[#f7fafc] p-3">
                  <div className="text-[10px] font-black uppercase text-[#657a8c]">{label}</div>
                  <div className="mt-1 text-sm font-black text-[#123044]">{value}</div>
                </div>
              ))}
            </div>

            <div className="rounded-[8px] border border-[#f0d08a] bg-[#fff8e8] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-black text-[#765103]">Next recommended action</div>
                  <div className="mt-1 text-sm font-black leading-6 text-[#123044]">Resolve schedule capacity, then release ready SP portal details.</div>
                </div>
                <button type="button" className="rounded-[8px] border border-[#d29b39] bg-white px-3 py-2 text-[11px] font-black text-[#765103]">
                  Review blockers
                </button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ["Round 1", "Exam 1 - Group A"],
                ["Round 1", "Exam 2 - Group B"],
                ["Round 2", "Exam 1 - Group E"],
              ].map(([label, value]) => (
                <div key={`${label}-${value}`} className="rounded-[8px] border border-[#b7e4d8] bg-[#eefaf7] p-3">
                  <div className="text-[10px] font-black uppercase text-[#0d5f55]">{label}</div>
                  <div className="mt-1 text-xs font-black leading-5 text-[#123044]">{value}</div>
                </div>
              ))}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string;
  title: string;
  copy?: string;
}) {
  return (
    <div className="max-w-[860px]">
      <p className="m-0 text-xs font-black uppercase text-[#0d756d]">{eyebrow}</p>
      <h2 className="m-0 mt-3 text-3xl font-black leading-tight text-[#0f2638] md:text-5xl">{title}</h2>
      {copy ? <p className="m-0 mt-4 text-base font-semibold leading-8 text-[#4a6071] md:text-lg">{copy}</p> : null}
    </div>
  );
}

export default function PublicDemoPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#fbfcfb] text-[#123044]">
      <section className="border-b border-[#dde8ee] bg-[#fbfcfb]">
        <div className="mx-auto grid w-full max-w-[1220px] gap-12 px-5 py-6 md:py-8">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="text-base font-black text-[#0f2638] no-underline">
              Conflict-Free SP
            </Link>
            <nav className="flex flex-wrap gap-2" aria-label="Public demo navigation">
              <PrimaryPreviewLink>View the live demo flow</PrimaryPreviewLink>
              <SecondaryLink href="/request-demo">Request feedback walkthrough</SecondaryLink>
            </nav>
          </header>

          <div className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <section className="grid gap-6">
              <div className="w-fit rounded-full border border-[#b7e4d8] bg-[#eefaf7] px-3 py-1 text-xs font-black uppercase text-[#0d5f55]">
                Public product demo
              </div>
              <div>
                <h1 className="m-0 max-w-[860px] text-5xl font-black leading-[0.98] text-[#0f2638] md:text-7xl">
                  Turn scattered SP event prep into one command center.
                </h1>
                <p className="m-0 mt-6 max-w-[780px] text-lg font-semibold leading-8 text-[#4a6071] md:text-xl">
                  CFSP helps simulation teams import rosters, convert existing schedules, poll and hire SPs, release portal details, and see what is ready before event day.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <PrimaryPreviewLink>View the live demo flow</PrimaryPreviewLink>
                <SecondaryLink href="/request-demo">Request feedback walkthrough</SecondaryLink>
                <SecondaryLink href="/contact">Share feedback</SecondaryLink>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                {scenarioFacts.map(([value, label]) => (
                  <div key={label} className="rounded-[8px] border border-[#d8e3ec] bg-white p-3">
                    <div className="text-2xl font-black text-[#0f2638]">{value}</div>
                    <div className="mt-1 text-xs font-black uppercase text-[#657a8c]">{label}</div>
                  </div>
                ))}
              </div>
            </section>

            <HeroMockup />
          </div>
        </div>
      </section>

      <section className="border-b border-[#dde8ee] bg-white">
        <div className="mx-auto grid w-full max-w-[1220px] gap-3 px-5 py-6 md:grid-cols-5">
          {outcomeCards.map((item) => (
            <div key={item} className="rounded-[8px] border border-[#d8e3ec] bg-[#f7fafc] px-4 py-4 text-sm font-black text-[#123044]">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#fbfcfb] py-16 md:py-20">
        <div className="mx-auto grid w-full max-w-[1220px] gap-8 px-5">
          <SectionHeading
            eyebrow="What CFSP replaces"
            title="The workflow stays familiar. The operating picture gets clearer."
            copy="CFSP is a workflow conversion tool for simulation teams that already coordinate through spreadsheets, rosters, forms, inboxes, and day-of notes."
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-[8px] border border-[#f0d08a] bg-[#fff8e8] p-5">
              <p className="m-0 text-xs font-black uppercase text-[#765103]">Before CFSP</p>
              <h3 className="m-0 mt-2 text-2xl font-black text-[#0f2638]">The work is scattered.</h3>
              <div className="mt-5 grid gap-2">
                {beforeItems.map((item) => (
                  <div key={item} className="rounded-[8px] border border-[#efd69b] bg-white px-4 py-3 text-sm font-bold text-[#5c4a22]">
                    {item}
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[8px] border border-[#b7e4d8] bg-[#eefaf7] p-5">
              <p className="m-0 text-xs font-black uppercase text-[#0d5f55]">With CFSP</p>
              <h3 className="m-0 mt-2 text-2xl font-black text-[#0f2638]">The event has one command center.</h3>
              <div className="mt-5 grid gap-2">
                {afterItems.map((item) => (
                  <div key={item} className="rounded-[8px] border border-[#c7e9df] bg-white px-4 py-3 text-sm font-bold text-[#23483f]">
                    {item}
                  </div>
                ))}
              </div>
            </article>
          </div>
        </div>
      </section>

      <GuidedProductDemo />

      <section className="bg-white py-16 md:py-20">
        <div className="mx-auto grid w-full max-w-[1220px] gap-10 px-5 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <SectionHeading
            eyebrow="Built around your current process"
            title="Start with what your simulation program already uses."
            copy="CFSP does not require a perfect migration on day one. It gives coordinators a cleaner path from existing files and outreach into structured event operations."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {builtAround.map((item) => (
              <article key={item.title} className="rounded-[8px] border border-[#d8e3ec] bg-[#f7fafc] p-4">
                <h3 className="m-0 text-lg font-black text-[#0f2638]">{item.title}</h3>
                <p className="m-0 mt-2 text-sm font-semibold leading-6 text-[#4a6071]">{item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-[#dde8ee] bg-[#f4f8f7] py-16 md:py-20">
        <div className="mx-auto grid w-full max-w-[1220px] gap-8 px-5">
          <SectionHeading
            eyebrow="Who this is for"
            title="Made for the people who keep SP events moving."
            copy="The public demo is written for operators who need practical readiness, not another generic roster screen."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {whoFor.map((item) => (
              <div key={item} className="rounded-[8px] border border-[#d8e3ec] bg-white p-4 text-sm font-black leading-6 text-[#123044]">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#10283c] py-16 text-white md:py-20">
        <div className="mx-auto grid w-full max-w-[1220px] gap-8 px-5 lg:grid-cols-[1fr_0.82fr] lg:items-center">
          <div>
            <p className="m-0 text-xs font-black uppercase text-[#9eeade]">Feedback ask</p>
            <h2 className="m-0 mt-3 max-w-[760px] text-4xl font-black leading-tight md:text-6xl">
              Does this match how your SP events actually work?
            </h2>
            <p className="m-0 mt-5 max-w-[720px] text-base font-semibold leading-8 text-[#d5e8f5] md:text-lg">
              I am looking for feedback from simulation operations professionals, SP program coordinators, and clinical skills teams.
            </p>
          </div>
          <div className="rounded-[8px] border border-[#406175] bg-[#15344c] p-5">
            <h3 className="m-0 text-xl font-black">This demo uses fake sandbox data.</h3>
            <p className="m-0 mt-3 text-sm font-semibold leading-7 text-[#d5e8f5]">
              Names, emails, events, and organizations are fictional. The workflow is modeled after real simulation operations problems.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <SecondaryLink href="/request-demo">Request a walkthrough</SecondaryLink>
              <SecondaryLink href="/contact">Share feedback</SecondaryLink>
              <PrimaryPreviewLink>View public preview</PrimaryPreviewLink>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
