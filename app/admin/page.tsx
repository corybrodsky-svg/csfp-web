import Link from "next/link";
import SiteShell from "../components/SiteShell";

type AdminCard = {
  href: string;
  title: string;
  description: string;
};

const sections: Array<{ title: string; description: string; cards: AdminCard[] }> = [
  {
    title: "Event Management",
    description: "Open the live events workspace and create or review event records.",
    cards: [
      {
        href: "/events",
        title: "Events Board",
        description: "Review current and upcoming events, coverage, and staffing gaps.",
      },
      {
        href: "/events/new",
        title: "Create New Event",
        description: "Add a new event record and begin operational planning.",
      },
    ],
  },
  {
    title: "SP / People Management",
    description: "Manage standardized patients and supporting people records.",
    cards: [
      {
        href: "/sps",
        title: "SP Database",
        description: "Open the full SP directory, import people, and manage records.",
      },
      {
        href: "/staff",
        title: "Staff",
        description: "Review staff-facing tools and supporting operational pages.",
      },
    ],
  },
  {
    title: "Import / Tools",
    description: "Use operational utilities for uploads and simulation support.",
    cards: [
      {
        href: "/events/upload",
        title: "Upload Events",
        description: "Import workbook or schedule data into the events workflow.",
      },
      {
        href: "/sim-op",
        title: "Sim Op",
        description: "Open simulation operations tools and supporting workflow pages.",
      },
    ],
  },
  {
    title: "System / Account",
    description: "Quick access to account and control surfaces.",
    cards: [
      {
        href: "/dashboard",
        title: "Dashboard",
        description: "Return to the operational dashboard and quick actions view.",
      },
      {
        href: "/me",
        title: "My Account",
        description: "Open your profile, role, and current account details.",
      },
      {
        href: "/login",
        title: "Login Screen",
        description: "Open the sign-in page for testing or access handoff.",
      },
    ],
  },
];

export default function AdminPage() {
  return (
    <SiteShell
      title="Admin"
      subtitle="Use the admin hub to move quickly between event operations, people tools, imports, and account controls."
    >
      <div className="grid gap-5">
        <section className="rounded-[14px] border border-[#dce6ee] bg-[linear-gradient(180deg,#f8fbfd_0%,#eef5fb_100%)] px-5 py-5">
          <p className="cfsp-kicker">Administrative hub</p>
          <h2 className="mt-3 text-[1.7rem] leading-tight font-black text-[#14304f]">CFSP control center</h2>
          <p className="mt-3 max-w-3xl text-[0.98rem] leading-6 text-[#5e7388]">
            Launch the most important sections of the app from one place without hunting through scattered links.
          </p>
        </section>

        <div className="grid gap-5">
          {sections.map((section) => (
            <section key={section.title} className="cfsp-panel overflow-hidden">
              <div className="border-b border-[#e5edf3] px-5 py-4">
                <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">{section.title}</h3>
                <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">{section.description}</p>
              </div>

              <div className="grid gap-4 px-5 py-5 md:grid-cols-2 xl:grid-cols-3">
                {section.cards.map((card) => (
                  <Link
                    key={card.href}
                    href={card.href}
                    className="rounded-[12px] border border-[#d9e4ec] bg-[#f8fbfd] px-4 py-4 no-underline transition-transform hover:-translate-y-0.5"
                  >
                    <div className="cfsp-label">Open section</div>
                    <div className="mt-2 text-lg font-black text-[#14304f]">{card.title}</div>
                    <p className="mt-2 text-sm leading-6 text-[#5e7388]">{card.description}</p>
                    <div className="mt-4">
                      <span className="cfsp-btn cfsp-btn-secondary">Open</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </SiteShell>
  );
}
