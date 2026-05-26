"use client";

import Link from "next/link";
import { useState } from "react";

const roleOptions = [
  { value: "viewer", label: "Viewer" },
  { value: "faculty", label: "Faculty" },
  { value: "sp", label: "SP" },
  { value: "sim_ops", label: "Sim Ops" },
  { value: "org_admin", label: "Organization Admin" },
];

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export default function RequestAccessPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [requestedRole, setRequestedRole] = useState("viewer");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/access-requests", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: fullName,
          email,
          access_code: accessCode,
          requested_role: requestedRole,
          note,
        }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;

      if (!response.ok) {
        setErrorMessage(asText(body?.error) || "Could not submit access request.");
        return;
      }

      setSuccessMessage(
        asText(body?.message) ||
          "Access request submitted. A CFSP administrator must approve your account before you can sign in."
      );
      setFullName("");
      setEmail("");
      setAccessCode("");
      setRequestedRole("viewer");
      setNote("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not submit access request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="cfsp-page flex min-h-screen items-center justify-center px-4 py-8">
      <form onSubmit={handleSubmit} className="cfsp-panel grid w-full max-w-2xl gap-5 px-6 py-6">
        <div>
          <p className="cfsp-kicker">Organization Access Code</p>
          <h1 className="mt-3 text-[2rem] leading-tight font-black text-[#14304f]">
            Request CFSP access
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#5e7388]">
            Submit your work email and organization code. A CFSP administrator must approve your account before you can sign in.
          </p>
        </div>

        {errorMessage ? <div className="cfsp-alert cfsp-alert-error">{errorMessage}</div> : null}
        {successMessage ? <div className="cfsp-alert cfsp-alert-info">{successMessage}</div> : null}

        <div className="grid gap-4">
          <label className="grid gap-2">
            <span className="cfsp-label">Full name</span>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              required
              className="cfsp-input"
            />
          </label>

          <label className="grid gap-2">
            <span className="cfsp-label">Work email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              className="cfsp-input"
            />
          </label>

          <label className="grid gap-2">
            <span className="cfsp-label">Organization Access Code</span>
            <input
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              required
              className="cfsp-input"
            />
          </label>

          <label className="grid gap-2">
            <span className="cfsp-label">Requested role</span>
            <select
              value={requestedRole}
              onChange={(event) => setRequestedRole(event.target.value)}
              className="cfsp-input"
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="cfsp-label">Optional note</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="cfsp-input min-h-[110px]"
            />
          </label>

          <button type="submit" disabled={saving} className="cfsp-btn cfsp-btn-primary disabled:opacity-70">
            {saving ? "Submitting..." : "Submit Access Request"}
          </button>
          <Link href="/login" className="cfsp-btn cfsp-btn-secondary">
            Back to Login
          </Link>
        </div>
      </form>
    </main>
  );
}
