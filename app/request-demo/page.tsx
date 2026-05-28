import Link from "next/link";

const detailsToInclude = [
  "Name",
  "Organization/program",
  "Role",
  "Simulation/SP workflow pain points",
  "Approximate event volume",
  "Whether you are interested in a demo, pilot conversation, or general discussion",
];

export default function RequestDemoPage() {
  return (
    <main className="min-h-screen bg-[#070f19] text-[#e8f1f8]">
      <div className="mx-auto grid w-full max-w-[980px] gap-6 px-5 py-8 md:py-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="text-[15px] font-black text-[#eff7ff] no-underline">
            Conflict-Free SP LLC
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/contact"
              className="inline-flex min-h-[40px] items-center rounded-lg border border-[#7ca5cb5f] bg-[#0f2740c7] px-4 text-sm font-bold text-[#e8f2fb] no-underline transition hover:bg-[#17344eb8]"
            >
              Contact
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-[40px] items-center rounded-lg border border-[#7ca5cb5f] bg-[#0f2740c7] px-4 text-sm font-bold text-[#e8f2fb] no-underline transition hover:bg-[#17344eb8]"
            >
              Login
            </Link>
          </div>
        </header>

        <section className="rounded-lg border border-[#7ca1c548] bg-[#0b1b2cd9] px-5 py-6 md:px-6">
          <p className="m-0 text-xs font-extrabold uppercase tracking-[0.05em] text-[#9fcbf2]">Request Demo</p>
          <h1 className="m-0 pt-2 text-[2rem] leading-tight font-black text-[#f7fcff] md:text-[2.4rem]">Request a CFSP Demo</h1>
          <p className="m-0 pt-3 max-w-[770px] text-[1rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
            CFSP is currently in private prototype and pilot-ready development. We are focused on private conversations with simulation
            leaders and teams evaluating pilot fit.
          </p>
          <div className="pt-4">
            <a
              href="mailto:cory@conflictfreesp.com?subject=Request%20CFSP%20Demo"
              className="inline-flex min-h-[44px] items-center rounded-lg border border-[#78b8f38d] bg-[#156dc0] px-4 text-sm font-extrabold text-white no-underline transition hover:bg-[#177dde]"
            >
              Email to request demo
            </a>
          </div>
        </section>

        <section className="rounded-lg border border-[#7ca1c548] bg-[#10263bd8] px-5 py-5">
          <h2 className="m-0 text-[1.2rem] font-black text-[#f5fbff]">Suggested details to include</h2>
          <ul className="m-0 grid gap-2 pt-3 pl-5 text-[0.97rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
            {detailsToInclude.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-[#8bb2d255] bg-[#102840d1] px-5 py-5">
          <p className="m-0 text-[0.95rem] leading-[1.65] font-semibold text-[#d2e5f5db]">
            Do not include PHI, patient records, confidential institutional data, or unauthorized student information.
          </p>
        </section>
      </div>
    </main>
  );
}
