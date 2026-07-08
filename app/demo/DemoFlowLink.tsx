"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

type DemoFlowLinkProps = {
  children: ReactNode;
  className?: string;
  targetId?: string;
};

export function DemoFlowLink({ children, className, targetId = "public-preview" }: DemoFlowLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();

    const target = document.getElementById(targetId);

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.pushState(null, "", `#${targetId}`);
    }
  }

  return (
    <Link href={`/demo#${targetId}`} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
