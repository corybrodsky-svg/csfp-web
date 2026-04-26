"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

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

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", match: "exact" },
  { href: "/events", label: "Events", match: "prefix" },
  { href: "/events/new", label: "New Event", match: "exact" },
  { href: "/events/upload", label: "Upload", match: "exact" },
  { href: "/sps", label: "SP Database", match: "prefix" },
  { href: "/sim-op", label: "Sim Op", match: "prefix" },
  { href: "/staff", label: "Staff", match: "prefix" },
  { href: "/admin", label: "Admin", match: "prefix" },
  { href: "/me", label: "Me", match: "prefix" },
  { href: "/login", label: "Login", match: "exact" },
];

function isNavActive(pathname: string, item: NavItem) {
  if (item.href === "/events" && pathname.startsWith("/events/")) return true;
  if (item.match === "prefix") return pathname === item.href || pathname.startsWith(`${item.href}/`);
  return pathname === item.href;
}

export default function SiteShell({ title, subtitle, children }: SiteShellProps) {
  const pathname = usePathname();
  const [logoVisible, setLogoVisible] = useState(true);

  const activeMap = useMemo(() => {
    const next = new Map<string, boolean>();
    navItems.forEach((item) => next.set(item.href, isNavActive(pathname, item)));
    return next;
  }, [pathname]);

  return (
    <main className="cfsp-page">
      <div className="cfsp-container">
        <header className="cfsp-panel mb-4 overflow-hidden">
          <div className="flex flex-col gap-4 px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <Link
                  href="/dashboard"
                  className="flex min-h-[52px] items-center gap-3 rounded-xl border border-[#d6e0e8] bg-white px-3 py-2 text-inherit no-underline"
                >
                  <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-[#d4e3ea] bg-[#f0f8f6] text-sm font-black tracking-[0.12em] text-[#0f4471]">
                    {logoVisible ? (
                      <Image
                        src="/branding/cfsp-logo.png"
                        alt="CFSP"
                        width={44}
                        height={44}
                        unoptimized
                        onError={() => setLogoVisible(false)}
                      />
                    ) : (
                      <span>CFSP</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="m-0 text-[1.05rem] font-black leading-tight text-[#14304f]">CFSP</p>
                    <p className="m-0 mt-0.5 text-xs font-bold text-[#5e7388]">
                      Conflict-Free SP operations
                    </p>
                  </div>
                </Link>

                <div className="hidden min-h-[36px] items-center rounded-full border border-[#bfe4d6] bg-[#eaf7f2] px-4 py-1 text-sm font-black text-[#196b57] md:inline-flex">
                  CFSP • Conflict-Free SP
                </div>
              </div>

              <div className="min-w-0 flex-1 lg:max-w-[52%]">
                <p className="cfsp-kicker">Healthcare Simulation Operations</p>
                <h1 className="m-0 mt-2 text-[1.9rem] leading-tight font-black text-[#14304f]">{title}</h1>
                {subtitle ? <p className="cfsp-section-copy">{subtitle}</p> : null}
              </div>
            </div>

            <nav className="flex flex-wrap gap-2 border-t border-[#e6edf3] pt-3" aria-label="Primary navigation">
              {navItems.map((item) => {
                const active = activeMap.get(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="cfsp-nav-link min-h-[42px] rounded-[10px] border px-3 py-2 text-[0.92rem] font-bold no-underline transition-colors"
                    style={{
                      background: active ? "#165a96" : "#ffffff",
                      borderColor: active ? "#165a96" : "#d6e0e8",
                      color: active ? "#ffffff" : "#14304f",
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
    </main>
  );
}
