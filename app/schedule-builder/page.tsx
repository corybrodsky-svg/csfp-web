import Link from "next/link";
import EventScheduleBuilder from "../components/EventScheduleBuilder";
import SiteShell from "../components/SiteShell";
import { canAccessLegacyGlobalScheduleBuilder, getLegacyGlobalScheduleBuilderUnavailableHref } from "../lib/legacyScheduleBuilderAccess";
import { getOrganizationContext } from "../lib/organizationAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ScheduleBuilderPage() {
  const context = await getOrganizationContext();

  if (!canAccessLegacyGlobalScheduleBuilder(context)) {
    const fallbackHref = getLegacyGlobalScheduleBuilderUnavailableHref(context);
    return (
      <SiteShell
        title="Schedule Builder Not Available"
        subtitle="This legacy workspace is restricted to platform-owner maintenance access."
      >
        <section className="cfsp-panel px-5 py-5">
          <h2 className="m-0 text-[1.35rem] font-black text-[#14304f]">Not available in this workspace</h2>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[#5e7388]">
            Use the Event Command Center schedule tools for event-specific schedule work.
          </p>
          <div className="mt-4">
            <Link href={fallbackHref} className="cfsp-btn">
              Back to workspace
            </Link>
          </div>
        </section>
      </SiteShell>
    );
  }

  return (
    <SiteShell
      title="Build Schedule"
      subtitle="Select a CFSP event and build a full-day learner session schedule in 12-hour time."
    >
      <EventScheduleBuilder />
    </SiteShell>
  );
}
