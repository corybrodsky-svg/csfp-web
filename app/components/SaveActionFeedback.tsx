import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";

export type ActionFeedbackState = "idle" | "saving" | "saved" | "error";

type FeedbackStatus = {
  state: ActionFeedbackState;
  message: string;
  details?: string;
  savedAt?: string | null;
};

type UseActionFeedbackOptions = {
  autoHideMs?: number;
  autoHideErrorMs?: number;
};

export function useActionFeedback(options: UseActionFeedbackOptions = {}) {
  const autoHideMs = options.autoHideMs ?? 3000;
  const autoHideErrorMs = options.autoHideErrorMs ?? 4200;

  const [status, setStatus] = useState<FeedbackStatus>({
    state: "idle",
    message: "",
    details: "",
    savedAt: null,
  });

  const clearTimerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (clearTimerRef.current !== null) {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  const setIdle = useCallback(() => {
    clearTimer();
    setStatus({ state: "idle", message: "", details: "", savedAt: status.savedAt });
  }, [clearTimer, status.savedAt]);

  const begin = useCallback(() => {
    clearTimer();
    setStatus((current) => ({
      ...current,
      state: "saving",
      message: "",
      details: "",
    }));
  }, [clearTimer]);

  const done = useCallback(
    (message?: string) => {
      clearTimer();
      const now = new Date();
      setStatus({
        state: "saved",
        message: message || "Saved",
        details: "",
        savedAt: now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      });

      clearTimerRef.current = window.setTimeout(() => {
        setStatus((current) => ({ ...current, state: current.state === "saved" ? "idle" : current.state }));
      }, autoHideMs);
    },
    [autoHideMs, clearTimer]
  );

  const fail = useCallback(
    (details: string) => {
      clearTimer();
      setStatus((current) => ({
        ...current,
        state: "error",
        message: current.message,
        details,
      }));
      clearTimerRef.current = window.setTimeout(() => {
        setStatus((current) => ({ ...current, state: current.state === "error" ? "idle" : current.state }));
      }, autoHideErrorMs);
    },
    [autoHideErrorMs, clearTimer]
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  return { status, setIdle, begin, done, fail, setSavedMessage: done };
}

const feedbackBase: CSSProperties = {
  padding: "8px 12px",
  borderRadius: "10px",
  fontSize: "13px",
  fontWeight: 800,
  marginTop: "8px",
  border: "1px solid",
} as const;

const stateStyles: Record<ActionFeedbackState, React.CSSProperties> = {
  idle: { display: "none" },
  saving: { borderColor: "#93c5fd", background: "#eff6ff", color: "#1d4ed8" },
  saved: { borderColor: "#86efac", background: "#ecfdf3", color: "#166534" },
  error: { borderColor: "#fca5a5", background: "#fef2f2", color: "#b91c1c" },
};

export function ActionFeedback({
  feedback,
  successPrefix = "Saved",
}: {
  feedback: FeedbackStatus;
  successPrefix?: string;
}) {
  if (feedback.state === "idle") return null;

  const text =
    feedback.state === "saved"
      ? `${feedback.message || successPrefix}${feedback.savedAt ? ` at ${feedback.savedAt}` : ""}`
      : feedback.state === "error"
        ? feedback.details || "Could not complete request."
        : feedback.state === "saving"
          ? "Saving..."
          : "";

  return <div style={{ ...feedbackBase, ...stateStyles[feedback.state] }}>{text}</div>;
}
