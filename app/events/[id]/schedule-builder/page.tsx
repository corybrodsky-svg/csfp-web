"use client";

import { useParams, useSearchParams } from "next/navigation";
import EventScheduleBuilder from "../../../components/EventScheduleBuilder";
import SiteShell from "../../../components/SiteShell";

function getRouteId(raw: string | string[] | undefined) {
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
}

function getInitialRoundNumber(raw: string | null) {
  const parsed = Number.parseInt(raw || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getInitialScheduleView(raw: string | null) {
  return raw === "student" ? "student" : "operations";
}

function getInitialCompanionView(raw: string | null) {
  if (raw === "announcements" || raw === "student" || raw === "sp" || raw === "operations") {
    return raw;
  }
  return null;
}

function getInitialPreviewKind(raw: string | null) {
  if (
    raw === "timeline" ||
    raw === "rotation" ||
    raw === "student" ||
    raw === "sp" ||
    raw === "operations" ||
    raw === "announcements"
  ) {
    return raw;
  }
  return null;
}

function getPreviewFamily(raw: string | null) {
  if (raw === "ticket" || raw === "schedule") return raw;
  return null;
}

export default function EventScopedScheduleBuilderPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const eventId = getRouteId(params?.id);
  const initialRoundNumber = getInitialRoundNumber(searchParams.get("roundIndex"));
  const initialRoundKey = searchParams.get("round") || "";
  const initialCompanionView = getInitialCompanionView(searchParams.get("view"));
  const initialScheduleViewMode = getInitialScheduleView(searchParams.get("view"));
  const initialPreviewKind = getInitialPreviewKind(searchParams.get("preview"));
  const previewFamily = getPreviewFamily(searchParams.get("previewFamily"));
  const previewOnly = searchParams.get("previewMode") === "1";

  if (previewOnly) {
    return (
      <EventScheduleBuilder
        fixedEventId={eventId}
        expandedWorkspace
        initialRoundNumber={initialRoundNumber}
        initialRoundKey={initialRoundKey}
        initialCompanionView={initialCompanionView}
        initialScheduleViewMode={initialScheduleViewMode}
        initialPreviewKind={initialPreviewKind}
        previewFamily={previewFamily}
        previewOnly
      />
    );
  }

  return (
    <SiteShell
      title="Schedule Builder"
      subtitle="Canonical scheduling workspace for this CFSP event."
    >
      <EventScheduleBuilder
        fixedEventId={eventId}
        backHref={eventId ? `/events/${eventId}` : "/events"}
        backLabel="Back to Event"
        expandedWorkspace
        initialRoundNumber={initialRoundNumber}
        initialRoundKey={initialRoundKey}
        initialCompanionView={initialCompanionView}
        initialScheduleViewMode={initialScheduleViewMode}
        initialPreviewKind={initialPreviewKind}
        previewFamily={previewFamily}
      />
    </SiteShell>
  );
}
