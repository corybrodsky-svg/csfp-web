export const SP_PORTAL_RESPONSE_ACTIONS = ["accepted", "declined"] as const;

export type SpPortalResponseAction = (typeof SP_PORTAL_RESPONSE_ACTIONS)[number];

export const SP_PORTAL_RELEASE_SECTIONS = [
  "eventBasics",
  "location",
  "arrival",
  "virtualAccess",
  "roleCase",
  "training",
  "schedule",
  "materials",
] as const;

export type SpPortalReleaseSectionKey = (typeof SP_PORTAL_RELEASE_SECTIONS)[number];

export type SpPortalReleaseSectionInput = {
  released?: unknown;
  checked?: unknown;
  hasSourceInfo?: unknown;
};

export type SpPortalReleaseSectionState = {
  key: SpPortalReleaseSectionKey;
  label: string;
  released: boolean;
  checked: boolean;
  hasSourceInfo: boolean;
  status: "visible" | "hidden" | "needs_source";
  statusLabel: string;
  spMessage: string;
};

export type SpPortalReleaseState = Record<SpPortalReleaseSectionKey, SpPortalReleaseSectionState>;

export type SpPortalReleaseInput = Partial<Record<SpPortalReleaseSectionKey, SpPortalReleaseSectionInput | boolean | null | undefined>>;

export type SpPortalReadinessChecklistItem = {
  key: SpPortalReleaseSectionKey;
  label: string;
  status: "available" | "not_released" | "not_needed";
  statusLabel: string;
  detail: string;
};

export type SpPortalNextActionState = {
  label: string;
  detail: string;
  tone: "success" | "waiting" | "neutral";
};

export type SpPortalAdminReadinessRowInput = {
  responseStatus?: unknown;
  assignmentStatus?: unknown;
  confirmed?: boolean | null;
  portalLinked?: boolean | null;
  profileAttention?: boolean | null;
  acknowledged?: boolean | null;
};

export type SpPortalAdminReadinessSummary = {
  totalAssigned: number;
  accepted: number;
  awaitingResponse: number;
  declined: number;
  portalLinked: number;
  profileAttention: number;
  acknowledged: number;
  hiddenReleaseGates: number;
  sourceBlockedReleaseGates: number;
  blockerCount: number;
  nextAction: string;
};

export type SpPortalReleaseGateGroupKey =
  | "eventBasics"
  | "schedule"
  | "roleCase"
  | "training"
  | "materials"
  | "arrival"
  | "virtualAccess";

export type SpPortalReleaseGateGroup = {
  key: SpPortalReleaseGateGroupKey;
  label: string;
  status: "released" | "hidden" | "missing";
  statusLabel: string;
  detail: string;
  blockerLabel: string;
  releasedCount: number;
  hiddenCount: number;
  missingCount: number;
};

export type SpPortalReleaseWorkflowSummary = {
  groups: SpPortalReleaseGateGroup[];
  blockerLabels: string[];
  nextRecommendedAction: string;
};

export type SpPortalPreviewAssignmentState = {
  label: string;
  detail: string;
  hasPreviewAssignment: boolean;
};

export type SpPortalEventLike = {
  id?: string | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

export type SpPortalOpenShiftLike = {
  openingId?: string | null;
  currentResponse?: {
    response?: string | null;
  } | null;
};

export type SpPortalResponseLike = {
  id?: string | null;
  openingId?: string | null;
  response?: string | null;
  responded_at?: string | null;
  updated_at?: string | null;
  event?: SpPortalEventLike | null;
  opening?: {
    shift_date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
  } | null;
};

export type SpPortalAssignmentLike = {
  id?: string | null;
  eventId?: string | null;
  sp_id?: string | null;
  spId?: string | null;
  event?: SpPortalEventLike | null;
  status?: string | null;
  assignment_status?: string | null;
  confirmed?: boolean | null;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asBooleanFlag(value: unknown) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  const text = asText(value).toLowerCase();
  return text === "yes" || text === "true" || text === "1" || text === "enabled" || text === "ready" || text === "released";
}

export function normalizeSpPortalResponse(value: unknown) {
  return asText(value).toLowerCase().replace(/[\s-]+/g, "_");
}

const RELEASE_SECTION_LABELS: Record<SpPortalReleaseSectionKey, string> = {
  eventBasics: "Event basics",
  location: "Location / room",
  arrival: "Arrival / reporting",
  virtualAccess: "Virtual access",
  roleCase: "Role / case",
  training: "Training details",
  schedule: "Schedule preview",
  materials: "Materials",
};

const RELEASE_SECTION_MESSAGES: Record<SpPortalReleaseSectionKey, string> = {
  eventBasics: "Event name, date, and time are visible.",
  location: "Location and room will appear here once released by the simulation team.",
  arrival: "Arrival and reporting instructions will appear here once released by the simulation team.",
  virtualAccess: "Virtual access will appear here once released by the simulation team.",
  roleCase: "Role and case details will appear here once released by the simulation team.",
  training: "Training details will appear here once released by the simulation team.",
  schedule: "Schedule not released yet.",
  materials: "Training materials not released yet.",
};

const READINESS_DETAILS: Record<SpPortalReleaseSectionKey, { available: string; notReleased: string; notNeeded: string }> = {
  eventBasics: {
    available: "Event name, date, and time are visible.",
    notReleased: "Event basics are not available yet.",
    notNeeded: "Event basics are always shown for confirmed work.",
  },
  location: {
    available: "Location or room details are available.",
    notReleased: "Location and room will appear once released by the simulation team.",
    notNeeded: "Location is not needed for this event.",
  },
  arrival: {
    available: "Arrival and reporting instructions are available.",
    notReleased: "Arrival and reporting instructions will appear once released by the simulation team.",
    notNeeded: "Arrival instructions are not needed for this event.",
  },
  virtualAccess: {
    available: "Virtual access details are available.",
    notReleased: "Virtual access will appear once released by the simulation team.",
    notNeeded: "Virtual access is not needed for this event.",
  },
  roleCase: {
    available: "Role or case details are available.",
    notReleased: "Role and case details will appear once released by the simulation team.",
    notNeeded: "Role/case details are not needed for this event.",
  },
  training: {
    available: "Training details are available.",
    notReleased: "Training details will appear once released by the simulation team.",
    notNeeded: "Training details are not needed for this event.",
  },
  schedule: {
    available: "Schedule preview is available.",
    notReleased: "Schedule not released yet.",
    notNeeded: "Schedule preview is not needed for this event.",
  },
  materials: {
    available: "Materials are available.",
    notReleased: "Training materials not released yet.",
    notNeeded: "Materials are not needed for this event.",
  },
};

const RELEASE_GATE_GROUPS: Array<{
  key: SpPortalReleaseGateGroupKey;
  label: string;
  sections: SpPortalReleaseSectionKey[];
  blockerLabel: string;
}> = [
  {
    key: "eventBasics",
    label: "Event basics",
    sections: ["eventBasics", "location"],
    blockerLabel: "Event basics hidden",
  },
  {
    key: "schedule",
    label: "Schedule",
    sections: ["schedule"],
    blockerLabel: "Schedule hidden",
  },
  {
    key: "roleCase",
    label: "Role/case",
    sections: ["roleCase"],
    blockerLabel: "Role/case hidden",
  },
  {
    key: "training",
    label: "Training",
    sections: ["training"],
    blockerLabel: "Training hidden",
  },
  {
    key: "materials",
    label: "Materials",
    sections: ["materials"],
    blockerLabel: "Materials hidden",
  },
  {
    key: "arrival",
    label: "Arrival/reporting",
    sections: ["arrival"],
    blockerLabel: "Arrival/reporting hidden",
  },
  {
    key: "virtualAccess",
    label: "Virtual access",
    sections: ["virtualAccess"],
    blockerLabel: "Virtual access hidden or not configured",
  },
];

function normalizeReleaseSection(
  key: SpPortalReleaseSectionKey,
  input?: SpPortalReleaseSectionInput | boolean | null
): SpPortalReleaseSectionState {
  if (key === "eventBasics") {
    return {
      key,
      label: RELEASE_SECTION_LABELS[key],
      released: true,
      checked: true,
      hasSourceInfo: true,
      status: "visible",
      statusLabel: "Visible",
      spMessage: RELEASE_SECTION_MESSAGES[key],
    };
  }

  const inputObject = typeof input === "object" && input !== null ? input : null;
  const checked = inputObject ? asBooleanFlag(inputObject.checked ?? inputObject.released) : asBooleanFlag(input);
  const hasSourceInfo = inputObject ? asBooleanFlag(inputObject.hasSourceInfo ?? inputObject.released) : checked;
  const released = inputObject ? asBooleanFlag(inputObject.released ?? (checked && hasSourceInfo)) : checked;
  const visible = released && hasSourceInfo;
  const status = visible ? "visible" : checked && !hasSourceInfo ? "needs_source" : "hidden";

  return {
    key,
    label: RELEASE_SECTION_LABELS[key],
    released: visible,
    checked,
    hasSourceInfo,
    status,
    statusLabel: visible ? "Released" : status === "needs_source" ? "Needs info before release" : "Not released yet",
    spMessage: visible ? `${RELEASE_SECTION_LABELS[key]} released.` : RELEASE_SECTION_MESSAGES[key],
  };
}

export function buildSpPortalReleaseState(input: SpPortalReleaseInput = {}): SpPortalReleaseState {
  return Object.fromEntries(
    SP_PORTAL_RELEASE_SECTIONS.map((key) => [key, normalizeReleaseSection(key, input[key])])
  ) as SpPortalReleaseState;
}

export function getSpPortalReleasedDetailLabels(input?: SpPortalReleaseInput | SpPortalReleaseState | null) {
  const state = buildSpPortalReleaseState(input || {});
  return SP_PORTAL_RELEASE_SECTIONS.filter((key) => state[key].released).map((key) => state[key].label);
}

export function getSpPortalPendingDetailLabels(input?: SpPortalReleaseInput | SpPortalReleaseState | null) {
  const state = buildSpPortalReleaseState(input || {});
  return SP_PORTAL_RELEASE_SECTIONS.filter((key) => key !== "eventBasics" && !state[key].released).map((key) => state[key].label);
}

export function getSpPortalReleaseGateGroups(input?: SpPortalReleaseInput | SpPortalReleaseState | null) {
  const state = buildSpPortalReleaseState(input || {});
  return RELEASE_GATE_GROUPS.map((group) => {
    const sections = group.sections.map((key) => state[key]);
    const releasedCount = sections.filter((section) => section.released).length;
    const missingCount = sections.filter((section) => section.status === "needs_source").length;
    const hiddenCount = sections.length - releasedCount - missingCount;
    const status = missingCount > 0 ? "missing" : releasedCount === sections.length ? "released" : "hidden";
    const hiddenLabels = sections.filter((section) => !section.released).map((section) => section.label);
    const detail = status === "released"
      ? `${group.label} released to confirmed SPs.`
      : status === "missing"
        ? `${group.label} needs source information before it can be released.`
        : hiddenLabels.length
          ? `${hiddenLabels.join(", ")} hidden from SPs.`
          : `${group.label} hidden from SPs.`;

    return {
      key: group.key,
      label: group.label,
      status,
      statusLabel: status === "released" ? "Released" : status === "missing" ? "Missing / not configured" : "Hidden",
      detail,
      blockerLabel: group.blockerLabel,
      releasedCount,
      hiddenCount,
      missingCount,
    } satisfies SpPortalReleaseGateGroup;
  });
}

export function buildSpPortalReleaseWorkflowSummary(args: {
  release?: SpPortalReleaseInput | SpPortalReleaseState | null;
  adminSummary?: Partial<SpPortalAdminReadinessSummary> | null;
  assignedCount?: number;
  confirmedCount?: number;
}): SpPortalReleaseWorkflowSummary {
  const groups = getSpPortalReleaseGateGroups(args.release || {});
  const assignedCount = Math.max(0, Number(args.assignedCount ?? args.adminSummary?.totalAssigned ?? 0));
  const confirmedCount = Math.max(0, Number(args.confirmedCount ?? 0));
  const awaitingResponse = Math.max(0, Number(args.adminSummary?.awaitingResponse || 0));
  const declined = Math.max(0, Number(args.adminSummary?.declined || 0));
  const profileAttention = Math.max(0, Number(args.adminSummary?.profileAttention || 0));
  const blockerLabels: string[] = [];

  if (assignedCount === 0) blockerLabels.push("No assigned SPs");
  if (awaitingResponse > 0) blockerLabels.push("Awaiting SP response");
  if (declined > 0) blockerLabels.push("SP declined");
  if (profileAttention > 0) blockerLabels.push("Account not linked");
  groups.forEach((group) => {
    if (group.key === "eventBasics") return;
    if (group.status !== "released") blockerLabels.push(group.blockerLabel);
  });

  let nextRecommendedAction = "All required SP portal details are released.";
  const scheduleGroup = groups.find((group) => group.key === "schedule");
  const roleCaseGroup = groups.find((group) => group.key === "roleCase");
  const trainingGroup = groups.find((group) => group.key === "training");
  const materialsGroup = groups.find((group) => group.key === "materials");

  if (assignedCount === 0) {
    nextRecommendedAction = "Assign SPs before releasing portal details.";
  } else if (profileAttention > 0) {
    nextRecommendedAction = "Resolve account links before relying on SP portal readiness.";
  } else if (awaitingResponse > 0) {
    nextRecommendedAction = "Some SPs have not responded yet.";
  } else if (declined > 0) {
    nextRecommendedAction = "Review declined SP assignments before release.";
  } else if (confirmedCount > 0 && roleCaseGroup?.status !== "released") {
    nextRecommendedAction = "Release role/case details after assignments are finalized.";
  } else if (scheduleGroup?.status === "missing") {
    nextRecommendedAction = "Finish schedule setup before releasing the portal schedule.";
  } else if (scheduleGroup?.status === "hidden") {
    nextRecommendedAction = "Schedule is ready to release.";
  } else if (trainingGroup?.status !== "released" || materialsGroup?.status !== "released") {
    nextRecommendedAction = "Training materials are still hidden.";
  } else if (groups.some((group) => group.status !== "released")) {
    nextRecommendedAction = "Review hidden release gates and publish any details SPs need.";
  }

  return {
    groups,
    blockerLabels: Array.from(new Set(blockerLabels)),
    nextRecommendedAction,
  };
}

export function getSpPortalPreviewAssignmentState(args: {
  assignedCount?: number;
  confirmedCount?: number;
  representativeName?: string | null;
}): SpPortalPreviewAssignmentState {
  const assignedCount = Math.max(0, Number(args.assignedCount || 0));
  const confirmedCount = Math.max(0, Number(args.confirmedCount || 0));
  const name = asText(args.representativeName);

  if (assignedCount === 0) {
    return {
      label: "No SP assignment available",
      detail: "Assign or confirm an SP before using this as a portal-specific preview.",
      hasPreviewAssignment: false,
    };
  }

  if (name) {
    return {
      label: `Previewing ${name}`,
      detail: "Representative admin preview only. You are not logged in as this SP.",
      hasPreviewAssignment: true,
    };
  }

  return {
    label: confirmedCount > 0 ? "Previewing a confirmed SP assignment" : "Previewing a selected/staged assignment",
    detail: "Representative admin preview only. You are not logged in as an SP.",
    hasPreviewAssignment: true,
  };
}

export function getSpPortalResponseDisplay(value: unknown) {
  const status = normalizeSpPortalResponse(value);
  if (status === "accepted" || status === "available") {
    return {
      key: "accepted",
      label: "Accepted - awaiting confirmation",
      detail: "Your response was sent to the simulation team. This is not confirmed work until they confirm your assignment.",
      actionable: false,
    };
  }
  if (status === "declined" || status === "withdrawn") {
    return {
      key: "declined",
      label: status === "withdrawn" ? "Withdrawn" : "Declined",
      detail: "Your response was sent to the simulation team.",
      actionable: false,
    };
  }
  if (status === "maybe") {
    return {
      key: "needs_review",
      label: "Needs review",
      detail: "Your earlier response needs coordinator review.",
      actionable: false,
    };
  }
  return {
    key: "awaiting_response",
    label: "Awaiting response",
    detail: "Accept or decline this open shift offer.",
    actionable: true,
  };
}

function readinessItemStatus(section: SpPortalReleaseSectionState) {
  if (section.released) return "available" as const;
  if ((section.key === "virtualAccess" || section.key === "materials") && !section.checked && !section.hasSourceInfo) {
    return "not_needed" as const;
  }
  return "not_released" as const;
}

export function buildSpPortalReadinessChecklist(input: SpPortalReleaseInput | SpPortalReleaseState = {}) {
  const state = buildSpPortalReleaseState(input);
  return SP_PORTAL_RELEASE_SECTIONS.map((key) => {
    const section = state[key];
    const status = readinessItemStatus(section);
    return {
      key,
      label: section.label,
      status,
      statusLabel: status === "available" ? "Available" : status === "not_needed" ? "Not needed" : "Not released yet",
      detail:
        status === "available"
          ? READINESS_DETAILS[key].available
          : status === "not_needed"
            ? READINESS_DETAILS[key].notNeeded
            : READINESS_DETAILS[key].notReleased,
    } satisfies SpPortalReadinessChecklistItem;
  });
}

export function getSpPortalAssignmentNextAction(args: {
  responseStatus?: unknown;
  assignmentStatus?: unknown;
  confirmed?: boolean | null;
  readinessItems?: SpPortalReadinessChecklistItem[];
  pendingAcknowledgmentCount?: number;
  checkedIn?: boolean | null;
}): SpPortalNextActionState {
  const response = getSpPortalResponseDisplay(args.responseStatus);
  const assignmentStatus = normalizeSpPortalResponse(args.assignmentStatus);
  if (assignmentStatus === "declined" || assignmentStatus === "no_show" || response.key === "declined") {
    return {
      label: "Declined - no active assignment",
      detail: "This event is no longer shown as active confirmed work.",
      tone: "neutral",
    };
  }

  const confirmed = args.confirmed === true || assignmentStatus === "confirmed" || assignmentStatus === "confirmed_primary" || assignmentStatus === "confirmed_backup";
  if (!confirmed) {
    return {
      label: response.label,
      detail: response.detail,
      tone: response.actionable ? "waiting" : "neutral",
    };
  }

  const pendingAcknowledgments = Math.max(0, Number(args.pendingAcknowledgmentCount || 0));
  if (pendingAcknowledgments > 0) {
    return {
      label: "Acknowledge released details",
      detail: `${pendingAcknowledgments} released item${pendingAcknowledgments === 1 ? "" : "s"} still need${pendingAcknowledgments === 1 ? "s" : ""} your acknowledgment.`,
      tone: "waiting",
    };
  }

  const readinessItems = args.readinessItems || [];
  const availableCount = readinessItems.filter((item) => item.status === "available").length;
  const notReleasedCount = readinessItems.filter((item) => item.status === "not_released").length;
  if (notReleasedCount > 0) {
    return {
      label: "Confirmed - no response needed",
      detail: availableCount > 1
        ? "Review the available details now. More details will appear as your simulation team releases them."
        : "Event basics are visible. More details will appear as your simulation team releases them.",
      tone: "waiting",
    };
  }

  if (args.checkedIn) {
    return {
      label: "Checked in",
      detail: "You are checked in for this event.",
      tone: "success",
    };
  }

  return {
    label: "Ready for event day",
    detail: "Available details are reviewed and no response is needed.",
    tone: "success",
  };
}

export function buildSpPortalAdminReadinessSummary(
  rows: SpPortalAdminReadinessRowInput[],
  options?: { hiddenReleaseGates?: number; sourceBlockedReleaseGates?: number }
): SpPortalAdminReadinessSummary {
  let accepted = 0;
  let awaitingResponse = 0;
  let declined = 0;
  let portalLinked = 0;
  let profileAttention = 0;
  let acknowledged = 0;

  rows.forEach((row) => {
    const response = normalizeSpPortalResponse(row.responseStatus);
    const assignment = normalizeSpPortalResponse(row.assignmentStatus);
    const isDeclined = response === "declined" || response === "withdrawn" || assignment === "declined" || assignment === "no_show";
    const isAccepted = !isDeclined && (response === "accepted" || response === "available" || row.confirmed === true || assignment === "confirmed" || assignment === "confirmed_primary" || assignment === "confirmed_backup");
    if (isDeclined) declined += 1;
    else if (isAccepted) accepted += 1;
    else awaitingResponse += 1;

    if (row.portalLinked) portalLinked += 1;
    if (row.profileAttention || !row.portalLinked) profileAttention += 1;
    if (row.acknowledged) acknowledged += 1;
  });

  const hiddenReleaseGates = Math.max(0, Number(options?.hiddenReleaseGates || 0));
  const sourceBlockedReleaseGates = Math.max(0, Number(options?.sourceBlockedReleaseGates || 0));
  const blockerCount = awaitingResponse + declined + profileAttention + sourceBlockedReleaseGates;
  const nextAction = !rows.length
    ? "Assign or confirm SPs before portal readiness can be reviewed."
    : profileAttention
      ? "Resolve SP portal account links before relying on portal readiness."
      : sourceBlockedReleaseGates
        ? "Add source information for selected release gates."
        : awaitingResponse
          ? "Follow up with SPs who have not accepted or been confirmed."
          : hiddenReleaseGates
            ? "Review hidden release gates and publish any details SPs need."
            : "SP portal readiness is on track.";

  return {
    totalAssigned: rows.length,
    accepted,
    awaitingResponse,
    declined,
    portalLinked,
    profileAttention,
    acknowledged,
    hiddenReleaseGates,
    sourceBlockedReleaseGates,
    blockerCount,
    nextAction,
  };
}

function dateTimeKey(dateValue?: string | null, timeValue?: string | null) {
  const date = asText(dateValue);
  if (!date) return Number.POSITIVE_INFINITY;
  const dt = new Date(`${date}T${asText(timeValue) || "00:00:00"}`);
  if (Number.isNaN(dt.getTime())) return Number.POSITIVE_INFINITY;
  return dt.getTime();
}

function isPastEvent(event?: SpPortalEventLike | null, now = new Date()) {
  const key = dateTimeKey(event?.date, event?.end_time || event?.start_time);
  if (key === Number.POSITIVE_INFINITY) return false;
  return key < now.getTime() - 12 * 60 * 60 * 1000;
}

function responseEventId(response: SpPortalResponseLike) {
  return asText(response.event?.id);
}

function assignmentEventId(assignment: SpPortalAssignmentLike) {
  return asText(assignment.eventId || assignment.event?.id);
}

export function isActionableOpenShift(shift: SpPortalOpenShiftLike) {
  return !normalizeSpPortalResponse(shift.currentResponse?.response);
}

export function isConfirmedAssignment(assignment: SpPortalAssignmentLike) {
  const statuses = [
    normalizeSpPortalResponse(assignment.status),
    normalizeSpPortalResponse(assignment.assignment_status),
  ].filter(Boolean);
  if (statuses.some((status) => status === "declined" || status === "no_show" || status === "cancelled" || status === "canceled")) return false;
  return assignment.confirmed === true || statuses.some((status) => status === "confirmed" || status === "confirmed_primary" || status === "confirmed_backup");
}

export function filterSpPortalAssignmentsForIdentity<TAssignment extends SpPortalAssignmentLike>(
  assignments: TAssignment[],
  linkedSpId: string
) {
  const identity = asText(linkedSpId);
  if (!identity) return [];
  return assignments.filter((assignment) => asText(assignment.sp_id || assignment.spId) === identity);
}

export function isPendingSpPortalResponse(
  response: SpPortalResponseLike,
  confirmedEventIds: Set<string>,
  now = new Date()
) {
  const status = normalizeSpPortalResponse(response.response);
  if (status !== "accepted" && status !== "available") return false;
  const eventId = responseEventId(response);
  if (eventId && confirmedEventIds.has(eventId)) return false;
  const event = response.event || {
    date: response.opening?.shift_date || null,
    start_time: response.opening?.start_time || null,
    end_time: response.opening?.end_time || null,
  };
  return !isPastEvent(event, now);
}

export function buildSpPortalCommandCenterState<
  TShift extends SpPortalOpenShiftLike,
  TResponse extends SpPortalResponseLike,
  TAssignment extends SpPortalAssignmentLike,
>(args: {
  openShifts: TShift[];
  myResponses: TResponse[];
  assignedEvents: TAssignment[];
  now?: Date;
}) {
  const now = args.now || new Date();
  const confirmedAssignments = args.assignedEvents.filter(isConfirmedAssignment);
  const confirmedEventIds = new Set(confirmedAssignments.map(assignmentEventId).filter(Boolean));
  const openShifts = args.openShifts.filter(isActionableOpenShift);
  const pendingResponses = args.myResponses.filter((response) => isPendingSpPortalResponse(response, confirmedEventIds, now));
  const pendingResponseIds = new Set(pendingResponses.map((response) => asText(response.id)).filter(Boolean));
  const pastAssignments = confirmedAssignments.filter((assignment) => isPastEvent(assignment.event, now));
  const upcomingAssignments = confirmedAssignments.filter((assignment) => !isPastEvent(assignment.event, now));
  const declinedResponses = args.myResponses.filter((response) => {
    const status = normalizeSpPortalResponse(response.response);
    return status === "declined" || status === "withdrawn";
  });
  const pastResponses = args.myResponses.filter((response) => {
    const id = asText(response.id);
    if (id && pendingResponseIds.has(id)) return false;
    const status = normalizeSpPortalResponse(response.response);
    if (status === "no_response") return false;
    if (status === "declined" || status === "withdrawn") return true;
    const event = response.event || {
      date: response.opening?.shift_date || null,
      start_time: response.opening?.start_time || null,
      end_time: response.opening?.end_time || null,
    };
    return isPastEvent(event, now);
  });

  return {
    openShifts,
    pendingResponses,
    confirmedAssignments: upcomingAssignments,
    pastAssignments,
    declinedResponses,
    pastResponses,
    counts: {
      openShifts: openShifts.length,
      pendingResponses: pendingResponses.length,
      confirmedAssignments: upcomingAssignments.length,
      pastEvents: pastAssignments.length + pastResponses.length,
    },
  };
}

export function shouldShowSpPortalOrgSwitcher(organizationCount: number) {
  return organizationCount > 1;
}
