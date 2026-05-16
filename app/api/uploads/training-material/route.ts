import { createClient } from "@supabase/supabase-js";
import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import sanitizeHtml from "sanitize-html";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "../../../lib/authCookies";
import { createSupabaseAdminClient } from "../../../lib/supabaseAdminClient";
import {
  createSupabaseServerClient,
  supabaseKey,
  supabaseUrl,
} from "../../../lib/supabaseServerClient";
import { getProfileForUser } from "../../../lib/profileServer";
import { resolveSpAccountLink } from "../../../lib/spAccountLinking";

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
  refreshedTokens?: {
    accessToken: string;
    refreshToken: string;
  };
  shouldClearCookies?: boolean;
};

type AuthenticatedUserResult = {
  accessToken: string;
  refreshToken: string;
  user: Awaited<
    ReturnType<ReturnType<typeof createSupabaseServerClient>["auth"]["getUser"]>
  >["data"]["user"] | null;
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

async function getAuthenticatedUser(): Promise<AuthenticatedUserResult> {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value || "";
    const refreshToken = cookieStore.get(AUTH_REFRESH_COOKIE)?.value || "";

    if (!accessToken && !refreshToken) {
      return { accessToken: "", refreshToken: "", user: null };
    }

    const supabase = createSupabaseServerClient();

    if (accessToken) {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(accessToken);

      if (!error && user) {
        return { accessToken, refreshToken, user };
      }
    }

    if (!refreshToken) {
      return {
        accessToken,
        refreshToken,
        user: null,
        shouldClearCookies: true,
      };
    }

    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    const refreshedAccessToken = asText(data.session?.access_token);
    const refreshedRefreshToken = asText(data.session?.refresh_token);
    const refreshedUser = data.user ?? data.session?.user ?? null;

    if (error || !refreshedUser || !refreshedAccessToken || !refreshedRefreshToken) {
      return {
        accessToken,
        refreshToken,
        user: null,
        shouldClearCookies: true,
      };
    }

    return {
      accessToken: refreshedAccessToken,
      refreshToken: refreshedRefreshToken,
      user: refreshedUser,
      refreshedTokens: {
        accessToken: refreshedAccessToken,
        refreshToken: refreshedRefreshToken,
      },
    };
  } catch {
    return { accessToken: "", refreshToken: "", user: null };
  }
}

async function getAuthenticatedViewer(): Promise<ViewerContext | null> {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth.user) return null;

    const profileResult = await getProfileForUser(auth.user.id, auth.accessToken);
    const profile = profileResult.profile;
    const email = asText(profile?.email) || asText(auth.user.email);
    const spLink = await resolveSpAccountLink({
      user: auth.user,
      profile: profile || null,
      accessToken: auth.accessToken,
    });

    return {
      id: auth.user.id,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      email,
      fullName: asText(profile?.full_name),
      scheduleName: asText(profile?.schedule_name),
      role: getEffectiveRole(email, profile?.role || auth.user.user_metadata?.role),
      linkedSpId: asText(spLink.sp_id),
      refreshedTokens: auth.refreshedTokens,
      shouldClearCookies: auth.shouldClearCookies,
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

async function getEventExists(eventId: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Could not verify event.");
  }

  return Boolean(data?.id);
}

async function viewerCanAccessEvent(viewer: ViewerContext, eventId: string) {
  const supabase = createSupabaseServerClient();
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    throw new Error(eventError.message || "Could not verify event.");
  }

  if (!event?.id) return false;
  if (viewer.role !== "sp") return true;

  const { data: assignments, error: assignmentError } = await supabase
    .from("event_sps")
    .select("sp_id")
    .eq("event_id", eventId);

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
    .in("id", candidateIds);

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

function buildDocxPreviewHtml(args: {
  title: string;
  bodyHtml: string;
  messages: string[];
}) {
  const safeTitle = sanitizeHtml(args.title || "DOCX Preview", { allowedTags: [], allowedAttributes: {} });
  const safeBody = sanitizeHtml(args.bodyHtml, {
    allowedTags: [
      "a",
      "b",
      "blockquote",
      "br",
      "caption",
      "code",
      "em",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "i",
      "li",
      "ol",
      "p",
      "pre",
      "s",
      "span",
      "strong",
      "sub",
      "sup",
      "table",
      "tbody",
      "td",
      "tfoot",
      "th",
      "thead",
      "tr",
      "u",
      "ul",
    ],
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noreferrer",
      }),
    },
  });
  const safeMessages = args.messages
    .map((message) => sanitizeHtml(message, { allowedTags: [], allowedAttributes: {} }))
    .filter(Boolean);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; base-uri 'none'; form-action 'none'" />
    <title>${safeTitle}</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        background: #f8fbfd;
        color: #102a43;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.58;
      }
      .cfsp-docx-preview {
        box-sizing: border-box;
        max-width: 860px;
        margin: 0 auto;
        padding: 32px;
        background: #ffffff;
        min-height: 100vh;
        box-shadow: 0 18px 44px rgba(21, 48, 72, 0.08);
      }
      h1, h2, h3, h4, h5, h6 { color: #0f2740; line-height: 1.2; margin: 1.2em 0 0.45em; }
      p { margin: 0 0 0.9em; }
      ul, ol { margin: 0 0 1em 1.35em; padding: 0; }
      li { margin: 0.25em 0; }
      table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.95rem; }
      th, td { border: 1px solid #d6e2ea; padding: 8px 10px; vertical-align: top; }
      th { background: #eef7fa; color: #14324a; font-weight: 800; }
      blockquote { margin: 1em 0; padding: 0.8em 1em; border-left: 4px solid #2cb8ad; background: #effafa; color: #26485e; }
      code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      pre { white-space: pre-wrap; background: #eef3f7; padding: 12px; border-radius: 8px; overflow: auto; }
      a { color: #087f8c; font-weight: 700; }
      .cfsp-docx-warning {
        margin-top: 24px;
        border: 1px solid #f3d38b;
        background: #fff8e6;
        color: #7a4b10;
        border-radius: 12px;
        padding: 12px 14px;
        font-size: 0.88rem;
        font-weight: 700;
      }
      @media (max-width: 700px) {
        .cfsp-docx-preview { padding: 20px; }
      }
    </style>
  </head>
  <body>
    <main class="cfsp-docx-preview">
      ${safeBody || "<p>This DOCX file did not contain readable preview text.</p>"}
      ${
        safeMessages.length
          ? `<section class="cfsp-docx-warning">Preview notes: ${safeMessages.join(" ")}</section>`
          : ""
      }
    </main>
  </body>
</html>`;
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
      console.warn("[materials] storage download failed", {
        mode,
        error: downloadResult.error?.message || "No storage object returned",
      });
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

    if (mode === "preview" && getFileExtension(path, filename) === "docx") {
      const converted = await mammoth.convertToHtml({
        buffer: Buffer.from(arrayBuffer),
      });
      const html = buildDocxPreviewHtml({
        title: buildDownloadName(path, filename),
        bodyHtml: converted.value,
        messages: converted.messages.map((message) => message.message),
      });
      const response = new NextResponse(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `inline; filename="${buildDownloadName(path, filename).replace(/\.docx$/i, ".html")}"`,
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; base-uri 'none'; form-action 'none'",
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
        },
      });

      return applyAuthCookies(response, viewer);
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
    console.error("[materials] request failed", {
      error: getErrorMessage(error),
    });
    return NextResponse.json(
      { error: `Supabase request failed: ${getErrorMessage(error)}` },
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

    const eventExists = await getEventExists(eventId);
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
      return applyAuthCookies(
        NextResponse.json(
          { error: uploadResult.error.message || "Could not upload training material." },
          { status: 500 }
        ),
        viewer
      );
    }

    if (replacePath && replacePath !== storagePath) {
      const cleanupResult = await storageClient.storage.from(STORAGE_BUCKET).remove([replacePath]);
      if (cleanupResult.error) {
        console.warn("[materials] replaced file cleanup failed", {
          error: cleanupResult.error.message,
        });
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
    return NextResponse.json(
      { error: `Supabase request failed: ${getErrorMessage(error)}` },
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

    const eventExists = await getEventExists(eventId);
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
      return applyAuthCookies(
        NextResponse.json(
          { error: removeResult.error.message || "Could not remove training material." },
          { status: 500 }
        ),
        viewer
      );
    }

    return applyAuthCookies(NextResponse.json({ ok: true }), viewer);
  } catch (error) {
    return NextResponse.json(
      { error: `Supabase request failed: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}
