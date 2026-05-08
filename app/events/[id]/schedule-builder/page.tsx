"use client";

import { useParams } from "next/navigation";
import EventScheduleBuilder from "../../../components/EventScheduleBuilder";
import SiteShell from "../../../components/SiteShell";

function getRouteId(raw: string | string[] | undefined) {
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
}

export default function EventScopedScheduleBuilderPage() {
  const params = useParams();
  const eventId = getRouteId(params?.id);

  return (
    <SiteShell
      title="Build Schedule"
      subtitle="Build a learner rotation schedule for this event without changing the saved event record."
    >
      <EventScheduleBuilder
        fixedEventId={eventId}
        backHref={eventId ? `/events/${eventId}` : "/events"}
        backLabel="Back to Event"
      />
    </SiteShell>
  );
}
