import {
  getExplicitEventTypes,
  type EditableEventType,
  upsertEventTypesInNotes,
} from "./eventTypeNotes";
import {
  emptyTrainingEventMetadata,
  getTrainingMetadataBlock,
  parseTrainingEventMetadata,
  type TrainingEventMetadata,
  upsertTrainingEventMetadata,
} from "./trainingEventNotes";
import { normalizeEventType, type CanonicalEventType } from "./canonicalEventType";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export type ParsedEventMetadata = {
  training: TrainingEventMetadata;
  eventTypes: EditableEventType[];
  canonicalEventType: CanonicalEventType;
  rawTrainingBlock: string;
  rawEventTypeLines: string[];
  rawNotes: string;
  summary: Record<string, string>;
};

export function parseEventMetadata(notes?: string | null): ParsedEventMetadata {
  const rawNotes = asText(notes);
  const training = parseTrainingEventMetadata(rawNotes);
  const eventTypes = getExplicitEventTypes(rawNotes);
  const canonicalEventType =
    training.canonical_event_type
      ? normalizeEventType(training.canonical_event_type)
      : eventTypes.includes("didactic") || eventTypes.includes("training")
        ? "didactic"
        : "simulation";
  const rawTrainingBlock = getTrainingMetadataBlock(rawNotes);
  const rawEventTypeLines = rawNotes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(Event Types?|Event Category)\s*:/i.test(line));

  const summary = Object.fromEntries(
    Object.entries(training).filter(([, value]) => asText(value))
  ) as Record<string, string>;

  if (eventTypes.length) {
    summary.event_types = eventTypes.join(", ");
  }
  summary.canonical_event_type = canonicalEventType;

  return {
    training,
    eventTypes,
    canonicalEventType,
    rawTrainingBlock,
    rawEventTypeLines,
    rawNotes,
    summary,
  };
}

export function upsertEventMetadata(
  notes: string | null | undefined,
  updates: {
    training?: Partial<TrainingEventMetadata>;
    eventTypes?: EditableEventType[];
  }
) {
  let nextNotes = asText(notes);

  if (updates.training && Object.keys(updates.training).length) {
    nextNotes = upsertTrainingEventMetadata(nextNotes, updates.training);
  }

  if (updates.eventTypes) {
    nextNotes = upsertEventTypesInNotes(nextNotes, updates.eventTypes);
  }

  return nextNotes;
}

export function emptyParsedEventMetadata(): ParsedEventMetadata {
  return {
    training: emptyTrainingEventMetadata(),
    eventTypes: [],
    canonicalEventType: "simulation",
    rawTrainingBlock: "",
    rawEventTypeLines: [],
    rawNotes: "",
    summary: {},
  };
}
