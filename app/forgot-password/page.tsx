"use client";

import Link from "next/link";
import { useState } from "react";
import { getSupabaseClient } from "../lib/supabaseClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const supabase = getSupabaseClient();
      await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } finally {
      setMessage("If an account exists for that email, password recovery instructions have been sent.");
      setSaving(false);
    }
  }

  return (
    <main className="cfsp-page flex min-h-screen items-center justify-center px-4 py-8">
      <form onSubmit={handleSubmit} className="cfsp-panel grid w-full max-w-xl gap-5 px-6 py-6">
        <div>
          <p className="cfsp-kicker">Password recovery</p>
          <h1 className="mt-3 text-[2rem] leading-tight font-black text-[#14304f]">
            Reset your password
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#5e7388]">
            Enter the email associated with your CFSP account.
          </p>
        </div>

        {message ? <div className="cfsp-alert cfsp-alert-info">{message}</div> : null}

        <label className="grid gap-2">
          <span className="cfsp-label">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            className="cfsp-input"
          />
        </label>

        <button type="submit" disabled={saving} className="cfsp-btn cfsp-btn-primary disabled:opacity-70">
          {saving ? "Sending..." : "Send Recovery Email"}
        </button>
        <Link href="/login" className="cfsp-btn cfsp-btn-secondary">
          Back to Login
        </Link>
      </form>
    </main>
  );
}
