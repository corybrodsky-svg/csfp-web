"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

type DemoFlowLinkProps = {
  children: ReactNode;
  className?: string;
};

export function DemoFlowLink({ children, className }: DemoFlowLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();

    const target = document.getElementById("demo-flow");

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.pushState(null, "", "#demo-flow");
    }
  }

  return (
    <Link href="/demo#demo-flow" className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
