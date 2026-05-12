import type { EditableEventType } from "./eventTypeNotes";
import { parseEventMetadata } from "./eventMetadata";

export type EventDisplayType = "skills" | "sp" | "hifi" | "training" | "virtual";

export type EventBadgeKind =
  | "training"
  | "virtual_sp"
  | "hifi"
  | "skills_workshop"
  | "sp_event";

const eventTypeToBadgeKind: Record<EditableEventType, EventBadgeKind> = {
  skills: "skills_workshop",
  sp: "sp_event",
  hifi: "hifi",
  training: "training",
  virtual: "virtual_sp",
};

type EventClassificationInput = {
  name?: string | null;
  status?: string | null;
  notes?: string | null;
  location?: string | null;
  visibility?: string | null;
  spNeeded?: number | null;
  assignmentCount?: number | null;
  confirmedCount?: number | null;
  isWorkshop?: boolean;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function buildEventText(input: EventClassificationInput) {
  return [input.name, input.status, input.notes, input.location, input.visibility]
    .map(asText)
    .join(" ")
    .toLowerCase();
}

function buildTitleText(input: EventClassificationInput) {
  return [input.name, input.status]
    .map(asText)
    .join(" ")
    .toLowerCase();
}

function buildLocationContextText(input: EventClassificationInput) {
  return [input.location]
    .map(asText)
    .join(" ")
    .toLowerCase();
}

export function isSkillsWorkshopEvent(
  spNeeded: number | null | undefined,
  assignmentCount: number | null | undefined,
  confirmedCount: number | null | undefined = 0
) {
  return Number(spNeeded || 0) <= 0 && Number(assignmentCount || 0) === 0 && Number(confirmedCount || 0) === 0;
}

export function classifyEventPresentation(input: EventClassificationInput) {
  const eventText = buildEventText(input);
  const titleText = buildTitleText(input);
  const locationContextText = buildLocationContextText(input);
  const modalityContextText = [input.name, input.status, input.location, input.visibility]
    .map(asText)
    .join(" ")
    .toLowerCase();
  const spNeeded = Number(input.spNeeded || 0);
  const assignmentCount = Number(input.assignmentCount || 0);
  const confirmedCount = Number(input.confirmedCount || 0);
  const explicitTypes = parseEventMetadata(input.notes).eventTypes;
  const explicitTypeSet = new Set(explicitTypes);
  const hasExplicitTypes = explicitTypeSet.size > 0;
  const hasRoomSignal =
    /\b(room|rooms|flat|flats|spl|sim lab|simulation lab|in person|in-person|onsite|on-site)\b/.test(
      locationContextText
    );
  const hasTrainingTitleSignal =
    /\btraining\b/.test(titleText) || titleText.includes("orientation") || titleText.includes("onboarding");
  const hasVirtualKeyword = /\b(vir|virtual|telehealth|breakout|online|remote)\b/.test(modalityContextText);

  const isTraining =
    explicitTypeSet.has("training") ||
    (!hasExplicitTypes && hasTrainingTitleSignal);
  const isVirtualSp =
    explicitTypeSet.has("virtual") ||
    (!hasExplicitTypes && !isTraining && hasVirtualKeyword && !hasRoomSignal);
  const isHiFi =
    explicitTypeSet.has("hifi") ||
    (!hasExplicitTypes &&
      !isTraining &&
      (eventText.includes("hi-fi") ||
        eventText.includes("hifi") ||
        eventText.includes("high fidelity")));

  const hasStructuredSpNeed = spNeeded > 0;
  const hasAssignments = assignmentCount > 0 || confirmedCount > 0;
  const isStructuredSpEvent = explicitTypeSet.has("sp") || hasStructuredSpNeed || hasAssignments;
  const derivedWorkshop =
    input.isWorkshop ?? isSkillsWorkshopEvent(spNeeded, assignmentCount, confirmedCount);
  const isSkillsEvent =
    explicitTypeSet.has("skills") ||
    (!hasExplicitTypes && !isTraining && !isHiFi && !isVirtualSp && !isStructuredSpEvent && derivedWorkshop);

  let primaryBadgeKind: EventBadgeKind = "sp_event";

  if (explicitTypeSet.has("sp")) {
    primaryBadgeKind = "sp_event";
  } else if (isTraining) {
    primaryBadgeKind = "training";
  } else if (isHiFi) {
    primaryBadgeKind = "hifi";
  } else if (isVirtualSp) {
    primaryBadgeKind = "virtual_sp";
  } else if (isSkillsEvent) {
    primaryBadgeKind = "skills_workshop";
  } else if (isStructuredSpEvent) {
    primaryBadgeKind = "sp_event";
  } else {
    primaryBadgeKind = "skills_workshop";
  }

  const labels: Record<EventBadgeKind, string> = {
    training: "Training",
    virtual_sp: "Virtual SP",
    hifi: "HiFi",
    skills_workshop: "Skills",
    sp_event: "SP Event",
  };

  const eventType: EventDisplayType =
    primaryBadgeKind === "training"
      ? "training"
      : primaryBadgeKind === "hifi"
        ? "hifi"
        : primaryBadgeKind === "virtual_sp"
          ? "virtual"
        : primaryBadgeKind === "skills_workshop"
          ? "skills"
          : "sp";

  const nextActiveEventTypes: EditableEventType[] = [...explicitTypes];
  if (isSkillsEvent) nextActiveEventTypes.push("skills");
  if (isStructuredSpEvent) nextActiveEventTypes.push("sp");
  if (isHiFi) nextActiveEventTypes.push("hifi");
  if (isTraining) nextActiveEventTypes.push("training");
  if (isVirtualSp) nextActiveEventTypes.push("virtual");

  const activeEventTypes = Array.from(new Set<EditableEventType>(nextActiveEventTypes));

  const activeBadgeKinds = Array.from(
    new Set<EventBadgeKind>([
      ...activeEventTypes.map((type) => eventTypeToBadgeKind[type]),
      primaryBadgeKind,
    ])
  );

  return {
    eventType,
    activeEventTypes,
    activeBadgeKinds,
    primaryBadgeKind,
    primaryBadgeLabel: labels[primaryBadgeKind],
    isTraining,
    isVirtualSp,
    isHiFi,
    isSkillsWorkshop: primaryBadgeKind === "skills_workshop",
    hasSpWorkflow: isStructuredSpEvent,
  };
}

export function isStandaloneTrainingEvent(input: EventClassificationInput) {
  const presentation = classifyEventPresentation(input);
  const activeTypes = new Set(presentation.activeEventTypes);

  return (
    presentation.isTraining &&
    !presentation.hasSpWorkflow &&
    !activeTypes.has("sp") &&
    !activeTypes.has("skills") &&
    !activeTypes.has("hifi") &&
    !activeTypes.has("virtual")
  );
}

export function getEventBadgeAppearance(kind: EventBadgeKind) {
  const appearances: Record<EventBadgeKind, { background: string; border: string; color: string }> = {
    training: {
      background: "#fff7ed",
      border: "#fdba74",
      color: "#9a3412",
    },
    virtual_sp: {
      background: "#eff6ff",
      border: "#93c5fd",
      color: "#1d4ed8",
    },
    hifi: {
      background: "#f5f3ff",
      border: "#c4b5fd",
      color: "#6d28d9",
    },
    skills_workshop: {
      background: "#ecfeff",
      border: "#99f6e4",
      color: "#0f766e",
    },
    sp_event: {
      background: "#e0f2fe",
      border: "#7dd3fc",
      color: "#075985",
    },
  };

  return appearances[kind];
}
