export const CFSP_GUIDE_KEYS = [
  "admin_first_run",
  "event_command_center",
  "sp_portal_first_run",
  "settings_communication",
] as const;

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
    description: "A quick setup path for running events, staffing SPs, and checking people in.",
    steps: [
      {
        id: "review_organization_settings",
        title: "Review organization settings",
        description: "Confirm your workspace and basic settings before inviting staff or SPs.",
        href: "/settings",
        ctaLabel: "Open settings",
      },
      {
        id: "review_sp_roster",
        title: "Add or review SP roster",
        description: "Make sure the SP database has the people you plan to staff.",
        href: "/sps",
        ctaLabel: "Open SP database",
      },
      {
        id: "open_event",
        title: "Create or open an event",
        description: "Open the Event Command Center for the simulation you are planning.",
        href: "/events",
        ctaLabel: "Open events",
      },
      {
        id: "add_shift_offer",
        title: "Add an SP shift offer",
        description: "Use the event staffing area to create a portal/email-visible open shift.",
        pageHint: "Event Command Center",
      },
      {
        id: "review_communication_coverage",
        title: "Review SP communication coverage",
        description: "Check whether each assigned SP is reachable by portal, email, forms, or manual workflow.",
        pageHint: "Event Command Center",
      },
      {
        id: "invite_sp_portal",
        title: "Invite an SP to the portal",
        description: "Send or copy an invite only when you are ready for that SP to use portal workflows.",
        pageHint: "SP communication coverage",
      },
      {
        id: "run_live_attendance",
        title: "Run live attendance/check-in",
        description: "During the event, update SP attendance so the team sees the live status.",
        pageHint: "Live attendance",
      },
    ],
  },
  event_command_center: {
    key: "event_command_center",
    title: "Event Command Center Guide",
    description: "Use this guide while preparing or running a specific event.",
    steps: [
      {
        id: "review_event_details",
        title: "Review event details",
        description: "Check the event name, date, location, schedule context, and staffing needs.",
      },
      {
        id: "add_open_sp_shift",
        title: "Add an open SP shift",
        description: "Create an open shift from the current event context.",
        pageHint: "SP Shift Offers",
      },
      {
        id: "check_response_counts",
        title: "Check response counts",
        description: "Review available, maybe, declined, accepted, and withdrawn responses.",
        pageHint: "SP Shift Offers",
      },
      {
        id: "review_communication_coverage",
        title: "Review communication coverage",
        description: "Confirm portal, email, Microsoft Forms, and manual coverage before outreach.",
        pageHint: "Communication Coverage",
      },
      {
        id: "invite_unlinked_sps",
        title: "Invite unlinked SPs",
        description: "Invite only the SPs who should use the portal for this event.",
        pageHint: "Communication Coverage",
      },
      {
        id: "use_live_attendance",
        title: "Use live attendance check-in",
        description: "Mark SP attendance live without exposing SP-only views to other SP users.",
        pageHint: "Live attendance",
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

export function selectCFSPGuideKey(args: {
  pathname: string;
  role?: unknown;
  organizationRole?: unknown;
  legacyRole?: unknown;
}): CFSPGuideKey | null {
  const pathname = args.pathname || "/";
  const admin = isGuideAdminRole(args.organizationRole) || isGuideAdminRole(args.legacyRole) || isGuideAdminRole(args.role);
  const sp = isGuideSpRole(args.organizationRole) || isGuideSpRole(args.legacyRole) || isGuideSpRole(args.role);

  if (admin && /^\/events\/[^/]+(?:\/)?$/.test(pathname)) return "event_command_center";
  if (admin && pathname.startsWith("/settings")) return "settings_communication";
  if (sp && pathname.startsWith("/sp")) return "sp_portal_first_run";
  if (admin) return "admin_first_run";
  if (sp) return "sp_portal_first_run";
  return null;
}

export function getCFSPGuide(key: CFSPGuideKey | null | undefined) {
  return key ? CFSP_GUIDES[key] || null : null;
}
