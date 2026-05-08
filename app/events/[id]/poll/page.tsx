"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import SiteShell from "../../../components/SiteShell";
import { signOutUserAndRedirect } from "../../../lib/clientAuth";
import { formatHumanDate } from "../../../lib/eventDateUtils";
import { formatDisplayTime } from "../../../lib/timeFormat";

type PollEvent = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  location: string | null;
};

type PollSession = {
  id: string;
  event_id: string | null;
  session_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  room: string | null;
  created_at: string | null;
};

type PollResponseData = {
  assignmentId: string | null;
  current: "available" | "maybe" | "not_available" | null;
  note: string;
  submittedAt: string | null;
  assignmentStatus: string | null;
};

type PollPayload = {
  viewerRole: "sp" | "sim_op" | "admin" | "super_admin" | "unknown";
  isLoggedIn: boolean;
  event: PollEvent;
  sessions: PollSession[];
  sp: {
    id: string;
    name: string;
    email: string;
  };
  poll: {
    status: string;
    createdAt: string | null;
    sentAt: string | null;
  };
  response: PollResponseData;
  access: {
    zoomUrl: string | null;
    trainingPassword: string | null;
  };
  canRespond: boolean;
  responseAccessMessage: string;
};

const cardStyle: React.CSSProperties = {
  background: "var(--cfsp-surface)",
  border: "1px solid var(--cfsp-border)",
  borderRadius: "20px",
  padding: "16px",
  boxShadow: "var(--cfsp-shadow)",
};

const statCardStyle: React.CSSProperties = {
  border: "1px solid var(--cfsp-border)",
  borderRadius: "14px",
  padding: "12px",
  background: "var(--cfsp-surface-muted)",
};

const labelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  textTransform: "uppercase",
  color: "var(--cfsp-text-muted)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--cfsp-border-strong)",
  borderRadius: "12px",
  padding: "10px 12px",
  color: "var(--cfsp-text)",
  background: "var(--cfsp-surface)",
  boxSizing: "border-box",
  resize: "vertical",
  minHeight: "92px",
  font: "inherit",
};

const optionStyles: Record<NonNullable<PollResponseData["current"]>, React.CSSProperties> = {
  available: {
    background: "var(--cfsp-green-soft)",
    color: "var(--cfsp-green)",
    border: "1px solid rgba(44, 211, 173, 0.24)",
  },
  maybe: {
    background: "var(--cfsp-warning-soft)",
    color: "var(--cfsp-warning)",
    border: "1px solid rgba(243, 187, 103, 0.24)",
  },
  not_available: {
    background: "var(--cfsp-danger-soft)",
    color: "var(--cfsp-danger)",
    border: "1px solid var(--cfsp-danger-border)",
  },
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function formatSessionSummary(session: PollSession) {
  const dateLabel = session.session_date ? formatHumanDate(session.session_date) || session.session_date : "Date TBD";
  const timeLabel =
    session.start_time || session.end_time
      ? `${formatDisplayTime(session.start_time)}${session.end_time ? ` - ${formatDisplayTime(session.end_time)}` : ""}`
      : "Time TBD";
  const locationLabel = asText(session.location) || asText(session.room) || "";

  return [dateLabel, timeLabel, locationLabel].filter(Boolean).join(" · ");
}

function formatSubmittedAt(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function EventPollResponsePage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id || "";
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [payload, setPayload] = useState<PollPayload | null>(null);
  const [selectedResponse, setSelectedResponse] = useState<PollResponseData["current"]>(null);
  const [note, setNote] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;

    async function load() {
      setLoading(true);
      setErrorMessage("");
      try {
        const response = await fetch(`/api/events/${encodeURIComponent(id)}/poll-response`, {
          cache: "no-store",
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body?.error || "Could not load the poll response page.");
        }
        if (!active) return;
        setPayload(body as PollPayload);
        setSelectedResponse((body as PollPayload).response?.current || null);
        setNote((body as PollPayload).response?.note || "");
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Could not load the poll response page.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [id]);

  const sessionSummaries = useMemo(
    () => (payload?.sessions || []).map((session) => ({ id: session.id, summary: formatSessionSummary(session) })),
    [payload]
  );

  async function handleSubmit() {
    if (!id || !selectedResponse) {
      setErrorMessage("Choose Available, Not Available, or Maybe / Need to discuss.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch(`/api/events/${encodeURIComponent(id)}/poll-response`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          response: selectedResponse,
          note,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || "Could not save your availability response.");
      }

      setPayload((current) =>
        current
          ? {
              ...current,
              response: body.response,
            }
          : current
      );
      setSuccessMessage("Availability saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save your availability response.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SiteShell
      title="SP Availability Poll"
      subtitle="Submit your availability in CFSP without exposing staffing controls or other operational data."
    >
      <section style={cardStyle}>
        <Link href="/events" style={{ color: "var(--cfsp-blue)", fontWeight: 900, textDecoration: "none" }}>
          ← Back to My Events
        </Link>
      </section>

      {loading ? (
        <section style={cardStyle}>Loading your poll response page…</section>
      ) : errorMessage ? (
        <section style={{ ...cardStyle, borderColor: "var(--cfsp-danger-border)", color: "var(--cfsp-danger)" }}>
          {errorMessage}
        </section>
      ) : !payload ? (
        <section style={cardStyle}>This poll could not be loaded.</section>
      ) : (
        <>
          <section style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "flex-start" }}>
              <div>
                <div style={labelStyle}>Event</div>
                <h1 style={{ margin: "6px 0 0", fontSize: "28px", color: "var(--cfsp-text)" }}>
                  {payload.event.name || "Availability poll"}
                </h1>
                <div style={{ marginTop: "8px", color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                  Submit your availability below. This does not guarantee assignment.
                </div>
              </div>
              {payload.response.current ? (
                <div
                  style={{
                    borderRadius: "999px",
                    padding: "7px 12px",
                    fontSize: "12px",
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    ...optionStyles[payload.response.current],
                  }}
                >
                  {payload.response.current === "not_available"
                    ? "Not available"
                    : payload.response.current === "available"
                      ? "Available"
                      : "Maybe / Need to discuss"}
                </div>
              ) : null}
            </div>
          </section>

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
            }}
          >
            <div style={statCardStyle}>
              <div style={labelStyle}>Date / time</div>
              <div style={{ marginTop: "8px", display: "grid", gap: "8px", color: "var(--cfsp-text)", fontWeight: 800 }}>
                {sessionSummaries.length === 0 ? (
                  <div>{payload.event.date_text || "Date/time will be posted soon."}</div>
                ) : (
                  sessionSummaries.map((entry) => <div key={entry.id}>{entry.summary}</div>)
                )}
              </div>
            </div>

            <div style={statCardStyle}>
              <div style={labelStyle}>Location / access</div>
              <div style={{ marginTop: "8px", display: "grid", gap: "8px", color: "var(--cfsp-text)", fontWeight: 800 }}>
                <div>{payload.event.location || "Location will be posted soon."}</div>
                {payload.access.zoomUrl ? (
                  <a
                    href={payload.access.zoomUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--cfsp-blue)", textDecoration: "none" }}
                  >
                    Open Zoom / virtual access
                  </a>
                ) : null}
                {payload.access.trainingPassword ? (
                  <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                    Password: {payload.access.trainingPassword}
                  </div>
                ) : null}
              </div>
            </div>

            <div style={statCardStyle}>
              <div style={labelStyle}>Instructions</div>
              <div style={{ marginTop: "8px", color: "var(--cfsp-text-muted)", fontWeight: 700, lineHeight: 1.6 }}>
                Use this link to view the poll. You’ll be asked to log in or create an SP account before submitting your
                response. Once signed in as an SP, choose the option that best matches your availability and add a note if
                timing or follow-up details would help the simulation team.
              </div>
            </div>
          </section>

          <section style={{ ...cardStyle, marginTop: "14px" }}>
            {!payload.isLoggedIn ? (
              <>
                <div style={labelStyle}>Respond</div>
                <div style={{ marginTop: "8px", color: "var(--cfsp-text-muted)", fontWeight: 700, lineHeight: 1.6 }}>
                  {payload.responseAccessMessage}
                </div>
                <div style={{ marginTop: "16px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <Link
                    href="/login"
                    className="cfsp-btn cfsp-btn-primary"
                    style={{ textDecoration: "none" }}
                  >
                    Log in to respond
                  </Link>
                  <Link
                    href="/signup"
                    className="cfsp-btn cfsp-btn-secondary"
                    style={{ textDecoration: "none" }}
                  >
                    Create SP account to respond
                  </Link>
                </div>
              </>
            ) : !payload.canRespond ? (
              <>
                <div style={labelStyle}>Respond</div>
                <div style={{ marginTop: "8px", color: "var(--cfsp-text-muted)", fontWeight: 700, lineHeight: 1.6 }}>
                  {payload.responseAccessMessage}
                </div>
                <div style={{ marginTop: "16px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {payload.viewerRole !== "sp" ? (
                    <Link
                      href="/signup"
                      className="cfsp-btn cfsp-btn-secondary"
                      style={{ textDecoration: "none" }}
                    >
                      Create SP account
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setSigningOut(true);
                      void signOutUserAndRedirect().catch(() => setSigningOut(false));
                    }}
                    disabled={signingOut}
                    className="cfsp-btn cfsp-btn-secondary"
                  >
                    {signingOut ? "Signing out..." : "Sign out"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={labelStyle}>Your availability</div>
                <div style={{ marginTop: "12px", display: "grid", gap: "10px" }}>
                  {(
                    [
                      { key: "available", label: "Available" },
                      { key: "maybe", label: "Maybe / Need to discuss" },
                      { key: "not_available", label: "Not Available" },
                    ] as const
                  ).map((option) => {
                    const active = selectedResponse === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setSelectedResponse(option.key)}
                        style={{
                          ...optionStyles[option.key],
                          borderRadius: "14px",
                          padding: "12px 14px",
                          textAlign: "left",
                          fontWeight: 900,
                          cursor: "pointer",
                          opacity: active ? 1 : 0.82,
                          boxShadow: active ? "0 0 0 2px rgba(61, 201, 184, 0.2) inset" : "none",
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                <div style={{ marginTop: "14px" }}>
                  <label style={labelStyle} htmlFor="poll-note">
                    Optional note
                  </label>
                  <textarea
                    id="poll-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Add timing conflicts, partial availability, or anything the sim team should know."
                    style={{ ...inputStyle, marginTop: "8px" }}
                  />
                </div>

                {payload.response.submittedAt ? (
                  <div style={{ marginTop: "12px", color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                    Last submitted {formatSubmittedAt(payload.response.submittedAt)}
                  </div>
                ) : null}

                {successMessage ? (
                  <div style={{ marginTop: "12px", color: "var(--cfsp-green)", fontWeight: 800 }}>{successMessage}</div>
                ) : null}

                <div style={{ marginTop: "16px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void handleSubmit()}
                    disabled={saving || !selectedResponse}
                    style={{
                      border: "1px solid var(--cfsp-blue)",
                      borderRadius: "12px",
                      background: "var(--cfsp-blue)",
                      color: "#ffffff",
                      cursor: saving || !selectedResponse ? "not-allowed" : "pointer",
                      fontWeight: 900,
                      padding: "10px 14px",
                      opacity: saving || !selectedResponse ? 0.7 : 1,
                    }}
                  >
                    {saving ? "Saving..." : "Submit Availability"}
                  </button>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </SiteShell>
  );
}
