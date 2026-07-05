"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import EventScheduleBuilder from "../../../components/EventScheduleBuilder";
import SiteShell from "../../../components/SiteShell";

type EventScheduleContext = {
  id: string;
  name: string;
};

function getRouteId(raw: string | string[] | undefined) {
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
}

function getInitialRoundNumber(raw: string | null) {
  const parsed = Number.parseInt(raw || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getInitialScheduleDay(raw: string | null) {
  const parsed = Number.parseInt(raw || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getInitialScheduleView(raw: string | null) {
  return raw === "student" ? "student" : "operations";
}

function getInitialCompanionView(raw: string | null) {
  if (raw === "announcements" || raw === "student" || raw === "sp" || raw === "operations" || raw === "attendance") {
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

function normalizeAccessRole(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function canUseLegacyScheduleBuilder(body: unknown) {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const profile = record.profile && typeof record.profile === "object" ? (record.profile as Record<string, unknown>) : {};
  const roles = [
    record.role,
    record.legacyRole,
    profile.role,
    profile.organization_role,
  ].map(normalizeAccessRole);

  return Boolean(record.isPlatformOwner) || roles.some((role) =>
    role === "platform_owner" ||
    role === "app_owner" ||
    role === "owner" ||
    role === "super_admin"
  );
}

export default function EventScopedScheduleBuilderPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [eventContext, setEventContext] = useState<EventScheduleContext | null>(null);
  const eventId = getRouteId(params?.id);
  const initialRoundNumber = getInitialRoundNumber(searchParams.get("roundIndex"));
  const initialRoundKey = searchParams.get("round") || "";
  const initialCompanionView = getInitialCompanionView(searchParams.get("view"));
  const initialScheduleViewMode = getInitialScheduleView(searchParams.get("view"));
  const initialPreviewKind = getInitialPreviewKind(searchParams.get("preview"));
  const initialScheduleDay = getInitialScheduleDay(searchParams.get("day") || searchParams.get("scheduleDay"));
  const previewFamily = getPreviewFamily(searchParams.get("previewFamily"));
  const previewOnly = searchParams.get("previewMode") === "1";
  const downloadMode = searchParams.get("downloadMode");
  const autoDownload =
    downloadMode === "1" || downloadMode === "studentInstructions" || downloadMode === "facultySimOpsInstructions";
  const autoDownloadMode =
    downloadMode === "studentInstructions"
      ? "student-instructions"
      : downloadMode === "facultySimOpsInstructions"
        ? "faculty-simops-instructions"
        : "schedule";
  const [legacyAccessStatus, setLegacyAccessStatus] = useState<"checking" | "allowed" | "blocked">(
    previewOnly ? "allowed" : "checking"
  );

  useEffect(() => {
    if (previewOnly) {
      setLegacyAccessStatus("allowed");
      return;
    }

    let cancelled = false;

    async function checkLegacyBuilderAccess() {
      try {
        const response = await fetch("/api/me", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) {
          if (!cancelled) setLegacyAccessStatus("blocked");
          return;
        }
        const body = await response.json().catch(() => null);
        if (!cancelled) setLegacyAccessStatus(canUseLegacyScheduleBuilder(body) ? "allowed" : "blocked");
      } catch {
        if (!cancelled) setLegacyAccessStatus("blocked");
      }
    }

    void checkLegacyBuilderAccess();

    return () => {
      cancelled = true;
    };
  }, [previewOnly]);

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
        initialScheduleDay={initialScheduleDay}
        previewFamily={previewFamily}
        previewOnly
        autoDownload={autoDownload}
        autoDownloadMode={autoDownloadMode}
      />
    );
  }

  if (legacyAccessStatus === "checking") {
    return (
      <SiteShell
        title="Checking Schedule Builder Access"
        subtitle="Normal event teams use the embedded Schedule Builder inside the Command Center."
      >
        <div className="cfsp-alert cfsp-alert-info">Checking access...</div>
      </SiteShell>
    );
  }

  if (legacyAccessStatus === "blocked") {
    return (
      <SiteShell
        title="Use the Embedded Schedule Builder"
        subtitle="The legacy full builder is restricted to platform owners for debugging and migration."
      >
        <div className="cfsp-panel px-5 py-5">
          <h2 className="m-0 text-[1.35rem] font-black text-[#14304f]">Legacy builder restricted</h2>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[#5e7388]">
            Open this event in the Command Center and use the embedded Schedule Builder workspace.
          </p>
          <div className="mt-4">
            <Link href={eventId ? `/events/${encodeURIComponent(eventId)}?tool=schedule` : "/events"} className="cfsp-btn">
              Open embedded Schedule Builder
            </Link>
          </div>
        </div>
      </SiteShell>
    );
  }

  return (
    <SiteShell
      title={eventContext?.name ? `Schedule Builder: ${eventContext.name}` : "Event Schedule Builder"}
      subtitle="Build and edit the learner rotations, room flow, timing, and assignments for this event."
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
        initialScheduleDay={initialScheduleDay}
        previewFamily={previewFamily}
        onEventContextChange={setEventContext}
      />
    </SiteShell>
  );
}
