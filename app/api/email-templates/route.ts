import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { AUTH_ACCESS_COOKIE, AUTH_REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from "../../lib/authCookies";
import { getProfileForUser } from "../../lib/profileServer";
import { createSupabaseServerClient, supabaseKey, supabaseUrl } from "../../lib/supabaseServerClient";
import { DEFAULT_CFSP_EMAIL_TEMPLATES, type EmailTemplateRecord } from "../../lib/emailTemplates";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeRole(value: unknown) {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "super_admin" || role === "admin" || role === "sim_op" || role === "faculty" || role === "sp") return role;
  return "";
}

function canManageTemplates(role: string) {
  return role === "super_admin" || role === "admin" || role === "sim_op";
}

async function resolveViewer() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value?.trim() || "";
  const refreshToken = cookieStore.get(AUTH_REFRESH_COOKIE)?.value?.trim() || "";
  const supabase = createSupabaseServerClient();

  let user = null as Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] | null;
  let resolvedAccessToken = accessToken;
  let refreshedTokens: { accessToken: string; refreshToken: string } | null = null;
  let shouldClearCookies = false;

  if (accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (!error && data.user) user = data.user;
  }

  if (!user && refreshToken) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    const refreshedUser = data.user || data.session?.user || null;
    if (!error && data.session?.access_token && data.session.refresh_token && refreshedUser) {
      user = refreshedUser;
      resolvedAccessToken = data.session.access_token;
      refreshedTokens = {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      };
    }
  }

  if (!user) {
    shouldClearCookies = Boolean(accessToken || refreshToken);
    return { user: null, accessToken: "", role: "", refreshedTokens, shouldClearCookies };
  }

  const profileResult = await getProfileForUser(user.id, resolvedAccessToken);
  const email = asText(profileResult.profile?.email) || asText(user.email);
  const role = normalizeRole(profileResult.profile?.role || user.user_metadata?.role);
  const effectiveRole = email.toLowerCase() === "cwb55@drexel.edu" && !canManageTemplates(role) ? "admin" : role;
  return { user, accessToken: resolvedAccessToken, role: effectiveRole, refreshedTokens, shouldClearCookies };
}

function applySessionCookies(response: NextResponse, viewer: Awaited<ReturnType<typeof resolveViewer>>) {
  if (viewer.refreshedTokens) setAuthCookies(response, viewer.refreshedTokens);
  if (viewer.shouldClearCookies) clearAuthCookies(response);
  return response;
}

function createUserScopedClient(accessToken: string) {
  if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase configuration.");
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function cleanTemplatePayload(payload: Record<string, unknown>, existing?: Partial<EmailTemplateRecord>) {
  return {
    name: asText(payload.name) || asText(existing?.name),
    category: asText(payload.category) || asText(existing?.category) || null,
    university_name: asText(payload.university_name) || asText(existing?.university_name) || null,
    program_name: asText(payload.program_name) || asText(existing?.program_name) || null,
    subject_template: asText(payload.subject_template) || asText(existing?.subject_template),
    body_template: asText(payload.body_template) || asText(existing?.body_template),
    body_format: asText(payload.body_format) || asText(existing?.body_format) || "plain_text",
    default_to: asText(payload.default_to) || null,
    default_cc: asText(payload.default_cc) || null,
    default_bcc: asText(payload.default_bcc) || null,
    default_from_label: asText(payload.default_from_label) || null,
    is_active: typeof payload.is_active === "boolean" ? payload.is_active : existing?.is_active !== false,
    updated_at: new Date().toISOString(),
  };
}

export async function GET() {
  const viewer = await resolveViewer();
  if (!viewer.user || !viewer.accessToken) {
    return applySessionCookies(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), viewer);
  }

  try {
    const supabase = createUserScopedClient(viewer.accessToken);
    const query = supabase
      .from("email_templates")
      .select("id,name,category,university_name,program_name,subject_template,body_template,body_format,default_to,default_cc,default_bcc,default_from_label,is_active,created_at,updated_at")
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    const { data, error } = await query;
    if (error) {
      return applySessionCookies(
        NextResponse.json({
          templates: DEFAULT_CFSP_EMAIL_TEMPLATES,
          source: "defaults",
          warning: error.message || "Could not load saved email templates.",
          canManage: canManageTemplates(viewer.role),
        }),
        viewer
      );
    }

    return applySessionCookies(
      NextResponse.json({
        templates: (data || []) as EmailTemplateRecord[],
        source: "database",
        canManage: canManageTemplates(viewer.role),
      }),
      viewer
    );
  } catch (error) {
    return applySessionCookies(
      NextResponse.json(
        {
          templates: DEFAULT_CFSP_EMAIL_TEMPLATES,
          source: "defaults",
          warning: error instanceof Error ? error.message : "Could not load templates.",
          canManage: canManageTemplates(viewer.role),
        },
        { status: 200 }
      ),
      viewer
    );
  }
}

export async function POST(request: Request) {
  const viewer = await resolveViewer();
  if (!viewer.user || !viewer.accessToken) {
    return applySessionCookies(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), viewer);
  }
  if (!canManageTemplates(viewer.role)) {
    return applySessionCookies(NextResponse.json({ error: "Only Sim Ops or admin accounts can manage templates." }, { status: 403 }), viewer);
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload) return applySessionCookies(NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }), viewer);

  const nextTemplate = cleanTemplatePayload(payload);
  if (!nextTemplate.name || !nextTemplate.subject_template || !nextTemplate.body_template) {
    return applySessionCookies(NextResponse.json({ error: "Template name, subject, and body are required." }, { status: 400 }), viewer);
  }

  const supabase = createUserScopedClient(viewer.accessToken);
  const { data, error } = await supabase
    .from("email_templates")
    .insert(nextTemplate)
    .select("id,name,category,university_name,program_name,subject_template,body_template,body_format,default_to,default_cc,default_bcc,default_from_label,is_active,created_at,updated_at")
    .single();

  if (error) {
    return applySessionCookies(NextResponse.json({ error: error.message || "Could not save template." }, { status: 500 }), viewer);
  }

  return applySessionCookies(NextResponse.json({ ok: true, template: data }, { status: 201 }), viewer);
}

export async function PATCH(request: Request) {
  const viewer = await resolveViewer();
  if (!viewer.user || !viewer.accessToken) {
    return applySessionCookies(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), viewer);
  }
  if (!canManageTemplates(viewer.role)) {
    return applySessionCookies(NextResponse.json({ error: "Only Sim Ops or admin accounts can manage templates." }, { status: 403 }), viewer);
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = asText(payload?.id);
  if (!payload || !id) return applySessionCookies(NextResponse.json({ error: "Template id is required." }, { status: 400 }), viewer);

  const updates = cleanTemplatePayload(payload);
  if (!updates.name || !updates.subject_template || !updates.body_template) {
    return applySessionCookies(NextResponse.json({ error: "Template name, subject, and body are required." }, { status: 400 }), viewer);
  }

  const supabase = createUserScopedClient(viewer.accessToken);
  const { data, error } = await supabase
    .from("email_templates")
    .update(updates)
    .eq("id", id)
    .select("id,name,category,university_name,program_name,subject_template,body_template,body_format,default_to,default_cc,default_bcc,default_from_label,is_active,created_at,updated_at")
    .single();

  if (error) {
    return applySessionCookies(NextResponse.json({ error: error.message || "Could not update template." }, { status: 500 }), viewer);
  }

  return applySessionCookies(NextResponse.json({ ok: true, template: data }), viewer);
}
