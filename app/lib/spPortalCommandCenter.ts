export const SP_PORTAL_RESPONSE_ACTIONS = ["accepted", "declined"] as const;

export type SpPortalResponseAction = (typeof SP_PORTAL_RESPONSE_ACTIONS)[number];

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
  event?: SpPortalEventLike | null;
  status?: string | null;
  assignment_status?: string | null;
  confirmed?: boolean | null;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function normalizeSpPortalResponse(value: unknown) {
  return asText(value).toLowerCase().replace(/[\s-]+/g, "_");
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
