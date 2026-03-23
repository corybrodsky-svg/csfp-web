"use client";

import { useRouter } from "next/navigation";
import SiteShell from "../components/SiteShell";
import { supabase } from "../lib/supabaseClient";

const cardStyle: React.CSSProperties = {
  border: "1px solid #d8e0ec",
  borderRadius: "16px",
  padding: "18px",
  background: "#f8fbff",
  marginBottom: "16px",
};

const buttonStyle: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: "12px",
  border: "1px solid #cfd7e6",
  background: "#1d4ed8",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

export default function MePage() {
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <SiteShell title="Me" subtitle="Personal workspace placeholder page.">
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Profile Snapshot</h3>
        <p><strong>Name:</strong> Cory</p>
        <p><strong>Role:</strong> Administrator / Sim Ops</p>
        <p style={{ marginBottom: 0 }}>
          <strong>Focus:</strong> getting this app live tonight.
        </p>
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Account Action</h3>
        <button type="button" style={buttonStyle} onClick={handleSignOut}>
          Sign Out
        </button>
      </div>
    </SiteShell>
  );
}
