"use client";

import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import SiteShell from "../components/SiteShell";

type SPRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  working_email?: string | null;
  email?: string | null;
  phone?: string | null;
  secondary_phone?: string | null;
  portrayal_age?: string | null;
  race?: string | null;
  sex?: string | null;
  status?: string | null;
  do_not_hire_for?: string | null;
  telehealth?: string | null;
  pt_preferred?: string | null;
  other_roles?: string | null;
  birth_year?: string | number | null;
  secondary_email?: string | null;
  speaks_spanish?: string | boolean | null;
  notes?: string | null;
  created_at?: string | null;
};

type NewSPForm = {
  first_name: string;
  last_name: string;
  working_email: string;
  phone: string;
  portrayal_age: string;
  race: string;
  sex: string;
  telehealth: string;
  pt_preferred: string;
  other_roles: string;
  status: string;
  notes: string;
};

const emptyForm: NewSPForm = {
  first_name: "",
  last_name: "",
  working_email: "",
  phone: "",
  portrayal_age: "",
  race: "",
  sex: "",
  telehealth: "",
  pt_preferred: "",
  other_roles: "",
  status: "Active",
  notes: "",
};

const cardStyle: CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: "20px",
  padding: "18px",
  background: "#ffffff",
  boxShadow: "0 8px 22px rgba(15, 23, 42, 0.05)",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "14px",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: "10px",
  padding: "10px 12px",
  fontSize: "14px",
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: "6px",
  color: "#334155",
  fontWeight: 700,
  fontSize: "13px",
};

const statStyle: CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: "16px",
  padding: "14px",
  background: "#f8fbff",
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

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getFullName(sp: SPRow) {
  const explicit = asText(sp.full_name);
  if (explicit) return explicit;

  const joined = [sp.first_name, sp.last_name].map(asText).filter(Boolean).join(" ");
  return joined || "Unnamed SP";
}

function getEmail(sp: SPRow) {
  return asText(sp.working_email) || asText(sp.email);
}

function getSearchText(sp: SPRow) {
  return [
    getFullName(sp),
    getEmail(sp),
    sp.phone,
    sp.secondary_phone,
    sp.portrayal_age,
    sp.race,
    sp.sex,
    sp.telehealth,
    sp.pt_preferred,
    sp.other_roles,
    sp.status,
    sp.notes,
  ]
    .map(asText)
    .join(" ")
    .toLowerCase();
}

function sortSPs(a: SPRow, b: SPRow) {
  return getFullName(a).localeCompare(getFullName(b));
}

function toNullable(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

async function parseApiError(response: Response) {
  try {
    const body = await response.json();
    return asText(body?.error) || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

async function fetchSPs() {
  const response = await fetch("/api/sps", { cache: "no-store" });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const data = await response.json();
  console.log("/api/sps response", data);
  return Array.isArray(data?.sps) ? (data.sps as SPRow[]) : [];
}

export default function SPPage() {
  const [sps, setSps] = useState<SPRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<NewSPForm>(emptyForm);

  async function loadSPs() {
    try {
      const data = await fetchSPs();
      setSps(data.sort(sortSPs));
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load SPs from Supabase.");
      setSps([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    void fetchSPs()
      .then((data) => {
        if (cancelled) return;
        setSps(data.sort(sortSPs));
        setErrorMessage("");
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "Could not load SPs from Supabase.");
        setSps([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSps = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sps;
    return sps.filter((sp) => getSearchText(sp).includes(needle));
  }, [query, sps]);

  const activeCount = sps.filter((sp) => {
    const status = asText(sp.status).toLowerCase();
    return !status || status === "active";
  }).length;

  const spanishCount = sps.filter((sp) => {
    const value = sp.speaks_spanish;
    return value === true || asText(value).toLowerCase() === "yes";
  }).length;

  function updateForm(field: keyof NewSPForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");

    if (!form.first_name.trim() && !form.last_name.trim()) {
      setErrorMessage("Enter at least a first or last name.");
      setSaving(false);
      return;
    }

    const payload = {
      first_name: toNullable(form.first_name),
      last_name: toNullable(form.last_name),
      working_email: toNullable(form.working_email),
      phone: toNullable(form.phone),
      portrayal_age: toNullable(form.portrayal_age),
      race: toNullable(form.race),
      sex: toNullable(form.sex),
      telehealth: toNullable(form.telehealth),
      pt_preferred: toNullable(form.pt_preferred),
      other_roles: toNullable(form.other_roles),
      status: toNullable(form.status) || "Active",
      notes: toNullable(form.notes),
    };

    try {
      const response = await fetch("/api/sps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setErrorMessage(await parseApiError(response));
        setSaving(false);
        return;
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create SP in Supabase.");
      setSaving(false);
      return;
    }

    setForm(emptyForm);
    setSaving(false);
    await loadSPs();
  }

  return (
    <SiteShell
      title="SP Database"
      subtitle="Live standardized-patient directory loaded from Supabase."
    >
      <div style={{ display: "grid", gap: "18px" }}>
        {errorMessage ? (
          <div
            style={{
              border: "1px solid #fecaca",
              borderRadius: "14px",
              background: "#fff5f5",
              color: "#991b1b",
              padding: "12px 14px",
              fontWeight: 700,
            }}
          >
            Supabase error: {errorMessage}
          </div>
        ) : null}

        <section style={gridStyle}>
          <div style={statStyle}>
            <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 800 }}>
              Total SPs
            </div>
            <div style={{ color: "#173b6c", fontSize: "30px", fontWeight: 900 }}>
              {sps.length}
            </div>
          </div>

          <div style={statStyle}>
            <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 800 }}>
              Active / Unspecified
            </div>
            <div style={{ color: "#173b6c", fontSize: "30px", fontWeight: 900 }}>
              {activeCount}
            </div>
          </div>

          <div style={statStyle}>
            <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 800 }}>
              Spanish-Speaking
            </div>
            <div style={{ color: "#173b6c", fontSize: "30px", fontWeight: 900 }}>
              {spanishCount}
            </div>
          </div>
        </section>

        <form onSubmit={handleCreate} style={{ ...cardStyle, display: "grid", gap: "14px" }}>
          <h2 style={{ margin: 0, color: "#173b6c" }}>Add SP</h2>

          <div style={gridStyle}>
            <TextField label="First name" value={form.first_name} onChange={(value) => updateForm("first_name", value)} />
            <TextField label="Last name" value={form.last_name} onChange={(value) => updateForm("last_name", value)} />
            <TextField label="Working email" value={form.working_email} onChange={(value) => updateForm("working_email", value)} />
            <TextField label="Phone" value={form.phone} onChange={(value) => updateForm("phone", value)} />
            <TextField label="Portrayal age" value={form.portrayal_age} onChange={(value) => updateForm("portrayal_age", value)} />
            <TextField label="Race" value={form.race} onChange={(value) => updateForm("race", value)} />
            <TextField label="Sex" value={form.sex} onChange={(value) => updateForm("sex", value)} />
            <TextField label="Telehealth" value={form.telehealth} onChange={(value) => updateForm("telehealth", value)} />
            <TextField label="PT preferred" value={form.pt_preferred} onChange={(value) => updateForm("pt_preferred", value)} />
            <TextField label="Other roles" value={form.other_roles} onChange={(value) => updateForm("other_roles", value)} />
            <TextField label="Status" value={form.status} onChange={(value) => updateForm("status", value)} />
            <TextField label="Notes" value={form.notes} onChange={(value) => updateForm("notes", value)} />
          </div>

          <div>
            <button type="submit" disabled={saving} style={{ ...buttonStyle, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Saving..." : "Save SP to Supabase"}
            </button>
          </div>
        </form>

        <section style={{ ...cardStyle, display: "grid", gap: "14px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "14px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <h2 style={{ margin: 0, color: "#173b6c" }}>Directory</h2>
            <button type="button" onClick={loadSPs} style={{ ...buttonStyle, background: "#ffffff", color: "#173b6c" }}>
              Refresh
            </button>
          </div>

          <label style={labelStyle}>
            Search SPs
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, email, phone, role, race, sex, notes..."
              style={inputStyle}
            />
          </label>

          {loading ? (
            <p style={{ margin: 0, color: "#64748b" }}>Loading SPs from Supabase...</p>
          ) : filteredSps.length === 0 ? (
            <p style={{ margin: 0, color: "#64748b" }}>No SPs match the current search.</p>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {filteredSps.map((sp, index) => (
                <SPCard key={asText(sp.id) || `${getEmail(sp)}-${index}`} sp={sp} />
              ))}
            </div>
          )}
        </section>
      </div>
    </SiteShell>
  );
}

function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={labelStyle}>
      {props.label}
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        style={inputStyle}
      />
    </label>
  );
}

function SPCard({ sp }: { sp: SPRow }) {
  const status = asText(sp.status) || "Active";
  const email = getEmail(sp);
  const demographics = [sp.portrayal_age, sp.race, sp.sex].map(asText).filter(Boolean);
  const roleDetails = [sp.telehealth, sp.pt_preferred, sp.other_roles].map(asText).filter(Boolean);

  return (
    <article
      style={{
        border: "1px solid #dbe4ee",
        borderRadius: "16px",
        padding: "16px",
        background: "#f8fbff",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: "#173b6c", fontSize: "24px" }}>
            {getFullName(sp)}
          </h3>
          <div style={{ color: "#64748b", fontWeight: 700, marginTop: "4px" }}>
            {status}
          </div>
        </div>

        <div
          style={{
            border: "1px solid #bfdbfe",
            color: "#1d4ed8",
            background: "#eff6ff",
            borderRadius: "999px",
            padding: "7px 11px",
            height: "fit-content",
            fontWeight: 800,
            fontSize: "12px",
          }}
        >
          Supabase
        </div>
      </div>

      <div style={{ marginTop: "12px", display: "grid", gap: "6px", color: "#334155" }}>
        <div><strong>Email:</strong> {email || "-"}</div>
        <div><strong>Phone:</strong> {asText(sp.phone) || "-"}</div>
        <div><strong>Secondary phone:</strong> {asText(sp.secondary_phone) || "-"}</div>
        <div><strong>Demographics:</strong> {demographics.join(" / ") || "-"}</div>
        <div><strong>Preferences / roles:</strong> {roleDetails.join(" / ") || "-"}</div>
        <div><strong>Do not hire for:</strong> {asText(sp.do_not_hire_for) || "-"}</div>
        <div><strong>Secondary email:</strong> {asText(sp.secondary_email) || "-"}</div>
        <div><strong>Spanish:</strong> {asText(sp.speaks_spanish) || "-"}</div>
        <div><strong>Notes:</strong> {asText(sp.notes) || "-"}</div>
      </div>
    </article>
  );
}
