"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f4f7fb",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 16px",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "460px",
  background: "#ffffff",
  border: "1px solid #d7dfeb",
  borderRadius: "18px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  padding: "28px",
};

const titleStyle: React.CSSProperties = {
  margin: "0 0 8px 0",
  fontSize: "30px",
  fontWeight: 800,
  color: "#17324d",
};

const subtitleStyle: React.CSSProperties = {
  margin: "0 0 24px 0",
  fontSize: "15px",
  lineHeight: 1.5,
  color: "#5d6b7a",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "8px",
  fontSize: "14px",
  fontWeight: 700,
  color: "#29435c",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "10px",
  border: "1px solid #c7d3e0",
  fontSize: "15px",
  outline: "none",
  marginBottom: "16px",
  boxSizing: "border-box",
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: "10px",
  border: "none",
  background: "#1e4f8a",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: "10px",
  border: "1px solid #c7d3e0",
  background: "#ffffff",
  color: "#17324d",
  fontSize: "15px",
  fontWeight: 700,
  cursor: "pointer",
  marginTop: "10px",
};

const infoStyle: React.CSSProperties = {
  marginTop: "16px",
  padding: "12px 14px",
  borderRadius: "10px",
  background: "#eef5ff",
  color: "#21476b",
  fontSize: "14px",
};

const errorStyle: React.CSSProperties = {
  marginTop: "16px",
  padding: "12px 14px",
  borderRadius: "10px",
  background: "#fff1f1",
  color: "#a12626",
  fontSize: "14px",
};

const footerStyle: React.CSSProperties = {
  marginTop: "18px",
  textAlign: "center" as const,
  fontSize: "14px",
  color: "#5d6b7a",
};

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) return;

      if (error) {
        setErrorMessage(error.message);
        setCheckingSession(false);
        return;
      }

      if (data.session) {
        router.replace("/dashboard");
        return;
      }

      setCheckingSession(false);
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace("/dashboard");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");
    setInfoMessage("");

    const cleanEmail = email.trim();

    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    setInfoMessage("Login successful. Opening dashboard...");
    router.replace("/dashboard");
    router.refresh();
  }

  async function handleResetPassword() {
    setErrorMessage("");
    setInfoMessage("");

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setErrorMessage("Enter your email first, then click reset password.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo:
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined,
    });

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    setInfoMessage("Password reset email sent. Check your inbox.");
    setLoading(false);
  }

  if (checkingSession) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>CFSP</h1>
          <p style={subtitleStyle}>Checking your login session...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>CFSP Login</h1>
        <p style={subtitleStyle}>
          Conflict-Free SP scheduling and event management.
        </p>

        <form onSubmit={handleLogin}>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@school.edu"
            style={inputStyle}
            autoComplete="email"
          />

          <label style={labelStyle}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            style={inputStyle}
            autoComplete="current-password"
          />

          <button type="submit" style={buttonStyle} disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <button
          type="button"
          style={secondaryButtonStyle}
          onClick={handleResetPassword}
          disabled={loading}
        >
          Reset Password
        </button>

        {errorMessage ? <div style={errorStyle}>{errorMessage}</div> : null}
        {infoMessage ? <div style={infoStyle}>{infoMessage}</div> : null}

        <div style={footerStyle}>
          <Link href="/" style={{ color: "#1e4f8a", fontWeight: 700 }}>
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
