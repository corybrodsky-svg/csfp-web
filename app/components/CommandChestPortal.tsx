"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

type CommandChestPortalProps = {
  eventId: string;
  scheduleCompleted: boolean;
};

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function findByText(patterns: string[]) {
  const nodes = Array.from(
    document.querySelectorAll("a, button, h1, h2, h3, summary, section, article, div")
  );

  return nodes.find((node) => {
    if (!(node instanceof HTMLElement)) return false;
    if (node.closest(".cfsp-command-vault-panel-v4")) return false;

    const text = normalizeText(node.textContent || "");
    return patterns.some((pattern) => text.includes(normalizeText(pattern)));
  }) as HTMLElement | undefined;
}

function scrollToTarget(id: string, fallbackPatterns: string[]) {
  const direct = document.getElementById(id);

  if (direct) {
    direct.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const fallback = findByText(fallbackPatterns);
  fallback?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function CommandChestPortal({ eventId, scheduleCompleted }: CommandChestPortalProps) {
  const [open, setOpen] = useState(false);
  const portalRoot = typeof document === "undefined" ? null : document.body;

  if (!portalRoot) return null;

  const openSchedule = () => {
    if (scheduleCompleted) {
      const existingOpenSchedule = findByText(["open schedule"]);
      if (existingOpenSchedule) {
        existingOpenSchedule.click();
        return;
      }

      scrollToTarget("simulation-command-file-cabinet", [
        "completed schedule file",
        "schedule is complete",
      ]);
      return;
    }

    const params = new URLSearchParams();
    params.set("source", "command-chest");
    params.set("view", "builder");

    window.location.assign(
      `/events/${encodeURIComponent(eventId)}/schedule-builder?${params.toString()}`
    );
  };

  return createPortal(
    <>
      {!open ? (
        <button
          type="button"
          className="cfsp-command-vault-launcher-v4"
          aria-label="Open Simulation Command File Cabinet"
          aria-expanded="false"
          onClick={() => setOpen(true)}
        >
          <span className="cfsp-command-vault-mini-v4" aria-hidden="true" />
        </button>
      ) : null}

      {open ? (
        <section className="cfsp-command-vault-panel-v4" aria-label="Simulation Command File Cabinet">
          <button
            type="button"
            className="cfsp-command-vault-close-v4"
            aria-label="Close file cabinet"
            onClick={() => setOpen(false)}
          >
            ×
          </button>

          <div className="cfsp-command-vault-header-v4">
            <div className="cfsp-command-vault-kicker-v4">Simulation Command</div>
            <h2>File Cabinet</h2>
            <p>Open chest for files, training, materials, and packets.</p>
          </div>

          <div className="cfsp-command-vault-stage-v4" aria-hidden="true">
            <svg viewBox="0 0 420 270" role="img" className="cfsp-command-vault-svg-v4">
              <defs>
                <linearGradient id="cfspVaultChestBodyV4" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0%" stopColor="#2dd4bf" />
                  <stop offset="42%" stopColor="#0f9488" />
                  <stop offset="100%" stopColor="#063f3a" />
                </linearGradient>

                <linearGradient id="cfspVaultChestLidV4" x1="0" x2="1">
                  <stop offset="0%" stopColor="#14b8a6" />
                  <stop offset="45%" stopColor="#fb923c" />
                  <stop offset="100%" stopColor="#84cc16" />
                </linearGradient>

                <linearGradient id="cfspVaultScrollV4" x1="0" x2="1">
                  <stop offset="0%" stopColor="#ecfeff" />
                  <stop offset="48%" stopColor="#f0fdfa" />
                  <stop offset="100%" stopColor="#fff7ed" />
                </linearGradient>

                <radialGradient id="cfspVaultGoldV4" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#fde68a" />
                  <stop offset="58%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#92400e" />
                </radialGradient>

                <filter id="cfspVaultGlowV4" x="-45%" y="-45%" width="190%" height="190%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>

                <filter id="cfspVaultSoftGlowV4" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <g className="cfsp-vault-rotating-ring-v4">
                <ellipse cx="210" cy="222" rx="150" ry="30" fill="none" stroke="#2dd4bf" strokeOpacity="0.30" strokeWidth="2" />
                <ellipse cx="210" cy="222" rx="104" ry="20" fill="none" stroke="#84cc16" strokeOpacity="0.18" strokeWidth="2" />
                <path d="M86 222 C128 246 292 246 334 222" fill="none" stroke="#2dd4bf" strokeOpacity="0.22" strokeWidth="2" />
              </g>

              <g className="cfsp-vault-scroll-v4 cfsp-vault-scroll-left-v4" filter="url(#cfspVaultSoftGlowV4)">
                <path
                  d="M68 64 C50 70 49 88 62 101 L99 207 C104 219 123 217 129 203 L93 78 C88 66 78 60 68 64Z"
                  fill="url(#cfspVaultScrollV4)"
                  stroke="#2dd4bf"
                  strokeOpacity="0.72"
                  strokeWidth="2"
                />
                <path d="M68 99 L101 94 M75 122 L109 117 M82 145 L116 140 M89 168 L122 163" stroke="#0f9488" strokeOpacity="0.42" strokeWidth="3" strokeLinecap="round" />
                <circle cx="61" cy="77" r="7" fill="#fb923c" opacity="0.74" />
                <circle cx="123" cy="205" r="7" fill="#fb923c" opacity="0.54" />
              </g>

              <g className="cfsp-vault-scroll-v4 cfsp-vault-scroll-right-v4" filter="url(#cfspVaultSoftGlowV4)">
                <path
                  d="M352 64 C370 70 371 88 358 101 L321 207 C316 219 297 217 291 203 L327 78 C332 66 342 60 352 64Z"
                  fill="url(#cfspVaultScrollV4)"
                  stroke="#2dd4bf"
                  strokeOpacity="0.72"
                  strokeWidth="2"
                />
                <path d="M352 99 L319 94 M345 122 L311 117 M338 145 L304 140 M331 168 L298 163" stroke="#0f9488" strokeOpacity="0.42" strokeWidth="3" strokeLinecap="round" />
                <circle cx="359" cy="77" r="7" fill="#fb923c" opacity="0.74" />
                <circle cx="297" cy="205" r="7" fill="#fb923c" opacity="0.54" />
              </g>

              <g className="cfsp-vault-scroll-v4 cfsp-vault-scroll-center-v4" filter="url(#cfspVaultSoftGlowV4)">
                <path
                  d="M184 49 C173 53 171 66 179 75 L179 168 C180 182 201 184 208 170 L208 65 C204 53 194 45 184 49Z"
                  fill="url(#cfspVaultScrollV4)"
                  stroke="#2dd4bf"
                  strokeOpacity="0.62"
                  strokeWidth="2"
                />
                <path d="M184 84 L203 81 M184 106 L203 103 M184 128 L203 125 M184 150 L203 147" stroke="#0f9488" strokeOpacity="0.34" strokeWidth="3" strokeLinecap="round" />
              </g>

              <g className="cfsp-vault-chest-rotor-v4" filter="url(#cfspVaultGlowV4)">
                <g className="cfsp-vault-chest-main-v4">
                  <path
                    className="cfsp-vault-chest-lid-v4"
                    d="M118 121 C124 76 160 50 210 50 C260 50 296 76 302 121 Z"
                    fill="url(#cfspVaultChestLidV4)"
                    stroke="#fbbf24"
                    strokeWidth="5"
                  />
                  <rect
                    x="98"
                    y="114"
                    width="224"
                    height="122"
                    rx="26"
                    fill="url(#cfspVaultChestBodyV4)"
                    stroke="#fbbf24"
                    strokeWidth="5"
                  />
                  <path d="M135 119 V229 M285 119 V229" stroke="#fb923c" strokeWidth="9" strokeOpacity="0.78" />
                  <path d="M115 156 H305" stroke="#ffffff" strokeOpacity="0.16" strokeWidth="3" />
                  <circle cx="210" cy="175" r="23" fill="url(#cfspVaultGoldV4)" stroke="#fff7ed" strokeWidth="5" />
                  <path d="M200 175 H220" stroke="#92400e" strokeWidth="5" strokeLinecap="round" />
                  <path d="M185 213 L196 198 L210 208 L224 198 L235 213" fill="none" stroke="#facc15" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.72" />
                </g>
              </g>

              <g className="cfsp-vault-sparkles-v4">
                <circle cx="92" cy="52" r="2.5" fill="#a7fff5" />
                <circle cx="332" cy="48" r="2.5" fill="#a7fff5" />
                <circle cx="349" cy="224" r="2" fill="#facc15" />
                <circle cx="70" cy="225" r="2" fill="#facc15" />
                <path d="M84 230 C128 255 292 255 336 230" fill="none" stroke="#2dd4bf" strokeOpacity="0.28" strokeWidth="2" />
              </g>
            </svg>
          </div>

          <div className="cfsp-command-vault-status-v4">New content detected when files update</div>

          <div className="cfsp-command-vault-grid-v4">
            <button
              type="button"
              onClick={() =>
                scrollToTarget("simulation-command-file-cabinet", [
                  "simulation command file cabinet",
                  "case file",
                  "doorsign",
                ])
              }
            >
              <span>▣</span>
              Materials Cabinet
            </button>

            <button
              type="button"
              onClick={() =>
                scrollToTarget("training-center", [
                  "training attendance",
                  "training center",
                  "training files",
                ])
              }
            >
              <span>◈</span>
              Training Files
            </button>

            <button
              type="button"
              onClick={() =>
                scrollToTarget("communication-center", [
                  "draft event emails",
                  "sp hiring poll email",
                  "communication",
                ])
              }
            >
              <span>●</span>
              Communication
            </button>

            <button
              type="button"
              onClick={() =>
                scrollToTarget("coverage-actions", [
                  "coverage actions",
                  "staffing command center",
                  "selected sps",
                ])
              }
            >
              <span>✦</span>
              Staffing
            </button>

            <button type="button" onClick={openSchedule}>
              <span>▤</span>
              {scheduleCompleted ? "Schedule File" : "Schedule Builder"}
            </button>

            <button
              type="button"
              onClick={() =>
                scrollToTarget("recording-status", [
                  "recording guide",
                  "recording status",
                  "recording",
                ])
              }
            >
              <span>▱</span>
              Recording
            </button>
          </div>

          <div className="cfsp-command-vault-footer-v4">Secure • Organized • Always Ready</div>
        </section>
      ) : null}

      <style>{`
        .cfsp-floating-command-chest,
        .cfsp-command-chest-launcher-v2,
        .cfsp-command-chest-panel-v2,
        .cfsp-command-chest-launcher-v3,
        .cfsp-command-chest-panel-v3 {
          display: none !important;
        }

        .cfsp-command-vault-launcher-v4 {
          position: fixed;
          top: 112px;
          right: 26px;
          z-index: 10000;
          width: 74px;
          height: 74px;
          display: grid;
          place-items: center;
          border-radius: 24px;
          border: 1px solid rgba(20, 184, 166, 0.46);
          background:
            radial-gradient(circle at 20% 0%, rgba(20,184,166,0.22), transparent 34%),
            radial-gradient(circle at 82% 18%, rgba(251,146,60,0.16), transparent 32%),
            linear-gradient(135deg, rgba(255,255,255,0.98), rgba(240,253,250,0.94));
          box-shadow:
            0 18px 42px rgba(15, 91, 120, 0.18),
            0 0 28px rgba(20, 184, 166, 0.16),
            inset 0 1px 0 rgba(255,255,255,0.86);
          cursor: pointer;
          transition: transform 160ms ease, box-shadow 160ms ease;
        }

        .cfsp-command-vault-launcher-v4:hover {
          transform: translateY(-2px);
          box-shadow:
            0 22px 48px rgba(15, 91, 120, 0.22),
            0 0 32px rgba(20, 184, 166, 0.20),
            inset 0 1px 0 rgba(255,255,255,0.86);
        }

        .cfsp-command-vault-mini-v4 {
          position: relative;
          width: 52px;
          height: 40px;
          border-radius: 15px 15px 12px 12px;
          background: linear-gradient(180deg, #14b8a6 0%, #0f9488 56%, #11806f 100%);
          border: 2px solid rgba(251,146,60,0.70);
          box-shadow:
            inset 0 0 0 3px rgba(255,255,255,0.36),
            0 10px 22px rgba(15,91,120,0.16),
            0 0 18px rgba(20,184,166,0.24);
        }

        .cfsp-command-vault-mini-v4::before {
          content: "";
          position: absolute;
          left: 6px;
          right: 6px;
          top: -6px;
          height: 17px;
          border-radius: 13px 13px 7px 7px;
          background: linear-gradient(90deg, #14b8a6, #fb923c, #84cc16);
          border: 2px solid rgba(251,146,60,0.58);
          transform-origin: bottom center;
          animation: cfspVaultMiniLidV4 5.8s ease-in-out infinite;
        }

        .cfsp-command-vault-mini-v4::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 21px;
          width: 10px;
          height: 10px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: #facc15;
          border: 2px solid rgba(255,247,237,0.94);
          box-shadow: 0 0 12px rgba(250,204,21,0.70);
        }

        .cfsp-command-vault-panel-v4 {
          position: fixed;
          top: 118px;
          right: 26px;
          z-index: 9999;
          width: min(430px, calc(100vw - 32px));
          max-height: calc(100vh - 138px);
          overflow: auto;
          border-radius: 28px;
          border: 1px solid rgba(45, 212, 191, 0.62);
          background:
            radial-gradient(circle at 20% 8%, rgba(45, 212, 191, 0.18), transparent 30%),
            radial-gradient(circle at 86% 18%, rgba(20, 184, 166, 0.16), transparent 30%),
            linear-gradient(145deg, rgba(3, 18, 23, 0.98), rgba(5, 38, 45, 0.97) 52%, rgba(4, 28, 36, 0.985));
          box-shadow:
            0 30px 80px rgba(2, 8, 23, 0.48),
            0 0 0 1px rgba(45, 212, 191, 0.16) inset,
            0 0 44px rgba(20, 184, 166, 0.28);
          padding: 18px;
          color: #d9fffb;
        }

        .cfsp-command-vault-close-v4 {
          position: absolute;
          top: 12px;
          right: 12px;
          z-index: 5;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(45,212,191,0.46);
          background: rgba(6, 78, 82, 0.34);
          color: #a7fff5;
          font-size: 24px;
          line-height: 1;
          cursor: pointer;
          box-shadow: 0 0 18px rgba(45,212,191,0.16);
        }

        .cfsp-command-vault-header-v4 {
          text-align: center;
          padding: 16px 38px 6px;
        }

        .cfsp-command-vault-kicker-v4 {
          color: #5ff4e8;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.10em;
          font-size: 0.76rem;
          text-shadow: 0 0 18px rgba(45,212,191,0.32);
        }

        .cfsp-command-vault-header-v4 h2 {
          margin: 4px 0 4px;
          color: #7ffbf0;
          text-transform: uppercase;
          letter-spacing: 0.055em;
          font-size: 1.18rem;
          line-height: 1.16;
          font-weight: 950;
          text-shadow: 0 0 18px rgba(45,212,191,0.32);
        }

        .cfsp-command-vault-header-v4 p {
          margin: 0;
          color: #b9e9e5;
          font-size: 0.78rem;
          line-height: 1.35;
          font-weight: 760;
        }

        .cfsp-command-vault-stage-v4 {
          position: relative;
          height: 240px;
          margin: 4px 0 14px;
          border-radius: 22px;
          background:
            radial-gradient(circle at 50% 80%, rgba(45,212,191,0.24), transparent 48%),
            linear-gradient(180deg, rgba(45,212,191,0.08), rgba(3,18,23,0.10));
          overflow: hidden;
        }

        .cfsp-command-vault-svg-v4 {
          width: 100%;
          height: 100%;
          display: block;
        }

        .cfsp-vault-rotating-ring-v4 {
          transform-box: fill-box;
          transform-origin: center;
          animation: cfspVaultRingSpinV4 10s linear infinite;
        }

        .cfsp-vault-chest-rotor-v4 {
          transform-box: fill-box;
          transform-origin: center;
          animation: cfspVaultChestRotateV4 5.8s ease-in-out infinite;
        }

        .cfsp-vault-chest-lid-v4 {
          transform-box: fill-box;
          transform-origin: center bottom;
          animation: cfspVaultChestLidV4 5.8s ease-in-out infinite;
        }

        .cfsp-vault-scroll-left-v4 {
          transform-box: fill-box;
          transform-origin: center;
          animation: cfspVaultScrollLeftV4 6.8s ease-in-out infinite;
        }

        .cfsp-vault-scroll-right-v4 {
          transform-box: fill-box;
          transform-origin: center;
          animation: cfspVaultScrollRightV4 7.2s ease-in-out infinite;
        }

        .cfsp-vault-scroll-center-v4 {
          transform-box: fill-box;
          transform-origin: center;
          animation: cfspVaultScrollCenterV4 7s ease-in-out infinite;
        }

        .cfsp-vault-sparkles-v4 {
          animation: cfspVaultSparklesV4 4.8s ease-in-out infinite;
        }

        .cfsp-command-vault-status-v4 {
          border-radius: 999px;
          border: 1px solid rgba(45,212,191,0.42);
          background: rgba(20,184,166,0.16);
          color: #9ffcf1;
          text-transform: uppercase;
          letter-spacing: 0.045em;
          font-size: 0.68rem;
          font-weight: 950;
          padding: 8px 10px;
          text-align: center;
          box-shadow: 0 0 18px rgba(45,212,191,0.12);
        }

        .cfsp-command-vault-grid-v4 {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 12px;
        }

        .cfsp-command-vault-grid-v4 button {
          min-height: 50px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          border-radius: 13px;
          border: 1px solid rgba(45,212,191,0.34);
          background: linear-gradient(135deg, rgba(8,47,73,0.92), rgba(6,78,82,0.80));
          color: #d9fffb;
          font-weight: 900;
          text-align: left;
          padding: 10px 12px;
          cursor: pointer;
          box-shadow:
            0 10px 20px rgba(0,0,0,0.20),
            inset 0 1px 0 rgba(255,255,255,0.08),
            0 0 14px rgba(45,212,191,0.10);
          transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }

        .cfsp-command-vault-grid-v4 button:hover {
          transform: translateY(-1px);
          border-color: rgba(45,212,191,0.68);
          box-shadow:
            0 14px 26px rgba(0,0,0,0.24),
            0 0 22px rgba(45,212,191,0.18);
        }

        .cfsp-command-vault-grid-v4 span {
          width: 24px;
          height: 24px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          border: 1px solid rgba(45,212,191,0.38);
          color: #5ff4e8;
          background: rgba(20,184,166,0.12);
          font-size: 12px;
        }

        .cfsp-command-vault-footer-v4 {
          margin-top: 12px;
          color: #75d8d0;
          font-size: 0.72rem;
          font-weight: 850;
          text-align: center;
          letter-spacing: 0.03em;
        }

        @keyframes cfspVaultMiniLidV4 {
          0%, 100% { transform: translateY(0) rotateX(0deg); }
          50% { transform: translateY(-1px) rotateX(8deg); }
        }

        @keyframes cfspVaultRingSpinV4 {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes cfspVaultChestRotateV4 {
          0%, 100% { transform: translateY(0) rotate(-1.8deg); }
          50% { transform: translateY(-4px) rotate(1.8deg); }
        }

        @keyframes cfspVaultChestLidV4 {
          0%, 100% { transform: translateY(0) rotateX(0deg); }
          50% { transform: translateY(-4px) rotateX(16deg); }
        }

        @keyframes cfspVaultScrollLeftV4 {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.58; }
          50% { transform: translateY(-8px) rotate(4deg); opacity: 0.90; }
        }

        @keyframes cfspVaultScrollRightV4 {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.58; }
          50% { transform: translateY(-9px) rotate(-4deg); opacity: 0.90; }
        }

        @keyframes cfspVaultScrollCenterV4 {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.78; }
          50% { transform: translateY(-7px) rotate(-2deg); opacity: 0.96; }
        }

        @keyframes cfspVaultSparklesV4 {
          0%, 100% { opacity: 0.34; }
          50% { opacity: 0.90; }
        }
      `}</style>
    </>,
    portalRoot
  );
}
