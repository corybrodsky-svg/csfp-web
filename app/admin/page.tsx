import Link from "next/link";
import SiteShell from "../components/SiteShell";

type AdminAction = {
  href: string;
  label: string;
  tone?: "primary" | "secondary" | "success";
};

type AdminPanel = {
  title: string;
  description: string;
  actions: AdminAction[];
};

const panels: AdminPanel[] = [
  {
    title: "Event Management",
    description: "Open the live board, create new events, or jump straight into the current schedule workflow.",
    actions: [
      { href: "/events", label: "Open Events Board", tone: "primary" },
      { href: "/events/new", label: "Create New Event", tone: "secondary" },
    ],
  },
  {
    title: "SP / People Management",
    description: "Manage standardized patient records and supporting staff pages without extra navigation steps.",
    actions: [
      { href: "/sps", label: "Open SP Database", tone: "success" },
      { href: "/staff", label: "Open Staff", tone: "secondary" },
    ],
  },
  {
    title: "Import / Tools",
    description: "Launch uploads and simulation support tools directly from the admin hub.",
    actions: [
      { href: "/events/upload", label: "Upload Events", tone: "primary" },
      { href: "/sim-op", label: "Open Sim Op", tone: "secondary" },
    ],
  },
  {
    title: "System / Account",
    description: "Move between the dashboard, account tools, and the login screen from one control surface.",
    actions: [
      { href: "/dashboard", label: "Open Dashboard", tone: "secondary" },
      { href: "/me", label: "Open My Account", tone: "secondary" },
      { href: "/login", label: "Open Login", tone: "secondary" },
    ],
  },
];

function buttonClass(tone: AdminAction["tone"]) {
  if (tone === "success") return "cfsp-btn cfsp-btn-success";
  if (tone === "primary") return "cfsp-btn cfsp-btn-primary";
  return "cfsp-btn cfsp-btn-secondary";
}

export default function AdminPage() {
  return (
    <SiteShell
      title="Admin"
      subtitle="Launch operational tools directly from the admin hub without taking an extra navigation step."
    >
      <div className="grid gap-5">
        <section className="rounded-[14px] border border-[#dce6ee] bg-[linear-gradient(180deg,#f8fbfd_0%,#eef5fb_100%)] px-5 py-5">
          <p className="cfsp-kicker">Administrative hub</p>
          <h2 className="mt-3 text-[1.7rem] leading-tight font-black text-[#14304f]">CFSP control center</h2>
          <p className="mt-3 max-w-3xl text-[0.98rem] leading-6 text-[#5e7388]">
            Use these action panels to jump straight into the work you need to do next.
          </p>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          {panels.map((panel) => (
            <section key={panel.title} className="cfsp-panel overflow-hidden">
              <div className="border-b border-[#e5edf3] px-5 py-4">
                <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">{panel.title}</h3>
                <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">{panel.description}</p>
              </div>

              <div className="grid gap-3 px-5 py-5">
                {panel.actions.map((action) => (
                  <Link key={action.href} href={action.href} className={buttonClass(action.tone)}>
                    {action.label}
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
