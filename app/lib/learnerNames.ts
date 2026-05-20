function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function decodeMojibakeCandidate(text: string) {
  const hasMojibakeSignal = /[\u00c0-\u00c7\u00c8-\u00cb\u00cc-\u00cf\u00d0-\u00d6\u00d8-\u00de\u00f0-\u00f7\u00f8-\u00fe]|\uFFFD|Ã|Â/g.test(text);
  if (!hasMojibakeSignal) return text;

  const fallback = [
    () => {
      try {
        const latin1Bytes = new Uint8Array(Array.from(text, (char) => char.charCodeAt(0) & 0xff));
        return new TextDecoder("utf-8", { fatal: false }).decode(latin1Bytes);
      } catch {
        return text;
      }
    },
    () => {
      try {
        return decodeURIComponent(escape(text));
      } catch {
        return text;
      }
    },
  ];

  let best = text;
  const artifactScore = (value: string) => {
    return (value.match(/[\u0000-\u001f\u007f-\u009f\u00ad\uFFFD\u00c0-\u00ff]/g) || []).length;
  };

  for (const nextCandidate of fallback) {
    const candidate = nextCandidate();
    if (!candidate) continue;
    if (artifactScore(candidate) < artifactScore(best)) {
      best = candidate;
    }
  }

  return best;
}

export function normalizeDisplayText(value: unknown) {
  let text = asText(value)
    .normalize("NFC")
    .replace(/_x000d_/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, "")
    .trim();

  text = decodeMojibakeCandidate(text);
  text = text
    // Preserve intended UTF-8/UTF-16 accents but remove corrupted marker fragments.
    .replace(/[\u00ca\u00ff\u00d1](?=[A-Z]{2,}\b)/g, "N")
    .replace(/\uFFFD/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

export function normalizeLearnerName(value: unknown) {
  return normalizeDisplayText(value)
    .replace(/\s+/g, " ")
    .replace(/[\u00ca\ufffd]+$/g, "")
    .trim();
}

function isLearnerCountPlaceholder(value: string) {
  const text = normalizeDisplayText(value).toLowerCase();
  return /^(\d{1,3})$/.test(text) || /^(\d{1,3})\s+(?:learner|learners|student|students|participant|participants)$/.test(text);
}

export function normalizeLearnerNames(values: unknown) {
  if (!Array.isArray(values)) return [] as string[];
  return values.map(normalizeLearnerName).filter((name) => Boolean(name) && !isLearnerCountPlaceholder(name));
}
