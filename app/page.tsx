import Link from "next/link";
import Image from "next/image";

const trustChips = [
  "Private prototype",
  "Pilot-ready development",
  "Healthcare simulation operations",
  "Built by simulation operations experience",
];

const commandCenterRows = [
  { label: "Staffing Coverage", value: "8 / 10 confirmed", tone: "mint" },
  { label: "Training Readiness", value: "6 pending", tone: "amber" },
  { label: "Materials", value: "Case file uploaded", tone: "cyan" },
  { label: "Live Announcements", value: "3 scheduled", tone: "indigo" },
  { label: "Event Status", value: "Planning Mode", tone: "rose" },
  { label: "SP Responses", value: "14 received", tone: "emerald" },
] as const;

const painPoints = [
  "Staffing gaps and last-minute reconciliation",
  "Availability polls buried in email threads",
  "Materials, schedules, and announcements living in separate places",
];

const platformAreas = [
  {
    label: "Staffing",
    title: "Staffing without spreadsheet chaos",
    detail:
      "Run staffing from one command center instead of scattered files, threads, and last-minute manual reconciliation.",
  },
  {
    label: "Readiness",
    title: "Availability, confirmations, and training readiness",
    detail:
      "Track SP availability and response status in one flow so the team can confirm readiness before event day.",
  },
  {
    label: "Operations",
    title: "Event materials, schedules, announcements, and live operations",
    detail:
      "Keep event context, operational materials, schedule views, and live updates together while the day is in motion.",
  },
  {
    label: "Program Fit",
    title:
      "Built for simulation centers, SP programs, nursing, PA, medical education, and clinical skills labs",
    detail:
      "Designed for the people running simulation operations, including program leaders, coordinators, and faculty teams.",
  },
 ] as const;

const workflowSteps = [
  "Plan the event",
  "Staff the SPs",
  "Prepare materials/training",
  "Run the day live",
];

const audience = [
  "Simulation operations specialists",
  "SP program directors",
  "Clinical skills coordinators",
  "Nursing, PA, and medical education teams",
  "Simulation center leadership",
];

const footerLinks = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/contact", label: "Contact" },
  { href: "/request-demo", label: "Request a demo" },
  { href: "/login", label: "Login" },
];

function rowToneClass(tone: (typeof commandCenterRows)[number]["tone"]) {
  if (tone === "mint") return "border-l-[#38cfa4] bg-[#0b2b2f]";
  if (tone === "amber") return "border-l-[#f1b85b] bg-[#30230e]";
  if (tone === "cyan") return "border-l-[#4cc6ff] bg-[#0d2433]";
  if (tone === "indigo") return "border-l-[#8ea0ff] bg-[#161f46]";
  if (tone === "rose") return "border-l-[#f08ea3] bg-[#3b1d2b]";
  return "border-l-[#5cd6a7] bg-[#132f28]";
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[#070f19] text-[#e8f1f8]">
      <section
        className="relative overflow-hidden border-b border-[#6a86a340]"
        style={{ minHeight: "88vh" }}
      >
        <Image
          src="/branding/cfsp-hero-ops.svg"
          alt="Command center style operations visual"
          fill
          priority
          sizes="100vw"
          style={{ objectFit: "cover" }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(95deg,rgba(7,15,25,0.95)_18%,rgba(7,15,25,0.78)_53%,rgba(7,15,25,0.68)_100%)]" />
        <div
          className="absolute inset-0 opacity-45"
          style={{
            backgroundImage:
              "linear-gradient(rgba(106,134,163,0.11) 1px, transparent 1px), linear-gradient(90deg, rgba(106,134,163,0.11) 1px, transparent 1px)",
            backgroundSize: "44px 44px, 44px 44px",
            maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.85), rgba(0,0,0,0.25))",
          }}
        />

        <div className="relative mx-auto grid min-h-[88vh] w-full max-w-[1240px] grid-rows-[auto_1fr] px-5 pt-6 pb-14 md:pb-18">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[15px] font-black text-[#eff7ff]">
              Conflict-Free SP LLC
            </div>
            <Link
              href="/login"
              className="inline-flex min-h-[42px] items-center rounded-lg border border-[#7ca5cb5f] bg-[#0f2740c7] px-4 text-sm font-bold text-[#e8f2fb] no-underline transition hover:border-[#96c0e2a2] hover:bg-[#16334ea8]"
            >
              Login
            </Link>
          </header>

          <div className="grid items-center gap-10 py-10 md:grid-cols-[minmax(0,1.03fr)_minmax(0,0.97fr)] md:gap-8 lg:gap-10">
            <div className="grid gap-5">
              <p className="m-0 text-xs font-extrabold uppercase tracking-[0.02em] text-[#96c8ff]">
                Simulation Operations Command Center
              </p>
              <h1 className="m-0 text-[2.3rem] leading-[1.06] font-black text-[#f7fbff] md:text-[3.8rem]">
                Conflict-Free SP
              </h1>
              <p className="m-0 max-w-[740px] text-[1.06rem] leading-[1.58] font-bold text-[#e8f2fccc] md:text-[1.28rem]">
                The simulation operations command center for modern healthcare education.
              </p>
              <p className="m-0 max-w-[760px] text-[1rem] leading-[1.62] font-semibold text-[#d5e6f4d9]">
                Built for simulation teams coordinating SP staffing, availability, training readiness, schedules, materials,
                announcements, and live event operations without spreadsheet chaos.
              </p>

              <div className="flex flex-wrap gap-2.5 pt-1">
                {trustChips.map((chip) => (
                  <span
                    key={chip}
                    className="inline-flex min-h-[34px] items-center rounded-full border border-[#78a9d067] bg-[#0f2438bd] px-3 py-1 text-[12px] font-bold text-[#d9ebfb]"
                  >
                    {chip}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  href="/request-demo"
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-[#75b9ff8a] bg-[#1673c8] px-4 text-sm font-extrabold text-white no-underline shadow-[0_14px_30px_rgba(10,38,67,0.42)] transition hover:-translate-y-px hover:bg-[#1783e4]"
                >
                  Request a demo
                </Link>
                <Link
                  href="/login"
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-[#80abcf7a] bg-[#0e2439ce] px-4 text-sm font-extrabold text-[#e8f2fb] no-underline transition hover:border-[#9bc2e0b0] hover:bg-[#17344eb8]"
                >
                  Login
                </Link>
              </div>
            </div>

            <aside
              aria-label="Command-center preview"
              className="grid gap-4 rounded-lg border border-[#7ba3c737] bg-[#0a1e31d8] p-4 shadow-[0_18px_42px_rgba(2,10,19,0.44)] backdrop-blur-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.05em] text-[#9fcbf2]">
                    Command-Center Preview
                  </p>
                  <h2 className="m-0 pt-1 text-[20px] leading-tight font-black text-[#f6fbff]">
                    Operational Snapshot
                  </h2>
                </div>
                <span className="rounded-full border border-[#84a5c454] bg-[#0f2a3ea8] px-2.5 py-1 text-[11px] font-bold text-[#cce4fa]">
                  Static UI example
                </span>
              </div>

              <div className="grid gap-2">
                {commandCenterRows.map((row) => (
                  <div
                    key={row.label}
                    className={`flex items-center justify-between gap-4 rounded-md border border-[#8db0cb30] border-l-[4px] px-3 py-2.5 transition hover:border-[#9ec5e45a] ${rowToneClass(row.tone)}`}
                  >
                    <span className="text-[12px] font-bold text-[#e4f0f9]">{row.label}</span>
                    <span className="text-[12px] font-black text-white">{row.value}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-md border border-[#86aac83d] bg-[#10293fb0] px-3 py-2 text-[12px] leading-[1.5] font-semibold text-[#d7e9f9]">
                Coordinated operations surface for staffing, readiness, communications, and day-of event visibility.
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="border-b border-[#5c799640] bg-[#0b1826]">
        <div className="mx-auto grid w-full max-w-[1240px] gap-5 px-5 py-14 md:py-16">
          <div className="grid gap-2">
            <h2 className="m-0 text-[1.55rem] leading-tight font-black text-[#f7fcff] md:text-[2rem]">
              Simulation operations should not depend on scattered spreadsheets.
            </h2>
            <p className="m-0 max-w-[840px] text-[1rem] leading-[1.58] font-semibold text-[#cfe0efd7]">
              CFSP keeps core operational workflows in one shared command center so teams can move from planning to live execution
              without fragmented handoffs.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {painPoints.map((item, index) => (
              <article
                key={item}
                className="grid gap-2 rounded-lg border border-[#88acc74a] bg-[#102335d8] p-4 transition hover:border-[#9ac3e44d] hover:bg-[#142b43de]"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#a5c8e84c] bg-[#173652] text-sm font-extrabold text-[#daf0ff]">
                  {index + 1}
                </span>
                <h3 className="m-0 text-[1.03rem] leading-[1.42] font-extrabold text-[#f5fbff]">{item}</h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#5c799640] bg-[#081625]">
        <div className="mx-auto grid w-full max-w-[1240px] gap-6 px-5 py-14 md:py-16">
          <div className="grid gap-2">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.05em] text-[#9dc9ee]">Platform Coverage</p>
            <h2 className="m-0 text-[1.5rem] leading-tight font-black text-[#f7fcff] md:text-[1.9rem]">
              Purpose-built for healthcare simulation operations
            </h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {platformAreas.map((area) => (
              <article
                key={area.title}
                className="grid gap-2 rounded-lg border border-[#84a8c84a] bg-[#102236d9] p-4 transition hover:border-[#9cc2e34e] hover:bg-[#152d46db]"
              >
                <span className="inline-flex w-fit rounded-full border border-[#9fc2df51] bg-[#0d3045] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.04em] text-[#d1e9fb]">
                  {area.label}
                </span>
                <h3 className="m-0 text-[1.06rem] leading-[1.4] font-extrabold text-[#f4fbff]">{area.title}</h3>
                <p className="m-0 text-[0.97rem] leading-[1.56] font-semibold text-[#d0e3f3de]">{area.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#5c799640] bg-[#0a1828]">
        <div className="mx-auto grid w-full max-w-[1240px] gap-5 px-5 py-14 md:py-16">
          <div className="grid gap-2">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.05em] text-[#a1cdf0]">Workflow</p>
            <h2 className="m-0 text-[1.5rem] leading-tight font-black text-[#f6fbff] md:text-[1.85rem]">
              A clear operations flow from planning through live event execution
            </h2>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            {workflowSteps.map((step, index) => (
              <article
                key={step}
                className="grid gap-2 rounded-lg border border-[#83a8c849] bg-[#102436d9] p-4 transition hover:border-[#9ec6e45b] hover:bg-[#15304ad8]"
              >
                <span className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[#9ec9eb]">Step {index + 1}</span>
                <h3 className="m-0 text-[1rem] leading-[1.4] font-black text-[#f5fbff]">{step}</h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#5c799640] bg-[#081524]">
        <div className="mx-auto grid w-full max-w-[1240px] gap-5 px-5 py-14 md:py-16">
          <div className="grid gap-2">
            <h2 className="m-0 text-[1.48rem] leading-tight font-black text-[#f7fcff] md:text-[1.85rem]">
              Built for the people behind simulation
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {audience.map((role) => (
              <article
                key={role}
                className="rounded-lg border border-[#88adca45] bg-[#12293edb] px-4 py-3 text-[0.96rem] leading-[1.5] font-bold text-[#e6f1f9] transition hover:border-[#9ec3e44f] hover:bg-[#16314ad8]"
              >
                {role}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#5c799640] bg-[#0b1827]">
        <div className="mx-auto grid w-full max-w-[1240px] gap-4 px-5 py-14 md:py-16">
          <div className="rounded-lg border border-[#8bb2d255] bg-[#102840d1] px-5 py-5">
            <h2 className="m-0 text-[1.32rem] leading-tight font-black text-[#f7fcff] md:text-[1.6rem]">
              Current stage
            </h2>
            <p className="m-0 pt-3 text-[0.98rem] leading-[1.62] font-semibold text-[#d2e5f5db]">
              Conflict-Free SP is currently in private prototype / pilot-ready development. Demo conversations and pilot planning
              should use fictional, demo, de-identified, or properly authorized data only.
            </p>
            <div className="flex flex-wrap gap-3 pt-4">
              <Link
                href="/request-demo"
                className="inline-flex min-h-[42px] items-center rounded-lg border border-[#78b8f38d] bg-[#156dc0] px-4 text-sm font-extrabold text-white no-underline transition hover:bg-[#177dde]"
              >
                Request a demo
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-[42px] items-center rounded-lg border border-[#89b2d07f] bg-[#132c42d0] px-4 text-sm font-extrabold text-[#ecf6ff] no-underline transition hover:bg-[#1a3a55d7]"
              >
                Login
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer
        className="border-t border-[#7ca1c63d] bg-[#06101b]"
      >
        <div className="mx-auto grid w-full max-w-[1240px] gap-4 px-5 py-8 text-[#d8e8f5] md:grid-cols-[1fr_auto] md:items-end">
          <div className="grid gap-1.5">
            <div className="text-[15px] font-black">Conflict-Free SP LLC</div>
            <a href="mailto:cory@conflictfreesp.com" className="w-fit text-sm font-bold text-[#bfe2ff] no-underline hover:text-[#d8efff]">
              cory@conflictfreesp.com
            </a>
            <a href="https://conflictfreesp.com" className="w-fit text-sm font-bold text-[#bfe2ff] no-underline hover:text-[#d8efff]">
              conflictfreesp.com
            </a>
            <div className="pt-1 text-xs font-semibold text-[#b5cee1]">
              © 2026 Conflict-Free SP LLC. All rights reserved.
            </div>
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            {footerLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex min-h-[40px] items-center rounded-lg border border-[#87aac67f] bg-[#11253ad1] px-4 text-sm font-extrabold text-[#e8f2fb] no-underline transition hover:bg-[#17334ed2]"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </main>
  );
}
