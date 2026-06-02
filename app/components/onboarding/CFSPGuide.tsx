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

type GuideApiBody = {
  ok?: boolean;
  state?: GuideState;
  error?: string;
  message?: string;
  status?: number;
  diagnostics?: {
    route?: string;
    status?: number;
  };
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
  return (await response.json().catch(() => null)) as GuideApiBody | null;
}

function emptyGuideState(guideKey: CFSPGuideKey): GuideState {
  return {
    guide_key: guideKey,
    completed_steps: [],
    dismissed_at: null,
    last_opened_at: null,
  };
}

function localDismissedKey(guideKey: CFSPGuideKey) {
  return `cfsp:guide:dismissed:v1:${guideKey}`;
}

function localCompletedKey(guideKey: CFSPGuideKey) {
  return `cfsp:guide:completed:v1:${guideKey}`;
}

function readLocalCompletedSteps(guideKey: CFSPGuideKey) {
  if (typeof window === "undefined") return [] as string[];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(localCompletedKey(guideKey)) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.map(asText).filter(Boolean)));
  } catch {
    return [];
  }
}

function writeLocalCompletedSteps(guideKey: CFSPGuideKey, steps: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(localCompletedKey(guideKey), JSON.stringify(Array.from(new Set(steps.map(asText).filter(Boolean)))));
  } catch {
    // Local guide progress is best effort.
  }
}

function readLocalDismissed(guideKey: CFSPGuideKey) {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(localDismissedKey(guideKey)) === "yes";
  } catch {
    return false;
  }
}

function writeLocalDismissed(guideKey: CFSPGuideKey, dismissed: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (dismissed) window.localStorage.setItem(localDismissedKey(guideKey), "yes");
    else window.localStorage.removeItem(localDismissedKey(guideKey));
  } catch {
    // Local guide dismissal is best effort.
  }
}

function mergeLocalGuideState(state: GuideState, guideKey: CFSPGuideKey) {
  const localCompleted = readLocalCompletedSteps(guideKey);
  const completed_steps = Array.from(new Set([...state.completed_steps, ...localCompleted]));
  return {
    ...state,
    completed_steps,
    dismissed_at: state.dismissed_at || (readLocalDismissed(guideKey) ? new Date(0).toISOString() : null),
  };
}

function getGuideApiMessage(body: GuideApiBody | null, response?: Response | null) {
  const route = asText(body?.diagnostics?.route) || "/api/onboarding/guide-state";
  const status = body?.diagnostics?.status || body?.status || response?.status || 0;
  const message = asText(body?.message || body?.error) || "Guide progress is temporarily unavailable.";
  return status ? `${message} (${route} ${status})` : message;
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
  const isEventCommandCenterPage = useMemo(
    () => /^\/events\/[^/]+(?:\/)?$/.test(asText(props.pathname)),
    [props.pathname]
  );
  const [state, setState] = useState<GuideState | null>(null);
  const [open, setOpen] = useState(false);
  const [savingStepId, setSavingStepId] = useState("");
  const [message, setMessage] = useState("");
  const [serverStorageAvailable, setServerStorageAvailable] = useState(true);

  useEffect(() => {
    if (!props.authenticated || !guideKey) return;
    let cancelled = false;
    const activeGuideKey = guideKey;

    async function loadState() {
      setMessage("");
      const localState = mergeLocalGuideState(emptyGuideState(activeGuideKey), activeGuideKey);
      const response = await fetch(`/api/onboarding/guide-state?guideKey=${encodeURIComponent(activeGuideKey)}`, {
        cache: "no-store",
        credentials: "include",
      }).catch(() => null);
      if (!response) {
        if (!cancelled) {
          setServerStorageAvailable(false);
          setState(localState);
          setMessage("Guide progress is saved locally until server storage is available.");
        }
        return;
      }
      const body = await parseGuideResponse(response);
      if (cancelled) return;
      if (!response.ok || !body?.ok || !body.state) {
        setServerStorageAvailable(false);
        setState(localState);
        setMessage(
          body?.error === "migration_required"
            ? "Guide progress is saved locally until server storage is available."
            : getGuideApiMessage(body, response)
        );
        return;
      }
      setServerStorageAvailable(true);
      const mergedState = mergeLocalGuideState(body.state, activeGuideKey);
      setState(mergedState);

      const shouldAutoOpen =
        (activeGuideKey === "admin_first_run" || activeGuideKey === "sp_portal_first_run") &&
        !mergedState.dismissed_at &&
        !mergedState.last_opened_at &&
        mergedState.completed_steps.length === 0 &&
        !readLocalDismissed(activeGuideKey) &&
        readLocalCompletedSteps(activeGuideKey).length === 0;
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
    if (!guideKey) return false;
    setMessage("");
    const response = await fetch("/api/onboarding/guide-state", {
      method: "PATCH",
      cache: "no-store",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guideKey, action, stepId }),
    }).catch(() => null);
    if (!response) {
      setServerStorageAvailable(false);
      setMessage("Guide progress is saved locally until server storage is available.");
      return false;
    }
    const body = await parseGuideResponse(response);
    if (!response.ok || !body?.ok || !body.state) {
      setServerStorageAvailable(false);
      setMessage(
        body?.error === "migration_required"
          ? "Guide progress is saved locally until server storage is available."
          : getGuideApiMessage(body, response)
      );
      return false;
    }
    setServerStorageAvailable(true);
    setState(mergeLocalGuideState(body.state, guideKey));
    return true;
  }

  async function toggleStep(stepId: string, completed: boolean) {
    if (!guideKey) return;
    const currentCompleted = state?.completed_steps || [];
    const nextCompleted = completed
      ? currentCompleted.filter((item) => item !== stepId)
      : Array.from(new Set([...currentCompleted, stepId]));
    writeLocalCompletedSteps(guideKey, nextCompleted);
    setState((current) => ({
      ...(current || emptyGuideState(guideKey)),
      completed_steps: nextCompleted,
    }));
    setSavingStepId(stepId);
    await saveGuideAction(completed ? "uncomplete_step" : "complete_step", stepId);
    setSavingStepId("");
  }

  function closeGuide() {
    if (guideKey) writeLocalDismissed(guideKey, true);
    setOpen(false);
  }

  async function dismissGuide() {
    if (guideKey) {
      writeLocalDismissed(guideKey, true);
      setState((current) => ({
        ...(current || emptyGuideState(guideKey)),
        dismissed_at: current?.dismissed_at || new Date().toISOString(),
      }));
    }
    await saveGuideAction("dismiss");
    setOpen(false);
  }

  async function resetGuide() {
    if (guideKey) {
      writeLocalDismissed(guideKey, false);
      writeLocalCompletedSteps(guideKey, []);
      setState(emptyGuideState(guideKey));
    }
    await saveGuideAction("reset");
  }

  const completedSteps = state?.completed_steps || [];
  const dismissed = Boolean(state?.dismissed_at);
  const floatingButtonClassName = isEventCommandCenterPage ? "cfsp-btn cfsp-btn-secondary" : "cfsp-btn cfsp-btn-primary";
  const floatingButtonStyle = isEventCommandCenterPage
    ? {
        position: "fixed" as const,
        left: 16,
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        zIndex: 42,
        width: 44,
        height: 44,
        minWidth: 44,
        padding: 0,
        borderRadius: 999,
        boxShadow: "0 12px 24px rgba(15, 23, 42, 0.16)",
      }
    : {
        position: "fixed" as const,
        right: 18,
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        zIndex: 50,
        boxShadow: "0 14px 34px rgba(20, 91, 150, 0.22)",
      };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={floatingButtonClassName}
        style={floatingButtonStyle}
        title="Open CFSP Guide"
        aria-label="Open CFSP Guide"
      >
        {isEventCommandCenterPage ? <span aria-hidden="true" style={{ fontSize: 18, fontWeight: 900 }}>?</span> : "CFSP Guide"}
        {isEventCommandCenterPage ? <span className="sr-only">CFSP Guide</span> : null}
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
            onClick={closeGuide}
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
              <button type="button" className="cfsp-btn cfsp-btn-secondary" onClick={closeGuide}>
                Close
              </button>
            </div>

            <div className="mt-4 rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
              <div className="text-sm font-black text-[#14304f]">{getProgressLabel(guide, completedSteps)}</div>
              <div className="mt-1 text-xs font-semibold text-[#5e7388]">
                {dismissed ? "Hidden for now. Reopen the guide any time from this button." : "Mark steps done as you go."}
              </div>
            </div>

            {message ? <div className="cfsp-alert cfsp-alert-error mt-4">{message} Core pages remain available.</div> : null}
            {!serverStorageAvailable && !message ? (
              <div className="cfsp-alert cfsp-alert-info mt-4">Guide progress is saved locally until server storage is available.</div>
            ) : null}

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
                          <Link href={step.href} className="cfsp-btn cfsp-btn-secondary mt-3 inline-flex" onClick={closeGuide}>
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
              <button type="button" className="cfsp-btn cfsp-btn-primary" onClick={closeGuide}>
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
