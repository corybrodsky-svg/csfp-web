"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
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
    {
      label: "Checklist",
      minutes: args.checklistMinutes,
      enabled: args.includeChecklist && args.checklistMinutes > 0,
    },
    {
      label: "SOAP Note",
      minutes: args.soapMinutes,
      enabled: args.includeSoap && args.soapMinutes > 0,
    },
    {
      label: "Feedback",
      minutes: args.feedbackMinutes,
      enabled: args.includeFeedback && args.feedbackMinutes > 0,
    },
    {
      label: "Transition",
      minutes: args.transitionMinutes,
      enabled: args.transitionMinutes > 0,
    },
  ].filter((item) => item.enabled && item.minutes > 0);

  const configuredLength = blockDurations.reduce((sum, item) => sum + item.minutes, 0);
  const sessionLengthMinutes = Math.max(1, args.sessionLengthMinutes);
  const bufferMinutes = Math.max(sessionLengthMinutes - configuredLength, 0);
  const roundLength = Math.max(configuredLength, sessionLengthMinutes);

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

    const examSlots: GeneratedRoomSlot[] = Array.from(
      { length: args.examRoomCount },
      (_, index) => ({
        roomName: `Exam ${index + 1}`,
        roomType: "exam",
        capacityLabel: "1 pair",
      })
    );

    const flexSlots: GeneratedRoomSlot[] = Array.from(
      { length: args.flexRoomCount },
      (_, index) => ({
        roomName: `Flex ${index + 1}`,
        roomType: "flex",
        capacityLabel: `up to ${args.maxPairsPerFlexRoom} pairs`,
      })
    );

    rounds.push({
      round: roundIndex + 1,
      start: roundStart,
      end: roundStart + roundLength,
      roomSlots: [...examSlots, ...flexSlots],
      subBlocks,
    });

    roundStart += roundLength;
  }

  return rounds;
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [startTime, setStartTime] = useState("08:10");
  const [rounds, setRounds] = useState("6");
  const [sessionLength, setSessionLength] = useState("50");
  const [examRooms, setExamRooms] = useState("6");
  const [flexRooms, setFlexRooms] = useState("2");
  const [maxPairsPerFlexRoom, setMaxPairsPerFlexRoom] = useState("3");
  const [encounterMinutes, setEncounterMinutes] = useState("25");
  const [checklistMinutes, setChecklistMinutes] = useState("5");
  const [soapMinutes, setSoapMinutes] = useState("10");
  const [feedbackMinutes, setFeedbackMinutes] = useState("5");
  const [transitionMinutes, setTransitionMinutes] = useState("5");
  const [includeChecklist, setIncludeChecklist] = useState(true);
  const [includeSoap, setIncludeSoap] = useState(true);
  const [includeFeedback, setIncludeFeedback] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/events", { cache: "no-store" });
        const data = (await response.json()) as EventsResponse;

        if (!response.ok) {
          throw new Error(data.error || "Could not load events.");
        }

        if (!cancelled) {
          setEvents(data.events || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load events.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadEvents();

    return () => {
      cancelled = true;
    };
  }, []);

  const generatedRounds = useMemo(() => {
    const parsedStart = toMinutes(startTime) ?? 8 * 60 + 10;

    return buildRounds({
      startMinutes: parsedStart,
      rounds: parseNumber(rounds, 6),
      sessionLengthMinutes: parseNumber(sessionLength, 50),
      examRoomCount: parseNumber(examRooms, 6),
      flexRoomCount: parseNumber(flexRooms, 2),
      maxPairsPerFlexRoom: parseNumber(maxPairsPerFlexRoom, 3),
      encounterMinutes: parseNumber(encounterMinutes, 25),
      includeChecklist,
      checklistMinutes: parseNumber(checklistMinutes, 5),
      includeSoap,
      soapMinutes: parseNumber(soapMinutes, 10),
      includeFeedback,
      feedbackMinutes: parseNumber(feedbackMinutes, 5),
      transitionMinutes: parseNumber(transitionMinutes, 5),
    });
  }, [
    startTime,
    rounds,
    sessionLength,
    examRooms,
    flexRooms,
    maxPairsPerFlexRoom,
    encounterMinutes,
    includeChecklist,
    checklistMinutes,
    includeSoap,
    soapMinutes,
    includeFeedback,
    feedbackMinutes,
    transitionMinutes,
  ]);

  return (
    <SiteShell
      title="Events"
      subtitle="Review imported events, open command centers, and generate room/round schedules."
    >
      <main style={{ padding: 24, display: "grid", gap: 24 }}>
        <section>
          <h1 style={{ margin: 0, fontSize: 32 }}>Events</h1>
          <p style={{ marginTop: 8, color: "#52616b" }}>
            Review imported events, open command centers, and generate room/round schedules.
          </p>
        </section>

        <section
          style={{
            border: "1px solid #d9e2ec",
            borderRadius: 16,
            padding: 18,
            background: "white",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Schedule Builder</h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 12,
            }}
          >
            <label>
              Start time
              <input value={startTime} onChange={(e) => setStartTime(e.target.value)} type="time" />
            </label>

            <label>
              Rounds
              <input value={rounds} onChange={(e) => setRounds(e.target.value)} type="number" min="1" />
            </label>

            <label>
              Round length
              <input value={sessionLength} onChange={(e) => setSessionLength(e.target.value)} type="number" min="1" />
            </label>

            <label>
              Exam rooms
              <input value={examRooms} onChange={(e) => setExamRooms(e.target.value)} type="number" min="0" />
            </label>

            <label>
              Flex rooms
              <input value={flexRooms} onChange={(e) => setFlexRooms(e.target.value)} type="number" min="0" />
            </label>

            <label>
              Flex capacity
              <input
                value={maxPairsPerFlexRoom}
                onChange={(e) => setMaxPairsPerFlexRoom(e.target.value)}
                type="number"
                min="1"
              />
            </label>

            <label>
              Encounter
              <input
                value={encounterMinutes}
                onChange={(e) => setEncounterMinutes(e.target.value)}
                type="number"
                min="1"
              />
            </label>

            <label>
              Checklist
              <input
                value={checklistMinutes}
                onChange={(e) => setChecklistMinutes(e.target.value)}
                type="number"
                min="0"
              />
            </label>

            <label>
              SOAP
              <input value={soapMinutes} onChange={(e) => setSoapMinutes(e.target.value)} type="number" min="0" />
            </label>

            <label>
              Feedback
              <input
                value={feedbackMinutes}
                onChange={(e) => setFeedbackMinutes(e.target.value)}
                type="number"
                min="0"
              />
            </label>

            <label>
              Transition
              <input
                value={transitionMinutes}
                onChange={(e) => setTransitionMinutes(e.target.value)}
                type="number"
                min="0"
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14 }}>
            <label>
              <input
                checked={includeChecklist}
                onChange={(e) => setIncludeChecklist(e.target.checked)}
                type="checkbox"
              />{" "}
              Include checklist
            </label>

            <label>
              <input checked={includeSoap} onChange={(e) => setIncludeSoap(e.target.checked)} type="checkbox" /> Include
              SOAP
            </label>

            <label>
              <input
                checked={includeFeedback}
                onChange={(e) => setIncludeFeedback(e.target.checked)}
                type="checkbox"
              />{" "}
              Include feedback
            </label>
          </div>

          <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
            {generatedRounds.map((round) => (
              <div key={round.round} style={{ border: "1px solid #d9e2ec", borderRadius: 12, padding: 12 }}>
                <strong>
                  Round {round.round}: {formatRange(round.start, round.end)}
                </strong>

                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {round.subBlocks.map((block) => (
                    <span
                      key={`${round.round}-${block.label}-${block.start}`}
                      style={{
                        border: "1px solid #d9e2ec",
                        borderRadius: 999,
                        padding: "4px 8px",
                        fontSize: 13,
                        background: "#f8fafc",
                      }}
                    >
                      {block.label}: {formatRange(block.start, block.end)}
                    </span>
                  ))}
                </div>

                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {round.roomSlots.map((slot) => (
                    <span
                      key={`${round.round}-${slot.roomName}`}
                      style={{
                        border: "1px solid #d9e2ec",
                        borderRadius: 999,
                        padding: "4px 8px",
                        fontSize: 13,
                      }}
                    >
                      {slot.roomName} · {slot.capacityLabel}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section
          style={{
            border: "1px solid #d9e2ec",
            borderRadius: 16,
            padding: 18,
            background: "white",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Event List</h2>

          {loading ? <p>Loading events...</p> : null}
          {error ? <p style={{ color: "#b42318" }}>{error}</p> : null}

          {!loading && !error && events.length === 0 ? <p>No events found.</p> : null}

          <div style={{ display: "grid", gap: 12 }}>
            {events.map((event) => {
              const assignedNames = getAssignedNames(event);
              const needed = event.sp_needed ?? 0;
              const confirmed = event.confirmed_assignments ?? 0;
              const total = event.total_assignments ?? 0;

              return (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  style={{
                    display: "block",
                    textDecoration: "none",
                    color: "inherit",
                    border: "1px solid #d9e2ec",
                    borderRadius: 14,
                    padding: 14,
                    background: "#ffffff",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <strong style={{ fontSize: 18 }}>{event.name || "Untitled Event"}</strong>
                      <div style={{ color: "#52616b", marginTop: 4 }}>
                        {formatEventDate(event)} · {event.location || "Location TBD"}
                      </div>
                    </div>

                    <div style={{ textAlign: "right", color: "#52616b" }}>
                      <div>Status: {event.status || "TBD"}</div>
                      <div>
                        Coverage: {confirmed}/{needed || total || 0}
                      </div>
                    </div>
                  </div>

                  {assignedNames.length > 0 ? (
                    <div style={{ marginTop: 10, color: "#334e68" }}>
                      Assigned SPs: {assignedNames.join(", ")}
                    </div>
                  ) : (
                    <div style={{ marginTop: 10, color: "#829ab1" }}>No assigned SPs yet.</div>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
