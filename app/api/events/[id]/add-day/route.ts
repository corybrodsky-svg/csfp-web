import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "../../../../lib/authCookies";
import { parseEventMetadata, upsertEventMetadata } from "../../../../lib/eventMetadata";
import { getProfileForUser } from "../../../../lib/profileServer";
import { resolveSpAccountLink } from "../../../../lib/spAccountLinking";
import { createSupabaseServerClient } from "../../../../lib/supabaseServerClient";
import { parseTrainingEventMetadata } from "../../../../lib/trainingEventNotes";
import {
  MINUTES_PER_DAY,
  formatDisplayTimeFromMinutes,
  normalizeEndMinutesForRange,
  parseTimeToMinutes,
} from "../../../../lib/timeFormat";

export const dynamic = "force-dynamic";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseNullableText(value: unknown) {
  const text = asText(value);
  return text || null;
}

function parseNullableStoredTime(value: unknown) {
  const minutes = parseTimeToMinutes(asText(value));
  if (minutes === null) return null;
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00`;
}

function getRouteId(params: { id?: string | string[] }) {
  const raw = params.id;
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown Supabase error";
}

function normalizeRole(value: unknown) {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "sp" || role === "faculty" || role === "sim_op" || role === "admin" || role === "super_admin") {
    return role;
  }
  return "unknown";
}

function isOperatorRole(role: string) {
  return role === "sim_op" || role === "admin" || role === "super_admin";
}

function getEffectiveRole(email: unknown, role: unknown) {
  const normalizedEmail = asText(email).toLowerCase();
  const localPart = normalizedEmail.split("@")[0] || "";
  const normalizedRole = normalizeRole(role);

  if (normalizedEmail === "cwb55@drexel.edu" || localPart === "cory.brodsky") {
    if (normalizedRole === "super_admin" || normalizedRole === "admin" || normalizedRole === "sim_op") {
      return normalizedRole;
    }
    return "super_admin";
  }

  return normalizedRole;
}

type ViewerContext = {
  id: string;
  accessToken: string;
  refreshToken: string;
  email: string;
  role: string;
  fullName: string;
  refreshedTokens?: {
    accessToken: string;
    refreshToken: string;
  };
  shouldClearCookies?: boolean;
};

type AuthenticatedUserResult = {
  accessToken: string;
  refreshToken: string;
  user: Awaited<ReturnType<ReturnType<typeof createSupabaseServerClient>["auth"]["getUser"]>>["data"]["user"] | null;
  refreshedTokens?: {
    accessToken: string;
    refreshToken: string;
  };
  shouldClearCookies?: boolean;
};

async function getAuthenticatedUser(): Promise<AuthenticatedUserResult> {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value || "";
    const refreshToken = cookieStore.get(AUTH_REFRESH_COOKIE)?.value || "";

    if (!accessToken && !refreshToken) {
      return { accessToken: "", refreshToken: "", user: null };
    }

    const supabase = createSupabaseServerClient();

    if (accessToken) {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(accessToken);

      if (!error && user) {
        return { accessToken, refreshToken, user };
      }
    }

    if (!refreshToken) {
      return { accessToken, refreshToken, user: null, shouldClearCookies: true };
    }

    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    const refreshedAccessToken = asText(data.session?.access_token);
    const refreshedRefreshToken = asText(data.session?.refresh_token);
    const refreshedUser = data.user ?? data.session?.user ?? null;

    if (error || !refreshedUser || !refreshedAccessToken || !refreshedRefreshToken) {
      return { accessToken, refreshToken, user: null, shouldClearCookies: true };
    }

    return {
      accessToken: refreshedAccessToken,
      refreshToken: refreshedRefreshToken,
      user: refreshedUser,
      refreshedTokens: {
        accessToken: refreshedAccessToken,
        refreshToken: refreshedRefreshToken,
      },
    };
  } catch {
    return { accessToken: "", refreshToken: "", user: null };
  }
}

async function getAuthenticatedViewer(): Promise<ViewerContext | null> {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth.user) return null;

    const profileResult = await getProfileForUser(auth.user.id, auth.accessToken);
    const profile = profileResult.profile;
    const email = asText(profile?.email) || asText(auth.user.email);
    await resolveSpAccountLink({
      user: auth.user,
      profile: profile || null,
      accessToken: auth.accessToken,
    });

    return {
      id: auth.user.id,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      email,
      role: getEffectiveRole(email, profile?.role || auth.user.user_metadata?.role),
      fullName: asText(profile?.full_name) || asText(auth.user.user_metadata?.full_name),
      refreshedTokens: auth.refreshedTokens,
      shouldClearCookies: auth.shouldClearCookies,
    };
  } catch {
    return null;
  }
}

function applyAuthCookies(response: NextResponse, viewer: ViewerContext | null) {
  if (!viewer) return response;
  if (viewer.refreshedTokens) {
    setAuthCookies(response, viewer.refreshedTokens);
  }
  return response;
}

function unauthorizedResponse(viewer?: ViewerContext | null) {
  const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (viewer?.shouldClearCookies) {
    clearAuthCookies(response);
  }
  return response;
}

type SourceSessionRow = {
  id: string;
  event_id: string | null;
  session_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  room: string | null;
};

type AddDayRequestBody = {
  date?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  location?: unknown;
  notes?: unknown;
  copyDayStructure?: unknown;
  sourceDay?: unknown;
  copyScheduleRhythm?: unknown;
  copyCases?: unknown;
  copySpAssignments?: unknown;
  copyLearnerGroups?: unknown;
  copyRoomStructure?: unknown;
};

function parseBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  const text = asText(value).toLowerCase();
  if (!text) return fallback;
  return text === "true" || text === "1" || text === "yes" || text === "on";
}

function parsePositiveInteger(value: unknown, fallback = 1) {
  const parsed = Number.parseInt(asText(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseEncodedJsonObject(value: string | null | undefined) {
  const text = asText(value);
  if (!text) return null as Record<string, unknown> | null;

  const candidates = [text];
  try {
    candidates.unshift(decodeURIComponent(text));
  } catch {
    // already plain text
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      // keep trying
    }
  }

  return null;
}

function encodeJsonObject(value: Record<string, unknown>) {
  return encodeURIComponent(JSON.stringify(value));
}

function parseScheduleBuilderDays(rawValue: string | null | undefined) {
  const text = asText(rawValue);
  if (!text) return new Map<number, string>();
  try {
    const parsed = JSON.parse(text) as Record<string, string>;
    const next = new Map<number, string>();
    Object.entries(parsed).forEach(([key, value]) => {
      const day = Number.parseInt(key, 10);
      if (Number.isFinite(day) && day > 0 && asText(value)) {
        next.set(day, value);
      }
    });
    return next;
  } catch {
    return new Map<number, string>();
  }
}

function serializeScheduleBuilderDays(days: Map<number, string>) {
  if (!days.size) return "";
  const next = Object.fromEntries(Array.from(days.entries()).map(([day, snapshot]) => [String(day), snapshot]));
  return JSON.stringify(next);
}

function shiftClockLabel(value: unknown, deltaMinutes: number) {
  const minutes = parseTimeToMinutes(asText(value));
  if (minutes === null) return asText(value);
  return formatDisplayTimeFromMinutes(minutes + deltaMinutes);
}

function shiftSpecificTime(value: unknown, deltaMinutes: number) {
  const minutes = parseTimeToMinutes(asText(value));
  if (minutes === null) return asText(value);
  const shifted = ((minutes + deltaMinutes) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(shifted / 60);
  const mins = shifted % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function shiftScheduleSnapshot(args: {
  snapshot: Record<string, unknown>;
  newDate: string;
  targetStartTime: string | null;
  savedAt: string;
}) {
  const next = JSON.parse(JSON.stringify(args.snapshot)) as Record<string, unknown>;
  const resolvedRounds = Array.isArray(next.resolvedRounds)
    ? (next.resolvedRounds as Array<Record<string, unknown>>)
    : [];
  const originalStartMinutes =
    parseTimeToMinutes(asText(next.startTime)) ||
    parseTimeToMinutes(asText(resolvedRounds[0]?.startTime));
  const targetStartMinutes = parseTimeToMinutes(args.targetStartTime);
  const deltaMinutes =
    originalStartMinutes !== null && targetStartMinutes !== null
      ? targetStartMinutes - originalStartMinutes
      : 0;

  if (targetStartMinutes !== null) {
    next.startTime = formatDisplayTimeFromMinutes(targetStartMinutes);
  }
  next.eventDate = args.newDate || asText(next.eventDate);
  next.scheduleStatus = "draft";
  next.savedAt = args.savedAt;

  if (asText(next.staffArrivalTime)) next.staffArrivalTime = shiftClockLabel(next.staffArrivalTime, deltaMinutes);
  if (asText(next.spArrivalTime)) next.spArrivalTime = shiftClockLabel(next.spArrivalTime, deltaMinutes);
  if (asText(next.facultyArrivalTime)) next.facultyArrivalTime = shiftClockLabel(next.facultyArrivalTime, deltaMinutes);

  if (Array.isArray(next.dayBlocks)) {
    next.dayBlocks = (next.dayBlocks as Array<Record<string, unknown>>).map((block) => ({
      ...block,
      specificTime: asText(block.specificTime) ? shiftSpecificTime(block.specificTime, deltaMinutes) : asText(block.specificTime),
    }));
  }

  next.resolvedRounds = resolvedRounds.map((round) => ({
    ...round,
    sessionDate: args.newDate || asText(round.sessionDate),
    startTime: shiftClockLabel(round.startTime, deltaMinutes),
    endTime: shiftClockLabel(round.endTime, deltaMinutes),
  }));

  return next;
}

function buildSessionsFromSnapshot(
  snapshot: Record<string, unknown> | null,
  location: string | null
) {
  if (!snapshot || !Array.isArray(snapshot.resolvedRounds)) return [] as Array<Record<string, string | null>>;
  return (snapshot.resolvedRounds as Array<Record<string, unknown>>).flatMap((round) => {
    const sessionDate = asText(round.sessionDate);
    const startTime = parseNullableStoredTime(round.startTime);
    const endTime = parseNullableStoredTime(round.endTime);
    const roomSlots = Array.isArray(round.roomSlots) ? (round.roomSlots as Array<Record<string, unknown>>) : [];
    if (!sessionDate || !startTime) return [];
    return roomSlots.map((slot, index) => ({
      session_date: sessionDate,
      start_time: startTime,
      end_time: endTime,
      location,
      room: parseNullableText(slot.roomName) || `Exam ${index + 1}`,
    }));
  });
}

function buildSessionsFromSourceSessions(args: {
  sourceSessions: SourceSessionRow[];
  newDate: string;
  targetStartTime: string | null;
  location: string | null;
}) {
  const grouped = new Map<
    string,
    {
      startMinutes: number;
      endMinutes: number | null;
      rooms: Array<string | null>;
    }
  >();

  args.sourceSessions.forEach((session) => {
    const startMinutes = parseTimeToMinutes(session.start_time);
    if (startMinutes === null) return;
    const endMinutes = normalizeEndMinutesForRange(startMinutes, parseTimeToMinutes(session.end_time));
    const key = `${startMinutes}:${endMinutes ?? ""}`;
    const current = grouped.get(key) || { startMinutes, endMinutes, rooms: [] };
    current.rooms.push(parseNullableText(session.room));
    grouped.set(key, current);
  });

  const orderedRounds = Array.from(grouped.values()).sort((a, b) => a.startMinutes - b.startMinutes);
  if (!orderedRounds.length) return [] as Array<Record<string, string | null>>;

  const sourceStartMinutes = orderedRounds[0]?.startMinutes ?? null;
  const targetStartMinutes = parseTimeToMinutes(args.targetStartTime);
  const deltaMinutes =
    sourceStartMinutes !== null && targetStartMinutes !== null
      ? targetStartMinutes - sourceStartMinutes
      : 0;

  return orderedRounds.flatMap((round) => {
    const shiftedStart = round.startMinutes + deltaMinutes;
    const shiftedEnd = round.endMinutes !== null ? round.endMinutes + deltaMinutes : null;
    const startTime = parseNullableStoredTime(formatDisplayTimeFromMinutes(shiftedStart));
    const endTime = shiftedEnd !== null ? parseNullableStoredTime(formatDisplayTimeFromMinutes(shiftedEnd)) : null;
    return round.rooms.map((room, index) => ({
      session_date: args.newDate,
      start_time: startTime,
      end_time: endTime,
      location: args.location,
      room: room || `Exam ${index + 1}`,
    }));
  });
}

function appendExtraDayNotes(sourceNotes: string | null, extraDate: string, notes: string) {
  const visibleNotes = sourceNotes ? sourceNotes.replace(/\[(CFSP_[A-Z0-9_]+)\][\s\S]*?\[\/\1\]/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : "";
  if (!notes.trim()) return visibleNotes;
  const addition = `Extra Day ${extraDate}: ${notes.trim()}`;
  return [visibleNotes, addition].filter(Boolean).join("\n\n");
}

export async function POST(
  request: Request,
  context: { params: Promise<unknown> }
) {
  const viewer = await getAuthenticatedViewer();
  if (!viewer) {
    return unauthorizedResponse();
  }
  if (!isOperatorRole(viewer.role)) {
    return applyAuthCookies(
      NextResponse.json({ error: "Only Sim Ops or admin accounts can add extra event dates." }, { status: 403 }),
      viewer
    );
  }

  try {
    const params = (await context.params) as { id?: string | string[] };
    const eventId = getRouteId(params);
    if (!eventId) {
      return applyAuthCookies(NextResponse.json({ error: "Missing event id." }, { status: 400 }), viewer);
    }

    const body = (await request.json().catch(() => null)) as AddDayRequestBody | null;
    const newDate = asText(body?.date);
    const newLocation = parseNullableText(body?.location);
    const notes = asText(body?.notes);
    const sourceDay = parsePositiveInteger(body?.sourceDay, 1);
    const copyDayStructure = parseBoolean(body?.copyDayStructure, true);
    const copyScheduleRhythm = parseBoolean(body?.copyScheduleRhythm, true);
    const copyCases = parseBoolean(body?.copyCases, true);
    const copyLearnerGroups = parseBoolean(body?.copyLearnerGroups, true);
    const copyRoomStructure = parseBoolean(body?.copyRoomStructure, true);
    parseBoolean(body?.copySpAssignments, true);
    const startStoredTime = parseNullableStoredTime(body?.startTime);
    const endStoredTime = parseNullableStoredTime(body?.endTime);

    if (!newDate) {
      return applyAuthCookies(NextResponse.json({ error: "A new event day date is required." }, { status: 400 }), viewer);
    }

    const supabaseServer = createSupabaseServerClient();
    const [{ data: event, error: eventError }, { data: sessions, error: sessionsError }] = await Promise.all([
      supabaseServer
        .from("events")
        .select("id,name,status,date_text,location,notes")
        .eq("id", eventId)
        .maybeSingle(),
      supabaseServer
        .from("event_sessions")
        .select("id,event_id,session_date,start_time,end_time,location,room")
        .eq("event_id", eventId)
        .order("session_date", { ascending: true })
        .order("start_time", { ascending: true })
        .order("room", { ascending: true }),
    ]);

    if (eventError) {
      return applyAuthCookies(NextResponse.json({ error: eventError.message || "Could not load the event." }, { status: 500 }), viewer);
    }
    if (!event) {
      return applyAuthCookies(NextResponse.json({ error: "Event not found." }, { status: 404 }), viewer);
    }
    if (sessionsError) {
      return applyAuthCookies(NextResponse.json({ error: sessionsError.message || "Could not load event sessions." }, { status: 500 }), viewer);
    }

    const sourceSessions = ((sessions || []) as SourceSessionRow[]).filter((session) => asText(session.session_date) !== newDate);
    const sourceDates = Array.from(new Set(sourceSessions.map((session) => asText(session.session_date)).filter(Boolean)));
    if (sourceDates.includes(newDate)) {
      return applyAuthCookies(NextResponse.json({ error: "That date already exists on this event." }, { status: 400 }), viewer);
    }

    const sourceDateForDay = sourceDates[Math.max(0, sourceDay - 1)] || sourceDates[0] || "";
    const sourceSessionsForDay = sourceDateForDay
      ? sourceSessions.filter((session) => asText(session.session_date) === sourceDateForDay)
      : sourceSessions;
    const trainingMetadata = parseTrainingEventMetadata(event.notes);
    const parsedEventMetadata = parseEventMetadata(event.notes);
    const daySnapshots = parseScheduleBuilderDays(trainingMetadata.schedule_builder_days);
    const knownDays = new Set<number>([1, ...Array.from(daySnapshots.keys())]);
    const nextDay = Math.max(...Array.from(knownDays)) + 1;
    const sourceSnapshot =
      (sourceDay <= 1
        ? parseEncodedJsonObject(trainingMetadata.schedule_builder_snapshot)
        : parseEncodedJsonObject(daySnapshots.get(sourceDay) || "")) ||
      parseEncodedJsonObject(trainingMetadata.schedule_builder_snapshot);
    const now = new Date().toISOString();

    const shouldCloneScheduleMetadata =
      copyDayStructure && (copyScheduleRhythm || copyCases || copyLearnerGroups || copyRoomStructure);

    if (shouldCloneScheduleMetadata && sourceSnapshot) {
      const shiftedSnapshot = shiftScheduleSnapshot({
        snapshot: sourceSnapshot,
        newDate,
        targetStartTime: startStoredTime,
        savedAt: now,
      });
      daySnapshots.set(nextDay, encodeJsonObject(shiftedSnapshot));
    }

    if (!daySnapshots.has(nextDay)) {
      daySnapshots.set(
        nextDay,
        encodeJsonObject({
          eventDate: newDate,
          startTime: asText(body?.startTime),
          scheduleStatus: "draft",
          savedAt: now,
          resolvedRounds: [],
        })
      );
    }

    const snapshotSessions =
      shouldCloneScheduleMetadata && sourceSnapshot
        ? buildSessionsFromSnapshot(
            shiftScheduleSnapshot({
              snapshot: sourceSnapshot,
              newDate,
              targetStartTime: startStoredTime,
              savedAt: now,
            }),
            newLocation || event.location
          )
        : [];

    const clonedSourceSessions =
      copyDayStructure && !snapshotSessions.length
        ? buildSessionsFromSourceSessions({
            sourceSessions: sourceSessionsForDay,
            newDate,
            targetStartTime: startStoredTime,
            location: newLocation || event.location,
          })
        : [];

    const manualFallbackSessions =
      !snapshotSessions.length && !clonedSourceSessions.length && startStoredTime
        ? [
            {
              session_date: newDate,
              start_time: startStoredTime,
              end_time: endStoredTime,
              location: newLocation || event.location,
              room: null,
            },
          ]
        : [];

    const sessionRowsToInsert = (snapshotSessions.length ? snapshotSessions : clonedSourceSessions.length ? clonedSourceSessions : manualFallbackSessions)
      .filter((session) => session.session_date && session.start_time);

    if (!sessionRowsToInsert.length) {
      return applyAuthCookies(
        NextResponse.json({ error: "No session structure could be built for the extra date." }, { status: 400 }),
        viewer
      );
    }

    const nextVisibleNotes = appendExtraDayNotes(event.notes, newDate, notes);
    const nextNotes = upsertEventMetadata(nextVisibleNotes, {
      training: {
        schedule_builder_days: serializeScheduleBuilderDays(daySnapshots),
      },
      eventTypes: parsedEventMetadata.eventTypes,
    });

    const { error: sessionInsertError } = await supabaseServer.from("event_sessions").insert(
      sessionRowsToInsert.map((session) => ({
        event_id: eventId,
        session_date: session.session_date,
        start_time: session.start_time,
        end_time: session.end_time,
        location: session.location,
        room: session.room,
      }))
    );

    if (sessionInsertError) {
      return applyAuthCookies(
        NextResponse.json({ error: sessionInsertError.message || "Could not add the new event day sessions." }, { status: 500 }),
        viewer
      );
    }

    const { error: eventUpdateError } = await supabaseServer
      .from("events")
      .update({ notes: nextNotes || null })
      .eq("id", eventId);

    if (eventUpdateError) {
      return applyAuthCookies(
        NextResponse.json({ error: eventUpdateError.message || "Could not save the new schedule day metadata." }, { status: 500 }),
        viewer
      );
    }

    return applyAuthCookies(
      NextResponse.json(
        {
          nextDay,
          date: newDate,
          builderUrl: `/events/${encodeURIComponent(eventId)}/schedule-builder?day=${nextDay}&scheduleDay=${nextDay}`,
        },
        { status: 201 }
      ),
      viewer
    );
  } catch (error) {
    return applyAuthCookies(
      NextResponse.json({ error: `Supabase request failed: ${getErrorMessage(error)}` }, { status: 500 }),
      viewer
    );
  }
}
