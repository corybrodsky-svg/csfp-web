import Link from "next/link";
import SiteShell from "../components/SiteShell";

const sectionStyle: React.CSSProperties = {
  border: "1px solid #d8e0ec",
  borderRadius: "16px",
  padding: "18px",
  background: "#f8fbff",
  marginBottom: "16px",
};

const linkListStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
};

const linkStyle: React.CSSProperties = {
  color: "#1d4ed8",
  textDecoration: "none",
  fontWeight: 700,
};

export default function AdminPage() {
  return (
    <SiteShell title="Admin" subtitle="Administrative hub for CFSP navigation and control.">
      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0 }}>System Status</h3>
        <p>This admin page is live and links to the major sections of the app.</p>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0 }}>Admin Launch Links</h3>
        <div style={linkListStyle}>
          <Link href="/dashboard" style={linkStyle}>Open Dashboard</Link>
          <Link href="/events" style={linkStyle}>Open Events</Link>
          <Link href="/events/new" style={linkStyle}>Create New Event</Link>
          <Link href="/events/upload" style={linkStyle}>Upload Events</Link>
          <Link href="/sps" style={linkStyle}>Open SP Database</Link>
          <Link href="/sim-op" style={linkStyle}>Open Sim Op</Link>
          <Link href="/staff" style={linkStyle}>Open Staff</Link>
          <Link href="/me" style={linkStyle}>Open Me</Link>
          <Link href="/login" style={linkStyle}>Open Login</Link>
        </div>
      </div>
    </SiteShell>
  );
}
