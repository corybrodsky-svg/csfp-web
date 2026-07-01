"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import SiteShell from "../../components/SiteShell";

type SandboxDiagnostics = {
  generatedAt: string;
  sandboxOrgExists: boolean;
  sandboxOrgId: string | null;
  sandboxOrgName: string;
  sandboxOrgSlug: string;
  duplicateSandboxOrgIds: string[];
  accessCodeExists: boolean;
  accessCodeOrganizationId: string | null;
  accessCodeActive: boolean | null;
  eventCount: number;
  spProfileCount: number;
  staffFacultyCount: number;
  staffFacultySource: string;
  assignmentCount: number;
  firstFiveEventNames: string[];
  activeOrganizationId: string | null;
  activeOrganizationName: string | null;
  activeOrganizationEventCount: number;
  nullOrgEventCount: number;
  namedSandboxEventsByOrganizationId: Record<string, number>;
  namedSandboxEventRows: number;
  eventsZeroStateDiagnosis: string;
  warnings: string[];
  expected: {
    organizationName: string;
    organizationSlug: string;
    accessCode: string;
    expectedEvents: number;
    expectedSpProfiles: number;
    expectedStaffFaculty: number;
    expectedAssignments: number;
    showcaseEvent: string;
    daniel: {
      name: string;
      email: string;
      role: string;
    };
  };
};

type RepairResponse = {
  ok?: boolean;
  error?: string;
  diagnostics?: SandboxDiagnostics;
  repairSummary?: {
    duplicateOrganizationsFound?: number;
    membershipsMoved?: number;
    accessRequestsMoved?: number;
    duplicateOrganizationsRetired?: number;
  };
};

const CONFIRMATION = "REPAIR CFSP SANDBOX";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function formatBoolean(value: boolean) {
  return value ? "Yes" : "No";
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function StatCell(props: { label: string; value: string | number }) {
  return (
    <div className="rounded-[8px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
      <div className="cfsp-label">{props.label}</div>
      <div className="mt-1 break-words text-[1.05rem] font-black text-[#14304f]">{props.value}</div>
    </div>
  );
}

export default function SandboxManagerClient(props: { initialDiagnostics: SandboxDiagnostics }) {
  const [diagnostics, setDiagnostics] = useState(props.initialDiagnostics);
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const canRepair = confirmation === CONFIRMATION && !saving;

  const namedEventBreakdown = useMemo(() => {
    return Object.entries(diagnostics.namedSandboxEventsByOrganizationId || {})
      .map(([organizationId, count]) => `${organizationId}: ${count}`)
      .join("; ");
  }, [diagnostics.namedSandboxEventsByOrganizationId]);

  async function handleRepair() {
    if (!canRepair) return;
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/sandbox", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const body = (await response.json().catch(() => null)) as RepairResponse | null;
      if (!response.ok || !body?.ok) {
        setError(asText(body?.error) || "Could not repair the sandbox.");
        return;
      }
      if (body.diagnostics) setDiagnostics(body.diagnostics);
      const repaired = body.repairSummary;
      setMessage(
        repaired
          ? `Sandbox repaired. Duplicate orgs found: ${repaired.duplicateOrganizationsFound || 0}; memberships moved: ${repaired.membershipsMoved || 0}; access requests moved: ${repaired.accessRequestsMoved || 0}.`
          : "Sandbox repaired."
      );
      setConfirmation("");
    } catch (repairError) {
      setError(repairError instanceof Error ? repairError.message : "Could not repair the sandbox.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SiteShell
      title="Sandbox Manager"
      subtitle="Admin-only controls for the shared CFSP sandbox organization."
    >
      <div className="grid gap-5">
        <section className="cfsp-panel px-5 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="cfsp-kicker">Shared sandbox</p>
              <h2 className="mt-2 text-[1.45rem] font-black text-[#14304f]">
                {diagnostics.expected.organizationName}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5e7388]">
                Last checked {formatDate(diagnostics.generatedAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/events" className="cfsp-btn cfsp-btn-secondary">Open Events</Link>
              <Link href="/admin" className="cfsp-btn cfsp-btn-secondary">Admin Hub</Link>
            </div>
          </div>
        </section>

        <section className="cfsp-panel px-5 py-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCell label="Sandbox org exists" value={formatBoolean(diagnostics.sandboxOrgExists)} />
            <StatCell label="Sandbox org id" value={diagnostics.sandboxOrgId || "Not found"} />
            <StatCell label="Access code exists" value={formatBoolean(diagnostics.accessCodeExists)} />
            <StatCell label="Events" value={`${diagnostics.eventCount} / ${diagnostics.expected.expectedEvents}`} />
            <StatCell label="SP profiles" value={`${diagnostics.spProfileCount} / ${diagnostics.expected.expectedSpProfiles}`} />
            <StatCell label="Staff / faculty" value={`${diagnostics.staffFacultyCount} / ${diagnostics.expected.expectedStaffFaculty}`} />
            <StatCell label="Assignments" value={`${diagnostics.assignmentCount} / ${diagnostics.expected.expectedAssignments}`} />
            <StatCell label="Showcase" value={diagnostics.expected.showcaseEvent} />
          </div>
        </section>

        <section className="cfsp-panel px-5 py-5">
          <h3 className="m-0 text-[1.15rem] font-black text-[#14304f]">Event diagnostics</h3>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-[8px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
              <div className="cfsp-label">First five events</div>
              <div className="mt-2 text-sm font-bold leading-6 text-[#14304f]">
                {diagnostics.firstFiveEventNames.length ? diagnostics.firstFiveEventNames.join(", ") : "No sandbox events found"}
              </div>
            </div>
            <div className="rounded-[8px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
              <div className="cfsp-label">/events zero-state finding</div>
              <div className="mt-2 text-sm font-bold leading-6 text-[#14304f]">{diagnostics.eventsZeroStateDiagnosis}</div>
            </div>
            <StatCell label="Active organization events" value={diagnostics.activeOrganizationEventCount} />
            <StatCell label="Legacy null-org events" value={diagnostics.nullOrgEventCount} />
          </div>
          <div className="mt-4 grid gap-2 text-sm leading-6 text-[#5e7388]">
            <div><strong>Active organization:</strong> {diagnostics.activeOrganizationName || "None"} ({diagnostics.activeOrganizationId || "none"})</div>
            <div><strong>Access code org:</strong> {diagnostics.accessCodeOrganizationId || "none"}; active: {diagnostics.accessCodeActive === null ? "unknown" : formatBoolean(diagnostics.accessCodeActive)}</div>
            <div><strong>Named sandbox rows by org:</strong> {namedEventBreakdown || "none"}</div>
            <div><strong>Staff count source:</strong> {diagnostics.staffFacultySource || "none"}</div>
            <div><strong>Daniel:</strong> {diagnostics.expected.daniel.name}, {diagnostics.expected.daniel.email}, {diagnostics.expected.daniel.role}</div>
          </div>
        </section>

        {diagnostics.duplicateSandboxOrgIds.length ? (
          <div className="cfsp-alert cfsp-alert-info">
            Duplicate sandbox organization ids found: {diagnostics.duplicateSandboxOrgIds.join(", ")}
          </div>
        ) : null}
        {diagnostics.warnings.length ? (
          <div className="cfsp-alert cfsp-alert-info">{diagnostics.warnings.join(" ")}</div>
        ) : null}
        {message ? <div className="cfsp-alert cfsp-alert-success">{message}</div> : null}
        {error ? <div className="cfsp-alert cfsp-alert-error">{error}</div> : null}

        <section className="cfsp-panel px-5 py-5">
          <h3 className="m-0 text-[1.15rem] font-black text-[#14304f]">Repair sandbox data</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5e7388]">
            This writes the shared sandbox organization, access code, eight events, SP profiles, staff contacts, assignments, readiness metadata, and Daniel operator metadata. It does not send email or create Daniel Auth login credentials.
          </p>
          <label className="mt-4 block">
            <span className="cfsp-label">Confirmation</span>
            <input
              className="mt-2 w-full rounded-[8px] border border-[#c8d6e2] bg-white px-3 py-3 text-sm font-bold text-[#14304f] outline-none focus:border-[#2f7fbd]"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={CONFIRMATION}
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="cfsp-btn cfsp-btn-primary" disabled={!canRepair} onClick={handleRepair}>
              {saving ? "Repairing..." : "Repair Shared Sandbox"}
            </button>
            <button type="button" className="cfsp-btn cfsp-btn-secondary" onClick={() => setConfirmation("")}>
              Clear
            </button>
          </div>
        </section>
      </div>
    </SiteShell>
  );
}
