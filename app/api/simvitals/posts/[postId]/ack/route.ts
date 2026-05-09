import {
  applySimVitalsAuthCookies,
  getAuthenticatedSimVitalsContext,
  getErrorMessage,
  getSimVitalsReadinessFailure,
  isMissingSimVitalsSchemaError,
  jsonNoStore,
  unauthorizedSimVitalsResponse,
} from "../../../_lib";

export const dynamic = "force-dynamic";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getRoutePostId(params: { postId?: string | string[] }) {
  const raw = params.postId;
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
}

async function getAckCount(
  context: NonNullable<Awaited<ReturnType<typeof getAuthenticatedSimVitalsContext>>>,
  postId: string
) {
  const { count, error } = await context.db
    .from("simvitals_reactions")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId)
    .eq("reaction_type", "ack");

  if (error) throw error;
  return count || 0;
}

export async function POST(
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

    const existing = await context.db
      .from("simvitals_reactions")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", context.viewer.id)
      .eq("reaction_type", "ack")
      .maybeSingle();

    if (existing.error) throw existing.error;

    let acknowledged = false;
    if (existing.data?.id) {
      const { error } = await context.db
        .from("simvitals_reactions")
        .delete()
        .eq("id", asText(existing.data.id))
        .eq("user_id", context.viewer.id);
      if (error) throw error;
    } else {
      const { error } = await context.db.from("simvitals_reactions").insert({
        post_id: postId,
        user_id: context.viewer.id,
        reaction_type: "ack",
      });
      if (error) throw error;
      acknowledged = true;
    }

    const reactionCount = await getAckCount(context, postId);
    return applySimVitalsAuthCookies(
      jsonNoStore({
        ok: true,
        acknowledged,
        reactionCount,
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
          error: `Could not update acknowledgement: ${getErrorMessage(error)}`,
        },
        { status: 500 }
      ),
      context
    );
  }
}
