"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type DemoCounts = {
  events: number;
  sps: number;
  shiftOpenings: number;
  responses: number;
  attendanceRecords: number;
  portalInvites: number;
};

type DemoSummary = {
  ok?: boolean;
  isDemoOrg?: boolean;
  organizationName?: string | null;
  message?: string | null;
  counts?: DemoCounts;
  demoEvents?: Array<{
    id: string;
    name: string;
    date: string | null;
  }>;
  error?: string;
};

const demoSafetyItems = [
  "Use shared sandbox data only.",
  "Do not show real SP/student/patient data.",
  "Seeded SP contacts are .invalid or Cory-controlled aliases.",
  "Treat communication workflows as preview/test-safe unless explicitly enabled.",
  "Invite links are sensitive.",
  "Raw invite links appear only once when created.",
];

const checklistItems = [
  "Open CFSP Sandbox Simulation Center",
  "Open Neurologic Assessment: Stroke Warning Signs",
  "Find readiness risks",
  "Assign or replace an SP",
  "Review room and material readiness",
  "Preview SP communications",
  "Create a new event",
  "Submit tester feedback",
];

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function numberLabel(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : "0";
}

export default function DemoOperatorClient() {
  const [summary, setSummary] = useState<DemoSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      setSummaryLoading(true);
      setSummaryError("");
      try {
        const response = await fetch("/api/demo/summary", {
          cache: "no-store",
          credentials: "include",
        });
        const body = (await response.json().catch(() => null)) as DemoSummary | null;
        if (cancelled) return;
        if (!response.ok || body?.ok === false) {
          throw new Error(asText(body?.error) || "Could not load demo readiness summary.");
        }
        setSummary(body || null);
      } catch (error) {
        if (!cancelled) setSummaryError(error instanceof Error ? error.message : "Could not load demo readiness summary.");
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    }

    void loadSummary();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = summary?.counts;
  const readinessCountRows = [
    { label: "Events", value: counts?.events },
    { label: "SPs", value: counts?.sps },
    { label: "Openings", value: counts?.shiftOpenings },
    { label: "Responses", value: counts?.responses },
    { label: "Attendance", value: counts?.attendanceRecords },
    { label: "Invites", value: counts?.portalInvites },
  ];
  const completedCount = useMemo(
    () => checklistItems.filter((item) => checkedItems[item]).length,
    [checkedItems]
  );

  function toggleChecklistItem(item: string) {
    setCheckedItems((current) => ({ ...current, [item]: !current[item] }));
  }

  return (
    <div className="grid gap-5">
      <section className="cfsp-panel-muted rounded-[14px] border border-[var(--cfsp-border)] px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="cfsp-kicker">Internal sandbox control</p>
            <h2 className="mt-2 text-[1.28rem] font-black text-[var(--cfsp-text)]">Sandbox Readiness</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[var(--cfsp-text-muted)]">
              {summaryLoading
                ? "Checking active organization readiness..."
                : summary?.isDemoOrg
                  ? `${asText(summary.organizationName) || "Sandbox organization"} is marked for sandbox data.`
                  : asText(summary?.message) || "Switch to the CFSP Sandbox Simulation Center before showing sandbox data."}
            </p>
          </div>
          <span
            title="Fake data for sandbox walkthroughs only."
            className="inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.08em]"
            style={{
              borderColor: summary?.isDemoOrg ? "rgba(25, 138, 112, 0.28)" : "rgba(180, 83, 9, 0.26)",
              background: summary?.isDemoOrg ? "rgba(209, 250, 229, 0.64)" : "rgba(254, 243, 199, 0.72)",
              color: summary?.isDemoOrg ? "#065f46" : "#92400e",
            }}
          >
            {summary?.isDemoOrg ? "Sandbox Data" : "Verify Org"}
          </span>
        </div>

        {summaryError ? <div className="cfsp-alert cfsp-alert-error mt-4">{summaryError}</div> : null}

        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {readinessCountRows.map(({ label, value }) => (
            <div key={label} className="rounded-[10px] border border-[var(--cfsp-border)] bg-white px-3 py-3">
              <div className="cfsp-label">{label}</div>
              <div className="mt-1 text-[1.25rem] font-black text-[var(--cfsp-text)]">{numberLabel(value)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[14px] border border-[var(--cfsp-border)] px-4 py-4">
          <h2 className="text-[1.12rem] font-black text-[var(--cfsp-text)]">Sandbox Safety</h2>
          <div className="mt-3 grid gap-2">
            {demoSafetyItems.map((item) => (
              <div key={item} className="flex gap-2 text-sm font-bold leading-6 text-[var(--cfsp-text-muted)]">
                <span aria-hidden="true" className="mt-[0.42rem] h-2 w-2 rounded-full bg-[var(--cfsp-green)]" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[14px] border border-[var(--cfsp-border)] px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[1.12rem] font-black text-[var(--cfsp-text)]">Tester Flow Checklist</h2>
            <span className="text-xs font-black uppercase tracking-[0.08em] text-[var(--cfsp-text-muted)]">
              {completedCount}/{checklistItems.length} done
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {checklistItems.map((item) => (
              <label key={item} className="flex min-h-[38px] items-center gap-2 rounded-[10px] border border-[var(--cfsp-border)] bg-white px-3 py-2 text-sm font-bold text-[var(--cfsp-text)]">
                <input
                  type="checkbox"
                  checked={Boolean(checkedItems[item])}
                  onChange={() => toggleChecklistItem(item)}
                  className="h-4 w-4"
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[14px] border border-[var(--cfsp-border)] px-4 py-4">
          <h2 className="text-[1.12rem] font-black text-[var(--cfsp-text)]">Quick Links</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/events" className="cfsp-btn cfsp-btn-secondary">Events</Link>
            <Link href="/settings" className="cfsp-btn cfsp-btn-secondary">Settings</Link>
            <Link href="/sp" className="cfsp-btn cfsp-btn-secondary">SP Portal</Link>
          </div>
          {summary?.demoEvents?.length ? (
            <div className="mt-4 grid gap-2">
              <div className="cfsp-label">Sandbox event names to search</div>
              {summary.demoEvents.slice(0, 5).map((event) => (
                <div key={event.id} className="text-sm font-bold text-[var(--cfsp-text-muted)]">
                  {event.name}{event.date ? ` - ${event.date}` : ""}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-[14px] border border-[var(--cfsp-border)] px-4 py-4">
          <h2 className="text-[1.12rem] font-black text-[var(--cfsp-text)]">Sandbox Readiness Reminder</h2>
          <div className="mt-3 grid gap-2 text-sm font-bold leading-6 text-[var(--cfsp-text-muted)]">
            <code className="rounded-[8px] bg-white px-3 py-2 text-[var(--cfsp-text)]">npm run seed:demo -- --dry-run</code>
            <code className="rounded-[8px] bg-white px-3 py-2 text-[var(--cfsp-text)]">npm run seed:demo -- --verify</code>
            <span>Run lint, typecheck, build, and the smoke tests before screenshot capture.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
