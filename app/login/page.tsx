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

const readinessNodes = [
  { label: "SP", x: "18%", y: "24%", delay: "0s" },
  { label: "Room", x: "49%", y: "18%", delay: "0.9s" },
  { label: "Flow", x: "76%", y: "32%", delay: "1.8s" },
  { label: "Case", x: "28%", y: "68%", delay: "2.4s" },
  { label: "Live", x: "68%", y: "72%", delay: "3.1s" },
];

const roomCells = Array.from({ length: 12 }, (_, index) => index + 1);

const commandStatuses = [
  "SP Confirmed",
  "Room Ready",
  "Learner Flow Ready",
  "Materials Linked",
];

function getSafeReturnTo() {
  if (typeof window === "undefined") return "";
  const raw = new URLSearchParams(window.location.search).get("returnTo") || "";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "";
  if (raw.includes("\\") || raw.includes("\n") || raw.includes("\r")) return "";
  return raw;
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

      const returnTo = getSafeReturnTo();
      if (meJson?.accessStatus === "no_active_membership" || !meJson?.activeOrganization) {
        if (returnTo.startsWith("/sp/invite/")) {
          window.location.replace(returnTo);
          return;
        }
        window.location.replace("/no-access");
        return;
      }

      window.location.replace(returnTo || "/dashboard");
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
            <div className="cfsp-login-command-visual mt-8" aria-label="CFSP simulation operations readiness visualization">
              <div className="cfsp-login-orbit" aria-hidden="true" />
              <div className="cfsp-login-scan" aria-hidden="true" />
              <div className="cfsp-login-path cfsp-login-path-a" aria-hidden="true" />
              <div className="cfsp-login-path cfsp-login-path-b" aria-hidden="true" />

              <div className="cfsp-login-visual-header">
                <div>
                  <div className="cfsp-login-visual-kicker">Live readiness mesh</div>
                  <div className="cfsp-login-visual-title">Simulation command surface</div>
                </div>
                <div className="cfsp-login-visual-pill">Ready Room</div>
              </div>

              <div className="cfsp-login-room-grid" aria-hidden="true">
                {roomCells.map((cell) => (
                  <div key={`login-room-${cell}`} className="cfsp-login-room-cell">
                    <span>Room {cell}</span>
                    <i />
                  </div>
                ))}
              </div>

              {readinessNodes.map((node) => (
                <div
                  key={`readiness-node-${node.label}`}
                  className="cfsp-login-readiness-node"
                  style={{
                    left: node.x,
                    top: node.y,
                    animationDelay: node.delay,
                  }}
                >
                  <span>{node.label}</span>
                </div>
              ))}

              <div className="cfsp-login-schedule-line" aria-hidden="true">
                <span style={{ left: "9%" }} />
                <span style={{ left: "38%" }} />
                <span style={{ left: "65%" }} />
                <span style={{ left: "88%" }} />
              </div>

              <div className="cfsp-login-status-stack">
                {commandStatuses.map((status, index) => (
                  <div
                    key={status}
                    className="cfsp-login-status-chip"
                    style={{ animationDelay: `${index * 0.7}s` }}
                  >
                    <span className="cfsp-login-status-dot" />
                    {status}
                  </div>
                ))}
              </div>
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

        <style>{`
          .cfsp-login-command-visual {
            position: relative;
            min-height: 340px;
            overflow: hidden;
            border-radius: 24px;
            border: 1px solid rgba(126, 231, 219, 0.18);
            background:
              radial-gradient(circle at 18% 20%, rgba(126, 231, 219, 0.16), transparent 28%),
              radial-gradient(circle at 82% 22%, rgba(73, 168, 255, 0.13), transparent 30%),
              linear-gradient(180deg, rgba(7, 23, 36, 0.82) 0%, rgba(9, 30, 46, 0.76) 100%);
            box-shadow:
              0 18px 48px rgba(0, 0, 0, 0.24),
              inset 0 1px 0 rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(12px);
          }

          .cfsp-login-command-visual::before {
            content: "";
            position: absolute;
            inset: 0;
            background-image:
              linear-gradient(rgba(126, 231, 219, 0.07) 1px, transparent 1px),
              linear-gradient(90deg, rgba(126, 231, 219, 0.06) 1px, transparent 1px);
            background-size: 34px 34px;
            mask-image: linear-gradient(180deg, rgba(0,0,0,0.96), rgba(0,0,0,0.24));
            pointer-events: none;
          }

          .cfsp-login-command-visual::after {
            content: "";
            position: absolute;
            inset: 0;
            background:
              radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1.4px);
            background-size: 42px 42px;
            opacity: 0.18;
            animation: cfsp-login-drift 18s linear infinite;
            pointer-events: none;
          }

          .cfsp-login-visual-header {
            position: relative;
            z-index: 2;
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 14px;
            padding: 18px 18px 0;
          }

          .cfsp-login-visual-kicker {
            color: #9fe8db;
            font-size: 0.68rem;
            font-weight: 950;
            letter-spacing: 0.14em;
            text-transform: uppercase;
          }

          .cfsp-login-visual-title {
            margin-top: 4px;
            color: #f7fbff;
            font-size: 1rem;
            font-weight: 950;
            letter-spacing: 0.01em;
          }

          .cfsp-login-visual-pill {
            border: 1px solid rgba(126, 231, 219, 0.22);
            border-radius: 999px;
            background: rgba(126, 231, 219, 0.1);
            color: #d8fff6;
            padding: 6px 9px;
            font-size: 0.68rem;
            font-weight: 900;
            white-space: nowrap;
          }

          .cfsp-login-room-grid {
            position: absolute;
            left: 18px;
            right: 18px;
            top: 82px;
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
            z-index: 2;
          }

          .cfsp-login-room-cell {
            min-height: 48px;
            border: 1px solid rgba(143, 194, 240, 0.18);
            border-radius: 13px;
            background: rgba(255, 255, 255, 0.055);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
            padding: 8px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            color: rgba(226, 242, 255, 0.78);
            font-size: 0.64rem;
            font-weight: 850;
          }

          .cfsp-login-room-cell i {
            display: block;
            width: 44%;
            height: 3px;
            border-radius: 999px;
            background: linear-gradient(90deg, rgba(126, 231, 219, 0.9), rgba(73, 168, 255, 0.32));
            box-shadow: 0 0 12px rgba(126, 231, 219, 0.26);
            animation: cfsp-login-cell-ready 4.8s ease-in-out infinite;
          }

          .cfsp-login-readiness-node {
            position: absolute;
            z-index: 4;
            width: 58px;
            height: 58px;
            margin-left: -29px;
            margin-top: -29px;
            border-radius: 999px;
            border: 1px solid rgba(126, 231, 219, 0.24);
            background: radial-gradient(circle, rgba(126, 231, 219, 0.22), rgba(20, 91, 150, 0.12) 52%, rgba(7, 23, 36, 0.42));
            box-shadow: 0 0 24px rgba(126, 231, 219, 0.18);
            display: grid;
            place-items: center;
            color: #e8fff9;
            font-size: 0.62rem;
            font-weight: 950;
            animation: cfsp-login-node-pulse 5s ease-in-out infinite;
          }

          .cfsp-login-readiness-node::after {
            content: "";
            position: absolute;
            inset: -9px;
            border-radius: inherit;
            border: 1px solid rgba(126, 231, 219, 0.1);
          }

          .cfsp-login-schedule-line {
            position: absolute;
            z-index: 3;
            left: 28px;
            right: 28px;
            bottom: 76px;
            height: 2px;
            border-radius: 999px;
            background: linear-gradient(90deg, rgba(73,168,255,0.16), rgba(126,231,219,0.72), rgba(25,138,112,0.2));
            box-shadow: 0 0 18px rgba(126, 231, 219, 0.2);
          }

          .cfsp-login-schedule-line::after {
            content: "";
            position: absolute;
            top: -2px;
            width: 46px;
            height: 6px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.74);
            box-shadow: 0 0 18px rgba(126, 231, 219, 0.42);
            animation: cfsp-login-schedule-move 7.5s ease-in-out infinite;
          }

          .cfsp-login-schedule-line span {
            position: absolute;
            top: -5px;
            width: 12px;
            height: 12px;
            border-radius: 999px;
            background: #7ee7db;
            box-shadow: 0 0 18px rgba(126, 231, 219, 0.45);
          }

          .cfsp-login-status-stack {
            position: absolute;
            z-index: 4;
            left: 18px;
            right: 18px;
            bottom: 18px;
            display: flex;
            flex-wrap: wrap;
            gap: 7px;
          }

          .cfsp-login-status-chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            border: 1px solid rgba(126, 231, 219, 0.18);
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.08);
            color: #d6e7f6;
            padding: 6px 8px;
            font-size: 0.66rem;
            font-weight: 850;
            animation: cfsp-login-chip-breathe 5.5s ease-in-out infinite;
          }

          .cfsp-login-status-dot {
            width: 7px;
            height: 7px;
            border-radius: 999px;
            background: #7ee7db;
            box-shadow: 0 0 12px rgba(126, 231, 219, 0.64);
          }

          .cfsp-login-scan {
            position: absolute;
            z-index: 3;
            left: 0;
            right: 0;
            top: 0;
            height: 90px;
            background: linear-gradient(180deg, transparent, rgba(126, 231, 219, 0.12), transparent);
            animation: cfsp-login-scan 8s ease-in-out infinite;
            pointer-events: none;
          }

          .cfsp-login-orbit {
            position: absolute;
            z-index: 1;
            width: 260px;
            height: 260px;
            right: -80px;
            bottom: -120px;
            border: 1px solid rgba(126, 231, 219, 0.12);
            border-radius: 999px;
            box-shadow: inset 0 0 50px rgba(73, 168, 255, 0.06);
          }

          .cfsp-login-path {
            position: absolute;
            z-index: 1;
            height: 1px;
            transform-origin: left center;
            background: linear-gradient(90deg, transparent, rgba(126, 231, 219, 0.32), transparent);
          }

          .cfsp-login-path-a {
            left: 20%;
            top: 46%;
            width: 54%;
            transform: rotate(10deg);
          }

          .cfsp-login-path-b {
            left: 18%;
            top: 63%;
            width: 62%;
            transform: rotate(-16deg);
          }

          @keyframes cfsp-login-drift {
            from { transform: translate3d(0, 0, 0); }
            to { transform: translate3d(42px, 42px, 0); }
          }

          @keyframes cfsp-login-cell-ready {
            0%, 100% { opacity: 0.38; width: 34%; }
            50% { opacity: 0.95; width: 68%; }
          }

          @keyframes cfsp-login-node-pulse {
            0%, 100% { transform: scale(1); opacity: 0.78; }
            50% { transform: scale(1.06); opacity: 1; }
          }

          @keyframes cfsp-login-schedule-move {
            0% { left: 0%; opacity: 0.35; }
            18% { opacity: 1; }
            82% { opacity: 1; }
            100% { left: calc(100% - 46px); opacity: 0.42; }
          }

          @keyframes cfsp-login-chip-breathe {
            0%, 100% { transform: translateY(0); border-color: rgba(126, 231, 219, 0.16); }
            50% { transform: translateY(-2px); border-color: rgba(126, 231, 219, 0.3); }
          }

          @keyframes cfsp-login-scan {
            0%, 100% { transform: translateY(-100px); opacity: 0; }
            18% { opacity: 0.7; }
            68% { opacity: 0.32; }
            100% { transform: translateY(350px); opacity: 0; }
          }

          @media (prefers-reduced-motion: reduce) {
            .cfsp-login-command-visual::after,
            .cfsp-login-room-cell i,
            .cfsp-login-readiness-node,
            .cfsp-login-schedule-line::after,
            .cfsp-login-status-chip,
            .cfsp-login-scan {
              animation: none;
            }
          }
        `}</style>

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
              CFSP accounts are approved by organization. Submit an access request with your Organization Access Code.
            </div>
            <div className="mt-4">
              <Link href="/request-access" className="cfsp-btn cfsp-btn-secondary w-full">
                Request Access
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
            <Link href="/forgot-password" className="text-center text-sm font-black text-[#165a96]">
              Forgot password?
            </Link>
          </div>

          <p className="mt-5 text-center text-sm leading-6 text-[#6a7e91]">
            Sign in with your CFSP email and password to continue to your dashboard.
          </p>
        </form>
      </div>
    </main>
  );
}
