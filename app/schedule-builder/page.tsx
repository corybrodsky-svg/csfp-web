"use client";

import { useMemo, useState } from "react";

type EventType = "SP Event" | "Skills" | "Training" | "Virtual/VIR" | "Hi-Fi";

type GeneratedRound = {
  round: number;
  start: number;
  end: number;
  rooms: string[];
};

export default function ScheduleBuilderPage() {
  const [eventTitle, setEventTitle] = useState("");
  const [courseProgram, setCourseProgram] = useState("");
  const [facultyLead, setFacultyLead] = useState("");
  const [eventDates, setEventDates] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [assessment, setAssessment] = useState("Formative");
  const [eventType, setEventType] = useState<EventType>("SP Event");
  const [notes, setNotes] = useState("");

  const [needsSPs, setNeedsSPs] = useState("Yes");
  const [spsNeeded, setSpsNeeded] = useState(1);
  const [spTrainingDate, setSpTrainingDate] = useState("");
  const [spTrainingTime, setSpTrainingTime] = useState("");
  const [numberOfCases, setNumberOfCases] = useState(1);
  const [recording, setRecording] = useState("Yes");
  const [liveStream, setLiveStream] = useState("No");
  const [modality, setModality] = useState("SPL");

  const [roomsRequested, setRoomsRequested] = useState(1);
  const [equipmentList, setEquipmentList] = useState("No");
  const [learnersPerSession, setLearnersPerSession] = useState(1);
  const [groupsPerDay, setGroupsPerDay] = useState(1);
  const [accessibilityNeeds, setAccessibilityNeeds] = useState("");

  const [totalLearners, setTotalLearners] = useState(0);
  const [totalRooms, setTotalRooms] = useState(1);
  const [casesPerLearner, setCasesPerLearner] = useState(1);
  const [encounterTime, setEncounterTime] = useState(20);
  const [checklistTime, setChecklistTime] = useState(10);
  const [feedbackTime, setFeedbackTime] = useState(5);
  const [turnoverTime, setTurnoverTime] = useState(5);
  const [learnersPerRoom, setLearnersPerRoom] = useState(1);

  const [schedule, setSchedule] = useState<GeneratedRound[]>([]);
  const [scheduleError, setScheduleError] = useState("");

  const noSpStaffingRequired =
    needsSPs === "No" || eventType === "Skills" || spsNeeded === 0;

  const flow = useMemo(() => {
    const capacityPerRound = Math.max(totalRooms * learnersPerRoom, 0);
    const roundsNeeded =
      capacityPerRound > 0 ? Math.ceil(totalLearners / capacityPerRound) : 0;
    const timePerRound =
      encounterTime + checklistTime + feedbackTime + turnoverTime;
    const totalTime = roundsNeeded * timePerRound;

    return {
      capacityPerRound,
      roundsNeeded,
      timePerRound,
      totalTime,
      hours: Math.floor(totalTime / 60),
      minutes: totalTime % 60,
    };
  }, [
    totalLearners,
    totalRooms,
    learnersPerRoom,
    encounterTime,
    checklistTime,
    feedbackTime,
    turnoverTime,
  ]);

  function generateSchedule() {
    setScheduleError("");

    const parsedStart = parseStartTime(eventTime);

    if (!parsedStart) {
      setSchedule([]);
      setScheduleError(
        "Enter an event time that starts with a recognizable time, like 1:00 PM-5:00 PM or 13:00-17:00."
      );
      return;
    }

    if (flow.roundsNeeded <= 0) {
      setSchedule([]);
      setScheduleError(
        "Enter total learners, rooms, and learners per room before generating a schedule."
      );
      return;
    }

    if (flow.timePerRound <= 0) {
      setSchedule([]);
      setScheduleError("Round time must be greater than zero.");
      return;
    }

    const rounds: GeneratedRound[] = [];
    let currentMinutes = parsedStart;

    for (let i = 0; i < flow.roundsNeeded; i += 1) {
      const start = currentMinutes;
      const end = start + flow.timePerRound;

      const rooms = Array.from({ length: Math.max(totalRooms, 1) }, (_, index) => {
        return `Room ${index + 1}`;
      });

      rounds.push({
        round: i + 1,
        start,
        end,
        rooms,
      });

      currentMinutes = end;
    }

    setSchedule(rounds);
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-2 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-800">
          CFSP Schedule Builder
        </p>
        <h1 className="text-3xl font-bold text-slate-900">
          Session Intake Builder
        </h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Build simulation flow from intake details, calculate room/session
          needs, and preview the event structure before saving to CFSP.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Panel title="Event Basics">
            <Field label="Event Title">
              <input
                className="cfsp-input"
                value={eventTitle}
                onChange={(event) => setEventTitle(event.target.value)}
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Course / Program">
                <input
                  className="cfsp-input"
                  value={courseProgram}
                  onChange={(event) => setCourseProgram(event.target.value)}
                />
              </Field>

              <Field label="Faculty Lead">
                <input
                  className="cfsp-input"
                  value={facultyLead}
                  onChange={(event) => setFacultyLead(event.target.value)}
                />
              </Field>

              <Field label="Event Dates">
                <input
                  className="cfsp-input"
                  placeholder="Example: 6/26 + 9/04"
                  value={eventDates}
                  onChange={(event) => setEventDates(event.target.value)}
                />
              </Field>

              <Field label="Event Time">
                <input
                  className="cfsp-input"
                  placeholder="Example: 1:00 PM-5:00 PM"
                  value={eventTime}
                  onChange={(event) => setEventTime(event.target.value)}
                />
              </Field>

              <Field label="Assessment">
                <select
                  className="cfsp-input"
                  value={assessment}
                  onChange={(event) => setAssessment(event.target.value)}
                >
                  <option>Formative</option>
                  <option>Summative</option>
                  <option>Practice</option>
                  <option>Training</option>
                </select>
              </Field>

              <Field label="Event Type">
                <select
                  className="cfsp-input"
                  value={eventType}
                  onChange={(event) => setEventType(event.target.value as EventType)}
                >
                  <option>SP Event</option>
                  <option>Skills</option>
                  <option>Training</option>
                  <option>Virtual/VIR</option>
                  <option>Hi-Fi</option>
                </select>
              </Field>
            </div>

            <Field label="Notes">
              <textarea
                className="cfsp-input min-h-24"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
          </Panel>

          <Panel title="Simulation Requirements">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Standardized Patients?">
                <select
                  className="cfsp-input"
                  value={needsSPs}
                  onChange={(event) => setNeedsSPs(event.target.value)}
                >
                  <option>Yes</option>
                  <option>No</option>
                </select>
              </Field>

              <Field label="How Many Needed?">
                <input
                  className="cfsp-input"
                  type="number"
                  min={0}
                  value={spsNeeded}
                  onChange={(event) => setSpsNeeded(Number(event.target.value))}
                  disabled={needsSPs === "No"}
                />
              </Field>

              <Field label="Number of Cases">
                <input
                  className="cfsp-input"
                  type="number"
                  min={0}
                  value={numberOfCases}
                  onChange={(event) => setNumberOfCases(Number(event.target.value))}
                />
              </Field>

              <Field label="SP Training Date">
                <input
                  className="cfsp-input"
                  value={spTrainingDate}
                  onChange={(event) => setSpTrainingDate(event.target.value)}
                  disabled={noSpStaffingRequired}
                />
              </Field>

              <Field label="SP Training Time">
                <input
                  className="cfsp-input"
                  value={spTrainingTime}
                  onChange={(event) => setSpTrainingTime(event.target.value)}
                  disabled={noSpStaffingRequired}
                />
              </Field>

              <Field label="Modality">
                <input
                  className="cfsp-input"
                  value={modality}
                  onChange={(event) => setModality(event.target.value)}
                />
              </Field>

              <Field label="Recording?">
                <select
                  className="cfsp-input"
                  value={recording}
                  onChange={(event) => setRecording(event.target.value)}
                >
                  <option>Yes</option>
                  <option>No</option>
                </select>
              </Field>

              <Field label="Live Stream?">
                <select
                  className="cfsp-input"
                  value={liveStream}
                  onChange={(event) => setLiveStream(event.target.value)}
                >
                  <option>No</option>
                  <option>Yes</option>
                </select>
              </Field>
            </div>

            {noSpStaffingRequired && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-semibold text-emerald-800">
                No SP staffing required for this event.
              </div>
            )}
          </Panel>

          <Panel title="Rooms and Logistics">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Rooms Requested">
                <input
                  className="cfsp-input"
                  type="number"
                  min={1}
                  value={roomsRequested}
                  onChange={(event) => setRoomsRequested(Number(event.target.value))}
                />
              </Field>

              <Field label="Equipment List">
                <input
                  className="cfsp-input"
                  value={equipmentList}
                  onChange={(event) => setEquipmentList(event.target.value)}
                />
              </Field>

              <Field label="Learners per Session">
                <input
                  className="cfsp-input"
                  type="number"
                  min={1}
                  value={learnersPerSession}
                  onChange={(event) =>
                    setLearnersPerSession(Number(event.target.value))
                  }
                />
              </Field>

              <Field label="Groups per Day">
                <input
                  className="cfsp-input"
                  type="number"
                  min={1}
                  value={groupsPerDay}
                  onChange={(event) => setGroupsPerDay(Number(event.target.value))}
                />
              </Field>

              <Field label="Accessibility Needs">
                <input
                  className="cfsp-input"
                  value={accessibilityNeeds}
                  onChange={(event) => setAccessibilityNeeds(event.target.value)}
                />
              </Field>
            </div>
          </Panel>

          <Panel title="Sim Flow Calculator">
            <div className="grid gap-4 md:grid-cols-4">
              <NumberField
                label="Total Learners"
                value={totalLearners}
                setValue={setTotalLearners}
              />
              <NumberField
                label="Total Rooms"
                value={totalRooms}
                setValue={setTotalRooms}
                min={1}
              />
              <NumberField
                label="Cases per Learner"
                value={casesPerLearner}
                setValue={setCasesPerLearner}
                min={1}
              />
              <NumberField
                label="Learners per Room"
                value={learnersPerRoom}
                setValue={setLearnersPerRoom}
                min={1}
              />
              <NumberField
                label="Encounter Time"
                value={encounterTime}
                setValue={setEncounterTime}
              />
              <NumberField
                label="Checklist Time"
                value={checklistTime}
                setValue={setChecklistTime}
              />
              <NumberField
                label="SP Feedback Time"
                value={feedbackTime}
                setValue={setFeedbackTime}
              />
              <NumberField
                label="Turnover Time"
                value={turnoverTime}
                setValue={setTurnoverTime}
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={generateSchedule}
                className="rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white shadow-sm hover:bg-emerald-700"
              >
                Generate Schedule
              </button>

              <button
                type="button"
                onClick={() => {
                  setSchedule([]);
                  setScheduleError("");
                }}
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-bold text-slate-700 hover:bg-slate-50"
              >
                Clear Schedule
              </button>
            </div>

            {scheduleError && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 font-semibold text-amber-900">
                {scheduleError}
              </div>
            )}

            {schedule.length > 0 && (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-lg font-black text-slate-900">
                  Generated Schedule
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {schedule.length} rounds generated from {formatTime(schedule[0].start)}.
                </p>

                <div className="mt-4 space-y-3">
                  {schedule.map((round) => (
                    <div
                      key={round.round}
                      className="rounded-xl border border-slate-200 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-black text-slate-900">
                          Round {round.round}
                        </p>
                        <p className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-800">
                          {formatTime(round.start)} – {formatTime(round.end)}
                        </p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {round.rooms.map((room) => (
                          <span
                            key={`${round.round}-${room}`}
                            className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-800"
                          >
                            {room}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        </div>

        <aside className="space-y-4">
          <div className="sticky top-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-800">
              Sim Flow Results
            </p>

            <Result label="Capacity per Round" value={flow.capacityPerRound} />
            <Result label="Rounds Needed" value={flow.roundsNeeded} />
            <Result label="Time per Round" value={`${flow.timePerRound} min`} />
            <Result label="Total Minutes" value={`${flow.totalTime} min`} />
            <Result label="Total Time" value={`${flow.hours} h ${flow.minutes} min`} />

            <div className="mt-5 rounded-xl bg-white p-4 text-sm text-slate-700">
              <p className="font-bold text-slate-900">Preview</p>
              <p className="mt-2">{eventTitle || "Untitled Event"}</p>
              <p>{eventDates || "No dates entered"}</p>
              <p>{eventTime || "No time entered"}</p>
              <p>
                {noSpStaffingRequired
                  ? "No SP staffing required"
                  : `${spsNeeded} SPs needed`}
              </p>
              {schedule.length > 0 && (
                <p className="mt-2 font-bold text-emerald-700">
                  {schedule.length} scheduled rounds generated
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="mt-4 w-full rounded-xl bg-blue-700 px-4 py-3 font-bold text-white hover:bg-blue-800"
            >
              Export / Print Summary
            </button>

            <button
              type="button"
              disabled
              className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-bold text-slate-400"
            >
              Save to CFSP Coming Next
            </button>
          </div>
        </aside>
      </section>
    </main>
  );
}

function parseStartTime(value: string): number | null {
  const rawStart = value.split("-")[0]?.trim();
  if (!rawStart) return null;

  const normalized = rawStart.toLowerCase().replace(/\s+/g, "");
  const isPm = normalized.includes("pm");
  const isAm = normalized.includes("am");
  const clean = normalized.replace("am", "").replace("pm", "");

  const match = clean.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (minutes < 0 || minutes > 59) return null;

  if (isPm && hours < 12) hours += 12;
  if (isAm && hours === 12) hours = 0;

  if (hours < 0 || hours > 23) return null;

  return hours * 60 + minutes;
}

function formatTime(totalMinutes: number) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;

  return `${hours12}:${minutes.toString().padStart(2, "0")} ${suffix}`;
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xl font-bold text-slate-900">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  setValue,
  min = 0,
}: {
  label: string;
  value: number;
  setValue: (value: number) => void;
  min?: number;
}) {
  return (
    <Field label={label}>
      <input
        className="cfsp-input"
        type="number"
        min={min}
        value={value}
        onChange={(event) => setValue(Number(event.target.value))}
      />
    </Field>
  );
}

function Result({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="mt-4 flex items-center justify-between border-b border-blue-100 pb-2">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      <span className="text-lg font-black text-slate-900">{value}</span>
    </div>
  );
}