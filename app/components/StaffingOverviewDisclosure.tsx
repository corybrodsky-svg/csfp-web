"use client";

import type { CSSProperties } from "react";

export type StaffingOverviewMetric = {
  label: string;
  value: string | number;
  detail?: string;
  tone?: string;
};

export type StaffingOverviewPerson = {
  id: string;
  name: string;
  detail: string;
  status?: string;
};

export type StaffingOverviewDisclosureProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metrics: StaffingOverviewMetric[];
  selectedSps: StaffingOverviewPerson[];
  confirmedSps: StaffingOverviewPerson[];
  backupSps: StaffingOverviewPerson[];
  remainingGaps: string[];
  blockers: string[];
  nextAction: string;
  backupStatus: string;
  buttonStyle?: CSSProperties;
  activeButtonStyle?: CSSProperties;
};

const panelStyle: CSSProperties = {
  borderRadius: "14px",
  border: "1px solid var(--cfsp-border)",
  background: "var(--cfsp-command-center-row-bg-solid)",
  padding: "10px",
  display: "grid",
  gap: "10px",
};

const labelStyle: CSSProperties = {
  color: "var(--cfsp-text-muted)",
  fontSize: "10px",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const valueStyle: CSSProperties = {
  color: "var(--cfsp-text)",
  fontSize: "16px",
  fontWeight: 950,
  marginTop: "3px",
};

const rowStyle: CSSProperties = {
  borderRadius: "10px",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: "var(--cfsp-surface)",
  padding: "8px 9px",
  display: "grid",
  gap: "3px",
};

function renderPersonList(rows: StaffingOverviewPerson[], emptyText: string) {
  if (!rows.length) {
    return <div style={{ color: "var(--cfsp-text-muted)", fontSize: "12px", fontWeight: 800 }}>{emptyText}</div>;
  }

  return (
    <div style={{ display: "grid", gap: "6px" }}>
      {rows.slice(0, 8).map((row) => (
        <div key={row.id} style={rowStyle}>
          <div style={{ color: "var(--cfsp-text)", fontSize: "12px", fontWeight: 950, overflowWrap: "anywhere" }}>{row.name}</div>
          <div style={{ color: "var(--cfsp-text-muted)", fontSize: "11px", fontWeight: 750, overflowWrap: "anywhere" }}>{row.detail}</div>
          {row.status ? <div style={{ color: "var(--cfsp-text-muted)", fontSize: "10px", fontWeight: 850 }}>{row.status}</div> : null}
        </div>
      ))}
      {rows.length > 8 ? (
        <div style={{ color: "var(--cfsp-text-muted)", fontSize: "11px", fontWeight: 800 }}>
          {rows.length - 8} more shown in the active staffing roster.
        </div>
      ) : null}
    </div>
  );
}

export default function StaffingOverviewDisclosure({
  open,
  onOpenChange,
  metrics,
  selectedSps,
  confirmedSps,
  backupSps,
  remainingGaps,
  blockers,
  nextAction,
  backupStatus,
  buttonStyle,
  activeButtonStyle,
}: StaffingOverviewDisclosureProps) {
  const panelId = "select-stage-staffing-overview-panel";
  const hasBlockers = blockers.length > 0;

  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        style={open ? activeButtonStyle || buttonStyle : buttonStyle}
      >
        {open ? "Hide Staffing Overview" : "Open Staffing Overview"}
      </button>

      {open ? (
        <section id={panelId} role="region" aria-label="Staffing Overview" style={panelStyle}>
          <div>
            <div style={{ ...labelStyle, color: "var(--cfsp-text)" }}>Staffing Overview</div>
            <div style={{ color: "var(--cfsp-text-muted)", fontSize: "12px", fontWeight: 800, marginTop: "3px" }}>
              Active staffing counts, selected SPs, confirmed SPs, backup coverage, and next action.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: "6px" }}>
            {metrics.map((metric) => (
              <div key={metric.label} style={rowStyle}>
                <div style={labelStyle}>{metric.label}</div>
                <div style={{ ...valueStyle, color: metric.tone || valueStyle.color }}>{metric.value}</div>
                {metric.detail ? <div style={{ color: "var(--cfsp-text-muted)", fontSize: "10px", fontWeight: 750 }}>{metric.detail}</div> : null}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px" }}>
            <div style={rowStyle}>
              <div style={labelStyle}>Remaining gaps</div>
              <div style={{ color: "var(--cfsp-text)", fontSize: "12px", fontWeight: 850 }}>
                {remainingGaps.length ? remainingGaps.join(" · ") : "No staffing gaps currently shown."}
              </div>
            </div>
            <div style={rowStyle}>
              <div style={labelStyle}>Backup status</div>
              <div style={{ color: "var(--cfsp-text)", fontSize: "12px", fontWeight: 850 }}>{backupStatus}</div>
            </div>
            <div style={rowStyle}>
              <div style={labelStyle}>Next action</div>
              <div style={{ color: "var(--cfsp-text)", fontSize: "12px", fontWeight: 850 }}>{nextAction || "No immediate staffing action is required."}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "8px" }}>
            <div style={{ display: "grid", gap: "6px" }}>
              <div style={labelStyle}>Selected / staged SPs</div>
              {renderPersonList(selectedSps, "No selected or staged SPs yet.")}
            </div>
            <div style={{ display: "grid", gap: "6px" }}>
              <div style={labelStyle}>Confirmed SPs</div>
              {renderPersonList(confirmedSps, "No confirmed SPs yet.")}
            </div>
            <div style={{ display: "grid", gap: "6px" }}>
              <div style={labelStyle}>Backup SPs</div>
              {renderPersonList(backupSps, "No backup SPs selected yet.")}
            </div>
          </div>

          <div style={rowStyle}>
            <div style={labelStyle}>Staffing blockers</div>
            <div style={{ color: hasBlockers ? "var(--cfsp-status-action-text)" : "var(--cfsp-text-muted)", fontSize: "12px", fontWeight: 850 }}>
              {hasBlockers ? blockers.join(" · ") : "No staffing blockers currently shown."}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
