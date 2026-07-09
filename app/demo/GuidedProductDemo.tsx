"use client";

import { useMemo, useState } from "react";

type DemoStep = {
  id: string;
  label: string;
  eyebrow: string;
  title: string;
  copy: string;
  rail: string;
  nextAction: string;
  status: string;
  tiles: Array<{ label: string; value: string; tone?: "good" | "warn" | "neutral" }>;
  primaryPanel: {
    title: string;
    rows: Array<{ label: string; value: string; tone?: "good" | "warn" | "neutral" }>;
  };
  sidePanel: "import" | "schedule" | "staffing" | "roster" | "readiness" | "portal" | "dayof";
  actions: string[];
};

const demoSteps: DemoStep[] = [
  {
    id: "import",
    label: "Import existing workflow",
    eyebrow: "Step 1",
    title: "Bring the current event prep into one event record.",
    copy:
      "CFSP starts where your program already is. Bring in the schedule, roster, SP outreach list, and event details without pretending every program works the same way.",
    rail: "Event Snapshot",
    nextAction: "Review imported setup",
    status: "Workflow captured",
    tiles: [
      { label: "Learners", value: "32" },
      { label: "Rooms", value: "4" },
      { label: "Cases", value: "4" },
      { label: "SP need", value: "6 + 1 backup", tone: "warn" },
    ],
    primaryPanel: {
      title: "Imported pieces",
      rows: [
        { label: "Excel-style schedule grid", value: "Room rotations and timing blocks detected" },
        { label: "Learner roster", value: "32 learner rows found", tone: "good" },
        { label: "SP outreach list", value: "25 candidates ready for review" },
        { label: "Training notes", value: "Materials and arrival instructions staged" },
      ],
    },
    sidePanel: "import",
    actions: ["Review snapshot", "Map source files", "Open readiness view"],
  },
  {
    id: "schedule",
    label: "Build schedule",
    eyebrow: "Step 2",
    title: "Convert schedule grids into structured event cards.",
    copy:
      "Every simulation program schedules differently. CFSP adapts the room rotations, timing blocks, learner groups, SP assignments, and cases into structured event cards.",
    rail: "Schedule Builder",
    nextAction: "Resolve capacity conflict",
    status: "Capacity warning",
    tiles: [
      { label: "Students / room", value: "2" },
      { label: "Slots / round", value: "8" },
      { label: "Needed rounds", value: "4" },
      { label: "Current window", value: "28 slots", tone: "warn" },
    ],
    primaryPanel: {
      title: "Schedule Builder logic",
      rows: [
        { label: "Old format", value: "Excel-style room and rotation grid" },
        { label: "CFSP format", value: "Round, room, SP, learner group, case, and timing cards", tone: "good" },
        { label: "Capacity math", value: "4 rooms x 2 learners = 8 learner slots per round" },
        { label: "Conflict", value: "4 learners need another timing adjustment", tone: "warn" },
      ],
    },
    sidePanel: "schedule",
    actions: ["Extend end time", "Adjust students per room", "Print / export schedule"],
  },
  {
    id: "staffing",
    label: "Poll and hire SPs",
    eyebrow: "Step 3",
    title: "Turn outreach into staffing decisions.",
    copy:
      "Use email or Microsoft Forms while transitioning, then move selected SPs into a cleaner hiring and portal workflow.",
    rail: "Staffing / SP Hiring",
    nextAction: "Find 1 backup SP",
    status: "Primary coverage ready",
    tiles: [
      { label: "Contacted", value: "25" },
      { label: "Selected", value: "6 primary", tone: "good" },
      { label: "Confirmed", value: "6 primary", tone: "good" },
      { label: "Backup", value: "0 / 1", tone: "warn" },
    ],
    primaryPanel: {
      title: "SP polling and hiring lifecycle",
      rows: [
        { label: "Input", value: "Email list or Microsoft Forms response import" },
        { label: "Active roster", value: "Selected and confirmed SPs only", tone: "good" },
        { label: "Outreach history", value: "No-response recipients stay out of the active roster" },
        { label: "Confirmation", value: "Hire confirmation drafted and tracked" },
      ],
    },
    sidePanel: "staffing",
    actions: ["View contacted SPs", "Draft hire confirmation", "Create backup outreach"],
  },
  {
    id: "roster",
    label: "Import learner roster",
    eyebrow: "Step 4",
    title: "Make the uploaded roster the planning source.",
    copy: "The uploaded roster becomes the source of truth for schedule planning.",
    rail: "Learner Roster",
    nextAction: "Review count mismatch",
    status: "Roster imported",
    tiles: [
      { label: "Uploaded", value: "32 learners", tone: "good" },
      { label: "Expected", value: "16 learners", tone: "warn" },
      { label: "Format", value: "CSV / XLSX" },
      { label: "Planning", value: "Roster source", tone: "good" },
    ],
    primaryPanel: {
      title: "Learner roster source of truth",
      rows: [
        { label: "Imported learners", value: "32 valid learner rows", tone: "good" },
        { label: "Event settings", value: "Expected learner count still says 16", tone: "warn" },
        { label: "Warning", value: "Roster has 32 learners, but settings expect 16" },
        { label: "Action", value: "Update expected learner count to 32" },
      ],
    },
    sidePanel: "roster",
    actions: ["Review learners", "Update expected count", "Export CSV"],
  },
  {
    id: "readiness",
    label: "Resolve readiness blockers",
    eyebrow: "Step 5",
    title: "Catch gaps before the event is released.",
    copy: "CFSP catches operational gaps before event day and suggests the next move.",
    rail: "Readiness",
    nextAction: "Clear blocker list",
    status: "Needs action",
    tiles: [
      { label: "Staffing", value: "1 backup gap", tone: "warn" },
      { label: "Schedule", value: "Conflict found", tone: "warn" },
      { label: "Materials", value: "Ready", tone: "good" },
      { label: "Portal", value: "Pending", tone: "neutral" },
    ],
    primaryPanel: {
      title: "Readiness blockers",
      rows: [
        { label: "Backup coverage", value: "1 backup still needed", tone: "warn" },
        { label: "Schedule capacity", value: "Timing window needs one fix", tone: "warn" },
        { label: "Materials", value: "Case files and training prep ready", tone: "good" },
        { label: "Portal release", value: "Release gates hidden until admin approval" },
      ],
    },
    sidePanel: "readiness",
    actions: ["Extend end time", "Open backup outreach", "Preview release gates"],
  },
  {
    id: "portal",
    label: "Release to SP portal",
    eyebrow: "Step 6",
    title: "Release only what SPs should see.",
    copy: "SPs only see what the simulation team releases.",
    rail: "SP Portal Release",
    nextAction: "Release ready details",
    status: "Admin gated",
    tiles: [
      { label: "Schedule", value: "Ready" },
      { label: "Role / case", value: "Hidden" },
      { label: "Materials", value: "Ready", tone: "good" },
      { label: "Acknowledgment", value: "Pending", tone: "warn" },
    ],
    primaryPanel: {
      title: "Admin release panel",
      rows: [
        { label: "Schedule preview", value: "Ready to release" },
        { label: "Location and arrival", value: "Release when instructions are final" },
        { label: "Case and role", value: "Hidden until assignments are finalized" },
        { label: "Materials", value: "Released after admin review" },
      ],
    },
    sidePanel: "portal",
    actions: ["Preview SP portal", "Release schedule", "Track acknowledgments"],
  },
  {
    id: "dayof",
    label: "Day-of check-in",
    eyebrow: "Step 7",
    title: "Carry the event into day-of operations.",
    copy:
      "Planning does not end when the schedule is built. CFSP carries the event into day-of operations.",
    rail: "Day-of Check-in",
    nextAction: "Monitor check-in",
    status: "Event-day view",
    tiles: [
      { label: "Check-in", value: "Open" },
      { label: "Attendance", value: "Visible" },
      { label: "Overrides", value: "Tracked" },
      { label: "Closeout", value: "Ready" },
    ],
    primaryPanel: {
      title: "Day-of command center",
      rows: [
        { label: "SP check-in", value: "Arrival status by confirmed SP" },
        { label: "Overrides", value: "Room and assignment changes recorded" },
        { label: "Attendance", value: "Learner and SP attendance visible" },
        { label: "Closeout", value: "Follow-up notes stay attached to the event" },
      ],
    },
    sidePanel: "dayof",
    actions: ["Open check-in", "Record override", "Close out event"],
  },
];

const railItems = [
  "Event Snapshot",
  "Schedule Builder",
  "Staffing / SP Hiring",
  "Learner Roster",
  "Readiness",
  "SP Portal Release",
  "Day-of Check-in",
] as const;

const oldScheduleGrid = [
  ["Round", "Room", "Learners", "SP", "Case"],
  ["1", "Exam 1", "1-2", "TBD", "Stroke signs"],
  ["1", "Exam 2", "3-4", "Assigned", "Focused neuro"],
  ["2", "Exam 1", "9-10", "Assigned", "Stroke signs"],
] as const;

const eventCards = [
  { round: "Round 1", room: "Exam 1", time: "8:20 AM", learners: "Group A", sp: "Primary SP", case: "Stroke signs" },
  { round: "Round 1", room: "Exam 2", time: "8:20 AM", learners: "Group B", sp: "Primary SP", case: "Focused neuro" },
  { round: "Round 2", room: "Exam 1", time: "8:55 AM", learners: "Group E", sp: "Primary SP", case: "Stroke signs" },
] as const;

function toneClasses(tone: "good" | "warn" | "neutral" = "neutral") {
  if (tone === "good") return "border-[#b7e4d8] bg-[#eefaf7] text-[#0d5f55]";
  if (tone === "warn") return "border-[#f0d08a] bg-[#fff8e8] text-[#765103]";
  return "border-[#d8e3ec] bg-[#f7fafc] text-[#19324a]";
}

function SidePanel({ type }: { type: DemoStep["sidePanel"] }) {
  if (type === "schedule") {
    return (
      <div className="grid gap-3">
        <div className="rounded-[8px] border border-[#d8e3ec] bg-white p-3">
          <div className="text-[11px] font-black uppercase text-[#7b8fa1]">Example source grid</div>
          <div className="mt-3 overflow-hidden rounded-[8px] border border-[#d8e3ec]">
            {oldScheduleGrid.map((row, rowIndex) => (
              <div
                key={row.join("-")}
                className={rowIndex === 0 ? "grid grid-cols-5 bg-[#eef3f7] text-[10px] font-black uppercase text-[#657a8c]" : "grid grid-cols-5 border-t border-[#e6edf3] text-[10px] font-bold text-[#40566a]"}
              >
                {row.map((cell) => (
                  <div key={cell} className="min-h-[38px] border-r border-[#e6edf3] px-2 py-2 last:border-r-0">
                    {cell}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          {eventCards.map((card) => (
            <div key={`${card.round}-${card.room}`} className="rounded-[8px] border border-[#b7e4d8] bg-[#f2fbf8] p-3">
              <div className="flex flex-wrap justify-between gap-2 text-sm font-black text-[#123044]">
                <span>{card.round} - {card.room}</span>
                <span>{card.time}</span>
              </div>
              <div className="mt-2 text-xs font-bold leading-5 text-[#426072]">
                {card.learners} - {card.sp} - {card.case}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "staffing") {
    return (
      <div className="grid gap-3">
        {[
          ["Existing outreach", "Email or Microsoft Forms input"],
          ["Selected SPs", "6 primary covered"],
          ["Backup coverage", "1 backup still needed"],
          ["Outreach history", "No-response recipients separated"],
          ["Confirmation", "Hire email drafted and tracked"],
          ["Portal handoff", "Assignment visible when released"],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#d8e3ec] bg-white px-3 py-2">
            <span className="text-xs font-black uppercase text-[#6d8092]">{label}</span>
            <span className="text-sm font-black text-[#15324a]">{value}</span>
          </div>
        ))}
      </div>
    );
  }

  if (type === "portal") {
    return (
      <div className="grid gap-3">
        {[
          ["Schedule preview", "Ready"],
          ["Role / case", "Hidden"],
          ["Arrival instructions", "Release when final"],
          ["Case materials", "Ready"],
          ["Training details", "Ready"],
          ["Acknowledgments", "Pending"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[8px] border border-[#d8e3ec] bg-white p-3">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-sm font-black text-[#15324a]">{label}</span>
              <span className="rounded-full border border-[#c9d8e4] bg-[#f7fafc] px-2 py-1 text-[10px] font-black text-[#426072]">{value}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-[#eef3f7]">
              <div className={value === "Hidden" || value === "Pending" ? "h-2 w-1/2 rounded-full bg-[#f2b84b]" : "h-2 w-full rounded-full bg-[#33b79d]"} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "roster") {
    return (
      <div className="grid gap-3">
        <div className="rounded-[8px] border border-[#b7e4d8] bg-[#eefaf7] p-4">
          <div className="text-[11px] font-black uppercase text-[#0d5f55]">Uploaded roster</div>
          <div className="mt-1 text-3xl font-black text-[#123044]">32 learners</div>
          <div className="mt-2 text-sm font-bold text-[#426072]">CSV / XLSX import becomes the planning source.</div>
        </div>
        <div className="rounded-[8px] border border-[#f0d08a] bg-[#fff8e8] p-4">
          <div className="text-[11px] font-black uppercase text-[#765103]">Mismatch warning</div>
          <div className="mt-1 text-sm font-black leading-6 text-[#765103]">
            Roster has 32 learners, but Event Settings expects 16.
          </div>
          <button type="button" className="mt-3 rounded-[8px] border border-[#d29b39] bg-white px-3 py-2 text-xs font-black text-[#765103]">
            Update expected learner count
          </button>
        </div>
      </div>
    );
  }

  if (type === "readiness") {
    return (
      <div className="grid gap-3">
        {[
          ["Backup still needed", "1 backup gap", "warn"],
          ["Schedule capacity", "Suggested fixes available", "warn"],
          ["Materials", "Ready for release", "good"],
          ["Portal", "Release gates pending", "neutral"],
        ].map(([label, value, tone]) => (
          <div key={label} className={`rounded-[8px] border p-3 ${toneClasses(tone as "good" | "warn" | "neutral")}`}>
            <div className="text-xs font-black uppercase">{label}</div>
            <div className="mt-1 text-sm font-black">{value}</div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "dayof") {
    return (
      <div className="grid gap-3">
        {[
          ["Check-in window", "Open"],
          ["Confirmed SPs", "6 expected"],
          ["Attendance", "Visible by room"],
          ["Overrides", "Logged"],
          ["Closeout", "Follow-up ready"],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 rounded-[8px] border border-[#d8e3ec] bg-white px-3 py-3">
            <span className="text-sm font-black text-[#15324a]">{label}</span>
            <span className="rounded-full border border-[#b7e4d8] bg-[#eefaf7] px-2 py-1 text-[10px] font-black text-[#0d5f55]">{value}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {[
        ["Schedule grid", "Imported"],
        ["Learner roster", "32 rows"],
        ["SP outreach list", "25 candidates"],
        ["Training notes", "Staged"],
      ].map(([label, value]) => (
        <div key={label} className="rounded-[8px] border border-[#d8e3ec] bg-white p-3">
          <div className="text-xs font-black uppercase text-[#6d8092]">{label}</div>
          <div className="mt-1 text-sm font-black text-[#15324a]">{value}</div>
        </div>
      ))}
    </div>
  );
}

export default function GuidedProductDemo() {
  const [activeStepId, setActiveStepId] = useState(demoSteps[0].id);
  const activeStep = useMemo(() => demoSteps.find((step) => step.id === activeStepId) || demoSteps[0], [activeStepId]);

  return (
    <section id="public-preview" className="scroll-mt-24 bg-[#f4f8f7] py-16 text-[#123044] md:py-20">
      <div className="mx-auto grid w-full max-w-[1220px] gap-8 px-5">
        <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div>
            <p className="m-0 text-xs font-black uppercase text-[#0d756d]">Interactive public demo</p>
            <h2 className="m-0 mt-3 max-w-[760px] text-3xl font-black leading-tight text-[#0f2638] md:text-5xl">
              Watch CFSP convert prep work into an Event Command Center.
            </h2>
          </div>
          <p className="m-0 max-w-[720px] text-base font-semibold leading-8 text-[#4a6071] md:text-lg">
            Click through the fake workflow. The mock app changes state to show schedule conversion, SP hiring, roster import, readiness blockers, portal release, and day-of operations.
          </p>
        </div>

        <div className="rounded-[8px] border border-[#d4e0e8] bg-white p-3 shadow-[0_24px_70px_rgba(24,47,68,0.16)]">
          <div className="grid gap-2 lg:grid-cols-7" role="tablist" aria-label="CFSP public guided workflow">
            {demoSteps.map((step) => {
              const selected = step.id === activeStep.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="cfsp-demo-command-center"
                  onClick={() => setActiveStepId(step.id)}
                  className={
                    selected
                      ? "rounded-[8px] border border-[#0d756d] bg-[#0d756d] px-3 py-3 text-left text-xs font-black leading-5 text-white shadow-sm"
                      : "rounded-[8px] border border-[#d8e3ec] bg-[#f7fafc] px-3 py-3 text-left text-xs font-black leading-5 text-[#486176] transition hover:-translate-y-px hover:border-[#9cb7c9] hover:bg-white"
                  }
                >
                  <span className="block text-[10px] uppercase opacity-80">{step.eyebrow}</span>
                  <span className="mt-1 block">{step.label}</span>
                </button>
              );
            })}
          </div>

          <div id="cfsp-demo-command-center" className="mt-3 overflow-hidden rounded-[8px] border border-[#c9d8e4]">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#c9d8e4] bg-[#10283c] px-4 py-4 text-white">
              <div>
                <p className="m-0 text-xs font-black uppercase text-[#9eeade]">Event Command Center</p>
                <h3 className="m-0 mt-1 text-xl font-black">Neurologic Assessment: Stroke Warning Signs</h3>
                <p className="m-0 mt-1 text-sm font-semibold text-[#d4e8f6]">32 learners - 4 rooms - 4 cases - 6 primary SPs + 1 backup</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[#92d5c7] bg-[#123f3b] px-3 py-1 text-xs font-black text-[#dffbf6]">Fake sandbox data</span>
                <span className="rounded-full border border-[#f0c66d] bg-[#4a350d] px-3 py-1 text-xs font-black text-[#ffedbd]">Next: {activeStep.nextAction}</span>
              </div>
            </header>

            <div className="grid min-h-[650px] bg-[#eef4f7] lg:grid-cols-[224px_1fr]">
              <aside className="border-b border-[#d8e3ec] bg-[#e8f0f4] p-3 lg:border-r lg:border-b-0">
                <div className="px-2 pb-2 text-[11px] font-black uppercase text-[#657a8c]">Command rail</div>
                <div className="grid gap-2">
                  {railItems.map((item) => (
                    <div
                      key={item}
                      className={
                        activeStep.rail === item
                          ? "rounded-[8px] border border-[#0d756d] bg-white px-3 py-2 text-sm font-black text-[#123044] shadow-sm"
                          : "rounded-[8px] border border-[#d4e0e8] bg-[#f8fbfc] px-3 py-2 text-sm font-bold text-[#536a7d]"
                      }
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </aside>

              <main className="grid gap-4 p-4">
                <section className="rounded-[8px] border border-[#d8e3ec] bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-[820px]">
                      <p className="m-0 text-xs font-black uppercase text-[#0d756d]">Active step</p>
                      <h4 className="m-0 mt-1 text-2xl font-black text-[#123044]">{activeStep.title}</h4>
                      <p className="m-0 mt-2 text-sm font-semibold leading-7 text-[#4a6071]">{activeStep.copy}</p>
                    </div>
                    <span className="rounded-full border border-[#f0c66d] bg-[#fff8e8] px-3 py-2 text-xs font-black text-[#765103]">
                      {activeStep.status}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {activeStep.tiles.map((tile) => (
                      <div key={tile.label} className={`rounded-[8px] border p-3 ${toneClasses(tile.tone)}`}>
                        <div className="text-[11px] font-black uppercase opacity-80">{tile.label}</div>
                        <div className="mt-1 text-xl font-black">{tile.value}</div>
                      </div>
                    ))}
                  </div>
                </section>

                <div className="grid gap-4 xl:grid-cols-[0.96fr_1.04fr]">
                  <section className="rounded-[8px] border border-[#d8e3ec] bg-white p-4">
                    <p className="m-0 text-xs font-black uppercase text-[#0d756d]">{activeStep.primaryPanel.title}</p>
                    <div className="mt-3 grid gap-2">
                      {activeStep.primaryPanel.rows.map((row) => (
                        <div key={row.label} className={`rounded-[8px] border px-3 py-2 ${toneClasses(row.tone)}`}>
                          <div className="text-[11px] font-black uppercase opacity-80">{row.label}</div>
                          <div className="mt-1 text-sm font-black leading-6">{row.value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {activeStep.actions.map((action) => (
                        <button key={action} type="button" className="rounded-[8px] border border-[#c9d8e4] bg-white px-3 py-2 text-xs font-black text-[#27445b] transition hover:border-[#0d756d] hover:text-[#0d756d]">
                          {action}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-[8px] border border-[#d8e3ec] bg-[#f7fafc] p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="m-0 text-xs font-black uppercase text-[#765103]">Live mock panel</p>
                      <span className="rounded-full border border-[#c9d8e4] bg-white px-3 py-1 text-[10px] font-black text-[#536a7d]">Public-safe preview</span>
                    </div>
                    <SidePanel type={activeStep.sidePanel} />
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
