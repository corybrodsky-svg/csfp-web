import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  applyOrganizationAuthCookies,
  resolveAuthenticatedUserFromCookies,
  setActiveOrganizationCookie,
} from "../../../../lib/organizationAuth";
import { createSupabaseAdminClient } from "../../../../lib/supabaseAdminClient";
import { persistSpAccountLink } from "../../../../lib/spAccountLinking";
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

function normalizeEmail(value: unknown) {
  return asText(value).toLowerCase();
}

function isMissingMembershipSpIdColumn(error: unknown) {
  const source = error && typeof error === "object" ? (error as { message?: unknown; details?: unknown; hint?: unknown }) : {};
  const text = [source.message, source.details, source.hint].map(asText).join(" ").toLowerCase();
  return text.includes("organization_memberships.sp_id") || (text.includes("column") && text.includes("sp_id"));
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
    .select("id,organization_id,sp_id,invite_email,status,expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

async function loadInviteSp(db: SupabaseClient, invite: Record<string, unknown>) {
  const { data, error } = await db
    .from("sps")
    .select("id,organization_id,first_name,last_name,full_name,working_email,email")
    .eq("id", asText(invite.sp_id))
    .eq("organization_id", asText(invite.organization_id))
    .maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

async function ensureSpOrganizationMembership(db: SupabaseClient, user: User, organizationId: string, spId: string) {
  const { data: existing, error: existingError } = await db
    .from("organization_memberships")
    .select("id,role,status")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingError) throw existingError;

  const nowIso = new Date().toISOString();
  if (existing) {
    let { error } = await db
      .from("organization_memberships")
      .update({
        status: "active",
        approved_at: nowIso,
        sp_id: spId,
      })
      .eq("id", asText((existing as Record<string, unknown>).id));
    if (error && isMissingMembershipSpIdColumn(error)) {
      const fallback = await db
        .from("organization_memberships")
        .update({
          status: "active",
          approved_at: nowIso,
        })
        .eq("id", asText((existing as Record<string, unknown>).id));
      error = fallback.error;
    }
    if (error) throw error;
    return;
  }

  let { error } = await db
    .from("organization_memberships")
    .insert({
      organization_id: organizationId,
      user_id: user.id,
      sp_id: spId,
      role: "sp",
      status: "active",
      approved_at: nowIso,
    });
  if (error && isMissingMembershipSpIdColumn(error)) {
    const fallback = await db
      .from("organization_memberships")
      .insert({
        organization_id: organizationId,
        user_id: user.id,
        role: "sp",
        status: "active",
        approved_at: nowIso,
      });
    error = fallback.error;
  }
  if (error) throw error;
}

async function markInviteAccepted(db: SupabaseClient, inviteId: string, userId: string) {
  const { error } = await db
    .from("sp_portal_invites")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_by: userId,
    })
    .eq("id", inviteId);
  if (error) throw error;
}

async function updateCommunicationPreferenceLinked(db: SupabaseClient, organizationId: string, spId: string) {
  const { error } = await db
    .from("sp_communication_preferences")
    .upsert(
      {
        organization_id: organizationId,
        sp_id: spId,
        preferred_mode: "portal",
        portal_status: "linked",
        onboarding_status: "complete",
      },
      { onConflict: "organization_id,sp_id" }
    );
  if (error) throw error;
}

export async function POST(request: Request) {
  const auth = await resolveAuthenticatedUserFromCookies();
  if (!auth.user || !auth.accessToken) {
    return jsonNoStore({ ok: false, error: "Authentication is required." }, { status: 401 }, auth);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const token = asText(body?.token);
  if (!token) {
    return jsonNoStore({ ok: false, error: "Invite token is required." }, { status: 400 }, auth);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return jsonNoStore({ ok: false, error: "Invite acceptance is unavailable." }, { status: 500 }, auth);
  }

  try {
    const invite = await loadInviteByToken(admin, token);
    if (!invite) {
      return jsonNoStore({ ok: false, error: "This invite is invalid or expired." }, { status: 404 }, auth);
    }

    const inviteStatus = normalizePortalInviteStatus(invite.status);
    if (inviteStatus !== "active" || isPortalInviteExpired(invite.expires_at)) {
      if (inviteStatus === "active") {
        await admin.from("sp_portal_invites").update({ status: "expired" }).eq("id", asText(invite.id));
      }
      return jsonNoStore({ ok: false, error: "This invite is invalid or expired." }, { status: 410 }, auth);
    }

    const inviteEmail = normalizeEmail(invite.invite_email);
    const userEmail = normalizeEmail(auth.user.email);
    if (inviteEmail && inviteEmail !== userEmail) {
      return jsonNoStore(
        {
          ok: false,
          error: "This invite does not match your signed-in email. Please contact your simulation coordinator.",
        },
        { status: 403 },
        auth
      );
    }

    const sp = await loadInviteSp(admin, invite);
    if (!sp) {
      return jsonNoStore({ ok: false, error: "This invite is invalid or expired." }, { status: 404 }, auth);
    }

    const organizationId = asText(invite.organization_id);
    const spId = asText(invite.sp_id);
    const linkError = await persistSpAccountLink({
      user: auth.user,
      accessToken: auth.accessToken,
      link: {
        status: "linked",
        sp_id: spId,
        sp_name: getSpInviteDisplayName(sp),
        matched_by: "saved_link",
      },
    });
    if (linkError) throw new Error(linkError);

    await ensureSpOrganizationMembership(admin, auth.user, organizationId, spId);
    await markInviteAccepted(admin, asText(invite.id), auth.user.id);
    await updateCommunicationPreferenceLinked(admin, organizationId, spId);

    const response = jsonNoStore({ ok: true, redirectTo: "/sp" }, undefined, auth);
    setActiveOrganizationCookie(response, organizationId);
    return response;
  } catch (error) {
    if (isMissingPortalInviteSchemaError(error)) {
      return jsonNoStore({ ok: false, error: "SP portal invite tables are not installed yet." }, { status: 500 }, auth);
    }
    return jsonNoStore(
      { ok: false, error: error instanceof Error ? error.message : "Could not accept this invite." },
      { status: 500 },
      auth
    );
  }
}
