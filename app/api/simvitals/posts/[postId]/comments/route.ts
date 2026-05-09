import {
  applySimVitalsAuthCookies,
  getAuthenticatedSimVitalsContext,
  getErrorMessage,
  getSimVitalsReadinessFailure,
  isMissingSimVitalsSchemaError,
  jsonNoStore,
  unauthorizedSimVitalsResponse,
  type SimVitalsRole,
} from "../../../_lib";

export const dynamic = "force-dynamic";

type SimVitalsCommentRow = {
  id: string;
  post_id: string;
  author_user_id: string;
  author_name: string | null;
  author_role: string | null;
  body: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeRole(value: unknown): SimVitalsRole {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "sim_ops" || role === "sim_op") return "sim_ops";
  if (role === "admin" || role === "super_admin") return "admin";
  if (role === "faculty") return "faculty";
  if (role === "sp") return "sp";
  if (role === "system") return "system";
  return "sp";
}

function getRoutePostId(params: { postId?: string | string[] }) {
  const raw = params.postId;
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
}

function toCommentResponse(row: SimVitalsCommentRow) {
  return {
    id: row.id,
    postId: asText(row.post_id),
    authorUserId: asText(row.author_user_id),
    authorName: asText(row.author_name) || "CFSP Team",
    authorRole: normalizeRole(row.author_role),
    body: asText(row.body),
    createdAt: asText(row.created_at),
    updatedAt: asText(row.updated_at),
  };
}

async function getCommentCount(
  context: NonNullable<Awaited<ReturnType<typeof getAuthenticatedSimVitalsContext>>>,
  postId: string
) {
  const { count, error } = await context.db
    .from("simvitals_comments")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId);

  if (error) throw error;
  return count || 0;
}

export async function GET(
  _request: Request,
  contextParams: { params: Promise<{ postId?: string | string[] }> }
) {
  let context: Awaited<ReturnType<typeof getAuthenticatedSimVitalsContext>> = null;

  try {
    context = await getAuthenticatedSimVitalsContext();
    if (!context) return unauthorizedSimVitalsResponse();

    const params = await contextParams.params;
    const postId = getRoutePostId(params);
    if (!postId) {
      return applySimVitalsAuthCookies(
        jsonNoStore({ ok: false, error: "Missing SimVitals post id." }, { status: 400 }),
        context
      );
    }

    const { data, error } = await context.db
      .from("simvitals_comments")
      .select("id,post_id,author_user_id,author_name,author_role,body,created_at,updated_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return applySimVitalsAuthCookies(
      jsonNoStore({
        ok: true,
        comments: ((data || []) as SimVitalsCommentRow[]).map(toCommentResponse),
      }),
      context
    );
  } catch (error) {
    if (isMissingSimVitalsSchemaError(error)) {
      return applySimVitalsAuthCookies(
        jsonNoStore(
          {
            ok: false,
            error: getSimVitalsReadinessFailure(error),
            migration: "supabase/migrations/20260509_create_simvitals_tables.sql",
          },
          { status: 503 }
        ),
        context
      );
    }

    return applySimVitalsAuthCookies(
      jsonNoStore(
        {
          ok: false,
          error: `Could not load SimVitals comments: ${getErrorMessage(error)}`,
        },
        { status: 500 }
      ),
      context
    );
  }
}

export async function POST(
  request: Request,
  contextParams: { params: Promise<{ postId?: string | string[] }> }
) {
  let context: Awaited<ReturnType<typeof getAuthenticatedSimVitalsContext>> = null;

  try {
    context = await getAuthenticatedSimVitalsContext();
    if (!context) return unauthorizedSimVitalsResponse();

    const params = await contextParams.params;
    const postId = getRoutePostId(params);
    if (!postId) {
      return applySimVitalsAuthCookies(
        jsonNoStore({ ok: false, error: "Missing SimVitals post id." }, { status: 400 }),
        context
      );
    }

    const body = (await request.json().catch(() => null)) as { body?: unknown } | null;
    const commentBody = asText(body?.body);
    if (!commentBody) {
      return applySimVitalsAuthCookies(
        jsonNoStore({ ok: false, error: "Comment body is required." }, { status: 400 }),
        context
      );
    }

    const { data, error } = await context.db
      .from("simvitals_comments")
      .insert({
        post_id: postId,
        author_user_id: context.viewer.id,
        author_name: context.viewer.displayName,
        author_role: context.viewer.role,
        body: commentBody.slice(0, 2500),
      })
      .select("id,post_id,author_user_id,author_name,author_role,body,created_at,updated_at")
      .single();

    if (error) throw error;

    const commentCount = await getCommentCount(context, postId);
    return applySimVitalsAuthCookies(
      jsonNoStore(
        {
          ok: true,
          comment: toCommentResponse(data as SimVitalsCommentRow),
          commentCount,
        },
        { status: 201 }
      ),
      context
    );
  } catch (error) {
    if (isMissingSimVitalsSchemaError(error)) {
      return applySimVitalsAuthCookies(
        jsonNoStore(
          {
            ok: false,
            error: getSimVitalsReadinessFailure(error),
            migration: "supabase/migrations/20260509_create_simvitals_tables.sql",
          },
          { status: 503 }
        ),
        context
      );
    }

    return applySimVitalsAuthCookies(
      jsonNoStore(
        {
          ok: false,
          error: `Could not create SimVitals comment: ${getErrorMessage(error)}`,
        },
        { status: 500 }
      ),
      context
    );
  }
}
