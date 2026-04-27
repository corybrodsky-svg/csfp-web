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

type GeneratedRoomSlot = {
  roomName: string;
  roomType: "exam" | "flex";
  capacityLabel: string;
  pairingLabel: string;
};

type GeneratedRound = {
  round: number;
  startTime: string;
  endTime: string;
  roomSlots: GeneratedRoomSlot[];
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
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const twelveHour = hours % 12 || 12;
  return `${twelveHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
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
  sessionLengthMinutes: number;
  rounds: number;
  examRoomCount: number;
  flexRoomCount: number;
  maxPairsPerFlexRoom: number;
}) {
  const generated: GeneratedRound[] = [];

  for (let roundIndex = 0; roundIndex < args.rounds; roundIndex += 1) {
    const start = args.startMinutes + roundIndex * args.sessionLengthMinutes;
    const end = start + args.sessionLengthMinutes;

    const examSlots: GeneratedRoomSlot[] = Array.from({ length: args.examRoomCount }, (_, index) => ({
      roomName: `Exam Room ${index + 1}`,
      roomType: "exam",
      capacityLabel: "1 pair",
      pairingLabel: `Pair ${roundIndex * Math.max(args.examRoomCount, 1) + index + 1}`,
    }));

    const flexSlots: GeneratedRoomSlot[] = Array.from({ length: args.flexRoomCount }, (_, index) => ({
      roomName: `Flex Room ${index + 1}`,
      roomType: "flex",
      capacityLabel: `Up to ${args.maxPairsPerFlexRoom} pairs`,
      pairingLabel: `Pairs 1-${args.maxPairsPerFlexRoom}`,
    }));

    generated.push({
      round: roundIndex + 1,
      startTime: toDisplayTime(start),
      endTime: toDisplayTime(end),
      roomSlots: [...examSlots, ...flexSlots],
    });
  }

  return generated;
}

export default function ScheduleBuilderPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [startTime, setStartTime] = useState("08:10");
  const [sessionLengthMinutes, setSessionLengthMinutes] = useState("50");
  const [roundCount, setRoundCount] = useState("4");
  const [examRoomCount, setExamRoomCount] = useState("4");
  const [flexRoomCount, setFlexRoomCount] = useState("1");
  const [maxPairsPerFlexRoom, setMaxPairsPerFlexRoom] = useState("3");

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
  const parsedSessionLength = parseNumber(sessionLengthMinutes, 50);
  const parsedRounds = parseNumber(roundCount, 4);
  const parsedExamRooms = parseNumber(examRoomCount, 4);
  const parsedFlexRooms = parseNumber(flexRoomCount, 1);
  const parsedMaxPairs = Math.max(1, parseNumber(maxPairsPerFlexRoom, 3));

  const generatedRounds = useMemo(() => {
    if (parsedStartMinutes === null) return [];
    if (parsedSessionLength <= 0 || parsedRounds <= 0) return [];

    return buildRounds({
      startMinutes: parsedStartMinutes,
      sessionLengthMinutes: parsedSessionLength,
      rounds: parsedRounds,
      examRoomCount: parsedExamRooms,
      flexRoomCount: parsedFlexRooms,
      maxPairsPerFlexRoom: parsedMaxPairs,
    });
  }, [parsedExamRooms, parsedFlexRooms, parsedMaxPairs, parsedRounds, parsedSessionLength, parsedStartMinutes]);

  const totalRoomSlotsPerRound = parsedExamRooms + parsedFlexRooms;
  const totalFlexCapacityPerRound = parsedFlexRooms * parsedMaxPairs;
  const assignedNames = selectedEvent ? getAssignedNames(selectedEvent) : [];

  return (
    <SiteShell
      title="Schedule Builder"
      subtitle="Select a real CFSP event, set round and room inputs, and preview a JWAN-style rotation without changing saved event data."
    >
      <div className="grid gap-5">
        {errorMessage ? <div className="cfsp-alert cfsp-alert-error">{errorMessage}</div> : null}

        <section className="rounded-[14px] border border-[#dce6ee] bg-[linear-gradient(180deg,#f8fbfd_0%,#eef5fb_100%)] px-5 py-5">
          <p className="cfsp-kicker">Connected builder</p>
          <h2 className="mt-3 text-[1.7rem] leading-tight font-black text-[#14304f]">First live CFSP schedule builder</h2>
          <p className="mt-3 max-w-3xl text-[0.98rem] leading-6 text-[#5e7388]">
            This first version works from real CFSP events, previews rounds and rooms, and keeps the generated schedule out of the database until the save flow is ready.
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
          <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <section className="cfsp-panel px-5 py-5">
              <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">1. Select event</h3>
              <div className="mt-4 grid gap-4">
                <label className="grid gap-2">
                  <span className="cfsp-label">Event</span>
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
              <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">2. Build preview</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="cfsp-label">Start time</span>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    className="cfsp-input"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Session length (minutes)</span>
                  <input
                    type="number"
                    min={1}
                    value={sessionLengthMinutes}
                    onChange={(event) => setSessionLengthMinutes(event.target.value)}
                    className="cfsp-input"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Number of rounds</span>
                  <input
                    type="number"
                    min={1}
                    value={roundCount}
                    onChange={(event) => setRoundCount(event.target.value)}
                    className="cfsp-input"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Exam Rooms</span>
                  <input
                    type="number"
                    min={0}
                    value={examRoomCount}
                    onChange={(event) => setExamRoomCount(event.target.value)}
                    className="cfsp-input"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Flex Rooms</span>
                  <input
                    type="number"
                    min={0}
                    value={flexRoomCount}
                    onChange={(event) => setFlexRoomCount(event.target.value)}
                    className="cfsp-input"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Max pairs per Flex Room</span>
                  <input
                    type="number"
                    min={1}
                    value={maxPairsPerFlexRoom}
                    onChange={(event) => setMaxPairsPerFlexRoom(event.target.value)}
                    className="cfsp-input"
                  />
                </label>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                  <div className="cfsp-label">Rounds</div>
                  <div className="mt-2 text-xl font-black text-[#14304f]">{generatedRounds.length}</div>
                </div>
                <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                  <div className="cfsp-label">Room Slots / Round</div>
                  <div className="mt-2 text-xl font-black text-[#14304f]">{totalRoomSlotsPerRound}</div>
                </div>
                <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                  <div className="cfsp-label">Flex Capacity / Round</div>
                  <div className="mt-2 text-xl font-black text-[#14304f]">{totalFlexCapacityPerRound}</div>
                </div>
              </div>
            </section>
          </div>
        )}

        {!loading && events.length > 0 ? (
          <section className="cfsp-panel px-5 py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">3. Schedule preview</h3>
                <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                  Preview the round rotation concept with Exam Rooms and Flex Rooms before any save path is introduced.
                </p>
              </div>
              <button type="button" disabled className="cfsp-btn cfsp-btn-secondary opacity-70">
                Save Schedule Coming Soon
              </button>
            </div>

            {parsedStartMinutes === null ? (
              <div className="cfsp-alert cfsp-alert-error mt-5">
                Enter a valid start time to generate the schedule preview.
              </div>
            ) : !generatedRounds.length ? (
              <div className="cfsp-alert cfsp-alert-info mt-5">
                Add at least one round with a positive session length to generate the preview table.
              </div>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#dce6ee] text-sm text-[#5e7388]">
                      <th className="px-3 py-3 font-black">Round</th>
                      <th className="px-3 py-3 font-black">Time</th>
                      <th className="px-3 py-3 font-black">Room</th>
                      <th className="px-3 py-3 font-black">Type</th>
                      <th className="px-3 py-3 font-black">Capacity</th>
                      <th className="px-3 py-3 font-black">Rotation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generatedRounds.flatMap((round) =>
                      round.roomSlots.map((slot, index) => (
                        <tr key={`${round.round}-${slot.roomName}`} className="border-b border-[#eef3f7] text-sm text-[#14304f]">
                          <td className="px-3 py-3 font-bold">{index === 0 ? `Round ${round.round}` : ""}</td>
                          <td className="px-3 py-3 font-semibold">{index === 0 ? `${round.startTime} - ${round.endTime}` : ""}</td>
                          <td className="px-3 py-3 font-semibold">{slot.roomName}</td>
                          <td className="px-3 py-3">
                            <span
                              className="inline-flex rounded-full px-3 py-1 text-xs font-black"
                              style={
                                slot.roomType === "exam"
                                  ? { background: "#edf5fb", color: "#165a96" }
                                  : { background: "#eaf7f2", color: "#196b57" }
                              }
                            >
                              {slot.roomType === "exam" ? "Exam Room" : "Flex Room"}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-semibold">{slot.capacityLabel}</td>
                          <td className="px-3 py-3 font-semibold text-[#5e7388]">{slot.pairingLabel}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </SiteShell>
  );
}
