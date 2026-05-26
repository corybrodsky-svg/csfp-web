"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "../lib/supabaseClient";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function formatResetError(value: unknown) {
  const text = value instanceof Error ? value.message : asText(value);
  if (!text) return "Could not update password.";
  if (text.toLowerCase().includes("auth session missing")) {
    return "This password reset link is expired or has already been used.";
  }
  return text;
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseClient();

    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      if (!cancelled) setReady(Boolean(data.session));
    }

    void loadSession();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setReady(Boolean(session));
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function persistServerSession() {
    const supabase = getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session?.access_token || !session.refresh_token) return;

    await fetch("/api/auth/session", {
      method: "POST",
      cache: "no-store",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }),
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      setSaving(false);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      setSaving(false);
      return;
    }

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      await persistServerSession();
      setSuccessMessage("Password updated. Redirecting...");
      window.setTimeout(() => {
        window.location.replace("/dashboard");
      }, 900);
    } catch (error) {
      setErrorMessage(formatResetError(error));
      setSaving(false);
    }
  }

  return (
    <main className="cfsp-page flex min-h-screen items-center justify-center px-4 py-8">
      <form onSubmit={handleSubmit} className="cfsp-panel grid w-full max-w-xl gap-5 px-6 py-6">
        <div>
          <p className="cfsp-kicker">Account setup</p>
          <h1 className="mt-3 text-[2rem] leading-tight font-black text-[#14304f]">
            Set a new password
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#5e7388]">
            Use the password reset or invitation link from your email to finish account setup.
          </p>
        </div>

        {!ready ? (
          <div className="cfsp-alert cfsp-alert-info">
            Waiting for a valid reset session. If this page stays here, request a fresh password recovery email.
          </div>
        ) : null}
        {errorMessage ? <div className="cfsp-alert cfsp-alert-error">{errorMessage}</div> : null}
        {successMessage ? <div className="cfsp-alert cfsp-alert-info">{successMessage}</div> : null}

        <label className="grid gap-2">
          <span className="cfsp-label">New password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
            className="cfsp-input"
          />
        </label>

        <label className="grid gap-2">
          <span className="cfsp-label">Confirm password</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
            className="cfsp-input"
          />
        </label>

        <button type="submit" disabled={saving || !ready} className="cfsp-btn cfsp-btn-primary disabled:opacity-70">
          {saving ? "Updating..." : "Update Password"}
        </button>
        <Link href="/login" className="cfsp-btn cfsp-btn-secondary">
          Back to Login
        </Link>
      </form>
    </main>
  );
}
