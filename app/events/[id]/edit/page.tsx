"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import EventSetupForm, { type EventSetupEvent, type EventSetupSession } from "../../../components/EventSetupForm";
import SiteShell from "../../../components/SiteShell";

type EventDetailResponse = {
  event?: EventSetupEvent | null;
  sessions?: EventSetupSession[];
  error?: string;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export default function EditEventPage() {
  const params = useParams<{ id?: string | string[] }>();
  const eventId = useMemo(() => {
    const raw = params?.id;
    return Array.isArray(raw) ? raw[0] || "" : asText(raw);
  }, [params]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [event, setEvent] = useState<EventSetupEvent | null>(null);
  const [sessions, setSessions] = useState<EventSetupSession[]>([]);

  useEffect(() => {
    let active = true;

    async function loadEventSetup() {
      if (!eventId) {
        setErrorMessage("Missing event id.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch(`/api/events/${encodeURIComponent(eventId)}`, { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as EventDetailResponse | null;

        if (!active) return;

        if (!response.ok || !body?.event) {
          setErrorMessage(body?.error || `Could not load event setup (${response.status}).`);
          setLoading(false);
          return;
        }

        setEvent(body.event);
        setSessions(Array.isArray(body.sessions) ? body.sessions : []);
        setLoading(false);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Could not load event setup.");
        setLoading(false);
      }
    }

    void loadEventSetup();

    return () => {
      active = false;
    };
  }, [eventId]);

  if (loading) {
    return (
      <SiteShell title="Edit Event Setup" subtitle="Loading the structured event setup form.">
        <div className="cfsp-panel">Loading event setup...</div>
      </SiteShell>
    );
  }

  if (errorMessage || !event) {
    return (
      <SiteShell title="Edit Event Setup" subtitle="The event setup form could not be loaded.">
        <div className="grid gap-4">
          <div className="cfsp-alert cfsp-alert-error">{errorMessage || "Event not found."}</div>
          <Link href={eventId ? `/events/${eventId}` : "/events"} className="cfsp-btn cfsp-btn-secondary">
            Back to Event
          </Link>
        </div>
      </SiteShell>
    );
  }

  return <EventSetupForm mode="edit" initialEvent={event} initialSessions={sessions} />;
}
