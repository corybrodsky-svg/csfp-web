import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabaseServerClient";
import { formatHumanDate, getImportedYearHint } from "../../../../lib/eventDateUtils";

export const dynamic = "force-dynamic";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getRouteId(params: { id?: string | string[] }) {
  const raw = params.id;
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown email error";
}

function formatDisplayTime(value?: string | null) {
  const raw = asText(value);
  const match = raw.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) return raw || "Time TBD";

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const normalizedHours = hours % 12 || 12;
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${normalizedHours}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function formatSessionSummary(
  sessions: Array<{ session_date: string | null; start_time: string | null; end_time: string | null }>,
  notes?: string | null
) {
  const fallbackYear = getImportedYearHint(notes);
  if (!sessions.length) return "Date TBD";

  return sessions
    .map((session) => {
      const date = formatHumanDate(session.session_date, fallbackYear);
      const time =
        session.start_time && session.end_time
          ? `${formatDisplayTime(session.start_time)} - ${formatDisplayTime(session.end_time)}`
          : formatDisplayTime(session.start_time || session.end_time);
      return `${date} ${time}`.trim();
    })
    .join("; ");
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
    const assignmentId = asText(body?.assignment_id);

    if (!eventId || !assignmentId) {
      return NextResponse.json({ error: "Missing event id or assignment id." }, { status: 400 });
    }

    const { data: event, error: eventError } = await supabaseServer
      .from("events")
      .select("id,name,date_text,location,notes")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError || !event) {
      return NextResponse.json(
        { error: eventError?.message || "Could not load event for poll email." },
        { status: 500 }
      );
    }

    const { data: assignment, error: assignmentError } = await supabaseServer
      .from("event_sps")
      .select("id,event_id,sp_id,status")
      .eq("event_id", eventId)
      .eq("id", assignmentId)
      .maybeSingle();

    if (assignmentError || !assignment) {
      return NextResponse.json(
        { error: assignmentError?.message || "Could not load assignment for poll email." },
        { status: 500 }
      );
    }

    if (asText(assignment.status).toLowerCase() !== "invited") {
      return NextResponse.json(
        { error: "Poll email is only available for invited assignments." },
        { status: 400 }
      );
    }

    const { data: sp, error: spError } = await supabaseServer
      .from("sps")
      .select("id,first_name,last_name,full_name,working_email,email")
      .eq("id", assignment.sp_id)
      .maybeSingle();

    if (spError || !sp) {
      return NextResponse.json(
        { error: spError?.message || "Could not load SP email recipient." },
        { status: 500 }
      );
    }

    const recipient = asText(sp.working_email) || asText(sp.email);
    if (!recipient) {
      return NextResponse.json({ error: "This SP does not have an email address." }, { status: 400 });
    }

    const { data: sessions, error: sessionError } = await supabaseServer
      .from("event_sessions")
      .select("session_date,start_time,end_time")
      .eq("event_id", eventId)
      .order("session_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (sessionError) {
      return NextResponse.json(
        { error: sessionError.message || "Could not load event sessions for poll email." },
        { status: 500 }
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.CFSP_FROM_EMAIL || process.env.RESEND_FROM_EMAIL;

    if (!resendApiKey || !fromEmail) {
      return NextResponse.json(
        {
          error:
            "Poll email sending is not configured. Set RESEND_API_KEY and CFSP_FROM_EMAIL.",
        },
        { status: 501 }
      );
    }

    const spName =
      asText(sp.full_name) ||
      [asText(sp.first_name), asText(sp.last_name)].filter(Boolean).join(" ") ||
      "SP";
    const subject = `CFSP Availability Poll: ${event.name || "Simulation Event"}`;
    const dates = sessions?.length
      ? formatSessionSummary(sessions, event.notes)
      : formatHumanDate(event.date_text, getImportedYearHint(event.notes));
    const bodyText = [
      `Hello ${spName},`,
      "",
      `You are being invited to support ${event.name || "a CFSP event"}.`,
      "",
      `Event: ${event.name || "TBD"}`,
      `Date(s): ${dates || "TBD"}`,
      `Location: ${event.location || "TBD"}`,
      "",
      "Please reply to confirm whether you are available for this event.",
      "",
      "Thank you,",
      "CFSP Simulation Operations",
    ].join("\n");

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipient],
        subject,
        text: bodyText,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      return NextResponse.json(
        { error: `Poll email send failed: ${errorText || emailResponse.statusText}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Poll email sent to ${recipient}.`,
      assignment_id: assignment.id,
      recipient,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Poll email failed: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}
