import Link from "next/link";
import SiteShell from "../components/SiteShell";

const actionCards = [
  {
    title: "Events Board",
    description: "Open the live operational board to review coverage, staffing gaps, and current event status.",
    href: "/events",
    label: "Open Events",
    tone: "secondary",
  },
  {
    title: "Schedule Creator",
    description: "Use the connected schedule-building workspace for rounds, rooms, learners, and staffing logic.",
    href: "/schedule-builder",
    label: "Open Schedule Creator",
    tone: "primary",
  },
  {
    title: "New Event Intake",
    description: "Launch the guided intake flow to create an event, generate sessions, and save it into CFSP.",
    href: "/events/new",
    label: "Create Event",
    tone: "secondary",
  },
  {
    title: "Imports",
    description: "Upload event workbooks and SP Event Info files using the existing import workflow.",
    href: "/events/upload",
    label: "Open Uploads",
    tone: "secondary",
  },
] as const;

function buttonClass(tone: "primary" | "secondary") {
  return tone === "primary" ? "cfsp-btn cfsp-btn-primary" : "cfsp-btn cfsp-btn-secondary";
}

export default function SimOpPage() {
  return (
    <SiteShell
      title="Sim Op"
      subtitle="Use this workspace as the bridge between event operations, schedule creation, and upload-driven setup."
    >
      <div className="grid gap-5">
        <section className="rounded-[14px] border border-[#dce6ee] bg-[linear-gradient(180deg,#f8fbfd_0%,#eef5fb_100%)] px-5 py-5">
          <p className="cfsp-kicker">Simulation operations</p>
          <h2 className="mt-3 text-[1.7rem] leading-tight font-black text-[#14304f]">Sim Op workspace</h2>
          <p className="mt-3 max-w-3xl text-[0.98rem] leading-6 text-[#5e7388]">
            This module is reserved for the broader simulation operations workflow. Use the linked tools below to
            continue working in the connected CFSP event, upload, and schedule-creation flows while this area expands.
          </p>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          {actionCards.map((card) => (
            <section key={card.title} className="cfsp-panel overflow-hidden">
              <div className="border-b border-[#e5edf3] px-5 py-4">
                <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">{card.title}</h3>
                <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">{card.description}</p>
              </div>

              <div className="px-5 py-5">
                <Link href={card.href} className={buttonClass(card.tone)}>
                  {card.label}
                </Link>
              </div>
            </section>
          ))}
        </div>
      </div>
    </SiteShell>
  );
}
