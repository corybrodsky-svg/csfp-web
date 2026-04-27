"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { signOutUserAndRedirect } from "../lib/clientAuth";

type SiteShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

type ShellMeResponse = {
  user?: {
    email?: string | null;
  };
  profile?: {
    full_name?: string | null;
    schedule_match_name?: string | null;
    schedule_name?: string | null;
    email?: string | null;
    role?: string | null;
    profile_image_url?: string | null;
  } | null;
};

type NavItem = {
  href: string;
  label: string;
  match?: "exact" | "prefix";
  tone?: "primary" | "default";
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", match: "exact" },
  { href: "/events", label: "Events", match: "prefix" },
  { href: "/events/new", label: "New Event", match: "exact", tone: "primary" },
  { href: "/schedule-builder", label: "Schedule Builder", match: "exact" },
  { href: "/events/upload", label: "Upload", match: "exact" },
  { href: "/sps", label: "SP Database", match: "prefix" },
  { href: "/staff", label: "Staff", match: "prefix" },
  { href: "/admin", label: "Admin", match: "prefix" },
  { href: "/me", label: "Profile", match: "prefix" },
];

function isNavActive(pathname: string, item: NavItem) {
  if (item.href === "/events" && pathname.startsWith("/events/")) return true;
  if (item.match === "prefix") return pathname === item.href || pathname.startsWith(`${item.href}/`);
  return pathname === item.href;
}

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getFirstName(fullName: string) {
  return asText(fullName).split(/\s+/).filter(Boolean)[0] || "";
}

function getEmailUsername(email: string) {
  const text = asText(email);
  const atIndex = text.indexOf("@");
  return atIndex > 0 ? text.slice(0, atIndex) : text;
}

function normalizeRole(value: unknown) {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "super_admin") return "Super Admin";
  if (role === "admin") return "Admin";
  if (role === "sim_op") return "Sim Op";
  return "SP";
}

function getDisplayName(me: ShellMeResponse | null) {
  const fullNameFirst = getFirstName(asText(me?.profile?.full_name));
  if (fullNameFirst) return fullNameFirst;

  const scheduleMatchName = asText(me?.profile?.schedule_match_name) || asText(me?.profile?.schedule_name);
  if (scheduleMatchName) return scheduleMatchName;

  const emailUsername = getEmailUsername(asText(me?.user?.email) || asText(me?.profile?.email));
  if (emailUsername) return emailUsername;

  return asText(me?.user?.email) || asText(me?.profile?.email) || "Account";
}

export default function SiteShell({ title, subtitle, children }: SiteShellProps) {
  const pathname = usePathname();
  const [logoVisible, setLogoVisible] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [me, setMe] = useState<ShellMeResponse | null>(null);

  const activeMap = useMemo(() => {
    const next = new Map<string, boolean>();
    navItems.forEach((item) => next.set(item.href, isNavActive(pathname, item)));
    return next;
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    async function loadAccountSummary() {
      try {
        const response = await fetch("/api/me", {
          cache: "no-store",
          credentials: "include",
        });

        if (!response.ok) return;

        const body = (await response.json().catch(() => null)) as ShellMeResponse | null;
        if (cancelled || !body) return;
        setMe(body);
      } catch {
        return;
      }
    }

    void loadAccountSummary();
    window.addEventListener("focus", loadAccountSummary);
    window.addEventListener("cfsp-profile-updated", loadAccountSummary as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadAccountSummary);
      window.removeEventListener("cfsp-profile-updated", loadAccountSummary as EventListener);
    };
  }, []);

  async function handleSignOut() {
    try {
      setSigningOut(true);
      await signOutUserAndRedirect();
    } catch (error) {
      console.error("Could not sign out", error);
      setSigningOut(false);
    }
  }

  const accountDisplayName = getDisplayName(me);
  const accountRole = normalizeRole(me?.profile?.role);
  const profileImageUrl = asText(me?.profile?.profile_image_url);

  return (
    <main className="cfsp-page">
      <div className="cfsp-container">
        <div className="grid gap-4">
          <header className="cfsp-panel px-5 py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href="/dashboard"
                      className="flex items-center gap-3 rounded-[12px] border border-[#d8e4ec] bg-white px-3 py-2 text-inherit no-underline shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                    >
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-[10px] bg-[#0f4673] text-xs font-black tracking-[0.14em] text-white">
                        {logoVisible ? (
                          <Image
                            src="/branding/cfsp-logo.png"
                            alt="CFSP"
                            width={40}
                            height={40}
                            unoptimized
                            onError={() => setLogoVisible(false)}
                          />
                        ) : (
                          <span>CFSP</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-black leading-tight text-[#14304f]">CFSP</div>
                        <div className="text-xs font-semibold text-[#5e7388]">Conflict-Free SP</div>
                      </div>
                    </Link>

                    <div className="inline-flex items-center rounded-full border border-[#8cd4be] bg-[#eaf7f2] px-3 py-1 text-xs font-black text-[#13624f]">
                      CFSP • Conflict-Free SP
                    </div>
                  </div>

                  <div className="mt-4 min-w-0">
                    <p className="cfsp-kicker">Conflict-Free SP operations</p>
                    <h1 className="mt-2 text-[1.65rem] leading-tight font-black text-[var(--cfsp-text)]">{title}</h1>
                    {subtitle ? <p className="cfsp-section-copy">{subtitle}</p> : null}
                  </div>
                </div>

                <div className="self-start lg:ml-4">
                  <details className="relative">
                    <summary
                      className="flex min-h-[46px] cursor-pointer list-none items-center gap-3 rounded-[12px] border border-[#d7e2ea] bg-white px-3 py-2 text-left text-sm font-bold text-[#14304f] transition-colors hover:bg-[#f8fbfd]"
                      style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
                    >
                      <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#eaf3fb] text-sm font-black text-[#145b96]">
                        {profileImageUrl ? (
                          <Image
                            src={profileImageUrl}
                            alt={accountDisplayName}
                            width={36}
                            height={36}
                            unoptimized
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          accountDisplayName.slice(0, 1).toUpperCase()
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block max-w-[120px] truncate text-sm font-black">{accountDisplayName}</span>
                        <span className="block text-xs font-semibold text-[#6a7e91]">{accountRole}</span>
                      </span>
                      <span className="text-xs text-[#6a7e91]">▾</span>
                    </summary>
                    <div
                      className="absolute right-0 z-20 mt-2 min-w-[220px] overflow-hidden rounded-[12px] border border-[#d8e4ec] bg-white shadow-[0_16px_32px_rgba(15,23,42,0.12)]"
                      style={{ top: "100%" }}
                    >
                      <div className="border-b border-[#e7eef4] px-4 py-3">
                        <div className="text-xs font-black uppercase tracking-[0.08em] text-[#6a7e91]">Account</div>
                        <div className="mt-1 text-sm font-bold text-[#14304f]">{accountDisplayName}</div>
                        <div className="mt-1 text-xs font-semibold text-[#6a7e91]">{accountRole}</div>
                      </div>
                      <div className="grid">
                        <Link
                          href="/me"
                          className="min-h-[44px] px-4 py-3 text-sm font-semibold text-[#14304f] no-underline transition-colors hover:bg-[#f8fbfd]"
                        >
                          My Profile
                        </Link>
                        <button
                          type="button"
                          onClick={handleSignOut}
                          disabled={signingOut}
                          className="min-h-[44px] border-0 border-t border-[#e7eef4] bg-white px-4 py-3 text-left text-sm font-semibold text-[#14304f] transition-colors hover:bg-[#f8fbfd] disabled:opacity-60"
                        >
                          {signingOut ? "Signing out..." : "Sign Out"}
                        </button>
                      </div>
                    </div>
                  </details>
                </div>
              </div>

              <nav className="flex flex-wrap gap-2 border-t border-[#e5edf3] pt-4" aria-label="Primary navigation">
                {navItems.map((item) => {
                  const active = activeMap.get(item.href);
                  const isPrimary = item.tone === "primary";

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="min-h-[42px] rounded-[10px] px-3 py-2 text-sm font-bold no-underline transition-colors"
                      style={{
                        background: active ? "#14304f" : isPrimary ? "#145b96" : "#ffffff",
                        border: active || isPrimary ? "1px solid transparent" : "1px solid #d7e2ea",
                        color: active || isPrimary ? "#ffffff" : "#14304f",
                        boxShadow: active || isPrimary ? "0 1px 2px rgba(15, 23, 42, 0.08)" : "none",
                      }}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </header>

          <section className="cfsp-panel px-5 py-5">{children}</section>
        </div>
      </div>
    </main>
  );
}
