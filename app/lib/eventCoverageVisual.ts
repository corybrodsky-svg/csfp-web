export type EventCoverageVisualState =
  | "empty"
  | "partial"
  | "covered"
  | "shortage"
  | "archived";

export type EventCoverageBaseTone = "default" | "skills";

type CoverageVisualInput = {
  needed?: number | null;
  assigned?: number | null;
  confirmed?: number | null;
  archived?: boolean;
  baseTone?: EventCoverageBaseTone;
};

export function getEventCoverageVisualState(input: CoverageVisualInput): EventCoverageVisualState {
  if (input.archived) return "archived";

  const needed = Math.max(0, Number(input.needed || 0));
  const assigned = Math.max(0, Number(input.assigned || 0));
  const confirmed = Math.max(0, Number(input.confirmed || 0));

  if (needed > 0 && confirmed >= needed) return "covered";
  if (assigned <= 0) return "empty";
  if (needed > 0 && confirmed <= 0) return "shortage";
  if (needed > 0 && confirmed < needed) return "partial";
  return "partial";
}

export function getEventCoverageVisualTone(state: EventCoverageVisualState) {
  return getEventCoverageVisualToneWithBase(state, "default");
}

export function getEventCoverageVisualToneWithBase(
  state: EventCoverageVisualState,
  baseTone: EventCoverageBaseTone = "default"
) {
  const defaultTone = (() => {
  switch (state) {
    case "archived":
      return {
        cardBackground: "rgba(168, 183, 204, 0.08)",
        cardBorder: "var(--cfsp-border)",
        cardShadow: "var(--cfsp-card-glow)",
        pillBackground: "rgba(168, 183, 204, 0.12)",
        pillBorder: "var(--cfsp-border)",
        pillText: "var(--cfsp-text-muted)",
        titleText: "var(--cfsp-text)",
        accentText: "var(--cfsp-text-muted)",
        label: "Archived",
      };
    case "covered":
      return {
        cardBackground: "var(--cfsp-green-soft)",
        cardBorder: "rgba(44, 211, 173, 0.28)",
        cardShadow: "0 0 0 1px rgba(44, 211, 173, 0.08), 0 10px 28px rgba(0, 0, 0, 0.22)",
        pillBackground: "rgba(44, 211, 173, 0.16)",
        pillBorder: "rgba(44, 211, 173, 0.3)",
        pillText: "var(--cfsp-green)",
        titleText: "var(--cfsp-text)",
        accentText: "var(--cfsp-green)",
        label: "Covered",
      };
    case "partial":
      return {
        cardBackground: "rgba(44, 211, 173, 0.08)",
        cardBorder: "rgba(44, 211, 173, 0.2)",
        cardShadow: "0 0 0 1px rgba(44, 211, 173, 0.06), 0 10px 26px rgba(0, 0, 0, 0.2)",
        pillBackground: "rgba(44, 211, 173, 0.14)",
        pillBorder: "rgba(44, 211, 173, 0.24)",
        pillText: "var(--cfsp-green)",
        titleText: "var(--cfsp-text)",
        accentText: "var(--cfsp-green)",
        label: "Staffed",
      };
    case "shortage":
      return {
        cardBackground: "var(--cfsp-warning-soft)",
        cardBorder: "rgba(243, 187, 103, 0.28)",
        cardShadow: "0 0 0 1px rgba(243, 187, 103, 0.08), 0 10px 26px rgba(0, 0, 0, 0.2)",
        pillBackground: "rgba(243, 187, 103, 0.14)",
        pillBorder: "rgba(243, 187, 103, 0.26)",
        pillText: "var(--cfsp-warning)",
        titleText: "var(--cfsp-text)",
        accentText: "var(--cfsp-warning)",
        label: "Shortage",
      };
    case "empty":
    default:
      return {
        cardBackground: "var(--cfsp-surface)",
        cardBorder: "var(--cfsp-border)",
        cardShadow: "var(--cfsp-card-glow)",
        pillBackground: "rgba(168, 183, 204, 0.1)",
        pillBorder: "var(--cfsp-border)",
        pillText: "var(--cfsp-text-muted)",
        titleText: "var(--cfsp-text)",
        accentText: "var(--cfsp-text-muted)",
        label: "Unstaffed",
      };
  }
  })();

  if (baseTone === "skills" && state !== "archived") {
    return {
      ...defaultTone,
      cardBackground: "var(--cfsp-skills-soft)",
      cardBorder: "var(--cfsp-skills-border)",
      titleText: "var(--cfsp-skills-text)",
    };
  }

  return defaultTone;
}
