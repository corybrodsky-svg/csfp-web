"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { signOutUserAndRedirect } from "../lib/clientAuth";

type SiteShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
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

export default function SiteShell({ title, subtitle, children }: SiteShellProps) {
  const pathname = usePathname();
  const [logoVisible, setLogoVisible] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  const activeMap = useMemo(() => {
    const next = new Map<string, boolean>();
    navGroups.forEach((group) => {
      group.items.forEach((item) => next.set(item.href, isNavActive(pathname, item)));
    });
    return next;
  }, [pathname]);

  async function handleSignOut() {
    try {
      setSigningOut(true);
      await signOutUserAndRedirect();
    } catch (error) {
      console.error("Could not sign out", error);
      setSigningOut(false);
    }
  }

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

              <div className="mt-auto grid gap-2 border-t border-[var(--cfsp-sidebar-border)] pt-4">
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="cfsp-shell-account-button min-h-[42px] rounded-[10px] border border-white/18 bg-white/8 px-3 py-2 text-left text-sm font-bold text-white transition-colors hover:bg-white/12 disabled:opacity-60"
                >
                  {signingOut ? "Signing out..." : "Sign Out"}
                </button>
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

                <div className="flex flex-wrap gap-2">
                  <Link href="/events" className="cfsp-btn cfsp-btn-subtle">
                    Events
                  </Link>
                  <Link href="/events/new" className="cfsp-btn cfsp-btn-primary min-w-[140px]">
                    New Event
                  </Link>
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
