import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabaseServerClient";

export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown Supabase error";
}

function getRouteId(params: { id?: string | string[] }) {
  const raw = params.id;
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
}

function getSafeAssignmentUpdates(rawUpdates: unknown) {
  if (!rawUpdates || typeof rawUpdates !== "object") return null;

  const source = rawUpdates as Record<string, unknown>;
  const updates: Record<string, string | boolean | null> = {};

  if (typeof source.status === "string") updates.status = source.status;
  if (typeof source.confirmed === "boolean") updates.confirmed = source.confirmed;
  if (typeof source.notes === "string" || source.notes === null) updates.notes = source.notes;
  if (typeof source.last_contacted_at === "string" || source.last_contacted_at === null) {
    updates.last_contacted_at = source.last_contacted_at;
  }
  if (typeof source.contact_method === "string" || source.contact_method === null) {
    updates.contact_method = source.contact_method;
  }

  return Object.keys(updates).length ? updates : null;
}

function getSafeEventUpdates(rawUpdates: unknown) {
  if (!rawUpdates || typeof rawUpdates !== "object") return null;

  const source = rawUpdates as Record<string, unknown>;
  const updates: Record<string, string | number | null> = {};

  if (typeof source.name === "string") updates.name = source.name.trim() || null;
  if (typeof source.status === "string") updates.status = source.status.trim() || null;
  if (typeof source.visibility === "string") updates.visibility = source.visibility.trim() || null;
  if (typeof source.location === "string") updates.location = source.location.trim() || null;
  if (typeof source.notes === "string" || source.notes === null) {
    updates.notes = typeof source.notes === "string" ? source.notes.trim() || null : null;
  }
  if (typeof source.sp_needed === "number" && Number.isFinite(source.sp_needed)) {
    updates.sp_needed = Math.max(0, Math.round(source.sp_needed));
  }

  return Object.keys(updates).length ? updates : null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  try {
    const supabaseServer = createSupabaseServerClient();
    const params = await context.params;
    const eventId = getRouteId(params);

    if (!eventId) {
      return NextResponse.json({ error: "Missing event id." }, { status: 400 });
    }

    const { data: event, error: eventError } = await supabaseServer
      .from("events")
      .select("id,name,status,date_text,sp_needed,visibility,location,notes,created_at")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) {
      return NextResponse.json(
        { error: eventError.message || "Could not load event from Supabase." },
        { status: 500 }
      );
    }

    if (!event) {
      return NextResponse.json({ error: "Event details were not found." }, { status: 404 });
    }

    const { data: sessions, error: sessionError } = await supabaseServer
      .from("event_sessions")
      .select("id,event_id,session_date,start_time,end_time,location,room,created_at")
      .eq("event_id", eventId)
      .order("session_date", { ascending: true })
      .order("start_time", { ascending: true });

    const { data: sps, error: spError } = await supabaseServer
      .from("sps")
      .select("id,first_name,last_name,full_name,working_email,email,phone,portrayal_age,race,sex,telehealth,pt_preferred,other_roles,speaks_spanish,notes,status");

    if (spError) {
      return NextResponse.json(
        { error: spError.message || "Could not load SPs from Supabase." },
        { status: 500 }
      );
    }

    const assignmentResult = await supabaseServer
      .from("event_sps")
      .select("id,event_id,sp_id,status,confirmed,notes,last_contacted_at,contact_method,created_at")
      .eq("event_id", eventId);
    let assignments: unknown[] | null = assignmentResult.data;
    let assignmentError = assignmentResult.error;

    if (assignmentError) {
      const fallback = await supabaseServer
        .from("event_sps")
        .select("id,event_id,sp_id,status,confirmed,created_at")
        .eq("event_id", eventId);

      assignments = fallback.data;
      assignmentError = fallback.error;
    }

    if (assignmentError) {
      return NextResponse.json(
        { error: assignmentError.message || "Could not load assignments from Supabase." },
        { status: 500 }
      );
    }

    const { data: availabilityRows, error: availabilityError } = await supabaseServer
      .from("sp_availability")
      .select("*")
      .limit(1000);

    return NextResponse.json({
      event,
      sessions: sessions || [],
      sps: [...(sps || [])],
      assignments: assignments || [],
      availabilityRows: availabilityRows || [],
      errorMessage: "",
      sessionErrorMessage: sessionError
        ? sessionError.message || "Could not load event sessions from Supabase."
        : "",
      availabilityErrorMessage: availabilityError
        ? availabilityError.message || "Could not load SP availability from Supabase."
        : "",
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Supabase request failed: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  try {
    const supabaseServer = createSupabaseServerClient();
    const params = await context.params;
    const eventId = getRouteId(params);
    const body = await request.json();
    const spId = typeof body?.sp_id === "string" ? body.sp_id : "";

    if (!eventId || !spId) {
      return NextResponse.json({ error: "Missing event id or SP id." }, { status: 400 });
    }

    const { error } = await supabaseServer.from("event_sps").insert({
      event_id: eventId,
      sp_id: spId,
      status: "invited",
      confirmed: false,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Could not save assignment." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: `Supabase request failed: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  try {
    const supabaseServer = createSupabaseServerClient();
    const params = await context.params;
    const eventId = getRouteId(params);
    const body = await request.json();
    const eventUpdates = getSafeEventUpdates(body?.event_updates);
    const assignmentId = typeof body?.assignment_id === "string" ? body.assignment_id : "";
    const updates = getSafeAssignmentUpdates(body?.updates);

    if (eventId && eventUpdates) {
      const { error } = await supabaseServer
        .from("events")
        .update(eventUpdates)
        .eq("id", eventId);

      if (error) {
        return NextResponse.json(
          { error: error.message || "Could not update event details." },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    if (!eventId || !assignmentId || !updates) {
      return NextResponse.json(
        { error: "Missing event id, assignment id, or updates." },
        { status: 400 }
      );
    }

    const { error } = await supabaseServer
      .from("event_sps")
      .update(updates)
      .eq("event_id", eventId)
      .eq("id", assignmentId);

    if (error) {
      return NextResponse.json(
        { error: error.message || "Could not update assignment." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: `Supabase request failed: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  try {
    const supabaseServer = createSupabaseServerClient();
    const params = await context.params;
    const eventId = getRouteId(params);
    const body = await request.json();
    const assignmentId = typeof body?.assignment_id === "string" ? body.assignment_id : "";

    if (!eventId || !assignmentId) {
      return NextResponse.json({ error: "Missing event id or assignment id." }, { status: 400 });
    }

    const { error } = await supabaseServer
      .from("event_sps")
      .delete()
      .eq("event_id", eventId)
      .eq("id", assignmentId);

    if (error) {
      return NextResponse.json(
        { error: error.message || "Could not remove assignment." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: `Supabase request failed: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}
