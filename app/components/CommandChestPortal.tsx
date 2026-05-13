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
    if (node.closest(".cfsp-command-mini-field")) return false;

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
      label: "Materials",
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
      label: "Training",
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
      label: "Comms",
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
      label: scheduleCompleted ? "Schedule" : "Builder",
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
        className={`cfsp-command-mini-pokeball ${open ? "cfsp-command-mini-pokeball-active" : ""}`}
        aria-label={open ? "Close CFSP Command Center" : "Open CFSP Command Center"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="cfsp-command-mini-shell" aria-hidden="true" />
        <span className="cfsp-command-mini-core" aria-hidden="true" />
      </button>

      {open ? (
        <section className="cfsp-command-mini-field" aria-label="CFSP Command Center">
          <button
            type="button"
            className="cfsp-command-mini-close"
            aria-label="Close CFSP Command Center"
            onClick={() => setOpen(false)}
          >
            ×
          </button>

          <header className="cfsp-command-mini-title">
            <div>CFSP Command Center</div>
            <strong>Operations Core</strong>
          </header>

          <div className="cfsp-command-mini-object" aria-hidden="true">
            <div className="cfsp-command-mini-ring cfsp-command-mini-ring-a" />
            <div className="cfsp-command-mini-ring cfsp-command-mini-ring-b" />
            <div className="cfsp-command-mini-beam" />
            <div className="cfsp-command-mini-scroll cfsp-command-mini-scroll-left" />
            <div className="cfsp-command-mini-scroll cfsp-command-mini-scroll-right" />

            <div className="cfsp-command-mini-craft">
              <div className="cfsp-command-mini-craft-lid" />
              <div className="cfsp-command-mini-craft-body">
                <div className="cfsp-command-mini-craft-mark">CFSP</div>
                <div className="cfsp-command-mini-lock" />
              </div>
            </div>
          </div>

          <div className="cfsp-command-mini-signal">
            New content detected
          </div>

          <div className="cfsp-command-mini-actions">
            {actions.map((action) => (
              <button
                key={action.key}
                type="button"
                className="cfsp-command-mini-action"
                onClick={action.onClick}
              >
                <span>{action.glyph}</span>
                {action.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <style>{`
        .cfsp-floating-command-chest,
        #cfsp-floating-command-chest,
        details.cfsp-floating-command-chest,
        .cfsp-command-chest-launcher-v2,
        .cfsp-command-chest-panel-v2,
        .cfsp-command-vault-launcher-v4,
        .cfsp-command-vault-panel-v4,
        .cfsp-command-center-panel,
        .cfsp-command-center-field,
        .cfsp-core-wrap {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }

        .cfsp-command-mini-pokeball {
          position: fixed;
          top: 50%;
          right: 18px;
          z-index: 10000;
          width: 66px;
          height: 66px;
          transform: translateY(-50%);
          border: 0;
          border-radius: 999px;
          background:
            radial-gradient(circle at 35% 20%, rgba(255,255,255,0.96), transparent 22%),
            radial-gradient(circle at 50% 58%, rgba(20,184,166,0.32), transparent 44%),
            linear-gradient(135deg, rgba(255,255,255,0.98), rgba(236,253,245,0.94));
          box-shadow:
            0 16px 34px rgba(15,91,120,0.20),
            0 0 24px rgba(20,184,166,0.24),
            inset 0 1px 0 rgba(255,255,255,0.88);
          cursor: pointer;
          transition: transform 160ms ease, box-shadow 160ms ease;
        }

        .cfsp-command-mini-pokeball:hover,
        .cfsp-command-mini-pokeball-active {
          transform: translateY(-50%) scale(1.05);
          box-shadow:
            0 22px 46px rgba(15,91,120,0.26),
            0 0 32px rgba(20,184,166,0.34),
            inset 0 1px 0 rgba(255,255,255,0.88);
        }

        .cfsp-command-mini-shell {
          position: absolute;
          inset: 14px 11px 16px;
          border-radius: 16px 16px 13px 13px;
          background: linear-gradient(180deg, #14b8a6 0%, #0f9488 56%, #11806f 100%);
          border: 2px solid rgba(251,146,60,0.74);
          box-shadow:
            inset 0 0 0 3px rgba(255,255,255,0.34),
            0 10px 22px rgba(15,91,120,0.16),
            0 0 18px rgba(20,184,166,0.24);
        }

        .cfsp-command-mini-shell::before {
          content: "";
          position: absolute;
          left: 7px;
          right: 7px;
          top: -7px;
          height: 18px;
          border-radius: 15px 15px 8px 8px;
          background: linear-gradient(90deg, #14b8a6, #fb923c, #84cc16);
          border: 2px solid rgba(251,146,60,0.62);
          transform-origin: bottom center;
          animation: cfspMiniPokeballLid 5.6s ease-in-out infinite;
        }

        .cfsp-command-mini-core {
          position: absolute;
          left: 50%;
          bottom: 19px;
          width: 12px;
          height: 12px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: #facc15;
          border: 2px solid rgba(255,247,237,0.92);
          box-shadow:
            0 0 14px rgba(250,204,21,0.72),
            0 0 18px rgba(20,184,166,0.20);
        }

        .cfsp-command-mini-field {
          position: fixed;
          top: 118px;
          right: 84px;
          z-index: 9999;
          width: min(300px, calc(100vw - 108px));
          color: #d9fffb;
          pointer-events: none;
          background: transparent !important;
          border: 0 !important;
          box-shadow: none !important;
        }

        .cfsp-command-mini-close {
          pointer-events: auto;
          position: absolute;
          top: -4px;
          right: -4px;
          z-index: 20;
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: 1px solid rgba(45,212,191,0.46);
          background: rgba(6,78,82,0.74);
          color: #a7fff5;
          font-size: 21px;
          line-height: 1;
          cursor: pointer;
          box-shadow: 0 0 16px rgba(45,212,191,0.16);
        }

        .cfsp-command-mini-title {
          pointer-events: none;
          text-align: center;
          margin-bottom: -2px;
          text-shadow:
            0 0 16px rgba(45,212,191,0.34),
            0 3px 12px rgba(2,8,23,0.42);
        }

        .cfsp-command-mini-title div {
          color: #5ff4e8;
          font-size: 0.62rem;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.14em;
        }

        .cfsp-command-mini-title strong {
          display: block;
          color: #d9fffb;
          font-size: 1.05rem;
          line-height: 1;
          text-transform: uppercase;
          letter-spacing: 0.055em;
        }

        .cfsp-command-mini-object {
          pointer-events: none;
          position: relative;
          height: 218px;
        }

        .cfsp-command-mini-ring {
          position: absolute;
          left: 50%;
          bottom: 18px;
          transform: translateX(-50%);
          border-radius: 50%;
          border: 1px solid rgba(45,212,191,0.32);
          box-shadow:
            0 0 22px rgba(45,212,191,0.18),
            inset 0 0 20px rgba(45,212,191,0.08);
        }

        .cfsp-command-mini-ring-a {
          width: 210px;
          height: 46px;
          animation: cfspMiniRingSpinA 10s linear infinite;
        }

        .cfsp-command-mini-ring-b {
          width: 150px;
          height: 30px;
          bottom: 27px;
          opacity: 0.74;
          animation: cfspMiniRingSpinB 8s linear infinite reverse;
        }

        .cfsp-command-mini-beam {
          position: absolute;
          left: 50%;
          top: 44px;
          width: 226px;
          height: 186px;
          transform: translateX(-50%);
          clip-path: polygon(42% 0%, 58% 0%, 98% 100%, 2% 100%);
          background:
            linear-gradient(
              180deg,
              rgba(63,246,226,0.18) 0%,
              rgba(36,220,199,0.24) 28%,
              rgba(28,197,186,0.14) 62%,
              rgba(0,0,0,0) 100%
            );
          filter: blur(1px);
          animation: cfspMiniBeamPulse 3.4s ease-in-out infinite;
        }

        .cfsp-command-mini-scroll {
          position: absolute;
          top: 83px;
          width: 46px;
          height: 96px;
          border-radius: 15px;
          background:
            repeating-linear-gradient(
              to bottom,
              rgba(236,253,245,0.92) 0px,
              rgba(236,253,245,0.92) 8px,
              rgba(20,184,166,0.16) 8px,
              rgba(20,184,166,0.16) 10px
            ),
            linear-gradient(135deg, rgba(255,247,237,0.90), rgba(236,253,245,0.84));
          border: 1px solid rgba(45,212,191,0.34);
          box-shadow:
            0 14px 26px rgba(0,0,0,0.18),
            0 0 20px rgba(45,212,191,0.18),
            inset 0 0 14px rgba(251,146,60,0.10);
          opacity: 0.84;
        }

        .cfsp-command-mini-scroll-left {
          left: 28px;
          transform: rotate(-12deg);
          animation: cfspMiniScrollLeft 6.8s ease-in-out infinite;
        }

        .cfsp-command-mini-scroll-right {
          right: 28px;
          transform: rotate(12deg);
          animation: cfspMiniScrollRight 7.2s ease-in-out infinite;
        }

        .cfsp-command-mini-craft {
          position: absolute;
          left: 50%;
          top: 62px;
          width: 182px;
          height: 132px;
          transform: translateX(-50%);
          animation: cfspMiniCraftFloat 4.4s ease-in-out infinite;
        }

        .cfsp-command-mini-craft-lid {
          position: absolute;
          left: 50%;
          top: 0;
          width: 120px;
          height: 58px;
          transform: translateX(-50%);
          border-radius: 74px 74px 32px 32px;
          background:
            linear-gradient(90deg, #3ef2df 0%, #1bc6c4 26%, #f1a13b 62%, #b6d937 100%);
          border: 3px solid #ffd043;
          box-shadow:
            0 0 22px rgba(255,191,72,0.32),
            0 0 38px rgba(36,217,212,0.18);
          animation: cfspMiniCraftLid 5.4s ease-in-out infinite;
        }

        .cfsp-command-mini-craft-body {
          position: absolute;
          left: 50%;
          bottom: 4px;
          width: 162px;
          height: 84px;
          transform: translateX(-50%);
          border-radius: 26px;
          background:
            linear-gradient(135deg, rgba(28,192,191,0.96), rgba(8,127,127,0.96));
          border: 4px solid #f4b346;
          box-shadow:
            0 0 24px rgba(255,179,71,0.26),
            inset 0 0 0 3px rgba(123,255,245,0.18);
        }

        .cfsp-command-mini-craft-body::before,
        .cfsp-command-mini-craft-body::after {
          content: "";
          position: absolute;
          top: 12px;
          bottom: 12px;
          width: 6px;
          border-radius: 999px;
          background: rgba(240,178,87,0.95);
        }

        .cfsp-command-mini-craft-body::before {
          left: 22px;
        }

        .cfsp-command-mini-craft-body::after {
          right: 22px;
        }

        .cfsp-command-mini-craft-mark {
          position: absolute;
          left: 50%;
          bottom: 10px;
          transform: translateX(-50%);
          color: rgba(236,253,245,0.82);
          font-size: 0.54rem;
          font-weight: 950;
          letter-spacing: 0.14em;
        }

        .cfsp-command-mini-lock {
          position: absolute;
          left: 50%;
          top: 48%;
          width: 38px;
          height: 38px;
          transform: translate(-50%, -42%);
          border-radius: 999px;
          background: radial-gradient(circle, #ffcb47 0%, #ef9b1d 65%, #b96500 100%);
          box-shadow:
            0 0 18px rgba(255,199,72,0.62),
            0 0 0 5px rgba(255,255,255,0.75);
        }

        .cfsp-command-mini-lock::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          width: 14px;
          height: 5px;
          transform: translate(-50%, -50%);
          border-radius: 999px;
          background: #7a4200;
        }

        .cfsp-command-mini-signal {
          pointer-events: none;
          width: min(100%, 268px);
          margin: -4px auto 10px;
          padding: 7px 10px;
          border-radius: 999px;
          border: 1px solid rgba(45,212,191,0.46);
          background: rgba(5,82,88,0.74);
          color: #9ffcf1;
          text-transform: uppercase;
          letter-spacing: 0.045em;
          font-size: 0.58rem;
          font-weight: 950;
          text-align: center;
          box-shadow: 0 0 16px rgba(45,212,191,0.14);
        }

        .cfsp-command-mini-actions {
          pointer-events: auto;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .cfsp-command-mini-action {
          min-height: 42px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border-radius: 13px;
          border: 1px solid rgba(45,212,191,0.42);
          background:
            linear-gradient(135deg, rgba(8,47,73,0.90), rgba(6,78,82,0.82));
          color: #d9fffb;
          font-size: 0.80rem;
          font-weight: 900;
          text-align: left;
          padding: 9px 10px;
          cursor: pointer;
          box-shadow:
            0 8px 16px rgba(0,0,0,0.18),
            inset 0 1px 0 rgba(255,255,255,0.08),
            0 0 12px rgba(45,212,191,0.10);
          transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }

        .cfsp-command-mini-action:hover {
          transform: translateY(-1px);
          border-color: rgba(45,212,191,0.72);
          box-shadow:
            0 12px 24px rgba(0,0,0,0.22),
            0 0 20px rgba(45,212,191,0.18);
        }

        .cfsp-command-mini-action span {
          width: 21px;
          height: 21px;
          display: grid;
          place-items: center;
          border-radius: 7px;
          border: 1px solid rgba(45,212,191,0.40);
          color: #5ff4e8;
          background: rgba(20,184,166,0.14);
          font-size: 11px;
          flex: 0 0 auto;
        }

        @keyframes cfspMiniPokeballLid {
          0%, 100% { transform: translateY(0) rotateX(0deg); }
          50% { transform: translateY(-1px) rotateX(8deg); }
        }

        @keyframes cfspMiniRingSpinA {
          from { transform: translateX(-50%) rotate(0deg); }
          to { transform: translateX(-50%) rotate(360deg); }
        }

        @keyframes cfspMiniRingSpinB {
          from { transform: translateX(-50%) rotate(0deg); }
          to { transform: translateX(-50%) rotate(360deg); }
        }

        @keyframes cfspMiniBeamPulse {
          0%, 100% { opacity: 0.70; }
          50% { opacity: 1; }
        }

        @keyframes cfspMiniCraftFloat {
          0%, 100% { transform: translateX(-50%) translateY(0) rotate(-1.2deg); }
          50% { transform: translateX(-50%) translateY(-6px) rotate(1.2deg); }
        }

        @keyframes cfspMiniCraftLid {
          0%, 100% { transform: translateX(-50%) translateY(0) rotateX(0deg); }
          50% { transform: translateX(-50%) translateY(-3px) rotateX(12deg); }
        }

        @keyframes cfspMiniScrollLeft {
          0%, 100% { transform: rotate(-12deg) translateY(0); opacity: 0.62; }
          50% { transform: rotate(-8deg) translateY(-8px); opacity: 0.90; }
        }

        @keyframes cfspMiniScrollRight {
          0%, 100% { transform: rotate(12deg) translateY(0); opacity: 0.62; }
          50% { transform: rotate(8deg) translateY(-8px); opacity: 0.90; }
        }

        @media (max-width: 780px) {
          .cfsp-command-mini-field {
            top: 98px;
            right: 86px;
            width: min(280px, calc(100vw - 110px));
          }

          .cfsp-command-mini-actions {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>,
    portalRoot
  );
}
