"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

const cardStyle: React.CSSProperties = {
  maxWidth: "480px",
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

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          role: "viewer",
        },
      },
    });

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
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "24px" }}>
      <form onSubmit={handleSubmit} style={cardStyle}>
        <h1 style={{ marginTop: 0, color: "#173b6c", fontSize: "34px" }}>Create CFSP Account</h1>
        <p style={{ color: "#64748b", lineHeight: 1.6 }}>
          Minimal test-user signup for Supabase Auth.
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

        {successMessage ? (
          <div
            style={{
              marginBottom: "16px",
              padding: "12px",
              border: "1px solid #bbf7d0",
              background: "#f0fdf4",
              color: "#166534",
              borderRadius: "10px",
            }}
          >
            {successMessage}
          </div>
        ) : null}

        <div style={{ display: "grid", gap: "14px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontWeight: 700, color: "#173b6c" }}>Full Name</span>
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              style={inputStyle}
            />
          </label>

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
              autoComplete="new-password"
              minLength={6}
              required
              style={inputStyle}
            />
          </label>

          <button type="submit" disabled={saving} style={{ ...buttonStyle, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Creating Account..." : "Create Account"}
          </button>
        </div>

        <p style={{ marginTop: "16px", color: "#64748b" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "#1d4ed8", fontWeight: 700 }}>
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
