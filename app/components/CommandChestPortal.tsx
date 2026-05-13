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
    if (node.closest(".cfsp-command-center-panel")) return false;

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
        className={`cfsp-command-pokeball ${open ? "cfsp-command-pokeball-open" : ""}`}
        aria-label={open ? "Close CFSP Command Center" : "Open CFSP Command Center"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="cfsp-command-pokeball-shell" aria-hidden="true" />
        <span className="cfsp-command-pokeball-core" aria-hidden="true" />
      </button>

      {open ? (
        <section className="cfsp-command-center-panel" aria-label="CFSP Command Center">
          <button
            type="button"
            className="cfsp-command-center-close"
            aria-label="Close CFSP Command Center"
            onClick={() => setOpen(false)}
          >
            ×
          </button>

          <header className="cfsp-command-center-header">
            <div className="cfsp-command-center-kicker">CFSP Command Center</div>
            <h2>Operations Core</h2>
            <p>Files, training, communications, staffing, schedule, and recording.</p>
          </header>

          <div className="cfsp-command-center-stage" aria-hidden="true">
            <div className="cfsp-command-center-orbit cfsp-command-center-orbit-one" />
            <div className="cfsp-command-center-orbit cfsp-command-center-orbit-two" />
            <div className="cfsp-command-center-beam" />
            <div className="cfsp-command-center-beam-hotspot" />

            <div className="cfsp-command-center-scroll cfsp-command-center-scroll-left">
              <span />
            </div>
            <div className="cfsp-command-center-scroll cfsp-command-center-scroll-right">
              <span />
            </div>
            <div className="cfsp-command-center-scroll cfsp-command-center-scroll-center">
              <span />
            </div>

            <div className="cfsp-command-center-craft">
              <div className="cfsp-command-center-craft-lid" />
              <div className="cfsp-command-center-craft-body">
                <div className="cfsp-command-center-craft-lock" />
              </div>
            </div>

            <div className="cfsp-command-center-spark cfsp-command-center-spark-one" />
            <div className="cfsp-command-center-spark cfsp-command-center-spark-two" />
            <div className="cfsp-command-center-spark cfsp-command-center-spark-three" />
          </div>

          <div className="cfsp-command-center-status">
            New content detected when files update
          </div>

          <div className="cfsp-command-center-actions">
            {actions.map((action) => (
              <button
                key={action.key}
                type="button"
                className="cfsp-command-center-action"
                onClick={action.onClick}
              >
                <span className="cfsp-command-center-action-glyph">{action.glyph}</span>
                <span>{action.label}</span>
              </button>
            ))}
          </div>

          <footer className="cfsp-command-center-footer">
            Secure • Organized • Always Ready
          </footer>
        </section>
      ) : null}

      <style>{`
        .cfsp-floating-command-chest,
        #cfsp-floating-command-chest,
        details.cfsp-floating-command-chest,
        .cfsp-command-chest-launcher-v2,
        .cfsp-command-chest-panel-v2,
        .cfsp-command-vault-launcher-v4,
        .cfsp-command-vault-panel-v4 {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }

        .cfsp-command-pokeball {
          position: fixed;
          top: 50%;
          right: 22px;
          z-index: 10000;
          width: 76px;
          height: 76px;
          transform: translateY(-50%);
          border: 0;
          border-radius: 999px;
          background:
            radial-gradient(circle at 35% 20%, rgba(255,255,255,0.96), transparent 22%),
            radial-gradient(circle at 50% 58%, rgba(20,184,166,0.34), transparent 44%),
            linear-gradient(135deg, rgba(255,255,255,0.98), rgba(236,253,245,0.94));
          box-shadow:
            0 18px 42px rgba(15, 91, 120, 0.20),
            0 0 26px rgba(20, 184, 166, 0.24),
            inset 0 1px 0 rgba(255,255,255,0.88);
          cursor: pointer;
          transition: transform 160ms ease, box-shadow 160ms ease;
        }

        .cfsp-command-pokeball:hover,
        .cfsp-command-pokeball-open {
          transform: translateY(-50%) scale(1.04);
          box-shadow:
            0 24px 54px rgba(15, 91, 120, 0.26),
            0 0 34px rgba(20, 184, 166, 0.32),
            inset 0 1px 0 rgba(255,255,255,0.88);
        }

        .cfsp-command-pokeball-shell {
          position: absolute;
          inset: 15px 12px 17px;
          border-radius: 17px 17px 14px 14px;
          background:
            linear-gradient(180deg, #14b8a6 0%, #0f9488 56%, #11806f 100%);
          border: 2px solid rgba(251,146,60,0.74);
          box-shadow:
            inset 0 0 0 3px rgba(255,255,255,0.34),
            0 10px 22px rgba(15,91,120,0.16),
            0 0 18px rgba(20,184,166,0.24);
        }

        .cfsp-command-pokeball-shell::before {
          content: "";
          position: absolute;
          left: 7px;
          right: 7px;
          top: -7px;
          height: 19px;
          border-radius: 15px 15px 8px 8px;
          background: linear-gradient(90deg, #14b8a6, #fb923c, #84cc16);
          border: 2px solid rgba(251,146,60,0.62);
          transform-origin: bottom center;
          animation: cfspPokeballLid 5.6s ease-in-out infinite;
        }

        .cfsp-command-pokeball-core {
          position: absolute;
          left: 50%;
          bottom: 22px;
          width: 13px;
          height: 13px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: #facc15;
          border: 2px solid rgba(255,247,237,0.92);
          box-shadow:
            0 0 14px rgba(250,204,21,0.72),
            0 0 20px rgba(20,184,166,0.20);
        }

        .cfsp-command-center-panel {
          position: fixed;
          top: 110px;
          right: 104px;
          z-index: 9999;
          width: min(440px, calc(100vw - 126px));
          max-height: calc(100vh - 132px);
          overflow: auto;
          padding: 18px;
          border-radius: 30px;
          border: 1px solid rgba(45, 212, 191, 0.62);
          background:
            radial-gradient(circle at 20% 8%, rgba(45,212,191,0.20), transparent 32%),
            radial-gradient(circle at 86% 18%, rgba(20,184,166,0.16), transparent 30%),
            radial-gradient(circle at 70% 94%, rgba(124,58,237,0.08), transparent 28%),
            linear-gradient(145deg, rgba(3,18,23,0.98), rgba(5,38,45,0.97) 52%, rgba(4,28,36,0.985));
          box-shadow:
            0 30px 80px rgba(2, 8, 23, 0.50),
            0 0 0 1px rgba(45,212,191,0.16) inset,
            0 0 44px rgba(20,184,166,0.30);
          color: #d9fffb;
        }

        .cfsp-command-center-close {
          position: absolute;
          top: 12px;
          right: 12px;
          z-index: 6;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(45,212,191,0.46);
          background: rgba(6,78,82,0.34);
          color: #a7fff5;
          font-size: 24px;
          line-height: 1;
          cursor: pointer;
          box-shadow: 0 0 18px rgba(45,212,191,0.16);
        }

        .cfsp-command-center-header {
          text-align: center;
          padding: 14px 38px 4px;
        }

        .cfsp-command-center-kicker {
          color: #5ff4e8;
          font-size: 0.76rem;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          text-shadow: 0 0 18px rgba(45,212,191,0.34);
        }

        .cfsp-command-center-header h2 {
          margin: 4px 0;
          color: #7ffbf0;
          font-size: 1.34rem;
          line-height: 1.14;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          text-shadow: 0 0 18px rgba(45,212,191,0.36);
        }

        .cfsp-command-center-header p {
          margin: 0;
          color: #b9e9e5;
          font-size: 0.78rem;
          line-height: 1.35;
          font-weight: 760;
        }

        .cfsp-command-center-stage {
          position: relative;
          height: 258px;
          margin: 8px 0 14px;
          border-radius: 24px;
          background:
            radial-gradient(circle at 50% 82%, rgba(45,212,191,0.24), transparent 48%),
            radial-gradient(circle at 50% 14%, rgba(251,146,60,0.08), transparent 32%),
            linear-gradient(180deg, rgba(45,212,191,0.08), rgba(3,18,23,0.10));
          overflow: hidden;
        }

        .cfsp-command-center-orbit {
          position: absolute;
          left: 50%;
          bottom: 18px;
          transform: translateX(-50%);
          border-radius: 50%;
          border: 1px solid rgba(45,212,191,0.28);
          box-shadow:
            0 0 24px rgba(45,212,191,0.16),
            inset 0 0 22px rgba(45,212,191,0.08);
        }

        .cfsp-command-center-orbit-one {
          width: 276px;
          height: 60px;
          animation: cfspCommandOrbitSpinA 10s linear infinite;
        }

        .cfsp-command-center-orbit-two {
          width: 214px;
          height: 42px;
          bottom: 28px;
          opacity: 0.72;
          animation: cfspCommandOrbitSpinB 8s linear infinite reverse;
        }

        .cfsp-command-center-beam {
          position: absolute;
          left: 50%;
          top: 52px;
          width: 284px;
          height: 230px;
          transform: translateX(-50%);
          clip-path: polygon(42% 0%, 58% 0%, 98% 100%, 2% 100%);
          background:
            linear-gradient(
              180deg,
              rgba(63,246,226,0.16) 0%,
              rgba(36,220,199,0.24) 28%,
              rgba(28,197,186,0.16) 62%,
              rgba(0,0,0,0) 100%
            );
          filter: blur(1px);
          animation: cfspCommandBeamPulse 3.4s ease-in-out infinite;
        }

        .cfsp-command-center-beam-hotspot {
          position: absolute;
          left: 50%;
          top: 92px;
          width: 226px;
          height: 154px;
          transform: translateX(-50%);
          clip-path: polygon(44% 0%, 56% 0%, 88% 100%, 12% 100%);
          background: radial-gradient(circle at 50% 0%, rgba(255,201,75,0.26), rgba(0,0,0,0) 72%);
          filter: blur(12px);
          opacity: 0.94;
        }

        .cfsp-command-center-scroll {
          position: absolute;
          top: 98px;
          width: 70px;
          height: 136px;
          border-radius: 20px;
          background:
            repeating-linear-gradient(
              to bottom,
              rgba(236,253,245,0.92) 0px,
              rgba(236,253,245,0.92) 10px,
              rgba(20,184,166,0.16) 10px,
              rgba(20,184,166,0.16) 12px
            ),
            linear-gradient(135deg, rgba(255,247,237,0.90), rgba(236,253,245,0.84));
          border: 1px solid rgba(45,212,191,0.34);
          box-shadow:
            0 18px 32px rgba(0,0,0,0.22),
            0 0 24px rgba(45,212,191,0.22),
            inset 0 0 18px rgba(251,146,60,0.12);
          opacity: 0.78;
        }

        .cfsp-command-center-scroll-left {
          left: 34px;
          transform: rotate(-13deg);
          animation: cfspCommandScrollLeft 6.8s ease-in-out infinite;
        }

        .cfsp-command-center-scroll-right {
          right: 34px;
          transform: rotate(13deg);
          animation: cfspCommandScrollRight 7.2s ease-in-out infinite;
        }

        .cfsp-command-center-scroll-center {
          left: 50%;
          top: 66px;
          width: 60px;
          height: 116px;
          transform: translateX(-50%);
          opacity: 0.90;
          animation: cfspCommandScrollCenter 7s ease-in-out infinite;
        }

        .cfsp-command-center-craft {
          position: absolute;
          left: 50%;
          top: 74px;
          width: 244px;
          height: 174px;
          transform: translateX(-50%);
          animation: cfspCommandCraftFloat 4.4s ease-in-out infinite;
        }

        .cfsp-command-center-craft-lid {
          position: absolute;
          left: 50%;
          top: 0;
          width: 158px;
          height: 80px;
          transform: translateX(-50%);
          border-radius: 90px 90px 40px 40px;
          background:
            linear-gradient(90deg, #3ef2df 0%, #1bc6c4 26%, #f1a13b 62%, #b6d937 100%);
          border: 4px solid #ffd043;
          box-shadow:
            0 0 24px rgba(255,191,72,0.34),
            0 0 50px rgba(36,217,212,0.20);
          animation: cfspCommandCraftLid 5.4s ease-in-out infinite;
        }

        .cfsp-command-center-craft-body {
          position: absolute;
          left: 50%;
          bottom: 6px;
          width: 216px;
          height: 112px;
          transform: translateX(-50%);
          border-radius: 32px;
          background:
            linear-gradient(135deg, rgba(28,192,191,0.95), rgba(8,127,127,0.96));
          border: 5px solid #f4b346;
          box-shadow:
            0 0 26px rgba(255,179,71,0.28),
            inset 0 0 0 3px rgba(123,255,245,0.18);
        }

        .cfsp-command-center-craft-body::before,
        .cfsp-command-center-craft-body::after {
          content: "";
          position: absolute;
          top: 14px;
          bottom: 14px;
          width: 8px;
          border-radius: 999px;
          background: rgba(240,178,87,0.95);
        }

        .cfsp-command-center-craft-body::before {
          left: 28px;
        }

        .cfsp-command-center-craft-body::after {
          right: 28px;
        }

        .cfsp-command-center-craft-lock {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 52px;
          height: 52px;
          transform: translate(-50%, -42%);
          border-radius: 999px;
          background: radial-gradient(circle, #ffcb47 0%, #ef9b1d 65%, #b96500 100%);
          box-shadow:
            0 0 20px rgba(255,199,72,0.65),
            0 0 0 6px rgba(255,255,255,0.75);
        }

        .cfsp-command-center-craft-lock::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          width: 18px;
          height: 7px;
          transform: translate(-50%, -50%);
          border-radius: 999px;
          background: #7a4200;
        }

        .cfsp-command-center-spark {
          position: absolute;
          width: 5px;
          height: 5px;
          border-radius: 999px;
          background: #a7fff5;
          box-shadow: 0 0 12px rgba(167,255,245,0.72);
          animation: cfspCommandSpark 4.8s ease-in-out infinite;
        }

        .cfsp-command-center-spark-one {
          left: 64px;
          top: 54px;
        }

        .cfsp-command-center-spark-two {
          right: 70px;
          top: 62px;
          animation-delay: 1.2s;
        }

        .cfsp-command-center-spark-three {
          right: 54px;
          bottom: 52px;
          background: #facc15;
          animation-delay: 2.1s;
        }

        .cfsp-command-center-status {
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

        .cfsp-command-center-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 12px;
        }

        .cfsp-command-center-action {
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

        .cfsp-command-center-action:hover {
          transform: translateY(-1px);
          border-color: rgba(45,212,191,0.68);
          box-shadow:
            0 14px 26px rgba(0,0,0,0.24),
            0 0 22px rgba(45,212,191,0.18);
        }

        .cfsp-command-center-action-glyph {
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

        .cfsp-command-center-footer {
          margin-top: 12px;
          color: #75d8d0;
          font-size: 0.72rem;
          font-weight: 850;
          text-align: center;
          letter-spacing: 0.03em;
        }

        @keyframes cfspPokeballLid {
          0%, 100% { transform: translateY(0) rotateX(0deg); }
          50% { transform: translateY(-1px) rotateX(8deg); }
        }

        @keyframes cfspCommandCraftFloat {
          0%, 100% { transform: translateX(-50%) translateY(0) rotate(-1.2deg); }
          50% { transform: translateX(-50%) translateY(-7px) rotate(1.2deg); }
        }

        @keyframes cfspCommandCraftLid {
          0%, 100% { transform: translateX(-50%) translateY(0) rotateX(0deg); }
          50% { transform: translateX(-50%) translateY(-3px) rotateX(12deg); }
        }

        @keyframes cfspCommandBeamPulse {
          0%, 100% { opacity: 0.72; }
          50% { opacity: 1; }
        }

        @keyframes cfspCommandOrbitSpinA {
          from { transform: translateX(-50%) rotate(0deg); }
          to { transform: translateX(-50%) rotate(360deg); }
        }

        @keyframes cfspCommandOrbitSpinB {
          from { transform: translateX(-50%) rotate(0deg); }
          to { transform: translateX(-50%) rotate(360deg); }
        }

        @keyframes cfspCommandScrollLeft {
          0%, 100% { transform: rotate(-13deg) translateY(0); opacity: 0.56; }
          50% { transform: rotate(-8deg) translateY(-10px); opacity: 0.88; }
        }

        @keyframes cfspCommandScrollRight {
          0%, 100% { transform: rotate(13deg) translateY(0); opacity: 0.56; }
          50% { transform: rotate(8deg) translateY(-10px); opacity: 0.88; }
        }

        @keyframes cfspCommandScrollCenter {
          0%, 100% { transform: translateX(-50%) translateY(0) rotate(0deg); opacity: 0.80; }
          50% { transform: translateX(-50%) translateY(-8px) rotate(-2deg); opacity: 0.96; }
        }

        @keyframes cfspCommandSpark {
          0%, 100% { opacity: 0.24; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }

        @media (max-width: 1200px) {
          .cfsp-command-center-panel {
            right: 92px;
            width: min(400px, calc(100vw - 112px));
          }
        }

        @media (max-width: 760px) {
          .cfsp-command-pokeball {
            right: 12px;
          }

          .cfsp-command-center-panel {
            top: 96px;
            right: 12px;
            width: calc(100vw - 24px);
          }

          .cfsp-command-center-actions {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>,
    portalRoot
  );
}
