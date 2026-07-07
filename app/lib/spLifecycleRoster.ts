export type SpLifecycleResponseBucket = "available" | "maybe" | "declined" | "withdrawn" | "not_available" | "no_response";

export type SpLifecycleIdentityInput = {
  spId?: unknown;
  email?: unknown;
  name?: unknown;
  fallbackKey?: unknown;
};

export type SpLifecycleRosterEligibilityInput = {
  hasAssignment?: boolean;
  selectedForHireConfirmation?: boolean;
  hasImportedResponse?: boolean;
  responseBucket?: unknown;
  pollResponseStatus?: unknown;
};

export type SpLifecycleLatestRowInput<T> = {
  row: T;
  timestamp?: unknown;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeEmail(value: unknown) {
  return asText(value).toLowerCase();
}

function normalizeName(value: unknown) {
  return asText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeResponseBucket(value: unknown) {
  const normalized = asText(value).toLowerCase();
  if (normalized === "accepted") return "available";
  if (normalized === "unavailable") return "not_available";
  return normalized;
}

function getTimestampRank(value: unknown) {
  const parsed = Date.parse(asText(value));
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function getSpLifecyclePersonKey(input: SpLifecycleIdentityInput) {
  const spId = asText(input.spId);
  if (spId) return `sp:${spId}`;

  const email = normalizeEmail(input.email);
  if (email) return `email:${email}`;

  const name = normalizeName(input.name);
  if (name) return `name:${name}`;

  const fallbackKey = asText(input.fallbackKey);
  return fallbackKey ? `row:${fallbackKey}` : "";
}

export function shouldShowInMainSpLifecycleRoster(input: SpLifecycleRosterEligibilityInput) {
  if (input.hasAssignment || input.selectedForHireConfirmation || input.hasImportedResponse) return true;
  const bucket = normalizeResponseBucket(input.responseBucket || input.pollResponseStatus);
  return bucket === "available" || bucket === "maybe" || bucket === "declined" || bucket === "withdrawn" || bucket === "not_available";
}

export function chooseLatestSpLifecycleRow<T>(
  current: SpLifecycleLatestRowInput<T> | null | undefined,
  next: SpLifecycleLatestRowInput<T>
) {
  if (!current) return next;
  return getTimestampRank(next.timestamp) >= getTimestampRank(current.timestamp) ? next : current;
}
