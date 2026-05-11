import {
  applySimVitalsAuthCookies,
  getSimVitalsAuthorProfiles,
  getAuthenticatedSimVitalsContext,
  getErrorMessage,
  getSimVitalsReadinessFailure,
  isMissingSimVitalsAttachmentColumnError,
  isMissingSimVitalsSchemaError,
  isUnauthorizedSimVitalsDataError,
  jsonNoStore,
  normalizeSimVitalsAttachmentMetadata,
  normalizePostType,
  normalizeTags,
  unauthorizedSimVitalsResponse,
  type SimVitalsAttachmentMetadata,
  type SimVitalsAuthorProfile,
  type SimVitalsAvatarSource,
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
  attachment?: SimVitalsAttachmentMetadata | null;
  created_at: string | null;
  updated_at: string | null;
};

type SimVitalsLinkedEventRow = {
  id: string;
  name: string | null;
  date_text: string | null;
  status: string | null;
};

const POST_SELECT_BASE =
  "id,author_user_id,author_name,author_role,post_type,body,linked_event_id,linked_event_name,tags,created_at,updated_at";
const POST_SELECT_WITH_ATTACHMENT =
  "id,author_user_id,author_name,author_role,post_type,body,linked_event_id,linked_event_name,tags,attachment,created_at,updated_at";
const ATTACHMENT_METADATA_TAG_PREFIX = "__cfsp_simvitals_attachment__:";

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

function encodeAttachmentMetadataTag(attachment: SimVitalsAttachmentMetadata) {
  return `${ATTACHMENT_METADATA_TAG_PREFIX}${encodeURIComponent(JSON.stringify(attachment))}`;
}

function decodeAttachmentMetadataTag(value: unknown) {
  const tag = asText(value);
  if (!tag.startsWith(ATTACHMENT_METADATA_TAG_PREFIX)) return null;

  try {
    const encoded = tag.slice(ATTACHMENT_METADATA_TAG_PREFIX.length);
    return normalizeSimVitalsAttachmentMetadata(JSON.parse(decodeURIComponent(encoded)));
  } catch {
    return null;
  }
}

function stripAttachmentMetadataTags(tags: string[] | null | undefined) {
  return (Array.isArray(tags) ? tags : [])
    .map(asText)
    .filter((tag) => tag && !tag.startsWith(ATTACHMENT_METADATA_TAG_PREFIX));
}

function getAttachmentMetadataFromTags(tags: string[] | null | undefined) {
  for (const tag of Array.isArray(tags) ? tags : []) {
    const attachment = decodeAttachmentMetadataTag(tag);
    if (attachment) return attachment;
  }
  return null;
}

function buildTagsWithAttachmentMetadata(tags: string[], attachment: SimVitalsAttachmentMetadata) {
  return [...stripAttachmentMetadataTags(tags), encodeAttachmentMetadataTag(attachment)];
}

function toPostResponse(
  row: SimVitalsPostRow,
  counts: {
    reactionsByPostId: Map<string, number>;
    commentsByPostId: Map<string, number>;
    acknowledgedPostIds: Set<string>;
  },
  linkedEventsById = new Map<string, SimVitalsLinkedEventRow>(),
  authorProfiles = new Map<string, SimVitalsAuthorProfile>()
) {
  const linkedEvent = linkedEventsById.get(asText(row.linked_event_id));
  const authorProfile = authorProfiles.get(asText(row.author_user_id));
  const attachment =
    normalizeSimVitalsAttachmentMetadata(row.attachment) ||
    getAttachmentMetadataFromTags(row.tags);
  return {
    id: row.id,
    authorUserId: asText(row.author_user_id),
    authorName: asText(row.author_name) || "CFSP Team",
    authorRole: normalizeRole(row.author_role),
    authorAvatarUrl: authorProfile?.avatarUrl || "",
    authorAvatarSource: (authorProfile?.avatarSource || "initials") as SimVitalsAvatarSource,
    type: normalizePostType(row.post_type),
    body: asText(row.body),
    linkedEventId: asText(row.linked_event_id) || null,
    linkedEventName: asText(linkedEvent?.name) || asText(row.linked_event_name) || null,
    linkedEventDateText: asText(linkedEvent?.date_text),
    linkedEventStatus: asText(linkedEvent?.status),
    tags: stripAttachmentMetadataTags(row.tags),
    attachment,
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
  const warnings: string[] = [];

  if (!postIds.length) {
    return { reactionsByPostId, commentsByPostId, acknowledgedPostIds, warnings };
  }

  const { data: reactions, error: reactionsError } = await context.db
    .from("simvitals_reactions")
    .select("post_id,user_id,reaction_type")
    .in("post_id", postIds)
    .eq("reaction_type", "ack");

  if (reactionsError) {
    warnings.push(`Acknowledgement counts unavailable: ${getSimVitalsReadinessFailure(reactionsError)}`);
  } else {
    (reactions || []).forEach((reaction) => {
      const postId = asText(reaction.post_id);
      if (!postId) return;
      incrementCount(reactionsByPostId, postId);
      if (asText(reaction.user_id) === context.viewer.id) acknowledgedPostIds.add(postId);
    });
  }

  const { data: comments, error: commentsError } = await context.db
    .from("simvitals_comments")
    .select("post_id")
    .in("post_id", postIds);

  if (commentsError) {
    warnings.push(`Comment counts unavailable: ${getSimVitalsReadinessFailure(commentsError)}`);
  } else {
    (comments || []).forEach((comment) => {
      const postId = asText(comment.post_id);
      if (postId) incrementCount(commentsByPostId, postId);
    });
  }

  return { reactionsByPostId, commentsByPostId, acknowledgedPostIds, warnings };
}

async function getLinkedEventsById(
  context: NonNullable<Awaited<ReturnType<typeof getAuthenticatedSimVitalsContext>>>,
  eventIds: string[]
) {
  const uniqueIds = Array.from(new Set(eventIds.map(asText).filter(Boolean)));
  if (!uniqueIds.length) return new Map<string, SimVitalsLinkedEventRow>();

  const { data, error } = await context.db
    .from("events")
    .select("id,name,date_text,status")
    .in("id", uniqueIds);

  if (error) throw error;

  return new Map(
    ((data || []) as SimVitalsLinkedEventRow[]).map((event) => [event.id, event])
  );
}

async function resolveLinkedEvent(
  context: NonNullable<Awaited<ReturnType<typeof getAuthenticatedSimVitalsContext>>>,
  eventId: string | null,
  fallbackName: string | null
) {
  if (!eventId) return { id: null as string | null, name: fallbackName };
  const linkedEvents = await getLinkedEventsById(context, [eventId]);
  const event = linkedEvents.get(eventId);
  if (!event) {
    throw new Error("Linked event could not be found.");
  }
  return {
    id: event.id,
    name: asText(event.name) || fallbackName || "Linked event",
  };
}

function buildPostsQuery(
  context: NonNullable<Awaited<ReturnType<typeof getAuthenticatedSimVitalsContext>>>,
  limit: number,
  normalizedType: string,
  includeAttachment: boolean
) {
  let query = context.db
    .from("simvitals_posts")
    .select(includeAttachment ? POST_SELECT_WITH_ATTACHMENT : POST_SELECT_BASE)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (normalizedType) {
    query = query.eq("post_type", normalizedType);
  }

  return query;
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

    const attachmentSupportReady = true;
    const attachmentWarning = "";
    let postsResult = await buildPostsQuery(context, limit, normalizedType, true);

    if (postsResult.error && isMissingSimVitalsAttachmentColumnError(postsResult.error)) {
      postsResult = await buildPostsQuery(context, limit, normalizedType, false);
    }

    const { data, error } = postsResult;
    if (error) throw error;

    const posts = (data || []) as unknown as SimVitalsPostRow[];
    const authorProfiles = await getSimVitalsAuthorProfiles(
      posts.map((post) => asText(post.author_user_id)).filter(Boolean)
    );
    if (context.viewer.avatarUrl) {
      authorProfiles.set(context.viewer.id, {
        avatarUrl: context.viewer.avatarUrl,
        avatarSource: context.viewer.avatarSource,
      });
    }
    const linkedEventsById = await getLinkedEventsById(
      context,
      posts.map((post) => post.linked_event_id).filter(Boolean) as string[]
    );
    const counts = await getPostCounts(
      context,
      posts.map((post) => post.id).filter(Boolean)
    );
    const response = jsonNoStore({
      ok: true,
      schemaReady: true,
      coreReady: true,
      attachmentSupportReady,
      attachmentWarning,
      warning: counts.warnings.join(" "),
      posts: posts.map((post) => toPostResponse(post, counts, linkedEventsById, authorProfiles)),
    });

    return applySimVitalsAuthCookies(response, context);
  } catch (error) {
    if (isMissingSimVitalsSchemaError(error)) {
      return applySimVitalsAuthCookies(
        jsonNoStore({
          ok: true,
          schemaReady: false,
          coreReady: false,
          migration:
            "supabase/migrations/20260509_create_simvitals_tables.sql",
          warning: getSimVitalsReadinessFailure(error),
          posts: [],
        }),
        context
      );
    }

    if (isUnauthorizedSimVitalsDataError(error)) {
      return applySimVitalsAuthCookies(
        jsonNoStore(
          {
            ok: false,
            error: getSimVitalsReadinessFailure(error),
          },
          { status: 403 }
        ),
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
    const resolvedLinkedEvent = await resolveLinkedEvent(context, linkedEventId, linkedEventName);
    const attachment = normalizeSimVitalsAttachmentMetadata(body?.attachment, context.viewer.id);
    if (body?.attachment && !attachment) {
      return applySimVitalsAuthCookies(
        jsonNoStore({ ok: false, error: "Attachment metadata could not be verified." }, { status: 400 }),
        context
      );
    }

    const insertPayload = {
      author_user_id: context.viewer.id,
      author_name: context.viewer.displayName,
      author_role: context.viewer.role,
      post_type: postType,
      body: postBody.slice(0, 5000),
      linked_event_id: resolvedLinkedEvent.id,
      linked_event_name: resolvedLinkedEvent.name,
      tags: tags.length ? tags : [DEFAULT_TAG_BY_TYPE[postType]],
    };

    if (attachment) {
      const { data, error } = await context.db
        .from("simvitals_posts")
        .insert({
          ...insertPayload,
          attachment,
        })
        .select(POST_SELECT_WITH_ATTACHMENT)
        .single();

      if (error) {
        if (isMissingSimVitalsAttachmentColumnError(error)) {
          const fallbackInsertPayload = {
            ...insertPayload,
            tags: buildTagsWithAttachmentMetadata(insertPayload.tags, attachment),
          };
          const fallbackResult = await context.db
            .from("simvitals_posts")
            .insert(fallbackInsertPayload)
            .select(POST_SELECT_BASE)
            .single();

          if (fallbackResult.error) throw fallbackResult.error;

          const fallbackLinkedEventsById = await getLinkedEventsById(
            context,
            [asText(fallbackResult.data.linked_event_id)].filter(Boolean)
          );
          const fallbackCounts = await getPostCounts(context, [fallbackResult.data.id]);
          const response = jsonNoStore(
            {
              ok: true,
              warning: fallbackCounts.warnings.join(" "),
              post: {
                ...toPostResponse(
                  fallbackResult.data as unknown as SimVitalsPostRow,
                  fallbackCounts,
                  fallbackLinkedEventsById
                ),
                authorAvatarUrl: context.viewer.avatarUrl,
                authorAvatarSource: context.viewer.avatarSource,
              },
            },
            { status: 201 }
          );

          return applySimVitalsAuthCookies(response, context);
        }
        throw error;
      }

      const linkedEventsById = await getLinkedEventsById(context, [asText(data.linked_event_id)].filter(Boolean));
      const counts = await getPostCounts(context, [data.id]);
      const response = jsonNoStore(
        {
          ok: true,
          warning: counts.warnings.join(" "),
          post: {
            ...toPostResponse(data as unknown as SimVitalsPostRow, counts, linkedEventsById),
            authorAvatarUrl: context.viewer.avatarUrl,
            authorAvatarSource: context.viewer.avatarSource,
          },
        },
        { status: 201 }
      );

      return applySimVitalsAuthCookies(response, context);
    }

    const { data, error } = await context.db
      .from("simvitals_posts")
      .insert(insertPayload)
      .select(POST_SELECT_BASE)
      .single();

    if (error) throw error;

    const linkedEventsById = await getLinkedEventsById(context, [asText(data.linked_event_id)].filter(Boolean));
    const counts = await getPostCounts(context, [data.id]);
    const response = jsonNoStore(
      {
        ok: true,
        warning: counts.warnings.join(" "),
        post: {
          ...toPostResponse(data as unknown as SimVitalsPostRow, counts, linkedEventsById),
          authorAvatarUrl: context.viewer.avatarUrl,
          authorAvatarSource: context.viewer.avatarSource,
        },
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
            error: getSimVitalsReadinessFailure(error),
            migration:
              "supabase/migrations/20260509_create_simvitals_tables.sql",
          },
          { status: 503 }
        ),
        context
      );
    }

    if (isUnauthorizedSimVitalsDataError(error)) {
      return applySimVitalsAuthCookies(
        jsonNoStore(
          {
            ok: false,
            error: getSimVitalsReadinessFailure(error),
          },
          { status: 403 }
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
