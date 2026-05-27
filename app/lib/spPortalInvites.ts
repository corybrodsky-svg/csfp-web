import { createHash, randomBytes, timingSafeEqual } from "crypto";

export const SP_PORTAL_INVITE_STATUSES = ["active", "accepted", "expired", "revoked"] as const;

export type SpPortalInviteStatus = (typeof SP_PORTAL_INVITE_STATUSES)[number];

export const SP_PORTAL_INVITE_STATUS_LABELS: Record<SpPortalInviteStatus, string> = {
  active: "Active",
  accepted: "Accepted",
  expired: "Expired",
  revoked: "Revoked",
};

const TOKEN_HASH_PREFIX = "cfsp-sp-portal-invite:";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeToken(value: unknown) {
  return asText(value).toLowerCase().replace(/[\s-]+/g, "_");
}

export function normalizePortalInviteStatus(value: unknown): SpPortalInviteStatus {
  const normalized = normalizeToken(value);
  return SP_PORTAL_INVITE_STATUSES.includes(normalized as SpPortalInviteStatus)
    ? (normalized as SpPortalInviteStatus)
    : "active";
}

export function generatePortalInviteToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPortalInviteToken(token: string) {
  return createHash("sha256").update(`${TOKEN_HASH_PREFIX}${token}`).digest("hex");
}

export function portalInviteTokenMatches(token: string, expectedHash: string) {
  const actual = Buffer.from(hashPortalInviteToken(token), "hex");
  const expected = Buffer.from(asText(expectedHash), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isPortalInviteExpired(expiresAt: unknown, now = new Date()) {
  const raw = asText(expiresAt);
  if (!raw) return true;
  const expires = new Date(raw);
  if (Number.isNaN(expires.getTime())) return true;
  return expires.getTime() <= now.getTime();
}

export function getPortalInviteExpiresAt(expiresInDays: unknown, now = new Date()) {
  const parsed = Number.parseInt(asText(expiresInDays), 10);
  const days = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 90) : 14;
  const expires = new Date(now);
  expires.setDate(expires.getDate() + days);
  return expires.toISOString();
}

export function buildPortalInviteUrl(origin: string, token: string) {
  const safeOrigin = asText(origin).replace(/\/+$/, "");
  return `${safeOrigin}/sp/invite/${encodeURIComponent(token)}`;
}

export function getSpInviteDisplayName(sp: Record<string, unknown> | null | undefined) {
  return (
    asText(sp?.full_name) ||
    [asText(sp?.first_name), asText(sp?.last_name)].filter(Boolean).join(" ") ||
    "there"
  );
}

export function getSpInviteEmail(sp: Record<string, unknown> | null | undefined) {
  return asText(sp?.working_email) || asText(sp?.email) || null;
}

export function buildPortalInviteMessage(args: {
  spName?: string | null;
  organizationName?: string | null;
  inviteUrl: string;
}) {
  const spName = asText(args.spName) || "there";
  const organizationName = asText(args.organizationName) || "Your simulation program";
  return `Hello ${spName}, ${organizationName} is using CFSP for simulation shift scheduling. Please open this secure link to set up your SP Portal and view available shifts: ${args.inviteUrl}. If you need help, contact your simulation coordinator.`;
}

export function isMissingPortalInviteSchemaError(error: unknown) {
  const source =
    error && typeof error === "object"
      ? (error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown })
      : {};
  const text = [source.code, source.message, source.details, source.hint].map(asText).join(" ").toLowerCase();
  return (
    text.includes("42p01") ||
    text.includes("pgrst205") ||
    text.includes("sp_portal_invites") ||
    (text.includes("relation") && text.includes("does not exist"))
  );
}
