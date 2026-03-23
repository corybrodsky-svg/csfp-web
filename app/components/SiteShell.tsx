"use client";

import Link from "next/link";
import React from "react";

type SiteShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f4f7fb",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const containerStyle: React.CSSProperties = {
  maxWidth: "1200px",
  margin: "0 auto",
  padding: "24px",
};

const headerStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #d6deeb",
  borderRadius: "18px",
  padding: "22px",
  marginBottom: "18px",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "36px",
  color: "#16213e",
};

const subtitleStyle: React.CSSProperties = {
  margin: "8px 0 0 0",
  fontSize: "16px",
  color: "#5a667a",
};

const navWrapStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  marginTop: "18px",
};

const navLinkStyle: React.CSSProperties = {
  textDecoration: "none",
  padding: "11px 16px",
  borderRadius: "12px",
  border: "1px solid #cfd7e6",
  background: "#ffffff",
  color: "#16213e",
  fontWeight: 700,
  fontSize: "14px",
};

const contentCardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #d6deeb",
  borderRadius: "18px",
  padding: "22px",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
};

export default function SiteShell({
  title,
  subtitle,
  children,
}: SiteShellProps) {
  return (
    <main style={shellStyle}>
      <div style={containerStyle}>
        <section style={headerStyle}>
          <h1 style={titleStyle}>{title}</h1>
          {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}

          <div style={navWrapStyle}>
            <Link href="/dashboard" style={navLinkStyle}>Dashboard</Link>
            <Link href="/events" style={navLinkStyle}>Events</Link>
            <Link href="/events/new" style={navLinkStyle}>New Event</Link>
            <Link href="/events/upload" style={navLinkStyle}>Upload</Link>
            <Link href="/sps" style={navLinkStyle}>SP Database</Link>
            <Link href="/sim-op" style={navLinkStyle}>Sim Op</Link>
            <Link href="/staff" style={navLinkStyle}>Staff</Link>
            <Link href="/admin" style={navLinkStyle}>Admin</Link>
            <Link href="/me" style={navLinkStyle}>Me</Link>
            <Link href="/login" style={navLinkStyle}>Login</Link>
          </div>
        </section>

        <section style={contentCardStyle}>{children}</section>
      </div>
    </main>
  );
}
