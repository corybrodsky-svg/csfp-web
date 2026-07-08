"use client";

import { useState } from "react";

const steps = [
  {
    id: "import-workflow",
    label: "Import existing workflow",
    rail: "Event Snapshot",
    title: "Existing prep becomes one event record.",
    action: "Review imported setup",
    summary: "Start from the way the program already works: rosters, email threads, spreadsheets, and room rotation notes.",
    tiles: [
      ["Source", "Excel grid + email notes"],
      ["Learners", "32 imported"],
      ["Rooms", "4 exam rooms"],
      ["Cases", "4 case files"],
    ],
    panelTitle: "Imported simulation event",
    panelRows: [
      ["Event", "Neurologic Assessment: Stroke Warning Signs"],
      ["Workflow source", "Spreadsheet schedule, roster attachment, email outreach notes"],
      ["Readiness state", "Structured enough to review staffing, schedule, materials, and portal release"],
    ],
    buttons: ["Review event snapshot", "Open readiness checklist"],
  },
  {
    id: "build-schedule",
    label: "Build schedule",
    rail: "Schedule Builder",
    title: "Excel-style rotations become CFSP event cards.",
    action: "Fix schedule capacity",
    summary:
      "Every simulation program schedules differently. CFSP adapts Excel grids, timing blocks, room rotations, learner groups, SP assignments, and cases into structured cards.",
    tiles: [
      ["Students per room", "2"],
      ["Learner slots", "8 / round"],
      ["Required rounds", "4"],
      ["Export", "Print-ready"],
    ],
    panelTitle: "Schedule Builder conversion",
    panelRows: [
      ["Old way", "Round x room spreadsheet grid"],
      ["CFSP card", "Round 1 - Exam 1 - Learner Group A - Primary SP - Stroke case - 8:20 AM"],
      ["Capacity check", "4 rooms x 2 learners = 8 learner slots per round"],
    ],
    buttons: ["Preview schedule", "Print / export", "Apply suggested fix"],
  },
  {
    id: "poll-hire",
    label: "Poll and hire SPs",
    rail: "Staffing / SP Hiring",
    title: "Existing outreach turns into staffing decisions.",
    action: "Find 1 backup SP",
    summary:
      "CFSP does not force teams to abandon their current process on day one. Start with email or Microsoft Forms, import or record responses, then move confirmed SPs into the portal workflow when ready.",
    tiles: [
      ["Contacted", "25 SPs"],
      ["Selected", "6 primary"],
      ["Confirmed", "6 primary"],
      ["Backup", "0 / 1"],
    ],
    panelTitle: "SP outreach and hiring lifecycle",
    panelRows: [
      ["Outreach source", "Email list or Microsoft Forms response import"],
      ["Active roster", "Selected and confirmed SPs only"],
      ["Outreach history", "No-response recipients stay out of the active roster"],
      ["Confirmation", "Hire confirmation drafted and tracked"],
    ],
    buttons: ["View contacted SPs", "Draft hire confirmation", "Create backup outreach"],
  },
  {
    id: "learner-roster",
    label: "Import learner roster",
    rail: "Learner Roster",
    title: "The uploaded roster becomes the planning source.",
    action: "Resolve count mismatch",
    summary: "Roster import keeps schedule planning aligned with the actual learner list instead of an old expected count.",
    tiles: [
      ["Uploaded", "32 learners"],
      ["Expected", "16 learners"],
      ["Mismatch", "Needs review"],
      ["Source", "CSV / XLSX"],
    ],
    panelTitle: "Learner roster import",
    panelRows: [
      ["Uploaded roster", "32 learner rows found"],
      ["Event settings", "Expected learner count still says 16"],
      ["Next action", "Update expected count or review room/timing settings"],
    ],
    buttons: ["Review learners", "Update expected count", "Export CSV"],
  },
  {
    id: "readiness",
    label: "Resolve readiness blockers",
    rail: "Readiness",
    title: "Readiness blockers are visible before release.",
    action: "Clear blockers",
    summary: "CFSP keeps staffing, roster, schedule, materials, and portal release state in one operating picture.",
    tiles: [
      ["Staffing", "1 backup gap"],
      ["Schedule", "Capacity reviewed"],
      ["Materials", "Ready"],
      ["Portal", "Pending release"],
    ],
    panelTitle: "Readiness checklist",
    panelRows: [
      ["Staffing", "Primary coverage ready; backup still needed"],
      ["Schedule", "Learner slots and room rotations reviewed"],
      ["Materials", "Case files and training prep ready"],
      ["Portal", "Release pending admin approval"],
    ],
    buttons: ["Open blockers", "Review next action"],
  },
  {
    id: "portal-release",
    label: "Release to SP portal",
    rail: "SP Portal Release",
    title: "SPs only see what the admin has released.",
    action: "Release when ready",
    summary: "The portal is not all-or-nothing. Admins decide when schedule, location, cases, materials, arrival details, and acknowledgments are visible.",
    tiles: [
      ["Schedule", "Ready"],
      ["Location", "Ready"],
      ["Cases", "Admin gated"],
      ["Acknowledgment", "Pending"],
    ],
    panelTitle: "SP-facing release controls",
    panelRows: [
      ["Schedule preview", "Visible to confirmed SPs when released"],
      ["Arrival instructions", "Location, timing, and check-in notes"],
      ["Cases/materials", "Released only after admin review"],
      ["Acknowledgments", "Track SP confirmation of released details"],
    ],
    buttons: ["Preview SP portal", "Release ready details", "Track acknowledgments"],
  },
  {
    id: "day-of",
    label: "Day-of check-in",
    rail: "Day-of Check-in",
    title: "The event stays trackable once the day starts.",
    action: "Monitor check-in",
    summary: "Check-in, attendance, room changes, assignment overrides, and closeout notes stay connected to the event record.",
    tiles: [
      ["SP check-in", "In progress"],
      ["Overrides", "Visible"],
      ["Attendance", "Tracked"],
      ["Closeout", "Ready"],
    ],
    panelTitle: "Day-of operations",
    panelRows: [
      ["Check-in", "Confirmed SP arrival status"],
      ["Overrides", "Room or assignment changes recorded"],
      ["Attendance", "Learner and SP attendance visible"],
      ["Closeout", "Follow-up and event notes stay attached"],
    ],
    buttons: ["Open check-in", "Record override", "Close out event"],
  },
] as const;

const commandRail = [
  "Event Snapshot",
  "Schedule Builder",
  "Staffing / SP Hiring",
  "Learner Roster",
  "Readiness",
  "SP Portal Release",
  "Day-of Check-in",
] as const;

const oldScheduleRows = [
  ["Round", "Room", "Learners", "SP", "Case", "Time"],
  ["1", "Exam 1", "1-2", "TBD", "Stroke", "8:20"],
  ["1", "Exam 2", "3-4", "Assigned", "Neuro", "8:20"],
  ["2", "Exam 1", "9-10", "Assigned", "Stroke", "8:55"],
] as const;

export default function GuidedProductDemo() {
  const [activeStepId, setActiveStepId] = useState<(typeof steps)[number]["id"]>("import-workflow");
  const activeStep = steps.find((step) => step.id === activeStepId) || steps[0];

  return (
    <section id="public-preview" className="scroll-mt-24 border-b border-[#cbd8e4] bg-[#eef4f8] text-[#102338]">
      <div className="mx-auto grid w-full max-w-[1240px] gap-6 px-5 py-10 lg:py-12">
        <div className="grid gap-3 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#176c65]">Public app demo</p>
            <h2 className="m-0 pt-2 text-[1.85rem] leading-tight font-black text-[#102338] md:text-[2.35rem]">
              Watch CFSP convert existing event prep into a command center.
            </h2>
          </div>
          <p className="m-0 text-[1rem] leading-[1.7] font-semibold text-[#486176]">
            Click through the workflow steps. The mock Command Center changes state to show what the product is doing with fake sandbox data.
          </p>
        </div>

        <div className="grid gap-3 rounded-2xl border border-[#c6d5e1] bg-white p-3 shadow-[0_24px_60px_rgba(16,35,56,0.16)]">
          <div className="grid gap-2 lg:grid-cols-7" role="tablist" aria-label="Guided public demo workflow">
            {steps.map((step, index) => {
              const selected = step.id === activeStep.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveStepId(step.id)}
                  className={
                    selected
                      ? "rounded-lg border border-[#1b7f78] bg-[#0f6f68] px-3 py-3 text-left text-xs font-black text-white shadow-sm"
                      : "rounded-lg border border-[#d8e4ee] bg-[#f8fbfd] px-3 py-3 text-left text-xs font-black text-[#486176] transition hover:border-[#91b5d0] hover:bg-white"
                  }
                >
                  <span className="block text-[10px] uppercase tracking-[0.08em] opacity-80">Step {index + 1}</span>
                  <span className="mt-1 block">{step.label}</span>
                </button>
              );
            })}
          </div>

          <div className="overflow-hidden rounded-xl border border-[#cbd8e4]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#cbd8e4] bg-[#102338] px-4 py-3 text-white">
              <div>
                <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9eeade]">Event Command Center</p>
                <h3 className="m-0 pt-1 text-[1.1rem] font-black">Neurologic Assessment: Stroke Warning Signs</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[#74eab666] bg-[#0d4d47] px-3 py-1 text-xs font-black text-[#d9fff7]">
                  Fake sandbox data
                </span>
                <span className="rounded-full border border-[#f1b85b66] bg-[#4a310b] px-3 py-1 text-xs font-black text-[#ffe5ae]">
                  Next: {activeStep.action}
                </span>
              </div>
            </div>

            <div className="grid min-h-[620px] lg:grid-cols-[226px_1fr]">
              <aside className="border-b border-[#d8e4ee] bg-[#ecf3f8] p-3 lg:border-r lg:border-b-0">
                <p className="m-0 px-2 py-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#60758a]">Command Tools</p>
                <div className="grid gap-2">
                  {commandRail.map((tool) => (
                    <div
                      key={tool}
                      className={
                        activeStep.rail === tool
                          ? "rounded-lg border border-[#2e8fba66] bg-white px-3 py-2 text-sm font-black text-[#102338] shadow-sm"
                          : "rounded-lg border border-[#d5e2ec] bg-[#f8fbfd] px-3 py-2 text-sm font-bold text-[#486176]"
                      }
                    >
                      {tool}
                    </div>
                  ))}
                </div>
              </aside>

              <main className="grid gap-4 bg-[#f8fbfd] p-4">
                <section className="rounded-xl border border-[#d8e4ee] bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#176c65]">Active step</p>
                      <h4 className="m-0 pt-1 text-[1.25rem] font-black text-[#102338]">{activeStep.title}</h4>
                      <p className="m-0 pt-2 max-w-[820px] text-sm font-semibold leading-6 text-[#486176]">{activeStep.summary}</p>
                    </div>
                    <button type="button" className="rounded-lg border border-[#1b7f78] bg-[#0f6f68] px-4 py-2 text-sm font-black text-white">
                      {activeStep.action}
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {activeStep.tiles.map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-[#d8e4ee] bg-[#f8fbfd] p-3">
                        <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#60758a]">{label}</p>
                        <p className="m-0 pt-1 text-[1.2rem] font-black text-[#102338]">{value}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                  <section className="rounded-xl border border-[#d8e4ee] bg-white p-4">
                    <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#176c65]">{activeStep.panelTitle}</p>
                    <div className="mt-3 grid gap-2">
                      {activeStep.panelRows.map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-[#d8e4ee] bg-[#f8fbfd] px-3 py-2">
                          <div className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#60758a]">{label}</div>
                          <div className="mt-1 text-sm font-bold leading-6 text-[#102338]">{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {activeStep.buttons.map((button) => (
                        <button key={button} type="button" className="rounded-lg border border-[#c6d5e1] bg-white px-3 py-2 text-xs font-black text-[#31495f]">
                          {button}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-xl border border-[#d8e4ee] bg-white p-4">
                    <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#8c5a09]">Schedule conversion preview</p>
                    <div className="mt-3 overflow-hidden rounded-lg border border-[#d8e4ee]">
                      {oldScheduleRows.map((row, rowIndex) => (
                        <div
                          key={row.join("-")}
                          className={
                            rowIndex === 0
                              ? "grid grid-cols-6 bg-[#eaf1f7] text-[10px] font-black uppercase tracking-[0.04em] text-[#60758a]"
                              : "grid grid-cols-6 border-t border-[#e3ebf2] text-[10px] font-bold text-[#486176]"
                          }
                        >
                          {row.map((cell) => (
                            <div key={cell} className="min-h-[38px] border-r border-[#e3ebf2] px-2 py-2 last:border-r-0">
                              {cell}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 rounded-lg border border-[#1b7f7838] bg-[#edf8f6] p-3">
                      <div className="text-xs font-black text-[#0f514d]">CFSP event card</div>
                      <div className="mt-1 text-sm font-black text-[#102338]">Round 1 - Exam 1 - Learner Group A - Primary SP - Stroke case - 8:20 AM</div>
                    </div>
                    <div className="mt-3 rounded-lg border border-[#f1b85b80] bg-[#fff7e8] p-3">
                      <div className="text-xs font-black text-[#8c5a09]">Capacity warning</div>
                      <div className="mt-1 text-sm font-black text-[#102338]">4 learners would be unscheduled with the current timing window.</div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        {["4 rooms", "2 students / room", "8 slots / round"].map((item) => (
                          <span key={item} className="rounded-md border border-[#e4bd72] bg-white px-2 py-1 text-[10px] font-black text-[#6a4303]">
                            {item}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {["Extend end time", "Regenerate schedule"].map((button) => (
                          <button key={button} type="button" className="rounded-md border border-[#c9943e] bg-white px-2 py-1 text-[10px] font-black text-[#6a4303]">
                            {button}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>
                </div>
              </main>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
