export default function SettingsPage() {
  return (
    <main style={{ padding: "32px", display: "grid", gap: "20px" }}>
      <section
        style={{
          borderRadius: "24px",
          border: "1px solid rgba(148, 163, 184, 0.35)",
          background: "rgba(255, 255, 255, 0.92)",
          padding: "28px",
        }}
      >
        <p style={{ margin: 0, fontSize: "12px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#0f766e" }}>
          CFSP Settings
        </p>
        <h1 style={{ margin: "8px 0 0", fontSize: "32px", color: "#10243d" }}>
          Settings Center
        </h1>
        <p style={{ margin: "10px 0 0", color: "#46627f", fontSize: "16px" }}>
          Event settings, support settings, communication settings, training settings, schedule settings, and advanced controls will live here.
        </p>
      </section>

      <section style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {[
          "Event Settings",
          "Command Center Settings",
          "Support Settings",
          "Advanced Settings",
          "Communication Settings",
          "Training Settings",
          "Schedule Builder Settings",
          "Live Event Mode Settings",
          "Materials / File Cabinet Settings",
          "Staffing / SP Finder Settings",
        ].map((label) => (
          <div
            key={label}
            style={{
              borderRadius: "18px",
              border: "1px solid rgba(148, 163, 184, 0.28)",
              background: "#ffffff",
              padding: "18px",
              fontWeight: 800,
              color: "#12314f",
            }}
          >
            {label}
            <div style={{ marginTop: "6px", fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
              Coming soon
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
