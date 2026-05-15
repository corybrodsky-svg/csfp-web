"use client";

import { useEffect, useMemo, useState } from "react";

type FieldSnapshot = {
  dates: string;
  studentCount: string;
  roomCount: string;
  startTime: string;
  endTime: string;
  encounterMinutes: string;
  transitionMinutes: string;
  prebriefingRequired?: string;
  prebriefingMinutes?: string;
  prebriefingLocation?: string;
  roomNames: string;
};

type PreviewCell = {
  room: string;
  learner: string;
};

type PreviewRound = {
  round: number;
  start: number;
  encounterEnd: number;
  end: number;
  cells: PreviewCell[];
};

const blankSnapshot: FieldSnapshot = {
  dates: "",
  studentCount: "",
  roomCount: "",
  startTime: "",
  endTime: "",
  encounterMinutes: "",
  transitionMinutes: "",
  prebriefingRequired: "no",
  prebriefingMinutes: "15",
  prebriefingLocation: "",
  roomNames: "",
};

function isVisibleField(field: HTMLInputElement | HTMLTextAreaElement) {
  const rect = field.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && field.type !== "hidden";
}

function takeSnapshot(): FieldSnapshot {
  if (typeof document === "undefined") return blankSnapshot;

  const previewRoot = document.querySelector("[data-new-event-schedule-preview]");
  const form =
    previewRoot?.closest("form") ||
    previewRoot?.closest(".cfsp-card") ||
    document.querySelector("form") ||
    document.body;

  const fields = Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("textarea, input"))
    .filter(isVisibleField);

  const textareas = fields.filter((field) => field.tagName.toLowerCase() === "textarea");
  const inputs = fields.filter((field) => field.tagName.toLowerCase() === "input");

  const dates = textareas[0]?.value || "";
  const roomNames = textareas[textareas.length - 1]?.value || "";

  return {
    dates,
    studentCount: inputs[0]?.value || "",
    roomCount: inputs[1]?.value || "",
    startTime: inputs[2]?.value || "",
    endTime: inputs[3]?.value || "",
    encounterMinutes: inputs[4]?.value || "",
    transitionMinutes: inputs[5]?.value || "",
    roomNames,
  };
}

function parseNumber(value: string) {
  const parsed = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTimeToMinutes(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;

  const nativeMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (nativeMatch) {
    const hours = Number(nativeMatch[1]);
    const minutes = Number(nativeMatch[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) return hours * 60 + minutes;
  }

  const friendlyMatch = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (friendlyMatch) {
    let hours = Number(friendlyMatch[1]);
    const minutes = Number(friendlyMatch[2] || "0");
    const meridiem = friendlyMatch[3].toUpperCase();

    if (hours === 12) hours = 0;
    if (meridiem === "PM") hours += 12;

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) return hours * 60 + minutes;
  }

  return null;
}

function formatMinutes(value: number) {
  const total = ((value % 1440) + 1440) % 1440;
  let hours = Math.floor(total / 60);
  const minutes = total % 60;
  const meridiem = hours >= 12 ? "PM" : "AM";

  hours = hours % 12;
  if (hours === 0) hours = 12;

  return `${hours}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

function parseDates(value: string) {
  return String(value || "")
    .split(/\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildRoomNames(rawNames: string, roomCount: number) {
  const typed = String(rawNames || "")
    .split(/\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);

  return Array.from({ length: Math.max(roomCount, 1) }, (_, index) => typed[index] || `Exam Room ${index + 1}`);
}

function buildPreview(snapshot: FieldSnapshot) {
  const studentCount = parseNumber(snapshot.studentCount);
  const roomCount = Math.max(1, parseNumber(snapshot.roomCount) || 1);
  const encounter = parseNumber(snapshot.encounterMinutes);
  const transition = parseNumber(snapshot.transitionMinutes);
  const prebriefingRequired = snapshot.prebriefingRequired === "yes";
  const prebriefingMinutes = prebriefingRequired ? parseNumber(snapshot.prebriefingMinutes || "15") || 15 : 0;
  const prebriefingLocation = snapshot.prebriefingLocation || "";
  const start = parseTimeToMinutes(snapshot.startTime);
  const end = parseTimeToMinutes(snapshot.endTime);
  const dates = parseDates(snapshot.dates);
  const roomNames = buildRoomNames(snapshot.roomNames, roomCount);

  if (!studentCount) {
    return {
      status: "empty" as const,
      message: "Enter a student count to preview learner rotation rounds.",
      dates,
      roomNames,
      rounds: [] as PreviewRound[],
      studentCount,
      roomCount,
      roundCount: 0,
      prebriefingRequired: false,
      prebriefingMinutes: 0,
      prebriefingLocation: "",
    };
  }

  if (start === null || end === null || !encounter || transition < 0) {
    return {
      status: "missing" as const,
      message: "Add start time, end time, encounter length, and transition time to preview the schedule.",
      dates,
      roomNames,
      rounds: [] as PreviewRound[],
      studentCount,
      roomCount,
      roundCount: 0,
      prebriefingRequired: false,
      prebriefingMinutes: 0,
      prebriefingLocation: "",
    };
  }

  const block = encounter + transition;
  const available = end - start;

  if (available <= 0 || block <= 0) {
    return {
      status: "invalid" as const,
      message: "The timing window is not long enough to build a schedule preview.",
      dates,
      roomNames,
      rounds: [] as PreviewRound[],
      studentCount,
      roomCount,
      roundCount: 0,
      prebriefingRequired: false,
      prebriefingMinutes: 0,
      prebriefingLocation: "",
    };
  }

  const timeWindowRounds = Math.floor(available / block);
  const learnerRounds = Math.ceil(studentCount / roomCount);
  const roundCount = Math.max(0, Math.min(timeWindowRounds, learnerRounds));

  let learnerCursor = 1;

  const rounds: PreviewRound[] = Array.from({ length: roundCount }, (_, roundIndex) => {
    const roundStart = start + roundIndex * block;
    const encounterEnd = roundStart + encounter;
    const roundEnd = roundStart + block;

    const cells = roomNames.map((room) => {
      const learner = learnerCursor <= studentCount ? `Learner ${learnerCursor}` : "Open";
      learnerCursor += 1;
      return { room, learner };
    });

    return {
      round: roundIndex + 1,
      start: roundStart,
      encounterEnd,
      end: roundEnd,
      cells,
    };
  });

  return {
    status: "ready" as const,
    message: "",
    dates,
    roomNames,
    rounds,
    studentCount,
    roomCount,
    roundCount,
    prebriefingRequired,
    prebriefingMinutes,
    prebriefingLocation,
  };
}

export default function NewEventSchedulePreview({ snapshotOverride }: { snapshotOverride?: Partial<FieldSnapshot> } = {}) {
  const [snapshot, setSnapshot] = useState<FieldSnapshot>(blankSnapshot);
  const [view, setView] = useState<"student" | "admin">("student");

  useEffect(() => {
    const refresh = () => setSnapshot(takeSnapshot());

    refresh();

    document.addEventListener("input", refresh, true);
    document.addEventListener("change", refresh, true);

    const timer = window.setInterval(refresh, 500);

    return () => {
      document.removeEventListener("input", refresh, true);
      document.removeEventListener("change", refresh, true);
      window.clearInterval(timer);
    };
  }, []);

  const effectiveSnapshot = useMemo(
    () => ({ ...snapshot, ...(snapshotOverride || {}) }),
    [snapshot, snapshotOverride]
  );
  const preview = useMemo(() => buildPreview(effectiveSnapshot), [effectiveSnapshot]);
  const dates = preview.dates.length ? preview.dates : ["Preview Date"];

  return (
    <section data-new-event-schedule-preview className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Schedule Preview</p>
          <h3 className="mt-1 text-xl font-black text-slate-900">Generated From This Form</h3>
          <p className="mt-1 text-sm text-slate-600">
            This mirrors the full Schedule Builder layout before the event is created.
          </p>
        </div>

        <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setView("student")}
            className={`rounded-lg px-4 py-2 text-sm font-bold ${
              view === "student" ? "bg-blue-700 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Student Schedule
          </button>
          <button
            type="button"
            onClick={() => setView("admin")}
            className={`rounded-lg px-4 py-2 text-sm font-bold ${
              view === "admin" ? "bg-blue-700 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Admin Schedule
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
          Learners {preview.studentCount || 0}
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
          Rooms {preview.roomCount || 0}
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
          Rounds {preview.roundCount || 0}
        </span>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
          Preview Only
        </span>
      </div>

      {preview.status !== "ready" ? (
        <div className="px-4 py-5 text-sm font-semibold text-slate-600">{preview.message}</div>
      ) : (
        <div className="space-y-5 px-4 py-4">
          {dates.map((date) => (
            <div key={date} className="overflow-hidden rounded-xl border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{date}</p>
                <p className="mt-1 text-sm font-bold text-slate-700">
                  {view === "student"
                    ? "Student Schedule excludes internal SP and case details."
                    : "Admin Schedule preview includes room operations timing context."}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-white text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                      <th className="w-24 px-4 py-3">Round</th>
                      <th className="w-52 px-4 py-3">Time</th>
                      {preview.roomNames.map((room) => (
                        <th key={room} className="px-4 py-3">{room}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rounds.map((round) => (
                      <tr key={round.round} className="border-b border-slate-100 align-top">
                        <td className="px-4 py-4 font-black text-slate-900">Round {round.round}</td>
                        <td className="px-4 py-4">
                          <div className="font-black text-slate-900">
                            {formatMinutes(round.start)} - {formatMinutes(round.end)}
                          </div>
                          <div className="mt-2 space-y-1 text-xs font-bold text-slate-500">
                            {preview.prebriefingRequired ? (
                              <p>
                                Pre-brief: {formatMinutes(round.start - preview.prebriefingMinutes)} - {formatMinutes(round.start)}
                                {preview.prebriefingLocation ? ` · ${preview.prebriefingLocation}` : ""}
                              </p>
                            ) : null}
                            <p>Encounter: {formatMinutes(round.start)} - {formatMinutes(round.encounterEnd)}</p>
                            <p>Feedback: {formatMinutes(round.encounterEnd)} - {formatMinutes(round.end)}</p>
                          </div>
                        </td>
                        {round.cells.map((cell) => (
                          <td key={`${round.round}-${cell.room}`} className="px-4 py-4">
                            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                              <p className="text-xs font-black uppercase text-blue-800">
                                {cell.room} · {cell.learner === "Open" ? "Open Slot" : "1 Learner"}
                              </p>
                              <div className="mt-2 rounded-full bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm">
                                {cell.learner}
                              </div>
                              {view === "admin" ? (
                                <div className="mt-2 text-[11px] font-bold text-slate-500">
                                  SP / Case TBD after event creation
                                </div>
                              ) : null}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
