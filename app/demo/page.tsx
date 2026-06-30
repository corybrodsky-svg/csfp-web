import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Conflict-Free SP Demo | Training Feedback Workflow",
  description:
    "A public CFSP demo showing how standardized patient and faculty teams can reframe difficult feedback into clearer, behavior-based coaching.",
};

const workflowSteps = [
  {
    eyebrow: "Step 1",
    title: "Identify the friction point",
    body:
      "The learner hears, 'You seemed dismissive,' and becomes defensive. The useful signal is not the label. It is the observable moment where the learner interrupted twice and moved on before confirming the patient's concern.",
  },
  {
    eyebrow: "Step 2",
    title: "Reframe with behavior-impact-next step",
    body:
      "Behavior: 'When you interrupted before the patient finished...' Impact: 'the patient may feel unheard and may share less information.' Next step: 'pause, reflect the concern, then ask one clarifying question before moving on.'",
  },
  {
    eyebrow: "Step 3",
    title: "Show the SP/faculty coaching note",
    body:
      "Coach the SP to describe what happened, how it landed, and the one behavior to practice next. Coach faculty to reinforce the same language so the learner receives one clear message instead of mixed impressions.",
  },
  {
    eyebrow: "Step 4",
    title: "Choose the next action",
    body:
      "Use the workflow in a pilot, training consult, or design partner session with fictional or approved training scenarios only. Keep PHI, real patient data, student records, and confidential institutional material out of the demo.",
  },
] as const;

const coachingNotes = [
  "Use observed behavior rather than personality labels.",
  "Name the impact on patient trust, learner flow, or team communication.",
  "End with one concrete next behavior the learner can try immediately.",
] as const;

export default function PublicDemoPage() {
  return (
    <main className="min-h-screen bg-[#07111c] text-[#edf7ff]">
      <section className="relative overflow-hidden border-b border-[#7fa6c84d]">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 16% 18%, rgba(54, 191, 168, 0.2), transparent 30%), radial-gradient(circle at 82% 18%, rgba(74, 144, 226, 0.2), transparent 34%), linear-gradient(135deg, #050b12 0%, #071523 46%, #0d2236 100%)",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(rgba(132,174,207,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(132,174,207,0.12) 1px, transparent 1px)",
            backgroundSize: "42px 42px",
            maskImage: "linear-gradient(to bottom, black, rgba(0,0,0,0.26))",
          }}
        />

        <div className="relative mx-auto grid w-full max-w-[1160px] gap-12 px-5 py-8 md:py-12">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="text-[15px] font-black text-[#f5fbff] no-underline">
              Conflict-Free SP
            </Link>
            <nav className="flex flex-wrap gap-2" aria-label="Demo navigation">
              <Link
                href="/request-demo"
                className="inline-flex min-h-[42px] items-center rounded-lg border border-[#86c8ff70] bg-[#123553cf] px-4 text-sm font-extrabold text-[#eff8ff] no-underline transition hover:border-[#a4d7ff] hover:bg-[#174569]"
              >
                Request a pilot
              </Link>
              <Link
                href="/contact"
                className="inline-flex min-h-[42px] items-center rounded-lg border border-[#7ca5cb5f] bg-[#0d2237bf] px-4 text-sm font-bold text-[#e8f2fb] no-underline transition hover:border-[#96c0e2a2] hover:bg-[#143450]"
              >
                Contact
              </Link>
            </nav>
          </header>

          <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="grid gap-5">
              <p className="m-0 w-fit rounded-full border border-[#85d9cc59] bg-[#0b2f35b8] px-3 py-1 text-xs font-extrabold uppercase tracking-[0.08em] text-[#9eeade]">
                Healthcare simulation training demo
              </p>
              <h1 className="m-0 text-[2.45rem] leading-[1.02] font-black tracking-[-0.045em] text-[#f8fcff] md:text-[4.35rem]">
                Conflict-Free SP Demo
              </h1>
              <p className="m-0 max-w-[780px] text-[1.06rem] leading-[1.65] font-semibold text-[#dcecf9e0] md:text-[1.24rem]">
                CFSP helps standardized patient and faculty teams turn difficult feedback moments into clear, behavior-based coaching learners can act on.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <Link
                  href="/request-demo"
                  className="inline-flex min-h-[48px] items-center rounded-lg border border-[#75b9ff8a] bg-[#1673c8] px-5 text-sm font-extrabold text-white no-underline shadow-[0_18px_34px_rgba(10,38,67,0.42)] transition hover:-translate-y-px hover:bg-[#1783e4]"
                >
                  Request a pilot
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex min-h-[48px] items-center rounded-lg border border-[#8eb9d575] bg-[#0e2439d4] px-5 text-sm font-extrabold text-[#eff8ff] no-underline transition hover:border-[#a8d0e9] hover:bg-[#173b5a]"
                >
                  Book a training consult
                </Link>
              </div>
            </section>

            <aside className="rounded-2xl border border-[#8fb5d45c] bg-[#081b2bd9] p-5 shadow-[0_22px_56px_rgba(2,10,19,0.46)]">
              <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9fcbf2]">Scenario card</p>
              <h2 className="m-0 pt-2 text-[1.55rem] leading-tight font-black text-[#f6fbff]">
                A learner receives difficult feedback after a standardized patient encounter.
              </h2>
              <p className="m-0 pt-3 text-[0.98rem] leading-[1.65] font-semibold text-[#d3e6f5db]">
                The learner completed the clinical task, but the SP felt rushed and unheard. The faculty facilitator needs feedback that is honest, specific, and less likely to escalate defensiveness.
              </p>
              <div className="mt-4 rounded-xl border border-[#85d9cc59] bg-[#0b2f35b8] px-4 py-3 text-sm font-bold leading-6 text-[#c8fff6]">
                Demo principle: reduce interpersonal friction without avoiding the hard teaching point.
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="border-b border-[#5c799640] bg-[#0b1826]">
        <div className="mx-auto grid w-full max-w-[1160px] gap-4 px-5 py-12 md:grid-cols-4 md:py-14">
          {workflowSteps.map((step) => (
            <article key={step.title} className="rounded-xl border border-[#84a8c84a] bg-[#102236d9] p-5">
              <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9eeade]">{step.eyebrow}</p>
              <h2 className="m-0 pt-2 text-[1.08rem] leading-[1.35] font-extrabold text-[#f4fbff]">{step.title}</h2>
              <p className="m-0 pt-3 text-[0.95rem] leading-[1.58] font-semibold text-[#d0e3f3de]">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-b border-[#5c799640] bg-[#071421]">
        <div className="mx-auto grid w-full max-w-[1160px] gap-6 px-5 py-12 lg:grid-cols-[0.9fr_1.1fr] lg:py-14">
          <div>
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9dc9ee]">Conflict-free feedback workflow</p>
            <h2 className="m-0 pt-2 text-[1.8rem] leading-tight font-black text-[#f7fcff] md:text-[2.35rem]">
              Replace vague critique with one teachable next move.
            </h2>
          </div>
          <div className="grid gap-3 rounded-2xl border border-[#8ab1d14a] bg-[#10263bd8] p-5">
            <div className="rounded-xl border border-[#f1b85b66] bg-[#30230e] p-4">
              <p className="m-0 text-xs font-black uppercase tracking-[0.08em] text-[#ffd99b]">Before</p>
              <p className="m-0 pt-2 text-[1rem] leading-7 font-semibold text-[#fff6df]">
                &ldquo;You were dismissive, and the patient did not feel supported.&rdquo;
              </p>
            </div>
            <div className="rounded-xl border border-[#39d5aa66] bg-[#0b2f35] p-4">
              <p className="m-0 text-xs font-black uppercase tracking-[0.08em] text-[#9eeade]">After</p>
              <p className="m-0 pt-2 text-[1rem] leading-7 font-semibold text-[#eafffb]">
                &ldquo;When you interrupted before the patient finished, the patient may have felt unheard. Next time, pause, reflect the concern, and ask one clarifying question before moving on.&rdquo;
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#06111d]">
        <div className="mx-auto grid w-full max-w-[1160px] gap-6 px-5 py-12 lg:grid-cols-[1fr_0.9fr] lg:items-start lg:py-14">
          <article className="rounded-2xl border border-[#8bb2d255] bg-[#102840d1] p-5">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9dc9ee]">SP/faculty coaching note</p>
            <h2 className="m-0 pt-2 text-[1.55rem] leading-tight font-black text-[#f7fcff]">What the coach reinforces</h2>
            <div className="mt-4 grid gap-3">
              {coachingNotes.map((note) => (
                <div key={note} className="flex gap-3 rounded-xl border border-[#84a8c84a] bg-[#0d2338d4] px-4 py-3 text-sm font-bold leading-6 text-[#d7e8f6]">
                  <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[#39d5aa] shadow-[0_0_16px_rgba(57,213,170,0.7)]" />
                  <span>{note}</span>
                </div>
              ))}
            </div>
          </article>

          <aside className="rounded-2xl border border-[#8bb2d255] bg-[#102840d1] p-5">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9eeade]">Next action</p>
            <h2 className="m-0 pt-2 text-[1.55rem] leading-tight font-black text-[#f7fcff]">
              Bring CFSP into a pilot or training consult.
            </h2>
            <p className="m-0 pt-3 text-[1rem] leading-[1.68] font-semibold text-[#d3e6f5db]">
              Use this demo to discuss SP feedback training, faculty coaching alignment, and simulation-team workflow needs using fictional or approved materials only.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/request-demo" className="inline-flex min-h-[46px] items-center rounded-lg border border-[#75b9ff8a] bg-[#1673c8] px-5 text-sm font-extrabold text-white no-underline transition hover:bg-[#1783e4]">
                Request a pilot
              </Link>
              <Link href="/contact" className="inline-flex min-h-[46px] items-center rounded-lg border border-[#8eb9d575] bg-[#0e2439d4] px-5 text-sm font-extrabold text-[#eff8ff] no-underline transition hover:bg-[#173b5a]">
                Contact Conflict-Free SP
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
