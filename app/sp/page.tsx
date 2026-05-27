"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../components/SiteShell";

type PortalEventSummary = {
  id: string;
  name: string;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  room?: string | null;
};

type PortalOpeningSummary = {
  id?: string | null;
  title?: string | null;
  shift_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  room?: string | null;
};

type PortalResponseRecord = {
  id: string;
  openingId?: string | null;
  response?: string | null;
  source?: string | null;
  message?: string | null;
  responded_at?: string | null;
  updated_at?: string | null;
  event?: PortalEventSummary | null;
  opening?: PortalOpeningSummary | null;
};

type PortalOpenShift = {
  openingId: string;
  title: string;
  shift_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  room?: string | null;
  needed_count?: number | null;
  requirements?: string | null;
  notes?: string | null;
  event: PortalEventSummary;
  currentResponse?: {
    id?: string | null;
    response?: string | null;
    source?: string | null;
    responded_at?: string | null;
    updated_at?: string | null;
  } | null;
};

type PortalAttendanceRecord = {
  id: string;
  eventId?: string | null;
  status?: string | null;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  updated_at?: string | null;
  event?: PortalEventSummary | null;
};

type PortalUpcomingItem = {
  id: string;
  source?: string | null;
  status?: string | null;
  confirmed?: boolean | null;
  created_at?: string | null;
  response?: string | null;
  openingId?: string | null;
  openingTitle?: string | null;
  shift_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  event?: PortalEventSummary | null;
};

type SpPortalResponse = {
  ok?: boolean;
  sp?: {
    id?: string | null;
    name?: string | null;
  };
  openShifts?: PortalOpenShift[];
  myResponses?: PortalResponseRecord[];
  myAttendance?: PortalAttendanceRecord[];
  upcomingItems?: PortalUpcomingItem[];
  message?: string;
  error?: string;
};

type ShiftResponseApiPayload = {
  ok?: boolean;
  response?: {
    id?: string | null;
    opening_id?: string | null;
    response?: string | null;
    source?: string | null;
    message?: string | null;
    responded_at?: string | null;
    updated_at?: string | null;
    event_id?: string | null;
  } | null;
  message?: string;
  error?: string;
};

type PortalState = {
  sp: {
    id: string;
    name: string;
  };
  openShifts: PortalOpenShift[];
  myResponses: PortalResponseRecord[];
  myAttendance: PortalAttendanceRecord[];
  upcomingItems: PortalUpcomingItem[];
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function formatDateLabel(value?: string | null) {
  const text = asText(value);
  if (!text) return "Date TBD";
  const dt = new Date(`${text}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return text;
  return dt.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatTimeLabel(value?: string | null) {
  const text = asText(value);
  if (!text) return "TBD";
  const probe = new Date(`1970-01-01T${text}`);
  if (Number.isNaN(probe.getTime())) return text;
  return probe.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatTimestampLabel(value?: string | null) {
  const text = asText(value);
  if (!text) return "";
  const dt = new Date(text);
  if (Number.isNaN(dt.getTime())) return text;
  return dt.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function timestampSortKey(value?: string | null) {
  const text = asText(value);
  if (!text) return Number.POSITIVE_INFINITY;
  const dt = new Date(text);
  if (Number.isNaN(dt.getTime())) return Number.POSITIVE_INFINITY;
  return dt.getTime();
}

function responseLabel(value: unknown) {
  const status = asText(value).toLowerCase();
  if (status === "accepted") return "Accepted";
  if (status === "maybe") return "Maybe";
  if (status === "declined") return "Declined";
  if (status === "available") return "Available";
  if (status === "withdrawn") return "Withdrawn";
  return "No response";
}

function attendanceLabel(value: unknown) {
  const status = asText(value).toLowerCase();
  if (status === "not_arrived") return "Not arrived";
  if (status === "arrived") return "Arrived";
  if (status === "checked_in") return "Checked in";
  if (status === "checked_out") return "Checked out";
  if (status === "no_show") return "No-show";
  if (status === "excused") return "Excused";
  return "Not arrived";
}

function upcomingStatusLabel(item: PortalUpcomingItem) {
  if (asText(item.source) === "accepted_response") return "Accepted response";
  if (item.confirmed) return "Confirmed assignment";
  const status = asText(item.status).toLowerCase();
  if (status === "confirmed") return "Confirmed assignment";
  if (status === "contacted") return "Contacted";
  if (status === "invited") return "Invited";
  if (status === "backup") return "Backup";
  return "Upcoming";
}

function toPortalState(body: SpPortalResponse): PortalState | null {
  if (!body || body.ok !== true) return null;
  const spId = asText(body.sp?.id);
  if (!spId) return null;
  return {
    sp: {
      id: spId,
      name: asText(body.sp?.name) || "SP",
    },
    openShifts: Array.isArray(body.openShifts) ? body.openShifts : [],
    myResponses: Array.isArray(body.myResponses) ? body.myResponses : [],
    myAttendance: Array.isArray(body.myAttendance) ? body.myAttendance : [],
    upcomingItems: Array.isArray(body.upcomingItems) ? body.upcomingItems : [],
  };
}

export default function SpPortalPage() {
  const router = useRouter();
  const [portal, setPortal] = useState<PortalState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingByOpeningId, setSavingByOpeningId] = useState<Record<string, boolean>>({});
  const [saveFeedbackByOpeningId, setSaveFeedbackByOpeningId] = useState<Record<string, string>>({});

  const loadPortal = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/sp/portal", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const body = (await response.json().catch(() => null)) as SpPortalResponse | null;

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        if (!response.ok || body?.ok !== true) {
          if (asText(body?.error) === "No linked SP profile found") {
            throw new Error(
              "We could not find an SP profile linked to your account. Please contact your simulation program coordinator."
            );
          }
          const message = asText(body?.message || body?.error) || `Could not load the SP portal (${response.status}).`;
          throw new Error(message);
        }

        const nextState = toPortalState(body);
        if (!nextState) throw new Error("SP portal data is unavailable.");
        setPortal(nextState);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load the SP portal.");
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    void loadPortal();
  }, [loadPortal]);

  const sortedResponses = useMemo(() => {
    if (!portal) return [];
    return [...portal.myResponses].sort((a, b) => asText(b.updated_at || b.responded_at).localeCompare(asText(a.updated_at || a.responded_at)));
  }, [portal]);

  const sortedAttendance = useMemo(() => {
    if (!portal) return [];
    return [...portal.myAttendance].sort((a, b) => {
      const aKey = timestampSortKey(a.checked_in_at || a.updated_at);
      const bKey = timestampSortKey(b.checked_in_at || b.updated_at);
      if (aKey !== bKey) return bKey - aKey;
      return asText(a.event?.name).localeCompare(asText(b.event?.name));
    });
  }, [portal]);

  async function saveShiftResponse(shift: PortalOpenShift, nextResponse: "accepted" | "maybe" | "declined") {
    const openingId = asText(shift.openingId);
    const eventId = asText(shift.event?.id);
    if (!openingId || !eventId) return;

    setSavingByOpeningId((prev) => ({ ...prev, [openingId]: true }));
    setSaveFeedbackByOpeningId((prev) => ({ ...prev, [openingId]: "" }));

    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/shift-responses`, {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          openingId,
          response: nextResponse,
          source: "portal",
        }),
      });
      const body = (await response.json().catch(() => null)) as ShiftResponseApiPayload | null;
      if (!response.ok || body?.ok === false) {
        throw new Error(asText(body?.message || body?.error) || `Could not save response (${response.status}).`);
      }

      setPortal((current) => {
        if (!current) return current;

        const savedResponse = body?.response;
        const savedRecord: PortalResponseRecord = {
          id: asText(savedResponse?.id) || `${openingId}:${Date.now()}`,
          openingId,
          response: asText(savedResponse?.response) || nextResponse,
          source: asText(savedResponse?.source) || "portal",
          message: asText(savedResponse?.message) || null,
          responded_at: asText(savedResponse?.responded_at) || new Date().toISOString(),
          updated_at: asText(savedResponse?.updated_at) || new Date().toISOString(),
          event: shift.event,
          opening: {
            id: openingId,
            title: shift.title,
            shift_date: shift.shift_date || null,
            start_time: shift.start_time || null,
            end_time: shift.end_time || null,
            location: shift.location || null,
            room: shift.room || null,
          },
        };

        const nextOpenShifts = current.openShifts.map((item) =>
          asText(item.openingId) !== openingId
            ? item
            : {
                ...item,
                currentResponse: {
                  id: savedRecord.id,
                  response: savedRecord.response || nextResponse,
                  source: savedRecord.source || "portal",
                  responded_at: savedRecord.responded_at || new Date().toISOString(),
                  updated_at: savedRecord.updated_at || new Date().toISOString(),
                },
              }
        );

        const withoutCurrentOpening = current.myResponses.filter((item) => asText(item.openingId) !== openingId);
        const nextResponses = [savedRecord, ...withoutCurrentOpening];
        const nextUpcomingItems = [...current.upcomingItems];
        const existingUpcomingIndex = nextUpcomingItems.findIndex((item) => asText(item.openingId) === openingId);

        if (nextResponse === "accepted") {
          const acceptedUpcoming: PortalUpcomingItem = {
            id: savedRecord.id,
            source: "accepted_response",
            response: "accepted",
            openingId,
            openingTitle: shift.title,
            shift_date: shift.shift_date || null,
            start_time: shift.start_time || null,
            end_time: shift.end_time || null,
            event: shift.event,
          };
          if (existingUpcomingIndex >= 0) nextUpcomingItems[existingUpcomingIndex] = acceptedUpcoming;
          else nextUpcomingItems.push(acceptedUpcoming);
        } else if (existingUpcomingIndex >= 0 && asText(nextUpcomingItems[existingUpcomingIndex]?.source) === "accepted_response") {
          nextUpcomingItems.splice(existingUpcomingIndex, 1);
        }

        return {
          ...current,
          openShifts: nextOpenShifts,
          myResponses: nextResponses,
          upcomingItems: nextUpcomingItems,
        };
      });

      setSaveFeedbackByOpeningId((prev) => ({ ...prev, [openingId]: "Saved ✓" }));
      window.setTimeout(() => {
        setSaveFeedbackByOpeningId((prev) => ({ ...prev, [openingId]: "" }));
      }, 2200);
      void loadPortal({ silent: true });
    } catch (err) {
      setSaveFeedbackByOpeningId((prev) => ({
        ...prev,
        [openingId]: err instanceof Error ? err.message : "Could not save your response.",
      }));
    } finally {
      setSavingByOpeningId((prev) => ({ ...prev, [openingId]: false }));
    }
  }

  return (
    <SiteShell title="My SP Portal" subtitle="Review open shifts, share your availability, and track your own attendance status.">
      <main style={{ display: "grid", gap: 16 }}>
        <section className="cfsp-panel-muted" style={{ borderRadius: 14, border: "1px solid var(--cfsp-border)", padding: 16 }}>
          <h2 style={{ margin: 0, fontSize: "1.25rem", color: "var(--cfsp-text)" }}>My SP Portal</h2>
          <p style={{ margin: "8px 0 0", color: "var(--cfsp-text-muted)", maxWidth: 820 }}>
            Click Accept if you are available and would like to work this shift. Your response has been saved. Staff will confirm final assignments. If you made a mistake, you can change your response.
          </p>
          {portal?.sp?.name ? (
            <p style={{ margin: "10px 0 0", color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
              Signed in as <strong style={{ color: "var(--cfsp-text)" }}>{portal.sp.name}</strong>
            </p>
          ) : null}
        </section>

        {error ? <div className="cfsp-alert cfsp-alert-error">{error}</div> : null}

        {loading ? (
          <div className="cfsp-panel" style={{ padding: 18, color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
            Loading your SP portal...
          </div>
        ) : null}

        {!loading && portal ? (
          <>
            <section className="cfsp-panel" style={{ padding: 18, display: "grid", gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: "1.12rem", color: "var(--cfsp-text)" }}>Open Shifts</h3>
              {portal.openShifts.length === 0 ? (
                <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>No open shifts are available right now.</div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {portal.openShifts.map((shift) => {
                    const openingId = asText(shift.openingId);
                    const saving = Boolean(savingByOpeningId[openingId]);
                    const feedback = asText(saveFeedbackByOpeningId[openingId]);
                    const responseText = responseLabel(shift.currentResponse?.response);
                    return (
                      <article
                        key={openingId}
                        className="cfsp-panel-muted"
                        style={{ border: "1px solid var(--cfsp-border)", borderRadius: 12, padding: 14, display: "grid", gap: 8 }}
                      >
                        <div style={{ display: "grid", gap: 3 }}>
                          <div style={{ fontWeight: 850, fontSize: "1.04rem", color: "var(--cfsp-text)" }}>{asText(shift.event?.name) || "CFSP Event"}</div>
                          <div style={{ color: "var(--cfsp-text)", fontWeight: 700 }}>Shift: {asText(shift.title) || "Standardized Patient Shift"}</div>
                          <div style={{ color: "var(--cfsp-text-muted)" }}>
                            {formatDateLabel(shift.shift_date || shift.event?.date)} · {formatTimeLabel(shift.start_time)} - {formatTimeLabel(shift.end_time)}
                          </div>
                          <div style={{ color: "var(--cfsp-text-muted)" }}>
                            {asText(shift.location || shift.event?.location) || "Location TBD"}
                            {asText(shift.room) ? ` · ${asText(shift.room)}` : ""}
                          </div>
                        </div>
                        {asText(shift.requirements) ? (
                          <div style={{ color: "var(--cfsp-text)", fontSize: "0.92rem" }}>
                            <strong>Requirements:</strong> {asText(shift.requirements)}
                          </div>
                        ) : null}
                        {asText(shift.notes) ? (
                          <div style={{ color: "var(--cfsp-text)", fontSize: "0.92rem" }}>
                            <strong>Notes:</strong> {asText(shift.notes)}
                          </div>
                        ) : null}
                        <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>Current response: {responseText}</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button type="button" className="cfsp-btn cfsp-btn-success" disabled={saving} onClick={() => void saveShiftResponse(shift, "accepted")}>
                            {saving ? "Saving..." : "Accept"}
                          </button>
                          <button type="button" className="cfsp-btn cfsp-btn-secondary" disabled={saving} onClick={() => void saveShiftResponse(shift, "maybe")}>
                            Maybe
                          </button>
                          <button type="button" className="cfsp-btn cfsp-btn-subtle" disabled={saving} onClick={() => void saveShiftResponse(shift, "declined")}>
                            Decline
                          </button>
                          {feedback ? (
                            <span style={{ alignSelf: "center", color: feedback === "Saved ✓" ? "var(--cfsp-green)" : "var(--cfsp-danger)", fontWeight: 800 }}>
                              {feedback}
                            </span>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="cfsp-panel" style={{ padding: 18, display: "grid", gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: "1.12rem", color: "var(--cfsp-text)" }}>My Responses</h3>
              <p style={{ margin: 0, color: "var(--cfsp-text-muted)" }}>
                Staff will confirm final assignments. You can change your response if needed.
              </p>
              {sortedResponses.length === 0 ? (
                <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>You have not responded to any shifts yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {sortedResponses.map((response) => (
                    <article
                      key={response.id}
                      className="cfsp-panel-muted"
                      style={{ border: "1px solid var(--cfsp-border)", borderRadius: 12, padding: 12, display: "grid", gap: 6 }}
                    >
                      <div style={{ fontWeight: 800, color: "var(--cfsp-text)" }}>{asText(response.event?.name) || "CFSP Event"}</div>
                      <div style={{ color: "var(--cfsp-text-muted)" }}>
                        {formatDateLabel(response.opening?.shift_date || response.event?.date)} · {formatTimeLabel(response.opening?.start_time)} - {formatTimeLabel(response.opening?.end_time)}
                      </div>
                      <div style={{ color: "var(--cfsp-text-muted)" }}>
                        Response: <strong style={{ color: "var(--cfsp-text)" }}>{responseLabel(response.response)}</strong>
                        {asText(response.updated_at || response.responded_at)
                          ? ` · Saved ${formatTimestampLabel(response.updated_at || response.responded_at)}`
                          : ""}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="cfsp-panel" style={{ padding: 18, display: "grid", gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: "1.12rem", color: "var(--cfsp-text)" }}>My Upcoming Events</h3>
              {portal.upcomingItems.length === 0 ? (
                <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>No upcoming events found.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {portal.upcomingItems.map((item) => (
                    <article
                      key={`${asText(item.source)}:${item.id}`}
                      className="cfsp-panel-muted"
                      style={{ border: "1px solid var(--cfsp-border)", borderRadius: 12, padding: 12, display: "grid", gap: 5 }}
                    >
                      <div style={{ fontWeight: 800, color: "var(--cfsp-text)" }}>{asText(item.event?.name) || "CFSP Event"}</div>
                      <div style={{ color: "var(--cfsp-text-muted)" }}>
                        {formatDateLabel(item.shift_date || item.event?.date)} · {formatTimeLabel(item.start_time || item.event?.start_time)} - {formatTimeLabel(item.end_time || item.event?.end_time)}
                      </div>
                      <div style={{ color: "var(--cfsp-text-muted)" }}>{asText(item.event?.location) || "Location TBD"}</div>
                      <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>{upcomingStatusLabel(item)}</div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="cfsp-panel" style={{ padding: 18, display: "grid", gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: "1.12rem", color: "var(--cfsp-text)" }}>My Attendance Status</h3>
              {sortedAttendance.length === 0 ? (
                <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>No attendance records yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {sortedAttendance.map((record) => (
                    <article
                      key={record.id}
                      className="cfsp-panel-muted"
                      style={{ border: "1px solid var(--cfsp-border)", borderRadius: 12, padding: 12, display: "grid", gap: 6 }}
                    >
                      <div style={{ fontWeight: 800, color: "var(--cfsp-text)" }}>{asText(record.event?.name) || "CFSP Event"}</div>
                      <div style={{ color: "var(--cfsp-text-muted)" }}>
                        {formatDateLabel(record.event?.date)} · {formatTimeLabel(record.event?.start_time)} - {formatTimeLabel(record.event?.end_time)}
                      </div>
                      <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                        Status: <strong style={{ color: "var(--cfsp-text)" }}>{attendanceLabel(record.status)}</strong>
                      </div>
                      {asText(record.checked_in_at) ? (
                        <div style={{ color: "var(--cfsp-text-muted)" }}>
                          Checked in: {new Date(asText(record.checked_in_at)).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </div>
                      ) : null}
                      {asText(record.checked_out_at) ? (
                        <div style={{ color: "var(--cfsp-text-muted)" }}>
                          Checked out: {new Date(asText(record.checked_out_at)).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </SiteShell>
  );
}
