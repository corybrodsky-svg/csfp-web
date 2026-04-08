import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseServer } from "../../../lib/supabaseServerClient";

export const dynamic = "force-dynamic";

type GridRow = unknown[];

type ColumnMap = {
  sessionName: number;
  leadTeam: number;
  rooms: number;
  sessionTime: number;
  eventType: number;
  studentCount: number;
  faculty: number;
};

type ImportCandidate = {
  sheetName: string;
  name: string;
  dateText: string | null;
  sessionDate: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  notes: string | null;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalize(value: unknown) {
  return asText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeKey(value: unknown) {
  return asText(value).toLowerCase().replace(/\s+/g, " ");
}

function parseSheetYear(sheetName: string) {
  const match = sheetName.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : new Date().getFullYear();
}

function isSeasonalSheet(sheetName: string) {
  return /\b(spring|summer|fall|winter)\b/i.test(sheetName) && /\b20\d{2}\b/.test(sheetName);
}

function excelSerialToIsoDate(value: number) {
  const parsed = XLSX.SSF.parse_date_code(value);
  if (!parsed) return null;
  return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
}

function toIsoDate(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateCell(value: unknown, fallbackYear: number) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") return excelSerialToIsoDate(value);

  const raw = asText(value);
  if (!raw) return null;

  const lower = raw.toLowerCase();
  if (lower.includes("week") || lower.includes("vacation") || lower.includes("break")) return null;

  const slashMatch = raw.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (slashMatch) {
    const yearText = slashMatch[3];
    const year = yearText
      ? Number(yearText.length === 2 ? `20${yearText}` : yearText)
      : fallbackYear;
    return toIsoDate(year, Number(slashMatch[1]), Number(slashMatch[2]));
  }

  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);

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
  return ["vacation", "spring break", "winter break", "holiday", "no class", "no classes"].some((term) =>
    lower.includes(term)
  );
}

function getDateFromRow(row: GridRow, year: number, columns: ColumnMap) {
  return row
    .filter((_, index) => index !== columns.sessionTime)
    .map((cell) => parseDateCell(cell, year))
    .find(Boolean) || null;
}

function buildNotes(args: {
  sheetName: string;
  leadTeam: string;
  eventType: string;
  studentCount: string;
  faculty: string;
}) {
  return [
    `Imported from ${args.sheetName}`,
    args.leadTeam ? `Event Lead/Team: ${args.leadTeam}` : "",
    args.eventType ? `Summative or Formative: ${args.eventType}` : "",
    args.studentCount ? `Number of students: ${args.studentCount}` : "",
    args.faculty ? `Course Faculty: ${args.faculty}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseSheet(sheetName: string, rows: GridRow[]) {
  const header = findHeader(rows);
  if (!header) return [];

  const year = parseSheetYear(sheetName);
  const candidates: ImportCandidate[] = [];
  let currentDate: string | null = null;

  for (let rowIndex = header.headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const rowText = row.map(asText).filter(Boolean).join(" ");
    if (!rowText) continue;

    const dateFromRow = getDateFromRow(row, year, header.columns);
    if (dateFromRow) currentDate = dateFromRow;

    const name = asText(getCell(row, header.columns.sessionName));
    if (!name || isIgnoredName(name)) continue;

    const { startTime, endTime } = parseTimeRange(getCell(row, header.columns.sessionTime));
    const location = asText(getCell(row, header.columns.rooms)) || null;
    const dateText = currentDate || null;

    candidates.push({
      sheetName,
      name,
      dateText,
      sessionDate: currentDate,
      startTime,
      endTime,
      location,
      notes: buildNotes({
        sheetName,
        leadTeam: asText(getCell(row, header.columns.leadTeam)),
        eventType: asText(getCell(row, header.columns.eventType)),
        studentCount: asText(getCell(row, header.columns.studentCount)),
        faculty: asText(getCell(row, header.columns.faculty)),
      }),
    });
  }

  return candidates;
}

function importKey(name: string, dateText: string | null) {
  return `${normalizeKey(name)}|${dateText || ""}`;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload an Excel workbook." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetNames = workbook.SheetNames.filter(isSeasonalSheet);

    if (!sheetNames.length) {
      return NextResponse.json(
        { error: "No seasonal sheets found. Expected names like Spring 2026." },
        { status: 400 }
      );
    }

    const candidates = sheetNames.flatMap((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<GridRow>(sheet, { header: 1, blankrows: false, raw: true });
      return parseSheet(sheetName, rows);
    });

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
    let skippedDuplicates = 0;

    for (const candidate of candidates) {
      const key = importKey(candidate.name, candidate.dateText);
      if (existingKeys.has(key)) {
        skippedDuplicates += 1;
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

      existingKeys.add(key);
      createdEvents += 1;

      if (event?.id && candidate.sessionDate) {
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

        createdSessions += 1;
      }
    }

    return NextResponse.json({
      imported: {
        sheets: sheetNames,
        parsed_rows: candidates.length,
        created_events: createdEvents,
        created_sessions: createdSessions,
        skipped_duplicates: skippedDuplicates,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not import workbook." },
      { status: 500 }
    );
  }
}
