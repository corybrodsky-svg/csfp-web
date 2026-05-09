"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../../components/SiteShell";

type EventType = "sp" | "skills" | "training" | "virtual" | "hifi";
type WizardStep = 0 | 1 | 2 | 3;
type TrainingRequirement = "yes" | "no" | "tbd";
type TrainingOwnership = "faculty_led" | "internal_sim" | "shared" | "tbd";

type GeneratedSession = {
  session_date: string;
  start_time: string;
  end_time: string;
  room: string | null;
  location: string | null;
};

type RotationRound = {
  roundNumber: number;
  session_date: string;
  start_time: string;
  end_time: string;
  roomCount: number;
  learnerStart: number | null;
  learnerEnd: number | null;
};

const EVENT_TYPE_OPTIONS: Array<{ value: EventType; label: string }> = [
  { value: "sp", label: "SP Event" },
  { value: "skills", label: "Skills" },
  { value: "training", label: "Training" },
  { value: "virtual", label: "Virtual / VIR" },
  { value: "hifi", label: "Hi-Fi" },
];

const STEP_TITLES = ["Event Info", "Schedule Builder", "Staffing Needs", "Review & Create"] as const;

const TRAINING_REQUIREMENT_OPTIONS: Array<{ value: TrainingRequirement; label: string }> = [
  { value: "tbd", label: "TBD" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const TRAINING_OWNERSHIP_OPTIONS: Array<{ value: TrainingOwnership; label: string; detail: string }> = [
  { value: "faculty_led", label: "Faculty-led training", detail: "Faculty owns SP prep content and timing." },
  { value: "internal_sim", label: "Internal sim team training", detail: "Sim Ops owns SP prep and logistics." },
  { value: "shared", label: "Shared/co-led training", detail: "Faculty and Sim Ops coordinate together." },
  { value: "tbd", label: "TBD", detail: "Ownership still needs confirmation." },
];

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

function displayStoredTime(value: string) {
  return toDisplayTime(toMinutes(value) || 0);
}

function getTrainingRequirementLabel(value: TrainingRequirement) {
  return TRAINING_REQUIREMENT_OPTIONS.find((option) => option.value === value)?.label || "TBD";
}

function getTrainingOwnershipLabel(value: TrainingOwnership) {
  return TRAINING_OWNERSHIP_OPTIONS.find((option) => option.value === value)?.label || "TBD";
}

function boolText(value: boolean) {
  return value ? "yes" : "no";
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
    return Array.from({ length: Math.max(roomCount, 1) }, (_, index) => `Exam Room ${index + 1}`);
  }

  const next = [...parsed];
  while (next.length < roomCount) {
    next.push(`Exam Room ${next.length + 1}`);
  }
  return next.slice(0, Math.max(roomCount, 1));
}

function countRoundsThatFit(args: {
  dates: string[];
  startTime: string;
  endTime: string;
  sessionLengthMinutes: number;
  feedbackLengthMinutes: number;
}) {
  const startMinutes = toMinutes(args.startTime);
  const endMinutes = toMinutes(args.endTime);
  if (startMinutes === null || endMinutes === null) return 0;
  if (endMinutes <= startMinutes) return 0;
  if (args.sessionLengthMinutes <= 0) return 0;

  let total = 0;

  args.dates.forEach(() => {
    let currentStart = startMinutes;
    while (currentStart + args.sessionLengthMinutes <= endMinutes) {
      total += 1;
      currentStart = currentStart + args.sessionLengthMinutes + args.feedbackLengthMinutes;
    }
  });

  return total;
}

function buildRotationRounds(args: {
  dates: string[];
  startTime: string;
  endTime: string;
  sessionLengthMinutes: number;
  feedbackLengthMinutes: number;
  roomCount: number;
  studentCount: number;
}) {
  const startMinutes = toMinutes(args.startTime);
  const endMinutes = toMinutes(args.endTime);
  if (startMinutes === null || endMinutes === null) return [];
  if (endMinutes <= startMinutes) return [];
  if (args.sessionLengthMinutes <= 0) return [];
  if (args.roomCount <= 0) return [];

  const roundsNeeded = args.studentCount > 0 ? Math.ceil(args.studentCount / args.roomCount) : 0;
  const rounds: RotationRound[] = [];

  args.dates.forEach((date) => {
    let currentStart = startMinutes;

    while (currentStart + args.sessionLengthMinutes <= endMinutes) {
      if (roundsNeeded > 0 && rounds.length >= roundsNeeded) break;

      const currentEnd = currentStart + args.sessionLengthMinutes;
      const roundNumber = rounds.length + 1;
      const learnerStart = args.studentCount > 0 ? (roundNumber - 1) * args.roomCount + 1 : null;
      const learnerEnd =
        args.studentCount > 0 && learnerStart !== null
          ? Math.min(roundNumber * args.roomCount, args.studentCount)
          : null;

      rounds.push({
        roundNumber,
        session_date: date,
        start_time: toTimeString(currentStart),
        end_time: toTimeString(currentEnd),
        roomCount: args.roomCount,
        learnerStart,
        learnerEnd,
      });

      currentStart = currentEnd + args.feedbackLengthMinutes;
    }
  });

  return rounds;
}

function buildGeneratedSessions(args: {
  rounds: RotationRound[];
  roomNames: string[];
  location: string;
}) {
  const sessions: GeneratedSession[] = [];

  args.rounds.forEach((round) => {
    args.roomNames.forEach((room) => {
      sessions.push({
        session_date: round.session_date,
        start_time: round.start_time,
        end_time: round.end_time,
        room,
        location: asText(args.location) || null,
      });
    });
  });

  return sessions;
}

function formatRoundPreview(round: RotationRound) {
  const learnerLabel =
    round.learnerStart && round.learnerEnd
      ? ` · Learners ${round.learnerStart}-${round.learnerEnd}`
      : "";

  return `Round ${round.roundNumber} · ${round.session_date} · ${displayStoredTime(round.start_time)} - ${displayStoredTime(round.end_time)} · ${round.roomCount} room${round.roomCount === 1 ? "" : "s"}${learnerLabel}`;
}

function buildNotes(args: {
  eventType: EventType;
  eventLeadTeam: string;
  simStaff: string;
  courseFaculty: string;
  trainingRequirement: TrainingRequirement;
  trainingOwnership: TrainingOwnership;
  preferredTrainingDate: string;
  preferredTrainingTime: string;
  preferredTrainingEndTime: string;
  facultyAvailabilityUnknown: boolean;
  trainingZoomRequired: boolean;
  trainingRecordingPlanned: boolean;
  requestFacultyAvailability: boolean;
  trainingNotes: string;
  studentCount: string;
  notes: string;
  sessionLength: string;
  feedbackLength: string;
  roomNames: string[];
  roomCount: number;
  rotationsNeeded: number;
  generatedRotationRounds: number;
  generatedRoomSlots: number;
}) {
  const trainingMetadataLines = [
    "[CFSP_TRAINING_METADATA]",
    `training_required: ${args.trainingRequirement}`,
    args.trainingRequirement === "yes" ? `training_ownership: ${args.trainingOwnership}` : "",
    args.trainingRequirement === "yes" ? `training_scheduling_status: ${args.preferredTrainingDate || args.preferredTrainingTime || args.preferredTrainingEndTime ? "planned" : "not_scheduled"}` : "",
    args.preferredTrainingDate ? `preferred_training_date: ${args.preferredTrainingDate}` : "",
    args.preferredTrainingTime ? `preferred_training_time: ${args.preferredTrainingTime}` : "",
    args.preferredTrainingEndTime ? `preferred_training_end_time: ${args.preferredTrainingEndTime}` : "",
    args.trainingRequirement === "yes" ? `faculty_availability_unknown: ${boolText(args.facultyAvailabilityUnknown)}` : "",
    args.trainingRequirement === "yes" ? `training_zoom_required: ${boolText(args.trainingZoomRequired)}` : "",
    args.trainingRequirement === "yes" ? `training_recording_planned: ${boolText(args.trainingRecordingPlanned)}` : "",
    args.requestFacultyAvailability ? "faculty_training_coordination_requested: yes" : "",
    args.requestFacultyAvailability ? "faculty_training_coordination_status: requested" : "",
    args.courseFaculty ? `faculty_names: ${args.courseFaculty}` : "",
    (args.eventLeadTeam || args.simStaff)
      ? `sim_contact: ${args.eventLeadTeam || args.simStaff}`
      : "",
    args.trainingNotes ? `training_notes: ${args.trainingNotes}` : "",
    "[/CFSP_TRAINING_METADATA]",
  ]
    .filter(Boolean)
    .join("\n");

  const lines = [
    `Event Type: ${EVENT_TYPE_OPTIONS.find((option) => option.value === args.eventType)?.label || "SP Event"}`,
    args.eventLeadTeam ? `Event Lead/Team: ${args.eventLeadTeam}` : "",
    args.simStaff ? `Sim Staff: ${args.simStaff}` : "",
    args.courseFaculty ? `Course Faculty: ${args.courseFaculty}` : "",
    `SP Training Required: ${getTrainingRequirementLabel(args.trainingRequirement)}`,
    args.trainingRequirement === "yes" ? `SP Training Ownership: ${getTrainingOwnershipLabel(args.trainingOwnership)}` : "",
    args.preferredTrainingDate ? `Preferred Training Date: ${args.preferredTrainingDate}` : "",
    args.preferredTrainingTime ? `Preferred Training Time: ${args.preferredTrainingTime}` : "",
    args.preferredTrainingEndTime ? `Preferred Training End Time: ${args.preferredTrainingEndTime}` : "",
    args.trainingRequirement === "yes" && args.facultyAvailabilityUnknown ? "Faculty Availability: Unknown" : "",
    args.trainingRequirement === "yes" && args.trainingZoomRequired ? "Training Zoom Required: Yes" : "",
    args.trainingRequirement === "yes" && args.trainingRecordingPlanned ? "Training Recording Planned: Yes" : "",
    args.requestFacultyAvailability ? "Faculty Training Coordination: Request faculty availability" : "",
    args.trainingNotes ? `Training Notes: ${args.trainingNotes}` : "",
    `Student Count: ${args.studentCount || "Uncapped preview"}`,
    `Rotation Rounds Needed: ${args.studentCount ? String(args.rotationsNeeded) : "Uncapped preview"}`,
    `Generated Rotation Rounds: ${args.generatedRotationRounds}`,
    `Room Slots Generated: ${args.generatedRoomSlots}`,
    args.sessionLength ? `Session Length: ${args.sessionLength} minutes` : "",
    args.feedbackLength ? `Feedback / Break Length: ${args.feedbackLength} minutes` : "",
    `Rooms: ${args.roomCount}`,
    args.roomNames.length ? `Rooms: ${args.roomNames.join(", ")}` : "",
    args.notes,
    trainingMetadataLines,
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
  const [trainingRequirement, setTrainingRequirement] = useState<TrainingRequirement>("tbd");
  const [trainingOwnership, setTrainingOwnership] = useState<TrainingOwnership>("tbd");
  const [preferredTrainingDate, setPreferredTrainingDate] = useState("");
  const [preferredTrainingTime, setPreferredTrainingTime] = useState("");
  const [preferredTrainingEndTime, setPreferredTrainingEndTime] = useState("");
  const [facultyAvailabilityUnknown, setFacultyAvailabilityUnknown] = useState(false);
  const [trainingZoomRequired, setTrainingZoomRequired] = useState(false);
  const [trainingRecordingPlanned, setTrainingRecordingPlanned] = useState(false);
  const [requestFacultyAvailability, setRequestFacultyAvailability] = useState(false);
  const [trainingNotes, setTrainingNotes] = useState("");

  const [dateList, setDateList] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("12:00");
  const [sessionLength, setSessionLength] = useState("25");
  const [feedbackLength, setFeedbackLength] = useState("10");
  const [roomCount, setRoomCount] = useState("1");
  const [roomNames, setRoomNames] = useState("");
  const [studentCount, setStudentCount] = useState("");
  const [spNeededOverride, setSpNeededOverride] = useState("");

  const parsedDates = useMemo(() => parseDateList(dateList), [dateList]);
  const parsedRoomCount = parseNumber(roomCount) || 1;
  const parsedStudentCount = parseNumber(studentCount);
  const normalizedRoomNames = useMemo(
    () => parseRoomNames(roomNames, parsedRoomCount),
    [parsedRoomCount, roomNames]
  );
  const sessionLengthMinutes = parseNumber(sessionLength);
  const feedbackLengthMinutes = parseNumber(feedbackLength);
  const rotationsNeeded =
    parsedStudentCount > 0 && parsedRoomCount > 0
      ? Math.ceil(parsedStudentCount / parsedRoomCount)
      : 0;
  const maxRoundsThatFit = useMemo(
    () =>
      countRoundsThatFit({
        dates: parsedDates,
        startTime,
        endTime,
        sessionLengthMinutes,
        feedbackLengthMinutes,
      }),
    [endTime, feedbackLengthMinutes, parsedDates, sessionLengthMinutes, startTime]
  );
  const calculatedSpNeeded = eventType === "skills" ? 0 : parsedRoomCount;
  const trainingRequired = trainingRequirement === "yes";
  const facultyTrainingCoordinationRelevant =
    trainingRequired && (trainingOwnership === "faculty_led" || trainingOwnership === "shared");
  const facultyAvailabilityRequestPlanned = facultyTrainingCoordinationRelevant && requestFacultyAvailability;
  const parsedSpNeeded =
    eventType === "skills"
      ? 0
      : asText(spNeededOverride)
        ? parseNumber(spNeededOverride)
        : calculatedSpNeeded;

  const rotationRounds = useMemo(
    () =>
      buildRotationRounds({
        dates: parsedDates,
        startTime,
        endTime,
        sessionLengthMinutes,
        feedbackLengthMinutes,
        roomCount: parsedRoomCount,
        studentCount: parsedStudentCount,
      }),
    [endTime, feedbackLengthMinutes, parsedDates, parsedRoomCount, parsedStudentCount, sessionLengthMinutes, startTime]
  );

  const generatedSessions = useMemo(
    () =>
      buildGeneratedSessions({
        rounds: rotationRounds,
        roomNames: normalizedRoomNames,
        location,
      }),
    [location, normalizedRoomNames, rotationRounds]
  );

  const availableRoundCapacity = rotationRounds.length * parsedRoomCount;
  const servedStudents = parsedStudentCount > 0 ? Math.min(parsedStudentCount, availableRoundCapacity) : 0;
  const emptyRoomSlotsInFinalRound =
    parsedStudentCount > 0 && rotationRounds.length > 0
      ? Math.max(0, availableRoundCapacity - servedStudents)
      : 0;
  const totalSpCoverageNeeded = eventType === "skills" || parsedSpNeeded <= 0 ? 0 : rotationRounds.length * parsedSpNeeded;
  const dateText = parsedDates.join(", ");
  const compiledNotes = buildNotes({
    eventType,
    eventLeadTeam,
    simStaff,
    courseFaculty,
    trainingRequirement,
    trainingOwnership,
    preferredTrainingDate,
    preferredTrainingTime,
    preferredTrainingEndTime,
    facultyAvailabilityUnknown,
    trainingZoomRequired,
    trainingRecordingPlanned,
    requestFacultyAvailability: facultyAvailabilityRequestPlanned,
    trainingNotes,
    studentCount,
    notes,
    sessionLength,
    feedbackLength,
    roomCount: parsedRoomCount,
    roomNames: normalizedRoomNames,
    rotationsNeeded,
    generatedRotationRounds: rotationRounds.length,
    generatedRoomSlots: generatedSessions.length,
  });

  const warnings = useMemo(() => {
    const next: string[] = [];
    if (!asText(name)) next.push("Event name is required.");
    if (!parsedDates.length) next.push("At least one event date is required.");
    if (!startTime || !endTime) next.push("Start and end times are required.");
    if (!rotationRounds.length) next.push("Schedule builder could not generate any rotation rounds.");
    if (parsedStudentCount <= 0) {
      next.push("Student count is blank, so this schedule is shown as an uncapped preview based on the time window.");
    }
    if (rotationsNeeded > 0 && rotationRounds.length < rotationsNeeded) {
      next.push(`Time window only fits ${rotationRounds.length} of ${rotationsNeeded} needed rotations.`);
    }
    if (parsedStudentCount > 0 && availableRoundCapacity < parsedStudentCount) {
      next.push(`Only ${availableRoundCapacity} learner slots fit in the current schedule. Increase time, reduce feedback, or add rooms.`);
    }
    if (eventType !== "skills" && parsedSpNeeded <= 0) next.push("SP staffing is set to 0. This event will behave as no-SP-required.");
    if (!asText(simStaff) && !asText(eventLeadTeam)) next.push("Add sim staff or event lead/team so ownership is visible.");
    if (trainingRequirement === "yes" && trainingOwnership === "tbd") next.push("SP training is marked Yes, but training ownership is still TBD.");
    if (facultyTrainingCoordinationRelevant && facultyAvailabilityUnknown && !facultyAvailabilityRequestPlanned) {
      next.push("Faculty-led/co-led training has unknown faculty availability. Consider requesting faculty availability before staffing locks.");
    }
    if (trainingRequirement === "yes" && trainingZoomRequired && !preferredTrainingDate) {
      next.push("Zoom is marked needed for training; add a preferred training date when available.");
    }
    return next;
  }, [
    availableRoundCapacity,
    endTime,
    eventLeadTeam,
    eventType,
    facultyAvailabilityUnknown,
    facultyAvailabilityRequestPlanned,
    facultyTrainingCoordinationRelevant,
    name,
    parsedDates.length,
    parsedSpNeeded,
    parsedStudentCount,
    preferredTrainingDate,
    rotationRounds.length,
    rotationsNeeded,
    simStaff,
    startTime,
    trainingOwnership,
    trainingRequirement,
    trainingZoomRequired,
  ]);

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
      subtitle="Use the guided intake flow to build rotation rounds, set staffing needs, and create a ready-to-run event."
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
                  Enter the student count, rooms, and timing rules. CFSP calculates learner rotation rounds automatically.
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
                  <span className="cfsp-label">Student Count</span>
                  <input className="cfsp-input" type="number" min={1} value={studentCount} onChange={(e) => setStudentCount(e.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Number of Rooms</span>
                  <input className="cfsp-input" type="number" min={1} value={roomCount} onChange={(e) => setRoomCount(e.target.value)} />
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
                  <span className="cfsp-label">Encounter Length (minutes)</span>
                  <input className="cfsp-input" type="number" min={5} step={5} value={sessionLength} onChange={(e) => setSessionLength(e.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Feedback / Transition Length (minutes)</span>
                  <input className="cfsp-input" type="number" min={0} step={5} value={feedbackLength} onChange={(e) => setFeedbackLength(e.target.value)} />
                </label>
                <label className="grid gap-2 md:col-span-2">
                  <span className="cfsp-label">Room Names</span>
                  <textarea
                    className="cfsp-input"
                    style={{ minHeight: 88, resize: "vertical" }}
                    value={roomNames}
                    onChange={(e) => setRoomNames(e.target.value)}
                    placeholder={"Exam Room 1\nExam Room 2"}
                  />
                </label>
              </div>

              <div className="cfsp-alert cfsp-alert-info">
                {parsedStudentCount > 0
                  ? `CFSP needs ${rotationsNeeded || 0} learner rotation round${rotationsNeeded === 1 ? "" : "s"} for ${parsedStudentCount} students, generated ${rotationRounds.length || 0}, and will store ${generatedSessions.length || 0} room-slot record${generatedSessions.length === 1 ? "" : "s"}.`
                  : `Student count is blank, so CFSP is showing an uncapped time-window preview with ${rotationRounds.length || 0} learner rotation round${rotationRounds.length === 1 ? "" : "s"} and ${generatedSessions.length || 0} stored room-slot record${generatedSessions.length === 1 ? "" : "s"}.`}
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="cfsp-panel grid gap-4">
              <div>
                <h2 className="m-0 text-[1.35rem] font-black text-[#14304f]">Staffing Needs</h2>
                <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                  CFSP estimates SP staffing from the number of rooms. Adjust only if this event needs a different staffing pattern.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="cfsp-label">Calculated SPs Needed</span>
                  <input className="cfsp-input" value={calculatedSpNeeded} disabled />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Adjust SP Count (Optional)</span>
                  <input
                    className="cfsp-input"
                    type="number"
                    min={0}
                    value={eventType === "skills" ? "0" : spNeededOverride}
                    onChange={(e) => setSpNeededOverride(e.target.value)}
                    disabled={eventType === "skills"}
                    placeholder={String(calculatedSpNeeded)}
                  />
                </label>
              </div>

              <section className="rounded-[14px] border border-[#b7dce8] bg-[linear-gradient(180deg,#f8fdff_0%,#eef8fb_100%)] px-4 py-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="m-0 text-[1.05rem] font-black text-[#14304f]">Training Planning</h3>
                    <p className="mt-1 mb-0 text-sm font-semibold leading-6 text-[#5e7388]">
                      Capture SP training intent early so ownership, faculty coordination, Zoom, and recording needs are visible after creation.
                    </p>
                  </div>
                  <span className="inline-flex rounded-full border border-[#99d8e9] bg-white/80 px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-[#1d5f83]">
                    SP readiness
                  </span>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <label className="grid gap-2">
                    <span className="cfsp-label">Does this event require SP training?</span>
                    <select className="cfsp-input" value={trainingRequirement} onChange={(e) => setTrainingRequirement(e.target.value as TrainingRequirement)}>
                      {TRAINING_REQUIREMENT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2">
                    <span className="cfsp-label">Training ownership</span>
                    <select
                      className="cfsp-input"
                      value={trainingOwnership}
                      onChange={(e) => setTrainingOwnership(e.target.value as TrainingOwnership)}
                      disabled={!trainingRequired}
                    >
                      {TRAINING_OWNERSHIP_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="rounded-[12px] border border-[#dce6ee] bg-white/80 px-3 py-3 text-sm font-semibold leading-6 text-[#14304f]">
                    {trainingRequired
                      ? TRAINING_OWNERSHIP_OPTIONS.find((option) => option.value === trainingOwnership)?.detail || "Training ownership still needs confirmation."
                      : trainingRequirement === "no"
                        ? "Training will be marked not required for this event."
                        : "Training requirement will remain TBD until operations confirm it."}
                  </div>

                  <label className="grid gap-2">
                    <span className="cfsp-label">Preferred training date</span>
                    <input
                      className="cfsp-input"
                      type="date"
                      value={preferredTrainingDate}
                      onChange={(e) => setPreferredTrainingDate(e.target.value)}
                      disabled={!trainingRequired}
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="cfsp-label">Preferred training start time</span>
                    <input
                      className="cfsp-input"
                      type="time"
                      value={preferredTrainingTime}
                      onChange={(e) => setPreferredTrainingTime(e.target.value)}
                      disabled={!trainingRequired}
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="cfsp-label">Preferred training end time</span>
                    <input
                      className="cfsp-input"
                      type="time"
                      value={preferredTrainingEndTime}
                      onChange={(e) => setPreferredTrainingEndTime(e.target.value)}
                      disabled={!trainingRequired}
                    />
                  </label>

                  <div className="grid gap-2 rounded-[12px] border border-[#dce6ee] bg-white/80 px-3 py-3">
                    {[
                      {
                        id: "faculty-availability",
                        label: "Faculty availability unknown",
                        checked: facultyAvailabilityUnknown,
                        onChange: setFacultyAvailabilityUnknown,
                        disabled: !trainingRequired,
                      },
                      {
                        id: "training-zoom",
                        label: "Zoom required",
                        checked: trainingZoomRequired,
                        onChange: setTrainingZoomRequired,
                        disabled: !trainingRequired,
                      },
                      {
                        id: "training-recording",
                        label: "Recording planned",
                        checked: trainingRecordingPlanned,
                        onChange: setTrainingRecordingPlanned,
                        disabled: !trainingRequired,
                      },
                    ].map((option) => (
                      <label key={option.id} className="flex items-center gap-2 text-sm font-bold text-[#14304f]">
                        <input
                          type="checkbox"
                          checked={option.checked}
                          onChange={(e) => option.onChange(e.target.checked)}
                          disabled={option.disabled}
                          className="h-4 w-4 accent-[#0f766e]"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>

                  {facultyTrainingCoordinationRelevant ? (
                    <label className="flex items-center gap-2 rounded-[12px] border border-[#f2d48b] bg-[#fffbeb] px-3 py-3 text-sm font-bold text-[#8a5a13] md:col-span-3">
                      <input
                        type="checkbox"
                        checked={requestFacultyAvailability}
                        onChange={(e) => setRequestFacultyAvailability(e.target.checked)}
                        className="h-4 w-4 accent-[#b45309]"
                      />
                      Request faculty availability for SP training after event creation
                    </label>
                  ) : null}

                  <label className="grid gap-2 md:col-span-3">
                    <span className="cfsp-label">Training notes</span>
                    <textarea
                      className="cfsp-input"
                      style={{ minHeight: 92, resize: "vertical" }}
                      value={trainingNotes}
                      onChange={(e) => setTrainingNotes(e.target.value)}
                      disabled={!trainingRequired && trainingRequirement !== "tbd"}
                      placeholder="Faculty constraints, prep ownership, tentative windows, Zoom/recording requirements..."
                    />
                  </label>
                </div>
              </section>

              <div className={`cfsp-alert ${eventType === "skills" || parsedSpNeeded <= 0 ? "cfsp-alert-info" : "cfsp-alert-success"}`}>
                {eventType === "skills" || parsedSpNeeded <= 0
                  ? "No SP staffing required. This event will suppress SP assignment workflow after creation."
                  : `Projected total SP coverage needed: ${totalSpCoverageNeeded} SP round-blocks.`}
                {eventType !== "skills" ? " SP count is per concurrent rotation, not total room-slot coverage." : ""}
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="cfsp-panel grid gap-4">
              <div>
                <h2 className="m-0 text-[1.35rem] font-black text-[#14304f]">Review & Create</h2>
                <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                  Review the learner rounds, room usage, staffing need, and team details before saving.
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
                  <div className="cfsp-label">Student Count</div>
                  <div className="cfsp-stat-value">{parsedStudentCount || "—"}</div>
                </div>
                <div className="cfsp-stat-card">
                  <div className="cfsp-label">Rooms</div>
                  <div className="cfsp-stat-value">{normalizedRoomNames.length}</div>
                </div>
                <div className="cfsp-stat-card">
                  <div className="cfsp-label">Rotations Needed</div>
                  <div className="cfsp-stat-value">{parsedStudentCount > 0 ? rotationsNeeded : "Uncapped"}</div>
                </div>
                <div className="cfsp-stat-card">
                  <div className="cfsp-label">Generated Rotations</div>
                  <div className="cfsp-stat-value">{rotationRounds.length}</div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="cfsp-stat-card">
                  <div className="cfsp-label">Generated Room Slots</div>
                  <div className="cfsp-stat-value">{generatedSessions.length}</div>
                </div>
                <div className="cfsp-stat-card">
                  <div className="cfsp-label">Empty Room Slots In Final Round</div>
                  <div className="cfsp-stat-value">{parsedStudentCount > 0 ? emptyRoomSlotsInFinalRound : "—"}</div>
                </div>
                <div className="cfsp-stat-card">
                  <div className="cfsp-label">SP Coverage</div>
                  <div className="cfsp-stat-value">{eventType === "skills" || parsedSpNeeded <= 0 ? "None" : totalSpCoverageNeeded}</div>
                </div>
                <div className="cfsp-stat-card">
                  <div className="cfsp-label">Training Plan</div>
                  <div className="cfsp-stat-value text-[1.35rem]">{getTrainingRequirementLabel(trainingRequirement)}</div>
                  <div className="mt-1 text-sm font-bold text-[#5e7388]">
                    {trainingRequirement === "yes" ? getTrainingOwnershipLabel(trainingOwnership) : "Ownership not required yet"}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-4">
                  <div className="cfsp-label">Rotation Rounds</div>
                  <div className="mt-3 grid gap-2">
                    {rotationRounds.length ? (
                      rotationRounds.slice(0, 18).map((round) => (
                        <div key={`${round.session_date}-${round.start_time}-${round.roundNumber}`} className="rounded-[10px] border border-[#dce6ee] bg-white px-3 py-3 text-sm font-semibold text-[#14304f]">
                          {formatRoundPreview(round)}
                        </div>
                      ))
                    ) : (
                      <div className="text-sm font-semibold text-[#6a7e91]">No rotation rounds generated yet.</div>
                    )}
                    {rotationRounds.length > 18 ? (
                      <div className="text-sm font-semibold text-[#6a7e91]">
                        Showing first 18 of {rotationRounds.length} learner rotation rounds.
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
                    <div><strong>Student Count:</strong> {parsedStudentCount || "Not set"}</div>
                    <div><strong>Rooms:</strong> {normalizedRoomNames.length}</div>
                    <div><strong>Rotations Needed:</strong> {parsedStudentCount > 0 ? rotationsNeeded : `Uncapped preview (${maxRoundsThatFit})`}</div>
                    <div><strong>Generated Rotations:</strong> {rotationRounds.length}</div>
                    <div><strong>Generated Room Slots:</strong> {generatedSessions.length}</div>
                    <div><strong>Empty Room Slots In Final Round:</strong> {parsedStudentCount > 0 ? emptyRoomSlotsInFinalRound : "—"}</div>
                    <div><strong>SPs Needed:</strong> {eventType === "skills" ? "No SPs required" : parsedSpNeeded}</div>
                    <div><strong>SP Training:</strong> {getTrainingRequirementLabel(trainingRequirement)}</div>
                    {trainingRequirement === "yes" ? (
                      <>
                        <div><strong>Training Ownership:</strong> {getTrainingOwnershipLabel(trainingOwnership)}</div>
                        <div>
                          <strong>Preferred Training:</strong>{" "}
                          {[
                            preferredTrainingDate,
                            [preferredTrainingTime, preferredTrainingEndTime].filter(Boolean).join(" - "),
                          ].filter(Boolean).join(" · ") || "Not scheduled"}
                        </div>
                        <div><strong>Training Logistics:</strong> {[trainingZoomRequired ? "Zoom required" : "", trainingRecordingPlanned ? "Recording planned" : "", facultyAvailabilityUnknown ? "Faculty availability unknown" : ""].filter(Boolean).join(" · ") || "No extra logistics marked"}</div>
                        {facultyAvailabilityRequestPlanned ? <div><strong>Faculty Coordination:</strong> Request availability after creation</div> : null}
                      </>
                    ) : null}
                    <div><strong>Room Names:</strong> {normalizedRoomNames.join(", ")}</div>
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
              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => setStep((current) => Math.min(3, current + 1) as WizardStep)}
                  className="cfsp-btn cfsp-btn-secondary"
                >
                  Next
                </button>
              ) : (
                <button type="button" className="cfsp-btn cfsp-btn-secondary" disabled>
                  Ready to Create
                </button>
              )}
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
