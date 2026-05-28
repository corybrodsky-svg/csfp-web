import { createSupabaseAdminClient } from "../../../lib/supabaseAdminClient";
import {
  createSupabaseUserClient,
  getOrganizationContext,
  requireActiveOrganization,
} from "../../../lib/organizationAuth";
import { isCFSPGuideKey, type CFSPGuideKey } from "../../../lib/cfspGuide";
import {
  getSupabaseError,
  logShiftRouteFailure,
  safeErrorJson,
  safeJson,
} from "../../../lib/spShiftFoundation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type GuideStateRow = {
  id?: string | null;
  user_id?: string | null;
  organization_id?: string | null;
  guide_key?: string | null;
  completed_steps?: unknown;
  dismissed_at?: string | null;
  last_opened_at?: string | null;
};

const VALID_ACTIONS = new Set(["open", "complete_step", "uncomplete_step", "dismiss", "reset"]);

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isMissingOnboardingSchema(error: unknown) {
  const details = getSupabaseError(error);
  const text = [details.code, details.message, details.details, details.hint].map(asText).join(" ");
  return /user_onboarding_states|relation .* does not exist|PGRST205|42P01/i.test(text);
}

function normalizeCompletedSteps(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(
    new Set(
      value
        .map(asText)
        .filter(Boolean)
        .slice(0, 100)
    )
  );
}

function normalizeState(row: GuideStateRow | null | undefined, guideKey: CFSPGuideKey) {
  return {
    guide_key: guideKey,
    completed_steps: normalizeCompletedSteps(row?.completed_steps),
    dismissed_at: row?.dismissed_at || null,
    last_opened_at: row?.last_opened_at || null,
  };
}

async function loadState(args: {
  db: ReturnType<typeof createSupabaseUserClient>;
  userId: string;
  organizationId: string | null;
  guideKey: CFSPGuideKey;
}) {
  let query = args.db
    .from("user_onboarding_states")
    .select("id,user_id,organization_id,guide_key,completed_steps,dismissed_at,last_opened_at")
    .eq("user_id", args.userId)
    .eq("guide_key", args.guideKey)
    .limit(1);

  query = args.organizationId ? query.eq("organization_id", args.organizationId) : query.is("organization_id", null);

  const { data, error } = await query.maybeSingle<GuideStateRow>();
  if (error) throw error;
  return data || null;
}

async function saveState(args: {
  db: ReturnType<typeof createSupabaseUserClient>;
  existingId: string | null;
  userId: string;
  organizationId: string | null;
  guideKey: CFSPGuideKey;
  completedSteps: string[];
  dismissedAt: string | null;
  lastOpenedAt: string | null;
}) {
  const payload = {
    user_id: args.userId,
    organization_id: args.organizationId,
    guide_key: args.guideKey,
    completed_steps: args.completedSteps,
    dismissed_at: args.dismissedAt,
    last_opened_at: args.lastOpenedAt,
  };

  const query = args.existingId
    ? args.db
        .from("user_onboarding_states")
        .update(payload)
        .eq("id", args.existingId)
    : args.db
        .from("user_onboarding_states")
        .insert(payload);

  const { data, error } = await query
    .select("id,user_id,organization_id,guide_key,completed_steps,dismissed_at,last_opened_at")
    .single<GuideStateRow>();
  if (error) throw error;
  return data;
}

function getGuideKeyFromUrl(request: Request) {
  const url = new URL(request.url);
  const guideKey = asText(url.searchParams.get("guideKey"));
  return isCFSPGuideKey(guideKey) ? guideKey : null;
}

function onboardingDb(context: Awaited<ReturnType<typeof getOrganizationContext>>) {
  return createSupabaseAdminClient() || createSupabaseUserClient(context.accessToken);
}

export async function GET(request: Request) {
  const context = await getOrganizationContext();
  if (!context.user) return safeErrorJson("unauthorized", "Authentication is required.", 401, context);
  if (!requireActiveOrganization(context)) return safeErrorJson("forbidden", "No active organization membership.", 403, context);

  const guideKey = getGuideKeyFromUrl(request);
  if (!guideKey) return safeErrorJson("bad_request", "A valid guideKey is required.", 400, context);

  const db = onboardingDb(context);
  const organizationId = asText(context.activeOrganization?.id) || null;

  try {
    const state = await loadState({
      db,
      userId: context.user.id,
      organizationId,
      guideKey,
    });
    return safeJson({ ok: true, state: normalizeState(state, guideKey) }, undefined, context);
  } catch (error) {
    if (isMissingOnboardingSchema(error)) {
      return safeJson({ ok: true, state: normalizeState(null, guideKey), schemaAvailable: false }, undefined, context);
    }
    logShiftRouteFailure("api/onboarding/guide-state GET", error, {
      userEmail: context.user.email,
      organizationId,
      guideKey,
    });
    return safeErrorJson("server_error", "Could not load guide progress.", 500, context, getSupabaseError(error));
  }
}

export async function PATCH(request: Request) {
  const context = await getOrganizationContext();
  if (!context.user) return safeErrorJson("unauthorized", "Authentication is required.", 401, context);
  if (!requireActiveOrganization(context)) return safeErrorJson("forbidden", "No active organization membership.", 403, context);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const guideKey = asText(body?.guideKey);
  const action = asText(body?.action);
  const stepId = asText(body?.stepId);

  if (!isCFSPGuideKey(guideKey)) return safeErrorJson("bad_request", "A valid guideKey is required.", 400, context);
  if (!VALID_ACTIONS.has(action)) return safeErrorJson("bad_request", "A valid action is required.", 400, context);
  if ((action === "complete_step" || action === "uncomplete_step") && !stepId) {
    return safeErrorJson("bad_request", "stepId is required for this action.", 400, context);
  }

  const db = onboardingDb(context);
  const organizationId = asText(context.activeOrganization?.id) || null;

  try {
    const current = await loadState({
      db,
      userId: context.user.id,
      organizationId,
      guideKey,
    });
    const now = new Date().toISOString();
    let completedSteps = normalizeCompletedSteps(current?.completed_steps);
    let dismissedAt = current?.dismissed_at || null;
    let lastOpenedAt = current?.last_opened_at || null;

    if (action === "open") {
      lastOpenedAt = now;
    } else if (action === "complete_step") {
      completedSteps = Array.from(new Set([...completedSteps, stepId]));
    } else if (action === "uncomplete_step") {
      completedSteps = completedSteps.filter((item) => item !== stepId);
    } else if (action === "dismiss") {
      dismissedAt = now;
    } else if (action === "reset") {
      completedSteps = [];
      dismissedAt = null;
    }

    const saved = await saveState({
      db,
      existingId: asText(current?.id) || null,
      userId: context.user.id,
      organizationId,
      guideKey,
      completedSteps,
      dismissedAt,
      lastOpenedAt,
    });

    return safeJson({ ok: true, state: normalizeState(saved, guideKey) }, undefined, context);
  } catch (error) {
    if (isMissingOnboardingSchema(error)) {
      return safeErrorJson("schema_missing", "Guide progress storage is not installed yet.", 500, context);
    }
    logShiftRouteFailure("api/onboarding/guide-state PATCH", error, {
      userEmail: context.user.email,
      organizationId,
      guideKey,
      action,
      stepId: stepId || undefined,
    });
    return safeErrorJson("server_error", "Could not save guide progress.", 500, context, getSupabaseError(error));
  }
}
