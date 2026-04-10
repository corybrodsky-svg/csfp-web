import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createSupabaseServerClient } from "../../../lib/supabaseServerClient";
import { asText, formatUsDate } from "../../../lib/eventDateUtils";

export const dynamic = "force-dynamic";

type GridRow = unknown[];

type ImportCandidate = {
  name: string;
  dateText: string;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  notes: string | null;
};

type ParseResult = {
  totalRowsParsed: number;
  eventRowsSeen: number;
  candidates: ImportCandidate[];
  skippedNoDate: number;
  skippedIgnored: number;
  skippedBlank: number;
};

const TARGET_SHEET_NAME = "Spring 2026";
const IGNORED_TERMS = [
  "vacation",
  "spring break",
  "winter break",
  "holiday",
  "no class",
  "no classes",
];

function normalize(value: unknown) {
  return asText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeKey(value: unknown) {
  return asText(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizeDateTextForKey(value: string | null) {
  return formatUsDate(value) || "";
}

function excelSerialToIsoDate(value: number) {
  const parsed = XLSX.SSF.parse_date_code(value);
  if (!parsed || parsed.y !== 2026) return null;
  return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
}

function normalizeSheetDate(month: number, day: number, yearText?: string) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  let year = 2026;
  if (yearText) {
    if (yearText.length === 2) {
      year = 2000 + Number(yearText);
    } else if (yearText.length === 4) {
      year = Number(yearText);
    } else {
      return null;
    }
  }

  if (year !== 2026) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateCell(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    if (value.getFullYear() !== 2026) return null;
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
      value.getDate()
    ).padStart(2, "0")}`;
  }

  if (typeof value === "number") {
    return excelSerialToIsoDate(value);
  }

  const raw = asText(value);
  if (!raw) return null;

  const lower = raw.toLowerCase();
  if (lower.includes("week")) return null;
  if (IGNORED_TERMS.some((term) => lower.includes(term))) return null;

  const weekdayMatch = raw.match(
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b[^\d]*(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/i
  );
  if (weekdayMatch) {
    return normalizeSheetDate(
      Number(weekdayMatch[2]),
      Number(weekdayMatch[3]),
      weekdayMatch[4]
    );
  }

  const shortWeekdayMatch = raw.match(
    /\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b[^\d]*(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/i
  );
  if (shortWeekdayMatch) {
    return normalizeSheetDate(
      Number(shortWeekdayMatch[2]),
      Number(shortWeekdayMatch[3]),
      shortWeekdayMatch[4]
    );
  }

  const exactDateMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (exactDateMatch) {
    return normalizeSheetDate(
      Number(exactDateMatch[1]),
      Number(exactDateMatch[2]),
      exactDateMatch[3]
    );
  }

  const monthNameMatch = raw.match(
    /\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b[\s,.-]+(\d{1,2})(?:\D+(\d{2,4}))?/i
  );
  if (monthNameMatch) {
    const monthLookup: Record<string, number> = {
      jan: 1,
      january: 1,
      feb: 2,
      february: 2,
      mar: 3,
      march: 3,
      apr: 4,
      april: 4,
      may: 5,
      jun: 6,
      june: 6,
      jul: 7,
      july: 7,
      aug: 8,
      august: 8,
      sep: 9,
      sept: 9,
      september: 9,
      oct: 10,
      october: 10,
      nov: 11,
      november: 11,
      dec: 12,
      december: 12,
    };

    return normalizeSheetDate(
      monthLookup[monthNameMatch[1].toLowerCase()],
      Number(monthNameMatch[2]),
      monthNameMatch[3]
    );
  }

  const monthDayMatch = raw.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (monthDayMatch) {
    return normalizeSheetDate(Number(monthDayMatch[1]), Number(monthDayMatch[2]));
  }

  return null;
}

function parseTimeValue(value: string) {
  const raw = value.trim();
  if (!raw) return null;

  const match = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || "0");
  const suffix = (match[3] || "").toLowerCase();

  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function parseTimeRange(value: unknown) {
  const raw = asText(value);
  if (!raw) return { startTime: null, endTime: null };

  const normalized = raw.replace(/[–—]/g, "-");
  const parts = normalized.split("-").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) {
    return { startTime: parseTimeValue(normalized), endTime: null };
  }

  const endSuffix = parts[1].match(/\b(am|pm)\b/i)?.[1] || "";
  const startText = /\b(am|pm)\b/i.test(parts[0]) || !endSuffix ? parts[0] : `${parts[0]} ${endSuffix}`;

  return {
    startTime: parseTimeValue(startText),
    endTime: parseTimeValue(parts[1]),
  };
}

function findColumn(row: GridRow, labels: string[]) {
  const normalizedLabels = labels.map(normalize);
  return row.findIndex((cell) => normalizedLabels.includes(normalize(cell)));
}

function findHeader(rows: GridRow[]) {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const sessionName = findColumn(row, ["Session Name", "Session"]);
    const sessionTime = findColumn(row, ["Session Time", "Time"]);

    if (sessionName >= 0 && sessionTime >= 0) {
      return {
        headerIndex: index,
        columns: {
          sessionName,
          leadTeam: findColumn(row, ["Event Lead/Team", "Event Lead", "Lead Team"]),
          rooms: findColumn(row, ["Rooms Assigned", "Rooms", "Room"]),
          sessionTime,
          eventType: findColumn(row, ["Summative or Formative", "Summative/Formative", "Type"]),
          studentCount: findColumn(row, ["Number of students", "# Students", "Students"]),
          faculty: findColumn(row, ["Course Faculty", "Faculty"]),
        },
      };
    }
  }

  return null;
}

function getCell(row: GridRow, index: number) {
  return index >= 0 ? row[index] : "";
}

function isIgnoredName(name: string) {
  const lower = name.toLowerCase();
  if (!lower) return true;
  return IGNORED_TERMS.some((term) => lower.includes(term));
}

function isWeekHeaderRow(rowText: string) {
  return /^week\s/i.test(rowText);
}

function detectDayRowDate(row: GridRow) {
  const firstCell = asText(row[0]);
  if (!firstCell) return null;
  if (isWeekHeaderRow(firstCell)) return null;

  const match = firstCell.match(
    /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2}\/\d{1,2}\/\d{2})(?:\b.*)?$/i
  );
  if (!match) return null;

  const datePortion = match[2];
  const iso = parseDateCell(datePortion);
  if (iso) {
    console.log(`[events/import] detected date row -> ${iso} from "${firstCell}"`);
  }
  return iso;
}

function buildNotes(args: {
  leadTeam: string;
  eventType: string;
  studentCount: string;
  faculty: string;
}) {
  return [
    `Imported from ${TARGET_SHEET_NAME}`,
    args.leadTeam ? `Event Lead/Team: ${args.leadTeam}` : "",
    args.eventType ? `Summative or Formative: ${args.eventType}` : "",
    args.studentCount ? `Number of students: ${args.studentCount}` : "",
    args.faculty ? `Course Faculty: ${args.faculty}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseSheet(rows: GridRow[]): ParseResult {
  const header = findHeader(rows);
  if (!header) {
    return {
      totalRowsParsed: rows.length,
      eventRowsSeen: 0,
      candidates: [],
      skippedNoDate: 0,
      skippedIgnored: 0,
      skippedBlank: 0,
    };
  }

  const candidates: ImportCandidate[] = [];
  let currentDate: string | null = null;
  let skippedBlank = 0;
  let skippedIgnored = 0;
  let skippedNoDate = 0;
  let eventRowsSeen = 0;

  for (let rowIndex = header.headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const rowText = row.map(asText).filter(Boolean).join(" ").trim();

    if (!rowText) {
      skippedBlank += 1;
      console.log("[events/import] skipping blank row");
      continue;
    }

    if (isWeekHeaderRow(rowText)) {
      console.log(`[events/import] skipping week header row -> ${rowText}`);
      continue;
    }

    const dayDate = detectDayRowDate(row);
    if (dayDate) {
      currentDate = dayDate;
      continue;
    }

    const name = asText(getCell(row, header.columns.sessionName));
    if (!name) continue;

    eventRowsSeen += 1;

    if (isIgnoredName(name)) {
      skippedIgnored += 1;
      console.log(`[events/import] skipping ignored row -> ${name}`);
      continue;
    }

    if (!currentDate) {
      skippedNoDate += 1;
      console.log(`[events/import] skipping no-date row -> ${name}`);
      continue;
    }

    const { startTime, endTime } = parseTimeRange(getCell(row, header.columns.sessionTime));
    const location = asText(getCell(row, header.columns.rooms)) || null;

    candidates.push({
      name,
      dateText: formatUsDate(currentDate) || currentDate,
      sessionDate: currentDate,
      startTime,
      endTime,
      location,
      notes: buildNotes({
        leadTeam: asText(getCell(row, header.columns.leadTeam)),
        eventType: asText(getCell(row, header.columns.eventType)),
        studentCount: asText(getCell(row, header.columns.studentCount)),
        faculty: asText(getCell(row, header.columns.faculty)),
      }),
    });
  }

  return {
    totalRowsParsed: rows.length,
    eventRowsSeen,
    candidates,
    skippedNoDate,
    skippedIgnored,
    skippedBlank,
  };
}

function importKey(name: string, dateText: string | null) {
  return `${normalizeKey(name)}|${normalizeDateTextForKey(dateText)}`;
}

export async function POST(request: Request) {
  try {
    const supabaseServer = createSupabaseServerClient();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload an Excel workbook." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const targetSheet = workbook.Sheets[TARGET_SHEET_NAME];

    if (!targetSheet) {
      return NextResponse.json(
        { error: `${TARGET_SHEET_NAME} sheet not found` },
        { status: 400 }
      );
    }

    const rows = XLSX.utils.sheet_to_json<GridRow>(targetSheet, {
      header: 1,
      blankrows: false,
      raw: true,
    });
    const parsed = parseSheet(rows);

    const { data: existingEvents, error: existingError } = await supabaseServer
      .from("events")
      .select("id,name,date_text");

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const existingKeys = new Set(
      (existingEvents || []).map((event) => importKey(event.name || "", event.date_text || null))
    );

    let createdEvents = 0;
    let createdSessions = 0;
    let duplicateSkips = 0;

    for (const candidate of parsed.candidates) {
      const key = importKey(candidate.name, candidate.dateText);
      if (existingKeys.has(key)) {
        duplicateSkips += 1;
        continue;
      }

      const { data: event, error: eventError } = await supabaseServer
        .from("events")
        .insert({
          name: candidate.name,
          status: "Scheduled",
          date_text: candidate.dateText,
          sp_needed: 0,
          visibility: "team",
          location: candidate.location,
          notes: candidate.notes,
        })
        .select("id")
        .single();

      if (eventError) {
        return NextResponse.json({ error: eventError.message }, { status: 500 });
      }

      const { error: sessionError } = await supabaseServer.from("event_sessions").insert({
        event_id: event.id,
        session_date: candidate.sessionDate,
        start_time: candidate.startTime,
        end_time: candidate.endTime,
        location: candidate.location,
        room: candidate.location,
      });

      if (sessionError) {
        return NextResponse.json({ error: sessionError.message }, { status: 500 });
      }

      existingKeys.add(key);
      createdEvents += 1;
      createdSessions += 1;
    }

    return NextResponse.json({
      imported: {
        sheet: TARGET_SHEET_NAME,
        total_rows_parsed: parsed.totalRowsParsed,
        event_rows_seen: parsed.eventRowsSeen,
        events_created: createdEvents,
        rows_skipped_no_date: parsed.skippedNoDate,
        duplicates_skipped: duplicateSkips,
        rows_skipped_ignored: parsed.skippedIgnored,
        rows_skipped_blank: parsed.skippedBlank,
        sessions_created: createdSessions,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not import workbook." },
      { status: 500 }
    );
  }
}
