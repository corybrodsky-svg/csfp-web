export type GeneratedRoomSlot = {
  roomName: string;
  roomType: "exam" | "flex";
  capacity: number;
};

export type EventOwnershipResult = {
  examSlots: GeneratedRoomSlot[];
  flexSlots: GeneratedRoomSlot[];
  allSlots: GeneratedRoomSlot[];
};

type GenerateRoomSlotsArgs = {
  examRoomCount: number;
  flexRoomCount?: number;
  flexCapacity?: number;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function ownershipTextMatchesScheduleName(
  ownershipText: unknown,
  scheduleName: unknown
) {
  const ownership = normalizeText(ownershipText);
  const schedule = normalizeText(scheduleName);

  if (!ownership || !schedule) return false;

  return ownership.includes(schedule) || schedule.includes(ownership);
}

export function eventMatchesOwnership(event: {
  name?: string | null;
  notes?: string | null;
  location?: string | null;
  date_text?: string | null;
}, ownershipText?: string | null) {
  const target = normalizeText(ownershipText);

  if (!target) return true;

  const combinedEventText = normalizeText(
    [
      event.name,
      event.notes,
      event.location,
      event.date_text,
    ].filter(Boolean).join(" ")
  );

  if (!combinedEventText) return false;

  return (
    combinedEventText.includes(target) ||
    target.includes(combinedEventText) ||
    ownershipTextMatchesScheduleName(combinedEventText, target)
  );
}

export function generateRoomSlots(
  args: GenerateRoomSlotsArgs
): EventOwnershipResult {
  const examSlots: GeneratedRoomSlot[] = Array.from(
    { length: args.examRoomCount },
    (_, index) => ({
      roomName: `Exam ${index + 1}`,
      roomType: "exam",
      capacity: 2,
    })
  );

  const flexSlots: GeneratedRoomSlot[] = Array.from(
    { length: args.flexRoomCount ?? 0 },
    (_, index) => ({
      roomName: `Flex ${index + 1}`,
      roomType: "flex",
      capacity: args.flexCapacity ?? 3,
    })
  );

  return {
    examSlots,
    flexSlots,
    allSlots: [...examSlots, ...flexSlots],
  };
}

export function calculateRoomCapacity(
  examRoomCount: number,
  flexRoomCount = 0,
  flexCapacity = 3
) {
  return examRoomCount * 2 + flexRoomCount * flexCapacity;
}