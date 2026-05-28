"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getCFSPGuide,
  selectCFSPGuideKey,
  type CFSPGuideDefinition,
  type CFSPGuideKey,
} from "../../lib/cfspGuide";

type GuideState = {
  guide_key: CFSPGuideKey;
  completed_steps: string[];
  dismissed_at: string | null;
  last_opened_at: string | null;
};

type CFSPGuideProps = {
  pathname: string;
  role?: string | null;
  legacyRole?: string | null;
  organizationRole?: string | null;
  authenticated?: boolean;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getProgressLabel(guide: CFSPGuideDefinition, completedSteps: string[]) {
  const total = guide.steps.length;
  const completed = guide.steps.filter((step) => completedSteps.includes(step.id)).length;
  return `${completed}/${total} done`;
}

async function parseGuideResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  return (await response.json().catch(() => null)) as { ok?: boolean; state?: GuideState } | null;
}

export default function CFSPGuide(props: CFSPGuideProps) {
  const guideKey = useMemo(
    () =>
      selectCFSPGuideKey({
        pathname: props.pathname,
        role: props.role,
        legacyRole: props.legacyRole,
        organizationRole: props.organizationRole,
      }),
    [props.legacyRole, props.organizationRole, props.pathname, props.role]
  );
  const guide = useMemo(() => getCFSPGuide(guideKey), [guideKey]);
  const [state, setState] = useState<GuideState | null>(null);
  const [open, setOpen] = useState(false);
  const [savingStepId, setSavingStepId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!props.authenticated || !guideKey) return;
    let cancelled = false;
    const activeGuideKey = guideKey;

    async function loadState() {
      setMessage("");
      const response = await fetch(`/api/onboarding/guide-state?guideKey=${encodeURIComponent(activeGuideKey)}`, {
        cache: "no-store",
        credentials: "include",
      }).catch(() => null);
      if (!response) {
        if (!cancelled) setMessage("Guide progress is temporarily unavailable.");
        return;
      }
      const body = await parseGuideResponse(response);
      if (cancelled) return;
      if (!response.ok || !body?.ok || !body.state) {
        setMessage("Guide progress is temporarily unavailable.");
        return;
      }
      setState(body.state);

      const shouldAutoOpen =
        (activeGuideKey === "admin_first_run" || activeGuideKey === "sp_portal_first_run") &&
        !body.state.dismissed_at &&
        !body.state.last_opened_at &&
        body.state.completed_steps.length === 0;
      if (shouldAutoOpen) setOpen(true);
    }

    void loadState();
    return () => {
      cancelled = true;
    };
  }, [guideKey, props.authenticated]);

  useEffect(() => {
    if (!open || !guideKey) return;
    void saveGuideAction("open");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, guideKey]);

  if (!props.authenticated || !guideKey || !guide) return null;

  async function saveGuideAction(action: string, stepId?: string) {
    if (!guideKey) return;
    setMessage("");
    const response = await fetch("/api/onboarding/guide-state", {
      method: "PATCH",
      cache: "no-store",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guideKey, action, stepId }),
    }).catch(() => null);
    if (!response) {
      setMessage("Could not save guide progress.");
      return;
    }
    const body = await parseGuideResponse(response);
    if (!response.ok || !body?.ok || !body.state) {
      setMessage("Could not save guide progress.");
      return;
    }
    setState(body.state);
  }

  async function toggleStep(stepId: string, completed: boolean) {
    setSavingStepId(stepId);
    await saveGuideAction(completed ? "uncomplete_step" : "complete_step", stepId);
    setSavingStepId("");
  }

  async function dismissGuide() {
    await saveGuideAction("dismiss");
    setOpen(false);
  }

  async function resetGuide() {
    await saveGuideAction("reset");
  }

  const completedSteps = state?.completed_steps || [];
  const dismissed = Boolean(state?.dismissed_at);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cfsp-btn cfsp-btn-primary"
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 50,
          boxShadow: "0 14px 34px rgba(20, 91, 150, 0.22)",
        }}
      >
        CFSP Guide
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={guide.title}
          className="fixed inset-0 z-[70] flex justify-end"
          style={{ background: "rgba(11, 31, 51, 0.32)" }}
        >
          <button
            type="button"
            aria-label="Close guide"
            className="absolute inset-0 cursor-default border-0 bg-transparent"
            onClick={() => setOpen(false)}
          />
          <aside
            className="relative h-full w-full max-w-[420px] overflow-y-auto bg-white px-5 py-5 shadow-2xl"
            style={{ color: "var(--cfsp-text)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="cfsp-label">Setup help</div>
                <h2 className="mt-2 mb-0 text-[1.35rem] font-black text-[#14304f]">{guide.title}</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#5e7388]">{guide.description}</p>
              </div>
              <button type="button" className="cfsp-btn cfsp-btn-secondary" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>

            <div className="mt-4 rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
              <div className="text-sm font-black text-[#14304f]">{getProgressLabel(guide, completedSteps)}</div>
              <div className="mt-1 text-xs font-semibold text-[#5e7388]">
                {dismissed ? "Dismissed for now. You can still use the guide any time." : "Mark steps done as you go."}
              </div>
            </div>

            {message ? <div className="cfsp-alert cfsp-alert-error mt-4">{message}</div> : null}

            <div className="mt-4 grid gap-3">
              {guide.steps.map((step) => {
                const completed = completedSteps.includes(step.id);
                const saving = savingStepId === step.id;
                return (
                  <div key={step.id} className="rounded-[12px] border border-[#dce6ee] bg-white px-4 py-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={completed}
                        disabled={saving}
                        onChange={() => void toggleStep(step.id, completed)}
                        className="mt-1 h-4 w-4"
                        aria-label={completed ? `Mark ${step.title} not done` : `Mark ${step.title} done`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black text-[#14304f]">{step.title}</div>
                        <div className="mt-1 text-sm font-semibold leading-5 text-[#5e7388]">{step.description}</div>
                        {step.pageHint ? (
                          <div className="mt-2 text-xs font-bold text-[#165a96]">Look for: {step.pageHint}</div>
                        ) : null}
                        {step.href ? (
                          <Link href={step.href} className="cfsp-btn cfsp-btn-secondary mt-3 inline-flex" onClick={() => setOpen(false)}>
                            {asText(step.ctaLabel) || "Go"}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className="cfsp-btn cfsp-btn-primary" onClick={() => setOpen(false)}>
                Done
              </button>
              <button type="button" className="cfsp-btn cfsp-btn-secondary" onClick={() => void dismissGuide()}>
                Dismiss
              </button>
              <button type="button" className="cfsp-btn cfsp-btn-secondary" onClick={() => void resetGuide()}>
                Reset
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
