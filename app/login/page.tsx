"use client";

import Link from "next/link";
import { useState } from "react";

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
  maxWidth: "560px",
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
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      alert("Please enter your email and password.");
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>CFSP Ops Board</h1>
        <p style={subtitleStyle}>
          Sign in with your account email and password.
        </p>

        <form onSubmit={handleLogin}>
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
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button type="submit" style={buttonStyle}>
            Log In
          </button>
        </form>

        <div style={secondaryRowStyle}>
          <Link href="/dashboard" style={linkStyle}>Dashboard</Link>
          <Link href="/events" style={linkStyle}>Events</Link>
          <Link href="/sps" style={linkStyle}>SP Database</Link>
          <Link href="/admin" style={linkStyle}>Admin</Link>
        </div>

        <p style={helperStyle}>
          Temporary password login screen for routing and navigation.
        </p>
      </div>
    </main>
  );
}
