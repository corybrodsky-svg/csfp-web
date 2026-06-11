const SP_PORTAL_ACK_START = "[CFSP_SP_PORTAL_ACKNOWLEDGMENTS]";
const SP_PORTAL_ACK_END = "[/CFSP_SP_PORTAL_ACKNOWLEDGMENTS]";
const SP_PORTAL_ACK_PATTERN = /\[CFSP_SP_PORTAL_ACKNOWLEDGMENTS\][\s\S]*?\[\/CFSP_SP_PORTAL_ACKNOWLEDGMENTS\]/g;

export const SP_PORTAL_ACKNOWLEDGMENT_KEYS = [
  "event_details",
  "schedule",
  "role_case",
  "training",
  "materials",
  "arrival",
] as const;

export type SpPortalAcknowledgmentKey = (typeof SP_PORTAL_ACKNOWLEDGMENT_KEYS)[number];

export type SpPortalAcknowledgmentState = Partial<Record<SpPortalAcknowledgmentKey, string>>;

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeAcknowledgmentKey(value: unknown): SpPortalAcknowledgmentKey | "" {
  const normalized = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  return (SP_PORTAL_ACKNOWLEDGMENT_KEYS as readonly string[]).includes(normalized)
    ? normalized as SpPortalAcknowledgmentKey
    : "";
}

function getAcknowledgmentBlock(notes?: string | null) {
  const text = asText(notes);
  if (!text) return "";
  const match = text.match(/\[CFSP_SP_PORTAL_ACKNOWLEDGMENTS\]\n?([\s\S]*?)\n?\[\/CFSP_SP_PORTAL_ACKNOWLEDGMENTS\]/);
  return asText(match?.[1]);
}

export function stripSpPortalAcknowledgmentsBlock(notes?: string | null) {
  return asText(notes).replace(SP_PORTAL_ACK_PATTERN, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function parseSpPortalAcknowledgments(notes?: string | null): SpPortalAcknowledgmentState {
  const block = getAcknowledgmentBlock(notes);
  if (!block) return {};

  try {
    const parsed = JSON.parse(block) as { reviewed?: Record<string, unknown> } | Record<string, unknown>;
    const source = parsed && typeof parsed === "object" && "reviewed" in parsed
      ? (parsed as { reviewed?: Record<string, unknown> }).reviewed
      : parsed;
    const next: SpPortalAcknowledgmentState = {};
    if (!source || typeof source !== "object" || Array.isArray(source)) return next;
    Object.entries(source).forEach(([rawKey, rawValue]) => {
      const key = normalizeAcknowledgmentKey(rawKey);
      if (!key) return;
      const timestamp = asText(rawValue);
      if (timestamp) next[key] = timestamp;
    });
    return next;
  } catch {
    return {};
  }
}

export function normalizeSpPortalAcknowledgmentKey(value: unknown) {
  return normalizeAcknowledgmentKey(value);
}

export function upsertSpPortalAcknowledgment(
  notes: string | null | undefined,
  key: SpPortalAcknowledgmentKey,
  checked: boolean,
  timestamp = new Date().toISOString()
) {
  const current = parseSpPortalAcknowledgments(notes);
  const next: SpPortalAcknowledgmentState = { ...current };
  if (checked) next[key] = timestamp;
  else delete next[key];

  const visibleNotes = stripSpPortalAcknowledgmentsBlock(notes);
  const entries = Object.entries(next).filter(([, value]) => asText(value));
  if (!entries.length) return visibleNotes || null;

  const ordered = Object.fromEntries(
    SP_PORTAL_ACKNOWLEDGMENT_KEYS
      .filter((ackKey) => asText(next[ackKey]))
      .map((ackKey) => [ackKey, next[ackKey]])
  );
  const block = [
    SP_PORTAL_ACK_START,
    JSON.stringify({ reviewed: ordered, updated_at: timestamp }, null, 2),
    SP_PORTAL_ACK_END,
  ].join("\n");
  return [visibleNotes, block].filter(Boolean).join("\n\n");
}

export function mergeHumanNotesWithSpPortalAcknowledgments(
  existingNotes: string | null | undefined,
  nextHumanNotes: string | null | undefined
) {
  const acknowledgments = parseSpPortalAcknowledgments(existingNotes);
  const entries = Object.entries(acknowledgments).filter(([, value]) => asText(value));
  let nextNotes = stripSpPortalAcknowledgmentsBlock(nextHumanNotes);
  entries.forEach(([rawKey, timestamp]) => {
    const key = normalizeAcknowledgmentKey(rawKey);
    if (!key) return;
    nextNotes = upsertSpPortalAcknowledgment(nextNotes, key, true, asText(timestamp)) || "";
  });
  return nextNotes || null;
}
