import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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

export const dynamic = "force-dynamic";

const STORAGE_BUCKET = "training-materials";
const MATERIAL_KINDS = ["case_file", "doorsign", "supplemental_doc"] as const;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

type TrainingMaterialKind = (typeof MATERIAL_KINDS)[number];

type ViewerContext = {
  id: string;
  accessToken: string;
  refreshToken: string;
  email: string;
  fullName: string;
  scheduleName: string;
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

    return {
      id: auth.user.id,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      email: asText(profile?.email) || asText(auth.user.email),
      fullName: asText(profile?.full_name),
      scheduleName: asText(profile?.schedule_name),
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
        console.warn("Could not remove replaced training material:", cleanupResult.error.message);
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
