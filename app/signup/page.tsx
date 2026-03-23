"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#05070b",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "Arial, Helvetica, sans-serif",
  padding: "24px",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "680px",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "18px",
  padding: "28px",
  color: "#ffffff",
  boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
};

const titleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: "8px",
  fontSize: "36px",
};

const subtitleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: "22px",
  color: "#cbd5e1",
  lineHeight: 1.5,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "8px",
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "14px",
  borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "#0c1118",
  color: "#ffffff",
  marginBottom: "16px",
  fontSize: "16px",
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px",
  borderRadius: "12px",
  border: "none",
  background: "#2563eb",
  color: "#ffffff",
  fontWeight: 700,
  fontSize: "16px",
  cursor: "pointer",
  marginBottom: "14px",
};

const secondaryRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
  marginTop: "10px",
};

const linkStyle: React.CSSProperties = {
  color: "#93c5fd",
  textDecoration: "none",
  fontWeight: 600,
};

const helperStyle: React.CSSProperties = {
  marginTop: "8px",
  color: "#cbd5e1",
  fontSize: "14px",
  lineHeight: 1.6,
};

const messageStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: "12px",
  marginBottom: "16px",
  fontSize: "14px",
};

export default function SignupPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setErrorMessage("Please complete all required fields.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          role,
        },
      },
    });

    setLoading(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage("Account created. You can now log in.");
    setTimeout(() => {
      router.push("/login");
    }, 1200);
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Create Account</h1>
        <p style={subtitleStyle}>
          Create a real CFSP account using Supabase email/password auth.
        </p>

        {errorMessage ? (
          <div
            style={{
              ...messageStyle,
              background: "rgba(220, 38, 38, 0.18)",
              border: "1px solid rgba(248, 113, 113, 0.35)",
              color: "#fecaca",
            }}
          >
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div
            style={{
              ...messageStyle,
              background: "rgba(22, 163, 74, 0.18)",
              border: "1px solid rgba(74, 222, 128, 0.35)",
              color: "#bbf7d0",
            }}
          >
            {successMessage}
          </div>
        ) : null}

        <form onSubmit={handleSignup}>
          <label style={labelStyle}>Full Name</label>
          <input
            style={inputStyle}
            type="text"
            placeholder="Cory Brodsky"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />

          <label style={labelStyle}>Role</label>
          <select
            style={inputStyle}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="admin">Administrator</option>
            <option value="sim-op">Sim Op</option>
            <option value="sp">SP</option>
          </select>

          <label style={labelStyle}>Email</label>
          <input
            style={inputStyle}
            type="email"
            placeholder="you@drexel.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label style={labelStyle}>Password</label>
          <input
            style={inputStyle}
            type="password"
            placeholder="Create password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button type="submit" style={buttonStyle} disabled={loading}>
            {loading ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        <div style={secondaryRowStyle}>
          <Link href="/login" style={linkStyle}>
            Back to Login
          </Link>
          <Link href="/dashboard" style={linkStyle}>
            Dashboard
          </Link>
        </div>

        <p style={helperStyle}>
          This saves name and role into auth user metadata for now.
        </p>
      </div>
    </main>
  );
}
