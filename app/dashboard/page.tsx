"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../components/SiteShell";

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

function getStatusTone(status?: string | null) {
  const normalized = String(status || "").toLowerCase();

  if (normalized.includes("complete")) {
    return { background: "#eaf7f2", borderColor: "#bfe4d6", color: "#196b57" };
  }
  if (normalized.includes("progress")) {
    return { background: "#edf5fb", borderColor: "#c7dcee", color: "#165a96" };
  }
  if (normalized.includes("scheduled")) {
    return { background: "#f4f7fb", borderColor: "#d6e0e8", color: "#4f677d" };
  }

  return { background: "#fff6e9", borderColor: "#f1d1a7", color: "#9f630e" };
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

  const sortedUpcoming = useMemo(() => {
    const now = new Date();

    return [...events]
      .map((event) => ({
        event,
        start: parseEventStart(event),
      }))
      .filter(({ start }) => !start || start >= now)
      .sort((a, b) => {
        if (!a.start && !b.start) return 0;
        if (!a.start) return 1;
        if (!b.start) return -1;
        return a.start.getTime() - b.start.getTime();
      })
      .slice(0, 8);
  }, [events]);

  const displayName =
    me?.profile?.full_name?.trim() ||
    me?.profile?.schedule_match_name?.trim() ||
    me?.user?.email ||
    "Member";

  const openShortageCount = useMemo(
    () =>
      events.reduce((sum, event) => {
        const needed = Number(event.sp_needed || 0);
        const assigned = Number(event.sp_assigned || 0);
        return sum + Math.max(needed - assigned, 0);
      }, 0),
    [events]
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
      subtitle="Keep today’s coverage, next event, and staffing priorities visible in one place."
    >
      <div className="grid gap-5">
        <section className="grid gap-5 xl:grid-cols-[1.45fr_0.95fr]">
          <div className="rounded-[14px] border border-[#dce6ee] bg-[linear-gradient(180deg,#f8fbfd_0%,#eef5fb_100%)] px-5 py-5">
            <p className="cfsp-kicker">Operational view</p>
            <h2 className="mt-3 text-[1.8rem] leading-tight font-black text-[#14304f]">
              Welcome back, {displayName}.
            </h2>
            <p className="mt-3 max-w-2xl text-[0.98rem] leading-6 text-[#5e7388]">
              Review coverage, open the next event quickly, and keep the staffing pipeline moving without digging through menus.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/events" className="cfsp-btn cfsp-btn-primary">
                Open Events Board
              </Link>
              <Link href="/events/new" className="cfsp-btn cfsp-btn-secondary">
                Create New Event
              </Link>
              <Link href="/sps" className="cfsp-btn cfsp-btn-success">
                Open SP Database
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Link href="/events" className="cfsp-panel rounded-[14px] px-4 py-4 no-underline transition-transform hover:-translate-y-0.5">
              <div className="cfsp-label">Quick Action</div>
              <div className="mt-2 text-lg font-black text-[#14304f]">Review today’s event queue</div>
              <p className="mt-2 text-sm leading-6 text-[#5e7388]">See active coverage, staffing gaps, and open the next event fast.</p>
            </Link>
            <Link href="/admin" className="cfsp-panel rounded-[14px] px-4 py-4 no-underline transition-transform hover:-translate-y-0.5">
              <div className="cfsp-label">Quick Action</div>
              <div className="mt-2 text-lg font-black text-[#14304f]">Open admin tools</div>
              <p className="mt-2 text-sm leading-6 text-[#5e7388]">Jump into imports, staff tools, and operational shortcuts.</p>
            </Link>
          </div>
        </section>

        <section className="cfsp-grid-stats">
          <div className="cfsp-stat-card">
            <div className="cfsp-label">Upcoming / Current</div>
            <div className="cfsp-stat-value">{sortedUpcoming.length}</div>
          </div>
          <div className="cfsp-stat-card">
            <div className="cfsp-label">Total Visible Events</div>
            <div className="cfsp-stat-value">{events.length}</div>
          </div>
          <div className="cfsp-stat-card">
            <div className="cfsp-label">Open SP Shortage</div>
            <div className="cfsp-stat-value">{openShortageCount}</div>
          </div>
          <div className="cfsp-stat-card">
            <div className="cfsp-label">Role</div>
            <div className="cfsp-stat-value text-[1.45rem]">
              {me?.profile?.role?.trim() || "Unassigned"}
            </div>
          </div>
        </section>

        <section className="cfsp-panel overflow-hidden">
          <div className="border-b border-[#e5edf3] px-5 py-4">
            <h2 className="cfsp-section-title text-[1.3rem]">My Upcoming Events</h2>
            <p className="cfsp-section-copy">Current and future events are listed here for quick operational review.</p>
          </div>

          <div className="px-5 py-5">
            {error ? <div className="cfsp-alert cfsp-alert-error">{error}</div> : null}

            {!error && sortedUpcoming.length === 0 ? (
              <div className="cfsp-alert cfsp-alert-info">
                <div className="text-base font-black text-[#14304f]">No upcoming events right now.</div>
                <div className="mt-2 text-sm leading-6 text-[#5e7388]">
                  When new events are available, they will appear here with a direct open action.
                </div>
              </div>
            ) : null}

            {!error && sortedUpcoming.length > 0 ? (
              <div className="grid gap-3">
                {sortedUpcoming.map(({ event, start }) => {
                  const tone = getStatusTone(event.status);

                  return (
                    <article key={event.id} className="rounded-[12px] border border-[#d9e4ec] bg-[#f8fbfd] px-4 py-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap gap-2">
                            <span className="cfsp-badge" style={tone}>
                              {event.status?.trim() || "No status"}
                            </span>
                          </div>
                          <h3 className="m-0 text-[1.15rem] font-black text-[#14304f]">
                            {event.name?.trim() || "Untitled Event"}
                          </h3>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-[#5e7388]">
                            <span>{start ? start.toLocaleString() : event.date_text || "Date TBD"}</span>
                            <span>{eventLocation(event)}</span>
                          </div>
                        </div>

                        <Link href={`/events/${event.id}`} className="cfsp-btn cfsp-btn-secondary">
                          Open Event
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </SiteShell>
  );
}
