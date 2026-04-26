"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../../components/SiteShell";

type EventType = "sp" | "skills" | "training" | "virtual" | "hifi";
type WizardStep = 0 | 1 | 2 | 3;

type GeneratedSession = {
  session_date: string;
  start_time: string;
  end_time: string;
  room: string | null;
  location: string | null;
};

const EVENT_TYPE_OPTIONS: Array<{ value: EventType; label: string }> = [
  { value: "sp", label: "SP Event" },
  { value: "skills", label: "Skills" },
  { value: "training", label: "Training" },
  { value: "virtual", label: "Virtual / VIR" },
  { value: "hifi", label: "Hi-Fi" },
];

const STEP_TITLES = ["Event Info", "Schedule Builder", "Staffing Needs", "Review & Create"] as const;

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseNumber(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function toMinutes(value: string) {
  const raw = asText(value);
  if (!raw) return null;
  const [hours, minutes] = raw.split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function toTimeString(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

function toDisplayTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const normalizedHours = hours % 12 || 12;
  return `${normalizedHours}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function parseDateList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,/)
        .map((part) => part.trim())
        .filter(Boolean)
    )
  );
}

function parseRoomNames(roomNames: string, roomCount: number) {
  const parsed = roomNames
    .split(/\r?\n|,/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parsed.length) {
    return Array.from({ length: Math.max(roomCount, 1) }, (_, index) => `Room ${index + 1}`);
  }

  const next = [...parsed];
  while (next.length < roomCount) {
    next.push(`Room ${next.length + 1}`);
  }
  return next.slice(0, Math.max(roomCount, 1));
}

function buildGeneratedSessions(args: {
  dates: string[];
  startTime: string;
  endTime: string;
  sessionLengthMinutes: number;
  breakLengthMinutes: number;
  roomNames: string[];
  location: string;
}) {
  const startMinutes = toMinutes(args.startTime);
  const endMinutes = toMinutes(args.endTime);
  if (startMinutes === null || endMinutes === null) return [];
  if (endMinutes <= startMinutes) return [];
  if (args.sessionLengthMinutes <= 0) return [];

  const sessions: GeneratedSession[] = [];

  args.dates.forEach((date) => {
    let currentStart = startMinutes;
    while (currentStart + args.sessionLengthMinutes <= endMinutes) {
      const currentEnd = currentStart + args.sessionLengthMinutes;
      args.roomNames.forEach((room) => {
        sessions.push({
          session_date: date,
          start_time: toTimeString(currentStart),
          end_time: toTimeString(currentEnd),
          room,
          location: asText(args.location) || null,
        });
      });
      currentStart = currentEnd + args.breakLengthMinutes;
    }
  });

  return sessions;
}

function formatSessionPreview(session: GeneratedSession) {
  return `${session.session_date} · ${toDisplayTime(toMinutes(session.start_time) || 0)} - ${toDisplayTime(
    toMinutes(session.end_time) || 0
  )}${session.room ? ` · ${session.room}` : ""}`;
}

function buildNotes(args: {
  eventType: EventType;
  eventLeadTeam: string;
  simStaff: string;
  courseFaculty: string;
  learnerCount: string;
  notes: string;
  sessionLength: string;
  breakLength: string;
  roomNames: string[];
}) {
  const lines = [
    `Event Type: ${EVENT_TYPE_OPTIONS.find((option) => option.value === args.eventType)?.label || "SP Event"}`,
    args.eventLeadTeam ? `Event Lead/Team: ${args.eventLeadTeam}` : "",
    args.simStaff ? `Sim Staff: ${args.simStaff}` : "",
    args.courseFaculty ? `Course Faculty: ${args.courseFaculty}` : "",
    args.learnerCount ? `Learners/Groups: ${args.learnerCount}` : "",
    args.sessionLength ? `Session Length: ${args.sessionLength} minutes` : "",
    args.breakLength ? `Break Length: ${args.breakLength} minutes` : "",
    args.roomNames.length ? `Rooms: ${args.roomNames.join(", ")}` : "",
    args.notes,
  ]
    .map((line) => asText(line))
    .filter(Boolean);

  return lines.join("\n");
}

function getRecommendedStatus(eventType: EventType, spNeeded: number) {
  if (eventType === "skills" || spNeeded <= 0) return "Scheduled";
  return "Needs SPs";
}

export default function NewEventPage() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(0);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [name, setName] = useState("");
  const [eventType, setEventType] = useState<EventType>("sp");
  const [location, setLocation] = useState("");
  const [eventLeadTeam, setEventLeadTeam] = useState("");
  const [simStaff, setSimStaff] = useState("");
  const [courseFaculty, setCourseFaculty] = useState("");
  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState("team");

  const [dateList, setDateList] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("12:00");
  const [sessionLength, setSessionLength] = useState("60");
  const [breakLength, setBreakLength] = useState("10");
  const [roomCount, setRoomCount] = useState("1");
  const [roomNames, setRoomNames] = useState("");

  const [spNeeded, setSpNeeded] = useState("0");
  const [learnerCount, setLearnerCount] = useState("");

  const parsedDates = useMemo(() => parseDateList(dateList), [dateList]);
  const parsedRoomCount = parseNumber(roomCount) || 1;
  const normalizedRoomNames = useMemo(
    () => parseRoomNames(roomNames, parsedRoomCount),
    [parsedRoomCount, roomNames]
  );
  const sessionLengthMinutes = parseNumber(sessionLength);
  const breakLengthMinutes = parseNumber(breakLength);
  const parsedSpNeeded = eventType === "skills" ? 0 : parseNumber(spNeeded);
  const generatedSessions = useMemo(
    () =>
      buildGeneratedSessions({
        dates: parsedDates,
        startTime,
        endTime,
        sessionLengthMinutes,
        breakLengthMinutes,
        roomNames: normalizedRoomNames,
        location,
      }),
    [breakLengthMinutes, endTime, location, normalizedRoomNames, parsedDates, sessionLengthMinutes, startTime]
  );

  const uniqueTimeBlocks = useMemo(
    () =>
      Array.from(
        new Set(generatedSessions.map((session) => `${session.session_date}|${session.start_time}|${session.end_time}`))
      ),
    [generatedSessions]
  );
  const totalSpCoverageNeeded = eventType === "skills" || parsedSpNeeded <= 0 ? 0 : uniqueTimeBlocks.length * parsedSpNeeded;
  const dateText = parsedDates.join(", ");
  const compiledNotes = buildNotes({
    eventType,
    eventLeadTeam,
    simStaff,
    courseFaculty,
    learnerCount,
    notes,
    sessionLength,
    breakLength,
    roomNames: normalizedRoomNames,
  });

  const warnings = useMemo(() => {
    const next: string[] = [];
    if (!asText(name)) next.push("Event name is required.");
    if (!parsedDates.length) next.push("At least one event date is required.");
    if (!startTime || !endTime) next.push("Start and end times are required.");
    if (!generatedSessions.length) next.push("Session builder could not generate any session blocks.");
    if (eventType !== "skills" && parsedSpNeeded <= 0) next.push("SP staffing is set to 0. This event will behave as no-SP-required.");
    if (!asText(simStaff) && !asText(eventLeadTeam)) next.push("Add sim staff or event lead/team so ownership is visible.");
    return next;
  }, [endTime, eventLeadTeam, eventType, generatedSessions.length, name, parsedDates.length, parsedSpNeeded, simStaff, startTime]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");

    if (warnings.some((warning) => warning.toLowerCase().includes("required"))) {
      setErrorMessage("Please complete the required fields before creating the event.");
      setSaving(false);
      return;
    }

    const payload = {
      name: asText(name),
      status: getRecommendedStatus(eventType, parsedSpNeeded),
      date_text: dateText,
      sp_needed: parsedSpNeeded,
      visibility,
      location: asText(location),
      notes: compiledNotes,
      sessions: generatedSessions,
    };

    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorMessage(body?.error || `Could not create event (${response.status}).`);
        setSaving(false);
        return;
      }

      const eventId = asText(body?.event?.id);
      if (eventId) {
        router.push(`/events/${eventId}`);
        return;
      }

      router.push("/events");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create event.");
      setSaving(false);
    }
  }

  return (
    <SiteShell
      title="New Event"
      subtitle="Use the guided intake flow to build sessions, set staffing needs, and create a ready-to-run event."
    >
      <div className="grid gap-5">
        {errorMessage ? <div className="cfsp-alert cfsp-alert-error">{errorMessage}</div> : null}

        <section className="cfsp-panel-muted rounded-[12px] border border-[#dce6ee] px-5 py-5">
          <div className="flex flex-wrap gap-2">
            {STEP_TITLES.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => setStep(index as WizardStep)}
                className={`cfsp-btn ${step === index ? "cfsp-btn-primary" : "cfsp-btn-secondary"}`}
              >
                {index + 1}. {label}
              </button>
            ))}
          </div>
        </section>

        <form onSubmit={handleCreate} className="grid gap-5">
          {step === 0 ? (
            <section className="cfsp-panel grid gap-4">
              <div>
                <h2 className="m-0 text-[1.35rem] font-black text-[#14304f]">Event Info</h2>
                <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                  Start with the basic event identity and the team responsible for the event.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="cfsp-label">Event Name</span>
                  <input className="cfsp-input" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Event Type</span>
                  <select className="cfsp-input" value={eventType} onChange={(e) => setEventType(e.target.value as EventType)}>
                    {EVENT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Location / Site</span>
                  <input className="cfsp-input" value={location} onChange={(e) => setLocation(e.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Visibility</span>
                  <select className="cfsp-input" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                    <option value="team">Team</option>
                    <option value="personal">Personal</option>
                  </select>
                </label>
                <label className="grid gap-2 md:col-span-2">
                  <span className="cfsp-label">Sim Staff / Event Lead/Team</span>
                  <input className="cfsp-input" value={eventLeadTeam} onChange={(e) => setEventLeadTeam(e.target.value)} placeholder="Cory/Cristina" />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Sim Staff</span>
                  <input className="cfsp-input" value={simStaff} onChange={(e) => setSimStaff(e.target.value)} placeholder="Cory" />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Course / Faculty</span>
                  <input className="cfsp-input" value={courseFaculty} onChange={(e) => setCourseFaculty(e.target.value)} />
                </label>
                <label className="grid gap-2 md:col-span-2">
                  <span className="cfsp-label">Notes</span>
                  <textarea
                    className="cfsp-input"
                    style={{ minHeight: 110, resize: "vertical" }}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section className="cfsp-panel grid gap-4">
              <div>
                <h2 className="m-0 text-[1.35rem] font-black text-[#14304f]">Schedule Builder</h2>
                <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                  Enter the date and timing rules once, then generate session blocks automatically.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 md:col-span-2">
                  <span className="cfsp-label">Date(s)</span>
                  <textarea
                    className="cfsp-input"
                    style={{ minHeight: 88, resize: "vertical" }}
                    value={dateList}
                    onChange={(e) => setDateList(e.target.value)}
                    placeholder={"2026-05-10\n2026-05-11"}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Start Time</span>
                  <input className="cfsp-input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">End Time</span>
                  <input className="cfsp-input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Session Length (minutes)</span>
                  <input className="cfsp-input" type="number" min={15} step={5} value={sessionLength} onChange={(e) => setSessionLength(e.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Break Length (minutes)</span>
                  <input className="cfsp-input" type="number" min={0} step={5} value={breakLength} onChange={(e) => setBreakLength(e.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Number of Rooms</span>
                  <input className="cfsp-input" type="number" min={1} value={roomCount} onChange={(e) => setRoomCount(e.target.value)} />
                </label>
                <label className="grid gap-2 md:col-span-2">
                  <span className="cfsp-label">Room Names</span>
                  <textarea
                    className="cfsp-input"
                    style={{ minHeight: 88, resize: "vertical" }}
                    value={roomNames}
                    onChange={(e) => setRoomNames(e.target.value)}
                    placeholder={"Room 101\nRoom 102"}
                  />
                </label>
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="cfsp-panel grid gap-4">
              <div>
                <h2 className="m-0 text-[1.35rem] font-black text-[#14304f]">Staffing Needs</h2>
                <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                  Set the coverage target. Skills events automatically suppress SP staffing.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="cfsp-label">Number of SPs Needed</span>
                  <input
                    className="cfsp-input"
                    type="number"
                    min={0}
                    value={eventType === "skills" ? "0" : spNeeded}
                    onChange={(e) => setSpNeeded(e.target.value)}
                    disabled={eventType === "skills"}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Student Groups / Learners</span>
                  <input className="cfsp-input" value={learnerCount} onChange={(e) => setLearnerCount(e.target.value)} />
                </label>
              </div>

              <div className={`cfsp-alert ${eventType === "skills" || parsedSpNeeded <= 0 ? "cfsp-alert-info" : "cfsp-alert-success"}`}>
                {eventType === "skills" || parsedSpNeeded <= 0
                  ? "No SP staffing required. This event will suppress SP assignment workflow after creation."
                  : `Projected total SP coverage needed: ${totalSpCoverageNeeded}`}
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="cfsp-panel grid gap-4">
              <div>
                <h2 className="m-0 text-[1.35rem] font-black text-[#14304f]">Review & Create</h2>
                <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                  Review the generated schedule, room usage, staffing need, and team details before saving.
                </p>
              </div>

              {warnings.length ? (
                <div className="cfsp-alert cfsp-alert-info">
                  <div className="font-black text-[#14304f]">Review warnings</div>
                  <ul className="mt-2 mb-0 pl-5 text-sm leading-6 text-[#5e7388]">
                    {warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="cfsp-stat-card">
                  <div className="cfsp-label">Generated Sessions</div>
                  <div className="cfsp-stat-value">{generatedSessions.length}</div>
                </div>
                <div className="cfsp-stat-card">
                  <div className="cfsp-label">Unique Time Blocks</div>
                  <div className="cfsp-stat-value">{uniqueTimeBlocks.length}</div>
                </div>
                <div className="cfsp-stat-card">
                  <div className="cfsp-label">Rooms</div>
                  <div className="cfsp-stat-value">{normalizedRoomNames.length}</div>
                </div>
                <div className="cfsp-stat-card">
                  <div className="cfsp-label">SP Coverage</div>
                  <div className="cfsp-stat-value">{eventType === "skills" || parsedSpNeeded <= 0 ? "None" : totalSpCoverageNeeded}</div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-4">
                  <div className="cfsp-label">Generated Sessions</div>
                  <div className="mt-3 grid gap-2">
                    {generatedSessions.length ? (
                      generatedSessions.slice(0, 18).map((session, index) => (
                        <div key={`${session.session_date}-${session.start_time}-${session.room}-${index}`} className="rounded-[10px] border border-[#dce6ee] bg-white px-3 py-3 text-sm font-semibold text-[#14304f]">
                          {formatSessionPreview(session)}
                        </div>
                      ))
                    ) : (
                      <div className="text-sm font-semibold text-[#6a7e91]">No sessions generated yet.</div>
                    )}
                    {generatedSessions.length > 18 ? (
                      <div className="text-sm font-semibold text-[#6a7e91]">
                        Showing first 18 of {generatedSessions.length} generated room slots.
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-4">
                  <div className="cfsp-label">Review Summary</div>
                  <div className="mt-3 grid gap-3 text-sm leading-6 text-[#14304f]">
                    <div><strong>Event:</strong> {name || "Untitled Event"}</div>
                    <div><strong>Type:</strong> {EVENT_TYPE_OPTIONS.find((option) => option.value === eventType)?.label}</div>
                    <div><strong>Location:</strong> {location || "Not set"}</div>
                    <div><strong>Team:</strong> {eventLeadTeam || "Not set"}</div>
                    <div><strong>Sim Staff:</strong> {simStaff || "Not set"}</div>
                    <div><strong>Course Faculty:</strong> {courseFaculty || "Not set"}</div>
                    <div><strong>SPs Needed:</strong> {eventType === "skills" ? "No SPs required" : parsedSpNeeded}</div>
                    <div><strong>Rooms:</strong> {normalizedRoomNames.join(", ")}</div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <div className="flex flex-wrap justify-between gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep((current) => Math.max(0, current - 1) as WizardStep)}
                className="cfsp-btn cfsp-btn-secondary"
                disabled={step === 0}
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep((current) => Math.min(3, current + 1) as WizardStep)}
                className="cfsp-btn cfsp-btn-secondary"
                disabled={step === 3}
              >
                Next
              </button>
            </div>

            <div className="flex gap-2">
              <Link href="/events" className="cfsp-btn cfsp-btn-secondary">
                Cancel
              </Link>
              <button type="submit" disabled={saving || step !== 3} className="cfsp-btn cfsp-btn-primary">
                {saving ? "Creating..." : "Create Event"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </SiteShell>
  );
}
