"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { syncSessionWithServer } from "../lib/clientAuth";

const cardStyle: React.CSSProperties = {
  maxWidth: "440px",
  margin: "64px auto",
  border: "1px solid #d8e0ee",
  borderRadius: "18px",
  padding: "24px",
  background: "#ffffff",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "10px",
  boxSizing: "border-box",
};

const buttonStyle: React.CSSProperties = {
  border: "1px solid #173b6c",
  borderRadius: "12px",
  background: "#173b6c",
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: 800,
  padding: "11px 16px",
  width: "100%",
};

function formatAuthError(message?: string | null) {
  const text = (message || "").trim();
  if (!text) return "Login failed.";

  const lowered = text.toLowerCase();
  if (lowered.includes("invalid login credentials")) {
    return "Invalid login credentials. This login only works for existing Supabase Auth users.";
  }
  if (lowered.includes("email not confirmed")) {
    return "Your email is not confirmed yet. Check your inbox for the Supabase confirmation email.";
  }
  if (lowered.includes("email provider is disabled")) {
    return "Supabase email/password auth is disabled for this project.";
  }

  return text;
}

export default function LoginPage() {
  const router = useRouter();
  const [nextPath] = useState(() => {
    if (typeof window === "undefined") return "/events";
    const params = new URLSearchParams(window.location.search);
    return params.get("next") || "/events";
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled || !data.session) return;

      try {
        await syncSessionWithServer(data.session);
        router.replace(nextPath);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Could not persist login session."
          );
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [nextPath, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error || !data.session) {
      setErrorMessage(formatAuthError(error?.message));
      setSaving(false);
      return;
    }

    try {
      await syncSessionWithServer(data.session);
      router.replace(nextPath);
    } catch (syncError) {
      setErrorMessage(syncError instanceof Error ? syncError.message : "Could not persist login session.");
      setSaving(false);
      return;
    }

    setSaving(false);
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "24px" }}>
      <form onSubmit={handleSubmit} style={cardStyle}>
        <h1 style={{ marginTop: 0, color: "#173b6c", fontSize: "34px" }}>CFSP Login</h1>
        <p style={{ color: "#64748b", lineHeight: 1.6 }}>
          Sign in with your Supabase account to access CFSP operations.
        </p>
        <p
          style={{
            marginTop: "10px",
            padding: "10px 12px",
            borderRadius: "10px",
            background: "#f8fbff",
            color: "#475569",
            lineHeight: 1.6,
          }}
        >
          This login only works for existing Supabase Auth users.
          {" "}
          <Link href="/signup" style={{ color: "#1d4ed8", fontWeight: 700 }}>
            Create a test account
          </Link>
          {" "}
          if you do not have one yet.
        </p>

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

        <div style={{ display: "grid", gap: "14px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontWeight: 700, color: "#173b6c" }}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              style={inputStyle}
            />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontWeight: 700, color: "#173b6c" }}>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              style={inputStyle}
            />
          </label>

          <button type="submit" disabled={saving} style={{ ...buttonStyle, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Signing In..." : "Sign In"}
          </button>
        </div>
      </form>
    </main>
  );
}
