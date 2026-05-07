import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "../../../../lib/authCookies";
import { createSupabaseServerClient } from "../../../../lib/supabaseServerClient";
import { getProfileForUser } from "../../../../lib/profileServer";
import {
  isMeaningfulTrainingMetadataText,
  parseTrainingEventMetadata,
  upsertTrainingEventMetadata,
  type TrainingEventMetadata,
} from "../../../../lib/trainingEventNotes";

export const dynamic = "force-dynamic";

type CopyOption =
  | "assigned_sps"
  | "training_materials"
  | "faculty"
  | "zoom_recording"
  | "sim_contact"
  | "case_doorsign";

type ViewerContext = {
  id: string;
  accessToken: string;
  refreshToken: string;
  email: string;
  role: string;
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

type EventRow = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  location: string | null;
  notes: string | null;
};

type EventAssignmentRow = {
  id: string;
  event_id: string | null;
  sp_id: string | null;
  status: string | null;
  confirmed: boolean | null;
  notes?: string | null;
  last_contacted_at?: string | null;
  contact_method?: string | null;
};

const COPY_OPTIONS = new Set<CopyOption>([
  "assigned_sps",
  "training_materials",
  "faculty",
  "zoom_recording",
  "sim_contact",
  "case_doorsign",
]);

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown Supabase error";
}

function getRouteId(params: { id?: string | string[] }) {
  const raw = params.id;
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
}

function normalizeRole(value: unknown) {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "sp" || role === "sim_op" || role === "admin" || role === "super_admin") {
    return role;
  }
  return "unknown";
}

function getEffectiveRole(email: unknown, role: unknown) {
  const normalizedEmail = asText(email).toLowerCase();
  const localPart = normalizedEmail.split("@")[0] || "";
  const normalizedRole = normalizeRole(role);
  const coryAdminEmails = new Set(["cwb55@drexel.edu", "cory.brodsky@drexel.edu"]);

  if (coryAdminEmails.has(normalizedEmail) || localPart === "cory.brodsky") {
    if (
      normalizedRole === "super_admin" ||
      normalizedRole === "admin" ||
      normalizedRole === "sim_op"
    ) {
      return normalizedRole;
    }

    return "super_admin";
  }

  return normalizedRole;
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

    return {
      id: auth.user.id,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      email,
      role: getEffectiveRole(email, profile?.role || auth.user.user_metadata?.role),
      fullName: asText(profile?.full_name) || asText(auth.user.user_metadata?.full_name),
      scheduleName: asText(profile?.schedule_name) || asText(auth.user.user_metadata?.schedule_name),
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

function normalizeCopyOptions(value: unknown) {
  if (!Array.isArray(value)) return [] as CopyOption[];
  return value
    .map((item) => asText(item) as CopyOption)
    .filter((item): item is CopyOption => COPY_OPTIONS.has(item));
}

function getMetadataSubset(
  metadata: TrainingEventMetadata,
  options: CopyOption[]
): {
  partial: Partial<TrainingEventMetadata>;
  skippedBlankFields: string[];
} {
  const partial: Partial<TrainingEventMetadata> = {};
  const skippedBlankFields: string[] = [];

  const setIfMeaningful = (
    key: keyof TrainingEventMetadata,
    label: string
  ) => {
    if (isMeaningfulTrainingMetadataText(metadata[key])) {
      partial[key] = metadata[key];
    } else {
      skippedBlankFields.push(label);
    }
  };

  if (options.includes("training_materials")) {
    setIfMeaningful("supplemental_doc_url", "Supplemental doc URL");
    setIfMeaningful("supplemental_doc_name", "Supplemental doc file");
    setIfMeaningful("supplemental_doc_storage_path", "Supplemental doc storage path");
    setIfMeaningful("supplemental_doc_uploaded_at", "Supplemental doc uploaded at");
    setIfMeaningful("supplemental_doc_uploaded_by", "Supplemental doc uploaded by");
    setIfMeaningful("training_notes", "Training notes");
  }

  if (options.includes("faculty")) {
    setIfMeaningful("faculty_names", "Faculty");
  }

  if (options.includes("zoom_recording")) {
    setIfMeaningful("zoom_url", "Zoom URL");
    setIfMeaningful("training_password", "Training password");
    setIfMeaningful("recording_url", "Recording URL");
  }

  if (options.includes("sim_contact")) {
    setIfMeaningful("sim_contact", "Sim Team / Event Lead");
  }

  if (options.includes("case_doorsign")) {
    setIfMeaningful("case_name", "Case name");
    setIfMeaningful("case_file_url", "Case file URL");
    setIfMeaningful("case_file_name", "Case file");
    setIfMeaningful("case_file_storage_path", "Case file storage path");
    setIfMeaningful("case_file_uploaded_at", "Case file uploaded at");
    setIfMeaningful("case_file_uploaded_by", "Case file uploaded by");
    setIfMeaningful("doorsign_url", "Doorsign URL");
    setIfMeaningful("doorsign_file_name", "Doorsign file");
    setIfMeaningful("doorsign_storage_path", "Doorsign storage path");
    setIfMeaningful("doorsign_uploaded_at", "Doorsign uploaded at");
    setIfMeaningful("doorsign_uploaded_by", "Doorsign uploaded by");
  }

  return {
    partial,
    skippedBlankFields: Array.from(new Set(skippedBlankFields)),
  };
}

function sortEvents(events: EventRow[]) {
  return [...events].sort((a, b) => {
    const aTime = a.date_text ? new Date(a.date_text).getTime() : Number.NaN;
    const bTime = b.date_text ? new Date(b.date_text).getTime() : Number.NaN;

    if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) return aTime - bTime;
    if (!Number.isNaN(aTime)) return -1;
    if (!Number.isNaN(bTime)) return 1;
    return asText(a.name).localeCompare(asText(b.name));
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  try {
    const viewer = await getAuthenticatedViewer();
    if (!viewer) return unauthorizedResponse();

    const supabase = createSupabaseServerClient();
    const params = await context.params;
    const eventId = getRouteId(params);
    const body = (await request.json().catch(() => null)) as
      | {
          mode?: unknown;
          keyword?: unknown;
          excludeCurrent?: unknown;
          copyOptions?: unknown;
        }
      | null;

    const mode = asText(body?.mode).toLowerCase() === "push" ? "push" : "preview";
    const keyword = asText(body?.keyword);
    const excludeCurrent = asBoolean(body?.excludeCurrent, true);
    const copyOptions = normalizeCopyOptions(body?.copyOptions);

    if (!eventId) {
      return applyAuthCookies(
        NextResponse.json({ error: "Missing event id." }, { status: 400 }),
        viewer
      );
    }

    if (!keyword) {
      return applyAuthCookies(
        NextResponse.json({ error: "A keyword is required to find related events." }, { status: 400 }),
        viewer
      );
    }

    const { data: sourceEvent, error: sourceError } = await supabase
      .from("events")
      .select("id,name,status,date_text,location,notes")
      .eq("id", eventId)
      .maybeSingle<EventRow>();

    if (sourceError) {
      return applyAuthCookies(
        NextResponse.json(
          { error: sourceError.message || "Could not load source event." },
          { status: 500 }
        ),
        viewer
      );
    }

    if (!sourceEvent) {
      return applyAuthCookies(
        NextResponse.json({ error: "Source event not found." }, { status: 404 }),
        viewer
      );
    }

    let query = supabase
      .from("events")
      .select("id,name,status,date_text,location,notes")
      .ilike("name", `%${keyword}%`);

    if (excludeCurrent) {
      query = query.neq("id", eventId);
    }

    const { data: matchingEvents, error: matchingError } = await query.limit(50);

    if (matchingError) {
      return applyAuthCookies(
        NextResponse.json(
          { error: matchingError.message || "Could not load related events." },
          { status: 500 }
        ),
        viewer
      );
    }

    const relatedEvents = sortEvents((matchingEvents || []) as EventRow[]);

    if (mode === "preview") {
      return applyAuthCookies(
        NextResponse.json({
          ok: true,
          events: relatedEvents.map((event) => ({
            id: event.id,
            name: event.name,
            status: event.status,
            date_text: event.date_text,
            location: event.location,
          })),
        }),
        viewer
      );
    }

    if (!copyOptions.length) {
      return applyAuthCookies(
        NextResponse.json({ error: "Select at least one thing to copy." }, { status: 400 }),
        viewer
      );
    }

    const sourceMetadata = parseTrainingEventMetadata(sourceEvent.notes);
    const { partial: metadataSubset, skippedBlankFields } = getMetadataSubset(
      sourceMetadata,
      copyOptions
    );
    const shouldCopyAssignments = copyOptions.includes("assigned_sps");

    const targetIds = relatedEvents.map((event) => event.id);

    let sourceAssignments: EventAssignmentRow[] = [];
    if (shouldCopyAssignments) {
      const { data: assignmentRows, error: assignmentError } = await supabase
        .from("event_sps")
        .select("id,event_id,sp_id,status,confirmed,notes,last_contacted_at,contact_method")
        .eq("event_id", eventId);

      if (assignmentError) {
        return applyAuthCookies(
          NextResponse.json(
            { error: assignmentError.message || "Could not load source assignments." },
            { status: 500 }
          ),
          viewer
        );
      }

      sourceAssignments = (assignmentRows || []) as EventAssignmentRow[];
    }

    const existingTargetAssignments = shouldCopyAssignments && targetIds.length
      ? await supabase
          .from("event_sps")
          .select("id,event_id,sp_id")
          .in("event_id", targetIds)
      : { data: [], error: null };

    if (existingTargetAssignments.error) {
      return applyAuthCookies(
        NextResponse.json(
          {
            error:
              existingTargetAssignments.error.message ||
              "Could not load target assignments.",
          },
          { status: 500 }
        ),
        viewer
      );
    }

    const assignmentMap = new Map<string, Set<string>>();
    ((existingTargetAssignments.data as Array<{ event_id?: string | null; sp_id?: string | null }>) || []).forEach(
      (row) => {
        const targetEventId = asText(row.event_id);
        const spId = asText(row.sp_id);
        if (!targetEventId || !spId) return;
        if (!assignmentMap.has(targetEventId)) assignmentMap.set(targetEventId, new Set());
        assignmentMap.get(targetEventId)?.add(spId);
      }
    );

    const updatedEvents: Array<{ id: string; name: string }> = [];
    const skippedEvents: Array<{ id: string; name: string; reason: string }> = [];
    const assignmentRowsToInsert: Array<Record<string, string | boolean | null>> = [];
    let duplicatesSkipped = 0;

    for (const targetEvent of relatedEvents) {
      let changed = false;

      if (Object.keys(metadataSubset).length > 0) {
        const nextNotes = upsertTrainingEventMetadata(targetEvent.notes, metadataSubset);
        if (nextNotes !== asText(targetEvent.notes)) {
          const { error } = await supabase
            .from("events")
            .update({ notes: nextNotes || null })
            .eq("id", targetEvent.id);

          if (error) {
            skippedEvents.push({
              id: targetEvent.id,
              name: asText(targetEvent.name) || "Untitled Event",
              reason: error.message || "Could not update notes.",
            });
            continue;
          }

          changed = true;
        }
      }

      if (shouldCopyAssignments && sourceAssignments.length) {
        const targetSpIds = assignmentMap.get(targetEvent.id) || new Set<string>();

        sourceAssignments.forEach((assignment) => {
          const spId = asText(assignment.sp_id);
          if (!spId) return;

          if (targetSpIds.has(spId)) {
            duplicatesSkipped += 1;
            return;
          }

          targetSpIds.add(spId);
          assignmentRowsToInsert.push({
            event_id: targetEvent.id,
            sp_id: spId,
            status: assignment.status || "invited",
            confirmed: Boolean(assignment.confirmed),
            notes: assignment.notes || null,
            last_contacted_at: assignment.last_contacted_at || null,
            contact_method: assignment.contact_method || null,
          });
          changed = true;
        });
      }

      if (changed) {
        updatedEvents.push({
          id: targetEvent.id,
          name: asText(targetEvent.name) || "Untitled Event",
        });
      } else {
        skippedEvents.push({
          id: targetEvent.id,
          name: asText(targetEvent.name) || "Untitled Event",
          reason: "No new changes were needed.",
        });
      }
    }

    if (assignmentRowsToInsert.length) {
      const { error: insertError } = await supabase.from("event_sps").insert(assignmentRowsToInsert);
      if (insertError) {
        return applyAuthCookies(
          NextResponse.json(
            { error: insertError.message || "Could not copy assignments." },
            { status: 500 }
          ),
          viewer
        );
      }
    }

    return applyAuthCookies(
      NextResponse.json({
        ok: true,
        summary: {
          updated_events: updatedEvents,
          skipped_events: skippedEvents,
          sps_copied: assignmentRowsToInsert.length,
          duplicates_skipped: duplicatesSkipped,
          blank_source_fields: skippedBlankFields,
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
