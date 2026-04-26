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
  } | null;
};

type NavItem = {
  href: string;
  label: string;
  match?: "exact" | "prefix";
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "Main",
    items: [
      { href: "/dashboard", label: "Dashboard", match: "exact" },
      { href: "/events", label: "Events", match: "prefix" },
      { href: "/events/new", label: "New Event", match: "exact" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/sps", label: "SP Database", match: "prefix" },
      { href: "/staff", label: "Staff", match: "prefix" },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/events/upload", label: "Upload", match: "exact" },
      { href: "/sim-op", label: "Sim Op", match: "prefix" },
      { href: "/admin", label: "Admin", match: "prefix" },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/me", label: "Me", match: "prefix" },
      { href: "/login", label: "Login", match: "exact" },
    ],
  },
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
    navGroups.forEach((group) => {
      group.items.forEach((item) => next.set(item.href, isNavActive(pathname, item)));
    });
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

    return () => {
      cancelled = true;
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

  return (
    <main className="cfsp-page">
      <div className="cfsp-container">
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="cfsp-panel overflow-hidden border-0 bg-[var(--cfsp-sidebar)] text-white shadow-[0_14px_30px_rgba(15,63,105,0.22)]">
            <div className="flex flex-col gap-5 px-4 py-4">
              <Link
                href="/dashboard"
                className="flex items-center gap-3 rounded-xl border border-[var(--cfsp-sidebar-border)] bg-white/6 px-3 py-3 text-inherit no-underline"
              >
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-white text-xs font-black tracking-[0.14em] text-[var(--cfsp-sidebar)]">
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
                  <div className="text-base font-black leading-tight">CFSP</div>
                  <div className="text-xs font-semibold text-white/72">Conflict-Free SP</div>
                </div>
              </Link>

              <div className="inline-flex w-fit items-center rounded-full border border-[#8cd4be] bg-[#eaf7f2] px-3 py-1 text-xs font-black text-[#13624f]">
                CFSP • Conflict-Free SP
              </div>

              <nav className="grid gap-4" aria-label="Primary navigation">
                {navGroups.map((group) => (
                  <div key={group.label} className="grid gap-2">
                    <div className="px-2 text-[0.72rem] font-black uppercase tracking-[0.12em] text-white/58">
                      {group.label}
                    </div>
                    <div className="grid gap-1.5">
                      {group.items.map((item) => {
                        const active = activeMap.get(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className="cfsp-nav-link min-h-[42px] rounded-[10px] px-3 py-2 text-sm font-bold no-underline transition-colors"
                            style={{
                              background: active ? "#ffffff" : "transparent",
                              border: active ? "1px solid rgba(255,255,255,0.06)" : "1px solid transparent",
                              color: active ? "#0f3f69" : "rgba(255,255,255,0.9)",
                            }}
                          >
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>

              <div className="mt-auto border-t border-[var(--cfsp-sidebar-border)] pt-4 text-xs font-semibold text-white/62">
                Account controls are available in the header menu.
              </div>
            </div>
          </aside>

          <div className="grid gap-4">
            <header className="cfsp-panel px-5 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="cfsp-kicker">Conflict-Free SP operations</p>
                  <h1 className="mt-2 text-[1.65rem] leading-tight font-black text-[var(--cfsp-text)]">{title}</h1>
                  {subtitle ? <p className="cfsp-section-copy">{subtitle}</p> : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link href="/events" className="cfsp-btn cfsp-btn-subtle">
                    Events
                  </Link>
                  <Link href="/events/new" className="cfsp-btn cfsp-btn-primary min-w-[140px]">
                    New Event
                  </Link>
                  <details className="relative">
                    <summary
                      className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 rounded-[12px] border border-[#d7e2ea] bg-white px-3 py-2 text-left text-sm font-bold text-[#14304f] transition-colors hover:bg-[#f8fbfd]"
                      style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eaf3fb] text-xs font-black text-[#145b96]">
                        {accountDisplayName.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="max-w-[120px] truncate">{accountDisplayName}</span>
                      <span className="text-xs text-[#6a7e91]">▾</span>
                    </summary>
                    <div
                      className="absolute right-0 z-20 mt-2 min-w-[190px] overflow-hidden rounded-[12px] border border-[#d8e4ec] bg-white shadow-[0_16px_32px_rgba(15,23,42,0.12)]"
                      style={{ top: "100%" }}
                    >
                      <div className="border-b border-[#e7eef4] px-4 py-3">
                        <div className="text-xs font-black uppercase tracking-[0.08em] text-[#6a7e91]">Account</div>
                        <div className="mt-1 text-sm font-bold text-[#14304f]">{accountDisplayName}</div>
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
            </header>

            <section className="cfsp-panel px-5 py-5">{children}</section>
          </div>
        </div>
      </div>
    </main>
  );
}
