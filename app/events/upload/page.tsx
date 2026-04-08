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
  sheets: string[];
  parsed_rows: number;
  created_events: number;
  created_sessions: number;
  skipped_duplicates: number;
};

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

    const formData = new FormData();
    formData.set("file", file);

    const response = await fetch("/api/events/import", {
      method: "POST",
      body: formData,
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setErrorMessage(body?.error || `Import failed (${response.status}).`);
      setSaving(false);
      return;
    }

    setSummary(body?.imported || null);
    setSaving(false);
  }

  return (
    <SiteShell
      title="Upload Event Schedule"
      subtitle="Import real CFSP events from seasonal Excel schedule workbooks."
    >
      {errorMessage ? (
        <div style={{ ...cardStyle, borderColor: "#fecaca", background: "#fff5f5", color: "#991b1b", fontWeight: 700 }}>
          {errorMessage}
        </div>
      ) : null}

      {summary ? (
        <div style={{ ...cardStyle, borderColor: "#bbf7d0", background: "#f0fdf4", color: "#166534" }}>
          <h2 style={{ marginTop: 0 }}>Import Complete</h2>
          <div><strong>Sheets:</strong> {summary.sheets.join(", ")}</div>
          <div><strong>Parsed event rows:</strong> {summary.parsed_rows}</div>
          <div><strong>Created events:</strong> {summary.created_events}</div>
          <div><strong>Created sessions:</strong> {summary.created_sessions}</div>
          <div><strong>Skipped duplicates:</strong> {summary.skipped_duplicates}</div>
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
          Expected format: seasonal sheets like Spring 2026 with columns for Session Name, Event Lead/Team,
          Rooms Assigned, Session Time, Summative or Formative, Number of students, and Course Faculty.
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
