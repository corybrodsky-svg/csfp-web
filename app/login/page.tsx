"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../lib/supabaseClient";

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #eef4fb 0%, #f6f9fd 42%, #f4f7fb 100%)",
  padding: "32px 20px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "500px",
  border: "1px solid #d7e3f0",
  borderRadius: "24px",
  padding: "32px",
  background: "#ffffff",
  boxShadow: "0 20px 44px rgba(15, 23, 42, 0.10)",
};

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "12px",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#3b82f6",
};

const titleStyle: React.CSSProperties = {
  margin: "10px 0 0",
  color: "#173b6c",
  fontSize: "36px",
  lineHeight: 1.1,
};

const subtitleStyle: React.CSSProperties = {
  margin: "12px 0 0",
  color: "#5b6b7f",
  fontSize: "16px",
  lineHeight: 1.6,
};

const noticeStyle: React.CSSProperties = {
  marginTop: "22px",
  padding: "14px 16px",
  borderRadius: "14px",
  border: "1px solid #cfe0fb",
  background: "#f8fbff",
};

const inputGroupStyle: React.CSSProperties = {
  display: "grid",
  gap: "8px",
};

const labelStyle: React.CSSProperties = {
  fontWeight: 800,
  color: "#173b6c",
  fontSize: "14px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  border: "1px solid #c9d5e4",
  borderRadius: "12px",
  boxSizing: "border-box",
  fontSize: "15px",
  background: "#ffffff",
};

const primaryButtonStyle: React.CSSProperties = {
  border: "1px solid #173b6c",
  borderRadius: "14px",
  background: "#173b6c",
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: 800,
  padding: "13px 18px",
  width: "100%",
  fontSize: "15px",
};

const secondaryButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  border: "1px solid #c8d6e7",
  borderRadius: "14px",
  background: "#ffffff",
  color: "#173b6c",
  textDecoration: "none",
  fontWeight: 800,
  padding: "13px 18px",
  fontSize: "15px",
  boxSizing: "border-box",
};

const helperTextStyle: React.CSSProperties = {
  marginTop: "18px",
  color: "#64748b",
  fontSize: "13px",
  lineHeight: 1.6,
  textAlign: "center",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        setSaving(false);
        return;
      }

      const accessToken = data.session?.access_token || "";
      const refreshToken = data.session?.refresh_token || "";

      if (!accessToken || !refreshToken) {
        setErrorMessage("Sign-in succeeded, but the session could not be prepared.");
        setSaving(false);
        return;
      }

      const sessionResponse = await fetch("/api/auth/session", {
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

      const sessionBody = (await sessionResponse.json().catch(() => null)) as { error?: string } | null;

      if (!sessionResponse.ok) {
        setErrorMessage(sessionBody?.error || "Could not persist sign-in session.");
        setSaving(false);
        return;
      }

      router.push("/events");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not sign in.");
      setSaving(false);
    }
  }

  return (
    <main style={pageStyle}>
      <form onSubmit={handleSubmit} style={cardStyle}>
        <p style={eyebrowStyle}>CFSP Operations</p>
        <h1 style={titleStyle}>Sign In</h1>
        <p style={subtitleStyle}>
          Access the scheduling and simulation operations workspace with your existing account.
        </p>

        <div style={noticeStyle}>
          <div style={{ color: "#173b6c", fontWeight: 800, marginBottom: "10px" }}>
            New here?
          </div>
          <div style={{ color: "#5b6b7f", lineHeight: 1.6, marginBottom: "14px" }}>
            If you do not already have an account, create one first and then return here to sign in.
          </div>
          <Link href="/signup" style={secondaryButtonStyle}>
            Create Account
          </Link>
        </div>

        {errorMessage ? (
          <div
            style={{
              marginTop: "18px",
              padding: "13px 14px",
              border: "1px solid #fecaca",
              background: "#fff5f5",
              color: "#991b1b",
              borderRadius: "12px",
              lineHeight: 1.6,
              fontWeight: 700,
            }}
          >
            {errorMessage}
          </div>
        ) : null}

        <div style={{ display: "grid", gap: "16px", marginTop: "22px" }}>
          <label style={inputGroupStyle}>
            <span style={labelStyle}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              style={inputStyle}
            />
          </label>

          <label style={inputGroupStyle}>
            <span style={labelStyle}>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              style={inputStyle}
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            style={{ ...primaryButtonStyle, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Signing In..." : "Sign In"}
          </button>
        </div>

        <p style={helperTextStyle}>
          Sign in with your CFSP email and password to continue to the events board.
        </p>
      </form>
    </main>
  );
}
