import { redirect } from "next/navigation";
import SiteShell from "../components/SiteShell";
import {
  getOrganizationContext,
  requireActiveOrganization,
  roleCanOperateOrganization,
} from "../lib/organizationAuth";
import DemoOperatorClient from "./DemoOperatorClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function canUseDemoOperator(context: Awaited<ReturnType<typeof getOrganizationContext>>) {
  return (
    roleCanOperateOrganization(context.role) ||
    context.legacyRole === "super_admin" ||
    context.legacyRole === "admin" ||
    context.legacyRole === "sim_op"
  );
}

export default async function DemoOperatorPage() {
  const context = await getOrganizationContext();

  if (!context.user) {
    redirect("/login?returnTo=/demo");
  }

  if (!requireActiveOrganization(context) || !canUseDemoOperator(context)) {
    return (
      <SiteShell
        title="CFSP Demo Operator"
        subtitle="Internal demo checklist for simulation operators and administrators."
      >
        <div className="cfsp-alert cfsp-alert-info">
          Demo operator tools are reserved for admins and simulation operators. SP accounts should use the SP Portal only.
        </div>
      </SiteShell>
    );
  }

  return (
    <SiteShell
      title="CFSP Demo Operator"
      subtitle="Run the design partner walkthrough with fake demo data, privacy guardrails, and a compact checklist."
    >
      <DemoOperatorClient />
    </SiteShell>
  );
}
