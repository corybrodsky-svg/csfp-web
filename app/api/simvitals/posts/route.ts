import {
  applySimVitalsAuthCookies,
  getAuthenticatedSimVitalsContext,
  getErrorMessage,
  isMissingSimVitalsSchemaError,
  jsonNoStore,
  normalizeSimVitalsAttachmentMetadata,
  normalizePostType,
  normalizeTags,
  SIMVITALS_SCHEMA_MESSAGE,
  unauthorizedSimVitalsResponse,
  type SimVitalsAttachmentMetadata,
  type SimVitalsPostType,
  type SimVitalsRole,
} from "../_lib";

export const dynamic = "force-dynamic";

type SimVitalsPostRow = {
  id: string;
  author_user_id: string;
  author_name: string | null;
  author_role: string | null;
  post_type: string | null;
  body: string | null;
  linked_event_id: string | null;
  linked_event_name: string | null;
  tags: string[] | null;
  attachment: SimVitalsAttachmentMetadata | null;
  created_at: string | null;
  updated_at: string | null;
};

const DEFAULT_TAG_BY_TYPE: Record<SimVitalsPostType, string> = {
  general_update: "Ops",
  staffing_alert: "Staffing",
  faculty_note: "Faculty",
  live_issue: "Live",
  training_update: "Training",
  system_notice: "System",
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

function toPostResponse(
  row: SimVitalsPostRow,
  counts: {
    reactionsByPostId: Map<string, number>;
    commentsByPostId: Map<string, number>;
    acknowledgedPostIds: Set<string>;
  }
) {
  return {
    id: row.id,
    authorUserId: asText(row.author_user_id),
    authorName: asText(row.author_name) || "CFSP Team",
    authorRole: normalizeRole(row.author_role),
    type: normalizePostType(row.post_type),
    body: asText(row.body),
    linkedEventId: asText(row.linked_event_id) || null,
    linkedEventName: asText(row.linked_event_name) || null,
    tags: Array.isArray(row.tags) ? row.tags.map(asText).filter(Boolean) : [],
    attachment: normalizeSimVitalsAttachmentMetadata(row.attachment),
    reactionCount: counts.reactionsByPostId.get(row.id) || 0,
    commentCount: counts.commentsByPostId.get(row.id) || 0,
    acknowledgedByViewer: counts.acknowledgedPostIds.has(row.id),
    createdAt: asText(row.created_at),
    updatedAt: asText(row.updated_at),
  };
}

function incrementCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) || 0) + 1);
}

async function getPostCounts(
  context: NonNullable<Awaited<ReturnType<typeof getAuthenticatedSimVitalsContext>>>,
  postIds: string[]
) {
  const reactionsByPostId = new Map<string, number>();
  const commentsByPostId = new Map<string, number>();
  const acknowledgedPostIds = new Set<string>();

  if (!postIds.length) {
    return { reactionsByPostId, commentsByPostId, acknowledgedPostIds };
  }

  const { data: reactions, error: reactionsError } = await context.db
    .from("simvitals_reactions")
    .select("post_id,user_id,reaction_type")
    .in("post_id", postIds)
    .eq("reaction_type", "ack");

  if (reactionsError) throw reactionsError;

  (reactions || []).forEach((reaction) => {
    const postId = asText(reaction.post_id);
    if (!postId) return;
    incrementCount(reactionsByPostId, postId);
    if (asText(reaction.user_id) === context.viewer.id) acknowledgedPostIds.add(postId);
  });

  const { data: comments, error: commentsError } = await context.db
    .from("simvitals_comments")
    .select("post_id")
    .in("post_id", postIds);

  if (commentsError) throw commentsError;

  (comments || []).forEach((comment) => {
    const postId = asText(comment.post_id);
    if (postId) incrementCount(commentsByPostId, postId);
  });

  return { reactionsByPostId, commentsByPostId, acknowledgedPostIds };
}

export async function GET(request: Request) {
  let context: Awaited<ReturnType<typeof getAuthenticatedSimVitalsContext>> = null;

  try {
    context = await getAuthenticatedSimVitalsContext();
    if (!context) return unauthorizedSimVitalsResponse();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50));
    const typeFilter = asText(searchParams.get("type"));
    const normalizedType = typeFilter && typeFilter !== "all" ? normalizePostType(typeFilter) : "";

    let query = context.db
      .from("simvitals_posts")
      .select("id,author_user_id,author_name,author_role,post_type,body,linked_event_id,linked_event_name,tags,attachment,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (normalizedType) {
      query = query.eq("post_type", normalizedType);
    }

    const { data, error } = await query;
    if (error) throw error;

    const posts = (data || []) as SimVitalsPostRow[];
    const counts = await getPostCounts(
      context,
      posts.map((post) => post.id).filter(Boolean)
    );
    const response = jsonNoStore({
      ok: true,
      schemaReady: true,
      posts: posts.map((post) => toPostResponse(post, counts)),
    });

    return applySimVitalsAuthCookies(response, context);
  } catch (error) {
    if (isMissingSimVitalsSchemaError(error)) {
      return applySimVitalsAuthCookies(
        jsonNoStore({
          ok: true,
          schemaReady: false,
          migration:
            "supabase/migrations/20260509_create_simvitals_tables.sql and supabase/migrations/20260509_add_simvitals_post_attachments.sql",
          warning: SIMVITALS_SCHEMA_MESSAGE,
          posts: [],
        }),
        context
      );
    }

    return applySimVitalsAuthCookies(
      jsonNoStore(
        {
          ok: false,
          error: `Could not load SimVitals posts: ${getErrorMessage(error)}`,
        },
        { status: 500 }
      ),
      context
    );
  }
}

export async function POST(request: Request) {
  let context: Awaited<ReturnType<typeof getAuthenticatedSimVitalsContext>> = null;

  try {
    context = await getAuthenticatedSimVitalsContext();
    if (!context) return unauthorizedSimVitalsResponse();

    const body = (await request.json().catch(() => null)) as
      | {
          body?: unknown;
          postType?: unknown;
          post_type?: unknown;
          linkedEventId?: unknown;
          linked_event_id?: unknown;
          linkedEventName?: unknown;
          linked_event_name?: unknown;
          tags?: unknown;
          attachment?: unknown;
        }
      | null;
    const postBody = asText(body?.body);
    if (!postBody) {
      return applySimVitalsAuthCookies(
        jsonNoStore({ ok: false, error: "Post body is required." }, { status: 400 }),
        context
      );
    }

    const postType = normalizePostType(body?.postType ?? body?.post_type);
    const tags = normalizeTags(body?.tags);
    const linkedEventId = asText(body?.linkedEventId ?? body?.linked_event_id) || null;
    const linkedEventName = asText(body?.linkedEventName ?? body?.linked_event_name) || null;
    const attachment = normalizeSimVitalsAttachmentMetadata(body?.attachment, context.viewer.id);
    if (body?.attachment && !attachment) {
      return applySimVitalsAuthCookies(
        jsonNoStore({ ok: false, error: "Attachment metadata could not be verified." }, { status: 400 }),
        context
      );
    }

    const { data, error } = await context.db
      .from("simvitals_posts")
      .insert({
        author_user_id: context.viewer.id,
        author_name: context.viewer.displayName,
        author_role: context.viewer.role,
        post_type: postType,
        body: postBody.slice(0, 5000),
        linked_event_id: linkedEventId,
        linked_event_name: linkedEventName,
        tags: tags.length ? tags : [DEFAULT_TAG_BY_TYPE[postType]],
        attachment,
      })
      .select("id,author_user_id,author_name,author_role,post_type,body,linked_event_id,linked_event_name,tags,attachment,created_at,updated_at")
      .single();

    if (error) throw error;

    const counts = await getPostCounts(context, [data.id]);
    const response = jsonNoStore(
      {
        ok: true,
        post: toPostResponse(data as SimVitalsPostRow, counts),
      },
      { status: 201 }
    );

    return applySimVitalsAuthCookies(response, context);
  } catch (error) {
    if (isMissingSimVitalsSchemaError(error)) {
      return applySimVitalsAuthCookies(
        jsonNoStore(
          {
            ok: false,
            error: SIMVITALS_SCHEMA_MESSAGE,
            migration:
              "supabase/migrations/20260509_create_simvitals_tables.sql and supabase/migrations/20260509_add_simvitals_post_attachments.sql",
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
          error: `Could not create SimVitals post: ${getErrorMessage(error)}`,
        },
        { status: 500 }
      ),
      context
    );
  }
}
