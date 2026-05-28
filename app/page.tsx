import Link from "next/link";
import Image from "next/image";

const focusAreas = [
  {
    title: "Staffing without spreadsheet chaos",
    detail:
      "Run staffing from one command center instead of scattered files, threads, and last-minute manual reconciliation.",
  },
  {
    title: "Availability, confirmations, and training readiness",
    detail:
      "Track SP availability and response status in one flow so the team can confirm readiness before event day.",
  },
  {
    title: "Event materials, schedules, announcements, and live operations",
    detail:
      "Keep event context, operational materials, schedule views, and live updates together while the day is in motion.",
  },
  {
    title:
      "Built for simulation centers, SP programs, nursing, PA, medical education, and clinical skills labs",
    detail:
      "Designed for the people running simulation operations, including program leaders, coordinators, and faculty teams.",
  },
];

export default function Home() {
  return (
    <main style={{ background: "#070f19", color: "#e8f1f8" }}>
      <section
        style={{
          position: "relative",
          minHeight: "82vh",
          overflow: "hidden",
          borderBottom: "1px solid rgba(124, 156, 186, 0.28)",
        }}
      >
        <Image
          src="/branding/cfsp-hero-ops.svg"
          alt="Command center style operations visual"
          fill
          priority
          sizes="100vw"
          style={{ objectFit: "cover" }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(95deg, rgba(7, 15, 25, 0.93) 20%, rgba(7, 15, 25, 0.64) 60%, rgba(7, 15, 25, 0.5) 100%)",
          }}
        />
        <div
          style={{
            position: "relative",
            maxWidth: "1240px",
            margin: "0 auto",
            padding: "26px 20px 48px",
            display: "grid",
            gridTemplateRows: "auto 1fr",
            minHeight: "82vh",
          }}
        >
          <header
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: "15px", letterSpacing: 0 }}>
              Conflict-Free SP LLC
            </div>
            <Link
              href="/login"
              className="cfsp-btn cfsp-btn-secondary"
              style={{
                textDecoration: "none",
                minHeight: "42px",
                background: "rgba(12, 30, 47, 0.62)",
                border: "1px solid rgba(124, 156, 186, 0.35)",
                color: "#e8f1f8",
              }}
            >
              Login
            </Link>
          </header>

          <div
            style={{
              display: "grid",
              alignContent: "center",
              gap: "18px",
              maxWidth: "780px",
              paddingBottom: "40px",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "12px",
                fontWeight: 800,
                color: "#93c5fd",
                textTransform: "uppercase",
              }}
            >
              Simulation Operations Command Center
            </p>
            <h1
              className="text-[2.25rem] leading-[1.08] md:text-[4rem]"
              style={{
                margin: 0,
                fontWeight: 950,
                letterSpacing: 0,
                color: "#f6fbff",
              }}
            >
              Conflict-Free SP
            </h1>
            <p
              className="text-[1.06rem] md:text-[1.34rem]"
              style={{
                margin: 0,
                fontWeight: 700,
                lineHeight: 1.55,
                color: "rgba(226, 239, 251, 0.95)",
                maxWidth: "680px",
              }}
            >
              The simulation operations command center for modern healthcare education.
            </p>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", paddingTop: "6px" }}>
              <a
                href="mailto:cory@conflictfreesp.com"
                className="cfsp-btn cfsp-btn-primary"
                style={{
                  textDecoration: "none",
                  minHeight: "44px",
                  boxShadow: "0 14px 30px rgba(13, 48, 84, 0.28)",
                }}
              >
                Request a demo
              </a>
              <Link
                href="/login"
                className="cfsp-btn cfsp-btn-secondary"
                style={{
                  textDecoration: "none",
                  minHeight: "44px",
                  background: "rgba(12, 30, 47, 0.62)",
                  border: "1px solid rgba(124, 156, 186, 0.35)",
                  color: "#e8f1f8",
                }}
              >
                Login
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section
        style={{
          borderTop: "1px solid rgba(124, 156, 186, 0.12)",
          borderBottom: "1px solid rgba(124, 156, 186, 0.12)",
          background: "#081525",
        }}
      >
        <div
          style={{
            maxWidth: "1240px",
            margin: "0 auto",
            padding: "40px 20px 44px",
            display: "grid",
            gap: "12px",
          }}
        >
          {focusAreas.map((area) => (
            <article
              key={area.title}
              style={{
                border: "1px solid rgba(124, 156, 186, 0.24)",
                borderRadius: "8px",
                background: "rgba(10, 25, 40, 0.9)",
                padding: "16px 16px 14px",
                display: "grid",
                gap: "8px",
              }}
            >
              <h2 style={{ margin: 0, color: "#f6fbff", fontSize: "18px", fontWeight: 850 }}>
                {area.title}
              </h2>
              <p style={{ margin: 0, color: "rgba(220, 235, 248, 0.92)", lineHeight: 1.58, fontWeight: 650 }}>
                {area.detail}
              </p>
            </article>
          ))}
        </div>
      </section>

      <footer
        style={{
          background: "#06101b",
          borderTop: "1px solid rgba(124, 156, 186, 0.18)",
        }}
      >
        <div
          style={{
            maxWidth: "1240px",
            margin: "0 auto",
            padding: "24px 20px 28px",
            display: "grid",
            gap: "5px",
          }}
        >
          <div style={{ fontWeight: 900 }}>Conflict-Free SP LLC</div>
          <a
            href="mailto:cory@conflictfreesp.com"
            style={{ color: "#bfe2ff", textDecoration: "none", fontWeight: 700 }}
          >
            cory@conflictfreesp.com
          </a>
          <a
            href="https://conflictfreesp.com"
            style={{ color: "#bfe2ff", textDecoration: "none", fontWeight: 700 }}
          >
            conflictfreesp.com
          </a>
        </div>
      </footer>
    </main>
  );
}
