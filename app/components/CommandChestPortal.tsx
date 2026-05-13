"use client";

import { useEffect, useState } from "react";
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

type TextFindOptions = {
  selector?: string;
  requireAll?: string[];
};

function isHTMLElement(node: Element | null | undefined): node is HTMLElement {
  return node instanceof HTMLElement;
}

function isCommandCenterNode(node: HTMLElement) {
  return Boolean(
    node.closest(".cfsp-holo-command-center") ||
      node.closest(".cfsp-command-center-field") ||
      node.closest(".cfsp-core-wrap") ||
      node.closest("[data-cfsp-command-orb='true']")
  );
}

function findByText(patterns: string[], options: TextFindOptions = {}) {
  const selector =
    options.selector ||
    "h1, h2, h3, h4, summary, section, article, div, button, a";

  const wantedPatterns = patterns.map(normalizeText).filter(Boolean);
  const requiredPatterns = (options.requireAll || []).map(normalizeText).filter(Boolean);

  const nodes = Array.from(document.querySelectorAll(selector))
    .filter(isHTMLElement)
    .filter((node) => !isCommandCenterNode(node));

  const matches = nodes.filter((node) => {
    const text = normalizeText(node.textContent || "");

    const matchesWanted =
      wantedPatterns.length === 0 ||
      wantedPatterns.some((pattern) => text.includes(pattern));

    const matchesRequired = requiredPatterns.every((pattern) => text.includes(pattern));

    return matchesWanted && matchesRequired;
  });

  matches.sort((a, b) => {
    const aText = normalizeText(a.textContent || "");
    const bText = normalizeText(b.textContent || "");

    const aHeading = /^H[1-4]$/.test(a.tagName) || a.tagName === "SUMMARY" ? 0 : 1;
    const bHeading = /^H[1-4]$/.test(b.tagName) || b.tagName === "SUMMARY" ? 0 : 1;

    const aExact = wantedPatterns.some((pattern) => aText === pattern) ? 0 : 1;
    const bExact = wantedPatterns.some((pattern) => bText === pattern) ? 0 : 1;

    return aExact - bExact || aHeading - bHeading || aText.length - bText.length;
  });

  return matches[0];
}

function scrollElement(element: HTMLElement | null | undefined) {
  if (!element) return false;

  element.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

function scrollToSelectors(selectors: string[]) {
  for (const selector of selectors) {
    const target = document.querySelector(selector);

    if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return true;
    }
  }

  return false;
}

function scrollToMaterialsCabinet() {
  return (
    scrollToSelectors([
      "#simulation-command-file-cabinet",
      "[data-command-chest-target='materials']",
      "[data-section='file-cabinet']",
    ]) ||
    scrollElement(
      findByText(["simulation command file cabinet"], {
        selector: "h1, h2, h3, h4, summary, section, article, div",
      })
    )
  );
}

function scrollToTrainingPrep() {
  return (
    scrollToSelectors([
      "#training-prep",
      "#training-and-prep",
      "#training-center",
      "[data-command-chest-target='training']",
      "[data-section='training']",
    ]) ||
    scrollElement(
      findByText(["training & prep"], {
        selector: "h1, h2, h3, h4, summary",
      })
    ) ||
    scrollElement(
      findByText(["training overview"], {
        selector: "h1, h2, h3, h4, section, article, div",
      })
    ) ||
    scrollElement(
      findByText(["training completed"], {
        selector: "section, article, div",
        requireAll: ["training data embedded"],
      })
    )
  );
}

function scrollToCommunicationHub() {
  return (
    scrollToSelectors([
      "#communication-center",
      "#communication-hub",
      "#communication",
      "[data-command-chest-target='communication']",
      "[data-section='communication']",
    ]) ||
    scrollElement(
      findByText(["communication"], {
        selector: "h1, h2, h3, h4, summary",
      })
    ) ||
    scrollElement(
      findByText(["draft event emails"], {
        selector: "section, article, div",
        requireAll: ["communication"],
      })
    )
  );
}

function scrollToStaffing() {
  return (
    scrollToSelectors([
      "#selected-sps",
      "#coverage-actions",
      "[data-command-chest-target='staffing']",
      "[data-section='staffing']",
    ]) ||
    scrollElement(
      findByText(["selected sps"], {
        selector: "h1, h2, h3, h4, section, article, div",
      })
    ) ||
    scrollElement(
      findByText(["coverage actions"], {
        selector: "h1, h2, h3, h4, summary, section, article, div",
      })
    )
  );
}

function scrollToScheduleFile() {
  const card = document.querySelector(
    "[data-cfsp-schedule-file-card='true'], [data-cfsp-schedule-file-container='true']"
  );

  if (card instanceof HTMLElement) {
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }

  const link = document.querySelector("[data-cfsp-schedule-file-link='true']");
  const linkCard =
    link instanceof HTMLElement
      ? link.closest("[data-cfsp-schedule-file-card='true'], [data-cfsp-schedule-file-container='true']")
      : null;

  if (linkCard instanceof HTMLElement) {
    linkCard.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }

  return (
    scrollElement(
      findByText(["completed schedule file"], {
        selector: "h1, h2, h3, h4, section, article, div",
      })
    ) ||
    scrollElement(
      findByText(["schedule is complete"], {
        selector: "section, article, div",
        requireAll: ["file cabinet"],
      })
    ) ||
    scrollToMaterialsCabinet()
  );
}

function scrollToRecording() {
  return (
    scrollToSelectors([
      "#recording",
      "#recording-status",
      "[data-command-chest-target='recording']",
      "[data-section='recording']",
    ]) ||
    scrollElement(
      findByText(["recording guide"], {
        selector: "h1, h2, h3, h4, section, article, div",
      })
    ) ||
    scrollElement(
      findByText(["recording"], {
        selector: "h1, h2, h3, h4, summary, section, article, div",
      })
    )
  );
}


export default function CommandChestPortal({
  eventId,
  scheduleCompleted = false,
}: CommandChestPortalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const portalRoot = typeof document === "undefined" ? null : document.body;
  const id = String(eventId);

  // CFSP force orb click bridge v20
  useEffect(() => {
    if (typeof document === "undefined") return;

    const orbSelector = '[data-cfsp-command-orb="true"]';

    const isInsideOrb = (event: PointerEvent | MouseEvent) => {
      const orb = document.querySelector(orbSelector) as HTMLElement | null;
      if (!orb) return false;

      const target = event.target;
      if (target instanceof Element && target.closest(orbSelector)) {
        return true;
      }

      const rect = orb.getBoundingClientRect();
      return (
        event.clientX >= rect.left - 12 &&
        event.clientX <= rect.right + 12 &&
        event.clientY >= rect.top - 12 &&
        event.clientY <= rect.bottom + 12
      );
    };

    const stopEvent = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!isInsideOrb(event)) return;
      stopEvent(event);
      setOpen((current) => !current);
    };

    const handleClick = (event: MouseEvent) => {
      if (!isInsideOrb(event)) return;
      stopEvent(event);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("click", handleClick, true);
    };
  }, []);


  if (!portalRoot) return null;

  const toggleOpen = (event?: React.PointerEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    setOpen((current) => !current);
  };

  const openSchedule = () => {
    if (scheduleCompleted) {
      scrollToScheduleFile();
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
      onClick: scrollToMaterialsCabinet,
    },
    {
      key: "training",
      label: "Training",
      glyph: "◈",
      onClick: scrollToTrainingPrep,
    },
    {
      key: "communication",
      label: "Comms",
      glyph: "●",
      onClick: scrollToCommunicationHub,
    },
    {
      key: "staffing",
      label: "Staffing",
      glyph: "✦",
      onClick: scrollToStaffing,
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
      onClick: scrollToRecording,
    },
  ];

  return createPortal(
    <>
      <button
        type="button"
        className={`cfsp-holo-orb ${open ? "cfsp-holo-orb-active" : ""}`}
        data-cfsp-command-orb="true"
        aria-label={open ? "Close CFSP Command Center" : "Open CFSP Command Center"}
        aria-expanded={open}
        onPointerDown={toggleOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((current) => !current);
          }
        }}
      >
        <span className="cfsp-holo-orb-ring cfsp-holo-orb-ring-a" aria-hidden="true" />
        <span className="cfsp-holo-orb-ring cfsp-holo-orb-ring-b" aria-hidden="true" />
        <span className="cfsp-holo-orb-core" aria-hidden="true">
          CFSP
        </span>
        <span className="cfsp-holo-orb-scan" aria-hidden="true" />
      </button>

      {open ? (
        <section className="cfsp-holo-command-center" aria-label="CFSP Command Center">
          <button
            type="button"
            className="cfsp-holo-close"
            aria-label="Close CFSP Command Center"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }}
          >
            ×
          </button>

          <header className="cfsp-holo-title">
            <div>CFSP Command Center</div>
            <strong>Operations Core</strong>
          </header>

          <div className="cfsp-holo-stage" aria-hidden="true">
            <div className="cfsp-holo-beam" />
            <div className="cfsp-holo-beam-core" />

            <div className="cfsp-holo-scroll cfsp-holo-scroll-left">
              <span />
            </div>

            <div className="cfsp-holo-scroll cfsp-holo-scroll-right">
              <span />
            </div>

            <div className="cfsp-holo-craft">
              <div className="cfsp-holo-craft-lid" />
              <div className="cfsp-holo-craft-body">
                <span className="cfsp-holo-craft-mark">CFSP</span>
                <span className="cfsp-holo-craft-latch" />
              </div>
            </div>

            <div className="cfsp-holo-orbit cfsp-holo-orbit-a" />
            <div className="cfsp-holo-orbit cfsp-holo-orbit-b" />
            <div className="cfsp-holo-spark cfsp-holo-spark-a" />
            <div className="cfsp-holo-spark cfsp-holo-spark-b" />
            <div className="cfsp-holo-spark cfsp-holo-spark-c" />
          </div>

          <div className="cfsp-holo-status">New content detected</div>

          <div className="cfsp-holo-actions">
            {actions.map((action) => (
              <button
                key={action.key}
                type="button"
                className="cfsp-holo-action"
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
        .cfsp-core-wrap,
        .cfsp-command-mini-field,
        .cfsp-command-mini-pokeball {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }

        .cfsp-holo-orb {
          position: fixed !important;
          top: 50% !important;
          right: 20px !important;
          z-index: 2147483647 !important;
          width: 78px !important;
          height: 78px !important;
          transform: translateY(-50%);
          border: 0;
          border-radius: 999px;
          background: transparent;
          cursor: pointer;
          pointer-events: auto !important;
          filter: drop-shadow(0 18px 28px rgba(15, 91, 120, 0.22));
          touch-action: manipulation;
        }

        .cfsp-holo-orb * {
          pointer-events: none !important;
        }

        .cfsp-holo-orb::before {
          content: "";
          position: absolute;
          inset: 6px;
          border-radius: 999px;
          background:
            radial-gradient(circle at 34% 24%, rgba(255,255,255,0.98), rgba(255,255,255,0.20) 18%, transparent 30%),
            radial-gradient(circle at 50% 50%, rgba(20,184,166,0.30), transparent 58%),
            linear-gradient(135deg, rgba(236,253,245,0.78), rgba(20,184,166,0.18));
          border: 1px solid rgba(45, 212, 191, 0.52);
          box-shadow:
            0 0 22px rgba(45, 212, 191, 0.28),
            inset 0 0 18px rgba(255,255,255,0.48);
        }

        .cfsp-holo-orb-active::before,
        .cfsp-holo-orb:hover::before {
          box-shadow:
            0 0 30px rgba(45, 212, 191, 0.36),
            0 0 18px rgba(251, 146, 60, 0.18),
            inset 0 0 22px rgba(255,255,255,0.58);
        }

        .cfsp-holo-orb-ring {
          position: absolute;
          left: 50%;
          top: 50%;
          border-radius: 999px;
          border: 1px solid rgba(45, 212, 191, 0.50);
        }

        .cfsp-holo-orb-ring-a {
          width: 78px;
          height: 34px;
          transform: translate(-50%, -50%) rotate(16deg);
          animation: cfspHoloOrbRingA 8s linear infinite;
        }

        .cfsp-holo-orb-ring-b {
          width: 68px;
          height: 28px;
          transform: translate(-50%, -50%) rotate(-22deg);
          animation: cfspHoloOrbRingB 7s linear infinite reverse;
        }

        .cfsp-holo-orb-core {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 44px;
          height: 44px;
          transform: translate(-50%, -50%);
          display: grid;
          place-items: center;
          border-radius: 16px;
          background:
            linear-gradient(135deg, #14b8a6 0%, #0f9488 58%, #11806f 100%);
          border: 2px solid rgba(251,146,60,0.72);
          color: rgba(236,253,245,0.94);
          font-size: 0.46rem;
          font-weight: 950;
          letter-spacing: 0.10em;
          box-shadow:
            inset 0 0 0 3px rgba(255,255,255,0.24),
            0 0 18px rgba(20,184,166,0.30);
        }

        .cfsp-holo-orb-core::before {
          content: "";
          position: absolute;
          left: 7px;
          right: 7px;
          top: -8px;
          height: 18px;
          border-radius: 15px 15px 8px 8px;
          background: linear-gradient(90deg, #14b8a6, #fb923c, #84cc16);
          border: 2px solid rgba(251,146,60,0.64);
          transform-origin: bottom center;
          animation: cfspHoloCoreLid 5.6s ease-in-out infinite;
        }

        .cfsp-holo-orb-scan {
          position: absolute;
          inset: 10px;
          border-radius: 999px;
          background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.55) 48%, transparent 56%);
          opacity: 0.50;
          animation: cfspHoloScan 4.2s ease-in-out infinite;
        }

        .cfsp-holo-command-center {
          position: fixed !important;
          top: 110px !important;
          right: 96px !important;
          z-index: 2147483646 !important;
          width: min(320px, calc(100vw - 116px));
          background: transparent !important;
          border: 0 !important;
          box-shadow: none !important;
          color: #d9fffb;
          pointer-events: none;
        }

        .cfsp-holo-close {
          position: absolute;
          top: 2px;
          right: 0;
          z-index: 20;
          width: 32px;
          height: 32px;
          border-radius: 999px;
          border: 1px solid rgba(45,212,191,0.46);
          background: rgba(6,78,82,0.72);
          color: #a7fff5;
          font-size: 22px;
          line-height: 1;
          cursor: pointer;
          pointer-events: auto !important;
          box-shadow: 0 0 16px rgba(45,212,191,0.16);
        }

        .cfsp-holo-title {
          text-align: center;
          pointer-events: none;
          text-shadow:
            0 0 18px rgba(45,212,191,0.36),
            0 3px 12px rgba(2,8,23,0.48);
        }

        .cfsp-holo-title div {
          color: #5ff4e8;
          font-size: 0.65rem;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.14em;
        }

        .cfsp-holo-title strong {
          display: block;
          color: #d9fffb;
          font-size: 1.18rem;
          line-height: 1;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .cfsp-holo-stage {
          position: relative;
          height: 234px;
          pointer-events: none;
        }

        .cfsp-holo-beam {
          position: absolute;
          left: 50%;
          top: 42px;
          width: 242px;
          height: 210px;
          transform: translateX(-50%);
          clip-path: polygon(42% 0%, 58% 0%, 98% 100%, 2% 100%);
          background:
            linear-gradient(
              180deg,
              rgba(63,246,226,0.18) 0%,
              rgba(36,220,199,0.24) 30%,
              rgba(28,197,186,0.14) 62%,
              rgba(0,0,0,0) 100%
            );
          filter: blur(1px);
          animation: cfspHoloBeamPulse 3.4s ease-in-out infinite;
        }

        .cfsp-holo-beam-core {
          position: absolute;
          left: 50%;
          top: 72px;
          width: 180px;
          height: 160px;
          transform: translateX(-50%);
          clip-path: polygon(45% 0%, 55% 0%, 86% 100%, 14% 100%);
          background: radial-gradient(circle at 50% 0%, rgba(255,201,75,0.26), rgba(0,0,0,0) 72%);
          filter: blur(10px);
        }

        .cfsp-holo-orbit {
          position: absolute;
          left: 50%;
          bottom: 16px;
          transform: translateX(-50%);
          border-radius: 50%;
          border: 1px solid rgba(45,212,191,0.32);
          box-shadow:
            0 0 22px rgba(45,212,191,0.16),
            inset 0 0 20px rgba(45,212,191,0.08);
        }

        .cfsp-holo-orbit-a {
          width: 226px;
          height: 48px;
          animation: cfspHoloOrbitA 10s linear infinite;
        }

        .cfsp-holo-orbit-b {
          width: 156px;
          height: 31px;
          bottom: 27px;
          opacity: 0.74;
          animation: cfspHoloOrbitB 8s linear infinite reverse;
        }

        .cfsp-holo-scroll {
          position: absolute;
          top: 84px;
          width: 48px;
          height: 104px;
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

        .cfsp-holo-scroll-left {
          left: 32px;
          transform: rotate(-12deg);
          animation: cfspHoloScrollLeft 6.8s ease-in-out infinite;
        }

        .cfsp-holo-scroll-right {
          right: 32px;
          transform: rotate(12deg);
          animation: cfspHoloScrollRight 7.2s ease-in-out infinite;
        }

        .cfsp-holo-craft {
          position: absolute;
          left: 50%;
          top: 58px;
          width: 182px;
          height: 132px;
          transform: translateX(-50%);
          animation: cfspHoloCraftFloat 4.4s ease-in-out infinite;
        }

        .cfsp-holo-craft-lid {
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
          animation: cfspHoloCraftLid 5.4s ease-in-out infinite;
        }

        .cfsp-holo-craft-body {
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

        .cfsp-holo-craft-body::before,
        .cfsp-holo-craft-body::after {
          content: "";
          position: absolute;
          top: 12px;
          bottom: 12px;
          width: 6px;
          border-radius: 999px;
          background: rgba(240,178,87,0.95);
        }

        .cfsp-holo-craft-body::before {
          left: 22px;
        }

        .cfsp-holo-craft-body::after {
          right: 22px;
        }

        .cfsp-holo-craft-mark {
          position: absolute;
          left: 50%;
          bottom: 10px;
          transform: translateX(-50%);
          color: rgba(236,253,245,0.82);
          font-size: 0.54rem;
          font-weight: 950;
          letter-spacing: 0.14em;
        }

        .cfsp-holo-craft-latch {
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

        .cfsp-holo-craft-latch::before {
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

        .cfsp-holo-spark {
          position: absolute;
          width: 5px;
          height: 5px;
          border-radius: 999px;
          background: #a7fff5;
          box-shadow: 0 0 12px rgba(167,255,245,0.74);
          animation: cfspHoloSpark 4.8s ease-in-out infinite;
        }

        .cfsp-holo-spark-a {
          left: 52px;
          top: 54px;
        }

        .cfsp-holo-spark-b {
          right: 60px;
          top: 60px;
          animation-delay: 1.2s;
        }

        .cfsp-holo-spark-c {
          right: 42px;
          bottom: 44px;
          background: #facc15;
          animation-delay: 2.1s;
        }

        .cfsp-holo-status {
          width: min(100%, 280px);
          margin: -2px auto 10px;
          padding: 7px 10px;
          border-radius: 999px;
          border: 1px solid rgba(45,212,191,0.46);
          background: rgba(5,82,88,0.76);
          color: #9ffcf1;
          text-transform: uppercase;
          letter-spacing: 0.045em;
          font-size: 0.58rem;
          font-weight: 950;
          text-align: center;
          pointer-events: none;
          box-shadow: 0 0 16px rgba(45,212,191,0.14);
        }

        .cfsp-holo-actions {
          pointer-events: auto !important;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .cfsp-holo-action {
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

        .cfsp-holo-action:hover {
          transform: translateY(-1px);
          border-color: rgba(45,212,191,0.72);
          box-shadow:
            0 12px 24px rgba(0,0,0,0.22),
            0 0 20px rgba(45,212,191,0.18);
        }

        .cfsp-holo-action span {
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

        @keyframes cfspHoloOrbRingA {
          from { transform: translate(-50%, -50%) rotate(16deg); }
          to { transform: translate(-50%, -50%) rotate(376deg); }
        }

        @keyframes cfspHoloOrbRingB {
          from { transform: translate(-50%, -50%) rotate(-22deg); }
          to { transform: translate(-50%, -50%) rotate(338deg); }
        }

        @keyframes cfspHoloCoreLid {
          0%, 100% { transform: translateY(0) rotateX(0deg); }
          50% { transform: translateY(-1px) rotateX(8deg); }
        }

        @keyframes cfspHoloScan {
          0%, 100% { opacity: 0.24; transform: translateX(-10px); }
          50% { opacity: 0.66; transform: translateX(10px); }
        }

        @keyframes cfspHoloOrbitA {
          from { transform: translateX(-50%) rotate(0deg); }
          to { transform: translateX(-50%) rotate(360deg); }
        }

        @keyframes cfspHoloOrbitB {
          from { transform: translateX(-50%) rotate(0deg); }
          to { transform: translateX(-50%) rotate(360deg); }
        }

        @keyframes cfspHoloBeamPulse {
          0%, 100% { opacity: 0.70; }
          50% { opacity: 1; }
        }

        @keyframes cfspHoloCraftFloat {
          0%, 100% { transform: translateX(-50%) translateY(0) rotate(-1.2deg); }
          50% { transform: translateX(-50%) translateY(-6px) rotate(1.2deg); }
        }

        @keyframes cfspHoloCraftLid {
          0%, 100% { transform: translateX(-50%) translateY(0) rotateX(0deg); }
          50% { transform: translateX(-50%) translateY(-3px) rotateX(12deg); }
        }

        @keyframes cfspHoloScrollLeft {
          0%, 100% { transform: rotate(-12deg) translateY(0); opacity: 0.62; }
          50% { transform: rotate(-8deg) translateY(-8px); opacity: 0.90; }
        }

        @keyframes cfspHoloScrollRight {
          0%, 100% { transform: rotate(12deg) translateY(0); opacity: 0.62; }
          50% { transform: rotate(8deg) translateY(-8px); opacity: 0.90; }
        }

        @keyframes cfspHoloSpark {
          0%, 100% { opacity: 0.24; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }

        @media (max-width: 780px) {
          .cfsp-holo-command-center {
            top: 98px !important;
            right: 84px !important;
            width: min(280px, calc(100vw - 108px));
          }

          .cfsp-holo-actions {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>,
    portalRoot
  );
}
