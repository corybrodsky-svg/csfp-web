"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  checkSupabaseBrowserConnectivity,
  getSupabaseBrowserClientError,
  requireSupabaseBrowserClient,
} from "../lib/supabaseClient";

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
  maxWidth: "520px",
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

const infoPanelStyle: React.CSSProperties = {
  marginTop: "22px",
  padding: "14px 16px",
  borderRadius: "14px",
  border: "1px solid #cfe0fb",
  background: "#f8fbff",
  color: "#4b5f77",
  lineHeight: 1.6,
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

const secondaryLinkStyle: React.CSSProperties = {
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

function formatSignupError(message?: string | null) {
  const text = (message || "").trim();
  if (!text) return "Could not create account.";

  const lowered = text.toLowerCase();
  if (lowered.includes("user already registered")) {
    return "That email is already registered. Use the login page instead.";
  }
  if (lowered.includes("password should be at least")) {
    return text;
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

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
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

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    let error;

    try {
      const browserClient = requireSupabaseBrowserClient();
      const result = await browserClient.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role: "viewer",
          },
        },
      });
      error = result.error;
    } catch (authError) {
      setErrorMessage(formatBrowserAuthError(authError));
      setSaving(false);
      return;
    }

    if (error) {
      setErrorMessage(formatSignupError(error.message));
      setSaving(false);
      return;
    }

    setSuccessMessage(
      "Account created. If email confirmation is enabled, check your inbox. Otherwise you can log in now."
    );
    setSaving(false);
    window.setTimeout(() => router.push("/login"), 1200);
  }

  return (
    <main style={pageStyle}>
      <form onSubmit={handleSubmit} style={cardStyle}>
        <p style={eyebrowStyle}>CFSP Operations</p>
        <h1 style={titleStyle}>Create Account</h1>
        <p style={subtitleStyle}>
          Set up a new account so you can sign in and access the CFSP operations workspace.
        </p>

        <div style={infoPanelStyle}>
          Already have an account?
          {" "}
          <Link href="/login" style={{ color: "#1d4ed8", fontWeight: 800 }}>
            Return to Sign In
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

        {successMessage ? (
          <div
            style={{
              marginTop: "18px",
              padding: "13px 14px",
              border: "1px solid #bbf7d0",
              background: "#f0fdf4",
              color: "#166534",
              borderRadius: "12px",
              lineHeight: 1.6,
              fontWeight: 700,
            }}
          >
            {successMessage}
          </div>
        ) : null}

        {!errorMessage && !successMessage && connectivityMessage ? (
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
            <span style={labelStyle}>Full Name</span>
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              style={inputStyle}
            />
          </label>

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
              autoComplete="new-password"
              minLength={6}
              required
              style={inputStyle}
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            style={{ ...primaryButtonStyle, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Creating Account..." : "Create Account"}
          </button>

          <Link href="/login" style={secondaryLinkStyle}>
            Back to Sign In
          </Link>
        </div>
      </form>
    </main>
  );
}
