import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_ACCESS_COOKIE } from "../../lib/authCookies";
import { getDateSortValue, getImportedYearHint, normalizeLooseDateToIso } from "../../lib/eventDateUtils";
import { getProfileForUser, getProfilesByIds } from "../../lib/profileServer";
import { createSupabaseServerClient } from "../../lib/supabaseServerClient";

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

function normalizeRole(value: unknown) {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "sp" || role === "sim_op" || role === "admin" || role === "super_admin") {
    return role;
  }
  return "sp";
}

function getEffectiveRole(email: unknown, role: unknown) {
  const normalizedEmail = asText(email).toLowerCase();
  const localPart = normalizedEmail.split("@")[0] || "";
  if (localPart === "cory.brodsky") return "super_admin";
  return normalizeRole(role);
}

function normalizeEmail(value: unknown) {
  return asText(value).toLowerCase();
}

function normalizeMatchValue(value: unknown) {
  return asText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

type EventApiRow = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  sp_needed: number | null;
  visibility: string | null;
  location: string | null;
  notes: string | null;
  created_at: string | null;
  owner_id?: string | null;
  owner_name?: string | null;
  schedule_owner_text?: string | null;
};

type ViewerContext = {
  id: string;
  email: string;
  role: string;
  fullName: string;
  scheduleName: string;
};

type AssignmentApiRow = {
  id: string;
  event_id: string | null;
  sp_id: string | null;
  status: string | null;
  confirmed: boolean | null;
};

type AssignedSpApiRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  working_email?: string | null;
  email?: string | null;
};

function extractScheduleOwnerText(notes: string | null) {
  const match = asText(notes).match(/(?:^|\n)Event Lead\/Team:\s*(.+?)(?:\n|$)/i);
  return match ? asText(match[1]) || null : null;
}

async function getAuthenticatedUserId() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value;

  if (!accessToken) return "";

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) return "";
  return user.id;
}

async function getAuthenticatedViewer(): Promise<ViewerContext | null> {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value;

    if (!accessToken) return null;

    const supabase = createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(accessToken);

    if (error || !user) return null;

    const profileResult = await getProfileForUser(user.id, accessToken);
    const profile = profileResult.profile;
    const email = asText(profile?.email) || asText(user.email);

    return {
      id: user.id,
      email,
      role: getEffectiveRole(email, profile?.role || user.user_metadata?.role),
      fullName: asText(profile?.full_name) || asText(user.user_metadata?.full_name),
      scheduleName: asText(profile?.schedule_name) || asText(user.user_metadata?.schedule_name),
    };
  } catch {
    return null;
  }
}

function getViewerMatchedSpIds(sps: AssignedSpApiRow[], viewer: ViewerContext) {
  const emailCandidates = new Set([normalizeEmail(viewer.email)].filter(Boolean));
  const nameCandidates = new Set(
    [normalizeMatchValue(viewer.fullName), normalizeMatchValue(viewer.scheduleName)].filter(Boolean)
  );

  return sps
    .filter((sp) => {
      const spEmails = [normalizeEmail(sp.working_email), normalizeEmail(sp.email)].filter(Boolean);
      const spName =
        normalizeMatchValue(sp.full_name) ||
        normalizeMatchValue([sp.first_name, sp.last_name].map(asText).filter(Boolean).join(" "));

      return spEmails.some((email) => emailCandidates.has(email)) || (spName && nameCandidates.has(spName));
    })
    .map((sp) => sp.id);
}

export async function GET() {
  try {
    const supabaseServer = createSupabaseServerClient();
<<<<<<< HEAD
    const viewer = await getAuthenticatedViewer();
    if (!viewer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

=======
>>>>>>> restore-working-login
    const baseSelect = "id,name,status,date_text,sp_needed,visibility,location,notes,created_at";
    const ownerSelect = `${baseSelect},owner_id`;
    let data: EventApiRow[] | null = null;
    let error: { message?: string | null } | null = null;

    const ownerResult = await supabaseServer
      .from("events")
      .select(ownerSelect)
      .order("created_at", { ascending: false });

    if (ownerResult.error && /column .*owner_id.*does not exist/i.test(ownerResult.error.message)) {
      const fallbackResult = await supabaseServer
        .from("events")
        .select(baseSelect)
        .order("created_at", { ascending: false });
      data = (fallbackResult.data as EventApiRow[] | null) || null;
      error = fallbackResult.error;
    } else {
      data = (ownerResult.data as EventApiRow[] | null) || null;
      error = ownerResult.error;
    }

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
          .select("id,first_name,last_name,full_name,working_email,email")
          .in("id", assignedSpIds)
      : { data: [], error: null };

    if (spsError) {
      return NextResponse.json(
        { error: spsError.message || "Could not load assigned SP names from Supabase." },
        { status: 500 }
      );
    }

    const assignmentRows = (assignments || []) as AssignmentApiRow[];
    const sessionRows = sessions || [];
    const ownerIds = Array.from(new Set((data || []).map((event) => asText(event.owner_id)).filter(Boolean)));
    const ownerProfilesResult = await getProfilesByIds(ownerIds);
    const ownerNameById = new Map(
      ownerProfilesResult.profiles.map((profile) => [
        profile.id,
        asText(profile.full_name) || asText(profile.email) || "Assigned user",
      ])
    );
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
        owner_id: asText(event.owner_id) || null,
        owner_name: ownerNameById.get(asText(event.owner_id)) || null,
        schedule_owner_text: extractScheduleOwnerText(event.notes),
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

    if (viewer.role === "sp") {
      const matchedSpIds = new Set(getViewerMatchedSpIds((sps || []) as AssignedSpApiRow[], viewer));
      const allowedEventIds = new Set(
        assignmentRows
          .filter((assignment) => matchedSpIds.has(asText(assignment.sp_id)))
          .map((assignment) => asText(assignment.event_id))
          .filter(Boolean)
      );

      return NextResponse.json({
        events: eventsWithCoverage.filter((event) => allowedEventIds.has(event.id)),
        assignments: assignmentRows.filter((assignment) => allowedEventIds.has(asText(assignment.event_id))),
      });
    }

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
    const supabaseServer = createSupabaseServerClient();
    const body = await request.json();
    const name = asText(body?.name);
    const ownerId = await getAuthenticatedUserId();

    if (!name) {
      return NextResponse.json({ error: "Event name is required." }, { status: 400 });
    }

    const payload: {
      name: string;
      status: string;
      date_text: string | null;
      sp_needed: number;
      visibility: string;
      owner_id?: string;
    } = {
      name,
      status: asText(body?.status) || "Needs SPs",
      date_text: asText(body?.date_text) || null,
      sp_needed: parseNumber(body?.sp_needed),
      visibility: asText(body?.visibility) || "team",
    };
    if (ownerId) payload.owner_id = ownerId;

    let insertResult = await supabaseServer
      .from("events")
      .insert(payload)
      .select("id,name,status,date_text,sp_needed,visibility,location,notes,created_at,owner_id")
      .single();

    if (insertResult.error && /column .*owner_id.*does not exist/i.test(insertResult.error.message)) {
      const fallbackPayload = {
        name,
        status: asText(body?.status) || "Needs SPs",
        date_text: asText(body?.date_text) || null,
        sp_needed: parseNumber(body?.sp_needed),
        visibility: asText(body?.visibility) || "team",
      };
      insertResult = await supabaseServer
        .from("events")
        .insert(fallbackPayload)
        .select("id,name,status,date_text,sp_needed,visibility,location,notes,created_at")
        .single();
    }

    const { data, error } = insertResult;

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
