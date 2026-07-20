"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const publicLinks = [
  { href: "/", label: "Home" },
  { href: "/demo", label: "Public Demo" },
  { href: "/request-access", label: "Sandbox Access" },
  { href: "/request-demo", label: "Private Walkthrough" },
] as const;

type PublicHeaderProps = {
  variant?: "dark" | "light";
};

export default function PublicHeader({ variant = "dark" }: PublicHeaderProps) {
  const pathname = usePathname();
  const isLight = variant === "light";
  const brandClassName = isLight ? "text-[#0f2638]" : "text-[#f5fbff]";
  const linkClassName = isLight
    ? "text-[#385467] hover:bg-[#eef5f7] hover:text-[#0d756d] focus-visible:outline-[#0d756d]"
    : "text-[#d9ebf8] hover:bg-[#17344e] hover:text-white focus-visible:outline-[#8bd6ff]";
  const activeLinkClassName = isLight ? "bg-[#eefaf7] text-[#0d5f55]" : "bg-[#15344c] text-white";

  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <Link
        href="/"
        className={`text-[15px] font-black tracking-[-0.01em] no-underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-4 ${brandClassName}`}
      >
        Conflict-Free SP LLC
      </Link>
      <nav className="flex flex-wrap items-center justify-end gap-1.5" aria-label="Public navigation">
        {publicLinks.map((link) => {
          const isCurrent = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isCurrent ? "page" : undefined}
              className={`inline-flex min-h-[40px] items-center rounded-lg px-3 text-sm font-bold no-underline transition focus-visible:outline-2 focus-visible:outline-offset-2 ${linkClassName} ${isCurrent ? activeLinkClassName : ""}`}
            >
              {link.label}
            </Link>
          );
        })}
        <Link
          href="/login"
          aria-current={pathname === "/login" ? "page" : undefined}
          className={`inline-flex min-h-[42px] items-center rounded-lg border px-4 text-sm font-extrabold no-underline transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
            isLight
              ? "border-[#0a615a] bg-[#0b746b] text-white hover:bg-[#095f58] focus-visible:outline-[#0d756d]"
              : "border-[#75b9ff8a] bg-[#1673c8] text-white hover:bg-[#1783e4] focus-visible:outline-[#8bd6ff]"
          }`}
        >
          Sign In
        </Link>
      </nav>
    </header>
  );
}
