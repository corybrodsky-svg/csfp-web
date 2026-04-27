"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../components/SiteShell";
import { formatHumanDate, getImportedYearHint } from "../lib/eventDateUtils";

type EventRow = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  location: string | null;
  sp_needed: number | null;
  notes: string | null;
  earliest_session_date?: string | null;
  assigned_sp_names?: string[] | null;
  total_assignments?: number | null;
  confirmed_assignments?: number | null;
};

type EventsResponse = {
  events?: EventRow[];
  error?: string;
};

type TimelineBlock = {
  label: string;
  start: number;
  end: number;
  detail?: string;
  tone: "setup" | "prebrief" | "rotation" | "wrap";
};

type RoundSubBlock = {
  label: string;
  start: number;
  end: number;
};

type GeneratedRoomSlot = {
  roomName: string;
  roomType: "exam" | "flex";
  capacityLabel: string;
};

type GeneratedRound = {
  round: number;
  start: number;
  end: number;
  roomSlots: GeneratedRoomSlot[];
  subBlocks: RoundSubBlock[];
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseNumber(value: string, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function toMinutes(value: string) {
  const [hoursText, minutesText] = asText(value).split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function toDisplayTime(totalMinutes: number) {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const twelveHour = hours % 12 || 12;
  return `${twelveHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function formatRange(start: number, end: number) {
  return `${toDisplayTime(start)} - ${toDisplayTime(end)}`;
}

function formatEventDate(event: EventRow) {
  const dateSource = event.earliest_session_date || event.date_text;
  if (!dateSource) return "Date TBD";
  return formatHumanDate(dateSource, getImportedYearHint(event.notes)) || dateSource;
}

function getAssignedNames(event: EventRow) {
  return (event.assigned_sp_names || []).filter(Boolean);
}

function getToneStyles(tone: TimelineBlock["tone"]) {
  if (tone === "setup") return { background: "#edf5fb", border: "#c7dcee", color: "#165a96" };
  if (tone === "prebrief") return { background: "#eefbf6", border: "#bfe4d6", color: "#196b57" };
  if (tone === "wrap") return { background: "#fff6e8", border: "#f1d1a7", color: "#a86411" };
  return { background: "#f4f7fb", border: "#d6e0e8", color: "#4f677d" };
}

function buildRounds(args: {
  startMinutes: number;
  rounds: number;
  sessionLengthMinutes: number;
  examRoomCount: number;
  flexRoomCount: number;
  maxPairsPerFlexRoom: number;
  encounterMinutes: number;
  includeChecklist: boolean;
  checklistMinutes: number;
  includeSoap: boolean;
  soapMinutes: number;
  includeFeedback: boolean;
  feedbackMinutes: number;
  transitionMinutes: number;
}) {
  const blockDurations = [
    { label: "Encounter", minutes: args.encounterMinutes, enabled: true },
    { label: "Checklist", minutes: args.checklistMinutes, enabled: args.includeChecklist && args.checklistMinutes > 0 },
    { label: "SOAP Note", minutes: args.soapMinutes, enabled: args.includeSoap && args.soapMinutes > 0 },
    { label: "Feedback", minutes: args.feedbackMinutes, enabled: args.includeFeedback && args.feedbackMinutes > 0 },
    { label: "Transition", minutes: args.transitionMinutes, enabled: args.transitionMinutes > 0 },
  ].filter((item) => item.enabled && item.minutes > 0);

  const configuredLength = blockDurations.reduce((sum, item) => sum + item.minutes, 0);
  const sessionLengthMinutes = Math.max(1, args.sessionLengthMinutes);
  const roundLength = Math.max(configuredLength, sessionLengthMinutes);
  const bufferMinutes = Math.max(sessionLengthMinutes - configuredLength, 0);
  const overrunMinutes = Math.max(configuredLength - sessionLengthMinutes, 0);
  const rounds: GeneratedRound[] = [];
  let roundStart = args.startMinutes;

  for (let roundIndex = 0; roundIndex < args.rounds; roundIndex += 1) {
    const subBlocks: RoundSubBlock[] = [];
    let current = roundStart;

    for (const block of blockDurations) {
      subBlocks.push({
        label: block.label,
        start: current,
        end: current + block.minutes,
      });
      current += block.minutes;
    }

    if (bufferMinutes > 0) {
      subBlocks.push({
        label: "Open Buffer",
        start: current,
        end: current + bufferMinutes,
      });
      current += bufferMinutes;
    }

    const examSlots: GeneratedRoomSlot[] = Array.from({ length: args.examRoomCount }, (_, index) => ({
      roomName: `Exam ${index + 1}`,
      roomType: "exam",
      capacityLabel: "1 pair",
    }));

    const flexSlots: GeneratedRoomSlot[] = Array.from({ length: args.flexRoomCount }, (_, index) => ({
      roomName: `Flex ${index + 1}`,
      roomType: "flex",
      capacityLabel: `Up to ${args.maxPairsPerFlexRoom} pairs`,
    }));

    rounds.push({
      round: roundIndex + 1,
      start: roundStart,
      end: roundStart + roundLength,
      roomSlots: [...examSlots, ...flexSlots],
      subBlocks,
    });

    roundStart += roundLength;
  }

  return { rounds, roundLength, configuredLength, bufferMinutes, overrunMinutes };
}

function buildPlaintextPreview(args: {
  event: EventRow | null;
  timeline: TimelineBlock[];
  rounds: GeneratedRound[];
}) {
  const lines: string[] = [];

  if (args.event) {
    lines.push(`Event: ${args.event.name || "Untitled Event"}`);
    lines.push(`Date: ${formatEventDate(args.event)}`);
    lines.push(`Location: ${args.event.location || "TBD"}`);
    lines.push(`SP Coverage: ${Number(args.event.confirmed_assignments || 0)} / ${Number(args.event.sp_needed || 0)}`);
    lines.push("");
  }

  lines.push("DAY TIMELINE");
  args.timeline.forEach((block) => {
    lines.push(`- ${block.label}: ${formatRange(block.start, block.end)}${block.detail ? ` (${block.detail})` : ""}`);
  });
  lines.push("");
  lines.push("ROOM ROTATION");

  args.rounds.forEach((round) => {
    lines.push(`Round ${round.round}: ${formatRange(round.start, round.end)}`);
    round.subBlocks.forEach((subBlock) => {
      lines.push(`  ${subBlock.label}: ${formatRange(subBlock.start, subBlock.end)}`);
    });
    round.roomSlots.forEach((slot) => {
      lines.push(`  ${slot.roomName} (${slot.roomType === "exam" ? "Exam" : "Flex"}): ${slot.capacityLabel}`);
    });
  });

  return lines.join("\n");
}

export default function ScheduleBuilderPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  const [startTime, setStartTime] = useState("08:10");
  const [staffArrivalTime, setStaffArrivalTime] = useState("07:25");
  const [spArrivalTime, setSpArrivalTime] = useState("07:35");
  const [facultyArrivalTime, setFacultyArrivalTime] = useState("07:40");
  const [roomSetupMinutes, setRoomSetupMinutes] = useState("20");

  const [studentPrebriefMinutes, setStudentPrebriefMinutes] = useState("20");
  const [spPrebriefMinutes, setSpPrebriefMinutes] = useState("15");
  const [facultyPrebriefMinutes, setFacultyPrebriefMinutes] = useState("10");

  const [sessionLengthMinutes, setSessionLengthMinutes] = useState("50");
  const [roundCount, setRoundCount] = useState("4");
  const [examRoomCount, setExamRoomCount] = useState("4");
  const [flexRoomCount, setFlexRoomCount] = useState("1");
  const [maxPairsPerFlexRoom, setMaxPairsPerFlexRoom] = useState("3");
  const [encounterMinutes, setEncounterMinutes] = useState("20");
  const [checklistMinutes, setChecklistMinutes] = useState("5");
  const [soapMinutes, setSoapMinutes] = useState("10");
  const [feedbackMinutes, setFeedbackMinutes] = useState("10");
  const [transitionMinutes, setTransitionMinutes] = useState("5");

  const [includeChecklist, setIncludeChecklist] = useState(true);
  const [includeSoap, setIncludeSoap] = useState(true);
  const [includeFeedback, setIncludeFeedback] = useState(true);
  const [includeDebrief, setIncludeDebrief] = useState(true);
  const [includeBreakdown, setIncludeBreakdown] = useState(true);

  const [debriefMinutes, setDebriefMinutes] = useState("20");
  const [breakdownMinutes, setBreakdownMinutes] = useState("20");

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      setLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch("/api/events", {
          cache: "no-store",
          credentials: "include",
        });

        if (cancelled) return;

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        const body = (await response.json().catch(() => null)) as EventsResponse | null;

        if (!response.ok) {
          setErrorMessage(asText(body?.error) || `Could not load events (${response.status}).`);
          setLoading(false);
          return;
        }

        const loadedEvents = Array.isArray(body?.events) ? body.events : [];
        setEvents(loadedEvents);
        setSelectedEventId((current) => current || loadedEvents[0]?.id || "");
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "Could not load events.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadEvents();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) || null,
    [events, selectedEventId]
  );

  const parsedStartMinutes = toMinutes(startTime);
  const parsedRounds = parseNumber(roundCount, 4);
  const parsedExamRooms = parseNumber(examRoomCount, 4);
  const parsedFlexRooms = parseNumber(flexRoomCount, 1);
  const parsedMaxPairs = Math.max(1, parseNumber(maxPairsPerFlexRoom, 3));
  const parsedSessionLength = Math.max(1, parseNumber(sessionLengthMinutes, 50));
  const parsedEncounter = parseNumber(encounterMinutes, 20);
  const parsedChecklist = parseNumber(checklistMinutes, 5);
  const parsedSoap = parseNumber(soapMinutes, 10);
  const parsedFeedback = parseNumber(feedbackMinutes, 10);
  const parsedTransition = parseNumber(transitionMinutes, 5);
  const parsedStaffArrival = toMinutes(staffArrivalTime);
  const parsedSpArrival = toMinutes(spArrivalTime);
  const parsedFacultyArrival = toMinutes(facultyArrivalTime);
  const parsedRoomSetup = parseNumber(roomSetupMinutes, 20);
  const parsedStudentPrebrief = parseNumber(studentPrebriefMinutes, 20);
  const parsedSpPrebrief = parseNumber(spPrebriefMinutes, 15);
  const parsedFacultyPrebrief = parseNumber(facultyPrebriefMinutes, 10);
  const parsedDebrief = parseNumber(debriefMinutes, 20);
  const parsedBreakdown = parseNumber(breakdownMinutes, 20);

  const generated = useMemo(() => {
    if (parsedStartMinutes === null) {
      return {
        rounds: [] as GeneratedRound[],
        roundLength: 0,
        configuredLength: 0,
        bufferMinutes: 0,
        overrunMinutes: 0,
        rotationStart: 0,
        rotationEnd: 0,
        timeline: [] as TimelineBlock[],
      };
    }

    const { rounds, roundLength, configuredLength, bufferMinutes, overrunMinutes } = buildRounds({
      startMinutes: parsedStartMinutes,
      rounds: parsedRounds,
      sessionLengthMinutes: parsedSessionLength,
      examRoomCount: parsedExamRooms,
      flexRoomCount: parsedFlexRooms,
      maxPairsPerFlexRoom: parsedMaxPairs,
      encounterMinutes: parsedEncounter,
      includeChecklist,
      checklistMinutes: parsedChecklist,
      includeSoap,
      soapMinutes: parsedSoap,
      includeFeedback,
      feedbackMinutes: parsedFeedback,
      transitionMinutes: parsedTransition,
    });

    const rotationStart = parsedStartMinutes;
    const rotationEnd = rounds.length ? rounds[rounds.length - 1].end : rotationStart;

    const timeline: TimelineBlock[] = [];

    if (parsedRoomSetup > 0) {
      timeline.push({
        label: "Room Setup",
        start: Math.max((parsedStaffArrival ?? rotationStart) , rotationStart - parsedRoomSetup),
        end: rotationStart,
        detail: `${parsedRoomSetup} minutes`,
        tone: "setup",
      });
    }

    if (parsedStaffArrival !== null && parsedStaffArrival < rotationStart) {
      timeline.push({
        label: "Staff Arrival",
        start: parsedStaffArrival,
        end: rotationStart,
        detail: "Staff on site before rotation",
        tone: "setup",
      });
    }

    if (parsedSpArrival !== null && parsedSpArrival < rotationStart) {
      timeline.push({
        label: "SP Arrival",
        start: parsedSpArrival,
        end: rotationStart,
        detail: "SP check-in window",
        tone: "setup",
      });
    }

    if (parsedFacultyArrival !== null && parsedFacultyArrival < rotationStart) {
      timeline.push({
        label: "Faculty Arrival",
        start: parsedFacultyArrival,
        end: rotationStart,
        detail: "Faculty prep window",
        tone: "setup",
      });
    }

    if (parsedStudentPrebrief > 0) {
      timeline.push({
        label: "Student Prebrief",
        start: rotationStart - parsedStudentPrebrief,
        end: rotationStart,
        detail: `${parsedStudentPrebrief} minutes`,
        tone: "prebrief",
      });
    }

    if (parsedSpPrebrief > 0) {
      timeline.push({
        label: "SP Prebrief",
        start: rotationStart - parsedSpPrebrief,
        end: rotationStart,
        detail: `${parsedSpPrebrief} minutes`,
        tone: "prebrief",
      });
    }

    if (parsedFacultyPrebrief > 0) {
      timeline.push({
        label: "Faculty Prebrief",
        start: rotationStart - parsedFacultyPrebrief,
        end: rotationStart,
        detail: `${parsedFacultyPrebrief} minutes`,
        tone: "prebrief",
      });
    }

    if (rounds.length) {
      timeline.push({
        label: "Rotation Block",
        start: rotationStart,
        end: rotationEnd,
        detail: `${parsedRounds} round${parsedRounds === 1 ? "" : "s"} · ${roundLength} minutes each`,
        tone: "rotation",
      });
    }

    if (includeDebrief && parsedDebrief > 0) {
      timeline.push({
        label: "Debrief",
        start: rotationEnd,
        end: rotationEnd + parsedDebrief,
        detail: `${parsedDebrief} minutes`,
        tone: "wrap",
      });
    }

    const breakdownStart = includeDebrief && parsedDebrief > 0 ? rotationEnd + parsedDebrief : rotationEnd;
    if (includeBreakdown && parsedBreakdown > 0) {
      timeline.push({
        label: "Breakdown",
        start: breakdownStart,
        end: breakdownStart + parsedBreakdown,
        detail: `${parsedBreakdown} minutes`,
        tone: "wrap",
      });
    }

    timeline.sort((a, b) => a.start - b.start || a.end - b.end);

    return {
      rounds,
      roundLength,
      configuredLength,
      bufferMinutes,
      overrunMinutes,
      rotationStart,
      rotationEnd,
      timeline,
    };
  }, [
    includeBreakdown,
    includeChecklist,
    includeDebrief,
    includeFeedback,
    includeSoap,
    parsedBreakdown,
    parsedChecklist,
    parsedDebrief,
    parsedEncounter,
    parsedExamRooms,
    parsedFacultyArrival,
    parsedFacultyPrebrief,
    parsedFeedback,
    parsedFlexRooms,
    parsedMaxPairs,
    parsedRounds,
    parsedRoomSetup,
    parsedSessionLength,
    parsedSoap,
    parsedSpArrival,
    parsedSpPrebrief,
    parsedStaffArrival,
    parsedStartMinutes,
    parsedStudentPrebrief,
    parsedTransition,
  ]);

  const assignedNames = selectedEvent ? getAssignedNames(selectedEvent) : [];
  const rotationEnd = generated.rotationEnd;
  const totalEventEnd = useMemo(() => {
    const lastTimeline = generated.timeline[generated.timeline.length - 1];
    return lastTimeline ? lastTimeline.end : rotationEnd;
  }, [generated.timeline, rotationEnd]);
  const totalEventDuration = Math.max(totalEventEnd - (parsedStartMinutes ?? totalEventEnd), 0);
  const estimatedStaffDayLength = useMemo(() => {
    if (!generated.timeline.length) return 0;
    return generated.timeline[generated.timeline.length - 1].end - generated.timeline[0].start;
  }, [generated.timeline]);

  const previewText = useMemo(
    () =>
      buildPlaintextPreview({
        event: selectedEvent,
        timeline: generated.timeline,
        rounds: generated.rounds,
      }),
    [generated.rounds, generated.timeline, selectedEvent]
  );

  async function handleCopyPreview() {
    try {
      await navigator.clipboard.writeText(previewText);
      setCopyMessage("Schedule preview copied.");
      window.setTimeout(() => setCopyMessage(""), 2400);
    } catch (error) {
      setCopyMessage(error instanceof Error ? error.message : "Could not copy schedule preview.");
      window.setTimeout(() => setCopyMessage(""), 2400);
    }
  }

  return (
    <SiteShell
      title="Schedule Builder"
      subtitle="Select a real CFSP event, build the full simulation-day timeline, and preview a room-by-room schedule without changing saved event data."
    >
      <div className="grid gap-5">
        {errorMessage ? <div className="cfsp-alert cfsp-alert-error">{errorMessage}</div> : null}

        <section className="rounded-[14px] border border-[#dce6ee] bg-[linear-gradient(180deg,#f8fbfd_0%,#eef5fb_100%)] px-5 py-5">
          <p className="cfsp-kicker">Connected builder</p>
          <h2 className="mt-3 text-[1.7rem] leading-tight font-black text-[#14304f]">Simulation-day schedule builder</h2>
          <p className="mt-3 max-w-3xl text-[0.98rem] leading-6 text-[#5e7388]">
            Build a full-day operational preview with arrivals, prebriefs, encounter rounds, debrief, and breakdown while keeping all existing CFSP event data untouched.
          </p>
        </section>

        {loading ? (
          <div className="cfsp-alert cfsp-alert-info">Loading events for schedule building...</div>
        ) : events.length === 0 ? (
          <div className="cfsp-panel px-5 py-6">
            <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">No events available yet</h3>
            <p className="mt-3 text-sm leading-6 text-[#5e7388]">
              CFSP could not find any events to build a schedule from yet. Start by creating a new event or importing one from an upload workbook.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/events/new" className="cfsp-btn cfsp-btn-primary">
                Create New Event
              </Link>
              <Link href="/events/upload" className="cfsp-btn cfsp-btn-secondary">
                Upload Events
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
              <section className="cfsp-panel px-5 py-5">
                <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Event</h3>
                <div className="mt-4 grid gap-4">
                  <label className="grid gap-2">
                    <span className="cfsp-label">Select event</span>
                    <select
                      value={selectedEventId}
                      onChange={(event) => setSelectedEventId(event.target.value)}
                      className="cfsp-input"
                    >
                      {events.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.name || "Untitled Event"}
                        </option>
                      ))}
                    </select>
                  </label>

                  {selectedEvent ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                        <div className="cfsp-label">Event</div>
                        <div className="mt-2 text-base font-black text-[#14304f]">{selectedEvent.name || "Untitled Event"}</div>
                      </div>
                      <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                        <div className="cfsp-label">Date</div>
                        <div className="mt-2 text-base font-black text-[#14304f]">{formatEventDate(selectedEvent)}</div>
                      </div>
                      <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                        <div className="cfsp-label">Location</div>
                        <div className="mt-2 text-base font-black text-[#14304f]">{selectedEvent.location || "TBD"}</div>
                      </div>
                      <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                        <div className="cfsp-label">SP Coverage</div>
                        <div className="mt-2 text-base font-black text-[#14304f]">
                          {Number(selectedEvent.confirmed_assignments || 0)} / {Number(selectedEvent.sp_needed || 0)}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                    <div className="cfsp-label">Assigned SPs</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {assignedNames.length ? (
                        assignedNames.map((name) => (
                          <span key={name} className="cfsp-chip">
                            {name}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm font-semibold text-[#6a7e91]">No assigned SPs yet</span>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="cfsp-panel px-5 py-5">
                <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Calculated timing</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                    <div className="cfsp-label">Rotation Start</div>
                    <div className="mt-2 text-base font-black text-[#14304f]">
                      {parsedStartMinutes === null ? "Invalid start time" : toDisplayTime(parsedStartMinutes)}
                    </div>
                  </div>
                  <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                    <div className="cfsp-label">Rotation End</div>
                    <div className="mt-2 text-base font-black text-[#14304f]">
                      {generated.rounds.length ? toDisplayTime(rotationEnd) : "Not generated yet"}
                    </div>
                  </div>
                  <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                    <div className="cfsp-label">Total Event Duration</div>
                    <div className="mt-2 text-base font-black text-[#14304f]">{totalEventDuration} minutes</div>
                  </div>
                  <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                    <div className="cfsp-label">Estimated Staff Day</div>
                    <div className="mt-2 text-base font-black text-[#14304f]">{estimatedStaffDayLength} minutes</div>
                  </div>
                  <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                    <div className="cfsp-label">Target Session Length</div>
                    <div className="mt-2 text-base font-black text-[#14304f]">{parsedSessionLength} minutes</div>
                  </div>
                  <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                    <div className="cfsp-label">Configured Round Blocks</div>
                    <div className="mt-2 text-base font-black text-[#14304f]">{generated.configuredLength} minutes</div>
                  </div>
                </div>
                {generated.bufferMinutes > 0 ? (
                  <div className="cfsp-alert cfsp-alert-info mt-4">
                    Each round includes {generated.bufferMinutes} minutes of open buffer so the generated timeline matches the {parsedSessionLength}-minute session target.
                  </div>
                ) : null}
                {generated.overrunMinutes > 0 ? (
                  <div className="cfsp-alert cfsp-alert-error mt-4">
                    The configured round blocks exceed the target session length by {generated.overrunMinutes} minutes, so the preview expands each round to fit the real timing.
                  </div>
                ) : null}
              </section>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <section className="cfsp-panel px-5 py-5">
                <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Arrival &amp; Prebrief</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <TimeInput label="Staff arrival time" value={staffArrivalTime} onChange={setStaffArrivalTime} />
                  <TimeInput label="SP arrival time" value={spArrivalTime} onChange={setSpArrivalTime} />
                  <TimeInput label="Faculty arrival time" value={facultyArrivalTime} onChange={setFacultyArrivalTime} />
                  <NumberInput label="Room setup minutes" value={roomSetupMinutes} onChange={setRoomSetupMinutes} />
                  <NumberInput label="Student prebrief minutes" value={studentPrebriefMinutes} onChange={setStudentPrebriefMinutes} />
                  <NumberInput label="SP prebrief minutes" value={spPrebriefMinutes} onChange={setSpPrebriefMinutes} />
                  <NumberInput label="Faculty prebrief minutes" value={facultyPrebriefMinutes} onChange={setFacultyPrebriefMinutes} />
                </div>
              </section>

              <section className="cfsp-panel px-5 py-5">
                <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Rooms</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <NumberInput label="Exam Rooms" value={examRoomCount} onChange={setExamRoomCount} />
                  <NumberInput label="Flex Rooms" value={flexRoomCount} onChange={setFlexRoomCount} />
                  <NumberInput label="Max pairs per Flex Room" value={maxPairsPerFlexRoom} onChange={setMaxPairsPerFlexRoom} />
                </div>
              </section>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <section className="cfsp-panel px-5 py-5">
                <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Rotation Timing</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="cfsp-label">Start time</span>
                    <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="cfsp-input" />
                  </label>
                  <NumberInput label="Session length minutes" value={sessionLengthMinutes} onChange={setSessionLengthMinutes} />
                  <NumberInput label="Number of rounds" value={roundCount} onChange={setRoundCount} />
                  <NumberInput label="Encounter minutes" value={encounterMinutes} onChange={setEncounterMinutes} />
                  <NumberInput label="Transition minutes" value={transitionMinutes} onChange={setTransitionMinutes} />
                  <ToggleInput label="Include checklist time" checked={includeChecklist} onChange={setIncludeChecklist} />
                  <NumberInput label="Checklist minutes" value={checklistMinutes} onChange={setChecklistMinutes} disabled={!includeChecklist} />
                  <ToggleInput label="Include SOAP note time" checked={includeSoap} onChange={setIncludeSoap} />
                  <NumberInput label="SOAP note minutes" value={soapMinutes} onChange={setSoapMinutes} disabled={!includeSoap} />
                  <ToggleInput label="Include feedback time" checked={includeFeedback} onChange={setIncludeFeedback} />
                  <NumberInput label="Feedback minutes" value={feedbackMinutes} onChange={setFeedbackMinutes} disabled={!includeFeedback} />
                </div>
              </section>

              <section className="cfsp-panel px-5 py-5">
                <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Wrap-Up</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <ToggleInput label="Include debrief" checked={includeDebrief} onChange={setIncludeDebrief} />
                  <NumberInput label="Post-event debrief minutes" value={debriefMinutes} onChange={setDebriefMinutes} disabled={!includeDebrief} />
                  <ToggleInput label="Include breakdown" checked={includeBreakdown} onChange={setIncludeBreakdown} />
                  <NumberInput label="Room reset / breakdown minutes" value={breakdownMinutes} onChange={setBreakdownMinutes} disabled={!includeBreakdown} />
                </div>
              </section>
            </div>

            <section className="cfsp-panel px-5 py-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Full day timeline</h3>
                  <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                    Review the operational day from arrival through breakdown before moving into the room rotation grid.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={handleCopyPreview} className="cfsp-btn cfsp-btn-secondary">
                    Copy Full Schedule Preview
                  </button>
                  <button type="button" onClick={() => window.print()} className="cfsp-btn cfsp-btn-secondary">
                    Print Preview
                  </button>
                  <button type="button" disabled className="cfsp-btn cfsp-btn-secondary opacity-70">
                    Save Schedule Coming Soon
                  </button>
                </div>
              </div>

              {copyMessage ? <div className="mt-4 text-sm font-semibold text-[#196b57]">{copyMessage}</div> : null}

              {parsedStartMinutes === null ? (
                <div className="cfsp-alert cfsp-alert-error mt-5">Enter a valid start time to generate the full-day preview.</div>
              ) : (
                <div className="mt-5 grid gap-3">
                  {generated.timeline.map((block) => {
                    const tone = getToneStyles(block.tone);
                    return (
                      <div
                        key={`${block.label}-${block.start}-${block.end}`}
                        className="rounded-[12px] border px-4 py-3"
                        style={{ background: tone.background, borderColor: tone.border, color: tone.color }}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="font-black">{block.label}</div>
                          <div className="text-sm font-bold">{formatRange(block.start, block.end)}</div>
                        </div>
                        {block.detail ? <div className="mt-1 text-sm font-semibold opacity-90">{block.detail}</div> : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="cfsp-panel px-5 py-5">
              <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Room-by-room rotation grid</h3>
              <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                Each round is split into encounter, checklist, SOAP note, feedback, and transition blocks according to your current timing settings.
              </p>

              {parsedStartMinutes === null ? (
                <div className="cfsp-alert cfsp-alert-error mt-5">Enter a valid start time to generate the room rotation grid.</div>
              ) : !generated.rounds.length ? (
                <div className="cfsp-alert cfsp-alert-info mt-5">Add at least one round to generate the room rotation grid.</div>
              ) : (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[#dce6ee] text-sm text-[#5e7388]">
                        <th className="px-3 py-3 font-black">Round</th>
                        <th className="px-3 py-3 font-black">Time</th>
                        <th className="px-3 py-3 font-black">Exam Rooms</th>
                        <th className="px-3 py-3 font-black">Flex Rooms</th>
                      </tr>
                    </thead>
                    <tbody>
                      {generated.rounds.map((round) => {
                        const examRooms = round.roomSlots.filter((slot) => slot.roomType === "exam");
                        const flexRooms = round.roomSlots.filter((slot) => slot.roomType === "flex");

                        return (
                          <tr key={round.round} className="border-b border-[#eef3f7] align-top text-sm text-[#14304f]">
                            <td className="px-3 py-4 font-black">Round {round.round}</td>
                            <td className="px-3 py-4">
                              <div className="font-bold">{formatRange(round.start, round.end)}</div>
                              <div className="mt-2 grid gap-1 text-xs font-semibold text-[#5e7388]">
                                {round.subBlocks.map((subBlock) => (
                                  <div key={`${round.round}-${subBlock.label}`}>
                                    {subBlock.label}: {formatRange(subBlock.start, subBlock.end)}
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="px-3 py-4">
                              <div className="grid gap-2">
                                {examRooms.length ? (
                                  examRooms.map((slot) => (
                                    <div key={`${round.round}-${slot.roomName}`} className="rounded-[10px] border border-[#c7dcee] bg-[#edf5fb] px-3 py-2">
                                      <div className="font-bold text-[#165a96]">{slot.roomName}</div>
                                      <div className="text-xs font-semibold text-[#4f677d]">{slot.capacityLabel}</div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-sm font-semibold text-[#6a7e91]">No exam rooms</div>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-4">
                              <div className="grid gap-2">
                                {flexRooms.length ? (
                                  flexRooms.map((slot) => (
                                    <div key={`${round.round}-${slot.roomName}`} className="rounded-[10px] border border-[#bfe4d6] bg-[#eefbf6] px-3 py-2">
                                      <div className="font-bold text-[#196b57]">{slot.roomName}</div>
                                      <div className="text-xs font-semibold text-[#4f677d]">{slot.capacityLabel}</div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-sm font-semibold text-[#6a7e91]">No flex rooms</div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </SiteShell>
  );
}

function NumberInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="cfsp-label">{props.label}</span>
      <input
        type="number"
        min={0}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        disabled={props.disabled}
        className="cfsp-input"
      />
    </label>
  );
}

function ToggleInput(props: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="cfsp-label">{props.label}</span>
      <button
        type="button"
        onClick={() => props.onChange(!props.checked)}
        className={`cfsp-btn ${props.checked ? "cfsp-btn-primary" : "cfsp-btn-secondary"}`}
      >
        {props.checked ? "Included" : "Not Included"}
      </button>
    </label>
  );
}

function TimeInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="cfsp-label">{props.label}</span>
      <input type="time" value={props.value} onChange={(event) => props.onChange(event.target.value)} className="cfsp-input" />
    </label>
  );
}
