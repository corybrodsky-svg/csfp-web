"use client";

import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

export type SimVitalsRole = "sim_ops" | "admin" | "faculty" | "sp" | "system";
export type SimVitalsFeedType =
  | "general_update"
  | "staffing_alert"
  | "faculty_note"
  | "live_issue"
  | "training_update"
  | "system_notice";

export type SimVitalsPost = {
  id: string;
  authorUserId?: string;
  authorName: string;
  authorRole: SimVitalsRole;
  type: SimVitalsFeedType;
  timestampLabel?: string;
  createdAt?: string;
  updatedAt?: string;
  linkedEventId?: string | null;
  linkedEventName?: string;
  body: string;
  tags: string[];
  attachment?: SimVitalsAttachment | null;
  reactionCount: number;
  commentCount: number;
  acknowledgedByViewer?: boolean;
};

export type SimVitalsAttachment = {
  fileName: string;
  path: string;
  url: string;
  mimeType: string;
  size: number;
};

export type SimVitalsComment = {
  id: string;
  postId: string;
  authorUserId?: string;
  authorName: string;
  authorRole: SimVitalsRole;
  body: string;
  createdAt?: string;
  updatedAt?: string;
};

const simVitalsFeedTypeOrder: SimVitalsFeedType[] = [
  "general_update",
  "staffing_alert",
  "faculty_note",
  "live_issue",
  "training_update",
  "system_notice",
];

const simVitalsFeedTypeAppearance: Record<
  SimVitalsFeedType,
  {
    label: string;
    accent: string;
    background: string;
    border: string;
    color: string;
    signal: string;
  }
> = {
  general_update: {
    label: "General Update",
    accent: "var(--cfsp-blue)",
    background: "rgba(73, 168, 255, 0.10)",
    border: "rgba(73, 168, 255, 0.25)",
    color: "var(--cfsp-blue-dark)",
    signal: "Ops",
  },
  staffing_alert: {
    label: "Staffing Alert",
    accent: "var(--cfsp-green)",
    background: "rgba(25, 138, 112, 0.12)",
    border: "rgba(25, 138, 112, 0.30)",
    color: "var(--cfsp-green-dark)",
    signal: "Staffing",
  },
  faculty_note: {
    label: "Faculty Note",
    accent: "#a86411",
    background: "rgba(168, 100, 17, 0.10)",
    border: "rgba(168, 100, 17, 0.27)",
    color: "var(--cfsp-warning)",
    signal: "Faculty",
  },
  live_issue: {
    label: "Live Issue",
    accent: "#af2f26",
    background: "rgba(175, 47, 38, 0.10)",
    border: "rgba(175, 47, 38, 0.30)",
    color: "var(--cfsp-danger)",
    signal: "Live",
  },
  training_update: {
    label: "Training Update",
    accent: "var(--cfsp-green-dark)",
    background: "rgba(15, 118, 110, 0.11)",
    border: "rgba(15, 118, 110, 0.28)",
    color: "var(--cfsp-green-dark)",
    signal: "Training",
  },
  system_notice: {
    label: "System Notice",
    accent: "#475569",
    background: "rgba(71, 85, 105, 0.11)",
    border: "rgba(71, 85, 105, 0.25)",
    color: "var(--cfsp-text-muted)",
    signal: "System",
  },
};

const simVitalsRoleAppearance: Record<
  SimVitalsRole,
  {
    label: string;
    background: string;
    border: string;
    color: string;
    cardBorder: string;
    cardBackground: string;
  }
> = {
  sim_ops: {
    label: "Sim Ops",
    background: "rgba(73, 168, 255, 0.13)",
    border: "rgba(73, 168, 255, 0.32)",
    color: "var(--cfsp-blue-dark)",
    cardBorder: "rgba(73, 168, 255, 0.25)",
    cardBackground: "linear-gradient(180deg, rgba(73, 168, 255, 0.08) 0%, var(--cfsp-surface) 100%)",
  },
  admin: {
    label: "Admin",
    background: "rgba(44, 211, 173, 0.14)",
    border: "rgba(44, 211, 173, 0.32)",
    color: "var(--cfsp-green-dark)",
    cardBorder: "rgba(44, 211, 173, 0.27)",
    cardBackground: "linear-gradient(180deg, rgba(44, 211, 173, 0.09) 0%, var(--cfsp-surface) 100%)",
  },
  faculty: {
    label: "Faculty",
    background: "rgba(168, 100, 17, 0.10)",
    border: "rgba(168, 100, 17, 0.25)",
    color: "var(--cfsp-warning)",
    cardBorder: "rgba(168, 100, 17, 0.23)",
    cardBackground: "linear-gradient(180deg, rgba(168, 100, 17, 0.10) 0%, var(--cfsp-surface) 100%)",
  },
  sp: {
    label: "SP",
    background: "rgba(96, 117, 136, 0.10)",
    border: "rgba(96, 117, 136, 0.24)",
    color: "var(--cfsp-text-muted)",
    cardBorder: "var(--cfsp-border)",
    cardBackground: "linear-gradient(180deg, var(--cfsp-surface-muted) 0%, var(--cfsp-surface) 100%)",
  },
  system: {
    label: "System",
    background: "rgba(71, 85, 105, 0.12)",
    border: "rgba(71, 85, 105, 0.25)",
    color: "var(--cfsp-text-muted)",
    cardBorder: "rgba(71, 85, 105, 0.25)",
    cardBackground: "linear-gradient(180deg, rgba(71, 85, 105, 0.08) 0%, var(--cfsp-surface) 100%)",
  },
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

const SIMVITALS_ATTACHMENT_ACCEPT = ".pdf,.docx,.xlsx,.csv,.png,.jpg,.jpeg";

function formatSimVitalsFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function normalizeSimVitalsAttachment(value: unknown): SimVitalsAttachment | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<SimVitalsAttachment>;
  const fileName = asText(source.fileName);
  const path = asText(source.path);
  const url = asText(source.url);
  if (!fileName || !path || !url) return null;
  return {
    fileName,
    path,
    url,
    mimeType: asText(source.mimeType) || "application/octet-stream",
    size: Math.max(0, Number(source.size) || 0),
  };
}

async function parseSimVitalsApiError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: string; warning?: string } | null;
  return body?.error || body?.warning || `${response.status} ${response.statusText}`;
}

function normalizeSimVitalsPost(value: unknown): SimVitalsPost | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<SimVitalsPost>;
  const type = asText(source.type) as SimVitalsFeedType;
  const authorRole = asText(source.authorRole) as SimVitalsRole;
  if (!simVitalsFeedTypeOrder.includes(type)) return null;
  return {
    id: asText(source.id),
    authorUserId: asText(source.authorUserId),
    authorName: asText(source.authorName) || "CFSP Team",
    authorRole: simVitalsRoleAppearance[authorRole] ? authorRole : "sp",
    type,
    timestampLabel: asText(source.timestampLabel),
    createdAt: asText(source.createdAt),
    updatedAt: asText(source.updatedAt),
    linkedEventId: asText(source.linkedEventId) || null,
    linkedEventName: asText(source.linkedEventName),
    body: asText(source.body),
    tags: Array.isArray(source.tags) ? source.tags.map(asText).filter(Boolean) : [],
    attachment: normalizeSimVitalsAttachment(source.attachment),
    reactionCount: Number(source.reactionCount) || 0,
    commentCount: Number(source.commentCount) || 0,
    acknowledgedByViewer: Boolean(source.acknowledgedByViewer),
  };
}

function normalizeSimVitalsComment(value: unknown): SimVitalsComment | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<SimVitalsComment>;
  const authorRole = asText(source.authorRole) as SimVitalsRole;
  const id = asText(source.id);
  const body = asText(source.body);
  if (!id || !body) return null;
  return {
    id,
    postId: asText(source.postId),
    authorUserId: asText(source.authorUserId),
    authorName: asText(source.authorName) || "CFSP Team",
    authorRole: simVitalsRoleAppearance[authorRole] ? authorRole : "sp",
    body,
    createdAt: asText(source.createdAt),
    updatedAt: asText(source.updatedAt),
  };
}

function formatSimVitalsTimestamp(value?: string | null) {
  const timestamp = Date.parse(asText(value));
  if (Number.isNaN(timestamp)) return "Just now";

  const diffSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (diffSeconds < 45) return "Just now";
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(timestamp));
}

async function fetchSimVitalsPosts(limit: number, type: SimVitalsFeedType | "all" = "all") {
  const params = new URLSearchParams({ limit: String(limit) });
  if (type !== "all") params.set("type", type);
  const response = await fetch(`/api/simvitals/posts?${params.toString()}`, {
    cache: "no-store",
    credentials: "include",
  });
  const body = (await response.json().catch(() => null)) as
    | { ok?: boolean; posts?: unknown[]; schemaReady?: boolean; warning?: string; error?: string }
    | null;

  if (!response.ok || body?.ok === false) {
    throw new Error(body?.error || body?.warning || (await parseSimVitalsApiError(response)));
  }

  if (body?.schemaReady === false) {
    return {
      posts: [] as SimVitalsPost[],
      warning: body.warning || "SimVitals storage is not ready yet.",
    };
  }

  return {
    posts: Array.isArray(body?.posts)
      ? body.posts.map(normalizeSimVitalsPost).filter((post): post is SimVitalsPost => Boolean(post))
      : [],
    warning: "",
  };
}

export function getSimVitalsRoleFromProfile(role: string): SimVitalsRole {
  const normalized = asText(role).toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized.includes("admin")) return "admin";
  if (normalized === "sim_op" || normalized === "sim_ops") return "sim_ops";
  if (normalized === "faculty") return "faculty";
  if (normalized === "sp") return "sp";
  return "sim_ops";
}

function getSimVitalsInitials(name: string) {
  const parts = asText(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return "SV";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function SimVitalsSignalMark({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`simvitals-mark${compact ? " simvitals-mark-compact" : ""}`}
      role="img"
      aria-label="CFSP SimVitals signal mark"
    >
      <Image
        src="/branding/cfsp-logo.svg"
        alt=""
        width={compact ? 34 : 48}
        height={compact ? 34 : 48}
        unoptimized
        className="simvitals-mark-logo"
      />
      <svg className="simvitals-mark-signal" aria-hidden="true" viewBox="0 0 88 64" fill="none">
        <path
          d="M4 44 H15 C20 44 21 33 27 33 H34 C40 33 41 20 48 20 C56 20 57 38 65 38 H74 C79 38 80 29 84 29"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 18 H30 M58 14 H76 M16 54 H42 M58 52 H78"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.38"
        />
      </svg>
    </div>
  );
}

function SimVitalsAttachmentIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.5 12.6 20.9a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7L9.7 18.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
    </svg>
  );
}

function SimVitalsEventLinkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
      <path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" />
    </svg>
  );
}

function SimVitalsRoleBadge({ role }: { role: SimVitalsRole }) {
  const roleLook = simVitalsRoleAppearance[role];

  return (
    <span
      className="inline-flex min-h-[24px] items-center rounded-full px-2.5 py-1 text-[0.72rem] font-black uppercase tracking-[0.05em]"
      style={{
        background: roleLook.background,
        border: `1px solid ${roleLook.border}`,
        color: roleLook.color,
      }}
    >
      {roleLook.label}
    </span>
  );
}

function SimVitalsIconButton({
  label,
  children,
  onClick,
  disabled = false,
  title,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title || label}
      className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-[10px]"
      disabled={disabled}
      onClick={onClick}
      style={{
        border: "1px solid var(--cfsp-border)",
        background: "var(--cfsp-surface-muted)",
        color: "var(--cfsp-text-muted)",
        opacity: disabled ? 0.62 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function SimVitalsPostCard({
  post,
  compact = false,
  interactive = false,
  onPostUpdate,
}: {
  post: SimVitalsPost;
  compact?: boolean;
  interactive?: boolean;
  onPostUpdate?: (postId: string, patch: Partial<SimVitalsPost>) => void;
}) {
  const typeLook = simVitalsFeedTypeAppearance[post.type];
  const roleLook = simVitalsRoleAppearance[post.authorRole];
  const initials = getSimVitalsInitials(post.authorName);
  const timestampLabel = post.timestampLabel || formatSimVitalsTimestamp(post.createdAt);
  const [ackSaving, setAckSaving] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentSaving, setCommentSaving] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentError, setCommentError] = useState("");
  const [comments, setComments] = useState<SimVitalsComment[]>([]);

  async function loadComments() {
    if (!interactive || commentsLoading) return;
    setCommentsLoading(true);
    setCommentError("");

    try {
      const response = await fetch(`/api/simvitals/posts/${encodeURIComponent(post.id)}/comments`, {
        cache: "no-store",
        credentials: "include",
      });
      const body = (await response.json().catch(() => null)) as { comments?: unknown[]; error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error || (await parseSimVitalsApiError(response)));
      }
      setComments(
        Array.isArray(body?.comments)
          ? body.comments
              .map(normalizeSimVitalsComment)
              .filter((comment): comment is SimVitalsComment => Boolean(comment))
          : []
      );
      setCommentsLoaded(true);
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : "Could not load comments.");
    } finally {
      setCommentsLoading(false);
    }
  }

  async function handleToggleAck() {
    if (!interactive || ackSaving) return;
    setAckSaving(true);
    setCommentError("");

    try {
      const response = await fetch(`/api/simvitals/posts/${encodeURIComponent(post.id)}/ack`, {
        method: "POST",
        cache: "no-store",
        credentials: "include",
      });
      const body = (await response.json().catch(() => null)) as
        | { acknowledged?: boolean; reactionCount?: number; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error || (await parseSimVitalsApiError(response)));
      }
      onPostUpdate?.(post.id, {
        acknowledgedByViewer: Boolean(body?.acknowledged),
        reactionCount: Number(body?.reactionCount) || 0,
      });
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : "Could not update acknowledgement.");
    } finally {
      setAckSaving(false);
    }
  }

  async function handleToggleComments() {
    if (!interactive) return;
    const nextOpen = !commentsOpen;
    setCommentsOpen(nextOpen);
    if (nextOpen && !commentsLoaded) {
      await loadComments();
    }
  }

  async function handleCreateComment() {
    const body = commentDraft.trim();
    if (!interactive || !body || commentSaving) return;
    setCommentSaving(true);
    setCommentError("");

    try {
      const response = await fetch(`/api/simvitals/posts/${encodeURIComponent(post.id)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "include",
        body: JSON.stringify({ body }),
      });
      const responseBody = (await response.json().catch(() => null)) as
        | { comment?: unknown; commentCount?: number; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(responseBody?.error || (await parseSimVitalsApiError(response)));
      }
      const comment = normalizeSimVitalsComment(responseBody?.comment);
      if (comment) {
        setComments((current) => [...current, comment]);
        setCommentsLoaded(true);
      }
      setCommentDraft("");
      onPostUpdate?.(post.id, {
        commentCount: Number(responseBody?.commentCount) || post.commentCount + 1,
      });
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : "Could not post comment.");
    } finally {
      setCommentSaving(false);
    }
  }

  return (
    <article
      className={`relative overflow-hidden rounded-[14px] ${compact ? "px-3.5 py-3.5" : "px-4 py-4"}`}
      style={{
        border: `1px solid ${roleLook.cardBorder}`,
        background: roleLook.cardBackground,
        boxShadow: compact ? "0 8px 18px rgba(24, 52, 78, 0.06)" : "0 12px 26px rgba(24, 52, 78, 0.08)",
      }}
    >
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 top-0 w-[4px]"
        style={{ background: `linear-gradient(180deg, ${typeLook.accent}, transparent)` }}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`${compact ? "h-[34px] w-[34px] rounded-[10px] text-xs" : "h-[38px] w-[38px] rounded-[12px] text-sm"} flex shrink-0 items-center justify-center font-black`}
            style={{
              background: typeLook.background,
              border: `1px solid ${typeLook.border}`,
              color: typeLook.color,
              boxShadow: `0 0 18px ${typeLook.border}`,
            }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-black text-[var(--cfsp-text)]">{post.authorName}</span>
              <SimVitalsRoleBadge role={post.authorRole} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--cfsp-text-muted)]">
              <span>{timestampLabel}</span>
              <span>{typeLook.signal}</span>
            </div>
          </div>
        </div>

        <span
          className="inline-flex min-h-[28px] items-center rounded-full px-3 py-1 text-xs font-black"
          style={{
            background: typeLook.background,
            border: `1px solid ${typeLook.border}`,
            color: typeLook.color,
          }}
        >
          {typeLook.label}
        </span>
      </div>

      {post.linkedEventName ? (
        <div className="mt-3">
          <span
            className="inline-flex min-h-[28px] max-w-full items-center rounded-full px-3 py-1 text-xs font-black"
            style={{
              background: "var(--cfsp-surface)",
              border: "1px solid var(--cfsp-border)",
              color: "var(--cfsp-blue-dark)",
            }}
          >
            <span className="truncate">Event: {post.linkedEventName}</span>
          </span>
        </div>
      ) : null}

      <p className={`${compact ? "mt-2 text-[0.88rem] leading-5" : "mt-3 text-[0.95rem] leading-6"} text-[var(--cfsp-text)]`}>{post.body}</p>

      {post.attachment ? (
        <div className="mt-3">
          <a
            href={post.attachment.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-2 rounded-[12px] px-3 py-2 text-xs font-black no-underline"
            style={{
              border: "1px solid var(--cfsp-border)",
              background: "var(--cfsp-surface-muted)",
              color: "var(--cfsp-text)",
            }}
          >
            <SimVitalsAttachmentIcon />
            <span className="truncate">{post.attachment.fileName}</span>
            {post.attachment.size ? (
              <span className="shrink-0 text-[var(--cfsp-text-muted)]">
                {formatSimVitalsFileSize(post.attachment.size)}
              </span>
            ) : null}
          </a>
        </div>
      ) : null}

      {post.tags.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {post.tags.slice(0, compact ? 3 : post.tags.length).map((tag) => (
            <span key={`${post.id}-${tag}`} className="cfsp-chip">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="cfsp-btn cfsp-btn-secondary min-h-[34px] px-3 py-1.5 text-xs"
          disabled={!interactive || ackSaving}
          onClick={() => void handleToggleAck()}
          style={{
            opacity: !interactive || ackSaving ? 0.65 : 1,
            background: post.acknowledgedByViewer ? typeLook.background : undefined,
            borderColor: post.acknowledgedByViewer ? typeLook.border : undefined,
            color: post.acknowledgedByViewer ? typeLook.color : undefined,
          }}
        >
          {ackSaving ? "Saving..." : post.acknowledgedByViewer ? `Acked ${post.reactionCount}` : `Ack ${post.reactionCount}`}
        </button>
        <button
          type="button"
          className="cfsp-btn cfsp-btn-secondary min-h-[34px] px-3 py-1.5 text-xs"
          disabled={!interactive}
          onClick={() => void handleToggleComments()}
          style={{ opacity: interactive ? 1 : 0.65 }}
        >
          {commentsOpen ? "Hide Comments" : `Comments ${post.commentCount}`}
        </button>
      </div>

      {commentError ? (
        <div className="mt-3 rounded-[12px] border border-[var(--cfsp-danger-border)] bg-[var(--cfsp-danger-soft)] px-3 py-2 text-xs font-bold text-[var(--cfsp-danger)]">
          {commentError}
        </div>
      ) : null}

      {commentsOpen ? (
        <div
          className="mt-3 grid gap-3 rounded-[12px] px-3 py-3"
          style={{
            border: "1px solid var(--cfsp-border)",
            background: "var(--cfsp-surface-muted)",
          }}
        >
          {commentsLoading ? (
            <div className="text-xs font-bold text-[var(--cfsp-text-muted)]">Loading comments...</div>
          ) : comments.length ? (
            <div className="grid gap-2">
              {comments.map((comment) => (
                <div key={comment.id} className="rounded-[10px] bg-[var(--cfsp-surface)] px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black text-[var(--cfsp-text)]">{comment.authorName}</span>
                    <SimVitalsRoleBadge role={comment.authorRole} />
                    <span className="text-[0.72rem] font-bold text-[var(--cfsp-text-muted)]">
                      {formatSimVitalsTimestamp(comment.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 text-sm leading-5 text-[var(--cfsp-text)]">{comment.body}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs font-bold text-[var(--cfsp-text-muted)]">No comments yet.</div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleCreateComment();
                }
              }}
              className="cfsp-input"
              placeholder="Add a comment..."
              aria-label="SimVitals comment"
              disabled={commentSaving}
            />
            <button
              type="button"
              onClick={() => void handleCreateComment()}
              disabled={!commentDraft.trim() || commentSaving}
              className="cfsp-btn cfsp-btn-primary min-h-[38px] px-3 py-2 text-xs"
              style={{ opacity: !commentDraft.trim() || commentSaving ? 0.62 : 1 }}
            >
              {commentSaving ? "Posting..." : "Comment"}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function SimVitalsDashboardPreview() {
  const [previewPosts, setPreviewPosts] = useState<SimVitalsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      setLoading(true);
      try {
        const result = await fetchSimVitalsPosts(3);
        if (cancelled) return;
        setPreviewPosts(result.posts);
        setWarning(result.warning);
      } catch (error) {
        if (cancelled) return;
        setWarning(error instanceof Error ? error.message : "Could not load SimVitals.");
        setPreviewPosts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      className="relative overflow-hidden rounded-[14px] px-5 py-5"
      style={{
        border: "1px solid var(--cfsp-border)",
        background: "var(--cfsp-simvitals-preview-bg)",
        boxShadow: "var(--cfsp-card-glow)",
      }}
    >
      <div
        aria-hidden="true"
        className="absolute left-0 right-0 top-0 h-[3px]"
        style={{ background: "linear-gradient(90deg, #145b96, #2cd3ad, #8fc2f0)" }}
      />

      <div className="relative flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex max-w-2xl items-start gap-3">
          <SimVitalsSignalMark compact />
          <div className="min-w-0">
            <div className="cfsp-kicker">Check SimVitals</div>
            <h2 className="mt-2 text-[1.35rem] leading-tight font-black text-[var(--cfsp-text)]">Latest SimVitals</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--cfsp-text-muted)]">
              Operational signals for staffing, rooms, faculty coordination, training, and simulation support.
            </p>
          </div>
        </div>
        <Link href="/simvitals" className="cfsp-btn cfsp-btn-primary shrink-0">
          Open SimVitals
        </Link>
      </div>

      {loading ? (
        <div className="relative mt-4 rounded-[14px] border border-dashed border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] px-5 py-7 text-sm font-bold text-[var(--cfsp-text-muted)]">
          Loading SimVitals...
        </div>
      ) : previewPosts.length ? (
        <div className="relative mt-4 grid gap-3 xl:grid-cols-3">
          {previewPosts.map((post) => (
            <SimVitalsPostCard key={post.id} post={post} compact />
          ))}
        </div>
      ) : (
        <div className="relative mt-4 rounded-[14px] border border-dashed border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] px-5 py-7 text-sm font-bold text-[var(--cfsp-text-muted)]">
          {warning || "No SimVitals updates yet."}
        </div>
      )}
    </section>
  );
}

export function SimVitalsFullExperience({
  displayName,
  profileRole,
}: {
  displayName: string;
  profileRole: string;
}) {
  const authorRole = getSimVitalsRoleFromProfile(profileRole);
  const [draft, setDraft] = useState("");
  const [postType, setPostType] = useState<SimVitalsFeedType>("general_update");
  const [activeFilter, setActiveFilter] = useState<SimVitalsFeedType | "all">("all");
  const [posts, setPosts] = useState<SimVitalsPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState("");
  const [savingPost, setSavingPost] = useState(false);
  const [composerError, setComposerError] = useState("");
  const [selectedAttachmentFile, setSelectedAttachmentFile] = useState<File | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const authorInitials = getSimVitalsInitials(displayName);
  const selectedTypeLook = simVitalsFeedTypeAppearance[postType];
  const authorRoleLook = simVitalsRoleAppearance[authorRole];
  const filteredPosts = useMemo(
    () => (activeFilter === "all" ? posts : posts.filter((post) => post.type === activeFilter)),
    [activeFilter, posts]
  );
  const stats = useMemo(
    () => [
      { label: "Open signals", value: posts.length },
      { label: "Staffing alerts", value: posts.filter((post) => post.type === "staffing_alert").length },
      { label: "Live issues", value: posts.filter((post) => post.type === "live_issue").length },
    ],
    [posts]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadFeed() {
      setFeedLoading(true);
      setFeedError("");
      try {
        const result = await fetchSimVitalsPosts(50);
        if (cancelled) return;
        setPosts(result.posts);
        setFeedError(result.warning);
      } catch (error) {
        if (cancelled) return;
        setFeedError(error instanceof Error ? error.message : "Could not load SimVitals.");
        setPosts([]);
      } finally {
        if (!cancelled) setFeedLoading(false);
      }
    }

    void loadFeed();

    return () => {
      cancelled = true;
    };
  }, []);

  function handlePostUpdate(postId: string, patch: Partial<SimVitalsPost>) {
    setPosts((current) =>
      current.map((post) => (post.id === postId ? { ...post, ...patch } : post))
    );
  }

  function handleAttachmentFileChange(file: File | null) {
    setComposerError("");
    if (!file) {
      setSelectedAttachmentFile(null);
      return;
    }

    const acceptedExtensions = [".pdf", ".docx", ".xlsx", ".csv", ".png", ".jpg", ".jpeg"];
    const lowerName = file.name.toLowerCase();
    const accepted = acceptedExtensions.some((extension) => lowerName.endsWith(extension));
    if (!accepted) {
      setComposerError("Unsupported attachment type. Use PDF, DOCX, XLSX, CSV, PNG, or JPG.");
      setSelectedAttachmentFile(null);
      return;
    }

    setSelectedAttachmentFile(file);
  }

  async function uploadSelectedAttachment(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/simvitals/attachments", {
      method: "POST",
      cache: "no-store",
      credentials: "include",
      body: formData,
    });
    const responseBody = (await response.json().catch(() => null)) as
      | { attachment?: unknown; error?: string }
      | null;

    if (!response.ok) {
      throw new Error(responseBody?.error || (await parseSimVitalsApiError(response)));
    }

    const attachment = normalizeSimVitalsAttachment(responseBody?.attachment);
    if (!attachment) throw new Error("The uploaded attachment could not be read.");
    return attachment;
  }

  async function handleCreatePost() {
    const body = draft.trim();
    if (!body || savingPost) return;

    setSavingPost(true);
    setComposerError("");

    try {
      const attachment = selectedAttachmentFile
        ? await uploadSelectedAttachment(selectedAttachmentFile)
        : null;
      const response = await fetch("/api/simvitals/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "include",
        body: JSON.stringify({
          body,
          postType,
          tags: [selectedTypeLook.signal, authorRoleLook.label],
          attachment,
        }),
      });
      const responseBody = (await response.json().catch(() => null)) as { post?: unknown; error?: string } | null;
      if (!response.ok) {
        throw new Error(responseBody?.error || (await parseSimVitalsApiError(response)));
      }
      const post = normalizeSimVitalsPost(responseBody?.post);
      if (!post) throw new Error("The new SimVitals post could not be read.");
      setPosts((current) => [post, ...current]);
      setDraft("");
      setSelectedAttachmentFile(null);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
      if (activeFilter !== "all" && activeFilter !== post.type) {
        setActiveFilter("all");
      }
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "Could not post SimVitals update.");
    } finally {
      setSavingPost(false);
    }
  }

  return (
    <div className="grid gap-5">
      <section
        className="relative overflow-hidden rounded-[14px] px-5 py-5"
        style={{
          border: "1px solid var(--cfsp-border)",
          background: "var(--cfsp-simvitals-hero-bg)",
          boxShadow: "var(--cfsp-card-glow)",
        }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ background: "linear-gradient(90deg, #145b96, #2cd3ad, #8fc2f0, #198a70)" }}
        />
        <div
          aria-hidden="true"
          className="absolute right-5 top-5 hidden h-20 w-44 opacity-35 sm:block"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(73, 168, 255, 0.18), rgba(44, 211, 173, 0.26), transparent)",
            backgroundSize: "100% 12px",
          }}
        />

        <div className="relative grid gap-4 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
          <div className="flex items-start gap-4">
            <SimVitalsSignalMark />
            <div className="min-w-0">
              <div className="cfsp-kicker">Check SimVitals</div>
              <h2 className="mt-3 text-[2rem] leading-tight font-black text-[var(--cfsp-text)]">SimVitals</h2>
              <p className="mt-3 max-w-3xl text-[0.98rem] leading-6 text-[var(--cfsp-text-muted)]">
                The operational nervous system of CFSP: command-center communication, live room telemetry, staffing signals, faculty coordination, and training readiness.
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {stats.map((item) => (
              <div
                key={item.label}
                className="rounded-[12px] px-4 py-3"
                style={{
                  border: "1px solid rgba(73, 168, 255, 0.20)",
                  background: "var(--cfsp-simvitals-stat-bg)",
                  backdropFilter: "blur(12px)",
                }}
              >
                <div className="cfsp-label">{item.label}</div>
                <div className="mt-1 text-2xl font-black text-[var(--cfsp-text)]">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className="rounded-[14px] px-4 py-4"
        style={{
          border: "1px solid rgba(73, 168, 255, 0.24)",
          background: "var(--cfsp-simvitals-composer-bg)",
          boxShadow: "0 16px 34px rgba(24, 52, 78, 0.08)",
        }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex min-w-[220px] items-center gap-3">
            <div
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[13px] text-sm font-black"
              style={{
                background: authorRoleLook.background,
                border: `1px solid ${authorRoleLook.border}`,
                color: authorRoleLook.color,
              }}
            >
              {authorInitials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-black text-[var(--cfsp-text)]">{displayName}</div>
              <div className="mt-1">
                <SimVitalsRoleBadge role={authorRole} />
              </div>
            </div>
          </div>

          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleCreatePost();
              }
            }}
            className="cfsp-input"
            placeholder="What's happening?"
            aria-label="SimVitals update"
            disabled={savingPost}
          />

          <div className="flex shrink-0 items-center gap-2">
            <input
              ref={attachmentInputRef}
              type="file"
              accept={SIMVITALS_ATTACHMENT_ACCEPT}
              className="hidden"
              onChange={(event) => handleAttachmentFileChange(event.target.files?.[0] || null)}
            />
            <SimVitalsIconButton
              label="Add attachment"
              title="Attach file"
              disabled={savingPost}
              onClick={() => attachmentInputRef.current?.click()}
            >
              <SimVitalsAttachmentIcon />
            </SimVitalsIconButton>
            {/* TODO linked_events: store event_id references and hydrate event chips from Supabase. */}
            <SimVitalsIconButton label="Link event" disabled title="Link event coming soon">
              <SimVitalsEventLinkIcon />
            </SimVitalsIconButton>
            <button
              type="button"
              onClick={() => void handleCreatePost()}
              disabled={!draft.trim() || savingPost}
              className="cfsp-btn cfsp-btn-primary"
              style={{
                minWidth: "104px",
                opacity: draft.trim() && !savingPost ? 1 : 0.62,
                boxShadow: draft.trim() && !savingPost ? "0 10px 26px rgba(20, 91, 150, 0.20)" : undefined,
              }}
            >
              {savingPost ? (selectedAttachmentFile ? "Uploading..." : "Posting...") : "Post"}
            </button>
          </div>
        </div>

        {selectedAttachmentFile ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex max-w-full items-center gap-2 rounded-[12px] px-3 py-2 text-xs font-black"
              style={{
                border: "1px solid var(--cfsp-border)",
                background: "var(--cfsp-surface-muted)",
                color: "var(--cfsp-text)",
              }}
            >
              <SimVitalsAttachmentIcon />
              <span className="truncate">{selectedAttachmentFile.name}</span>
              <span className="shrink-0 text-[var(--cfsp-text-muted)]">
                {formatSimVitalsFileSize(selectedAttachmentFile.size)}
              </span>
            </span>
            <button
              type="button"
              className="cfsp-btn cfsp-btn-secondary min-h-[32px] px-3 py-1.5 text-xs"
              disabled={savingPost}
              onClick={() => {
                setSelectedAttachmentFile(null);
                if (attachmentInputRef.current) attachmentInputRef.current.value = "";
              }}
            >
              Remove
            </button>
          </div>
        ) : null}

        {composerError ? (
          <div className="mt-3 rounded-[12px] border border-[var(--cfsp-danger-border)] bg-[var(--cfsp-danger-soft)] px-3 py-2 text-sm font-bold text-[var(--cfsp-danger)]">
            {composerError}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {simVitalsFeedTypeOrder.map((type) => {
            const typeLook = simVitalsFeedTypeAppearance[type];
            const active = postType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setPostType(type)}
                className="inline-flex min-h-[30px] items-center rounded-full px-3 py-1 text-xs font-black transition"
                style={{
                  background: active ? typeLook.background : "var(--cfsp-surface)",
                  border: `1px solid ${active ? typeLook.border : "var(--cfsp-border)"}`,
                  color: active ? typeLook.color : "var(--cfsp-text-muted)",
                  boxShadow: active ? `0 0 18px ${typeLook.border}` : "none",
                }}
              >
                {typeLook.label}
              </button>
            );
          })}
        </div>
      </section>

      <section
        className="rounded-[14px] px-4 py-4"
        style={{
          border: "1px solid var(--cfsp-border)",
          background: "var(--cfsp-surface-muted)",
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="cfsp-label mr-1">Feed filter</span>
          {(["all", ...simVitalsFeedTypeOrder] as Array<SimVitalsFeedType | "all">).map((type) => {
            const active = activeFilter === type;
            const typeLook = type === "all" ? null : simVitalsFeedTypeAppearance[type];
            return (
              <button
                key={`filter-${type}`}
                type="button"
                onClick={() => setActiveFilter(type)}
                className="inline-flex min-h-[30px] items-center rounded-full px-3 py-1 text-xs font-black transition"
                style={{
                  background: active
                    ? typeLook?.background || "rgba(73, 168, 255, 0.12)"
                    : "var(--cfsp-surface)",
                  border: `1px solid ${active ? typeLook?.border || "rgba(73, 168, 255, 0.24)" : "var(--cfsp-border)"}`,
                  color: active ? typeLook?.color || "var(--cfsp-blue-dark)" : "var(--cfsp-text-muted)",
                  boxShadow: active && typeLook ? `0 0 18px ${typeLook.border}` : "none",
                }}
              >
                {type === "all" ? `All (${posts.length})` : `${typeLook?.label} (${posts.filter((post) => post.type === type).length})`}
              </button>
            );
          })}
        </div>
      </section>

      {feedError ? (
        <section className="rounded-[14px] border border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] px-5 py-4 text-sm font-bold text-[var(--cfsp-text-muted)]">
          {feedError}
        </section>
      ) : null}

      {feedLoading ? (
        <section className="rounded-[14px] border border-dashed border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] px-5 py-7 text-sm font-bold text-[var(--cfsp-text-muted)]">
          Loading SimVitals...
        </section>
      ) : filteredPosts.length ? (
        <section className="grid gap-3 xl:grid-cols-2" aria-label="SimVitals feed">
          {filteredPosts.map((post) => (
            <SimVitalsPostCard key={post.id} post={post} interactive onPostUpdate={handlePostUpdate} />
          ))}
        </section>
      ) : (
        <section className="rounded-[14px] border border-dashed border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] px-5 py-7 text-sm font-bold text-[var(--cfsp-text-muted)]">
          {posts.length ? "No SimVitals updates match this filter." : "No SimVitals updates yet."}
        </section>
      )}
    </div>
  );
}
