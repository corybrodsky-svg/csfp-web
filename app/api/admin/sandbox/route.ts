import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../lib/supabaseAdminClient";
import {
  applyOrganizationAuthCookies,
  forbiddenJson,
  getOrganizationContext,
  roleCanManageOrganization,
  unauthorizedJson,
} from "../../../lib/organizationAuth";
import {
  SANDBOX_REPAIR_CONFIRMATION,
  loadSandboxDiagnostics,
  repairSandbox,
} from "../../../lib/sandboxManager";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

async function requireSandboxAdmin() {
  const organizationContext = await getOrganizationContext();
  if (!organizationContext.user) {
    return { organizationContext, response: unauthorizedJson(organizationContext), admin: null };
  }
  if (!roleCanManageOrganization(organizationContext.role)) {
    return {
      organizationContext,
      response: forbiddenJson("Only platform owners and organization admins can manage the sandbox.", organizationContext),
      admin: null,
    };
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    const response = NextResponse.json(
      {
        ok: false,
        error: "Sandbox Manager requires server-side Supabase admin configuration.",
      },
      { status: 500 }
    );
    return { organizationContext, response: applyOrganizationAuthCookies(response, organizationContext), admin: null };
  }

  return { organizationContext, response: null, admin };
}

export async function GET() {
  try {
    const access = await requireSandboxAdmin();
    if (access.response || !access.admin) return access.response;

    const diagnostics = await loadSandboxDiagnostics(access.admin, {
      activeOrganizationId: access.organizationContext.activeOrganization?.id || "",
      activeOrganizationName: access.organizationContext.activeOrganization?.name || "",
    });

    return applyOrganizationAuthCookies(NextResponse.json({ ok: true, diagnostics }), access.organizationContext);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not load sandbox diagnostics.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireSandboxAdmin();
    if (access.response || !access.admin) return access.response;

    const body = (await request.json().catch(() => null)) as { confirmation?: unknown } | null;
    if (asText(body?.confirmation) !== SANDBOX_REPAIR_CONFIRMATION) {
      return applyOrganizationAuthCookies(
        NextResponse.json(
          {
            ok: false,
            error: `Type ${SANDBOX_REPAIR_CONFIRMATION} before repairing the shared sandbox.`,
          },
          { status: 400 }
        ),
        access.organizationContext
      );
    }

    const result = await repairSandbox(access.admin, {
      activeOrganizationId: access.organizationContext.activeOrganization?.id || "",
      activeOrganizationName: access.organizationContext.activeOrganization?.name || "",
    });

    return applyOrganizationAuthCookies(NextResponse.json(result), access.organizationContext);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not repair the sandbox.",
      },
      { status: 500 }
    );
  }
}
