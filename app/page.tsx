import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Conflict-Free SP | Simulation Operations Command Center",
  description:
    "CFSP helps healthcare simulation teams manage SP staffing, schedules, training readiness, materials release, and live event-day operations from one command center.",
};

const manageCards = [
  {
    title: "SP staffing",
    detail: "See staffing coverage, backups, assignment gaps, and confirmation status without rebuilding the truth from a spreadsheet.",
  },
  {
    title: "Availability and confirmations",
    detail: "Keep availability, outreach, responses, and hire confirmations tied to the event instead of buried in email threads.",
  },
  {
    title: "Schedules and learner flow",
    detail: "Give operations teams a clearer view of rooms, rotations, learner movement, and schedule previews before event day.",
  },
  {
    title: "Training and materials release",
    detail: "Organize case materials, prep instructions, release timing, and training readiness in one operational workspace.",
  },
  {
    title: "Readiness tracking",
    detail: "Track what is ready, what is pending, and what still needs follow-up across staffing, rooms, materials, and communications.",
  },
  {
    title: "Live event-day operations",
    detail: "Support the day-of run with event context, readiness signals, SP visibility, and fewer last-minute surprises.",
  },
] as const;

const workflowSteps = ["Plan", "Staff", "Prepare", "Release", "Run", "Review"] as const;

const audience = [
  "SP Program Directors",
  "Simulation Operations Specialists",
  "Clinical Skills teams",
  "Nursing, PA, and Medical Education simulation teams",
  "Simulation center leadership",
] as const;

const demoStats = [
  { label: "SPs", value: "10" },
  { label: "Rooms", value: "4" },
  { label: "Learners", value: "48" },
  { label: "Mode", value: "Live readiness" },
] as const;

const footerLinks = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/contact", label: "Contact" },
  { href: "/request-demo", label: "Request Demo" },
  { href: "/login", label: "Sign In" },
] as const;

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#07111c] text-[#edf7ff]">
      <section className="relative border-b border-[#7fa6c84d]">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 16% 18%, rgba(54, 191, 168, 0.22), transparent 30%), radial-gradient(circle at 82% 16%, rgba(74, 144, 226, 0.2), transparent 34%), linear-gradient(135deg, #050b12 0%, #071523 46%, #0d2236 100%)",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-45"
          style={{
            backgroundImage:
              "linear-gradient(rgba(132,174,207,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(132,174,207,0.12) 1px, transparent 1px)",
            backgroundSize: "42px 42px",
            maskImage: "linear-gradient(to bottom, black, rgba(0,0,0,0.32))",
          }}
        />

        <div className="relative mx-auto grid min-h-[88vh] w-full max-w-[1240px] grid-rows-[auto_1fr] px-5 pt-6 pb-14 md:pb-18">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="text-[15px] font-black tracking-[-0.01em] text-[#f5fbff] no-underline">
              Conflict-Free SP LLC
            </Link>
            <nav className="flex flex-wrap gap-2" aria-label="Public navigation">
              <Link
                href="/request-demo"
                className="inline-flex min-h-[42px] items-center rounded-lg border border-[#86c8ff70] bg-[#123553cf] px-4 text-sm font-extrabold text-[#eff8ff] no-underline transition hover:border-[#a4d7ff] hover:bg-[#174569]"
              >
                Request Demo
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-[42px] items-center rounded-lg border border-[#7ca5cb5f] bg-[#0d2237bf] px-4 text-sm font-bold text-[#e8f2fb] no-underline transition hover:border-[#96c0e2a2] hover:bg-[#143450]"
              >
                Sign In
              </Link>
            </nav>
          </header>

          <div className="grid items-center gap-10 py-10 md:grid-cols-[minmax(0,1.02fr)_minmax(330px,0.98fr)] md:gap-8 lg:gap-12">
            <div className="grid gap-6">
              <div className="grid gap-4">
                <p className="m-0 w-fit rounded-full border border-[#85d9cc59] bg-[#0b2f35b8] px-3 py-1 text-xs font-extrabold uppercase tracking-[0.08em] text-[#9eeade]">
                  Simulation Operations Command Center
                </p>
                <h1 className="m-0 max-w-[820px] text-[2.45rem] leading-[1.02] font-black tracking-[-0.045em] text-[#f8fcff] md:text-[4.6rem]">
                  Stop running simulation events from spreadsheets, email threads, and memory.
                </h1>
                <p className="m-0 max-w-[800px] text-[1.05rem] leading-[1.62] font-semibold text-[#dcecf9e0] md:text-[1.25rem]">
                  CFSP gives simulation teams one command center for SP staffing, learner flow, training readiness, schedules, materials,
                  and live event-day operations.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/request-demo"
                  className="inline-flex min-h-[48px] items-center rounded-lg border border-[#75b9ff8a] bg-[#1673c8] px-5 text-sm font-extrabold text-white no-underline shadow-[0_18px_34px_rgba(10,38,67,0.42)] transition hover:-translate-y-px hover:bg-[#1783e4]"
                >
                  Request Demo
                </Link>
                <Link
                  href="#platform"
                  className="inline-flex min-h-[48px] items-center rounded-lg border border-[#8eb9d575] bg-[#0e2439d4] px-5 text-sm font-extrabold text-[#eff8ff] no-underline transition hover:border-[#a8d0e9] hover:bg-[#173b5a]"
                >
                  Explore Platform
                </Link>
              </div>

              <div className="grid gap-2 pt-1 sm:grid-cols-2 lg:grid-cols-3">
                {audience.map((item) => (
                  <span
                    key={item}
                    className="rounded-lg border border-[#7fb6d943] bg-[#0b2235b5] px-3 py-2 text-[12px] font-bold text-[#d9edf9]"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <aside
              aria-label="Demo command center preview"
              className="relative overflow-hidden rounded-2xl border border-[#8fb5d45c] bg-[#081b2bd9] p-4 shadow-[0_22px_56px_rgba(2,10,19,0.5)] backdrop-blur-sm"
            >
              <div className="absolute right-[-80px] top-[-80px] h-48 w-48 rounded-full bg-[#2ab7a833] blur-3xl" aria-hidden="true" />
              <div className="relative grid gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9fcbf2]">
                      Demo Scenario
                    </p>
                    <h2 className="m-0 pt-1 text-[1.55rem] leading-tight font-black text-[#f6fbff]">
                      Nursing IPE Simulation
                    </h2>
                  </div>
                  <span className="rounded-full border border-[#85d9cc73] bg-[#0d3235] px-3 py-1 text-[11px] font-black text-[#b9fff2]">
                    Fictional pilot
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {demoStats.map((stat) => (
                    <div key={stat.label} className="rounded-xl border border-[#88acc74a] bg-[#102941d6] p-3">
                      <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#a8cce7]">{stat.label}</p>
                      <p className="m-0 pt-1 text-[1.35rem] font-black text-white">{stat.value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-2 rounded-xl border border-[#8db0cb3d] bg-[#0d2338d4] p-3">
                  {[
                    "Training materials released to confirmed SPs",
                    "Room assignments and schedule preview ready",
                    "Live readiness tracking for staffing, rooms, and materials",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-[13px] font-bold text-[#e6f3ff]">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#39d5aa] shadow-[0_0_16px_rgba(57,213,170,0.7)]" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section id="platform" className="border-b border-[#5c799640] bg-[#0b1826]">
        <div className="mx-auto grid w-full max-w-[1240px] gap-6 px-5 py-14 md:py-16">
          <div className="grid gap-2">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9dc9ee]">What CFSP helps you manage</p>
            <h2 className="m-0 text-[1.65rem] leading-tight font-black text-[#f7fcff] md:text-[2.25rem]">
              The operational pieces that usually scatter across files, inboxes, and hallway memory.
            </h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {manageCards.map((card) => (
              <article
                key={card.title}
                className="grid gap-2 rounded-xl border border-[#84a8c84a] bg-[#102236d9] p-5 transition hover:-translate-y-0.5 hover:border-[#9cc2e34e] hover:bg-[#152d46db]"
              >
                <h3 className="m-0 text-[1.08rem] leading-[1.35] font-extrabold text-[#f4fbff]">{card.title}</h3>
                <p className="m-0 text-[0.97rem] leading-[1.6] font-semibold text-[#d0e3f3de]">{card.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#5c799640] bg-[#071421]">
        <div className="mx-auto grid w-full max-w-[1240px] gap-8 px-5 py-14 md:grid-cols-[0.9fr_1.1fr] md:py-16">
          <div className="grid content-start gap-3">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9eeade]">Built for simulation chaos</p>
            <h2 className="m-0 text-[1.7rem] leading-tight font-black text-[#f7fcff] md:text-[2.25rem]">
              Replace the scramble with a shared operational picture.
            </h2>
          </div>
          <div className="grid gap-4 rounded-2xl border border-[#8ab1d14a] bg-[#10263bd8] p-5 md:p-6">
            <p className="m-0 text-[1rem] leading-[1.7] font-semibold text-[#d7e8f6]">
              Simulation events are full of moving pieces: room changes, SP gaps, late materials, learner flow updates, faculty requests,
              release timing, and day-of questions. CFSP is designed to reduce the operational drag of scattered spreadsheets, email chains,
              memory, and last-minute room or staffing confusion.
            </p>
            <p className="m-0 text-[1rem] leading-[1.7] font-semibold text-[#d7e8f6]">
              The goal is not another admin database. It is a command center that helps clinical skills and simulation operations teams know
              what is planned, what is ready, what is released, and what needs attention now.
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-[#5c799640] bg-[#0a1828]">
        <div className="mx-auto grid w-full max-w-[1240px] gap-6 px-5 py-14 md:py-16">
          <div className="grid gap-2">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9dc9ee]">How it works</p>
            <h2 className="m-0 text-[1.6rem] leading-tight font-black text-[#f7fcff] md:text-[2.15rem]">
              A cleaner path from planning to event-day execution.
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-6">
            {workflowSteps.map((step, index) => (
              <article key={step} className="rounded-xl border border-[#86aac84f] bg-[#10263bd8] p-4">
                <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9eeade]">Step {index + 1}</p>
                <h3 className="m-0 pt-2 text-[1.05rem] font-black text-[#f7fcff]">{step}</h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#5c799640] bg-[#081625]">
        <div className="mx-auto grid w-full max-w-[1240px] gap-5 px-5 py-14 md:grid-cols-[1fr_1fr] md:py-16">
          <article className="rounded-2xl border border-[#8bb2d255] bg-[#102840d1] p-5 md:p-6">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9dc9ee]">
              Built by simulation operations experience
            </p>
            <h2 className="m-0 pt-2 text-[1.55rem] leading-tight font-black text-[#f7fcff] md:text-[2rem]">
              Built by someone who has lived the day-of pressure.
            </h2>
            <p className="m-0 pt-3 text-[1rem] leading-[1.68] font-semibold text-[#d3e6f5db]">
              Built by a healthcare simulation operations professional who has lived the spreadsheet chaos, staffing gaps, room changes,
              late materials, and day-of pressure.
            </p>
          </article>

          <article className="rounded-2xl border border-[#8bb2d255] bg-[#102840d1] p-5 md:p-6">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9dc9ee]">Prototype and privacy note</p>
            <h2 className="m-0 pt-2 text-[1.55rem] leading-tight font-black text-[#f7fcff] md:text-[2rem]">
              Pilot thoughtfully. Keep sensitive data out.
            </h2>
            <p className="m-0 pt-3 text-[1rem] leading-[1.68] font-semibold text-[#d3e6f5db]">
              CFSP is currently positioned for prototype and pilot use. Do not use CFSP for PHI, real patient records, or unauthorized
              confidential institutional or student data.
            </p>
          </article>
        </div>
      </section>

      <section className="bg-[#06111d]">
        <div className="mx-auto grid w-full max-w-[1240px] gap-5 px-5 py-14 md:grid-cols-[1fr_auto] md:items-center md:py-16">
          <div>
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9eeade]">Ready to see the demo path?</p>
            <h2 className="m-0 pt-2 text-[1.75rem] leading-tight font-black text-[#f7fcff] md:text-[2.4rem]">
              Tell us what your simulation team is trying to simplify.
            </h2>
          </div>
          <Link
            href="/request-demo"
            className="inline-flex min-h-[48px] w-fit items-center rounded-lg border border-[#75b9ff8a] bg-[#1673c8] px-5 text-sm font-extrabold text-white no-underline shadow-[0_18px_34px_rgba(10,38,67,0.36)] transition hover:-translate-y-px hover:bg-[#1783e4]"
          >
            Request a CFSP demo
          </Link>
        </div>
      </section>

      <footer className="border-t border-[#5c799640] bg-[#050c14]">
        <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-3 px-5 py-6 text-[13px] font-semibold text-[#bcd1e0]">
          <span>Conflict-Free SP LLC</span>
          <nav className="flex flex-wrap gap-3" aria-label="Footer navigation">
            {footerLinks.map((link) => (
              <Link key={link.href} href={link.href} className="text-[#d9ebfb] no-underline hover:text-white">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </main>
  );
}
