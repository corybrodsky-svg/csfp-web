import { NextResponse } from "next/server";
import { DEFAULT_CFSP_EMAIL_TEMPLATES, type EmailTemplateRecord } from "../../lib/emailTemplates";
import { sanitizePublicErrorMessage } from "../../lib/safeErrorMessage";
import {
  applyOrganizationAuthCookies,
  createSupabaseUserClient,
  forbiddenJson,
  getOrganizationContext,
  noActiveOrganizationJson,
  requireActiveOrganization,
  roleCanOperateOrganization,
  unauthorizedJson,
} from "../../lib/organizationAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
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
  const context = await getOrganizationContext();
  if (!context.user) return unauthorizedJson(context);
  if (!requireActiveOrganization(context)) return noActiveOrganizationJson(context);

  try {
    const supabase = createSupabaseUserClient(context.accessToken);
    let query = supabase
      .from("email_templates")
      .select("id,name,category,university_name,program_name,subject_template,body_template,body_format,default_to,default_cc,default_bcc,default_from_label,is_active,created_at,updated_at")
      .order("category", { ascending: true })
      .order("name", { ascending: true });
    if (context.schemaAvailable) query = query.eq("organization_id", context.activeOrganization!.id);

    const { data, error } = await query;
    if (error) {
      return applyOrganizationAuthCookies(
        NextResponse.json({
          templates: DEFAULT_CFSP_EMAIL_TEMPLATES,
          source: "defaults",
          warning: sanitizePublicErrorMessage(error.message, "Could not load saved email templates."),
          canManage: roleCanOperateOrganization(context.role),
        }),
        context
      );
    }

    return applyOrganizationAuthCookies(
      NextResponse.json({
        templates: (data || []) as EmailTemplateRecord[],
        source: "database",
        canManage: roleCanOperateOrganization(context.role),
      }),
      context
    );
  } catch (error) {
    return applyOrganizationAuthCookies(
      NextResponse.json(
        {
          templates: DEFAULT_CFSP_EMAIL_TEMPLATES,
          source: "defaults",
          warning: sanitizePublicErrorMessage(error instanceof Error ? error.message : "", "Could not load templates."),
          canManage: roleCanOperateOrganization(context.role),
        },
        { status: 200 }
      ),
      context
    );
  }
}

export async function POST(request: Request) {
  const context = await getOrganizationContext();
  if (!context.user) return unauthorizedJson(context);
  if (!requireActiveOrganization(context)) return noActiveOrganizationJson(context);
  if (!roleCanOperateOrganization(context.role)) {
    return forbiddenJson("Only Sim Ops or admin accounts can manage templates.", context);
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload) return applyOrganizationAuthCookies(NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }), context);

  const nextTemplate = {
    ...cleanTemplatePayload(payload),
    ...(context.schemaAvailable ? { organization_id: context.activeOrganization!.id } : {}),
  };
  if (!nextTemplate.name || !nextTemplate.subject_template || !nextTemplate.body_template) {
    return applyOrganizationAuthCookies(NextResponse.json({ error: "Template name, subject, and body are required." }, { status: 400 }), context);
  }

  const supabase = createSupabaseUserClient(context.accessToken);
  const { data, error } = await supabase
    .from("email_templates")
    .insert(nextTemplate)
    .select("id,name,category,university_name,program_name,subject_template,body_template,body_format,default_to,default_cc,default_bcc,default_from_label,is_active,created_at,updated_at")
    .single();

  if (error) {
    return applyOrganizationAuthCookies(NextResponse.json({ error: error.message || "Could not save template." }, { status: 500 }), context);
  }

  return applyOrganizationAuthCookies(NextResponse.json({ ok: true, template: data }, { status: 201 }), context);
}

export async function PATCH(request: Request) {
  const context = await getOrganizationContext();
  if (!context.user) return unauthorizedJson(context);
  if (!requireActiveOrganization(context)) return noActiveOrganizationJson(context);
  if (!roleCanOperateOrganization(context.role)) {
    return forbiddenJson("Only Sim Ops or admin accounts can manage templates.", context);
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = asText(payload?.id);
  if (!payload || !id) return applyOrganizationAuthCookies(NextResponse.json({ error: "Template id is required." }, { status: 400 }), context);

  const updates = {
    ...cleanTemplatePayload(payload),
    ...(context.schemaAvailable ? { organization_id: context.activeOrganization!.id } : {}),
  };
  if (!updates.name || !updates.subject_template || !updates.body_template) {
    return applyOrganizationAuthCookies(NextResponse.json({ error: "Template name, subject, and body are required." }, { status: 400 }), context);
  }

  const supabase = createSupabaseUserClient(context.accessToken);
  let updateQuery = supabase
    .from("email_templates")
    .update(updates)
    .eq("id", id);
  if (context.schemaAvailable) updateQuery = updateQuery.eq("organization_id", context.activeOrganization!.id);
  const { data, error } = await updateQuery
    .select("id,name,category,university_name,program_name,subject_template,body_template,body_format,default_to,default_cc,default_bcc,default_from_label,is_active,created_at,updated_at")
    .single();

  if (error) {
    return applyOrganizationAuthCookies(NextResponse.json({ error: error.message || "Could not update template." }, { status: 500 }), context);
  }

  return applyOrganizationAuthCookies(NextResponse.json({ ok: true, template: data }), context);
}
