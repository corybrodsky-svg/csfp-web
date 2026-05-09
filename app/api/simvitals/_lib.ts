import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "@/app/lib/authCookies";
import { getProfileForUser } from "@/app/lib/profileServer";
import { createSupabaseAdminClient } from "@/app/lib/supabaseAdminClient";
import {
  createSupabaseServerClient,
  supabaseKey,
  supabaseUrl,
} from "@/app/lib/supabaseServerClient";

export const SIMVITALS_POST_TYPES = [
  "general_update",
  "staffing_alert",
  "faculty_note",
  "live_issue",
  "training_update",
  "system_notice",
] as const;

export const SIMVITALS_ROLES = ["sim_ops", "admin", "faculty", "sp", "system"] as const;
export const SIMVITALS_ATTACHMENTS_BUCKET = "simvitals-attachments";
export const SIMVITALS_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
export const SIMVITALS_SCHEMA_MESSAGE =
  "SimVitals database tables are not ready yet. Apply supabase/migrations/20260509_create_simvitals_tables.sql.";
export const SIMVITALS_ATTACHMENT_COLUMN_MESSAGE =
  "Attachment metadata is not available yet. SimVitals posts, comments, and acknowledgements are still operational.";
export const SIMVITALS_ATTACHMENT_BUCKET_MESSAGE =
  "Missing attachment bucket: simvitals-attachments.";

export type SimVitalsPostType = (typeof SIMVITALS_POST_TYPES)[number];
export type SimVitalsRole = (typeof SIMVITALS_ROLES)[number];

export type SimVitalsAttachmentMetadata = {
  fileName: string;
  path: string;
  url: string;
  mimeType: string;
  size: number;
  uploadedAt?: string;
  uploadedBy?: string;
};

export type SimVitalsViewer = {
  id: string;
  email: string;
  displayName: string;
  role: SimVitalsRole;
  accessToken: string;
};

export type SimVitalsContext = {
  db: SupabaseClient;
  viewer: SimVitalsViewer;
  refreshedTokens?: {
    accessToken: string;
    refreshToken: string;
  };
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function sanitizePathSegment(value: string) {
  return asText(value)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

export function sanitizeSimVitalsFileName(value: string) {
  const cleaned = normalizeSimVitalsAttachmentFileName(value)
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned || "simvitals-attachment";
}

export function normalizeSimVitalsAttachmentFileName(value: string) {
  const cleaned = asText(value)
    .replace(/[\\/]+/g, "-")
    .replace(/[\u0000-\u001f\u007f]+/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 180)
    .trim();

  return cleaned || "simvitals-attachment";
}

export function buildSimVitalsAttachmentPath(userId: string, fileName: string) {
  const safeUserId = sanitizePathSegment(userId) || "user";
  const safeFileName = sanitizeSimVitalsFileName(fileName);
  return `simvitals/${safeUserId}/${Date.now()}-${safeFileName}`;
}

export function getSimVitalsAttachmentContentType(path: string, fallback: string) {
  const lower = asText(path).toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return fallback || "application/octet-stream";
}

export function getSimVitalsAttachmentUrl(path: string, fileName: string, mode: "preview" | "download" = "download") {
  const params = new URLSearchParams({
    path,
    filename: fileName,
    mode,
  });
  return `/api/simvitals/attachments?${params.toString()}`;
}

export function validateSimVitalsAttachmentFile(args: {
  fileName: string;
  mimeType: string;
  size: number;
}) {
  const fileName = asText(args.fileName);
  const lowerName = fileName.toLowerCase();
  const mimeType = asText(args.mimeType).toLowerCase();
  const allowedExtensions = [".pdf", ".docx", ".xlsx", ".csv", ".png", ".jpg", ".jpeg"];
  const allowedMimeTypes = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "image/png",
    "image/jpeg",
  ]);

  if (!fileName) return "Attachment file name is required.";
  if (args.size <= 0) return "Selected attachment is empty.";
  if (args.size > SIMVITALS_ATTACHMENT_MAX_BYTES) {
    return `Attachment is too large. Maximum upload size is ${Math.round(
      SIMVITALS_ATTACHMENT_MAX_BYTES / (1024 * 1024)
    )} MB.`;
  }

  const extensionAllowed = allowedExtensions.some((extension) => lowerName.endsWith(extension));
  const mimeAllowed = allowedMimeTypes.has(mimeType);
  if (!extensionAllowed && !mimeAllowed) {
    return "Unsupported attachment type. Use PDF, DOCX, XLSX, CSV, PNG, or JPG.";
  }

  return "";
}

export function normalizeSimVitalsAttachmentMetadata(
  value: unknown,
  viewerId?: string
): SimVitalsAttachmentMetadata | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<SimVitalsAttachmentMetadata>;
  const fileName = normalizeSimVitalsAttachmentFileName(asText(source.fileName));
  const path = asText(source.path);
  if (!fileName || !path) return null;
  if (viewerId && !path.startsWith(`simvitals/${sanitizePathSegment(viewerId)}/`)) return null;
  const mimeType = getSimVitalsAttachmentContentType(path, asText(source.mimeType));
  const size = Math.max(0, Number(source.size) || 0);

  return {
    fileName,
    path,
    url: getSimVitalsAttachmentUrl(path, fileName),
    mimeType,
    size,
    uploadedAt: asText(source.uploadedAt),
    uploadedBy: asText(source.uploadedBy),
  };
}

export async function ensureSimVitalsAttachmentsBucket() {
  const admin = createSupabaseAdminClient();
  if (!admin) return;

  const { error } = await admin.storage.createBucket(SIMVITALS_ATTACHMENTS_BUCKET, {
    public: false,
    fileSizeLimit: `${SIMVITALS_ATTACHMENT_MAX_BYTES}`,
    allowedMimeTypes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "application/csv",
      "application/vnd.ms-excel",
      "image/png",
      "image/jpeg",
    ],
  });

  if (error && !/already exists/i.test(error.message)) {
    throw new Error(error.message || "Could not create SimVitals attachments bucket.");
  }
}

function normalizeRole(value: unknown): SimVitalsRole {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "super_admin" || role === "admin") return "admin";
  if (role === "sim_op" || role === "sim_ops") return "sim_ops";
  if (role === "faculty") return "faculty";
  if (role === "sp") return "sp";
  if (role === "system") return "system";
  return "sp";
}

function getDisplayName(user: User, profile: { full_name?: string | null; schedule_name?: string | null; email?: string | null } | null) {
  const profileName = asText(profile?.full_name) || asText(profile?.schedule_name);
  if (profileName) return profileName;

  const metadataName = asText(user.user_metadata?.full_name) || asText(user.user_metadata?.schedule_name);
  if (metadataName) return metadataName;

  const email = asText(profile?.email) || asText(user.email);
  const atIndex = email.indexOf("@");
  return atIndex > 0 ? email.slice(0, atIndex) : email || "CFSP Team";
}

function createViewerSupabaseClient(accessToken: string) {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown Supabase error";
}

export function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export function applySimVitalsAuthCookies(response: NextResponse, context: SimVitalsContext | null) {
  if (context?.refreshedTokens) {
    setAuthCookies(response, context.refreshedTokens);
  }
  return response;
}

export function unauthorizedSimVitalsResponse() {
  const response = jsonNoStore({ ok: false, error: "Unauthorized" }, { status: 401 });
  clearAuthCookies(response);
  return response;
}

export function normalizePostType(value: unknown): SimVitalsPostType {
  const normalized = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  return SIMVITALS_POST_TYPES.includes(normalized as SimVitalsPostType)
    ? (normalized as SimVitalsPostType)
    : "general_update";
}

export function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(
    new Set(
      value
        .map((item) => asText(item))
        .filter(Boolean)
        .slice(0, 8)
    )
  );
}

export function isMissingSimVitalsSchemaError(error: unknown) {
  const source = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const text = [source?.code, source?.message, source?.details, source?.hint].map(asText).join(" ");
  if (isMissingSimVitalsAttachmentColumnError(error)) return false;
  return isUnauthorizedSimVitalsDataError(error) || Boolean(getMissingSimVitalsCoreTable(error)) || /\b42P01\b|PGRST205/i.test(text);
}

export function getMissingSimVitalsCoreTable(error: unknown) {
  const source = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const text = [source?.code, source?.message, source?.details, source?.hint].map(asText).join(" ");
  const lowerText = text.toLowerCase();
  const coreTables = ["simvitals_posts", "simvitals_comments", "simvitals_reactions"];
  return coreTables.find((table) => lowerText.includes(table)) || "";
}

export function isMissingSimVitalsAttachmentColumnError(error: unknown) {
  const source = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const text = [source?.code, source?.message, source?.details, source?.hint].map(asText).join(" ");
  return /could not find .*attachment/i.test(text) || /column .*attachment/i.test(text);
}

export function isMissingSimVitalsAttachmentBucketError(error: unknown) {
  const source = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const text = [source?.code, source?.message, source?.details, source?.hint].map(asText).join(" ");
  return (
    /bucket.*not found/i.test(text) ||
    /not found.*bucket/i.test(text) ||
    /nosuchbucket/i.test(text) ||
    /simvitals-attachments.*not found/i.test(text)
  );
}

export function isUnauthorizedSimVitalsDataError(error: unknown) {
  const source = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const text = [source?.code, source?.message, source?.details, source?.hint].map(asText).join(" ");
  return /\b42501\b|permission denied|row-level security|unauthorized|not authorized/i.test(text);
}

export function getSimVitalsReadinessFailure(error: unknown) {
  if (isUnauthorizedSimVitalsDataError(error)) return "Unauthorized database access.";
  if (isMissingSimVitalsAttachmentColumnError(error)) return SIMVITALS_ATTACHMENT_COLUMN_MESSAGE;
  const missingTable = getMissingSimVitalsCoreTable(error);
  if (missingTable) return `Missing ${missingTable} table.`;
  if (isMissingSimVitalsAttachmentBucketError(error)) return SIMVITALS_ATTACHMENT_BUCKET_MESSAGE;
  return SIMVITALS_SCHEMA_MESSAGE;
}

export async function getAuthenticatedSimVitalsContext(): Promise<SimVitalsContext | null> {
  const cookieStore = await cookies();
  const accessToken = asText(cookieStore.get(AUTH_ACCESS_COOKIE)?.value);
  const refreshToken = asText(cookieStore.get(AUTH_REFRESH_COOKIE)?.value);

  if (!accessToken && !refreshToken) return null;

  const supabase = createSupabaseServerClient();
  let activeAccessToken = accessToken;
  let activeUser: User | null = null;
  let refreshedTokens: SimVitalsContext["refreshedTokens"];

  if (accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (!error && data.user) {
      activeUser = data.user;
    }
  }

  if (!activeUser && refreshToken) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    const refreshedAccessToken = asText(data.session?.access_token);
    const refreshedRefreshToken = asText(data.session?.refresh_token);
    const refreshedUser = data.user ?? data.session?.user ?? null;

    if (!error && refreshedUser && refreshedAccessToken && refreshedRefreshToken) {
      activeUser = refreshedUser;
      activeAccessToken = refreshedAccessToken;
      refreshedTokens = {
        accessToken: refreshedAccessToken,
        refreshToken: refreshedRefreshToken,
      };
    }
  }

  if (!activeUser || !activeAccessToken) return null;

  const profileResult = await getProfileForUser(activeUser.id, activeAccessToken);
  const profile = profileResult.profile;
  const viewer: SimVitalsViewer = {
    id: activeUser.id,
    email: asText(profile?.email) || asText(activeUser.email),
    displayName: getDisplayName(activeUser, profile),
    role: normalizeRole(profile?.role || activeUser.user_metadata?.role),
    accessToken: activeAccessToken,
  };
  const db = createSupabaseAdminClient() || createViewerSupabaseClient(activeAccessToken);

  if (!db) {
    throw new Error("Supabase is not configured for SimVitals.");
  }

  return {
    db,
    viewer,
    refreshedTokens,
  };
}
