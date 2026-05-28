import Link from "next/link";

const contactCards = [
  { label: "General / Founder", value: "cory@conflictfreesp.com", href: "mailto:cory@conflictfreesp.com" },
  { label: "Support", value: "support@conflictfreesp.com", href: "mailto:support@conflictfreesp.com" },
  { label: "Website", value: "conflictfreesp.com", href: "https://conflictfreesp.com" },
];

export default function ContactPage() {
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
          <p className="m-0 text-xs font-extrabold uppercase tracking-[0.05em] text-[#9fcbf2]">Contact</p>
          <h1 className="m-0 pt-2 text-[2rem] leading-tight font-black text-[#f7fcff] md:text-[2.4rem]">
            Contact Conflict-Free SP
          </h1>
          <p className="m-0 pt-3 max-w-[760px] text-[1rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
            For demos, pilot conversations, product questions, or support, contact Cory Brodsky.
          </p>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {contactCards.map((card) => (
            <article
              key={card.label}
              className="grid gap-2 rounded-lg border border-[#7ca1c548] bg-[#10263bd8] px-4 py-4 transition hover:border-[#9dc5e650] hover:bg-[#14304ad7]"
            >
              <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.05em] text-[#9fcbf2]">{card.label}</p>
              <a
                href={card.href}
                className="text-[0.98rem] leading-[1.6] font-bold text-[#d8ebfb] no-underline hover:text-[#ecf7ff]"
              >
                {card.value}
              </a>
            </article>
          ))}
        </section>

        <section className="rounded-lg border border-[#8bb2d255] bg-[#102840d1] px-5 py-5">
          <div className="flex flex-wrap gap-3">
            <a
              href="mailto:cory@conflictfreesp.com"
              className="inline-flex min-h-[42px] items-center rounded-lg border border-[#78b8f38d] bg-[#156dc0] px-4 text-sm font-extrabold text-white no-underline transition hover:bg-[#177dde]"
            >
              Email Cory
            </a>
            <Link
              href="/request-demo"
              className="inline-flex min-h-[42px] items-center rounded-lg border border-[#89b2d07f] bg-[#132c42d0] px-4 text-sm font-extrabold text-[#ecf6ff] no-underline transition hover:bg-[#1a3a55d7]"
            >
              Request a demo
            </Link>
          </div>
          <p className="m-0 pt-4 text-[0.95rem] leading-[1.65] font-semibold text-[#d2e5f5db]">
            Please do not send PHI, real patient data, confidential institutional data, or unauthorized student records by email.
          </p>
        </section>
      </div>
    </main>
  );
}
