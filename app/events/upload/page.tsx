"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import SiteShell from "../../components/SiteShell";

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe4ee",
  borderRadius: "24px",
  padding: "22px",
  boxShadow: "0 10px 26px rgba(15, 23, 42, 0.06)",
  marginBottom: "18px",
};

const buttonStyle: React.CSSProperties = {
  border: "1px solid #173b6c",
  borderRadius: "12px",
  background: "#173b6c",
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: 800,
  padding: "11px 16px",
};

type ImportSummary = {
  sheetLabel: string;
  totalRowsParsed: number;
  eventRowsSeen: number;
  eventsCreated: number;
  sessionsCreated: number;
  duplicatesSkipped: number;
  rowsSkippedNoDate: number;
  rowsSkippedIgnored: number;
  rowsSkippedBlank: number;
};

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeImportSummary(value: unknown): ImportSummary | null {
  if (!value || typeof value !== "object") return null;

  const imported = value as Record<string, unknown>;
  const sheetLabel =
    typeof imported.sheet === "string"
      ? imported.sheet
      : Array.isArray(imported.sheets)
        ? imported.sheets.filter((item): item is string => typeof item === "string").join(", ")
        : "Unknown sheet";

  return {
    sheetLabel,
    totalRowsParsed: asNumber(imported.total_rows_parsed ?? imported.parsed_rows),
    eventRowsSeen: asNumber(imported.event_rows_seen ?? imported.parsed_rows),
    eventsCreated: asNumber(imported.events_created ?? imported.created_events),
    sessionsCreated: asNumber(imported.sessions_created ?? imported.created_sessions),
    duplicatesSkipped: asNumber(imported.duplicates_skipped ?? imported.skipped_duplicates),
    rowsSkippedNoDate: asNumber(imported.rows_skipped_no_date),
    rowsSkippedIgnored: asNumber(imported.rows_skipped_ignored),
    rowsSkippedBlank: asNumber(imported.rows_skipped_blank),
  };
}

export default function EventUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSummary(null);

    if (!file) {
      setErrorMessage("Choose an Excel workbook to import.");
      return;
    }

    setSaving(true);

    try {
      const formData = new FormData();
      formData.set("file", file);

      const response = await fetch("/api/events/import", {
        method: "POST",
        body: formData,
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorMessage(
          typeof body?.error === "string" ? body.error : `Import failed (${response.status}).`
        );
        setSaving(false);
        return;
      }

      const normalized = normalizeImportSummary(body?.imported);
      if (!normalized) {
        setErrorMessage("Import finished, but the server returned an unexpected summary.");
        setSaving(false);
        return;
      }

      setSummary(normalized);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SiteShell
      title="Upload Event Schedule"
      subtitle="Import real CFSP events from seasonal Excel schedule workbooks."
    >
      {errorMessage ? (
        <div
          style={{
            ...cardStyle,
            borderColor: "#fecaca",
            background: "#fff5f5",
            color: "#991b1b",
            fontWeight: 700,
          }}
        >
          {errorMessage}
        </div>
      ) : null}

      {summary ? (
        <div
          style={{
            ...cardStyle,
            borderColor: "#bbf7d0",
            background: "#f0fdf4",
            color: "#166534",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Import Complete</h2>
          <div><strong>Sheet imported:</strong> {summary.sheetLabel || "Unknown sheet"}</div>
          <div><strong>Total rows parsed:</strong> {summary.totalRowsParsed}</div>
          <div><strong>Event rows seen:</strong> {summary.eventRowsSeen}</div>
          <div><strong>Events created:</strong> {summary.eventsCreated}</div>
          <div><strong>Sessions created:</strong> {summary.sessionsCreated}</div>
          <div><strong>Duplicates skipped:</strong> {summary.duplicatesSkipped}</div>
          <div><strong>Rows skipped with no date:</strong> {summary.rowsSkippedNoDate}</div>
          <div><strong>Rows skipped ignored:</strong> {summary.rowsSkippedIgnored}</div>
          <div><strong>Rows skipped blank:</strong> {summary.rowsSkippedBlank}</div>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} style={{ ...cardStyle, display: "grid", gap: "16px" }}>
        <div>
          <label style={{ display: "block", color: "#173b6c", fontWeight: 900, marginBottom: "8px" }}>
            Excel workbook
          </label>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
        </div>

        <p style={{ margin: 0, color: "#64748b", fontWeight: 700, lineHeight: 1.6 }}>
          Expected format: the workbook must include a <strong>Spring 2026</strong> sheet with
          columns for Session Name, Event Lead/Team, Rooms Assigned, Session Time,
          Summative or Formative, Number of students, and Course Faculty.
        </p>

        <div>
          <button type="submit" disabled={saving} style={{ ...buttonStyle, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Importing..." : "Import Schedule"}
          </button>
        </div>
      </form>
    </SiteShell>
  );
}
