"use client";

import { type FormEvent, useState } from "react";
import PublicHeader from "../components/PublicHeader";

const interestTypes = ["Demo", "Pilot", "General conversation"] as const;

const initialForm = {
  name: "",
  organization: "",
  role: "",
  email: "",
  eventVolume: "",
  painPoint: "",
  interestType: "Demo",
  optionalMessage: "",
};

function encodeMailtoBody(form: typeof initialForm) {
  return encodeURIComponent(
    [
      "Request a CFSP demo",
      "",
      `Name: ${form.name}`,
      `Organization: ${form.organization}`,
      `Role/title: ${form.role}`,
      `Email: ${form.email}`,
      `Approximate simulation events per month: ${form.eventVolume}`,
      `Interest type: ${form.interestType}`,
      "",
      "Biggest current pain point:",
      form.painPoint,
      "",
      "Optional message:",
      form.optionalMessage || "No additional message provided.",
      "",
      "Privacy note: I will not include PHI, real patient records, or unauthorized confidential institutional/student data.",
    ].join("\n"),
  );
}

export default function RequestDemoPage() {
  const [form, setForm] = useState(initialForm);
  const [submitted, setSubmitted] = useState(false);

  function updateField(field: keyof typeof initialForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subject = encodeURIComponent(`CFSP Demo Request - ${form.organization || form.name || "Simulation team"}`);
    const body = encodeMailtoBody(form);
    setSubmitted(true);
    window.location.href = `mailto:cory@conflictfreesp.com?subject=${subject}&body=${body}`;
  }

  return (
    <main className="min-h-screen bg-[#070f19] text-[#e8f1f8]">
      <div className="mx-auto grid w-full max-w-[1120px] gap-6 px-5 py-8 md:py-10">
        <PublicHeader />

        <section className="grid gap-6 rounded-2xl border border-[#7ca1c548] bg-[#0b1b2cd9] px-5 py-6 md:grid-cols-[0.9fr_1.1fr] md:px-6 md:py-7">
          <div className="grid content-start gap-4">
            <div>
              <p className="m-0 text-xs font-extrabold uppercase tracking-[0.08em] text-[#9fcbf2]">Request Demo</p>
              <h1 className="m-0 pt-2 text-[2.15rem] leading-tight font-black text-[#f7fcff] md:text-[2.7rem]">
                Request a CFSP demo
              </h1>
              <p className="m-0 pt-3 max-w-[770px] text-[1rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
                Tell us what your simulation team is trying to simplify. CFSP is currently focused on private prototype and pilot
                conversations with SP programs, clinical skills teams, and simulation operations leaders.
              </p>
            </div>

            <div className="rounded-xl border border-[#8bb2d255] bg-[#102840d1] px-4 py-4">
              <h2 className="m-0 text-[1.05rem] font-black text-[#f5fbff]">Prefer direct email?</h2>
              <p className="m-0 pt-2 text-[0.95rem] leading-[1.62] font-semibold text-[#d2e5f5db]">
                You can still email Cory directly. Include your organization, role, event volume, and the biggest workflow pain point you want
                to solve.
              </p>
              <a
                href="mailto:cory@conflictfreesp.com?subject=Request%20CFSP%20Demo"
                className="mt-4 inline-flex min-h-[42px] items-center rounded-lg border border-[#78b8f38d] bg-[#156dc0] px-4 text-sm font-extrabold text-white no-underline transition hover:bg-[#177dde]"
              >
                Email to request demo
              </a>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4 rounded-xl border border-[#84a8c84a] bg-[#10263bd8] p-4 md:p-5">
            <div className="grid gap-1.5">
              <label htmlFor="name" className="text-sm font-extrabold text-[#f2f9ff]">
                Name
              </label>
              <input
                id="name"
                required
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                className="min-h-[44px] rounded-lg border border-[#86aac85a] bg-[#071523] px-3 text-[#f7fbff] outline-none transition focus:border-[#8bd6ff]"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="organization" className="text-sm font-extrabold text-[#f2f9ff]">
                  Organization
                </label>
                <input
                  id="organization"
                  required
                  value={form.organization}
                  onChange={(event) => updateField("organization", event.target.value)}
                  className="min-h-[44px] rounded-lg border border-[#86aac85a] bg-[#071523] px-3 text-[#f7fbff] outline-none transition focus:border-[#8bd6ff]"
                />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="role" className="text-sm font-extrabold text-[#f2f9ff]">
                  Role/title
                </label>
                <input
                  id="role"
                  required
                  value={form.role}
                  onChange={(event) => updateField("role", event.target.value)}
                  className="min-h-[44px] rounded-lg border border-[#86aac85a] bg-[#071523] px-3 text-[#f7fbff] outline-none transition focus:border-[#8bd6ff]"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="email" className="text-sm font-extrabold text-[#f2f9ff]">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  className="min-h-[44px] rounded-lg border border-[#86aac85a] bg-[#071523] px-3 text-[#f7fbff] outline-none transition focus:border-[#8bd6ff]"
                />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="eventVolume" className="text-sm font-extrabold text-[#f2f9ff]">
                  Approx. simulation events/month
                </label>
                <input
                  id="eventVolume"
                  required
                  placeholder="Example: 8-12"
                  value={form.eventVolume}
                  onChange={(event) => updateField("eventVolume", event.target.value)}
                  className="min-h-[44px] rounded-lg border border-[#86aac85a] bg-[#071523] px-3 text-[#f7fbff] outline-none transition focus:border-[#8bd6ff] placeholder:text-[#8fa9bd]"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="interestType" className="text-sm font-extrabold text-[#f2f9ff]">
                Interest type
              </label>
              <select
                id="interestType"
                value={form.interestType}
                onChange={(event) => updateField("interestType", event.target.value)}
                className="min-h-[44px] rounded-lg border border-[#86aac85a] bg-[#071523] px-3 text-[#f7fbff] outline-none transition focus:border-[#8bd6ff]"
              >
                {interestTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="painPoint" className="text-sm font-extrabold text-[#f2f9ff]">
                Biggest current pain point
              </label>
              <textarea
                id="painPoint"
                required
                rows={5}
                placeholder="Example: staffing confirmations, schedule release, day-of room changes, training materials..."
                value={form.painPoint}
                onChange={(event) => updateField("painPoint", event.target.value)}
                className="rounded-lg border border-[#86aac85a] bg-[#071523] px-3 py-3 text-[#f7fbff] outline-none transition focus:border-[#8bd6ff] placeholder:text-[#8fa9bd]"
              />
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="optionalMessage" className="text-sm font-extrabold text-[#f2f9ff]">
                Optional message
              </label>
              <textarea
                id="optionalMessage"
                rows={4}
                placeholder="Anything else that would help shape the demo or pilot conversation."
                value={form.optionalMessage}
                onChange={(event) => updateField("optionalMessage", event.target.value)}
                className="rounded-lg border border-[#86aac85a] bg-[#071523] px-3 py-3 text-[#f7fbff] outline-none transition focus:border-[#8bd6ff] placeholder:text-[#8fa9bd]"
              />
            </div>

            <button
              type="submit"
              className="inline-flex min-h-[46px] w-fit items-center rounded-lg border border-[#78b8f38d] bg-[#156dc0] px-5 text-sm font-extrabold text-white transition hover:bg-[#177dde]"
            >
              Request a CFSP demo
            </button>

            {submitted ? (
              <p className="m-0 rounded-lg border border-[#85d9cc59] bg-[#0b2f35b8] px-3 py-2 text-[0.92rem] leading-[1.55] font-semibold text-[#c8fff6]">
                Your email draft should open now. If it does not, email cory@conflictfreesp.com directly.
              </p>
            ) : null}
          </form>
        </section>

        <section className="rounded-lg border border-[#8bb2d255] bg-[#102840d1] px-5 py-5">
          <p className="m-0 text-[0.95rem] leading-[1.65] font-semibold text-[#d2e5f5db]">
            Safety note: do not include PHI, real patient records, confidential institutional data, or unauthorized student information.
          </p>
        </section>
      </div>
    </main>
  );
}
