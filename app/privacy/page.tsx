import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#070f19] text-[#e8f1f8]">
      <div className="mx-auto grid w-full max-w-[980px] gap-6 px-5 py-8 md:py-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="text-[15px] font-black text-[#eff7ff] no-underline">
            Conflict-Free SP LLC
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/request-demo"
              className="inline-flex min-h-[40px] items-center rounded-lg border border-[#7ca5cb5f] bg-[#0f2740c7] px-4 text-sm font-bold text-[#e8f2fb] no-underline transition hover:bg-[#17344eb8]"
            >
              Request a demo
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
          <p className="m-0 text-xs font-extrabold uppercase tracking-[0.05em] text-[#9fcbf2]">Privacy Policy</p>
          <h1 className="m-0 pt-2 text-[2rem] leading-tight font-black text-[#f7fcff] md:text-[2.4rem]">Conflict-Free SP Privacy Policy</h1>
          <p className="m-0 pt-3 text-sm leading-[1.65] font-semibold text-[#d3e6f5db]">
            Effective date: May 28, 2026
          </p>
          <p className="m-0 pt-2 text-sm leading-[1.65] font-semibold text-[#d3e6f5db]">
            Owner: Conflict-Free SP LLC
            <br />
            Contact: cory@conflictfreesp.com
            <br />
            Website: conflictfreesp.com
          </p>
        </section>

        <section className="grid gap-4">
          <article className="rounded-lg border border-[#7ca1c548] bg-[#10263bd8] px-5 py-5">
            <h2 className="m-0 text-[1.2rem] font-black text-[#f5fbff]">Information We May Collect</h2>
            <p className="m-0 pt-3 text-[0.97rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
              CFSP may collect account and contact information such as name, email, role, and organization, along with login and
              session data. We may also collect event and workflow information entered by users, plus technical usage data that helps
              us operate and secure the platform.
            </p>
          </article>

          <article className="rounded-lg border border-[#7ca1c548] bg-[#10263bd8] px-5 py-5">
            <h2 className="m-0 text-[1.2rem] font-black text-[#f5fbff]">How We Use Information</h2>
            <p className="m-0 pt-3 text-[0.97rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
              We use data to operate CFSP, provide demos and pilot support, improve service quality, support users, maintain security,
              and communicate about product use and development.
            </p>
          </article>

          <article className="rounded-lg border border-[#7ca1c548] bg-[#10263bd8] px-5 py-5">
            <h2 className="m-0 text-[1.2rem] font-black text-[#f5fbff]">Healthcare Simulation Data Safety</h2>
            <p className="m-0 pt-3 text-[0.97rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
              CFSP is not intended to store protected health information (PHI), real patient records, medical records, or unauthorized
              student or institutional confidential data. Demo and pilot use should rely on fictional, demo, de-identified, or properly
              authorized data only.
            </p>
          </article>

          <article className="rounded-lg border border-[#7ca1c548] bg-[#10263bd8] px-5 py-5">
            <h2 className="m-0 text-[1.2rem] font-black text-[#f5fbff]">Service Providers</h2>
            <p className="m-0 pt-3 text-[0.97rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
              CFSP may use third-party providers for hosting, database services, authentication, analytics, email, and payment or other
              vendor support functions.
            </p>
          </article>

          <article className="rounded-lg border border-[#7ca1c548] bg-[#10263bd8] px-5 py-5">
            <h2 className="m-0 text-[1.2rem] font-black text-[#f5fbff]">Access, Correction, Deletion, and Questions</h2>
            <p className="m-0 pt-3 text-[0.97rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
              To request access, correction, deletion, or to ask privacy questions, contact cory@conflictfreesp.com.
            </p>
          </article>

          <article className="rounded-lg border border-[#7ca1c548] bg-[#10263bd8] px-5 py-5">
            <h2 className="m-0 text-[1.2rem] font-black text-[#f5fbff]">Startup and Pilot Disclaimer</h2>
            <p className="m-0 pt-3 text-[0.97rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
              CFSP is a startup platform in private prototype and pilot-ready development. This policy may be updated as the platform
              evolves.
            </p>
          </article>
        </section>
      </div>
    </main>
  );
}
