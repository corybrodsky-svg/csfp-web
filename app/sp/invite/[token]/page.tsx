"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type InviteValidation = {
  ok?: boolean;
  error?: string;
  invite?: {
    organization_name?: string | null;
    sp_display_name?: string | null;
    expires_at?: string | null;
    status?: string | null;
  } | null;
  authenticated?: boolean;
  can_accept?: boolean;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getRouteToken(raw: string | string[] | undefined) {
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
}

function formatInviteDate(value?: string | null) {
  const raw = asText(value);
  if (!raw) return "No expiration date shown";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}

export default function SpPortalInvitePage() {
  const params = useParams<{ token?: string | string[] }>();
  const router = useRouter();
  const token = getRouteToken(params?.token);
  const returnTo = useMemo(() => (token ? `/sp/invite/${encodeURIComponent(token)}` : "/sp"), [token]);
  const [validation, setValidation] = useState<InviteValidation | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function validateInvite() {
      if (!token) {
        setValidation({ ok: false, error: "This invite is invalid or expired." });
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage("");
      try {
        const response = await fetch("/api/sp/portal-invites/validate", {
          method: "POST",
          cache: "no-store",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = (await response.json().catch(() => null)) as InviteValidation | null;
        if (cancelled) return;
        setValidation(body || { ok: false, error: "This invite is invalid or expired." });
      } catch (error) {
        if (!cancelled) {
          setValidation({
            ok: false,
            error: error instanceof Error ? error.message : "Could not validate this invite.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void validateInvite();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function acceptInvite() {
    if (!token) return;
    setAccepting(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/sp/portal-invites/accept", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; redirectTo?: string; error?: string } | null;
      if (!response.ok || body?.ok === false) {
        throw new Error(asText(body?.error) || "Could not accept this invite.");
      }
      router.replace(asText(body?.redirectTo) || "/sp");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not accept this invite.");
    } finally {
      setAccepting(false);
    }
  }

  const invite = validation?.invite || null;
  const invalidMessage = !loading && validation?.ok === false ? asText(validation.error) || "This invite is invalid or expired." : "";
  const loginHref = `/login?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <main className="cfsp-page flex min-h-screen items-center justify-center px-4 py-8">
      <section className="cfsp-panel grid w-full max-w-2xl gap-5 px-6 py-6">
        <div>
          <p className="cfsp-kicker">SP Portal invite</p>
          <h1 className="mt-3 text-[2rem] leading-tight font-black text-[#14304f]">
            Set up your SP Portal
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#5e7388]">
            Your simulation program invited you to use the SP Portal to view and respond to shifts.
          </p>
        </div>

        {loading ? <div className="cfsp-alert cfsp-alert-info">Checking this secure invite...</div> : null}
        {invalidMessage ? (
          <div className="cfsp-alert cfsp-alert-error">
            {invalidMessage} This link may have already been used, revoked, or expired. Please contact your simulation coordinator for a new invite.
          </div>
        ) : null}
        {errorMessage ? <div className="cfsp-alert cfsp-alert-error">{errorMessage}</div> : null}

        {invite && validation?.ok ? (
          <div className="grid gap-3 rounded-2xl border border-[var(--cfsp-border)] bg-white p-4">
            <div>
              <p className="cfsp-label">Organization</p>
              <p className="mt-1 text-lg font-black text-[var(--cfsp-text)]">{asText(invite.organization_name) || "Your simulation program"}</p>
            </div>
            <div>
              <p className="cfsp-label">Invited SP</p>
              <p className="mt-1 text-lg font-black text-[var(--cfsp-text)]">{asText(invite.sp_display_name) || "Standardized Patient"}</p>
            </div>
            <div>
              <p className="cfsp-label">Invite expires</p>
              <p className="mt-1 text-sm font-bold text-[var(--cfsp-text-muted)]">{formatInviteDate(invite.expires_at)}</p>
            </div>
          </div>
        ) : null}

        {validation?.ok && !validation.authenticated ? (
          <div className="grid gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-bold leading-6 text-amber-900">
              Please sign in using the same email address that received this invite. If you do not have CFSP access yet, request access or contact your simulation coordinator.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={loginHref} className="cfsp-btn cfsp-btn-primary">
                Sign in to accept invite
              </Link>
              <Link href="/request-access" className="cfsp-btn cfsp-btn-secondary">
                Request account access
              </Link>
            </div>
          </div>
        ) : null}

        {validation?.ok && validation.authenticated ? (
          <div className="grid gap-3">
            <p className="text-sm font-bold leading-6 text-[var(--cfsp-text-muted)]">
              Click below to link your signed-in account to this SP profile and open your portal.
            </p>
            <button
              type="button"
              onClick={() => void acceptInvite()}
              disabled={accepting}
              className="cfsp-btn cfsp-btn-primary disabled:opacity-70"
            >
              {accepting ? "Opening your portal..." : "Accept Invite and Open My SP Portal"}
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
