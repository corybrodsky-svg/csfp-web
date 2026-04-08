import { NextResponse } from "next/server";
import { supabaseServer } from "../../lib/supabaseServerClient";
import { getDateSortValue, getImportedYearHint, normalizeLooseDateToIso } from "../../lib/eventDateUtils";

export const dynamic = "force-dynamic";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseNumber(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown Supabase error";
}

function isConfirmedAssignment(assignment: { status: string | null; confirmed: boolean | null }) {
  const status = asText(assignment.status).toLowerCase();
  return status === "confirmed" || (!status && assignment.confirmed === true);
}

export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from("events")
      .select("id,name,status,date_text,sp_needed,visibility,location,notes,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Could not load events from Supabase." },
        { status: 500 }
      );
    }

    const { data: assignments, error: assignmentError } = await supabaseServer
      .from("event_sps")
      .select("id,event_id,sp_id,status,confirmed");

    if (assignmentError) {
      return NextResponse.json(
        { error: assignmentError.message || "Could not load event assignments from Supabase." },
        { status: 500 }
      );
    }

    const { data: sessions, error: sessionError } = await supabaseServer
      .from("event_sessions")
      .select("event_id,session_date")
      .order("session_date", { ascending: true });

    if (sessionError) {
      return NextResponse.json(
        { error: sessionError.message || "Could not load event sessions from Supabase." },
        { status: 500 }
      );
    }

    const assignedSpIds = Array.from(
      new Set((assignments || []).map((assignment) => asText(assignment.sp_id)).filter(Boolean))
    );
    const { data: sps, error: spsError } = assignedSpIds.length
      ? await supabaseServer
          .from("sps")
          .select("id,first_name,last_name,full_name")
          .in("id", assignedSpIds)
      : { data: [], error: null };

    if (spsError) {
      return NextResponse.json(
        { error: spsError.message || "Could not load assigned SP names from Supabase." },
        { status: 500 }
      );
    }

    const assignmentRows = assignments || [];
    const sessionRows = sessions || [];
    const spNameById = new Map(
      (sps || []).map((sp) => {
        const fullName =
          asText(sp.full_name) ||
          [asText(sp.first_name), asText(sp.last_name)].filter(Boolean).join(" ") ||
          "Unnamed SP";
        return [sp.id, fullName];
      })
    );
    const eventsWithCoverage = (data || []).map((event) => {
      const eventAssignments = assignmentRows.filter((assignment) => assignment.event_id === event.id);
      const confirmedAssignments = eventAssignments.filter(isConfirmedAssignment).length;
      const needed = parseNumber(event.sp_needed);
      const eventSessions = sessionRows.filter((session) => session.event_id === event.id);
      const fallbackYear = getImportedYearHint(event.notes);
      const earliestSessionDate =
        eventSessions
          .map((session) => normalizeLooseDateToIso(session.session_date, fallbackYear))
          .filter(Boolean)
          .sort()[0] || null;
      const assignedNames = eventAssignments
        .map((assignment) => spNameById.get(asText(assignment.sp_id)) || "")
        .filter(Boolean)
        .slice(0, 3);

      return {
        ...event,
        earliest_session_date: earliestSessionDate,
        assigned_sp_names: assignedNames,
        total_assignments: eventAssignments.length,
        confirmed_assignments: confirmedAssignments,
        shortage: Math.max(needed - confirmedAssignments, 0),
      };
    }).sort((a, b) => {
      const aDate = getDateSortValue(a.earliest_session_date || a.date_text, getImportedYearHint(a.notes));
      const bDate = getDateSortValue(b.earliest_session_date || b.date_text, getImportedYearHint(b.notes));
      if (aDate !== bDate) return aDate - bDate;
      return asText(a.name).localeCompare(asText(b.name));
    });

    return NextResponse.json({ events: eventsWithCoverage, assignments: assignmentRows });
  } catch (error) {
    return NextResponse.json(
      { error: `Supabase request failed: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = asText(body?.name);

    if (!name) {
      return NextResponse.json({ error: "Event name is required." }, { status: 400 });
    }

    const payload = {
      name,
      status: asText(body?.status) || "Needs SPs",
      date_text: asText(body?.date_text) || null,
      sp_needed: parseNumber(body?.sp_needed),
      visibility: asText(body?.visibility) || "team",
    };

    const { data, error } = await supabaseServer
      .from("events")
      .insert(payload)
      .select("id,name,status,date_text,sp_needed,visibility,location,notes,created_at")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message || "Could not create event in Supabase." },
        { status: 500 }
      );
    }

    return NextResponse.json({ event: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: `Supabase request failed: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}
