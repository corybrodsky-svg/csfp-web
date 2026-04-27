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
  maxWidth: "1080px",
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

const secondaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "#ffffff",
  color: "#173b6c",
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
  sheet: string;
  detectorMatched: "sp_event_info" | "sp_info";
  extractedTitle: string;
  extractedDates: string[];
  fieldsFound: string[];
  spFound: number;
  simStaffCount: number;
  staffExtracted: string | null;
  matchedEvent?: string;
  matchedEventId?: string;
  confidence?: number;
  confidenceLabel?: "exact" | "high" | "medium" | "low";
  willUpdate?: string[];
  needsReviewReason?: string;
  reason?: string;
  error?: string;
  checkedSheets?: string[];
  spMatched?: number;
  spAssignmentsCreated?: number;
  duplicatesAvoided?: number;
  unmatchedSpRows?: Array<{ name: string; email: string }>;
};

type ImportSummary = {
  preview: ImportEntry[];
  updated: ImportEntry[];
  skipped: ImportEntry[];
  errors: ImportEntry[];
  needsReview: ImportEntry[];
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
  const toEntries = (key: keyof ImportSummary) =>
    Array.isArray(body[key]) ? (body[key] as ImportEntry[]) : [];

  return {
    preview: toEntries("preview"),
    updated: toEntries("updated"),
    skipped: toEntries("skipped"),
    errors: toEntries("errors"),
    needsReview: toEntries("needsReview"),
  };
}

function toneForConfidence(label?: ImportEntry["confidenceLabel"]) {
  if (label === "exact") return { background: "#ecfdf3", border: "#86efac", color: "#166534" };
  if (label === "high") return { background: "#eff6ff", border: "#93c5fd", color: "#1d4ed8" };
  if (label === "medium") return { background: "#fff7ed", border: "#fdba74", color: "#9a3412" };
  return { background: "#fff2f1", border: "#efc4c0", color: "#af2f26" };
}

export default function EventUploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const fileCountLabel = useMemo(() => {
    if (!files.length) return "No files selected";
    return `${files.length} file${files.length === 1 ? "" : "s"} selected`;
  }, [files]);

  const confidentPreviewCount = useMemo(
    () => (summary?.preview || []).filter((entry) => entry.confidenceLabel === "exact" || entry.confidenceLabel === "high").length,
    [summary]
  );

  function mergeSelectedFiles(nextFiles: FileList | null) {
    if (!nextFiles) return;

    setFiles((current) => {
      const merged = [...current];
      const seen = new Set(current.map((file) => `${file.name}__${file.size}__${file.lastModified}`));

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

  async function submitImport(action: "preview" | "apply") {
    setErrorMessage("");

    if (!files.length) {
      setErrorMessage("Choose one or more Excel workbooks to import.");
      return;
    }

    if (action === "preview") {
      setSaving(true);
      setSummary(null);
    } else {
      setApplying(true);
    }

    try {
      const formData = new FormData();
      formData.append("action", action);
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
      setApplying(false);
    }
  }

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitImport("preview");
  }

  return (
    <main style={shellStyle}>
      <div style={containerStyle}>
        <div style={cardStyle}>
          <Link href="/events" style={linkStyle}>
            ← Back to Events
          </Link>
          <h1 style={{ margin: "14px 0 0", color: "#16213e", fontSize: "36px" }}>Bulk SP Event Info Import</h1>
          <p style={{ margin: "8px 0 0", color: "#5a667a", fontSize: "16px" }}>
            Upload multiple SP Event Info workbooks, preview how each file maps to an existing CFSP event, then apply only confident updates.
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

        <form onSubmit={handlePreview} style={{ ...cardStyle, display: "grid", gap: "16px" }}>
          <div style={{ display: "grid", gap: "14px" }}>
            <div>
              <label style={{ display: "block", color: "#173b6c", fontWeight: 900, marginBottom: "8px" }}>
                Upload Excel Files
              </label>
              <input type="file" accept={acceptedSpreadsheetTypes} multiple onChange={(event) => mergeSelectedFiles(event.target.files)} />
            </div>

            <div>
              <label style={{ display: "block", color: "#173b6c", fontWeight: 900, marginBottom: "8px" }}>
                Upload Folder
              </label>
              <input
                type="file"
                accept={acceptedSpreadsheetTypes}
                multiple
                onChange={(event) => mergeSelectedFiles(event.target.files)}
                {...({ webkitdirectory: "true", directory: "true" } as Record<string, string>)}
              />
            </div>

            <div style={{ color: "#4b5563", fontWeight: 700 }}>{fileCountLabel}</div>

            {files.length ? (
              <div
                style={{
                  border: "1px solid #dbe4ee",
                  borderRadius: "14px",
                  padding: "12px 14px",
                  background: "#f8fbff",
                }}
              >
                <div style={{ fontWeight: 900, color: "#173b6c", marginBottom: "8px" }}>Selected files</div>
                <div style={{ display: "grid", gap: "6px", color: "#475569" }}>
                  {files.map((file) => (
                    <div key={`${file.name}-${file.lastModified}`}>{file.name}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="submit" disabled={saving || applying} style={buttonStyle}>
              {saving ? "Building Preview..." : "Preview Import"}
            </button>
            <button
              type="button"
              onClick={() => {
                setFiles([]);
                setSummary(null);
                setErrorMessage("");
              }}
              style={secondaryButtonStyle}
            >
              Clear Selection
            </button>
          </div>
        </form>

        {summary ? (
          <div style={cardStyle}>
            <h2 style={{ marginTop: 0, color: "#16213e" }}>Import Preview</h2>
            <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
              <SummaryCard label="Previewed Files" value={summary.preview.length} />
              <SummaryCard label="Confident Matches" value={confidentPreviewCount} />
              <SummaryCard label="Needs Review" value={summary.needsReview.length} />
              <SummaryCard label="Skipped" value={summary.skipped.length} />
              <SummaryCard label="Errors" value={summary.errors.length} />
            </div>

            <div style={{ marginTop: "16px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void submitImport("apply")}
                disabled={applying || saving || confidentPreviewCount === 0}
                style={buttonStyle}
              >
                {applying ? "Applying Updates..." : "Apply Confident Updates"}
              </button>
              <div style={{ color: "#475569", fontWeight: 700, alignSelf: "center" }}>
                Only exact and high-confidence matches are applied. Review items stay untouched.
              </div>
            </div>

            {summary.updated.length ? (
              <PreviewGroup
                title="Updated Events"
                entries={summary.updated}
                renderExtra={(entry) => (
                  <>
                    <div><strong>SPs matched:</strong> {entry.spMatched ?? 0}</div>
                    <div><strong>Assignments created:</strong> {entry.spAssignmentsCreated ?? 0}</div>
                    <div><strong>Duplicates avoided:</strong> {entry.duplicatesAvoided ?? 0}</div>
                    {entry.unmatchedSpRows?.length ? (
                      <div><strong>Unmatched SPs:</strong> {entry.unmatchedSpRows.map((row) => row.name || row.email).join(", ")}</div>
                    ) : null}
                  </>
                )}
              />
            ) : null}

            <PreviewGroup title="Preview Matches" entries={summary.preview} />
            <PreviewGroup title="Needs Review" entries={summary.needsReview} />
            <PreviewGroup title="Skipped Files" entries={summary.skipped} />
            <PreviewGroup title="Errors" entries={summary.errors} />
          </div>
        ) : null}

        <div style={{ ...cardStyle, lineHeight: 1.7 }}>
          <h2 style={{ marginTop: 0, color: "#16213e" }}>Supported behavior</h2>
          <ul style={{ paddingLeft: "20px", margin: "12px 0 0", color: "#475569" }}>
            <li>Detects valid SP Event Info sheets by workbook structure, not sheet name alone.</li>
            <li>Matches events by exact title + date first, then by title similarity + closest date.</li>
            <li>Preserves existing notes and appends imported workbook details inside a deduplicated <code>[SP_EVENT_INFO_IMPORT]</code> section.</li>
            <li>Creates missing <code>event_sps</code> assignments only for confident SP directory matches and avoids duplicates on re-import.</li>
          </ul>
        </div>
      </div>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        border: "1px solid #dbe4ee",
        borderRadius: "14px",
        padding: "14px 16px",
        background: "#f8fbff",
      }}
    >
      <div style={{ fontSize: "12px", fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ marginTop: "8px", fontSize: "26px", fontWeight: 900, color: "#173b6c" }}>{value}</div>
    </div>
  );
}

function PreviewGroup({
  title,
  entries,
  renderExtra,
}: {
  title: string;
  entries: ImportEntry[];
  renderExtra?: (entry: ImportEntry) => React.ReactNode;
}) {
  if (!entries.length) return null;

  return (
    <div style={{ marginTop: "18px" }}>
      <h3 style={{ margin: "0 0 10px", color: "#173b6c" }}>{title}</h3>
      <div style={{ display: "grid", gap: "10px" }}>
        {entries.map((entry, index) => {
          const tone = toneForConfidence(entry.confidenceLabel);
          return (
            <div
              key={`${title}-${entry.file}-${entry.sheet}-${index}`}
              style={{
                border: "1px solid #dbe4ee",
                borderRadius: "14px",
                padding: "14px 16px",
                background: "#ffffff",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 900, color: "#173b6c" }}>{entry.file}</div>
                  {entry.sheet ? <div style={{ color: "#64748b", fontWeight: 700 }}>Sheet: {entry.sheet}</div> : null}
                </div>
                {entry.confidenceLabel ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      borderRadius: "999px",
                      padding: "6px 10px",
                      fontSize: "12px",
                      fontWeight: 900,
                      background: tone.background,
                      color: tone.color,
                      border: `1px solid ${tone.border}`,
                    }}
                  >
                    {entry.confidenceLabel.toUpperCase()}
                    {typeof entry.confidence === "number" ? ` · ${entry.confidence}` : ""}
                  </span>
                ) : null}
              </div>

              <div style={{ display: "grid", gap: "6px", marginTop: "10px", color: "#334155" }}>
                <div><strong>Workbook title:</strong> {entry.extractedTitle || "Not detected"}</div>
                {entry.matchedEvent ? <div><strong>Matched event:</strong> {entry.matchedEvent}</div> : null}
                {entry.extractedDates.length ? <div><strong>Dates found:</strong> {entry.extractedDates.join(", ")}</div> : null}
                <div><strong>Fields found:</strong> {entry.fieldsFound.length ? entry.fieldsFound.join(", ") : "None"}</div>
                <div><strong>SPs found:</strong> {entry.spFound}</div>
                {typeof entry.simStaffCount === "number" ? <div><strong>Sim Staff detected:</strong> {entry.simStaffCount}</div> : null}
                {entry.staffExtracted ? <div><strong>Staff line:</strong> {entry.staffExtracted}</div> : null}
                {entry.willUpdate?.length ? <div><strong>Will update:</strong> {entry.willUpdate.join("; ")}</div> : null}
                {entry.needsReviewReason ? <div><strong>Needs review:</strong> {entry.needsReviewReason}</div> : null}
                {entry.reason ? <div><strong>Reason:</strong> {entry.reason}</div> : null}
                {entry.error ? <div><strong>Error:</strong> {entry.error}</div> : null}
                {entry.checkedSheets?.length ? <div><strong>Checked sheets:</strong> {entry.checkedSheets.join(", ")}</div> : null}
                {renderExtra ? renderExtra(entry) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
