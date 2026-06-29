import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Request a CFSP Demo | Conflict-Free SP",
  description:
    "Request a CFSP demo or pilot conversation for healthcare simulation operations, SP staffing, schedules, training readiness, materials release, and event-day execution.",
};

export default function RequestDemoLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
