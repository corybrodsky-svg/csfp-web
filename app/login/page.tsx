"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { getSupabaseClient } from "../lib/supabaseClient";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function formatAuthError(message?: string | null) {
  const text = asText(message);
  if (!text) return "Could not sign in.";

  const lowered = text.toLowerCase();

  if (lowered.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }

  if (lowered.includes("email not confirmed")) {
    return "Your email is not confirmed yet.";
  }

  if (
    lowered.includes("failed to fetch") ||
    lowered.includes("fetch failed") ||
    lowered.includes("network") ||
    lowered.includes("timeout")
  ) {
    return "Could not reach the authentication service.";
  }

  return text;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [logoVisible, setLogoVisible] = useState(true);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");

    try {
      const supabase = getSupabaseClient();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error || !data.session?.access_token || !data.session.refresh_token) {
        setErrorMessage(formatAuthError(error?.message || "Could not sign in."));
        setSaving(false);
        return;
      }

      const persistResponse = await fetch("/api/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        }),
      });

      const persistBody = (await persistResponse.json().catch(() => null)) as { error?: string } | null;

      if (!persistResponse.ok) {
        setErrorMessage(persistBody?.error || "Could not persist sign-in session.");
        setSaving(false);
        return;
      }

      window.location.assign("/events");
      return;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not sign in.");
      setSaving(false);
    }
  }

  return (
    <main className="cfsp-page flex items-center justify-center px-5 py-8">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="cfsp-panel hidden overflow-hidden lg:block">
          <div className="flex h-full flex-col justify-between bg-[linear-gradient(180deg,#f8fcfd_0%,#eef6fb_100%)] px-8 py-8">
            <div>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-[#d6e6ea] bg-white text-base font-black tracking-[0.14em] text-[#0f4471]">
                  {logoVisible ? (
                    <Image
                      src="/branding/cfsp-logo.png"
                      alt="CFSP"
                      width={60}
                      height={60}
                      unoptimized
                      onError={() => setLogoVisible(false)}
                    />
                  ) : (
                    <span>CFSP</span>
                  )}
                </div>
                <div>
                  <p className="m-0 text-sm font-black uppercase tracking-[0.12em] text-[#165a96]">CFSP</p>
                  <h1 className="m-0 mt-1 text-[2rem] leading-tight font-black text-[#14304f]">
                    Conflict-Free SP
                  </h1>
                </div>
              </div>

              <p className="mt-6 max-w-xl text-[1.05rem] leading-7 text-[#4f677d]">
                Simulation event coverage, SP assignment, and availability tracking in one place.
              </p>
            </div>

            <div className="grid gap-4">
              <div className="cfsp-panel border-[#d9e6ec] bg-white/90 px-5 py-4 shadow-none">
                <p className="cfsp-label">What you can do here</p>
                <ul className="mt-3 grid gap-2 pl-5 text-sm leading-6 text-[#4f677d]">
                  <li>Review the live events board and staffing gaps.</li>
                  <li>Manage standardized patient assignments and availability.</li>
                  <li>Keep simulation coverage organized in one operational workspace.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="cfsp-panel px-6 py-6 sm:px-8 sm:py-8">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-[#d6e6ea] bg-white text-sm font-black tracking-[0.12em] text-[#0f4471]">
              {logoVisible ? (
                <Image
                  src="/branding/cfsp-logo.png"
                  alt="CFSP"
                  width={44}
                  height={44}
                  unoptimized
                  onError={() => setLogoVisible(false)}
                />
              ) : (
                <span>CFSP</span>
              )}
            </div>
            <div>
              <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#165a96]">CFSP</p>
              <p className="m-0 text-sm font-bold text-[#4f677d]">Conflict-Free SP operations</p>
            </div>
          </div>

          <p className="cfsp-kicker">Sign In</p>
          <h2 className="mt-3 text-[2rem] leading-tight font-black text-[#14304f]">Welcome back</h2>
          <p className="mt-3 text-[0.98rem] leading-6 text-[#5e7388]">
            Access the scheduling and simulation operations workspace with your existing account.
          </p>
          <p className="mt-3 text-sm font-bold leading-6 text-[#196b57]">
            Simulation event coverage, SP assignment, and availability tracking in one place.
          </p>

          <div className="cfsp-alert cfsp-alert-info mt-6">
            <div className="text-sm font-black text-[#14304f]">New here?</div>
            <div className="mt-2 text-sm leading-6 text-[#5e7388]">
              If you do not already have an account, create one first and then return here to sign in.
            </div>
            <div className="mt-4">
              <Link href="/signup" className="cfsp-btn cfsp-btn-secondary w-full">
                Create Account
              </Link>
            </div>
          </div>

          {errorMessage ? <div className="cfsp-alert cfsp-alert-error mt-5">{errorMessage}</div> : null}

          <div className="mt-6 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-bold text-[#14304f]">Email</span>
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
              <span className="text-sm font-bold text-[#14304f]">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                className="cfsp-input"
              />
            </label>

            <button type="submit" disabled={saving} className="cfsp-btn cfsp-btn-primary mt-1 w-full disabled:opacity-70">
              {saving ? "Signing In..." : "Sign In"}
            </button>
          </div>

          <p className="mt-5 text-center text-sm leading-6 text-[#6a7e91]">
            Sign in with your CFSP email and password to continue to the events board.
          </p>
        </form>
      </div>
    </main>
  );
}
