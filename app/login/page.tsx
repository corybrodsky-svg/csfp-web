"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  checkSupabaseBrowserConnectivity,
  getSupabaseBrowserClientError,
  requireSupabaseBrowserClient,
} from "../lib/supabaseClient";
import { syncSessionWithServer } from "../lib/clientAuth";

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "linear-gradient(180deg, #eef4fb 0%, #f6f9fd 42%, #f4f7fb 100%)",
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

function formatBrowserAuthError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Could not complete browser authentication.";
  }

  const text = error.message.trim();
  if (text === "Failed to fetch") {
    return "Browser could not contact Supabase.";
  }

  return text || "Could not complete browser authentication.";
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
  const [connectivityMessage, setConnectivityMessage] = useState(
    () => getSupabaseBrowserClientError()
  );

  useEffect(() => {
    let cancelled = false;
    if (getSupabaseBrowserClientError()) {
      return () => {
        cancelled = true;
      };
    }

    void checkSupabaseBrowserConnectivity().then((result) => {
      if (cancelled || result.ok) return;
      setConnectivityMessage(result.message);
    });

    const browserClient = requireSupabaseBrowserClient();
    void browserClient.auth.getSession().then(async ({ data }) => {
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

    let data;
    let error;

    try {
      const browserClient = requireSupabaseBrowserClient();
      const result = await browserClient.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      data = result.data;
      error = result.error;
    } catch (authError) {
      setErrorMessage(formatBrowserAuthError(authError));
      setSaving(false);
      return;
    }

    if (error || !data.session) {
      setErrorMessage(formatAuthError(error?.message));
      setSaving(false);
      return;
    }

    try {
      await syncSessionWithServer(data.session);
      router.replace(nextPath);
    } catch (syncError) {
      setErrorMessage(
        syncError instanceof Error ? syncError.message : "Could not persist login session."
      );
      setSaving(false);
      return;
    }

    setSaving(false);
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

        {!errorMessage && connectivityMessage ? (
          <div
            style={{
              marginTop: "18px",
              padding: "13px 14px",
              border: "1px solid #fed7aa",
              background: "#fff7ed",
              color: "#9a3412",
              borderRadius: "12px",
              lineHeight: 1.6,
              fontWeight: 700,
            }}
          >
            {connectivityMessage}
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
          Use your confirmed Supabase Auth account. If sign-in fails, the exact auth message will appear above.
        </p>
      </form>
    </main>
  );
}
