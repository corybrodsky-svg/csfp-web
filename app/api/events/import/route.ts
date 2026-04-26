import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createSupabaseServerClient } from "../../../lib/supabaseServerClient";
import { asText, formatUsDate } from "../../../lib/eventDateUtils";

export const dynamic = "force-dynamic";

type ParsedSheet = {
  sheet: string;
  title: string;
  eventDates: string[];
  eventTime: string | null;
  trainingDate: string | null;
  zoomLink: string | null;
  caseText: string | null;
  simStaffNames: string[];
};

type ImportResultEntry = {
  file: string;
  sheet?: string;
  event?: string;
  date?: string | null;
  simStaffCount?: number;
  reason?: string;
  error?: string;
};

type ImportResponse = {
  created: ImportResultEntry[];
  updated: ImportResultEntry[];
  skipped: ImportResultEntry[];
  errors: ImportResultEntry[];
};

type EventRow = {
  id: string;
  name: string | null;
  date_text: string | null;
  notes: string | null;
};

function normalizeTitle(value: string) {
  return asText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeDateKey(value: string | null) {
  return formatUsDate(value) || asText(value);
}

function getMergedCellValue(sheet: XLSX.WorkSheet, address: string) {
  const direct = sheet[address];
  if (direct) return direct.v;

  const merges = sheet["!merges"] || [];
  const target = XLSX.utils.decode_cell(address);

  for (const merge of merges) {
    if (
      target.r >= merge.s.r &&
      target.r <= merge.e.r &&
      target.c >= merge.s.c &&
      target.c <= merge.e.c
    ) {
      const anchor = XLSX.utils.encode_cell(merge.s);
      return sheet[anchor]?.v;
    }
  }

  return undefined;
}

function parseExcelDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }

  const raw = asText(value);
  if (!raw) return null;

  const mmddyy = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (mmddyy) {
    const yearText = mmddyy[3];
    const year = yearText ? (yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText)) : 2026;
    return `${year}-${String(Number(mmddyy[1])).padStart(2, "0")}-${String(Number(mmddyy[2])).padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function parseTimeValue(value: unknown) {
  const raw = asText(value);
  if (!raw) return null;

  const normalized = raw.replace(/[–—]/g, "-");
  const match = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || "0");
  const suffix = (match[3] || "").toLowerCase();

  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function isKnownHeader(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const exactHeaders = new Set([
    "sim staff",
    "event",
    "event title",
    "zoom",
    "link",
    "training date",
    "event date",
    "event dates",
    "event time",
    "case",
    "sp emails",
    "sp names",
    "location",
    "room",
  ]);

  return exactHeaders.has(normalized);
}

function looksLikeDateOrTime(value: string) {
  return (
    /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/.test(value) ||
    /^\d{1,2}:\d{2}(?:\s?[ap]m)?$/i.test(value) ||
    /^\d{1,2}\s?[ap]m$/i.test(value) ||
    /\b(am|pm)\b/i.test(value) ||
    /\b(mon|tue|wed|thu|fri|sat|sun)\b/i.test(value.toLowerCase())
  );
}

function looksLikeLocation(value: string) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("zoom") ||
    normalized.includes("room") ||
    normalized.includes("location") ||
    normalized.includes("building") ||
    normalized.includes("campus") ||
    normalized.includes("hall")
  );
}

function looksLikePersonName(value: string) {
  if (!value) return false;
  if (isKnownHeader(value)) return false;
  if (looksLikeDateOrTime(value)) return false;
  if (looksLikeLocation(value)) return false;
  if (value.includes("@")) return false;
  if (/https?:\/\//i.test(value)) return false;
  if (/\d{2,}/.test(value)) return false;

  const words = value
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z'.-]/g, ""))
    .filter(Boolean);

  return words.length >= 2 && words.length <= 4;
}

function extractSimStaffNames(sheet: XLSX.WorkSheet) {
  const names: string[] = [];
  const seen = new Set<string>();
  const rangeRef = sheet["!ref"];

  if (!rangeRef) return names;

  const range = XLSX.utils.decode_range(rangeRef);

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const value = asText(getMergedCellValue(sheet, `B${row + 1}`));
    if (!looksLikePersonName(value)) continue;

    const normalized = value.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    names.push(value);
  }

  return names;
}

function buildNotesBlock(parsed: ParsedSheet, existingNotes?: string | null) {
  const lines = asText(existingNotes)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  const replacements = [
    { prefix: "Sim Staff:", value: parsed.simStaffNames.length ? `Sim Staff: ${parsed.simStaffNames.join(", ")}` : "" },
    { prefix: "Zoom:", value: parsed.zoomLink ? `Zoom: ${parsed.zoomLink}` : "" },
    { prefix: "Training Date:", value: parsed.trainingDate ? `Training Date: ${parsed.trainingDate}` : "" },
    { prefix: "Case:", value: parsed.caseText ? `Case: ${parsed.caseText}` : "" },
  ];

  const nextLines = [...lines];

  replacements.forEach((item) => {
    if (!item.value) return;
    const index = nextLines.findIndex((line) => line.toLowerCase().startsWith(item.prefix.toLowerCase()));
    if (index >= 0) {
      nextLines[index] = item.value;
    } else {
      nextLines.push(item.value);
    }
  });

  return nextLines.join("\n");
}

function parseSpEventInfoSheet(sheet: XLSX.WorkSheet, sheetName: string): ParsedSheet | null {
  const title = asText(getMergedCellValue(sheet, "B1"));
  const zoomLink = asText(getMergedCellValue(sheet, "B7")) || null;
  const trainingDate = parseExcelDate(getMergedCellValue(sheet, "D14"));
  const eventTime = parseTimeValue(getMergedCellValue(sheet, "D15"));
  const caseText = asText(getMergedCellValue(sheet, "D83")) || null;

  const eventDates = ["E14", "F14", "G14", "H14", "I14"]
    .map((address) => parseExcelDate(getMergedCellValue(sheet, address)))
    .filter((value): value is string => Boolean(value));

  if (!title || eventDates.length === 0) {
    return null;
  }

  return {
    sheet: sheetName,
    title,
    eventDates: Array.from(new Set(eventDates)),
    eventTime,
    trainingDate,
    zoomLink,
    caseText,
    simStaffNames: extractSimStaffNames(sheet),
  };
}

async function ensureSessions(
  supabaseServer: ReturnType<typeof createSupabaseServerClient>,
  eventId: string,
  parsed: ParsedSheet
) {
  const { data: existingSessions, error: sessionFetchError } = await supabaseServer
    .from("event_sessions")
    .select("id,event_id,session_date,start_time,end_time,location,room")
    .eq("event_id", eventId);

  if (sessionFetchError) {
    throw new Error(sessionFetchError.message);
  }

  const existingKeys = new Set(
    (existingSessions || []).map((session) => `${asText(session.session_date)}|${asText(session.start_time)}`)
  );

  const inserts = parsed.eventDates
    .filter((date) => !existingKeys.has(`${date}|${parsed.eventTime || ""}`))
    .map((date) => ({
      event_id: eventId,
      session_date: date,
      start_time: parsed.eventTime,
      end_time: null,
      location: null,
      room: null,
    }));

  if (!inserts.length) return;

  const { error } = await supabaseServer.from("event_sessions").insert(inserts);
  if (error) {
    throw new Error(error.message);
  }
}

async function processWorkbookFile(
  supabaseServer: ReturnType<typeof createSupabaseServerClient>,
  file: File,
  existingEvents: EventRow[],
  results: ImportResponse
) {
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const parsedSheets = workbook.SheetNames
      .map((sheetName) => parseSpEventInfoSheet(workbook.Sheets[sheetName], sheetName))
      .filter((value): value is ParsedSheet => Boolean(value));

    if (!parsedSheets.length) {
      results.skipped.push({
        file: file.name,
        reason: "No valid SP Event Info sheets detected.",
      });
      return;
    }

    for (const parsed of parsedSheets) {
      const primaryDate = parsed.eventDates[0] || null;
      const matchingEvent = existingEvents.find(
        (event) =>
          normalizeTitle(event.name || "") === normalizeTitle(parsed.title) &&
          normalizeDateKey(event.date_text) === normalizeDateKey(primaryDate)
      );

      if (matchingEvent) {
        const nextNotes = buildNotesBlock(parsed, matchingEvent.notes);
        const { error: updateError } = await supabaseServer
          .from("events")
          .update({
            notes: nextNotes,
            date_text: normalizeDateKey(primaryDate) || matchingEvent.date_text,
          })
          .eq("id", matchingEvent.id);

        if (updateError) {
          results.errors.push({
            file: file.name,
            sheet: parsed.sheet,
            event: parsed.title,
            date: primaryDate,
            error: updateError.message,
          });
          continue;
        }

        await ensureSessions(supabaseServer, matchingEvent.id, parsed);

        matchingEvent.notes = nextNotes;
        matchingEvent.date_text = normalizeDateKey(primaryDate) || matchingEvent.date_text;

        results.updated.push({
          file: file.name,
          sheet: parsed.sheet,
          event: parsed.title,
          date: primaryDate,
          simStaffCount: parsed.simStaffNames.length,
        });
        continue;
      }

      const notes = buildNotesBlock(parsed, null);
      const { data: createdEvent, error: createError } = await supabaseServer
        .from("events")
        .insert({
          name: parsed.title,
          status: "Scheduled",
          date_text: normalizeDateKey(primaryDate),
          sp_needed: 0,
          visibility: "team",
          location: null,
          notes,
        })
        .select("id,name,date_text,notes")
        .single();

      if (createError || !createdEvent) {
        results.errors.push({
          file: file.name,
          sheet: parsed.sheet,
          event: parsed.title,
          date: primaryDate,
          error: createError?.message || "Could not create event.",
        });
        continue;
      }

      await ensureSessions(supabaseServer, createdEvent.id, parsed);
      existingEvents.push(createdEvent);

      results.created.push({
        file: file.name,
        sheet: parsed.sheet,
        event: parsed.title,
        date: primaryDate,
        simStaffCount: parsed.simStaffNames.length,
      });
    }
  } catch (error) {
    results.errors.push({
      file: file.name,
      error: error instanceof Error ? error.message : "Could not process workbook.",
    });
  }
}

export async function POST(request: Request) {
  try {
    const supabaseServer = createSupabaseServerClient();
    const formData = await request.formData();
    const uploadedFiles = [
      ...formData.getAll("files").filter((value): value is File => value instanceof File),
      ...formData.getAll("file").filter((value): value is File => value instanceof File),
    ];

    if (!uploadedFiles.length) {
      return NextResponse.json({ error: "Upload one or more Excel workbooks." }, { status: 400 });
    }

    const { data: existingEvents, error: existingError } = await supabaseServer
      .from("events")
      .select("id,name,date_text,notes");

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const results: ImportResponse = {
      created: [],
      updated: [],
      skipped: [],
      errors: [],
    };
    const mutableExistingEvents: EventRow[] = [...(existingEvents || [])];

    for (const file of uploadedFiles) {
      await processWorkbookFile(supabaseServer, file, mutableExistingEvents, results);
    }

    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not import workbooks." },
      { status: 500 }
    );
  }
}
