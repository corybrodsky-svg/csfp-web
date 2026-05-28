import Link from "next/link";

export default function TermsPage() {
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
          <p className="m-0 text-xs font-extrabold uppercase tracking-[0.05em] text-[#9fcbf2]">Terms of Use</p>
          <h1 className="m-0 pt-2 text-[2rem] leading-tight font-black text-[#f7fcff] md:text-[2.4rem]">Conflict-Free SP Terms of Use</h1>
          <p className="m-0 pt-3 text-sm leading-[1.65] font-semibold text-[#d3e6f5db]">
            Effective date: May 28, 2026
          </p>
          <p className="m-0 pt-2 text-sm leading-[1.65] font-semibold text-[#d3e6f5db]">
            Owner: Conflict-Free SP LLC
            <br />
            Contact: cory@conflictfreesp.com
          </p>
        </section>

        <section className="grid gap-4">
          <article className="rounded-lg border border-[#7ca1c548] bg-[#10263bd8] px-5 py-5">
            <h2 className="m-0 text-[1.2rem] font-black text-[#f5fbff]">Agreement to Terms</h2>
            <p className="m-0 pt-3 text-[0.97rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
              By using this site or application, you agree to these Terms of Use.
            </p>
          </article>

          <article className="rounded-lg border border-[#7ca1c548] bg-[#10263bd8] px-5 py-5">
            <h2 className="m-0 text-[1.2rem] font-black text-[#f5fbff]">Platform Purpose</h2>
            <p className="m-0 pt-3 text-[0.97rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
              CFSP is a healthcare simulation operations platform for staffing, scheduling, training readiness, materials, announcements,
              and event operations.
            </p>
          </article>

          <article className="rounded-lg border border-[#7ca1c548] bg-[#10263bd8] px-5 py-5">
            <h2 className="m-0 text-[1.2rem] font-black text-[#f5fbff]">User Responsibilities</h2>
            <ul className="m-0 grid gap-2 pt-3 pl-5 text-[0.97rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
              <li>Provide accurate account information.</li>
              <li>Use CFSP only for authorized purposes.</li>
              <li>Protect login credentials and account access.</li>
              <li>Do not misuse, reverse engineer, scrape, interfere with, or disrupt platform operation.</li>
            </ul>
          </article>

          <article className="rounded-lg border border-[#7ca1c548] bg-[#10263bd8] px-5 py-5">
            <h2 className="m-0 text-[1.2rem] font-black text-[#f5fbff]">Data Restrictions</h2>
            <p className="m-0 pt-3 text-[0.97rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
              You may not upload, enter, transmit, or store PHI, real patient records, confidential institutional data, student records,
              employer-owned materials, or third-party confidential data unless properly authorized.
            </p>
          </article>

          <article className="rounded-lg border border-[#7ca1c548] bg-[#10263bd8] px-5 py-5">
            <h2 className="m-0 text-[1.2rem] font-black text-[#f5fbff]">Prototype and Pilot Use</h2>
            <p className="m-0 pt-3 text-[0.97rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
              CFSP may be in private prototype, pilot, beta, trial, or evaluation use. Features may change, and availability is not
              guaranteed.
            </p>
          </article>

          <article className="rounded-lg border border-[#7ca1c548] bg-[#10263bd8] px-5 py-5">
            <h2 className="m-0 text-[1.2rem] font-black text-[#f5fbff]">Not a Medical Record or Clinical System</h2>
            <p className="m-0 pt-3 text-[0.97rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
              CFSP is not an EHR, medical record system, clinical decision tool, or official institutional record system.
            </p>
          </article>

          <article className="rounded-lg border border-[#7ca1c548] bg-[#10263bd8] px-5 py-5">
            <h2 className="m-0 text-[1.2rem] font-black text-[#f5fbff]">Intellectual Property</h2>
            <p className="m-0 pt-3 text-[0.97rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
              CFSP branding, software, designs, workflows, documentation, and content belong to Conflict-Free SP LLC unless otherwise
              stated.
            </p>
          </article>

          <article className="rounded-lg border border-[#7ca1c548] bg-[#10263bd8] px-5 py-5">
            <h2 className="m-0 text-[1.2rem] font-black text-[#f5fbff]">Feedback</h2>
            <p className="m-0 pt-3 text-[0.97rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
              If you provide feedback, Conflict-Free SP LLC may use it to improve the platform without creating ownership rights for you.
            </p>
          </article>

          <article className="rounded-lg border border-[#7ca1c548] bg-[#10263bd8] px-5 py-5">
            <h2 className="m-0 text-[1.2rem] font-black text-[#f5fbff]">As-Is and Limitation of Liability</h2>
            <p className="m-0 pt-3 text-[0.97rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
              CFSP is provided as is and as available. To the extent allowed by law, Conflict-Free SP LLC is not responsible for indirect,
              incidental, special, consequential, or punitive damages, or for data or business losses arising from use of the platform.
            </p>
          </article>

          <article className="rounded-lg border border-[#7ca1c548] bg-[#10263bd8] px-5 py-5">
            <h2 className="m-0 text-[1.2rem] font-black text-[#f5fbff]">Governing Law</h2>
            <p className="m-0 pt-3 text-[0.97rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
              These terms are governed by the laws of the Commonwealth of Pennsylvania.
            </p>
          </article>
        </section>
      </div>
    </main>
  );
}
