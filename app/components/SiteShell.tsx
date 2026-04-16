"use client";

import Link from "next/link";

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
  padding: "20px 24px 24px",
};

const headerStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #d6deeb",
  borderRadius: "20px",
  padding: "18px 20px",
  marginBottom: "16px",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
};

const headerTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "18px",
  flexWrap: "wrap",
};

const brandWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  minWidth: "280px",
};

const brandMarkStyle: React.CSSProperties = {
  width: "46px",
  height: "46px",
  borderRadius: "14px",
  background: "linear-gradient(135deg, #173b6c 0%, #245ca1 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.15)",
  flexShrink: 0,
};

const brandNameStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "20px",
  fontWeight: 900,
  color: "#16213e",
  lineHeight: 1.1,
};

const brandSubtitleStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: "12px",
  color: "#64748b",
  fontWeight: 700,
  letterSpacing: "0.02em",
};

const pageIntroStyle: React.CSSProperties = {
  flex: "1 1 300px",
  minWidth: "260px",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "31px",
  color: "#16213e",
  lineHeight: 1.08,
};

const subtitleStyle: React.CSSProperties = {
  margin: "6px 0 0 0",
  fontSize: "15px",
  color: "#5a667a",
  lineHeight: 1.5,
};

const navWrapStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  marginTop: "16px",
  paddingTop: "14px",
  borderTop: "1px solid #e7edf5",
};

const navLinkStyle: React.CSSProperties = {
  textDecoration: "none",
  padding: "9px 13px",
  borderRadius: "12px",
  border: "1px solid #cfd7e6",
  background: "#ffffff",
  color: "#16213e",
  fontWeight: 700,
  fontSize: "13px",
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
          <div style={headerTopStyle}>
            <div style={brandWrapStyle}>
              <div style={brandMarkStyle} aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <rect x="4" y="4" width="20" height="20" rx="6" fill="rgba(255,255,255,0.16)" />
                  <path
                    d="M10 9.5H18.5M10 14H16.5M10 18.5H14.5"
                    stroke="#ffffff"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                  <circle cx="19.5" cy="18.5" r="2.5" fill="#ffffff" />
                </svg>
              </div>

              <div>
                <p style={brandNameStyle}>CFSP Ops Board</p>
                <p style={brandSubtitleStyle}>Conflict-Free SP · Simulation Operations</p>
              </div>
            </div>

            <div style={pageIntroStyle}>
              <h1 style={titleStyle}>{title}</h1>
              {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
            </div>
          </div>

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
