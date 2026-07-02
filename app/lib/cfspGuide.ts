export const CFSP_GUIDE_KEYS = [
  "admin_first_run",
  "sandbox_first_run",
  "event_command_center",
  "sandbox_event_command_center",
  "sp_portal_first_run",
  "settings_communication",
] as const;

const SANDBOX_ORG_SLUG = "cfsp-sandbox-simulation-center";
const SANDBOX_SHOWCASE_EVENT_NAME = "Neurologic Assessment: Stroke Warning Signs";

export type CFSPGuideKey = (typeof CFSP_GUIDE_KEYS)[number];

export type CFSPGuideRole = "sp" | "faculty" | "sim_op" | "admin" | "super_admin" | "platform_owner" | "org_admin" | "sim_ops" | "viewer";

export type CFSPGuideStep = {
  id: string;
  title: string;
  description: string;
  href?: string;
  pageHint?: string;
  ctaLabel?: string;
  roles?: CFSPGuideRole[];
};

export type CFSPGuideDefinition = {
  key: CFSPGuideKey;
  title: string;
  description: string;
  steps: CFSPGuideStep[];
};

export const CFSP_GUIDES: Record<CFSPGuideKey, CFSPGuideDefinition> = {
  admin_first_run: {
    key: "admin_first_run",
    title: "CFSP Guide",
    description: "A focused path for reviewing events, staffing, readiness, communications, and settings.",
    steps: [
      {
        id: "review_events",
        title: "Review events",
        description: "Open the Events Board to scan upcoming operations and readiness status.",
        href: "/events",
        ctaLabel: "Open events",
      },
      {
        id: "open_command_center",
        title: "Open an Event Command Center",
        description: "Choose an upcoming event and start with the first-screen snapshot: Total SPs Needed, Confirmed SPs, Checked-In SPs, Backup SPs, Shortage, and Primary Risk / Next Action.",
        pageHint: "Event Command Center",
      },
      {
        id: "review_staffing",
        title: "Review SP coverage",
        description: "Check confirmed coverage, backup coverage, check-in state, and shortage as separate signals before deciding what to fix.",
        pageHint: "Staffing / SP Hiring",
      },
      {
        id: "review_room_material_readiness",
        title: "Review rooms and materials",
        description: "Use Schedule Builder and Materials & Training to confirm room readiness, event materials, faculty guides, and learner flow before the event goes live.",
        pageHint: "Schedule Builder / Materials & Training",
      },
      {
        id: "preview_sp_communications",
        title: "Preview SP communications",
        description: "Review how SP outreach and confirmations fit alongside your existing communication workflow.",
        pageHint: "Release to SP Portal",
      },
      {
        id: "create_new_event",
        title: "Create a new event",
        description: "Start a new event from the New Event flow to test how quickly the structure comes together.",
        href: "/events/new",
        ctaLabel: "Create event",
      },
      {
        id: "submit_feedback",
        title: "Submit feedback",
        description: "Send notes about what felt clear, confusing, or missing from the operations workflow.",
        href: "/contact",
        ctaLabel: "Contact CFSP",
      },
    ],
  },
  sandbox_first_run: {
    key: "sandbox_first_run",
    title: "CFSP Sandbox Guide",
    description: "A guided path for testing the shared fictional sandbox and the real CFSP operations workflow.",
    steps: [
      {
        id: "open_showcase_event",
        title: "Start with Neurologic Assessment: Stroke Warning Signs",
        description: `Open ${SANDBOX_SHOWCASE_EVENT_NAME} from the dashboard or Events Board, then review it in the Event Command Center.`,
        href: `/events?search=${encodeURIComponent(SANDBOX_SHOWCASE_EVENT_NAME)}`,
        ctaLabel: "Find showcase event",
      },
      {
        id: "find_staffing_risk",
        title: "Find the staffing or check-in risk",
        description: "Use the Event Snapshot and Staffing / SP Hiring section to compare confirmed SPs, backup SPs, shortage, and check-in state without mixing the counts.",
        pageHint: "Event Snapshot / Staffing / SP Hiring",
      },
      {
        id: "review_room_4",
        title: "Look for Room 4 not ready",
        description: "Review room readiness and decide what needs to happen before learners are released.",
        pageHint: "Schedule Builder / Day-of Check-In",
      },
      {
        id: "review_faculty_guide",
        title: "Look for the faculty guide pending review",
        description: "Check materials readiness and confirm whether the faculty guide is still awaiting final review.",
        pageHint: "Materials & Training",
      },
      {
        id: "review_learner_flow",
        title: "Look for learner flow marked at risk",
        description: "Review the learner flow status and the recommended next action for the operator.",
        pageHint: "Event Snapshot / Day-of Check-In",
      },
      {
        id: "create_new_event",
        title: "Try creating a new event",
        description: "Use the New Event flow to test how quickly an event structure comes together.",
        href: "/events/new",
        ctaLabel: "Create event",
      },
      {
        id: "submit_feedback",
        title: "Report anything confusing, unrealistic, or broken",
        description: "Send feedback about bugs, missing features, realism issues, or workflow friction.",
        href: "/sandbox-feedback",
        ctaLabel: "Send feedback",
      },
    ],
  },
  event_command_center: {
    key: "event_command_center",
    title: "Event Command Center Guide",
    description: "Use the Event Command Center to answer three operator questions: what is ready, what is missing, and what should happen next.",
    steps: [
      {
        id: "review_event_snapshot",
        title: "Start with Event Snapshot",
        description: "Read Total SPs Needed, Confirmed SPs, Checked-In SPs, Backup SPs, Shortage, and Primary Risk / Next Action before opening deeper tools.",
        pageHint: "Event Snapshot",
      },
      {
        id: "read_coverage_counts",
        title: "Read coverage counts separately",
        description: "Confirmed SPs are accepted coverage, Checked-In SPs are day-of arrivals, Backup SPs are standby coverage, and Shortage is the open staffing gap.",
        pageHint: "Event Command Center snapshot",
      },
      {
        id: "assign_or_replace_sp",
        title: "Open Staffing / SP Hiring",
        description: "Use this section when the missing item is SP coverage, backup coverage, or a staffing next action.",
        pageHint: "Staffing / SP Hiring",
      },
      {
        id: "build_or_review_schedule",
        title: "Open Schedule Builder",
        description: "Use this section when rooms, rotations, timing, learner roster, or learner flow need review.",
        pageHint: "Schedule Builder",
      },
      {
        id: "review_rooms_materials",
        title: "Open Materials & Training",
        description: "Use this section when case files, training details, faculty prep, or SP prep materials are missing or awaiting review.",
        pageHint: "Materials & Training",
      },
      {
        id: "preview_sp_communications",
        title: "Open Release to SP Portal",
        description: "Use this section to preview what confirmed SPs can see before relying on arrival, role/case, schedule, training, or material details.",
        pageHint: "Release to SP Portal",
      },
      {
        id: "day_of_check_in",
        title: "Open Day-of Check-In",
        description: "Use this section when the check-in window is open or the event is about to start. Resolve arrival, room, and learner-flow issues before they affect learners.",
        pageHint: "Day-of Check-In",
      },
      {
        id: "review_follow_up",
        title: "Use Review / Follow-Up",
        description: "Use this section after operations are stable to review readiness items, capture follow-up notes, and record workflow improvements.",
        pageHint: "Review / Follow-Up",
      },
      {
        id: "advanced_details",
        title: "Use Advanced Details only when needed",
        description: "Use Advanced Details for full operational data, legacy controls, troubleshooting, and less common administrative actions.",
        pageHint: "Advanced Details",
      },
    ],
  },
  sandbox_event_command_center: {
    key: "sandbox_event_command_center",
    title: "Sandbox Event Command Center Guide",
    description: "Use this guide to review the showcase event like a sim operations lead: what is ready, what is missing, and what should happen next.",
    steps: [
      {
        id: "review_event_brief",
        title: "Review the showcase snapshot",
        description: "Start with Total SPs Needed, Confirmed SPs, Checked-In SPs, Backup SPs, Shortage, and Primary Risk / Next Action.",
        pageHint: "Event Snapshot",
      },
      {
        id: "find_staffing_risk",
        title: "Find the staffing risk",
        description: "Look for the coverage or backup gap first. If the event is still in the future, check-in should show as not open yet rather than counted arrivals.",
        pageHint: "Event Snapshot / Staffing / SP Hiring",
      },
      {
        id: "review_room_4",
        title: "Find Room 4 not ready",
        description: "Use Schedule Builder or Day-of Check-In to identify what must be fixed before learner movement begins.",
        pageHint: "Schedule Builder / Day-of Check-In",
      },
      {
        id: "review_faculty_guide",
        title: "Find the faculty guide pending final review",
        description: "Use Materials & Training to confirm the pending faculty guide item without treating sandbox materials as real records.",
        pageHint: "Materials & Training",
      },
      {
        id: "review_learner_flow",
        title: "Find learner flow marked at risk",
        description: "Use the Primary Risk / Next Action sentence and Day-of Check-In workflow to decide the most urgent operator fix.",
        pageHint: "Event Snapshot / Day-of Check-In",
      },
      {
        id: "preview_sp_communications",
        title: "Preview or review SP communications",
        description: "Open Release to SP Portal and Communications to see how CFSP supports test-safe confirmation, prep, and portal preview workflows.",
        pageHint: "Release to SP Portal",
      },
      {
        id: "create_new_event",
        title: "Try creating a new event",
        description: "Return to the New Event flow when you are ready to test event setup from scratch.",
        href: "/events/new",
        ctaLabel: "Create event",
      },
      {
        id: "submit_feedback",
        title: "Report anything confusing, unrealistic, or broken",
        description: "Send feedback about bugs, missing features, realism issues, or workflow friction.",
        href: "/sandbox-feedback",
        ctaLabel: "Send feedback",
      },
    ],
  },
  sp_portal_first_run: {
    key: "sp_portal_first_run",
    title: "My SP Portal Guide",
    description: "A simple checklist for using your SP portal.",
    steps: [
      {
        id: "open_sp_portal",
        title: "Open My SP Portal",
        description: "Use the SP Portal page to see only your own SP information.",
        href: "/sp",
        ctaLabel: "Open portal",
      },
      {
        id: "review_open_shifts",
        title: "Review open shifts",
        description: "Look for open shifts that are available in the portal.",
        href: "/sp#open-shifts",
        ctaLabel: "View shifts",
      },
      {
        id: "respond_to_shift",
        title: "Accept, Maybe, or Decline a shift",
        description: "Choose the response that best matches your availability.",
        href: "/sp#open-shifts",
      },
      {
        id: "check_my_responses",
        title: "Check My Responses",
        description: "Review your own saved responses after submitting.",
        href: "/sp#my-responses",
      },
      {
        id: "review_upcoming_events",
        title: "Review Upcoming Events",
        description: "Check your upcoming assigned events.",
        href: "/sp#my-upcoming-events",
      },
      {
        id: "review_attendance_status",
        title: "Review Attendance Status",
        description: "During event day, check your own attendance status.",
        href: "/sp#my-attendance",
      },
    ],
  },
  settings_communication: {
    key: "settings_communication",
    title: "Communication Settings Guide",
    description: "Set up how CFSP should support SP communication workflows.",
    steps: [
      {
        id: "set_default_mode",
        title: "Set default SP communication mode",
        description: "Choose the default path your team expects to use most often.",
        href: "/settings#sp-communication-settings",
      },
      {
        id: "enable_workflows",
        title: "Enable portal, email, MS Forms, or manual workflows",
        description: "Keep the hybrid options that fit your SP population.",
        href: "/settings#sp-communication-settings",
      },
      {
        id: "add_ms_forms_url",
        title: "Add default MS Forms URL if used",
        description: "Store a default forms link only if your team uses Microsoft Forms.",
        href: "/settings#sp-communication-settings",
      },
      {
        id: "add_onboarding_message",
        title: "Add SP onboarding message",
        description: "Write a short, friendly note for SP portal invites.",
        href: "/settings#sp-communication-settings",
      },
      {
        id: "save_settings",
        title: "Save settings",
        description: "Save changes so future event workflows use the updated preferences.",
        href: "/settings#sp-communication-settings",
      },
    ],
  },
};

export function isCFSPGuideKey(value: unknown): value is CFSPGuideKey {
  return CFSP_GUIDE_KEYS.includes(value as CFSPGuideKey);
}

export function normalizeGuideRole(value: unknown): CFSPGuideRole {
  const role = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "platform_owner" || role === "org_admin" || role === "sim_ops" || role === "super_admin" || role === "admin" || role === "sim_op" || role === "faculty" || role === "sp" || role === "viewer") {
    return role;
  }
  return "viewer";
}

export function isGuideAdminRole(value: unknown) {
  const role = normalizeGuideRole(value);
  return role === "platform_owner" || role === "org_admin" || role === "sim_ops" || role === "super_admin" || role === "admin" || role === "sim_op";
}

export function isGuideSpRole(value: unknown) {
  return normalizeGuideRole(value) === "sp";
}

export function isSandboxOrganizationSlug(value: unknown) {
  return String(value || "").trim().toLowerCase() === SANDBOX_ORG_SLUG;
}

export function selectCFSPGuideKey(args: {
  pathname: string;
  role?: unknown;
  organizationRole?: unknown;
  legacyRole?: unknown;
  organizationSlug?: unknown;
}): CFSPGuideKey | null {
  const pathname = args.pathname || "/";
  const admin = isGuideAdminRole(args.organizationRole) || isGuideAdminRole(args.legacyRole) || isGuideAdminRole(args.role);
  const sp = isGuideSpRole(args.organizationRole) || isGuideSpRole(args.legacyRole) || isGuideSpRole(args.role);
  const sandbox = isSandboxOrganizationSlug(args.organizationSlug);

  if (admin && sandbox && /^\/events\/[^/]+(?:\/)?$/.test(pathname)) return "sandbox_event_command_center";
  if (admin && /^\/events\/[^/]+(?:\/)?$/.test(pathname)) return "event_command_center";
  if (admin && pathname.startsWith("/settings")) return "settings_communication";
  if (sp && pathname.startsWith("/sp")) return "sp_portal_first_run";
  if (admin && sandbox) return "sandbox_first_run";
  if (admin) return "admin_first_run";
  if (sp) return "sp_portal_first_run";
  return null;
}

export function getCFSPGuide(key: CFSPGuideKey | null | undefined) {
  return key ? CFSP_GUIDES[key] || null : null;
}
