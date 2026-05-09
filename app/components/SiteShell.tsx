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
  roles?: Array<"sp" | "faculty" | "sim_op" | "admin" | "super_admin">;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", match: "exact" },
  { href: "/events", label: "Events", match: "prefix" },
  { href: "/events/new", label: "New Event", match: "exact", tone: "primary", roles: ["sim_op", "admin", "super_admin"] },
  { href: "/schedule-builder", label: "Schedule Builder", match: "exact", roles: ["sim_op", "admin", "super_admin"] },
  { href: "/events/upload", label: "Upload", match: "exact", roles: ["sim_op", "admin", "super_admin"] },
  { href: "/sps", label: "SP Database", match: "prefix", roles: ["sim_op", "admin", "super_admin"] },
  { href: "/staff", label: "Staff", match: "prefix", roles: ["admin", "super_admin"] },
  { href: "/admin", label: "Admin", match: "prefix", roles: ["admin", "super_admin"] },
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
  if (role === "super_admin" || role === "admin" || role === "sim_op" || role === "faculty" || role === "sp") return role;
  return "sp";
}

function formatRoleLabel(value: unknown) {
  const role = normalizeRole(value);
  if (role === "super_admin") return "Super Admin";
  if (role === "admin") return "Admin";
  if (role === "sim_op") return "Sim Op";
  if (role === "faculty") return "Faculty";
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
  const [nightMode, setNightMode] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("cfsp-theme") === "dark";
    } catch {
      return false;
    }
  });

  const accountRole = normalizeRole(me?.profile?.role);
  const visibleNavItems = useMemo(
    () => navItems.filter((item) => !item.roles || item.roles.includes(accountRole)),
    [accountRole]
  );

  const activeMap = useMemo(() => {
    const next = new Map<string, boolean>();
    visibleNavItems.forEach((item) => next.set(item.href, isNavActive(pathname, item)));
    return next;
  }, [pathname, visibleNavItems]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", nightMode ? "dark" : "light");
  }, [nightMode]);

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

  function handleToggleNightMode() {
    setNightMode((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("cfsp-theme", next ? "dark" : "light");
      } catch {
        return next;
      }
      document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
      return next;
    });
  }

  const accountDisplayName = getDisplayName(me);
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
                      className="flex items-center gap-3 rounded-[12px] px-3 py-2 text-inherit no-underline shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                      style={{
                        border: "1px solid var(--cfsp-header-border)",
                        background: "var(--cfsp-header-bg)",
                      }}
                    >
                      <div
                        className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-[10px] text-xs font-black tracking-[0.14em] text-white"
                        style={{ background: "var(--cfsp-logo-bg)" }}
                      >
                        {logoVisible ? (
                          <Image
                            src="/branding/cfsp-logo.svg"
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
                        <div className="text-sm font-black leading-tight text-[var(--cfsp-text)]">CFSP</div>
                        <div className="text-xs font-semibold text-[var(--cfsp-text-muted)]">Conflict-Free SP</div>
                      </div>
                    </Link>

                    <div
                      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-black"
                      style={{
                        border: "1px solid var(--cfsp-shell-chip-border)",
                        background: "var(--cfsp-shell-chip-bg)",
                        color: "var(--cfsp-shell-chip-text)",
                      }}
                    >
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
                  <div className="mb-3 flex justify-end">
                    <button
                      type="button"
                      onClick={handleToggleNightMode}
                      className="cfsp-btn cfsp-btn-subtle min-h-[40px]"
                    >
                      {nightMode ? "Night Mode: On" : "Night Mode"}
                    </button>
                  </div>
                  <details className="relative">
                    <summary
                      className="flex min-h-[46px] cursor-pointer list-none items-center gap-3 rounded-[12px] px-3 py-2 text-left text-sm font-bold transition-colors"
                      style={{
                        border: "1px solid var(--cfsp-header-border)",
                        background: "var(--cfsp-header-bg)",
                        color: "var(--cfsp-text)",
                        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                      }}
                    >
                      <span
                        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-sm font-black"
                        style={{
                          background: "var(--cfsp-theme-toggle-bg)",
                          color: "var(--cfsp-blue-dark)",
                        }}
                      >
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
                        <span className="block text-xs font-semibold text-[var(--cfsp-text-muted)]">{formatRoleLabel(accountRole)}</span>
                      </span>
                      <span className="text-xs text-[var(--cfsp-text-muted)]">▾</span>
                    </summary>
                    <div
                      className="absolute right-0 z-20 mt-2 min-w-[220px] overflow-hidden rounded-[12px] shadow-[0_16px_32px_rgba(15,23,42,0.12)]"
                      style={{
                        top: "100%",
                        border: "1px solid var(--cfsp-header-border)",
                        background: "var(--cfsp-header-bg)",
                      }}
                    >
                      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--cfsp-border)" }}>
                        <div className="text-xs font-black uppercase tracking-[0.08em] text-[var(--cfsp-text-muted)]">Account</div>
                        <div className="mt-1 text-sm font-bold text-[var(--cfsp-text)]">{accountDisplayName}</div>
                        <div className="mt-1 text-xs font-semibold text-[var(--cfsp-text-muted)]">{formatRoleLabel(accountRole)}</div>
                      </div>
                      <div className="grid">
                        <Link
                          href="/me"
                          className="min-h-[44px] px-4 py-3 text-sm font-semibold no-underline transition-colors"
                          style={{ color: "var(--cfsp-text)" }}
                        >
                          My Profile
                        </Link>
                        <button
                          type="button"
                          onClick={handleSignOut}
                          disabled={signingOut}
                          className="min-h-[44px] border-0 bg-transparent px-4 py-3 text-left text-sm font-semibold transition-colors disabled:opacity-60"
                          style={{
                            borderTop: "1px solid var(--cfsp-border)",
                            color: "var(--cfsp-text)",
                          }}
                        >
                          {signingOut ? "Signing out..." : "Sign Out"}
                        </button>
                      </div>
                    </div>
                  </details>
                </div>
              </div>

              <nav className="flex flex-wrap gap-2 pt-4" aria-label="Primary navigation" style={{ borderTop: "1px solid var(--cfsp-border)" }}>
                {visibleNavItems.map((item) => {
                  const active = activeMap.get(item.href);
                  const isPrimary = item.tone === "primary";

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="min-h-[42px] rounded-[10px] px-3 py-2 text-sm font-bold no-underline transition-colors"
                      style={{
                        background: active ? "var(--cfsp-blue-dark)" : isPrimary ? "var(--cfsp-blue)" : "var(--cfsp-header-bg)",
                        border: active || isPrimary ? "1px solid transparent" : "1px solid var(--cfsp-header-border)",
                        color: active || isPrimary ? "#ffffff" : "var(--cfsp-text)",
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
