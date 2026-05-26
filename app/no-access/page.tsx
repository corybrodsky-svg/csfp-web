"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signOutUserAndRedirect } from "../lib/clientAuth";

type MeResponse = {
  user?: {
    email?: string | null;
  };
  activeOrganization?: {
    name?: string | null;
  } | null;
  accessStatus?: string;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export default function NoAccessPage() {
  const [email, setEmail] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      const response = await fetch("/api/me", {
        cache: "no-store",
        credentials: "include",
      });
      const body = (await response.json().catch(() => null)) as MeResponse | null;
      if (!cancelled) setEmail(asText(body?.user?.email));
    }

    void loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOutUserAndRedirect();
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <main className="cfsp-page flex min-h-screen items-center justify-center px-4 py-8">
      <section className="cfsp-panel grid w-full max-w-xl gap-5 px-6 py-6">
        <div>
          <p className="cfsp-kicker">Workspace access pending</p>
          <h1 className="mt-3 text-[2rem] leading-tight font-black text-[#14304f]">
            No active organization membership
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#5e7388]">
            {email ? `${email} is signed in, but` : "This account"} does not have an approved CFSP organization membership yet.
          </p>
        </div>

        <div className="cfsp-alert cfsp-alert-info">
          Access request submitted. A CFSP administrator must approve your account before you can sign in.
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/request-access" className="cfsp-btn cfsp-btn-primary">
            Request Access
          </Link>
          <button type="button" onClick={handleSignOut} disabled={signingOut} className="cfsp-btn cfsp-btn-secondary disabled:opacity-70">
            {signingOut ? "Signing Out..." : "Sign Out"}
          </button>
        </div>
      </section>
    </main>
  );
}
