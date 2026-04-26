"use client";

import type { CSSProperties, FormEvent } from "react";
import { useMemo, useState } from "react";
import Link from "next/link";

const shellStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f4f7fb",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const containerStyle: CSSProperties = {
  maxWidth: "960px",
  margin: "0 auto",
  padding: "24px",
};

const cardStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe4ee",
  borderRadius: "24px",
  padding: "22px",
  boxShadow: "0 10px 26px rgba(15, 23, 42, 0.06)",
  marginBottom: "18px",
};

const buttonStyle: CSSProperties = {
  border: "1px solid #173b6c",
  borderRadius: "12px",
  background: "#173b6c",
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: 800,
  padding: "11px 16px",
};

const linkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "none",
  color: "#1d4ed8",
  fontWeight: 800,
};

type ImportEntry = {
  file: string;
  sheet?: string;
  event?: string;
  date?: string | null;
  simStaffCount?: number;
  reason?: string;
  error?: string;
};

type ImportSummary = {
  created: ImportEntry[];
  updated: ImportEntry[];
  skipped: ImportEntry[];
  errors: ImportEntry[];
};

const acceptedSpreadsheetTypes =
  ".xlsx,.xlsm,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.ms-excel.sheet.macroEnabled.12";

function getErrorMessage(body: unknown, response: Response) {
  if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  return `Import failed (${response.status}).`;
}

function normalizeSummary(value: unknown): ImportSummary | null {
  if (!value || typeof value !== "object") return null;

  const body = value as Record<string, unknown>;
  const toEntries = (key: string) =>
    Array.isArray(body[key]) ? (body[key] as ImportEntry[]) : [];

  return {
    created: toEntries("created"),
    updated: toEntries("updated"),
    skipped: toEntries("skipped"),
    errors: toEntries("errors"),
  };
}

export default function EventUploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const fileCountLabel = useMemo(() => {
    if (!files.length) return "No files selected";
    return `${files.length} file${files.length === 1 ? "" : "s"} selected`;
  }, [files]);

  function mergeSelectedFiles(nextFiles: FileList | null) {
    if (!nextFiles) return;

    setFiles((current) => {
      const merged = [...current];
      const seen = new Set(
        current.map((file) => `${file.name}__${file.size}__${file.lastModified}`)
      );

      Array.from(nextFiles).forEach((file) => {
        const key = `${file.name}__${file.size}__${file.lastModified}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(file);
        }
      });

      return merged;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSummary(null);

    if (!files.length) {
      setErrorMessage("Choose one or more Excel workbooks to import.");
      return;
    }

    setSaving(true);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));

      const response = await fetch("/api/events/import", {
        method: "POST",
        body: formData,
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorMessage(getErrorMessage(body, response));
        return;
      }

      const normalized = normalizeSummary(body);

      if (!normalized) {
        setErrorMessage("Import finished, but the server returned an unexpected summary.");
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
    <main style={shellStyle}>
      <div style={containerStyle}>
        <div style={cardStyle}>
          <Link href="/events" style={linkStyle}>
            ← Back to Events
          </Link>
          <h1 style={{ margin: "14px 0 0", color: "#16213e", fontSize: "36px" }}>
            Upload SP Event Info Files
          </h1>
          <p style={{ margin: "8px 0 0", color: "#5a667a", fontSize: "16px" }}>
            Import multiple SP Event Info workbooks or a folder and create or update matching CFSP events.
          </p>
        </div>

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
            <h2 style={{ marginTop: 0 }}>Import Summary</h2>
            <div><strong>Created:</strong> {summary.created.length}</div>
            <div><strong>Updated:</strong> {summary.updated.length}</div>
            <div><strong>Skipped:</strong> {summary.skipped.length}</div>
            <div><strong>Errors:</strong> {summary.errors.length}</div>

            {(["created", "updated", "skipped", "errors"] as const).map((key) =>
              summary[key].length ? (
                <div key={key} style={{ marginTop: "14px" }}>
                  <div style={{ fontWeight: 900, textTransform: "capitalize" }}>{key}</div>
                  <div style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
                    {summary[key].map((entry, index) => (
                      <div
                        key={`${key}-${entry.file}-${entry.sheet || ""}-${index}`}
                        style={{
                          border: "1px solid rgba(22, 101, 52, 0.16)",
                          borderRadius: "12px",
                          padding: "10px 12px",
                          background: "#ffffff",
                          color: "#14532d",
                        }}
                      >
                        <div><strong>File:</strong> {entry.file}</div>
                        {entry.sheet ? <div><strong>Sheet:</strong> {entry.sheet}</div> : null}
                        {entry.event ? <div><strong>Event:</strong> {entry.event}</div> : null}
                        {entry.date ? <div><strong>Date:</strong> {entry.date}</div> : null}
                        {typeof entry.simStaffCount === "number" ? (
                          <div><strong>Sim Staff detected:</strong> {entry.simStaffCount}</div>
                        ) : null}
                        {entry.reason ? <div><strong>Reason:</strong> {entry.reason}</div> : null}
                        {entry.error ? <div><strong>Error:</strong> {entry.error}</div> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} style={{ ...cardStyle, display: "grid", gap: "16px" }}>
          <div style={{ display: "grid", gap: "14px" }}>
            <div>
              <label style={{ display: "block", color: "#173b6c", fontWeight: 900, marginBottom: "8px" }}>
                Upload Excel Files
              </label>
              <input
                type="file"
                accept={acceptedSpreadsheetTypes}
                multiple
                onChange={(event) => mergeSelectedFiles(event.target.files)}
              />
            </div>

            <div>
              <label style={{ display: "block", color: "#173b6c", fontWeight: 900, marginBottom: "8px" }}>
                Upload Folder
              </label>
              <input
                type="file"
                accept={acceptedSpreadsheetTypes}
                multiple
                {...({ webkitdirectory: "" } as Record<string, string>)}
                onChange={(event) => mergeSelectedFiles(event.target.files)}
              />
            </div>

            <div style={{ marginTop: "4px", color: "#64748b", fontWeight: 700 }}>{fileCountLabel}</div>
            {files.length ? (
              <button
                type="button"
                onClick={() => setFiles([])}
                style={{
                  ...buttonStyle,
                  width: "fit-content",
                  background: "#ffffff",
                  color: "#173b6c",
                  border: "1px solid #cbd5e1",
                }}
              >
                Clear Selection
              </button>
            ) : null}
          </div>

          <p style={{ margin: 0, color: "#64748b", fontWeight: 700, lineHeight: 1.6 }}>
            Each file is processed individually. The importer detects valid SP Event Info sheets, extracts title,
            event dates, Sim Staff, and workbook details, then creates or updates matching events by title + date.
          </p>

          <div>
            <button type="submit" disabled={saving} style={{ ...buttonStyle, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Importing..." : "Import Files"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
