"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

type CommandChestPortalProps = {
  eventId: string | number;
  scheduleCompleted?: boolean;
};

type CommandAction = {
  key: string;
  label: string;
  glyph: string;
  onClick: () => void;
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
    if (node.closest(".cfsp-core-wrap")) return false;

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

  findByText(fallbackPatterns)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function CommandChestPortal({
  eventId,
  scheduleCompleted = false,
}: CommandChestPortalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const portalRoot = typeof document === "undefined" ? null : document.body;
  const id = String(eventId);

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
        "simulation command file cabinet",
      ]);
      return;
    }

    const params = new URLSearchParams();
    params.set("source", "cfsp-command-center");
    params.set("view", "builder");

    router.push(`/events/${encodeURIComponent(id)}/schedule-builder?${params.toString()}`);
  };

  const actions: CommandAction[] = [
    {
      key: "materials",
      label: "Materials Cabinet",
      glyph: "▣",
      onClick: () =>
        scrollToTarget("simulation-command-file-cabinet", [
          "simulation command file cabinet",
          "case file",
          "doorsign",
        ]),
    },
    {
      key: "training",
      label: "Training Files",
      glyph: "◈",
      onClick: () =>
        scrollToTarget("training-center", [
          "training attendance",
          "training center",
          "training files",
        ]),
    },
    {
      key: "communication",
      label: "Communication",
      glyph: "●",
      onClick: () =>
        scrollToTarget("communication-center", [
          "draft event emails",
          "sp hiring poll email",
          "communication",
        ]),
    },
    {
      key: "staffing",
      label: "Staffing",
      glyph: "✦",
      onClick: () =>
        scrollToTarget("coverage-actions", [
          "coverage actions",
          "staffing command center",
          "selected sps",
        ]),
    },
    {
      key: "schedule",
      label: scheduleCompleted ? "Schedule File" : "Schedule Builder",
      glyph: "▤",
      onClick: openSchedule,
    },
    {
      key: "recording",
      label: "Recording",
      glyph: "▱",
      onClick: () =>
        scrollToTarget("recording-status", [
          "recording guide",
          "recording status",
          "recording",
        ]),
    },
  ];

  return createPortal(
    <>
      <button
        type="button"
        className={`cfsp-core-pokeball ${open ? "cfsp-core-pokeball-open" : ""}`}
        aria-label={open ? "Close CFSP Command Center" : "Open CFSP Command Center"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="cfsp-core-pokeball-shell" aria-hidden="true" />
        <span className="cfsp-core-pokeball-core" aria-hidden="true" />
      </button>

      {open ? (
        <div className="cfsp-core-wrap" aria-label="CFSP Command Center">
          <button
            type="button"
            className="cfsp-core-close"
            aria-label="Close CFSP Command Center"
            onClick={() => setOpen(false)}
          >
            ×
          </button>

          <div className="cfsp-core-title">
            <div>CFSP Command Center</div>
            <strong>Operations Core</strong>
          </div>

          <div className="cfsp-core-object" aria-hidden="true">
            <div className="cfsp-core-ring cfsp-core-ring-a" />
            <div className="cfsp-core-ring cfsp-core-ring-b" />
            <div className="cfsp-core-beam" />
            <div className="cfsp-core-beam-hotspot" />

            <svg className="cfsp-core-svg" viewBox="0 0 460 330" role="img">
              <defs>
                <linearGradient id="cfspCoreBody" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0%" stopColor="#38f2df" />
                  <stop offset="46%" stopColor="#0f9488" />
                  <stop offset="100%" stopColor="#063f3a" />
                </linearGradient>

                <linearGradient id="cfspCoreLid" x1="0" x2="1">
                  <stop offset="0%" stopColor="#2dd4bf" />
                  <stop offset="48%" stopColor="#fb923c" />
                  <stop offset="100%" stopColor="#84cc16" />
                </linearGradient>

                <linearGradient id="cfspCoreScroll" x1="0" x2="1">
                  <stop offset="0%" stopColor="#ecfeff" />
                  <stop offset="50%" stopColor="#f0fdfa" />
                  <stop offset="100%" stopColor="#fff7ed" />
                </linearGradient>

                <radialGradient id="cfspCoreGold" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#fde68a" />
                  <stop offset="58%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#92400e" />
                </radialGradient>

                <filter id="cfspCoreGlow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <g className="cfsp-core-scroll cfsp-core-scroll-left" filter="url(#cfspCoreGlow)">
                <path
                  d="M72 82 C50 90 48 114 66 130 L108 256 C114 272 138 270 144 252 L104 98 C100 84 84 76 72 82Z"
                  fill="url(#cfspCoreScroll)"
                  stroke="#2dd4bf"
                  strokeOpacity="0.68"
                  strokeWidth="2"
                />
                <path d="M74 122 L112 116 M82 148 L120 142 M90 174 L128 168 M98 200 L134 194" stroke="#0f9488" strokeOpacity="0.36" strokeWidth="3" strokeLinecap="round" />
                <circle cx="65" cy="96" r="8" fill="#fb923c" opacity="0.72" />
              </g>

              <g className="cfsp-core-scroll cfsp-core-scroll-right" filter="url(#cfspCoreGlow)">
                <path
                  d="M388 82 C410 90 412 114 394 130 L352 256 C346 272 322 270 316 252 L356 98 C360 84 376 76 388 82Z"
                  fill="url(#cfspCoreScroll)"
                  stroke="#2dd4bf"
                  strokeOpacity="0.68"
                  strokeWidth="2"
                />
                <path d="M386 122 L348 116 M378 148 L340 142 M370 174 L332 168 M362 200 L326 194" stroke="#0f9488" strokeOpacity="0.36" strokeWidth="3" strokeLinecap="round" />
                <circle cx="395" cy="96" r="8" fill="#fb923c" opacity="0.72" />
              </g>

              <g className="cfsp-core-scroll cfsp-core-scroll-center" filter="url(#cfspCoreGlow)">
                <path
                  d="M214 56 C198 62 196 82 210 94 L210 198 C214 214 240 214 246 198 L246 76 C242 60 228 50 214 56Z"
                  fill="url(#cfspCoreScroll)"
                  stroke="#2dd4bf"
                  strokeOpacity="0.60"
                  strokeWidth="2"
                />
                <path d="M216 100 L242 96 M216 126 L242 122 M216 152 L242 148 M216 178 L242 174" stroke="#0f9488" strokeOpacity="0.32" strokeWidth="3" strokeLinecap="round" />
              </g>

              <g className="cfsp-core-craft" filter="url(#cfspCoreGlow)">
                <path
                  className="cfsp-core-craft-lid"
                  d="M116 146 C126 84 170 50 230 50 C290 50 334 84 344 146 Z"
                  fill="url(#cfspCoreLid)"
                  stroke="#fbbf24"
                  strokeWidth="5"
                />

                <rect
                  x="94"
                  y="138"
                  width="272"
                  height="142"
                  rx="34"
                  fill="url(#cfspCoreBody)"
                  stroke="#fbbf24"
                  strokeWidth="5"
                />

                <path d="M146 146 V270 M314 146 V270" stroke="#fb923c" strokeWidth="10" strokeOpacity="0.78" />
                <path d="M122 178 H342" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="3" />

                <circle cx="230" cy="208" r="31" fill="url(#cfspCoreGold)" stroke="#fff7ed" strokeWidth="6" />
                <path d="M219 208 H241" stroke="#92400e" strokeWidth="6" strokeLinecap="round" />

                <text
                  x="230"
                  y="266"
                  textAnchor="middle"
                  fill="#ecfeff"
                  fontSize="22"
                  fontWeight="900"
                  letterSpacing="4"
                >
                  CFSP
                </text>
              </g>

              <g className="cfsp-core-sparks">
                <circle cx="96" cy="64" r="2.8" fill="#a7fff5" />
                <circle cx="362" cy="66" r="2.8" fill="#a7fff5" />
                <circle cx="386" cy="274" r="2.2" fill="#facc15" />
                <circle cx="74" cy="272" r="2.2" fill="#facc15" />
              </g>
            </svg>
          </div>

          <div className="cfsp-core-status">
            New content detected when files update
          </div>

          <div className="cfsp-core-links">
            {actions.map((action) => (
              <button
                key={action.key}
                type="button"
                className="cfsp-core-link"
                onClick={action.onClick}
              >
                <span>{action.glyph}</span>
                {action.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <style>{`
        .cfsp-floating-command-chest,
        #cfsp-floating-command-chest,
        details.cfsp-floating-command-chest,
        .cfsp-command-chest-launcher-v2,
        .cfsp-command-chest-panel-v2,
        .cfsp-command-vault-launcher-v4,
        .cfsp-command-vault-panel-v4,
        .cfsp-command-center-panel {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }

        .cfsp-core-pokeball {
          position: fixed;
          top: 50%;
          right: 22px;
          z-index: 10000;
          width: 82px;
          height: 82px;
          transform: translateY(-50%);
          border: 0;
          border-radius: 999px;
          background:
            radial-gradient(circle at 35% 20%, rgba(255,255,255,0.98), transparent 22%),
            radial-gradient(circle at 50% 58%, rgba(20,184,166,0.34), transparent 44%),
            linear-gradient(135deg, rgba(255,255,255,0.98), rgba(236,253,245,0.94));
          box-shadow:
            0 18px 42px rgba(15,91,120,0.20),
            0 0 26px rgba(20,184,166,0.24),
            inset 0 1px 0 rgba(255,255,255,0.88);
          cursor: pointer;
          transition: transform 160ms ease, box-shadow 160ms ease;
        }

        .cfsp-core-pokeball:hover,
        .cfsp-core-pokeball-open {
          transform: translateY(-50%) scale(1.05);
          box-shadow:
            0 24px 54px rgba(15,91,120,0.26),
            0 0 34px rgba(20,184,166,0.32),
            inset 0 1px 0 rgba(255,255,255,0.88);
        }

        .cfsp-core-pokeball-shell {
          position: absolute;
          inset: 16px 12px 18px;
          border-radius: 18px 18px 15px 15px;
          background: linear-gradient(180deg, #14b8a6 0%, #0f9488 56%, #11806f 100%);
          border: 2px solid rgba(251,146,60,0.76);
          box-shadow:
            inset 0 0 0 3px rgba(255,255,255,0.34),
            0 10px 22px rgba(15,91,120,0.16),
            0 0 18px rgba(20,184,166,0.24);
        }

        .cfsp-core-pokeball-shell::before {
          content: "";
          position: absolute;
          left: 7px;
          right: 7px;
          top: -8px;
          height: 21px;
          border-radius: 16px 16px 8px 8px;
          background: linear-gradient(90deg, #14b8a6, #fb923c, #84cc16);
          border: 2px solid rgba(251,146,60,0.64);
          transform-origin: bottom center;
          animation: cfspCorePokeballLid 5.6s ease-in-out infinite;
        }

        .cfsp-core-pokeball-core {
          position: absolute;
          left: 50%;
          bottom: 23px;
          width: 14px;
          height: 14px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: #facc15;
          border: 2px solid rgba(255,247,237,0.92);
          box-shadow:
            0 0 14px rgba(250,204,21,0.72),
            0 0 20px rgba(20,184,166,0.20);
        }

        .cfsp-core-wrap {
          position: fixed;
          top: 88px;
          right: 94px;
          z-index: 9999;
          width: min(480px, calc(100vw - 122px));
          pointer-events: none;
          background: transparent !important;
          border: 0 !important;
          box-shadow: none !important;
        }

        .cfsp-core-close {
          pointer-events: auto;
          position: absolute;
          top: 8px;
          right: 2px;
          z-index: 12;
          width: 38px;
          height: 38px;
          border-radius: 999px;
          border: 1px solid rgba(45,212,191,0.46);
          background: rgba(6,78,82,0.74);
          color: #a7fff5;
          font-size: 25px;
          line-height: 1;
          cursor: pointer;
          box-shadow: 0 0 18px rgba(45,212,191,0.16);
        }

        .cfsp-core-title {
          pointer-events: none;
          text-align: center;
          color: #5ff4e8;
          text-shadow:
            0 0 18px rgba(45,212,191,0.36),
            0 2px 12px rgba(3,18,23,0.42);
        }

        .cfsp-core-title div {
          font-size: 0.82rem;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.16em;
        }

        .cfsp-core-title strong {
          display: block;
          margin-top: 2px;
          color: #d9fffb;
          font-size: 1.72rem;
          line-height: 1;
          text-transform: uppercase;
          letter-spacing: 0.065em;
        }

        .cfsp-core-object {
          pointer-events: none;
          position: relative;
          height: 360px;
          margin-top: -6px;
        }

        .cfsp-core-ring {
          position: absolute;
          left: 50%;
          bottom: 23px;
          transform: translateX(-50%);
          border-radius: 50%;
          border: 2px solid rgba(45,212,191,0.30);
          box-shadow:
            0 0 24px rgba(45,212,191,0.16),
            inset 0 0 22px rgba(45,212,191,0.08);
        }

        .cfsp-core-ring-a {
          width: 318px;
          height: 70px;
          animation: cfspCoreRingSpinA 10s linear infinite;
        }

        .cfsp-core-ring-b {
          width: 244px;
          height: 50px;
          bottom: 36px;
          opacity: 0.72;
          animation: cfspCoreRingSpinB 8s linear infinite reverse;
        }

        .cfsp-core-beam {
          position: absolute;
          left: 50%;
          top: 80px;
          width: 330px;
          height: 282px;
          transform: translateX(-50%);
          clip-path: polygon(42% 0%, 58% 0%, 100% 100%, 0 100%);
          background:
            linear-gradient(
              180deg,
              rgba(63,246,226,0.16) 0%,
              rgba(36,220,199,0.24) 28%,
              rgba(28,197,186,0.16) 62%,
              rgba(0,0,0,0) 100%
            );
          filter: blur(1px);
          animation: cfspCoreBeamPulse 3.4s ease-in-out infinite;
        }

        .cfsp-core-beam-hotspot {
          position: absolute;
          left: 50%;
          top: 110px;
          width: 250px;
          height: 188px;
          transform: translateX(-50%);
          clip-path: polygon(44% 0%, 56% 0%, 88% 100%, 12% 100%);
          background: radial-gradient(circle at 50% 0%, rgba(255,201,75,0.25), rgba(0,0,0,0) 72%);
          filter: blur(12px);
          opacity: 0.94;
        }

        .cfsp-core-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: visible;
        }

        .cfsp-core-craft {
          transform-box: fill-box;
          transform-origin: center;
          animation: cfspCoreCraftRotateFloat 5.8s ease-in-out infinite;
        }

        .cfsp-core-craft-lid {
          transform-box: fill-box;
          transform-origin: center bottom;
          animation: cfspCoreCraftLidOpen 5.8s ease-in-out infinite;
        }

        .cfsp-core-scroll-left {
          transform-box: fill-box;
          transform-origin: center;
          animation: cfspCoreScrollLeft 6.8s ease-in-out infinite;
        }

        .cfsp-core-scroll-right {
          transform-box: fill-box;
          transform-origin: center;
          animation: cfspCoreScrollRight 7.2s ease-in-out infinite;
        }

        .cfsp-core-scroll-center {
          transform-box: fill-box;
          transform-origin: center;
          animation: cfspCoreScrollCenter 7s ease-in-out infinite;
        }

        .cfsp-core-sparks {
          animation: cfspCoreSparks 4.8s ease-in-out infinite;
        }

        .cfsp-core-status {
          pointer-events: none;
          width: min(100%, 410px);
          margin: -10px auto 12px;
          border-radius: 999px;
          border: 1px solid rgba(45,212,191,0.42);
          background: rgba(6,78,82,0.72);
          color: #9ffcf1;
          text-transform: uppercase;
          letter-spacing: 0.045em;
          font-size: 0.74rem;
          font-weight: 950;
          padding: 9px 12px;
          text-align: center;
          box-shadow: 0 0 18px rgba(45,212,191,0.12);
        }

        .cfsp-core-links {
          pointer-events: auto;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .cfsp-core-link {
          min-height: 60px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          border-radius: 15px;
          border: 1px solid rgba(45,212,191,0.44);
          background:
            linear-gradient(135deg, rgba(8,47,73,0.88), rgba(6,78,82,0.78));
          color: #d9fffb;
          font-size: 0.98rem;
          font-weight: 900;
          text-align: left;
          padding: 12px 14px;
          cursor: pointer;
          box-shadow:
            0 10px 20px rgba(0,0,0,0.18),
            inset 0 1px 0 rgba(255,255,255,0.08),
            0 0 14px rgba(45,212,191,0.10);
          transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }

        .cfsp-core-link:hover {
          transform: translateY(-1px);
          border-color: rgba(45,212,191,0.72);
          box-shadow:
            0 14px 26px rgba(0,0,0,0.24),
            0 0 22px rgba(45,212,191,0.18);
        }

        .cfsp-core-link span {
          flex: 0 0 auto;
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

        @keyframes cfspCorePokeballLid {
          0%, 100% { transform: translateY(0) rotateX(0deg); }
          50% { transform: translateY(-1px) rotateX(8deg); }
        }

        @keyframes cfspCoreRingSpinA {
          from { transform: translateX(-50%) rotate(0deg); }
          to { transform: translateX(-50%) rotate(360deg); }
        }

        @keyframes cfspCoreRingSpinB {
          from { transform: translateX(-50%) rotate(0deg); }
          to { transform: translateX(-50%) rotate(360deg); }
        }

        @keyframes cfspCoreBeamPulse {
          0%, 100% { opacity: 0.70; }
          50% { opacity: 1; }
        }

        @keyframes cfspCoreCraftRotateFloat {
          0%, 100% { transform: translateY(0) rotate(-1.6deg); }
          50% { transform: translateY(-7px) rotate(1.6deg); }
        }

        @keyframes cfspCoreCraftLidOpen {
          0%, 100% { transform: translateY(0) rotateX(0deg); }
          50% { transform: translateY(-4px) rotateX(15deg); }
        }

        @keyframes cfspCoreScrollLeft {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.58; }
          50% { transform: translateY(-9px) rotate(4deg); opacity: 0.90; }
        }

        @keyframes cfspCoreScrollRight {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.58; }
          50% { transform: translateY(-10px) rotate(-4deg); opacity: 0.90; }
        }

        @keyframes cfspCoreScrollCenter {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.78; }
          50% { transform: translateY(-8px) rotate(-2deg); opacity: 0.96; }
        }

        @keyframes cfspCoreSparks {
          0%, 100% { opacity: 0.34; }
          50% { opacity: 0.92; }
        }

        @media (max-width: 900px) {
          .cfsp-core-wrap {
            right: 86px;
            width: min(370px, calc(100vw - 110px));
          }

          .cfsp-core-links {
            grid-template-columns: 1fr;
          }

          .cfsp-core-object {
            height: 320px;
          }
        }
      `}</style>
    </>,
    portalRoot
  );
}
