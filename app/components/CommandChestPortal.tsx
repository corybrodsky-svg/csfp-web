"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CommandChestPortalProps = {
  eventId: string | number;
  scheduleCompleted?: boolean;
};

type ChestAction = {
  key: string;
  label: string;
  onClick: () => void;
};

export default function CommandChestPortal({
  eventId,
  scheduleCompleted = false,
}: CommandChestPortalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  const id = String(eventId);

  function scrollToKnownTarget(candidates: string[], headingText?: string) {
    for (const candidate of candidates) {
      const el = document.querySelector(candidate) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return true;
      }
    }

    if (headingText) {
      const all = Array.from(document.querySelectorAll("h1,h2,h3,h4,summary,strong,div"));
      const match = all.find((node) =>
        (node.textContent || "").trim().toLowerCase() === headingText.toLowerCase()
      ) as HTMLElement | undefined;

      if (match) {
        match.scrollIntoView({ behavior: "smooth", block: "start" });
        return true;
      }
    }

    return false;
  }

  function openCompletedSchedule() {
    const existingAction =
      (document.querySelector('[data-open-completed-schedule="true"]') as HTMLElement | null) ||
      (document.querySelector('[data-open-schedule="true"]') as HTMLElement | null);

    if (existingAction) {
      existingAction.click();
      return;
    }

    if (scheduleCompleted) {
      router.push(`/events/${encodeURIComponent(id)}/schedule-builder?view=preview`);
      return;
    }

    router.push(`/events/${encodeURIComponent(id)}/schedule-builder`);
  }

  const actions: ChestAction[] = [
      {
        key: "materials",
        label: "Materials Cabinet",
        onClick: () =>
          scrollToKnownTarget(
            [
              "#simulation-command-file-cabinet",
              '[data-section="file-cabinet"]',
              '[data-command-chest-target="materials"]',
            ],
            "Simulation Command File Cabinet"
          ),
      },
      {
        key: "training",
        label: "Training Files",
        onClick: () =>
          scrollToKnownTarget(
            [
              "#training-attendance",
              '[data-section="training"]',
              '[data-command-chest-target="training"]',
            ],
            "Training Attendance"
          ),
      },
      {
        key: "communication",
        label: "Communication",
        onClick: () =>
          scrollToKnownTarget(
            [
              "#communication-hub",
              "#communication",
              '[data-section="communication"]',
              '[data-command-chest-target="communication"]',
            ],
            "Communication"
          ),
      },
      {
        key: "staffing",
        label: "Staffing",
        onClick: () =>
          scrollToKnownTarget(
            [
              "#selected-sps",
              '[data-section="staffing"]',
              '[data-command-chest-target="staffing"]',
            ],
            "Selected SPs"
          ),
      },
      {
        key: "schedule",
        label: "Schedule File",
        onClick: () => openCompletedSchedule(),
      },
      {
        key: "recording",
        label: "Recording",
        onClick: () =>
          scrollToKnownTarget(
            [
              "#recording",
              '[data-section="recording"]',
              '[data-command-chest-target="recording"]',
            ],
            "Recording"
          ),
      },
  ];

  return (
    <>
      <div className="cfsp-chest-launcher-wrap">
        {!open ? (
          <button
            type="button"
            className="cfsp-chest-launcher"
            onClick={() => setOpen(true)}
            aria-label="Open Simulation Command File Cabinet"
          >
            <span className="cfsp-chest-launcher-shell" />
            <span className="cfsp-chest-launcher-core" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="cfsp-chest-portal" aria-label="Simulation Command File Cabinet">
          <button
            type="button"
            className="cfsp-chest-close"
            onClick={() => setOpen(false)}
            aria-label="Close Simulation Command File Cabinet"
          >
            ×
          </button>

          <div className="cfsp-chest-title">
            <div className="cfsp-chest-kicker">SIMULATION COMMAND</div>
            <div className="cfsp-chest-name">FILE CABINET</div>
            <div className="cfsp-chest-subtitle">
              Open chest for files, training, materials, and packets.
            </div>
          </div>

          <div className="cfsp-chest-scene">
            <div className="cfsp-orbit-ring" />
            <div className="cfsp-beam" />
            <div className="cfsp-beam-glow" />

            <div className="cfsp-scroll cfsp-scroll-left">
              <div className="cfsp-scroll-core" />
            </div>

            <div className="cfsp-scroll cfsp-scroll-right">
              <div className="cfsp-scroll-core" />
            </div>

            <div className="cfsp-craft-wrap">
              <div className="cfsp-craft-top" />
              <div className="cfsp-craft-body">
                <div className="cfsp-craft-latch" />
              </div>
            </div>
          </div>

          <div className="cfsp-beam-caption">NEW CONTENT DETECTED WHEN FILES UPDATE</div>

          <div className="cfsp-floating-links">
            {actions.map((action) => (
              <button
                key={action.key}
                type="button"
                className="cfsp-floating-link"
                onClick={action.onClick}
              >
                <span className="cfsp-link-dot" />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .cfsp-chest-launcher-wrap {
          position: fixed;
          top: 160px;
          right: 28px;
          z-index: 80;
          pointer-events: none;
        }

        .cfsp-chest-launcher {
          pointer-events: auto;
          position: relative;
          width: 74px;
          height: 74px;
          border: none;
          border-radius: 999px;
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.95), rgba(230,255,250,0.82));
          box-shadow:
            0 12px 28px rgba(15, 23, 42, 0.18),
            0 0 24px rgba(45, 212, 191, 0.28);
          cursor: pointer;
        }

        .cfsp-chest-launcher-shell {
          position: absolute;
          inset: 13px;
          border-radius: 20px;
          background: linear-gradient(145deg, #17c3c7, #0f766e);
          border: 2px solid rgba(255, 193, 70, 0.88);
        }

        .cfsp-chest-launcher-core {
          position: absolute;
          left: 50%;
          bottom: 17px;
          transform: translateX(-50%);
          width: 14px;
          height: 14px;
          border-radius: 999px;
          background: radial-gradient(circle, #ffd86b 0%, #ffb100 72%, #d97706 100%);
          box-shadow: 0 0 14px rgba(255, 184, 0, 0.7);
        }

        .cfsp-chest-portal {
          position: fixed;
          top: 150px;
          right: 24px;
          width: 420px;
          z-index: 90;
          pointer-events: none;
        }

        .cfsp-chest-close {
          pointer-events: auto;
          position: absolute;
          top: 6px;
          right: 0;
          width: 40px;
          height: 40px;
          border: none;
          border-radius: 999px;
          background: rgba(9, 64, 72, 0.9);
          color: #8ff7ef;
          font-size: 28px;
          line-height: 1;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
          cursor: pointer;
        }

        .cfsp-chest-title {
          text-align: center;
          margin-bottom: 10px;
          pointer-events: none;
          text-shadow: 0 0 14px rgba(45, 212, 191, 0.18);
        }

        .cfsp-chest-kicker {
          font-size: 0.88rem;
          font-weight: 800;
          letter-spacing: 0.16em;
          color: #43f3ef;
        }

        .cfsp-chest-name {
          margin-top: 2px;
          font-size: 2rem;
          font-weight: 900;
          letter-spacing: 0.04em;
          color: #b7fff8;
        }

        .cfsp-chest-subtitle {
          margin-top: 6px;
          font-size: 1rem;
          font-weight: 700;
          color: rgba(214, 255, 248, 0.92);
        }

        .cfsp-chest-scene {
          position: relative;
          height: 290px;
          pointer-events: none;
        }

        .cfsp-orbit-ring {
          position: absolute;
          left: 50%;
          bottom: 16px;
          transform: translateX(-50%);
          width: 255px;
          height: 68px;
          border-radius: 999px;
          border: 2px solid rgba(42, 242, 225, 0.35);
          box-shadow: 0 0 28px rgba(0, 255, 229, 0.18);
          animation: cfspOrbitSpin 12s linear infinite;
        }

        .cfsp-orbit-ring::before,
        .cfsp-orbit-ring::after {
          content: "";
          position: absolute;
          inset: 10px;
          border-radius: 999px;
          border: 1px solid rgba(42, 242, 225, 0.22);
        }

        .cfsp-beam {
          position: absolute;
          left: 50%;
          top: 62px;
          transform: translateX(-50%);
          width: 280px;
          height: 215px;
          clip-path: polygon(40% 0%, 60% 0%, 96% 100%, 4% 100%);
          background:
            linear-gradient(
              180deg,
              rgba(63, 246, 226, 0.16) 0%,
              rgba(36, 220, 199, 0.22) 26%,
              rgba(28, 197, 186, 0.18) 60%,
              rgba(0, 0, 0, 0) 100%
            );
          filter: blur(1px);
          animation: cfspBeamPulse 3.4s ease-in-out infinite;
        }

        .cfsp-beam-glow {
          position: absolute;
          left: 50%;
          top: 92px;
          transform: translateX(-50%);
          width: 220px;
          height: 160px;
          clip-path: polygon(44% 0%, 56% 0%, 88% 100%, 12% 100%);
          background: radial-gradient(circle at 50% 0%, rgba(255, 201, 75, 0.26), rgba(0,0,0,0) 72%);
          filter: blur(12px);
          opacity: 0.95;
        }

        .cfsp-scroll {
          position: absolute;
          top: 112px;
          width: 60px;
          height: 138px;
          border-radius: 22px;
          background: linear-gradient(180deg, rgba(240, 248, 245, 0.95), rgba(198, 214, 214, 0.92));
          box-shadow:
            0 0 18px rgba(144, 255, 244, 0.3),
            0 8px 18px rgba(15, 23, 42, 0.18);
          overflow: hidden;
        }

        .cfsp-scroll::before,
        .cfsp-scroll::after {
          content: "";
          position: absolute;
          left: 8px;
          right: 8px;
          height: 2px;
          background: rgba(86, 122, 124, 0.36);
          box-shadow:
            0 14px 0 rgba(86, 122, 124, 0.36),
            0 28px 0 rgba(86, 122, 124, 0.36),
            0 42px 0 rgba(86, 122, 124, 0.36),
            0 56px 0 rgba(86, 122, 124, 0.36),
            0 70px 0 rgba(86, 122, 124, 0.36),
            0 84px 0 rgba(86, 122, 124, 0.36);
        }

        .cfsp-scroll::before {
          top: 20px;
        }

        .cfsp-scroll::after {
          width: 14px;
          height: 14px;
          border-radius: 999px;
          background: linear-gradient(180deg, #efb871, #d68f47);
          box-shadow: none;
          top: 8px;
          left: auto;
          right: 8px;
        }

        .cfsp-scroll-core {
          position: absolute;
          inset: 0;
          border-radius: 22px;
          background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0));
        }

        .cfsp-scroll-left {
          left: 82px;
          transform: rotate(-12deg);
          animation: cfspScrollFloatLeft 4.8s ease-in-out infinite;
        }

        .cfsp-scroll-right {
          right: 82px;
          transform: rotate(12deg);
          animation: cfspScrollFloatRight 5.1s ease-in-out infinite;
        }

        .cfsp-craft-wrap {
          position: absolute;
          left: 50%;
          top: 78px;
          width: 250px;
          height: 184px;
          transform: translateX(-50%);
          animation: cfspCraftFloat 4.4s ease-in-out infinite;
        }

        .cfsp-craft-top {
          position: absolute;
          left: 50%;
          top: 0;
          transform: translateX(-50%);
          width: 160px;
          height: 82px;
          border-radius: 90px 90px 40px 40px;
          background:
            linear-gradient(90deg, #3ef2df 0%, #1bc6c4 26%, #f1a13b 62%, #b6d937 100%);
          border: 4px solid #ffd043;
          box-shadow:
            0 0 24px rgba(255, 191, 72, 0.34),
            0 0 50px rgba(36, 217, 212, 0.2);
        }

        .cfsp-craft-body {
          position: absolute;
          left: 50%;
          bottom: 8px;
          transform: translateX(-50%);
          width: 215px;
          height: 112px;
          border-radius: 32px;
          background:
            linear-gradient(135deg, rgba(28, 192, 191, 0.95), rgba(8, 127, 127, 0.96));
          border: 5px solid #f4b346;
          box-shadow:
            0 0 26px rgba(255, 179, 71, 0.28),
            inset 0 0 0 3px rgba(123, 255, 245, 0.18);
        }

        .cfsp-craft-body::before,
        .cfsp-craft-body::after {
          content: "";
          position: absolute;
          top: 14px;
          bottom: 14px;
          width: 8px;
          border-radius: 999px;
          background: rgba(240, 178, 87, 0.95);
        }

        .cfsp-craft-body::before {
          left: 28px;
        }

        .cfsp-craft-body::after {
          right: 28px;
        }

        .cfsp-craft-latch {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -42%);
          width: 52px;
          height: 52px;
          border-radius: 999px;
          background: radial-gradient(circle, #ffcb47 0%, #ef9b1d 65%, #b96500 100%);
          box-shadow:
            0 0 20px rgba(255, 199, 72, 0.65),
            0 0 0 6px rgba(255,255,255,0.75);
        }

        .cfsp-craft-latch::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 18px;
          height: 7px;
          border-radius: 999px;
          background: #7a4200;
        }

        .cfsp-craft-latch::after {
          content: "";
          position: absolute;
          left: 50%;
          top: calc(50% + 12px);
          transform: translateX(-50%);
          width: 20px;
          height: 12px;
          border-left: 4px solid #d48b17;
          border-right: 4px solid #d48b17;
          border-top: 4px solid transparent;
          border-bottom: 4px solid transparent;
          clip-path: polygon(0 0, 100% 0, 75% 100%, 25% 100%);
        }

        .cfsp-beam-caption {
          margin: 2px auto 14px;
          width: min(100%, 386px);
          padding: 10px 16px;
          border-radius: 999px;
          text-align: center;
          font-size: 0.92rem;
          font-weight: 900;
          letter-spacing: 0.05em;
          color: #8ffff0;
          background: rgba(5, 82, 88, 0.72);
          border: 2px solid rgba(55, 241, 217, 0.5);
          box-shadow: 0 0 24px rgba(23, 217, 198, 0.14);
          pointer-events: none;
        }

        .cfsp-floating-links {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          width: min(100%, 418px);
          pointer-events: auto;
        }

        .cfsp-floating-link {
          display: flex;
          align-items: center;
          gap: 12px;
          min-height: 78px;
          padding: 18px 18px;
          border-radius: 18px;
          border: 2px solid rgba(36, 223, 205, 0.48);
          background:
            linear-gradient(180deg, rgba(4, 67, 74, 0.78), rgba(2, 48, 56, 0.88));
          color: #e3fffb;
          font-size: 1.08rem;
          font-weight: 800;
          text-align: left;
          box-shadow:
            0 10px 24px rgba(3, 22, 29, 0.28),
            inset 0 0 0 1px rgba(83, 255, 234, 0.07);
          cursor: pointer;
          transition:
            transform 0.18s ease,
            box-shadow 0.18s ease,
            border-color 0.18s ease;
        }

        .cfsp-floating-link:hover {
          transform: translateY(-2px);
          border-color: rgba(92, 255, 239, 0.9);
          box-shadow:
            0 12px 28px rgba(3, 22, 29, 0.34),
            0 0 22px rgba(37, 224, 206, 0.18);
        }

        .cfsp-link-dot {
          flex: 0 0 auto;
          width: 24px;
          height: 24px;
          border-radius: 8px;
          background: linear-gradient(180deg, rgba(13, 151, 163, 0.95), rgba(11, 96, 118, 0.95));
          border: 1px solid rgba(126, 255, 243, 0.55);
          box-shadow: 0 0 12px rgba(63, 246, 226, 0.28);
        }

        @keyframes cfspCraftFloat {
          0%, 100% { transform: translateX(-50%) translateY(0px); }
          50% { transform: translateX(-50%) translateY(-7px); }
        }

        @keyframes cfspBeamPulse {
          0%, 100% { opacity: 0.72; }
          50% { opacity: 1; }
        }

        @keyframes cfspOrbitSpin {
          from { transform: translateX(-50%) rotate(0deg); }
          to { transform: translateX(-50%) rotate(360deg); }
        }

        @keyframes cfspScrollFloatLeft {
          0%, 100% { transform: rotate(-12deg) translateY(0px); }
          50% { transform: rotate(-7deg) translateY(-10px); }
        }

        @keyframes cfspScrollFloatRight {
          0%, 100% { transform: rotate(12deg) translateY(0px); }
          50% { transform: rotate(7deg) translateY(-10px); }
        }

        @media (max-width: 1200px) {
          .cfsp-chest-portal {
            top: 140px;
            right: 12px;
            width: 360px;
          }

          .cfsp-chest-name {
            font-size: 1.72rem;
          }

          .cfsp-chest-scene {
            height: 262px;
          }

          .cfsp-beam {
            width: 240px;
          }

          .cfsp-floating-link {
            min-height: 70px;
            padding: 16px 14px;
            font-size: 0.98rem;
          }
        }

        @media (max-width: 860px) {
          .cfsp-chest-portal {
            right: 10px;
            top: 120px;
            width: min(92vw, 340px);
          }

          .cfsp-floating-links {
            grid-template-columns: 1fr;
          }

          .cfsp-scroll-left {
            left: 48px;
          }

          .cfsp-scroll-right {
            right: 48px;
          }
        }
      `}</style>
    </>
  );
}
