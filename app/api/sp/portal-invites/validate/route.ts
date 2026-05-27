import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyOrganizationAuthCookies,
  resolveAuthenticatedUserFromCookies,
} from "../../../../lib/organizationAuth";
import { createSupabaseAdminClient } from "../../../../lib/supabaseAdminClient";
import {
  getSpInviteDisplayName,
  hashPortalInviteToken,
  isMissingPortalInviteSchemaError,
  isPortalInviteExpired,
  normalizePortalInviteStatus,
} from "../../../../lib/spPortalInvites";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function jsonNoStore(body: unknown, init?: ResponseInit, auth?: Awaited<ReturnType<typeof resolveAuthenticatedUserFromCookies>>) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return applyOrganizationAuthCookies(response, auth || null);
}

async function loadInviteByToken(db: SupabaseClient, token: string) {
  const tokenHash = hashPortalInviteToken(token);
  const { data, error } = await db
    .from("sp_portal_invites")
    .select("id,organization_id,sp_id,invite_email,status,expires_at,accepted_at,revoked_at,created_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

async function markInviteExpired(db: SupabaseClient, invite: Record<string, unknown>) {
  const status = normalizePortalInviteStatus(invite.status);
  if (status !== "active" || !isPortalInviteExpired(invite.expires_at)) return invite;
  const { data, error } = await db
    .from("sp_portal_invites")
    .update({ status: "expired" })
    .eq("id", asText(invite.id))
    .select("id,organization_id,sp_id,invite_email,status,expires_at,accepted_at,revoked_at,created_at")
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

async function loadSafeInviteDisplay(db: SupabaseClient, invite: Record<string, unknown>) {
  const organizationId = asText(invite.organization_id);
  const spId = asText(invite.sp_id);
  const [{ data: organization }, { data: sp }] = await Promise.all([
    db.from("organizations").select("id,name").eq("id", organizationId).maybeSingle(),
    db.from("sps").select("id,first_name,last_name,full_name").eq("id", spId).maybeSingle(),
  ]);

  return {
    organization_name: asText((organization as Record<string, unknown> | null)?.name) || "Your simulation program",
    sp_display_name: getSpInviteDisplayName(sp as Record<string, unknown> | null),
    expires_at: asText(invite.expires_at) || null,
    status: normalizePortalInviteStatus(invite.status),
  };
}

export async function POST(request: Request) {
  const auth = await resolveAuthenticatedUserFromCookies();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const token = asText(body?.token);
  if (!token) {
    return jsonNoStore({ ok: false, error: "Invite token is required." }, { status: 400 }, auth);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return jsonNoStore({ ok: false, error: "Invite validation is unavailable." }, { status: 500 }, auth);
  }

  try {
    const loadedInvite = await loadInviteByToken(admin, token);
    if (!loadedInvite) {
      return jsonNoStore({ ok: false, error: "This invite is invalid or expired." }, { status: 404 }, auth);
    }

    const invite = await markInviteExpired(admin, loadedInvite);
    const status = normalizePortalInviteStatus(invite.status);
    if (status !== "active" || isPortalInviteExpired(invite.expires_at)) {
      return jsonNoStore({ ok: false, error: "This invite is invalid or expired." }, { status: 410 }, auth);
    }

    const display = await loadSafeInviteDisplay(admin, invite);
    const authenticated = Boolean(auth.user);
    return jsonNoStore(
      {
        ok: true,
        invite: display,
        authenticated,
        can_accept: authenticated,
      },
      undefined,
      auth
    );
  } catch (error) {
    if (isMissingPortalInviteSchemaError(error)) {
      return jsonNoStore({ ok: false, error: "SP portal invite tables are not installed yet." }, { status: 500 }, auth);
    }
    return jsonNoStore({ ok: false, error: "Could not validate this invite." }, { status: 500 }, auth);
  }
}
