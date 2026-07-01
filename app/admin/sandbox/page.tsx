import { redirect } from "next/navigation";
import SiteShell from "../../components/SiteShell";
import { createSupabaseAdminClient } from "../../lib/supabaseAdminClient";
import {
  getOrganizationContext,
  roleCanManageOrganization,
} from "../../lib/organizationAuth";
import { loadSandboxDiagnostics } from "../../lib/sandboxManager";
import SandboxManagerClient from "./SandboxManagerClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export default async function SandboxManagerPage() {
  const organizationContext = await getOrganizationContext();
  if (!organizationContext.user) redirect("/login");

  if (!roleCanManageOrganization(organizationContext.role)) {
    return (
      <SiteShell
        title="Sandbox Manager"
        subtitle="Shared sandbox controls are restricted."
      >
        <div className="cfsp-alert cfsp-alert-info">
          Only platform owners and organization admins can manage the shared sandbox.
        </div>
      </SiteShell>
    );
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return (
      <SiteShell
        title="Sandbox Manager"
        subtitle="Server-side Supabase admin access is required."
      >
        <div className="cfsp-alert cfsp-alert-error">
          Sandbox Manager needs the Supabase service role configured on the server.
        </div>
      </SiteShell>
    );
  }

  const diagnostics = await loadSandboxDiagnostics(admin, {
    activeOrganizationId: organizationContext.activeOrganization?.id || "",
    activeOrganizationName: organizationContext.activeOrganization?.name || "",
  });

  return <SandboxManagerClient initialDiagnostics={diagnostics} />;
}
