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

      if (error || !data.session) {
        setErrorMessage(formatAuthError(error?.message || "Could not sign in."));
        setSaving(false);
        return;
      }

      const sessionResponse = await fetch("/api/auth/session", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        }),
      });

      const sessionJson = await sessionResponse.json().catch(() => null);

      if (!sessionResponse.ok || !sessionJson?.ok) {
        throw new Error(sessionJson?.error || "Could not create CFSP session.");
      }

      const meResponse = await fetch("/api/me", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      const meJson = await meResponse.json().catch(() => null);

      if (!meResponse.ok || !meJson?.ok) {
        throw new Error(meJson?.error || `CFSP session was created, but /api/me returned ${meResponse.status}.`);
      }

      window.location.replace("/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not sign in.";
      setErrorMessage(formatAuthError(message));
      setSaving(false);
    }
  }

  return (
    <main className="cfsp-page flex min-h-screen items-center justify-center px-4 py-6">
      <div
        className="grid w-full max-w-6xl overflow-hidden rounded-[18px] shadow-[0_18px_42px_rgba(24,52,78,0.08)] lg:grid-cols-[1.05fr_0.95fr]"
        style={{
          border: "1px solid var(--cfsp-border)",
          background: "var(--cfsp-surface)",
          color: "var(--cfsp-text)",
        }}
      >
        <section
          className="relative hidden overflow-hidden px-8 py-8 text-white lg:flex lg:flex-col lg:justify-between"
          style={{
            background:
              "radial-gradient(circle at 20% 20%, rgba(73,168,255,0.18), transparent 34%), radial-gradient(circle at 82% 18%, rgba(35,213,181,0.12), transparent 28%), linear-gradient(180deg, #060d16 0%, #0b1c2d 52%, #103452 100%)",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(rgba(255,255,255,0.08) 0.8px, transparent 0.8px)",
              backgroundSize: "28px 28px",
              maskImage: "linear-gradient(180deg, rgba(0,0,0,0.95), rgba(0,0,0,0.2))",
              opacity: 0.28,
              pointerEvents: "none",
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "linear-gradient(rgba(84,149,194,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(84,149,194,0.12) 1px, transparent 1px)",
              backgroundSize: "140px 140px",
              opacity: 0.28,
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div className="flex items-center gap-4">
              <div className="flex h-18 w-18 items-center justify-center overflow-hidden rounded-2xl bg-white/95 p-2 text-base font-black tracking-[0.14em] text-[#0f4673] shadow-[0_10px_30px_rgba(0,0,0,0.24)]">
                {logoVisible ? (
                  <Image
                    src="/branding/cfsp-logo.svg"
                    alt="CFSP"
                    width={64}
                    height={64}
                    unoptimized
                    onError={() => setLogoVisible(false)}
                  />
                ) : (
                  <span>CFSP</span>
                )}
              </div>
              <div>
                <p className="m-0 text-sm font-black uppercase tracking-[0.12em] text-[#a6efe0]">
                  CFSP
                </p>
                <h1 className="m-0 mt-1 text-[2rem] leading-tight font-black">
                  Conflict-Free SP
                </h1>
              </div>
            </div>

            <p className="mt-8 max-w-xl text-[2rem] leading-tight font-black text-white">
              Simulation Operations, Organized.
            </p>
            <p className="mt-5 max-w-xl text-[1.02rem] leading-7 text-[#d6e7f6]">
              Conflict-free scheduling for simulation teams, SP programs, and complex event days that need operational clarity instead of spreadsheet chaos.
            </p>
            <div className="mt-8 overflow-hidden rounded-[24px] border border-white/12 bg-[#091723]/70 shadow-[0_18px_48px_rgba(0,0,0,0.24)] backdrop-blur-sm">
              <Image
                src="/branding/cfsp-hero-ops.svg"
                alt="CFSP operations visualization"
                width={760}
                height={560}
                unoptimized
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            </div>
          </div>

          <div className="relative z-10 grid gap-4">
            <div className="grid gap-3 rounded-[18px] border border-white/14 bg-white/7 px-5 py-4 backdrop-blur-sm">
              <div className="text-xs font-black uppercase tracking-[0.12em] text-[#9fe8db]">
                Mission Control For Simulation Days
              </div>
              <div className="grid gap-2 text-sm leading-6 text-[#d6e7f6]">
                <div>Coordinate SP assignments, learner flow, and day-of timing from one operational workspace.</div>
                <div>Track rooms, sessions, materials, and staffing without losing the big-picture schedule.</div>
              </div>
            </div>
          </div>
        </section>

        <form
          onSubmit={handleSubmit}
          className="px-6 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10"
          style={{ background: "var(--cfsp-surface)", color: "var(--cfsp-text)" }}
        >
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-[#d6e6ea] bg-white text-sm font-black tracking-[0.12em] text-[#0f4471]">
              {logoVisible ? (
                <Image
                  src="/branding/cfsp-logo.svg"
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
              <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#165a96]">
                CFSP
              </p>
              <p className="m-0 text-sm font-bold text-[#4f677d]">Conflict-Free SP</p>
            </div>
          </div>

          <p className="cfsp-kicker">Sign in</p>
          <h2 className="mt-3 text-[2rem] leading-tight font-black text-[#14304f]">
            Access your workspace
          </h2>
          <p className="mt-3 max-w-xl text-[0.98rem] leading-6 text-[#5e7388]">
            Sign in with your existing account to manage coverage, assignments, and simulation operations.
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

          {errorMessage ? (
            <div className="cfsp-alert cfsp-alert-error mt-5">{errorMessage}</div>
          ) : null}

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

            <button
              type="submit"
              disabled={saving}
              className="cfsp-btn cfsp-btn-primary mt-1 w-full disabled:opacity-70"
            >
              {saving ? "Signing In..." : "Sign In"}
            </button>
          </div>

          <p className="mt-5 text-center text-sm leading-6 text-[#6a7e91]">
            Sign in with your CFSP email and password to continue to your dashboard.
          </p>
        </form>
      </div>
    </main>
  );
}
