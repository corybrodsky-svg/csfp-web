import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  setAuthCookies,
} from "../../../lib/authCookies";
import { createSupabaseAdminClient } from "../../../lib/supabaseAdminClient";
import {
  supabaseKey,
  supabaseUrl,
} from "../../../lib/supabaseServerClient";
import { getProfileForUser } from "../../../lib/profileServer";
import { resolveSpAccountLink } from "../../../lib/spAccountLinking";
import { getOrganizationContext } from "../../../lib/organizationAuth";

export const dynamic = "force-dynamic";

const STORAGE_BUCKET = "training-materials";
const MATERIAL_KINDS = ["case_file", "doorsign", "supplemental_doc", "staffing_doc"] as const;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

type TrainingMaterialKind = (typeof MATERIAL_KINDS)[number];

type ViewerContext = {
  id: string;
  accessToken: string;
  refreshToken: string;
  email: string;
  fullName: string;
  scheduleName: string;
  role: string;
  linkedSpId: string;
  organizationId: string;
  refreshedTokens?: {
    accessToken: string;
    refreshToken: string;
  };
  shouldClearCookies?: boolean;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function logUploadFailure(stage: string, error: unknown, extra?: Record<string, unknown>) {
  const source = error && typeof error === "object"
    ? error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
    : null;
  console.error("[event-upload] failed", {
    stage,
    message: asText(source?.message) || getErrorMessage(error),
    code: asText(source?.code),
    details: asText(source?.details),
    hint: asText(source?.hint),
    ...(extra || {}),
  });
}

function sanitizePathSegment(value: string) {
  return asText(value)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function sanitizeFileName(value: string) {
  const cleaned = asText(value)
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned || "training-material";
}

function isTrainingMaterialKind(value: string): value is TrainingMaterialKind {
  return (MATERIAL_KINDS as readonly string[]).includes(value);
}

function normalizeRole(value: unknown) {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "sp" || role === "sim_op" || role === "admin" || role === "super_admin") {
    return role;
  }
  return "unknown";
}

function normalizeEmail(value: unknown) {
  return asText(value).toLowerCase();
}

function normalizeMatchValue(value: unknown) {
  return asText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function getEffectiveRole(email: unknown, role: unknown) {
  const normalizedEmail = asText(email).toLowerCase();
  const localPart = normalizedEmail.split("@")[0] || "";
  if (localPart === "cory.brodsky") return "super_admin";
  if (normalizedEmail === "cwb55@drexel.edu") {
    const normalizedRole = normalizeRole(role);
    if (normalizedRole === "super_admin" || normalizedRole === "admin" || normalizedRole === "sim_op") {
      return normalizedRole;
    }
    return "admin";
  }
  return normalizeRole(role);
}

function getUploadedBy(viewer: ViewerContext) {
  return viewer.fullName || viewer.scheduleName || viewer.email || viewer.id;
}

async function getAuthenticatedViewer(): Promise<ViewerContext | null> {
  try {
    const organizationContext = await getOrganizationContext();
    if (!organizationContext.user || !organizationContext.activeOrganization || !organizationContext.role) return null;

    const profile = organizationContext.profile || (await getProfileForUser(organizationContext.user.id, organizationContext.accessToken)).profile;
    const email = asText(profile?.email) || asText(organizationContext.user.email);
    const activeOrganizationId = asText(organizationContext.activeOrganization?.id);
    const membershipSpId = asText(
      (
        organizationContext.memberships.find(
          (membership) =>
            asText(membership.user_id) === asText(organizationContext.user?.id) &&
            asText(membership.organization_id) === activeOrganizationId
        ) as { sp_id?: unknown } | undefined
      )?.sp_id
    );
    const spLink = await resolveSpAccountLink({
      user: organizationContext.user,
      profile: profile || null,
      accessToken: organizationContext.accessToken,
      organizationId: activeOrganizationId || null,
      membershipSpId: membershipSpId || null,
    });

    return {
      id: organizationContext.user.id,
      accessToken: organizationContext.accessToken,
      refreshToken: organizationContext.refreshToken,
      email,
      fullName: asText(profile?.full_name),
      scheduleName: asText(profile?.schedule_name),
      role: organizationContext.legacyRole || getEffectiveRole(email, profile?.role || organizationContext.user.user_metadata?.role),
      linkedSpId: asText(spLink.sp_id),
      organizationId: organizationContext.activeOrganization.id,
      refreshedTokens: organizationContext.refreshedTokens || undefined,
      shouldClearCookies: organizationContext.shouldClearCookies,
    };
  } catch {
    return null;
  }
}

function applyAuthCookies(response: NextResponse, viewer: ViewerContext | null) {
  if (!viewer) return response;

  if (viewer.refreshedTokens) {
    setAuthCookies(response, viewer.refreshedTokens);
  }

  return response;
}

function unauthorizedResponse(viewer?: ViewerContext | null) {
  const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (viewer?.shouldClearCookies) {
    clearAuthCookies(response);
  }
  return response;
}

function createViewerStorageClient(viewer: ViewerContext) {
  if (!supabaseUrl || !supabaseKey || !viewer.accessToken) return null;

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${viewer.accessToken}`,
      },
    },
  });
}

function getEventAccessClient(viewer: ViewerContext) {
  return createSupabaseAdminClient() || createViewerStorageClient(viewer);
}

function viewerCanManageMaterials(viewer: ViewerContext) {
  return viewer.role === "super_admin" || viewer.role === "admin" || viewer.role === "sim_op";
}

function canUseLegacyNullOrganizationEvent(viewer: ViewerContext) {
  return viewer.role === "super_admin";
}

async function ensureTrainingMaterialsBucket() {
  const admin = createSupabaseAdminClient();
  if (!admin) return;

  const { error } = await admin.storage.createBucket(STORAGE_BUCKET, {
    public: true,
    fileSizeLimit: "25MB",
  });

  if (error && !/already exists/i.test(error.message)) {
    throw new Error(error.message || "Could not create training materials bucket.");
  }
}

function buildStoragePath(eventId: string, kind: TrainingMaterialKind, fileName: string) {
  const safeEventId = sanitizePathSegment(eventId) || "event";
  const safeKind = sanitizePathSegment(kind) || "material";
  const safeName = sanitizeFileName(fileName);
  return `events/${safeEventId}/${safeKind}/${Date.now()}-${safeName}`;
}

async function getEventExists(viewer: ViewerContext, eventId: string) {
  const supabase = getEventAccessClient(viewer);
  if (!supabase) {
    throw new Error("Training material storage is not configured.");
  }

  const { data, error } = await supabase
    .from("events")
    .select("id,organization_id")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Could not verify event.");
  }

  if (!data?.id) return false;
  const eventOrganizationId = asText((data as { organization_id?: unknown }).organization_id);
  return eventOrganizationId === viewer.organizationId || (!eventOrganizationId && canUseLegacyNullOrganizationEvent(viewer));
}

async function viewerCanAccessEvent(viewer: ViewerContext, eventId: string) {
  const supabase = getEventAccessClient(viewer);
  if (!supabase) {
    throw new Error("Training material storage is not configured.");
  }

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id,organization_id")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    throw new Error(eventError.message || "Could not verify event.");
  }

  if (!event?.id) return false;
  const eventOrganizationId = asText((event as { organization_id?: unknown }).organization_id);
  if (eventOrganizationId !== viewer.organizationId && !(canUseLegacyNullOrganizationEvent(viewer) && !eventOrganizationId)) return false;
  if (viewer.role !== "sp") return true;

  const { data: assignments, error: assignmentError } = await supabase
    .from("event_sps")
    .select("sp_id")
    .eq("event_id", eventId)
    .eq("organization_id", viewer.organizationId);

  if (assignmentError) {
    throw new Error(assignmentError.message || "Could not verify event assignments.");
  }

  const assignedSpIds = new Set(((assignments || []) as Array<{ sp_id?: string | null }>).map((item) => asText(item.sp_id)).filter(Boolean));
  if (viewer.linkedSpId && assignedSpIds.has(viewer.linkedSpId)) return true;

  const candidateIds = Array.from(assignedSpIds);
  if (!candidateIds.length) return false;

  const { data: sps, error: spsError } = await supabase
    .from("sps")
    .select("id,first_name,last_name,full_name,working_email,email")
    .in("id", candidateIds)
    .eq("organization_id", viewer.organizationId);

  if (spsError) {
    throw new Error(spsError.message || "Could not verify SP access.");
  }

  const viewerEmails = new Set([normalizeEmail(viewer.email)].filter(Boolean));
  const viewerNames = new Set(
    [normalizeMatchValue(viewer.fullName), normalizeMatchValue(viewer.scheduleName)].filter(Boolean)
  );

  return (sps || []).some((sp) => {
    const spEmails = [normalizeEmail(sp.working_email), normalizeEmail(sp.email)].filter(Boolean);
    const spName =
      normalizeMatchValue(sp.full_name) ||
      normalizeMatchValue([asText(sp.first_name), asText(sp.last_name)].filter(Boolean).join(" "));
    return spEmails.some((email) => viewerEmails.has(email)) || (spName && viewerNames.has(spName));
  });
}

function getContentTypeFromPath(path: string, fallback: string) {
  const lower = asText(path).toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
  if (lower.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".csv")) return "text/csv; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  return fallback || "application/octet-stream";
}

function buildDownloadName(path: string, filename: string) {
  return sanitizeFileName(filename || path.split("/").pop() || "training-material");
}

function getFileExtension(path: string, filename: string) {
  const source = `${filename || ""} ${path || ""}`.toLowerCase();
  const match = source.match(/\.([a-z0-9]+)(?:\s|$)/);
  return match?.[1] || "";
}

function isUnsupportedInlinePreviewExtension(extension: string) {
  return ["csv", "doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(extension.toLowerCase());
}

export async function GET(request: Request) {
  try {
    const viewer = await getAuthenticatedViewer();
    if (!viewer) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const eventId = asText(searchParams.get("eventId"));
    const path = asText(searchParams.get("path"));
    const filename = asText(searchParams.get("filename"));
    const mode = asText(searchParams.get("mode")).toLowerCase() === "download" ? "download" : "preview";

    if (!eventId || !path) {
      return applyAuthCookies(
        NextResponse.json({ error: "Event id and storage path are required." }, { status: 400 }),
        viewer
      );
    }

    const canAccess = await viewerCanAccessEvent(viewer, eventId);
    if (!canAccess) {
      return applyAuthCookies(
        NextResponse.json({ error: "You do not have access to this event." }, { status: 403 }),
        viewer
      );
    }

    const storageClient = createSupabaseAdminClient() || createViewerStorageClient(viewer);
    if (!storageClient) {
      return applyAuthCookies(
        NextResponse.json(
          { error: "Training material preview is not configured yet." },
          { status: 500 }
        ),
        viewer
      );
    }

    const downloadResult = await storageClient.storage.from(STORAGE_BUCKET).download(path);
    if (downloadResult.error || !downloadResult.data) {
      console.warn("[event-upload] storage download failed", { mode });
      return applyAuthCookies(
        NextResponse.json(
          { error: downloadResult.error?.message || "Could not load training material." },
          { status: 404 }
        ),
        viewer
      );
    }

    const file = downloadResult.data;
    const arrayBuffer = await file.arrayBuffer();
    const contentType = getContentTypeFromPath(path, file.type || "application/octet-stream");

    if (mode === "preview" && isUnsupportedInlinePreviewExtension(getFileExtension(path, filename))) {
      return applyAuthCookies(
        NextResponse.json(
          { error: "Preview is not available for this file type. Download to view." },
          {
            status: 415,
            headers: {
              "Cache-Control": "private, no-store, max-age=0",
              "X-Content-Type-Options": "nosniff",
            },
          }
        ),
        viewer
      );
    }

    const dispositionType = mode === "download" ? "attachment" : "inline";
    const response = new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${dispositionType}; filename="${buildDownloadName(path, filename)}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });

    return applyAuthCookies(response, viewer);
  } catch (error) {
    logUploadFailure("download-catch", error);
    return NextResponse.json(
      { error: "Could not load training material. Please refresh and try again." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const viewer = await getAuthenticatedViewer();
    if (!viewer) return unauthorizedResponse();

    const formData = await request.formData();
    const eventId = asText(formData.get("eventId"));
    const kind = asText(formData.get("kind"));
    const replacePath = asText(formData.get("replacePath"));
    const file = formData.get("file");

    if (!eventId || !kind || !(file instanceof File)) {
      return applyAuthCookies(
        NextResponse.json(
          { error: "Event id, material type, and file are required." },
          { status: 400 }
        ),
        viewer
      );
    }

    if (!isTrainingMaterialKind(kind)) {
      return applyAuthCookies(
        NextResponse.json({ error: "Unsupported training material type." }, { status: 400 }),
        viewer
      );
    }

    if (file.size <= 0) {
      return applyAuthCookies(
        NextResponse.json({ error: "Selected file is empty." }, { status: 400 }),
        viewer
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return applyAuthCookies(
        NextResponse.json(
          {
            error: `File is too large. Maximum upload size is ${Math.round(
              MAX_UPLOAD_BYTES / (1024 * 1024)
            )} MB.`,
          },
          { status: 400 }
        ),
        viewer
      );
    }

    if (!viewerCanManageMaterials(viewer)) {
      return applyAuthCookies(
        NextResponse.json({ error: "Only Sim Ops or admin accounts can upload event materials." }, { status: 403 }),
        viewer
      );
    }

    const eventExists = await getEventExists(viewer, eventId);
    if (!eventExists) {
      return applyAuthCookies(
        NextResponse.json({ error: "Event not found." }, { status: 404 }),
        viewer
      );
    }

    await ensureTrainingMaterialsBucket();

    const storageClient = createSupabaseAdminClient() || createViewerStorageClient(viewer);
    if (!storageClient) {
      return applyAuthCookies(
        NextResponse.json(
          {
            error:
              "Training material uploads are not configured yet. Add SUPABASE_SERVICE_ROLE_KEY or storage upload permissions.",
          },
          { status: 500 }
        ),
        viewer
      );
    }

    const storagePath = buildStoragePath(eventId, kind, file.name);
    const uploadResult = await storageClient.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, {
        cacheControl: "3600",
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadResult.error) {
      logUploadFailure("storage-upload", uploadResult.error, { eventId, kind, userEmail: viewer.email });
      return applyAuthCookies(
        NextResponse.json(
          { error: "Could not upload training material. Please refresh and try again." },
          { status: 500 }
        ),
        viewer
      );
    }

    if (replacePath && replacePath !== storagePath) {
      const cleanupResult = await storageClient.storage.from(STORAGE_BUCKET).remove([replacePath]);
      if (cleanupResult.error) {
        console.warn("[event-upload] replaced file cleanup failed", { eventId, kind });
      }
    }

    const { data: publicUrlData } = storageClient.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    return applyAuthCookies(
      NextResponse.json({
        ok: true,
        material: {
          kind,
          filename: file.name,
          uploaded_at: new Date().toISOString(),
          uploaded_by: getUploadedBy(viewer),
          storage_path: storagePath,
          url: publicUrlData.publicUrl || "",
        },
      }),
      viewer
    );
  } catch (error) {
    logUploadFailure("upload-catch", error);
    return NextResponse.json(
      { error: "Could not upload training material. Please refresh and try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const viewer = await getAuthenticatedViewer();
    if (!viewer) return unauthorizedResponse();

    const body = (await request.json().catch(() => null)) as
      | { eventId?: unknown; path?: unknown }
      | null;

    const eventId = asText(body?.eventId);
    const path = asText(body?.path);

    if (!eventId || !path) {
      return applyAuthCookies(
        NextResponse.json({ error: "Event id and storage path are required." }, { status: 400 }),
        viewer
      );
    }

    if (!viewerCanManageMaterials(viewer)) {
      return applyAuthCookies(
        NextResponse.json({ error: "Only Sim Ops or admin accounts can remove event materials." }, { status: 403 }),
        viewer
      );
    }

    const eventExists = await getEventExists(viewer, eventId);
    if (!eventExists) {
      return applyAuthCookies(
        NextResponse.json({ error: "Event not found." }, { status: 404 }),
        viewer
      );
    }

    const storageClient = createSupabaseAdminClient() || createViewerStorageClient(viewer);
    if (!storageClient) {
      return applyAuthCookies(
        NextResponse.json(
          {
            error:
              "Training material removal is not configured yet. Add SUPABASE_SERVICE_ROLE_KEY or storage upload permissions.",
          },
          { status: 500 }
        ),
        viewer
      );
    }

    const removeResult = await storageClient.storage.from(STORAGE_BUCKET).remove([path]);
    if (removeResult.error) {
      logUploadFailure("storage-remove", removeResult.error, { eventId, path, userEmail: viewer.email });
      return applyAuthCookies(
        NextResponse.json(
          { error: "Could not remove training material. Please refresh and try again." },
          { status: 500 }
        ),
        viewer
      );
    }

    return applyAuthCookies(NextResponse.json({ ok: true }), viewer);
  } catch (error) {
    logUploadFailure("remove-catch", error);
    return NextResponse.json(
      { error: "Could not remove training material. Please refresh and try again." },
      { status: 500 }
    );
  }
}
