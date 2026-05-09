"use client";

import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useState } from "react";

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
  authorName: string;
  authorRole: SimVitalsRole;
  type: SimVitalsFeedType;
  timestampLabel: string;
  linkedEventName?: string;
  body: string;
  tags: string[];
  reactionCount: number;
  commentCount: number;
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

export const simVitalsSeedPosts: SimVitalsPost[] = [
  {
    id: "simvitals-seed-staffing",
    authorName: "Maya Chen",
    authorRole: "admin",
    type: "staffing_alert",
    timestampLabel: "12 min ago",
    linkedEventName: "Center City OSCE Block",
    body: "Backup coverage needed for the afternoon rotation. Poll responders are triaged; two available candidates are ready for confirmation.",
    tags: ["Coverage", "Backup queue", "Today"],
    reactionCount: 4,
    commentCount: 2,
  },
  {
    id: "simvitals-seed-live",
    authorName: "Sim Ops Desk",
    authorRole: "sim_ops",
    type: "live_issue",
    timestampLabel: "28 min ago",
    linkedEventName: "Interprofessional Sim Lab",
    body: "Room 3 telemetry station is back online. Scenario timing remains stable; keep the debrief handoff at the original mark.",
    tags: ["Room 3", "Telemetry restored", "Live flow"],
    reactionCount: 7,
    commentCount: 3,
  },
  {
    id: "simvitals-seed-faculty",
    authorName: "Dr. Lena Ortiz",
    authorRole: "faculty",
    type: "faculty_note",
    timestampLabel: "1 hr ago",
    linkedEventName: "Telehealth Communication Practice",
    body: "Faculty preference confirmed: keep SP feedback concise and reserve five minutes at the end for learner reflection.",
    tags: ["Faculty guidance", "Debrief", "Telehealth"],
    reactionCount: 5,
    commentCount: 1,
  },
  {
    id: "simvitals-seed-system",
    authorName: "SimVitals",
    authorRole: "system",
    type: "system_notice",
    timestampLabel: "2 hrs ago",
    body: "SimVitals initialized for operational updates. Event links, attachments, reactions, comments, and Supabase persistence are staged for the next data pass.",
    tags: ["System", "Local mock state"],
    reactionCount: 0,
    commentCount: 0,
  },
];

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
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
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={`${label} coming soon`}
      className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-[10px]"
      disabled
      style={{
        border: "1px solid var(--cfsp-border)",
        background: "var(--cfsp-surface-muted)",
        color: "var(--cfsp-text-muted)",
        opacity: 0.72,
      }}
    >
      {children}
    </button>
  );
}

export function SimVitalsPostCard({
  post,
  compact = false,
}: {
  post: SimVitalsPost;
  compact?: boolean;
}) {
  const typeLook = simVitalsFeedTypeAppearance[post.type];
  const roleLook = simVitalsRoleAppearance[post.authorRole];
  const initials = getSimVitalsInitials(post.authorName);

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
              <span>{post.timestampLabel}</span>
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
        {/* TODO reactions: persist per-user acknowledgements once SimVitals tables exist. */}
        <button type="button" className="cfsp-btn cfsp-btn-secondary min-h-[34px] px-3 py-1.5 text-xs" disabled>
          Ack {post.reactionCount}
        </button>
        {/* TODO comments: hydrate comment counts and threaded replies from the future SimVitals comments API. */}
        <button type="button" className="cfsp-btn cfsp-btn-secondary min-h-[34px] px-3 py-1.5 text-xs" disabled>
          Comments {post.commentCount}
        </button>
      </div>
    </article>
  );
}

export function SimVitalsDashboardPreview() {
  const previewPosts = simVitalsSeedPosts.slice(0, 3);

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

      {previewPosts.length ? (
        <div className="relative mt-4 grid gap-3 xl:grid-cols-3">
          {previewPosts.map((post) => (
            <SimVitalsPostCard key={post.id} post={post} compact />
          ))}
        </div>
      ) : (
        <div className="relative mt-4 rounded-[14px] border border-dashed border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] px-5 py-7 text-sm font-bold text-[var(--cfsp-text-muted)]">
          No SimVitals updates yet.
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
  const [posts, setPosts] = useState<SimVitalsPost[]>(() => simVitalsSeedPosts);
  const authorInitials = getSimVitalsInitials(displayName);
  const selectedTypeLook = simVitalsFeedTypeAppearance[postType];
  const authorRoleLook = simVitalsRoleAppearance[authorRole];

  function handleCreatePost() {
    const body = draft.trim();
    if (!body) return;

    // TODO create_post: replace this local prepend with an authenticated Supabase insert.
    setPosts((current) => [
      {
        id: `simvitals-local-${Date.now()}`,
        authorName: displayName,
        authorRole,
        type: postType,
        timestampLabel: "Just now",
        body,
        tags: [selectedTypeLook.signal, authorRoleLook.label],
        reactionCount: 0,
        commentCount: 0,
      },
      ...current,
    ]);
    setDraft("");
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
            {[
              { label: "Open signals", value: posts.length },
              { label: "Staffing alerts", value: posts.filter((post) => post.type === "staffing_alert").length },
              { label: "Live issues", value: posts.filter((post) => post.type === "live_issue").length },
            ].map((item) => (
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
                handleCreatePost();
              }
            }}
            className="cfsp-input"
            placeholder="What's happening?"
            aria-label="SimVitals update"
          />

          <div className="flex shrink-0 items-center gap-2">
            {/* TODO attachments: connect this placeholder to future SimVitals upload records. */}
            <SimVitalsIconButton label="Add attachment">
              <SimVitalsAttachmentIcon />
            </SimVitalsIconButton>
            {/* TODO linked_events: store event_id references and hydrate event chips from Supabase. */}
            <SimVitalsIconButton label="Link event">
              <SimVitalsEventLinkIcon />
            </SimVitalsIconButton>
            <button
              type="button"
              onClick={handleCreatePost}
              disabled={!draft.trim()}
              className="cfsp-btn cfsp-btn-primary"
              style={{
                minWidth: "104px",
                opacity: draft.trim() ? 1 : 0.62,
                boxShadow: draft.trim() ? "0 10px 26px rgba(20, 91, 150, 0.20)" : undefined,
              }}
            >
              Post
            </button>
          </div>
        </div>

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

      {posts.length ? (
        <section className="grid gap-3 xl:grid-cols-2" aria-label="SimVitals feed">
          {posts.map((post) => (
            <SimVitalsPostCard key={post.id} post={post} />
          ))}
        </section>
      ) : (
        <section className="rounded-[14px] border border-dashed border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] px-5 py-7 text-sm font-bold text-[var(--cfsp-text-muted)]">
          No SimVitals updates yet.
        </section>
      )}
    </div>
  );
}
