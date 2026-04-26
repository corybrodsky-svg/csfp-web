"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../components/SiteShell";
import { classifyEventPresentation } from "../lib/eventClassification";
import { getSimStaffLabel } from "../lib/eventRoster";

type MeResponse = {
  ok: boolean;
  user?: {
    id: string;
    email: string | null;
  };
  profile?: {
    id: string;
    full_name: string;
    schedule_match_name: string;
    role: string;
    status: string;
    email: string;
    profile_picture_url: string;
    notes: string;
  };
  error?: string;
};

type EventRecord = {
  id: string;
  name?: string | null;
  status?: string | null;
  date_text?: string | null;
  location?: string | null;
  sp_needed?: number | null;
  sp_assigned?: number | null;
  assigned_sp_names?: string[] | null;
  visibility?: string | null;
  notes?: string | null;
  sessions?: Array<{
    session_date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    location?: string | null;
    room?: string | null;
  }>;
};

type EventsResponse = {
  ok?: boolean;
  events?: EventRecord[];
  error?: string;
};

type AuthState = "loading" | "authed" | "guest";

type EventWithMeta = {
  event: EventRecord;
  start: Date | null;
  needed: number;
  assigned: number;
  shortage: number;
};

function parseEventStart(event: EventRecord): Date | null {
  const firstSession = Array.isArray(event.sessions) && event.sessions.length > 0 ? event.sessions[0] : null;

  if (firstSession?.session_date) {
    const datePart = firstSession.session_date;
    const timePart = firstSession.start_time || "00:00:00";
    const iso = `${datePart}T${timePart}`;
    const dt = new Date(iso);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  if (event.date_text) {
    const dt = new Date(event.date_text);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  return null;
}

function eventLocation(event: EventRecord): string {
  const firstSession = Array.isArray(event.sessions) && event.sessions.length > 0 ? event.sessions[0] : null;
  return firstSession?.location || firstSession?.room || event.location || "Location TBD";
}

function getStartOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function getStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isTodayOrTomorrow(date: Date | null, startOfToday: number) {
  if (!date) return false;
  const dayStart = getStartOfDay(date);
  const tomorrowStart = startOfToday + 24 * 60 * 60 * 1000;
  return dayStart === startOfToday || dayStart === tomorrowStart;
}

function getWorkflowTone(kind: "shortage" | "partial" | "full") {
  if (kind === "shortage") {
    return { background: "#fff2f1", borderColor: "#efc4c0", color: "#af2f26", label: "Shortage" };
  }
  if (kind === "partial") {
    return { background: "#fff6e8", borderColor: "#f1d1a7", color: "#a86411", label: "Partial" };
  }
  return { background: "#eaf7f2", borderColor: "#bfe4d6", color: "#196b57", label: "Full" };
}

function getEventCoverageTone(event: EventWithMeta) {
  if (event.shortage > 0 && event.assigned === 0) return getWorkflowTone("shortage");
  if (event.shortage > 0) return getWorkflowTone("partial");
  return getWorkflowTone("full");
}

function formatEventDate(start: Date | null, fallback?: string | null) {
  return start ? start.toLocaleString() : fallback || "Date TBD";
}

function getEventTypeLabel(event: EventRecord) {
  return classifyEventPresentation({
    name: event.name,
    status: event.status,
    notes: event.notes,
    location: event.location,
    spNeeded: event.sp_needed,
    assignmentCount: event.sp_assigned,
    confirmedCount: event.sp_assigned,
  }).primaryBadgeLabel;
}

function renderAssignedPeople(names?: string[] | null) {
  const preview = (names || []).filter(Boolean).slice(0, 4);

  if (!preview.length) {
    return <span className="text-sm font-semibold text-[#6a7e91]">No assigned SPs yet</span>;
  }

  return (
    <>
      {preview.map((name) => (
        <span key={name} className="cfsp-chip">
          {name}
        </span>
      ))}
    </>
  );
}

function WorkflowSection({
  title,
  description,
  items,
  emptyMessage,
}: {
  title: string;
  description: string;
  items: EventWithMeta[];
  emptyMessage: string;
}) {
  return (
    <section className="cfsp-panel overflow-hidden">
      <div className="border-b border-[#e5edf3] px-5 py-4">
        <h2 className="cfsp-section-title text-[1.25rem]">{title}</h2>
        <p className="cfsp-section-copy">{description}</p>
      </div>

      <div className="px-5 py-5">
        {items.length === 0 ? (
          <div className="cfsp-alert cfsp-alert-info">{emptyMessage}</div>
        ) : (
          <div className="grid gap-3">
            {items.map((item) => {
              const tone = getEventCoverageTone(item);

              return (
                <article key={item.event.id} className="rounded-[12px] border border-[#d9e4ec] bg-[#f8fbfd] px-4 py-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap gap-2">
                        <span className="cfsp-badge" style={tone}>
                          {tone.label}
                        </span>
                      </div>

                      <h3 className="m-0 text-[1.12rem] font-black text-[#14304f]">
                        {item.event.name?.trim() || "Untitled Event"}
                      </h3>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-[#5e7388]">
                        <span>{formatEventDate(item.start, item.event.date_text)}</span>
                        <span>{eventLocation(item.event)}</span>
                        <span>
                          Coverage {item.assigned}/{item.needed}
                        </span>
                        <span>{getEventTypeLabel(item.event)}</span>
                      </div>

                      <div className="mt-3 grid gap-2">
                        <div className="cfsp-label">Sim Staff</div>
                        <div className="text-sm font-semibold text-[#5e7388]">
                          {getSimStaffLabel(item.event.notes)}
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2">
                        <div className="cfsp-label">Assigned SPs</div>
                        <div className="flex flex-wrap gap-2">{renderAssignedPeople(item.event.assigned_sp_names)}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link href={`/events/${item.event.id}#coverage-actions`} className="cfsp-btn cfsp-btn-primary">
                        Quick Assign
                      </Link>
                      <Link href={`/events/${item.event.id}`} className="cfsp-btn cfsp-btn-secondary">
                        Open Event
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const router = useRouter();

  const [authState, setAuthState] = useState<AuthState>("loading");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setAuthState("loading");
        setError("");

        const meRes = await fetch("/api/me", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Cache-Control": "no-store",
            Pragma: "no-cache",
          },
        });

        if (cancelled) return;

        if (meRes.status === 401) {
          setAuthState("guest");
          router.replace("/login");
          return;
        }

        const meJson = (await meRes.json()) as MeResponse;

        if (!meRes.ok || !meJson.ok) {
          setAuthState("authed");
          setMe(meJson);
          setError(meJson.error || "Could not load current user.");
          return;
        }

        setMe(meJson);
        setAuthState("authed");

        const eventsRes = await fetch("/api/events", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Cache-Control": "no-store",
            Pragma: "no-cache",
          },
        });

        if (cancelled) return;

        if (eventsRes.status === 401) {
          setAuthState("guest");
          router.replace("/login");
          return;
        }

        const eventsJson = (await eventsRes.json()) as EventsResponse;

        if (!eventsRes.ok) {
          setError(eventsJson.error || "Could not load events.");
          setEvents([]);
          return;
        }

        setEvents(Array.isArray(eventsJson.events) ? eventsJson.events : []);
      } catch (err) {
        if (cancelled) return;
        console.error("Dashboard load failed", err);
        setError(err instanceof Error ? err.message : "Could not load dashboard.");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const eventMeta = useMemo(() => {
    const now = new Date();

    return [...events]
      .map((event) => {
        const needed = Number(event.sp_needed || 0);
        const assigned = Number(event.sp_assigned || 0);
        return {
          event,
          start: parseEventStart(event),
          needed,
          assigned,
          shortage: Math.max(needed - assigned, 0),
        };
      })
      .filter(({ start }) => !start || start >= now)
      .sort((a, b) => {
        if (!a.start && !b.start) return 0;
        if (!a.start) return 1;
        if (!b.start) return -1;
        return a.start.getTime() - b.start.getTime();
      });
  }, [events]);

  const displayName =
    me?.profile?.full_name?.trim() ||
    me?.profile?.schedule_match_name?.trim() ||
    me?.user?.email ||
    "Member";

  const openShortageCount = useMemo(
    () => eventMeta.reduce((sum, event) => sum + event.shortage, 0),
    [eventMeta]
  );

  const startOfToday = useMemo(() => getStartOfToday(), []);

  const needsAttention = useMemo(
    () =>
      eventMeta
        .filter((item) => item.shortage > 0 && (isTodayOrTomorrow(item.start, startOfToday) || item.assigned === 0))
        .slice(0, 8),
    [eventMeta, startOfToday]
  );

  const inProgress = useMemo(
    () => eventMeta.filter((item) => item.needed > 0 && item.assigned > 0 && item.assigned < item.needed).slice(0, 8),
    [eventMeta]
  );

  const ready = useMemo(
    () => eventMeta.filter((item) => item.needed <= 0 || item.assigned >= item.needed).slice(0, 8),
    [eventMeta]
  );

  if (authState === "loading") {
    return (
      <main className="cfsp-page">
        <div className="cfsp-container">
          <div className="cfsp-panel px-6 py-8">
            <h1 className="text-3xl font-black text-[#14304f]">Loading dashboard...</h1>
            <p className="mt-3 text-[#5e7388]">Checking your session and loading your workspace.</p>
          </div>
        </div>
      </main>
    );
  }

  if (authState === "guest") {
    return null;
  }

  return (
    <SiteShell
      title="Dashboard"
      subtitle="See what needs staffing attention first, what is underway, and what is ready to run."
    >
      <div className="grid gap-5">
        <section className="grid gap-5 xl:grid-cols-[1.45fr_0.95fr]">
          <div className="rounded-[14px] border border-[#dce6ee] bg-[linear-gradient(180deg,#f8fbfd_0%,#eef5fb_100%)] px-5 py-5">
            <p className="cfsp-kicker">Operational view</p>
            <h2 className="mt-3 text-[1.8rem] leading-tight font-black text-[#14304f]">
              Welcome back, {displayName}.
            </h2>
            <p className="mt-3 max-w-2xl text-[0.98rem] leading-6 text-[#5e7388]">
              Start with events that still need staffing attention, then move through in-progress coverage and ready-to-run events.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/events" className="cfsp-btn cfsp-btn-secondary">
                Open Events Board
              </Link>
              <Link href="/events/new" className="cfsp-btn cfsp-btn-primary">
                Create New Event
              </Link>
              <Link href="/sps" className="cfsp-btn cfsp-btn-success">
                Open SP Database
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Link
              href="/events"
              className="cfsp-panel rounded-[14px] px-4 py-4 no-underline transition-transform hover:-translate-y-0.5"
            >
              <div className="cfsp-label">Needs attention</div>
              <div className="mt-2 text-lg font-black text-[#14304f]">{needsAttention.length} priority events</div>
              <p className="mt-2 text-sm leading-6 text-[#5e7388]">
                Today and tomorrow shortages, plus events with zero assignments, are surfaced first.
              </p>
            </Link>
            <Link
              href="/admin"
              className="cfsp-panel rounded-[14px] px-4 py-4 no-underline transition-transform hover:-translate-y-0.5"
            >
              <div className="cfsp-label">Quick action</div>
              <div className="mt-2 text-lg font-black text-[#14304f]">Open admin tools</div>
              <p className="mt-2 text-sm leading-6 text-[#5e7388]">
                Launch imports, people tools, and other workflow shortcuts directly.
              </p>
            </Link>
          </div>
        </section>

        <section className="cfsp-grid-stats">
          <div className="cfsp-stat-card">
            <div className="cfsp-label">Needs Attention</div>
            <div className="cfsp-stat-value">{needsAttention.length}</div>
          </div>
          <div className="cfsp-stat-card">
            <div className="cfsp-label">In Progress</div>
            <div className="cfsp-stat-value">{inProgress.length}</div>
          </div>
          <div className="cfsp-stat-card">
            <div className="cfsp-label">Ready</div>
            <div className="cfsp-stat-value">{ready.length}</div>
          </div>
          <div className="cfsp-stat-card">
            <div className="cfsp-label">Open SP Shortage</div>
            <div className="cfsp-stat-value">{openShortageCount}</div>
          </div>
        </section>

        {error ? <div className="cfsp-alert cfsp-alert-error">{error}</div> : null}

        {!error ? (
          <div className="grid gap-5 2xl:grid-cols-3">
            <WorkflowSection
              title="Needs Attention"
              description="Shortage events coming up today or tomorrow, plus anything with zero assignments."
              items={needsAttention}
              emptyMessage="No high-priority staffing gaps are surfaced right now."
            />
            <WorkflowSection
              title="In Progress"
              description="Events with some staffing in place, but still short of full coverage."
              items={inProgress}
              emptyMessage="No partially staffed events right now."
            />
            <WorkflowSection
              title="Ready"
              description="Events with full coverage already in place and ready to run."
              items={ready}
              emptyMessage="No fully staffed upcoming events are ready yet."
            />
          </div>
        ) : null}
      </div>
    </SiteShell>
  );
}
