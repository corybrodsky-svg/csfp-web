export type RoomTypeHint = "exam" | "flex" | "breakout" | "virtual" | "overflow";

export type RoomNamingContext = {
  modalityLabel?: string | null;
  telehealthOrZoomEnabled?: boolean;
  explicitRoomMode?: "exam_room" | "breakout_room" | "virtual_room" | "auto";
};

type RoomLabelPrefix = "Breakout Room" | "Virtual Room" | "Exam Room" | "Overflow Room" | "Flex" | "Room";

function normalizeModalityLabel(value?: string | null) {
  return (value || "").toLowerCase().trim();
}

function shouldUseBreakoutLabel(context: RoomNamingContext) {
  const explicitMode = context.explicitRoomMode;
  if (explicitMode === "breakout_room") return true;
  if (explicitMode === "virtual_room") return false;
  if (explicitMode === "exam_room") return false;

  const modality = normalizeModalityLabel(context.modalityLabel);
  if (modality === "virtual") return true;
  if (modality === "hybrid" && Boolean(context.telehealthOrZoomEnabled)) return true;
  return Boolean(context.telehealthOrZoomEnabled);
}

function inferPrefixFromLabel(label: string): RoomLabelPrefix {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return "Exam Room";

  if (/^breakout\b/.test(normalized)) return "Breakout Room";
  if (/^virtual room\b|^virtual\b/.test(normalized)) return "Virtual Room";
  if (/^overflow\b/.test(normalized)) return "Overflow Room";
  if (/^flex\b/.test(normalized)) return "Flex";
  if (/^room\b/.test(normalized)) return "Room" as RoomLabelPrefix;
  if (/^exam\b|^exam room\b/.test(normalized)) return "Exam Room";
  return "Exam Room";
}

function mapRoomTypeHintToPrefix(
  hint: RoomTypeHint | undefined,
  context: RoomNamingContext
): RoomLabelPrefix {
  if (hint === "virtual") return "Virtual Room";
  if (hint === "breakout") return "Breakout Room";
  if (hint === "overflow") return "Overflow Room";
  if (hint === "flex") {
    return shouldUseBreakoutLabel(context) ? "Overflow Room" : "Flex";
  }
  if (hint === "exam") return shouldUseBreakoutLabel(context) ? "Breakout Room" : "Exam Room";
  return "Exam Room";
}

export function getRoomTypeLabel(context: RoomNamingContext = {}) {
  if (context.explicitRoomMode === "virtual_room") return "Virtual Room";
  if (context.explicitRoomMode === "breakout_room") return "Breakout Room";
  if (context.explicitRoomMode === "exam_room") return "Exam Room";

  return shouldUseBreakoutLabel(context) ? "Breakout Room" : "Exam Room";
}

function normalizePrefix(prefix: RoomLabelPrefix, context: RoomNamingContext) {
  if (prefix === "Room") {
    return getRoomTypeLabel(context);
  }
  if (prefix === "Flex") {
    return shouldUseBreakoutLabel(context) ? "Overflow Room" : "Flex";
  }
  return prefix;
}

export function getRoomDisplayLabel(
  roomName: string | null | undefined,
  roomNumber: number,
  context: RoomNamingContext = {},
  roomTypeHint?: RoomTypeHint
) {
  const normalizedName = (roomName || "").trim();
  const safeRoomNumber = Math.max(1, Number.isFinite(roomNumber) ? roomNumber : 1);

  if (!normalizedName) {
    return `${getRoomTypeLabel(context)} ${safeRoomNumber}`;
  }

  const isPlaceholder = /\b(tbd|to be determined|to-be-determined)\b/i.test(normalizedName);
  const numberMatch = normalizedName.match(/(\d+)/);

  const explicitPrefix = roomTypeHint
    ? mapRoomTypeHintToPrefix(roomTypeHint, context)
    : normalizePrefix(inferPrefixFromLabel(normalizedName), context);

  if (isPlaceholder) {
    return normalizedName;
  }

  if (numberMatch?.[0]) {
    const displayNumber = numberMatch[0];
    return `${explicitPrefix} ${displayNumber}`;
  }

  return `${explicitPrefix} ${safeRoomNumber}`;
}

export function getRoomDisplayLabelFromIndex(
  roomName: string | null | undefined,
  index: number,
  context: RoomNamingContext = {},
  roomTypeHint?: RoomTypeHint
) {
  return getRoomDisplayLabel(roomName, index + 1, context, roomTypeHint);
}
