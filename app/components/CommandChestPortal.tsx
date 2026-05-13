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
  const nodes = Array.from(document.querySelectorAll("a, button, h1, h2, h3, summary, section, article, div"));

  return nodes.find((node) => {
    if (!(node instanceof HTMLElement)) return false;
    if (node.closest(".cfsp-command-chest-panel-v2")) return false;

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

      scrollToTarget("simulation-command-file-cabinet", ["completed schedule file", "schedule is complete"]);
      return;
    }

    const params = new URLSearchParams();
    params.set("source", "command-chest");
    params.set("view", "builder");

    window.location.assign(`/events/${encodeURIComponent(eventId)}/schedule-builder?${params.toString()}`);
  };

  return createPortal(
    <>
      <button
        type="button"
        className="cfsp-command-chest-launcher-v2"
        aria-label={open ? "Close Simulation Command File Cabinet" : "Open Simulation Command File Cabinet"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="cfsp-command-chest-icon-v2" aria-hidden="true" />
      </button>

      {open ? (
        <section className="cfsp-command-chest-panel-v2" aria-label="Simulation Command File Cabinet">
          <button
            type="button"
            className="cfsp-command-chest-close-v2"
            aria-label="Close file cabinet"
            onClick={() => setOpen(false)}
          >
            ×
          </button>

          <div className="cfsp-command-chest-header-v2">
            <div className="cfsp-command-chest-kicker-v2">Simulation Command</div>
            <h2>File Cabinet</h2>
            <p>Open chest for files, training, materials, and packets.</p>
          </div>

          <div className="cfsp-command-chest-stage-v2" aria-hidden="true">
            <div className="cfsp-command-scroll-v2 cfsp-command-scroll-left-v2" />
            <div className="cfsp-command-scroll-v2 cfsp-command-scroll-right-v2" />
            <div className="cfsp-command-scroll-v2 cfsp-command-scroll-center-v2" />
            <div className="cfsp-command-big-chest-v2" />
            <div className="cfsp-command-orbit-v2" />
          </div>

          <div className="cfsp-command-chest-status-v2">New content detected when files update</div>

          <div className="cfsp-command-chest-grid-v2">
            <button
              type="button"
              onClick={() => scrollToTarget("simulation-command-file-cabinet", ["simulation command file cabinet", "case file", "doorsign"])}
            >
              <span>▣</span>
              Materials Cabinet
            </button>

            <button
              type="button"
              onClick={() => scrollToTarget("training-center", ["training attendance", "training center", "training files"])}
            >
              <span>◈</span>
              Training Files
            </button>

            <button
              type="button"
              onClick={() => scrollToTarget("communication-center", ["draft event emails", "sp hiring poll email", "communication"])}
            >
              <span>●</span>
              Communication
            </button>

            <button
              type="button"
              onClick={() => scrollToTarget("coverage-actions", ["coverage actions", "staffing command center", "selected sps"])}
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
              onClick={() => scrollToTarget("recording-status", ["recording guide", "recording status", "recording"])}
            >
              <span>▱</span>
              Recording
            </button>
          </div>

          <div className="cfsp-command-chest-footer-v2">Secure • Organized • Always Ready</div>
        </section>
      ) : null}

      <style>{`
        .cfsp-floating-command-chest {
          display: none !important;
        }

        .cfsp-command-chest-launcher-v2 {
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

        .cfsp-command-chest-launcher-v2:hover {
          transform: translateY(-2px);
          box-shadow:
            0 22px 48px rgba(15, 91, 120, 0.22),
            0 0 32px rgba(20, 184, 166, 0.20),
            inset 0 1px 0 rgba(255,255,255,0.86);
        }

        .cfsp-command-chest-icon-v2 {
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

        .cfsp-command-chest-icon-v2::before {
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
          animation: cfspIconLidV2 5.8s ease-in-out infinite;
        }

        .cfsp-command-chest-icon-v2::after {
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

        .cfsp-command-chest-panel-v2 {
          position: fixed;
          top: 132px;
          right: 26px;
          z-index: 9999;
          width: min(430px, calc(100vw - 32px));
          max-height: calc(100vh - 150px);
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

        .cfsp-command-chest-close-v2 {
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

        .cfsp-command-chest-header-v2 {
          text-align: center;
          padding: 16px 38px 6px;
        }

        .cfsp-command-chest-kicker-v2 {
          color: #5ff4e8;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.10em;
          font-size: 0.76rem;
          text-shadow: 0 0 18px rgba(45,212,191,0.32);
        }

        .cfsp-command-chest-header-v2 h2 {
          margin: 4px 0 4px;
          color: #7ffbf0;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-size: 1.28rem;
          line-height: 1.12;
          font-weight: 950;
          text-shadow: 0 0 18px rgba(45,212,191,0.32);
        }

        .cfsp-command-chest-header-v2 p {
          margin: 0;
          color: #b9e9e5;
          font-size: 0.78rem;
          line-height: 1.35;
          font-weight: 760;
        }

        .cfsp-command-chest-stage-v2 {
          position: relative;
          height: 220px;
          margin: 6px 0 14px;
          border-radius: 22px;
          background:
            radial-gradient(circle at 50% 80%, rgba(45,212,191,0.24), transparent 48%),
            linear-gradient(180deg, rgba(45,212,191,0.08), rgba(3,18,23,0.10));
          overflow: hidden;
        }

        .cfsp-command-big-chest-v2 {
          position: absolute;
          left: 50%;
          bottom: 28px;
          width: 210px;
          height: 114px;
          transform: translateX(-50%);
          border-radius: 24px 24px 18px 18px;
          background:
            radial-gradient(circle at 50% 58%, #facc15 0 11px, #f59e0b 12px 18px, transparent 19px),
            linear-gradient(90deg, transparent 0 12%, rgba(251,146,60,0.82) 13% 17%, transparent 18% 82%, rgba(251,146,60,0.82) 83% 87%, transparent 88%),
            linear-gradient(180deg, #14b8a6 0%, #0f9488 55%, #11806f 100%);
          border: 3px solid rgba(251,146,60,0.62);
          box-shadow:
            inset 0 0 0 4px rgba(255,255,255,0.16),
            0 22px 38px rgba(0,0,0,0.34),
            0 0 38px rgba(20,184,166,0.30),
            0 0 18px rgba(132,204,22,0.10);
          animation: cfspBigChestFloatV2 6s ease-in-out infinite;
        }

        .cfsp-command-big-chest-v2::before {
          content: "";
          position: absolute;
          left: 22px;
          right: 22px;
          top: -34px;
          height: 52px;
          border-radius: 26px 26px 12px 12px;
          background: linear-gradient(90deg, #14b8a6, #fb923c, #84cc16);
          border: 3px solid rgba(251,146,60,0.62);
          box-shadow:
            0 18px 28px rgba(0,0,0,0.22),
            0 0 30px rgba(45,212,191,0.22),
            inset 0 7px 14px rgba(255,255,255,0.20);
          transform-origin: bottom center;
          animation: cfspBigChestLidV2 6s ease-in-out infinite;
        }

        .cfsp-command-orbit-v2 {
          position: absolute;
          left: 50%;
          bottom: 8px;
          width: 260px;
          height: 54px;
          transform: translateX(-50%);
          border-radius: 50%;
          border: 1px solid rgba(45,212,191,0.30);
          box-shadow:
            0 0 22px rgba(45,212,191,0.18),
            inset 0 0 28px rgba(45,212,191,0.10);
        }

        .cfsp-command-scroll-v2 {
          position: absolute;
          width: 88px;
          height: 128px;
          border-radius: 14px;
          border: 1px solid rgba(45,212,191,0.34);
          background:
            repeating-linear-gradient(
              to bottom,
              rgba(236,253,245,0.82) 0px,
              rgba(236,253,245,0.82) 10px,
              rgba(20,184,166,0.18) 10px,
              rgba(20,184,166,0.18) 12px
            ),
            linear-gradient(135deg, rgba(255,247,237,0.88), rgba(236,253,245,0.82));
          box-shadow:
            0 18px 32px rgba(0,0,0,0.24),
            0 0 24px rgba(45,212,191,0.22),
            inset 0 0 18px rgba(251,146,60,0.12);
          opacity: 0.76;
        }

        .cfsp-command-scroll-left-v2 {
          left: 22px;
          top: 64px;
          transform: rotate(-14deg);
          animation: cfspScrollLeftV2 6.8s ease-in-out infinite;
        }

        .cfsp-command-scroll-right-v2 {
          right: 22px;
          top: 64px;
          transform: rotate(14deg);
          animation: cfspScrollRightV2 7.2s ease-in-out infinite;
        }

        .cfsp-command-scroll-center-v2 {
          left: 50%;
          top: 42px;
          transform: translateX(-50%) rotate(1deg);
          width: 72px;
          height: 110px;
          opacity: 0.88;
          animation: cfspScrollCenterV2 7s ease-in-out infinite;
        }

        .cfsp-command-chest-status-v2 {
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

        .cfsp-command-chest-grid-v2 {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 12px;
        }

        .cfsp-command-chest-grid-v2 button {
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

        .cfsp-command-chest-grid-v2 button:hover {
          transform: translateY(-1px);
          border-color: rgba(45,212,191,0.68);
          box-shadow:
            0 14px 26px rgba(0,0,0,0.24),
            0 0 22px rgba(45,212,191,0.18);
        }

        .cfsp-command-chest-grid-v2 span {
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

        .cfsp-command-chest-footer-v2 {
          margin-top: 12px;
          color: #75d8d0;
          font-size: 0.72rem;
          font-weight: 850;
          text-align: center;
          letter-spacing: 0.03em;
        }

        @keyframes cfspIconLidV2 {
          0%, 100% { transform: translateY(0) rotateX(0deg); }
          50% { transform: translateY(-1px) rotateX(8deg); }
        }

        @keyframes cfspBigChestFloatV2 {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-4px); }
        }

        @keyframes cfspBigChestLidV2 {
          0%, 100% { transform: translateY(0) rotateX(0deg); }
          50% { transform: translateY(-4px) rotateX(16deg); }
        }

        @keyframes cfspScrollLeftV2 {
          0%, 100% { transform: translateY(0) rotate(-14deg); opacity: 0.52; }
          50% { transform: translateY(-8px) rotate(-10deg); opacity: 0.82; }
        }

        @keyframes cfspScrollRightV2 {
          0%, 100% { transform: translateY(0) rotate(14deg); opacity: 0.52; }
          50% { transform: translateY(-9px) rotate(10deg); opacity: 0.82; }
        }

        @keyframes cfspScrollCenterV2 {
          0%, 100% { transform: translateX(-50%) translateY(0) rotate(1deg); opacity: 0.74; }
          50% { transform: translateX(-50%) translateY(-7px) rotate(-1deg); opacity: 0.94; }
        }
      `}</style>
    </>,
    portalRoot
  );
}
