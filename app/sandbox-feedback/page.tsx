"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import SiteShell from "../components/SiteShell";

const CATEGORY_OPTIONS = [
  "Bug",
  "Confusing",
  "Missing feature",
  "Realism issue",
];

const IMPORTANCE_OPTIONS = [
  "Blocking",
  "Important",
  "Nice to have",
];

function encodeMailtoValue(value: string) {
  return encodeURIComponent(value);
}

export default function SandboxFeedbackPage() {
  const [tryingToDo, setTryingToDo] = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [expected, setExpected] = useState("");
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [importance, setImportance] = useState(IMPORTANCE_OPTIONS[1]);
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);

  const feedbackBody = useMemo(
    () =>
      [
        "CFSP Sandbox Feedback",
        "",
        `Category: ${category}`,
        `Importance: ${importance}`,
        "",
        "What were you trying to do?",
        tryingToDo.trim() || "[Not provided]",
        "",
        "What happened?",
        whatHappened.trim() || "[Not provided]",
        "",
        "What did you expect?",
        expected.trim() || "[Not provided]",
        "",
        "Optional notes",
        notes.trim() || "[Not provided]",
        "",
        "Please do not include real PHI, student records, SP records, or institutional data.",
      ].join("\n"),
    [category, expected, importance, notes, tryingToDo, whatHappened]
  );

  const mailtoHref = useMemo(() => {
    const subject = encodeMailtoValue(`CFSP Sandbox Feedback: ${category}`);
    const body = encodeMailtoValue(feedbackBody);
    return `mailto:cory@conflictfreesp.com?subject=${subject}&body=${body}`;
  }, [category, feedbackBody]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.location.href = mailtoHref;
  }

  async function copyFeedback() {
    if (!navigator?.clipboard) return;
    await navigator.clipboard.writeText(feedbackBody).catch(() => null);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2400);
  }

  return (
    <SiteShell
      title="Sandbox Feedback"
      subtitle="Share what felt confusing, unrealistic, broken, or missing while testing CFSP."
    >
      <div className="mx-auto grid w-full max-w-5xl gap-4">
        <section className="rounded-[14px] border border-[#dce6ee] bg-[#f8fbfd] px-5 py-5">
          <div className="grid gap-3">
            <p className="cfsp-kicker w-fit">External tester feedback</p>
            <h1 className="m-0 text-[1.6rem] font-black leading-tight text-[#14304f]">
              Tell us what happened in the sandbox
            </h1>
            <p className="m-0 max-w-[860px] text-sm font-semibold leading-6 text-[#4f6578]">
              Use this page after trying the Event Command Center, SP coverage, room/material readiness, communications preview, or new-event flow. Do not enter real PHI, student records, SP records, or institutional data.
            </p>
            <p className="m-0 max-w-[860px] text-sm font-semibold leading-6 text-[#4f6578]">
              CFSP is designed to sit alongside systems teams already use, including Outlook, spreadsheets, Google Forms, SimCapture, LearningSpace, Teams, shared drives, and internal scheduling workflows.
            </p>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="grid gap-4 rounded-[14px] border border-[#dce6ee] bg-white px-5 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-black text-[#14304f]">Type</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="min-h-[44px] rounded-lg border border-[#cfdce7] bg-white px-3 text-sm font-semibold text-[#14304f]"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-black text-[#14304f]">Importance</span>
              <select
                value={importance}
                onChange={(event) => setImportance(event.target.value)}
                className="min-h-[44px] rounded-lg border border-[#cfdce7] bg-white px-3 text-sm font-semibold text-[#14304f]"
              >
                {IMPORTANCE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-black text-[#14304f]">What were you trying to do?</span>
            <textarea
              value={tryingToDo}
              onChange={(event) => setTryingToDo(event.target.value)}
              rows={3}
              className="min-h-[110px] rounded-lg border border-[#cfdce7] bg-white px-3 py-3 text-sm font-semibold leading-6 text-[#14304f]"
              placeholder="Example: Open the showcase event and resolve the missing SP coverage risk."
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-black text-[#14304f]">What happened?</span>
            <textarea
              value={whatHappened}
              onChange={(event) => setWhatHappened(event.target.value)}
              rows={3}
              className="min-h-[110px] rounded-lg border border-[#cfdce7] bg-white px-3 py-3 text-sm font-semibold leading-6 text-[#14304f]"
              placeholder="Describe the result, error, unclear step, or realism concern."
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-black text-[#14304f]">What did you expect?</span>
            <textarea
              value={expected}
              onChange={(event) => setExpected(event.target.value)}
              rows={3}
              className="min-h-[110px] rounded-lg border border-[#cfdce7] bg-white px-3 py-3 text-sm font-semibold leading-6 text-[#14304f]"
              placeholder="Describe the workflow, wording, data, or decision support you expected."
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-black text-[#14304f]">Optional notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="min-h-[110px] rounded-lg border border-[#cfdce7] bg-white px-3 py-3 text-sm font-semibold leading-6 text-[#14304f]"
              placeholder="Anything else that would help us improve the sandbox workflow."
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="cfsp-btn cfsp-btn-primary">
              Prepare Feedback Email
            </button>
            <button type="button" onClick={() => void copyFeedback()} className="cfsp-btn cfsp-btn-secondary">
              {copied ? "Copied" : "Copy Feedback"}
            </button>
            <Link href="/dashboard" className="cfsp-btn cfsp-btn-secondary">
              Back to Dashboard
            </Link>
          </div>

          <p className="m-0 text-xs font-semibold leading-5 text-[#5e7388]">
            This opens a draft email only. CFSP does not send bulk messages from this sandbox feedback page.
          </p>
        </form>
      </div>
    </SiteShell>
  );
}
