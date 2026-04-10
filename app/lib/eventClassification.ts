export type EventDisplayType = "skills" | "sp" | "hifi";

export type EventBadgeKind =
  | "training"
  | "virtual_sp"
  | "hifi"
  | "skills_workshop"
  | "sp_event";

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
  return [
    input.name,
    input.status,
    input.notes,
    input.location,
    input.visibility,
  ]
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
  const derivedWorkshop =
    input.isWorkshop ??
    isSkillsWorkshopEvent(input.spNeeded, input.assignmentCount, input.confirmedCount);
  const isTraining = eventText.includes("training");
  const isVirtualSp = /\bvir\b/.test(eventText) || eventText.includes("virtual");
  const isHiFi =
    !isTraining &&
    !isVirtualSp &&
    (eventText.includes("hi-fi") ||
      eventText.includes("hifi") ||
      eventText.includes("high fidelity"));

  let primaryBadgeKind: EventBadgeKind = "sp_event";

  if (isTraining) {
    primaryBadgeKind = "training";
  } else if (isVirtualSp) {
    primaryBadgeKind = "virtual_sp";
  } else if (isHiFi) {
    primaryBadgeKind = "hifi";
  } else if (derivedWorkshop) {
    primaryBadgeKind = "skills_workshop";
  }

  const labels: Record<EventBadgeKind, string> = {
    training: "Training",
    virtual_sp: "Virtual SP",
    hifi: "HiFi",
    skills_workshop: "Skills Workshop",
    sp_event: "SP Event",
  };

  const eventType: EventDisplayType =
    primaryBadgeKind === "hifi"
      ? "hifi"
      : primaryBadgeKind === "skills_workshop"
        ? "skills"
        : "sp";

  return {
    eventType,
    primaryBadgeKind,
    primaryBadgeLabel: labels[primaryBadgeKind],
    isTraining,
    isVirtualSp,
    isHiFi,
    isSkillsWorkshop: primaryBadgeKind === "skills_workshop",
  };
}

export function getEventBadgeAppearance(kind: EventBadgeKind) {
  const appearances: Record<
    EventBadgeKind,
    { background: string; border: string; color: string }
  > = {
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
