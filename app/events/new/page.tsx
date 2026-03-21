"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

const STATUSES = ["Needs SPs", "Scheduled", "In Progress", "Complete"];
const VISIBILITIES = ["team", "personal"];

function parseNumber(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export default function NewEventPage() {
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [name, setName] = useState("");
  const [status, setStatus] = useState("Needs SPs");
  const [dateText, setDateText] = useState("");
  const [spNeeded, setSpNeeded] = useState("0");
  const [spAssigned, setSpAssigned] = useState("0");
  const [visibility, setVisibility] = useState("team");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMessage("");

    const trimmedName = name.trim();

    if (!trimmedName) {
      setErrorMessage("Event name is required.");
      setSaving(false);
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setErrorMessage("You must be logged in to create an event.");
      setSaving(false);
      router.push("/login?role=administrator");
      return;
    }

    const payload = {
      name: trimmedName,
      status,
      date_text: dateText.trim(),
      sp_needed: parseNumber(spNeeded),
      sp_assigned: parseNumber(spAssigned),
      visibility,
      owner_id: user.id,
      assigned_operator_id: user.id,
    };

    const { error } = await supabase.from("events").insert([payload]);

    if (error) {
      setErrorMessage(error.message || "Could not create event.");
      setSaving(false);
      return;
    }

    router.push("/events");
    router.refresh();
  }

  return (
    <div
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "24px",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ marginBottom: "18px" }}>
        <button
          type="button"
          onClick={() => router.push("/events")}
          style={{
            background: "transparent",
            border: "none",
            color: "#1d4ed8",
            fontWeight: 700,
            cursor: "pointer",
            padding: 0,
          }}
        >
          ← Back to Events
        </button>
      </div>

      <div
        style={{
          border: "1px solid #d8e0ee",
          borderRadius: "18px",
          padding: "24px",
          background: "#ffffff",
          boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: "20px", fontSize: "34px" }}>
          Create New Event
        </h1>

        {errorMessage ? (
          <div
            style={{
              marginBottom: "16px",
              padding: "12px",
              border: "1px solid #fecaca",
              background: "#fff5f5",
              color: "#991b1b",
              borderRadius: "10px",
            }}
          >
            {errorMessage}
          </div>
        ) : null}

        <form onSubmit={handleCreate} style={{ display: "grid", gap: "16px" }}>
          <div>
            <label htmlFor="name" style={{ display: "block", fontWeight: 700, marginBottom: "6px" }}>
              Event Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter event name"
              required
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label htmlFor="status" style={{ display: "block", fontWeight: 700, marginBottom: "6px" }}>
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                boxSizing: "border-box",
              }}
            >
              {STATUSES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="dateText" style={{ display: "block", fontWeight: 700, marginBottom: "6px" }}>
              Date(s)
            </label>
            <input
              id="dateText"
              type="text"
              value={dateText}
              onChange={(e) => setDateText(e.target.value)}
              placeholder="Example: 4/20, 4/21"
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label htmlFor="spNeeded" style={{ display: "block", fontWeight: 700, marginBottom: "6px" }}>
              SP Needed
            </label>
            <input
              id="spNeeded"
              type="number"
              min="0"
              value={spNeeded}
              onChange={(e) => setSpNeeded(e.target.value)}
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label htmlFor="spAssigned" style={{ display: "block", fontWeight: 700, marginBottom: "6px" }}>
              SP Assigned
            </label>
            <input
              id="spAssigned"
              type="number"
              min="0"
              value={spAssigned}
              onChange={(e) => setSpAssigned(e.target.value)}
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label htmlFor="visibility" style={{ display: "block", fontWeight: 700, marginBottom: "6px" }}>
              Visibility
            </label>
            <select
              id="visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                boxSizing: "border-box",
              }}
            >
              {VISIBILITIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "10px 16px",
                borderRadius: "8px",
                border: "1px solid #111827",
                background: "#111827",
                color: "#fff",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
                fontWeight: 700,
              }}
            >
              {saving ? "Creating..." : "Create Event"}
            </button>

            <Link
              href="/events"
              style={{
                display: "inline-block",
                padding: "10px 16px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                color: "#111827",
                textDecoration: "none",
              }}
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
