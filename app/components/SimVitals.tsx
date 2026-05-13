"use client";

import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

export type SimVitalsRole = "sim_ops" | "admin" | "faculty" | "sp" | "system";
export type SimVitalsAvatarSource = "profile" | "auth_metadata" | "initials";
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
  authorAvatarUrl?: string;
  authorAvatarSource?: SimVitalsAvatarSource;
  type: SimVitalsFeedType;
  timestampLabel?: string;
  createdAt?: string;
  updatedAt?: string;
  linkedEventId?: string | null;
  linkedEventName?: string;
  linkedEventDateText?: string;
  linkedEventStatus?: string;
  body: string;
  tags: string[];
  attachment?: SimVitalsAttachment | null;
  reactionCount: number;
  commentCount: number;
  acknowledgedByViewer?: boolean;
};

export type SimVitalsAttachment = {
  fileName: string;
  path?: string;
  url?: string;
  previewUrl?: string;
  downloadUrl?: string;
  mimeType: string;
  size: number;
  uploadedAt?: string;
  uploadedBy?: string;
  linkedEventId?: string | null;
  linkedEventName?: string;
};

export type SimVitalsComment = {
  id: string;
  postId: string;
  authorUserId?: string;
  authorName: string;
  authorRole: SimVitalsRole;
  authorAvatarUrl?: string;
  authorAvatarSource?: SimVitalsAvatarSource;
  body: string;
  createdAt?: string;
  updatedAt?: string;
};

type SimVitalsEventReference = {
  id: string;
  name: string;
  dateLabel: string;
  status: string;
};

type SimVitalsReferenceKind =
  | "event"
  | "training"
  | "staffing_issue"
  | "live_issue"
  | "room"
  | "faculty_coordination";

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
    label: "Ops Signal",
    accent: "var(--cfsp-blue)",
    background: "rgba(20, 91, 150, 0.10)",
    border: "rgba(20, 91, 150, 0.25)",
    color: "var(--cfsp-blue-dark)",
    signal: "Ops Signal",
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
    label: "Faculty Coordination",
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
    background: "rgba(20, 91, 150, 0.13)",
    border: "rgba(20, 91, 150, 0.32)",
    color: "var(--cfsp-blue-dark)",
    cardBorder: "rgba(20, 91, 150, 0.25)",
    cardBackground: "linear-gradient(180deg, rgba(20, 91, 150, 0.08) 0%, var(--cfsp-surface) 100%)",
  },
  admin: {
    label: "Admin",
    background: "rgba(25, 138, 112, 0.14)",
    border: "rgba(25, 138, 112, 0.32)",
    color: "var(--cfsp-green-dark)",
    cardBorder: "rgba(25, 138, 112, 0.27)",
    cardBackground: "linear-gradient(180deg, rgba(25, 138, 112, 0.09) 0%, var(--cfsp-surface) 100%)",
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
const SIMVITALS_REFERENCE_KIND_LABELS: Record<SimVitalsReferenceKind, string> = {
  event: "Event",
  training: "Training",
  staffing_issue: "Staffing Issue",
  live_issue: "Live Issue",
  room: "Room",
  faculty_coordination: "Faculty Coordination",
};

function formatSimVitalsFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function formatSimVitalsFileType(value?: string | null) {
  const mimeType = asText(value).toLowerCase();
  if (!mimeType) return "";
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("wordprocessingml") || mimeType.includes("msword")) return "DOCX";
  if (mimeType.includes("spreadsheetml") || mimeType.includes("excel")) return "XLSX";
  if (mimeType.includes("csv")) return "CSV";
  if (mimeType.includes("png")) return "PNG";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "JPG";
  return mimeType.split("/").pop()?.toUpperCase() || "";
}

function getSimVitalsAttachmentExtension(fileName?: string | null) {
  const name = asText(fileName).toLowerCase();
  const extension = name.includes(".") ? name.split(".").pop() || "" : "";
  return extension.replace(/[^a-z0-9]+/g, "");
}

function isSimVitalsImageAttachment(attachment?: SimVitalsAttachment | null) {
  if (!attachment) return false;
  const mimeType = asText(attachment.mimeType).toLowerCase();
  if (mimeType.startsWith("image/")) return true;
  return ["png", "jpg", "jpeg", "gif", "webp"].includes(getSimVitalsAttachmentExtension(attachment.fileName));
}

function getSimVitalsAttachmentPreviewHref(attachment?: SimVitalsAttachment | null) {
  if (!attachment) return "";
  return asText(attachment.previewUrl) || asText(attachment.url);
}

function getSimVitalsAttachmentDownloadHref(attachment?: SimVitalsAttachment | null) {
  if (!attachment) return "";
  return asText(attachment.downloadUrl) || asText(attachment.url);
}

function formatSimVitalsAttachmentTimestamp(value?: string | null) {
  const timestamp = Date.parse(asText(value));
  if (Number.isNaN(timestamp)) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatSimVitalsEventDate(value?: string | null) {
  const text = asText(value);
  if (!text) return "Date TBD";
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(parsed));
  }
  return text;
}

function getSimVitalsEventStatusLabel(value?: string | null) {
  const normalized = asText(value).replace(/[_-]+/g, " ");
  if (!normalized) return "Planning";
  return normalized.replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeSimVitalsEventReference(value: unknown): SimVitalsEventReference | null {
  if (!value || typeof value !== "object") return null;
  const source = value as {
    id?: unknown;
    name?: unknown;
    date_text?: unknown;
    earliest_session_date?: unknown;
    status?: unknown;
  };
  const id = asText(source.id);
  const name = asText(source.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    dateLabel: formatSimVitalsEventDate(asText(source.earliest_session_date) || asText(source.date_text)),
    status: getSimVitalsEventStatusLabel(asText(source.status)),
  };
}

function normalizeSimVitalsAttachment(value: unknown): SimVitalsAttachment | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<SimVitalsAttachment>;
  const fileName = asText(source.fileName);
  const path = asText(source.path);
  const url = asText(source.url);
  if (!fileName) return null;
  return {
    fileName,
    path,
    url,
    previewUrl: asText(source.previewUrl) || url,
    downloadUrl: asText(source.downloadUrl) || url,
    mimeType: asText(source.mimeType) || "application/octet-stream",
    size: Math.max(0, Number(source.size) || 0),
    uploadedAt: asText(source.uploadedAt),
    uploadedBy: asText(source.uploadedBy),
    linkedEventId: asText(source.linkedEventId) || null,
    linkedEventName: asText(source.linkedEventName),
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
    authorAvatarUrl: asText(source.authorAvatarUrl),
    authorAvatarSource: (asText(source.authorAvatarSource) as SimVitalsAvatarSource) || "initials",
    type,
    timestampLabel: asText(source.timestampLabel),
    createdAt: asText(source.createdAt),
    updatedAt: asText(source.updatedAt),
    linkedEventId: asText(source.linkedEventId) || null,
    linkedEventName: asText(source.linkedEventName),
    linkedEventDateText: asText(source.linkedEventDateText),
    linkedEventStatus: asText(source.linkedEventStatus),
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
    authorAvatarUrl: asText(source.authorAvatarUrl),
    authorAvatarSource: (asText(source.authorAvatarSource) as SimVitalsAvatarSource) || "initials",
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
    | {
        ok?: boolean;
        posts?: unknown[];
        schemaReady?: boolean;
        warning?: string;
        error?: string;
        attachmentSupportReady?: boolean;
        attachmentWarning?: string;
      }
    | null;

  if (!response.ok || body?.ok === false) {
    throw new Error(body?.error || body?.warning || (await parseSimVitalsApiError(response)));
  }

  if (body?.schemaReady === false) {
    return {
      posts: [] as SimVitalsPost[],
      warning: body.warning || "SimVitals database readiness check failed.",
      attachmentWarning: "",
    };
  }

  return {
    posts: Array.isArray(body?.posts)
      ? body.posts.map(normalizeSimVitalsPost).filter((post): post is SimVitalsPost => Boolean(post))
      : [],
    warning: asText(body?.warning),
    attachmentWarning: body?.attachmentSupportReady === false ? asText(body.attachmentWarning) : "",
  };
}

async function fetchSimVitalsEventReferences() {
  const response = await fetch("/api/events", {
    cache: "no-store",
    credentials: "include",
  });
  const body = (await response.json().catch(() => null)) as { events?: unknown[]; error?: string } | null;
  if (!response.ok) {
    throw new Error(body?.error || (await parseSimVitalsApiError(response)));
  }
  return Array.isArray(body?.events)
    ? body.events
        .map(normalizeSimVitalsEventReference)
        .filter((event): event is SimVitalsEventReference => Boolean(event))
    : [];
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

function SimVitalsAvatar({
  name,
  imageUrl,
  source,
  size = "default",
}: {
  name: string;
  imageUrl?: string;
  source?: SimVitalsAvatarSource;
  size?: "small" | "default" | "large";
}) {
  const [failedImageUrl, setFailedImageUrl] = useState("");
  const initials = getSimVitalsInitials(name);
  const resolvedImageUrl = asText(imageUrl);
  const showImage = Boolean(resolvedImageUrl) && failedImageUrl !== resolvedImageUrl;
  const dimension = size === "small" ? 34 : size === "large" ? 42 : 38;
  const radiusClass =
    size === "small" ? "rounded-[10px]" : size === "large" ? "rounded-[13px]" : "rounded-[12px]";
  const textClass = size === "small" ? "text-xs" : "text-sm";

  return (
    <div
      className={`${radiusClass} relative flex shrink-0 items-center justify-center overflow-hidden font-black ${textClass}`}
      style={{
        height: `${dimension}px`,
        width: `${dimension}px`,
        background: "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(237,246,251,0.9))",
        border: "1px solid rgba(20, 91, 150, 0.18)",
        color: "var(--cfsp-blue-dark)",
        boxShadow: "0 6px 14px rgba(24, 52, 78, 0.08)",
      }}
      title={source ? `Avatar source: ${source}` : undefined}
    >
      {showImage ? (
        <Image
          src={resolvedImageUrl}
          alt={`${name} profile photo`}
          fill
          unoptimized
          className="object-cover"
          onError={() => setFailedImageUrl(resolvedImageUrl)}
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </div>
  );
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
  eventReference,
}: {
  post: SimVitalsPost;
  compact?: boolean;
  interactive?: boolean;
  onPostUpdate?: (postId: string, patch: Partial<SimVitalsPost>) => void;
  eventReference?: SimVitalsEventReference | null;
}) {
  const typeLook = simVitalsFeedTypeAppearance[post.type];
  const roleLook = simVitalsRoleAppearance[post.authorRole];
  const timestampLabel = post.timestampLabel || formatSimVitalsTimestamp(post.createdAt);
  const attachment = post.attachment;
  const attachmentPreviewHref = getSimVitalsAttachmentPreviewHref(attachment);
  const attachmentDownloadHref = getSimVitalsAttachmentDownloadHref(attachment);
  const attachmentFileType = formatSimVitalsFileType(attachment?.mimeType);
  const shouldRenderImagePreview = Boolean(
    attachment &&
    attachmentPreviewHref &&
    isSimVitalsImageAttachment(attachment)
  );
  const linkedEvent = eventReference || (
    post.linkedEventId || post.linkedEventName
      ? {
          id: post.linkedEventId || "",
          name: post.linkedEventName || "Linked event",
          dateLabel: asText(post.linkedEventDateText) || "Date TBD",
          status: getSimVitalsEventStatusLabel(post.linkedEventStatus),
        }
      : null
  );
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
      setCommentError(error instanceof Error ? error.message : "Could not load ops thread.");
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
      setCommentError(error instanceof Error ? error.message : "Could not add to ops thread.");
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
        boxShadow: compact ? "0 10px 20px rgba(24, 52, 78, 0.07)" : "0 16px 34px rgba(24, 52, 78, 0.10)",
      }}
    >
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 top-0 w-[4px]"
        style={{ background: `linear-gradient(180deg, ${typeLook.accent}, transparent)` }}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <SimVitalsAvatar
            name={post.authorName}
            imageUrl={post.authorAvatarUrl}
            source={post.authorAvatarSource}
            size={compact ? "small" : "default"}
          />
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

      {linkedEvent ? (
        <div className="mt-3">
          {linkedEvent.id ? (
            <Link
              href={`/events/${encodeURIComponent(linkedEvent.id)}`}
              className="inline-flex max-w-full items-center gap-2 rounded-[12px] px-3 py-2 text-xs font-black no-underline"
              style={{
                background: "linear-gradient(90deg, rgba(20, 91, 150, 0.12), rgba(25, 138, 112, 0.10))",
                border: "1px solid rgba(20, 91, 150, 0.24)",
                color: "var(--cfsp-blue-dark)",
              }}
            >
              <SimVitalsEventLinkIcon />
              <span className="truncate">Operations Link: {linkedEvent.name}</span>
              <span className="shrink-0 text-[var(--cfsp-text-muted)]">{linkedEvent.dateLabel}</span>
              {linkedEvent.status ? (
                <span className="shrink-0 text-[var(--cfsp-green-dark)]">{linkedEvent.status}</span>
              ) : null}
            </Link>
          ) : (
            <span
              className="inline-flex min-h-[28px] max-w-full items-center rounded-full px-3 py-1 text-xs font-black"
              style={{
                background: "var(--cfsp-surface)",
                border: "1px solid var(--cfsp-border)",
                color: "var(--cfsp-blue-dark)",
              }}
            >
              <span className="truncate">Operations Link: {linkedEvent.name}</span>
            </span>
          )}
        </div>
      ) : null}

      <p className={`${compact ? "mt-2 text-[0.88rem] leading-5" : "mt-3 text-[0.96rem] leading-6"} font-semibold text-[var(--cfsp-text)]`}>{post.body}</p>

      {attachment ? (
        shouldRenderImagePreview ? (
          <div
            className="mt-3 grid max-w-[360px] overflow-hidden rounded-[14px]"
            style={{
              border: "1px solid rgba(20, 91, 150, 0.18)",
              background: "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(239, 249, 252, 0.78))",
              boxShadow: "0 12px 26px rgba(24, 52, 78, 0.10)",
            }}
          >
            <a
              href={attachmentPreviewHref}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden no-underline"
              aria-label={`Preview ${attachment.fileName}`}
            >
              <Image
                src={attachmentPreviewHref}
                alt={attachment.fileName}
                width={720}
                height={420}
                unoptimized
                className="h-[180px] w-full bg-[var(--cfsp-surface-muted)] object-cover transition duration-200 hover:scale-[1.01]"
              />
            </a>
            <div className="grid gap-2 px-3 py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-black text-[var(--cfsp-text)]">
                <SimVitalsAttachmentIcon />
                <span className="truncate">{attachment.fileName}</span>
                {attachmentFileType ? <span className="shrink-0 text-[var(--cfsp-text-muted)]">{attachmentFileType}</span> : null}
                {attachment.size ? <span className="shrink-0 text-[var(--cfsp-text-muted)]">{formatSimVitalsFileSize(attachment.size)}</span> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={attachmentPreviewHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-[10px] px-3 py-1.5 text-xs font-black no-underline"
                  style={{
                    border: "1px solid rgba(20, 91, 150, 0.22)",
                    background: "rgba(20, 91, 150, 0.08)",
                    color: "var(--cfsp-blue-dark)",
                  }}
                >
                  Preview
                </a>
                {attachmentDownloadHref ? (
                  <a
                    href={attachmentDownloadHref}
                    className="inline-flex items-center rounded-[10px] px-3 py-1.5 text-xs font-black no-underline"
                    style={{
                      border: "1px solid var(--cfsp-border)",
                      background: "var(--cfsp-surface)",
                      color: "var(--cfsp-text-muted)",
                    }}
                  >
                    Download
                  </a>
                ) : null}
              </div>
              {attachment.uploadedAt || attachment.uploadedBy || attachment.linkedEventName ? (
                <div className="flex flex-wrap gap-2">
                  {attachment.uploadedAt || attachment.uploadedBy ? (
                    <span className="inline-flex items-center rounded-[10px] px-2.5 py-1 text-[0.72rem] font-bold text-[var(--cfsp-text-muted)]">
                      {[attachment.uploadedBy, formatSimVitalsAttachmentTimestamp(attachment.uploadedAt)].filter(Boolean).join(" • ")}
                    </span>
                  ) : null}
                  {attachment.linkedEventName ? (
                    <span className="inline-flex items-center rounded-[10px] px-2.5 py-1 text-[0.72rem] font-bold text-[var(--cfsp-text-muted)]">
                      Attached to {attachment.linkedEventName}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {attachmentPreviewHref ? (
              <a
                href={attachmentPreviewHref}
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
                <span className="truncate">{attachment.fileName}</span>
                {attachmentFileType ? (
                  <span className="shrink-0 text-[var(--cfsp-text-muted)]">
                    {attachmentFileType}
                  </span>
                ) : null}
                {attachment.size ? (
                  <span className="shrink-0 text-[var(--cfsp-text-muted)]">
                    {formatSimVitalsFileSize(attachment.size)}
                  </span>
                ) : null}
                <span className="shrink-0 text-[var(--cfsp-blue-dark)]">Preview</span>
              </a>
            ) : (
              <span
                className="inline-flex max-w-full items-center gap-2 rounded-[12px] px-3 py-2 text-xs font-black"
                style={{
                  border: "1px solid var(--cfsp-border)",
                  background: "var(--cfsp-surface-muted)",
                  color: "var(--cfsp-text)",
                }}
              >
                <SimVitalsAttachmentIcon />
                <span className="truncate">{attachment.fileName}</span>
                {attachmentFileType ? <span className="shrink-0 text-[var(--cfsp-text-muted)]">{attachmentFileType}</span> : null}
                {attachment.size ? <span className="shrink-0 text-[var(--cfsp-text-muted)]">{formatSimVitalsFileSize(attachment.size)}</span> : null}
              </span>
            )}
            {attachmentDownloadHref ? (
              <a
                href={attachmentDownloadHref}
                className="inline-flex items-center rounded-[12px] px-3 py-2 text-xs font-black no-underline"
                style={{
                  border: "1px solid var(--cfsp-border)",
                  background: "var(--cfsp-surface)",
                  color: "var(--cfsp-text-muted)",
                }}
              >
                Download
              </a>
            ) : null}
            {attachment.uploadedAt || attachment.uploadedBy ? (
              <span className="inline-flex items-center rounded-[12px] px-3 py-2 text-xs font-bold text-[var(--cfsp-text-muted)]">
                {[attachment.uploadedBy, formatSimVitalsAttachmentTimestamp(attachment.uploadedAt)].filter(Boolean).join(" • ")}
              </span>
            ) : null}
            {attachment.linkedEventName ? (
              <span className="inline-flex items-center rounded-[12px] px-3 py-2 text-xs font-bold text-[var(--cfsp-text-muted)]">
                Attached to {attachment.linkedEventName}
              </span>
            ) : null}
          </div>
        )
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
          {commentsOpen ? "Hide Thread" : `Ops Thread ${post.commentCount}`}
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
            <div className="text-xs font-bold text-[var(--cfsp-text-muted)]">Loading ops thread...</div>
          ) : comments.length ? (
            <div className="grid gap-2">
              {comments.map((comment) => (
                <div key={comment.id} className="rounded-[10px] bg-[var(--cfsp-surface)] px-3 py-2">
                  <div className="flex gap-2">
                    <SimVitalsAvatar
                      name={comment.authorName}
                      imageUrl={comment.authorAvatarUrl}
                      source={comment.authorAvatarSource}
                      size="small"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-black text-[var(--cfsp-text)]">{comment.authorName}</span>
                        <SimVitalsRoleBadge role={comment.authorRole} />
                        <span className="text-[0.72rem] font-bold text-[var(--cfsp-text-muted)]">
                          {formatSimVitalsTimestamp(comment.createdAt)}
                        </span>
                      </div>
                      <div className="mt-1 text-sm leading-5 text-[var(--cfsp-text)]">{comment.body}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs font-bold text-[var(--cfsp-text-muted)]">No thread notes yet.</div>
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
              placeholder="Add an ops thread note..."
              aria-label="SimVitals ops thread note"
              disabled={commentSaving}
            />
            <button
              type="button"
              onClick={() => void handleCreateComment()}
              disabled={!commentDraft.trim() || commentSaving}
              className="cfsp-btn cfsp-btn-primary min-h-[38px] px-3 py-2 text-xs"
              style={{ opacity: !commentDraft.trim() || commentSaving ? 0.62 : 1 }}
            >
              {commentSaving ? "Adding..." : "Add Note"}
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
        const result = await fetchSimVitalsPosts(2);
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
      className="relative overflow-hidden rounded-[14px] px-4 py-4"
      style={{
        border: "1px solid var(--cfsp-border)",
        background: "var(--cfsp-simvitals-preview-bg)",
        boxShadow: "var(--cfsp-card-glow)",
      }}
    >
      <div
        aria-hidden="true"
        className="absolute left-0 right-0 top-0 h-[3px]"
        style={{ background: "linear-gradient(90deg, #145b96, #198a70)" }}
      />

      <div className="relative flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex max-w-2xl items-start gap-3">
          <SimVitalsSignalMark compact />
          <div className="min-w-0">
            <div className="cfsp-kicker">Check SimVitals</div>
            <h2 className="mt-1 text-[1.1rem] leading-tight font-black text-[var(--cfsp-text)]">Latest Signals</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--cfsp-text-muted)]">
              Operational awareness for staffing, rooms, faculty coordination, training, and simulation support.
            </p>
          </div>
        </div>
        <Link href="/simvitals" className="cfsp-btn cfsp-btn-primary shrink-0">
          Open SimVitals
        </Link>
      </div>

      {loading ? (
        <div className="relative mt-3 rounded-[12px] border border-dashed border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] px-4 py-4 text-sm font-bold text-[var(--cfsp-text-muted)]">
          Loading SimVitals signals...
        </div>
      ) : previewPosts.length ? (
        <div className="relative mt-3 grid gap-3 lg:grid-cols-2">
          {previewPosts.map((post) => (
            <SimVitalsPostCard key={post.id} post={post} compact />
          ))}
        </div>
      ) : (
        <div className="relative mt-3 rounded-[12px] border border-dashed border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] px-4 py-4 text-sm font-bold text-[var(--cfsp-text-muted)]">
          {warning || "No SimVitals signals yet."}
        </div>
      )}
    </section>
  );
}

export function SimVitalsFullExperience({
  displayName,
  profileRole,
  profileImageUrl,
}: {
  displayName: string;
  profileRole: string;
  profileImageUrl?: string;
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
  const [attachmentSupportWarning, setAttachmentSupportWarning] = useState("");
  const [selectedAttachmentFile, setSelectedAttachmentFile] = useState<File | null>(null);
  const [eventReferences, setEventReferences] = useState<SimVitalsEventReference[]>([]);
  const [eventReferenceError, setEventReferenceError] = useState("");
  const [referencePanelOpen, setReferencePanelOpen] = useState(false);
  const [referenceKind, setReferenceKind] = useState<SimVitalsReferenceKind>("event");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [eventReferenceQuery, setEventReferenceQuery] = useState("");
  const [referenceDetail, setReferenceDetail] = useState("");
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const selectedTypeLook = simVitalsFeedTypeAppearance[postType];
  const authorRoleLook = simVitalsRoleAppearance[authorRole];
  const eventReferenceById = useMemo(
    () => new Map(eventReferences.map((event) => [event.id, event])),
    [eventReferences]
  );
  const selectedEventReference = selectedEventId ? eventReferenceById.get(selectedEventId) || null : null;
  const filteredEventReferences = useMemo(() => {
    const query = asText(eventReferenceQuery).toLowerCase();
    const ranked = [...eventReferences].sort((a, b) => a.dateLabel.localeCompare(b.dateLabel) || a.name.localeCompare(b.name));
    if (!query) return ranked.slice(0, 8);
    return ranked
      .filter((event) =>
        [event.name, event.dateLabel, event.status].some((value) => value.toLowerCase().includes(query))
      )
      .slice(0, 8);
  }, [eventReferenceQuery, eventReferences]);
  const filteredPosts = useMemo(
    () => (activeFilter === "all" ? posts : posts.filter((post) => post.type === activeFilter)),
    [activeFilter, posts]
  );
  const stats = useMemo(
    () => [
      { label: "Active signals", value: posts.length },
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
        const [result, eventResult] = await Promise.all([
          fetchSimVitalsPosts(50),
          fetchSimVitalsEventReferences().catch((error) => {
            setEventReferenceError(error instanceof Error ? error.message : "Could not load event references.");
            return [] as SimVitalsEventReference[];
          }),
        ]);
        if (cancelled) return;
        setPosts(result.posts);
        setEventReferences(eventResult);
        setFeedError(result.warning);
        setAttachmentSupportWarning(result.attachmentWarning);
      } catch (error) {
        if (cancelled) return;
        setFeedError(error instanceof Error ? error.message : "Could not load SimVitals.");
        setAttachmentSupportWarning("");
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
    if (attachmentSupportWarning) {
      setComposerError(attachmentSupportWarning);
      setSelectedAttachmentFile(null);
      return;
    }
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
      const message = responseBody?.error || (await parseSimVitalsApiError(response));
      throw new Error(`Attachment upload failed: ${message}`);
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
      let attachment: SimVitalsAttachment | null = null;
      if (selectedAttachmentFile) {
        if (attachmentSupportWarning) {
          throw new Error(`Attachment upload failed: ${attachmentSupportWarning}`);
        }
        attachment = await uploadSelectedAttachment(selectedAttachmentFile);
        if (selectedEventReference) {
          attachment = {
            ...attachment,
            linkedEventId: selectedEventReference.id,
            linkedEventName: selectedEventReference.name,
          };
        }
      }
      const referenceTags = [
        referencePanelOpen ? `Reference: ${SIMVITALS_REFERENCE_KIND_LABELS[referenceKind]}` : "",
        referenceDetail ? `Context: ${referenceDetail}` : "",
        selectedEventReference ? "Event-linked" : "",
      ].filter(Boolean);
      const response = await fetch("/api/simvitals/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "include",
        body: JSON.stringify({
          body,
          postType,
          linkedEventId: selectedEventReference?.id || null,
          linkedEventName: selectedEventReference?.name || null,
          tags: [selectedTypeLook.signal, authorRoleLook.label, ...referenceTags],
          attachment,
        }),
      });
      const responseBody = (await response.json().catch(() => null)) as { post?: unknown; warning?: string; error?: string } | null;
      if (!response.ok) {
        throw new Error(responseBody?.error || (await parseSimVitalsApiError(response)));
      }
      const post = normalizeSimVitalsPost(responseBody?.post);
      if (!post) throw new Error("The new SimVitals post could not be read.");
      setPosts((current) => [post, ...current]);
      setDraft("");
      setSelectedAttachmentFile(null);
      setReferenceDetail("");
      setSelectedEventId("");
      setEventReferenceQuery("");
      setFeedError(asText(responseBody?.warning));
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
      if (activeFilter !== "all" && activeFilter !== post.type) {
        setActiveFilter("all");
      }
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "Could not send SimVitals signal.");
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
          style={{ background: "linear-gradient(90deg, #145b96, #198a70)" }}
        />
        <div
          aria-hidden="true"
          className="absolute right-5 top-5 hidden h-20 w-44 opacity-35 sm:block"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(20, 91, 150, 0.12), rgba(25, 138, 112, 0.14), transparent)",
            backgroundSize: "100% 12px",
          }}
        />

        <div className="relative grid gap-4 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
          <div className="flex items-start gap-4">
            <SimVitalsSignalMark />
            <div className="min-w-0">
              <div className="cfsp-kicker">Check SimVitals</div>
              <h2 className="mt-3 text-[2.15rem] leading-tight font-black tracking-tight text-[var(--cfsp-text)]">SimVitals</h2>
              <p className="mt-3 max-w-3xl text-[0.98rem] leading-6 text-[var(--cfsp-text-muted)]">
                The operational nervous system of CFSP: calm signal flow for staffing, rooms, faculty coordination, training readiness, and live simulation support.
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {stats.map((item) => (
              <div
                key={item.label}
                className="rounded-[12px] px-4 py-3"
                style={{
                  border: "1px solid rgba(20, 91, 150, 0.20)",
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
          border: "1px solid rgba(20, 91, 150, 0.24)",
          background: "var(--cfsp-simvitals-composer-bg)",
          boxShadow: "0 16px 34px rgba(24, 52, 78, 0.08)",
        }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex min-w-[220px] items-center gap-3">
            <SimVitalsAvatar
              name={displayName}
              imageUrl={profileImageUrl}
              source={profileImageUrl ? "profile" : "initials"}
              size="large"
            />
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
            placeholder="Send an operations signal..."
            aria-label="SimVitals operations signal"
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
              title={attachmentSupportWarning || "Attach file"}
              disabled={savingPost || Boolean(attachmentSupportWarning)}
              onClick={() => attachmentInputRef.current?.click()}
            >
              <SimVitalsAttachmentIcon />
            </SimVitalsIconButton>
            <SimVitalsIconButton
              label="Add operations link"
              title={selectedEventReference ? `Linked to ${selectedEventReference.name}` : "Reference event, training, room, staffing, or faculty coordination"}
              disabled={savingPost}
              onClick={() => setReferencePanelOpen((current) => !current)}
            >
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
              {savingPost ? (selectedAttachmentFile ? "Uploading..." : "Sending...") : "Send Signal"}
            </button>
          </div>
        </div>

        {referencePanelOpen ? (
          <div
            className="mt-3 grid gap-3 rounded-[14px] px-3 py-3"
            style={{
              border: "1px solid rgba(20, 91, 150, 0.22)",
              background: "linear-gradient(180deg, rgba(255,255,255,0.72), rgba(232, 247, 252, 0.62))",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="cfsp-label">Operations Link</div>
                <div className="mt-1 text-xs font-bold text-[var(--cfsp-text-muted)]">
                  Attach this signal to an event, training, staffing issue, live room, or faculty coordination item.
                </div>
              </div>
              <button
                type="button"
                className="cfsp-btn cfsp-btn-secondary min-h-[32px] px-3 py-1.5 text-xs"
                onClick={() => {
                  setReferencePanelOpen(false);
                  setSelectedEventId("");
                  setReferenceDetail("");
                }}
              >
                Clear Link
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {(Object.keys(SIMVITALS_REFERENCE_KIND_LABELS) as SimVitalsReferenceKind[]).map((kind) => {
                const active = referenceKind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setReferenceKind(kind)}
                    className="inline-flex min-h-[30px] items-center rounded-full px-3 py-1 text-xs font-black transition"
                    style={{
                      background: active ? "rgba(20, 91, 150, 0.13)" : "var(--cfsp-surface)",
                      border: active ? "1px solid rgba(20, 91, 150, 0.28)" : "1px solid var(--cfsp-border)",
                      color: active ? "var(--cfsp-blue-dark)" : "var(--cfsp-text-muted)",
                    }}
                  >
                    {SIMVITALS_REFERENCE_KIND_LABELS[kind]}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-2 lg:grid-cols-[1fr_0.8fr]">
              <div className="grid gap-2">
                <input
                  className="cfsp-input"
                  value={eventReferenceQuery}
                  onChange={(event) => setEventReferenceQuery(event.target.value)}
                  placeholder="Find event to reference..."
                  aria-label="Find event to reference"
                  disabled={savingPost}
                />
                {eventReferenceError ? (
                  <div className="rounded-[10px] border border-[var(--cfsp-warning-border)] bg-[var(--cfsp-warning-soft)] px-3 py-2 text-xs font-bold text-[var(--cfsp-warning)]">
                    {eventReferenceError}
                  </div>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  {filteredEventReferences.length ? (
                    filteredEventReferences.map((event) => {
                      const active = selectedEventId === event.id;
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => setSelectedEventId(active ? "" : event.id)}
                          className="rounded-[12px] px-3 py-2 text-left transition"
                          style={{
                            border: active ? "1px solid rgba(25, 138, 112, 0.36)" : "1px solid var(--cfsp-border)",
                            background: active ? "rgba(25, 138, 112, 0.12)" : "var(--cfsp-surface)",
                          }}
                        >
                          <div className="truncate text-xs font-black text-[var(--cfsp-text)]">{event.name}</div>
                          <div className="mt-1 flex flex-wrap gap-2 text-[0.72rem] font-bold text-[var(--cfsp-text-muted)]">
                            <span>{event.dateLabel}</span>
                            <span>{event.status}</span>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="rounded-[12px] border border-dashed border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] px-3 py-3 text-xs font-bold text-[var(--cfsp-text-muted)] sm:col-span-2">
                      No matching event references.
                    </div>
                  )}
                </div>
              </div>
              <div className="grid content-start gap-2">
                <input
                  className="cfsp-input"
                  value={referenceDetail}
                  onChange={(event) => setReferenceDetail(event.target.value)}
                  placeholder={referenceKind === "room" ? "Room or station, e.g. Exam Room 3" : "Optional context, e.g. faculty availability"}
                  aria-label="Operations link context"
                  disabled={savingPost}
                />
                {selectedEventReference ? (
                  <div
                    className="rounded-[12px] px-3 py-3 text-xs font-bold"
                    style={{
                      border: "1px solid rgba(25, 138, 112, 0.26)",
                      background: "rgba(25, 138, 112, 0.10)",
                      color: "var(--cfsp-green-dark)",
                    }}
                  >
                    Linked to {selectedEventReference.name} • {selectedEventReference.dateLabel}
                  </div>
                ) : (
                  <div className="rounded-[12px] border border-dashed border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] px-3 py-3 text-xs font-bold text-[var(--cfsp-text-muted)]">
                    Event link optional. The reference type still tags the signal for operational scanning.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

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

        {attachmentSupportWarning && !composerError ? (
          <div
            className="mt-3 rounded-[12px] border bg-[var(--cfsp-warning-soft)] px-3 py-2 text-sm font-bold text-[var(--cfsp-warning)]"
            style={{ borderColor: "rgba(168, 100, 17, 0.28)" }}
          >
            {attachmentSupportWarning}
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
          <span className="cfsp-label mr-1">Signal filter</span>
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
                    ? typeLook?.background || "rgba(20, 91, 150, 0.12)"
                    : "var(--cfsp-surface)",
                  border: `1px solid ${active ? typeLook?.border || "rgba(20, 91, 150, 0.24)" : "var(--cfsp-border)"}`,
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
          Loading SimVitals signals...
        </section>
      ) : filteredPosts.length ? (
        <section className="grid gap-3 xl:grid-cols-2" aria-label="SimVitals signals">
          {filteredPosts.map((post) => (
            <SimVitalsPostCard
              key={post.id}
              post={post}
              eventReference={post.linkedEventId ? eventReferenceById.get(post.linkedEventId) || null : null}
              interactive
              onPostUpdate={handlePostUpdate}
            />
          ))}
        </section>
      ) : (
        <section className="rounded-[14px] border border-dashed border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] px-5 py-7 text-sm font-bold text-[var(--cfsp-text-muted)]">
          {posts.length ? "No SimVitals signals match this filter." : "No SimVitals signals yet."}
        </section>
      )}
    </div>
  );
}
