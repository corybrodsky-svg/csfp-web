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
    description: "A focused sandbox path for external testers reviewing the operations workflow.",
    steps: [
      {
        id: "open_showcase_event",
        title: "Open the showcase event",
        description: "Go to Events and open Neurologic Assessment: Stroke Warning Signs.",
        href: "/events",
        ctaLabel: "Open events",
      },
      {
        id: "find_readiness_risks",
        title: "Find readiness risks",
        description: "Look for the not-checked-in SP, Room 4 readiness issue, faculty guide review, and learner flow risk.",
        pageHint: "Event Command Center",
      },
      {
        id: "assign_or_replace_sp",
        title: "Assign or replace an SP",
        description: "Use the staffing tools to resolve the at-risk SP coverage before learners are released.",
        pageHint: "Staffing / SP Hiring",
      },
      {
        id: "review_room_material_readiness",
        title: "Review rooms and materials",
        description: "Check Room Operations and Materials for Room 4, case files, and the faculty guide review status.",
        pageHint: "Room Operations and Materials",
      },
      {
        id: "preview_sp_communications",
        title: "Preview SP communications",
        description: "Open communication coverage and preview SP outreach without sending real bulk email.",
        pageHint: "Communications",
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
  event_command_center: {
    key: "event_command_center",
    title: "Event Command Center Guide",
    description: "Use this guide to evaluate readiness, staffing, rooms, materials, and communications for the sandbox event.",
    steps: [
      {
        id: "review_event_brief",
        title: "Review the event brief",
        description: "Confirm the status, date/time, program, event type, rooms, SP need, and owner assignments.",
      },
      {
        id: "identify_readiness_risks",
        title: "Identify readiness risks",
        description: "Find the not-checked-in SP, Room 4 readiness issue, faculty guide review, and learner flow risk.",
        pageHint: "Event Readiness Checklist",
      },
      {
        id: "assign_or_replace_sp",
        title: "Assign or replace an SP",
        description: "Use staffing coverage to decide whether to contact the missing SP or move the backup into Room 4.",
        pageHint: "Staffing / SP Hiring",
      },
      {
        id: "review_rooms_materials",
        title: "Review rooms and materials",
        description: "Check Room Operations and Materials for Room 4 setup, case files, and the pending faculty guide.",
        pageHint: "Room Operations",
      },
      {
        id: "preview_sp_communications",
        title: "Preview SP communications",
        description: "Preview confirmation and prep communications using sandbox-safe contacts only.",
        pageHint: "Communications",
      },
      {
        id: "follow_recommended_action",
        title: "Follow the recommended next action",
        description: "Use the most urgent recommendation to resolve the SP/Room 4 blocker before learner release.",
        pageHint: "Final Readiness / Day-of Ops",
      },
      {
        id: "submit_feedback",
        title: "Submit feedback",
        description: "Send tester feedback after you have tried the Event Command Center and new-event flow.",
        href: "/contact",
        ctaLabel: "Contact CFSP",
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
