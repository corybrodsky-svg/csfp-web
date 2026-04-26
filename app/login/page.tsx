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
  const [debugStep, setDebugStep] = useState("");
  const [logoVisible, setLogoVisible] = useState(true);

  function markStep(step: string, detail?: string) {
    const line = detail ? `${step} — ${detail}` : step;
    setDebugStep(line);
    console.info("[CFSP login]", line);
  }

  function failAtStep(step: string, detail: string) {
    const line = `${step} failed — ${detail}`;
    setDebugStep(line);
    setErrorMessage(line);
    console.error("[CFSP login]", line);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    setDebugStep("");

    try {
      let accessToken = "";
      let refreshToken = "";

      try {
        markStep("STEP 1", "Supabase client initialized");
        const supabase = getSupabaseClient();

        markStep("STEP 2", "Supabase signInWithPassword started");
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        markStep("STEP 3", "Supabase signInWithPassword returned");

        if (error || !data.session?.access_token || !data.session.refresh_token) {
          failAtStep(
            "STEP 3",
            `Supabase auth error: ${formatAuthError(error?.message || "Could not sign in.")}`
          );
          setSaving(false);
          return;
        }

        accessToken = data.session.access_token;
        refreshToken = data.session.refresh_token;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not sign in.";
        failAtStep("STEP 1/2/3", `Supabase auth error: ${formatAuthError(message)}`);
        setSaving(false);
        return;
      }

      let persistResponse: Response;
      try {
        markStep("STEP 4", "POST /api/auth/session started");
        persistResponse = await fetch("/api/auth/session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            access_token: accessToken,
            refresh_token: refreshToken,
          }),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "No response from session bridge.";
        failAtStep("STEP 4", `Network/fetch error posting to /api/auth/session: ${message}`);
        setSaving(false);
        return;
      }

      const persistBody = (await persistResponse.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
          }
        | null;

      markStep(
        "STEP 5",
        `/api/auth/session returned ${persistResponse.status} ${persistResponse.statusText}${
          persistBody?.error ? ` — ${persistBody.error}` : ""
        }`
      );

      if (!persistResponse.ok || !persistBody?.ok) {
        failAtStep(
          "STEP 5",
          `Session bridge error: ${persistBody?.error || `${persistResponse.status} ${persistResponse.statusText}`}`
        );
        setSaving(false);
        return;
      }

      markStep("STEP 6", "redirect to /dashboard");
      window.location.assign("/dashboard");
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not sign in.";
      failAtStep("UNKNOWN STEP", message);
      setSaving(false);
    }
  }

  return (
    <main className="cfsp-page flex min-h-screen items-center justify-center px-4 py-6">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[18px] border border-[#d9e4ec] bg-white shadow-[0_18px_42px_rgba(24,52,78,0.08)] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden bg-[linear-gradient(180deg,#0f4673_0%,#145b96_100%)] px-8 py-8 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-white text-base font-black tracking-[0.14em] text-[#0f4673]">
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
                <p className="m-0 text-sm font-black uppercase tracking-[0.12em] text-[#d1f0e5]">CFSP</p>
                <h1 className="m-0 mt-1 text-[2rem] leading-tight font-black">Conflict-Free SP</h1>
              </div>
            </div>

            <p className="mt-6 max-w-xl text-[1.05rem] leading-7 text-white/88">
              Simulation event coverage, SP assignment, and availability tracking in one place.
            </p>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[14px] border border-white/16 bg-white/8 px-5 py-4">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-white/70">Why teams use CFSP</p>
              <ul className="mt-3 grid gap-2 pl-5 text-sm leading-6 text-white/88">
                <li>Keep simulation event coverage organized in one workflow.</li>
                <li>Review assignments, staffing gaps, and coverage status quickly.</li>
                <li>Reduce manual tracking across spreadsheets and scattered notes.</li>
              </ul>
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="px-6 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
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
              <p className="m-0 text-sm font-bold text-[#4f677d]">Conflict-Free SP</p>
            </div>
          </div>

          <p className="cfsp-kicker">Sign in</p>
          <h2 className="mt-3 text-[2rem] leading-tight font-black text-[#14304f]">Access your workspace</h2>
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

          {errorMessage ? <div className="cfsp-alert cfsp-alert-error mt-5">{errorMessage}</div> : null}
          {debugStep ? (
            <div className="mt-3 text-sm leading-6 text-[#5e7388]">
              Login status: <span className="font-semibold text-[#14304f]">{debugStep}</span>
            </div>
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

            <button type="submit" disabled={saving} className="cfsp-btn cfsp-btn-primary mt-1 w-full disabled:opacity-70">
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
