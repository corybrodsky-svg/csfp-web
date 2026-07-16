"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { signOutUserAndRedirect } from "../lib/clientAuth";
import { canAccessLegacyGlobalScheduleBuilder } from "../lib/legacyScheduleBuilderAccess";
import {
  type PortalNavigationRole,
  getEffectivePortalNavigationRole,
  getSpPortalLandingPath,
  isSpPortalAllowedPath,
  normalizePortalNavigationRole,
} from "../lib/spPortalAccess";
import CFSPGuide from "./onboarding/CFSPGuide";

type SiteShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

type ShellMeResponse = {
  user?: {
    email?: string | null;
  };
  accessStatus?: string;
  role?: string | null;
  legacyRole?: string | null;
  isPlatformOwner?: boolean | null;
  activeOrganization?: {
    id?: string | null;
    name?: string | null;
    slug?: string | null;
  } | null;
  memberships?: Array<{
    organization_id?: string | null;
    role?: string | null;
    status?: string | null;
    organization?: {
      id?: string | null;
      name?: string | null;
      slug?: string | null;
    } | null;
  }>;
  profile?: {
    full_name?: string | null;
    schedule_match_name?: string | null;
    schedule_name?: string | null;
    email?: string | null;
    role?: string | null;
    organization_role?: string | null;
    profile_image_url?: string | null;
  } | null;
};

type NavItem = {
  href: string;
  label: string;
  match?: "exact" | "prefix";
  tone?: "primary" | "default";
  roles?: Array<Exclude<PortalNavigationRole, "viewer">>;
  platformOwnerOnly?: boolean;
};

type ThemeMode = "light" | "dark";

let inMemoryThemeMode: ThemeMode = "light";

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", match: "exact" },
  { href: "/simvitals", label: "SimVitals", match: "exact" },
  { href: "/sp", label: "SP Portal", match: "exact", roles: ["sp"] },
  { href: "/events", label: "Events", match: "prefix" },
  { href: "/events/new", label: "New Event", match: "exact", tone: "primary", roles: ["sim_op", "admin", "super_admin"] },
  { href: "/schedule-builder", label: "Schedule Builder", match: "exact", platformOwnerOnly: true },
  { href: "/events/upload", label: "Upload", match: "exact", roles: ["super_admin"] },
  { href: "/sps", label: "SP Database", match: "prefix", roles: ["sim_op", "admin", "super_admin"] },
  { href: "/staff", label: "People & Access", match: "prefix", roles: ["admin", "super_admin"] },
  { href: "/admin", label: "Admin", match: "prefix", roles: ["admin", "super_admin"] },
  { href: "/demo", label: "Demo", match: "exact", roles: ["sim_op", "admin", "super_admin"] },
  { href: "/settings", label: "Settings", match: "prefix", roles: ["admin", "super_admin"] },
  { href: "/me", label: "Profile", match: "prefix" },
];

function isNavActive(pathname: string, item: NavItem) {
  if (item.href === "/schedule-builder") {
    return pathname.includes("/schedule-builder");
  }
  if (item.href === "/events" && pathname.includes("/schedule-builder")) return false;
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
  return normalizePortalNavigationRole(value);
}

function formatRoleLabel(value: unknown) {
  const role = normalizeRole(value);
  if (role === "super_admin") return "Super Admin";
  if (role === "admin") return "Admin";
  if (role === "sim_op") return "Sim Op";
  if (role === "faculty") return "Faculty";
  if (role === "viewer") return "Viewer";
  return "SP";
}

function formatOrganizationRoleLabel(value: unknown) {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "platform_owner") return "Platform Owner";
  if (role === "org_admin") return "Organization Admin";
  if (role === "sim_ops" || role === "sim_op") return "Sim Ops";
  if (role === "faculty") return "Faculty";
  if (role === "viewer") return "Viewer";
  if (role === "sp") return "SP";
  return formatRoleLabel(value);
}

function getThemeModeSnapshot(): ThemeMode {
  if (typeof window === "undefined") return inMemoryThemeMode;
  try {
    inMemoryThemeMode = window.localStorage.getItem("cfsp-theme") === "dark" ? "dark" : "light";
  } catch {
    return inMemoryThemeMode;
  }
  return inMemoryThemeMode;
}

function subscribeThemeMode(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === "cfsp-theme") onStoreChange();
  };
  const handleLocalChange = () => onStoreChange();

  window.addEventListener("storage", handleStorage);
  window.addEventListener("cfsp-theme-change", handleLocalChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("cfsp-theme-change", handleLocalChange);
  };
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

function getShellRole(me: ShellMeResponse | null) {
  return getEffectivePortalNavigationRole([
    me?.role,
    me?.legacyRole,
    me?.profile?.organization_role,
    me?.profile?.role,
  ]);
}

export function getVisibleSiteShellNavItems(accountRole: PortalNavigationRole, me: ShellMeResponse | null) {
  if (accountRole === "sp") {
    return navItems.filter((item) => item.roles?.includes("sp") || item.href === "/me");
  }
  const canAccessLegacyBuilder = canAccessLegacyGlobalScheduleBuilder(me);
  return navItems.filter((item) => {
    if (item.platformOwnerOnly && !canAccessLegacyBuilder) return false;
    return !item.roles || item.roles.includes(accountRole as Exclude<PortalNavigationRole, "viewer">);
  });
}

export default function SiteShell({ title, subtitle, children }: SiteShellProps) {
  const pathname = usePathname();
  const [logoVisible, setLogoVisible] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [me, setMe] = useState<ShellMeResponse | null>(null);
  const themeMode = useSyncExternalStore(subscribeThemeMode, getThemeModeSnapshot, () => "light");
  const nightMode = themeMode === "dark";

  const accountRole = getShellRole(me);
  const visibleNavItems = useMemo(
    () => getVisibleSiteShellNavItems(accountRole, me),
    [accountRole, me]
  );

  const activeMap = useMemo(() => {
    const next = new Map<string, boolean>();
    visibleNavItems.forEach((item) => next.set(item.href, isNavActive(pathname, item)));
    return next;
  }, [pathname, visibleNavItems]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeMode);
  }, [themeMode]);

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
        if (body.accessStatus === "no_active_membership" && pathname !== "/no-access") {
          window.location.replace("/no-access");
          return;
        }
        const nextRole = getShellRole(body);
        if (nextRole === "sp" && !isSpPortalAllowedPath(pathname)) {
          window.location.replace(getSpPortalLandingPath());
          return;
        }
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
  }, [pathname]);

  async function handleOrganizationChange(organizationId: string) {
    if (!organizationId || organizationId === asText(me?.activeOrganization?.id)) return;

    const response = await fetch("/api/organizations/active", {
      method: "POST",
      cache: "no-store",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ organization_id: organizationId }),
    });

    if (response.ok) {
      window.location.reload();
    }
  }

  async function handleSignOut() {
    try {
      setSigningOut(true);
      await signOutUserAndRedirect();
    } catch {
      setSigningOut(false);
    }
  }

  function setThemeMode(mode: ThemeMode) {
    inMemoryThemeMode = mode;
    try {
      window.localStorage.setItem("cfsp-theme", mode);
    } catch {
      // Local persistence is a convenience; the live theme should still switch.
    }
    document.documentElement.setAttribute("data-theme", mode);
    window.dispatchEvent(new Event("cfsp-theme-change"));
  }

  const accountDisplayName = getDisplayName(me);
  const profileImageUrl = asText(me?.profile?.profile_image_url);
  const activeOrganizationId = asText(me?.activeOrganization?.id);
  const activeOrganizationName = asText(me?.activeOrganization?.name);
  const activeOrganizationSlug = asText(me?.activeOrganization?.slug);
  const organizationMemberships = (me?.memberships || []).filter(
    (membership) => asText(membership.organization_id) && asText(membership.organization?.name)
  );
  const showOrganizationSwitcher = organizationMemberships.length > 1;
  const showDemoDataBadge =
    Boolean(me?.user?.email || me?.profile?.email) &&
    (activeOrganizationName.toLowerCase().includes("cfsp demo") ||
      activeOrganizationSlug.toLowerCase().includes("cfsp-demo"));
  const homeHref = accountRole === "sp" ? getSpPortalLandingPath() : "/dashboard";

  return (
    <main className="cfsp-page">
      <div className="cfsp-container">
        <div className="cfsp-shell-frame grid gap-4">
          <header className="cfsp-panel cfsp-shell-header px-5 py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href={homeHref}
                      className="group flex items-center gap-4 rounded-[22px] px-4 py-3 text-inherit no-underline transition duration-200 hover:-translate-y-0.5"
                      style={{
                        border: "1px solid rgba(20, 91, 150, 0.16)",
                        background:
                          "radial-gradient(circle at 18% 20%, rgba(126, 231, 219, 0.28), transparent 34%), linear-gradient(135deg, var(--cfsp-header-bg), rgba(255,255,255,0.82))",
                        boxShadow: "0 14px 34px rgba(20, 91, 150, 0.12), inset 0 1px 0 rgba(255,255,255,0.72)",
                      }}
                    >
                      <div
                        className="cfsp-command-mark is-compact transition duration-200 group-hover:scale-[1.03]"
                        aria-hidden="true"
                        style={{
                          width: "58px",
                          height: "58px",
                          boxShadow: "0 0 24px rgba(25, 138, 112, 0.2)",
                        }}
                      >
                        {logoVisible ? (
                          <Image
                            src="/branding/cfsp-logo.svg"
                            alt="CFSP"
                            width={52}
                            height={52}
                            unoptimized
                            className="cfsp-command-mark-logo"
                            onError={() => setLogoVisible(false)}
                          />
                        ) : (
                          <span className="relative z-[1] text-[0.62rem] font-black tracking-[0.14em] text-white">CFSP</span>
                        )}
                        <svg className="cfsp-command-mark-grid" aria-hidden="true" viewBox="0 0 88 64" fill="none">
                          <path
                            d="M4 44 H15 C20 44 21 33 27 33 H34 C40 33 41 20 48 20 C56 20 57 38 65 38 H74 C79 38 80 29 84 29"
                            stroke="currentColor"
                            strokeWidth="2.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M12 18 H30 M58 14 H76 M16 54 H42 M58 52 H78"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            opacity="0.38"
                          />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[1.35rem] font-black leading-tight text-[var(--cfsp-text)]">CFSP</div>
                        <div className="text-sm font-bold text-[var(--cfsp-text-muted)]">Conflict-Free Simulation Performance</div>
                        <div className="mt-1 text-[0.64rem] font-black uppercase tracking-[0.18em]" style={{ color: "var(--cfsp-green)" }}>
                          Simulation operations
                        </div>
                      </div>
                    </Link>
                  </div>

                  <div className="mt-4 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-[1.65rem] leading-tight font-black text-[var(--cfsp-text)]">{title}</h1>
                      {showDemoDataBadge ? (
                        <span
                          title="Fake data for demos only."
                          className="inline-flex rounded-full border px-2.5 py-1 text-[0.66rem] font-black uppercase tracking-[0.08em]"
                          style={{
                            borderColor: "rgba(25, 138, 112, 0.28)",
                            background: "rgba(209, 250, 229, 0.64)",
                            color: "#065f46",
                          }}
                        >
                          Demo Data
                        </span>
                      ) : null}
                    </div>
                    {subtitle ? <p className="cfsp-section-copy">{subtitle}</p> : null}
                  </div>
                </div>

                <div className="self-start lg:ml-4">
                  <div className="mb-3 flex justify-end">
                    <div className="cfsp-theme-switch" role="group" aria-label="Display mode">
                      <button
                        type="button"
                        onClick={() => setThemeMode("light")}
                        className={`cfsp-theme-choice${nightMode ? "" : " is-active"}`}
                        aria-pressed={!nightMode}
                      >
                        Light Mode
                      </button>
                      <button
                        type="button"
                        onClick={() => setThemeMode("dark")}
                        className={`cfsp-theme-choice${nightMode ? " is-active" : ""}`}
                        aria-pressed={nightMode}
                      >
                        Night Mode
                      </button>
                    </div>
                  </div>
                  <details className="cfsp-account-menu">
                    <summary
                      className="flex min-h-[46px] cursor-pointer list-none items-center gap-3 rounded-[12px] px-3 py-2 text-left text-base font-bold transition-colors"
                      style={{
                        border: "1px solid var(--cfsp-header-border)",
                        background: "var(--cfsp-header-bg)",
                        color: "var(--cfsp-text)",
                        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                      }}
                    >
                      <span
                        className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full text-base font-black"
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
                        <span className="block max-w-[120px] truncate text-base font-black">{accountDisplayName}</span>
                        <span className="block text-xs font-semibold text-[var(--cfsp-text-muted)]">{formatRoleLabel(accountRole)}</span>
                      </span>
                      <span className="text-xs text-[var(--cfsp-text-muted)]">▾</span>
                    </summary>
                    <div
                      className="cfsp-account-dropdown"
                      style={{
                        color: "var(--cfsp-text)",
                      }}
                    >
                      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--cfsp-border)" }}>
                        <div className="text-xs font-black uppercase tracking-[0.08em] text-[var(--cfsp-text-muted)]">Account</div>
                        <div className="mt-1 text-base font-bold text-[var(--cfsp-text)]">{accountDisplayName}</div>
                        <div className="mt-1 text-xs font-semibold text-[var(--cfsp-text-muted)]">
                          {formatOrganizationRoleLabel(me?.role || me?.profile?.organization_role || accountRole)}
                        </div>
                        {activeOrganizationName ? (
                          <div className="mt-1 text-xs font-semibold text-[var(--cfsp-text-muted)]">{activeOrganizationName}</div>
                        ) : null}
                      </div>
                      {showOrganizationSwitcher ? (
                        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--cfsp-border)" }}>
                          <label className="grid gap-2">
                            <span className="text-xs font-black uppercase tracking-[0.08em] text-[var(--cfsp-text-muted)]">
                              Workspace
                            </span>
                            <select
                              value={activeOrganizationId}
                              onChange={(event) => void handleOrganizationChange(event.target.value)}
                              className="cfsp-input"
                            >
                              {organizationMemberships.map((membership) => (
                                <option key={asText(membership.organization_id)} value={asText(membership.organization_id)}>
                                  {asText(membership.organization?.name)}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ) : null}
                      <div className="grid">
                        <Link
                          href="/me"
                          className="min-h-[44px] px-4 py-3 text-base font-semibold no-underline transition-colors"
                          style={{ color: "var(--cfsp-text)" }}
                        >
                          My Profile
                        </Link>
                        <button
                          type="button"
                          onClick={handleSignOut}
                          disabled={signingOut}
                          className="min-h-[44px] border-0 bg-transparent px-4 py-3 text-left text-base font-semibold transition-colors disabled:opacity-60"
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

              <nav className="flex flex-wrap gap-1.5 pt-4" aria-label="Primary navigation" style={{ borderTop: "1px solid var(--cfsp-border)" }}>
                {visibleNavItems.map((item) => {
                  const active = activeMap.get(item.href);
                  const isPrimary = item.tone === "primary";

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`cfsp-nav-link${active ? " is-active" : ""}${isPrimary ? " is-primary" : ""}`}
                      aria-current={active ? "page" : undefined}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </header>

          <section className="cfsp-panel cfsp-shell-content px-5 py-5">{children}</section>
        </div>
      </div>
      <CFSPGuide
        pathname={pathname}
        authenticated={Boolean(me?.user?.email || me?.profile?.email)}
        role={accountRole}
        legacyRole={me?.legacyRole || null}
        organizationRole={me?.role || me?.profile?.organization_role || null}
        organizationSlug={me?.activeOrganization?.slug || null}
      />
    </main>
  );
}
