import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createSupabaseServerClient } from "../../../lib/supabaseServerClient";
import { asText, formatUsDate } from "../../../lib/eventDateUtils";

export const dynamic = "force-dynamic";

type ParsedSession = {
  date: string;
  time: string | null;
};

type ParsedRosterRow = {
  email: string;
  name: string;
  caseText: string | null;
  assignmentText: string | null;
  notesText: string | null;
  statusByDate: Record<string, string>;
};

type ParsedSheet = {
  sheet: string;
  format: "sp_event_info" | "sp_info";
  title: string;
  term: string | null;
  sessions: ParsedSession[];
  trainingDate: string | null;
  zoomLink: string | null;
  caseText: string | null;
  simStaffNames: string[];
  staffLine: string | null;
  rosterRows: ParsedRosterRow[];
};

type ImportResultEntry = {
  file: string;
  sheet?: string;
  event?: string;
  date?: string | null;
  simStaffCount?: number;
  reason?: string;
  error?: string;
  checkedSheets?: string[];
  detectorMatched?: ParsedSheet["format"];
  extractedTitle?: string;
  extractedDates?: string[];
  staffExtracted?: string | null;
  spRowCount?: number;
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

type SPDirectoryRow = {
  id: string;
  full_name: string | null;
  working_email: string | null;
  email: string | null;
};

type EventAssignmentRow = {
  id: string;
  event_id: string;
  sp_id: string;
  status: string | null;
  confirmed: boolean | null;
};

function normalizeTitle(value: string) {
  return asText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeDateKey(value: string | null) {
  return formatUsDate(value) || asText(value);
}

function normalizeEmail(value: string | null | undefined) {
  return asText(value).toLowerCase();
}

function normalizeName(value: string | null | undefined) {
  return asText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${String(parsed.H).padStart(2, "0")}:${String(parsed.M).padStart(2, "0")}:00`;
    }
  }

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
    "staff hiring",
    "email",
    "sp hired",
    "assignment",
    "notes",
  ]);

  return exactHeaders.has(normalized);
}

function looksLikeDateOrTime(value: string) {
  return (
    /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/.test(value) ||
    /^\d{1,2}:\d{2}(?:\s?[ap]m)?$/i.test(value) ||
    /^\d{1,2}\s?[ap]m$/i.test(value) ||
    /\b(am|pm)\b/i.test(value.toLowerCase()) ||
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

  return words.length >= 1 && words.length <= 4;
}

function splitStaffNames(raw: string) {
  const clean = asText(raw).replace(/^(sim staff|staff hiring)\s*:\s*/i, "");
  if (!clean) return [];

  return clean
    .split(/\s*(?:,|;|\/| and | & )\s*/i)
    .map((part) => part.trim())
    .filter((part) => looksLikePersonName(part));
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

    const normalized = normalizeName(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    names.push(value);
  }

  return names;
}

function addUniqueDateSession(sessions: ParsedSession[], date: string | null, time: string | null) {
  if (!date) return;
  const key = `${date}|${time || ""}`;
  if (sessions.some((session) => `${session.date}|${session.time || ""}` === key)) return;
  sessions.push({ date, time });
}

function buildNotesBlock(parsed: ParsedSheet, existingNotes?: string | null) {
  const lines = asText(existingNotes)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  const replacements = [
    {
      prefix: "Sim Staff:",
      value:
        parsed.staffLine && parsed.staffLine.toLowerCase().startsWith("sim staff:")
          ? parsed.staffLine
          : parsed.simStaffNames.length
            ? `Sim Staff: ${parsed.simStaffNames.join(", ")}`
            : "",
    },
    {
      prefix: "Staff Hiring:",
      value:
        parsed.staffLine && parsed.staffLine.toLowerCase().startsWith("staff hiring:")
          ? parsed.staffLine
          : "",
    },
    { prefix: "Zoom:", value: parsed.zoomLink ? `Zoom: ${parsed.zoomLink}` : "" },
    { prefix: "Training Date:", value: parsed.trainingDate ? `Training Date: ${parsed.trainingDate}` : "" },
    { prefix: "Term:", value: parsed.term ? `Term: ${parsed.term}` : "" },
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
  const sessions: ParsedSession[] = [];

  ["E14", "F14", "G14", "H14", "I14"].forEach((address) => {
    addUniqueDateSession(sessions, parseExcelDate(getMergedCellValue(sheet, address)), eventTime);
  });

  if (!title || sessions.length === 0) {
    return null;
  }

  const simStaffNames = extractSimStaffNames(sheet);

  return {
    sheet: sheetName,
    format: "sp_event_info",
    title,
    term: null,
    sessions,
    trainingDate,
    zoomLink,
    caseText,
    simStaffNames,
    staffLine: simStaffNames.length ? `Sim Staff: ${simStaffNames.join(", ")}` : null,
    rosterRows: [],
  };
}

function parseSpInfoSheet(sheet: XLSX.WorkSheet, sheetName: string): ParsedSheet | null {
  const title = asText(getMergedCellValue(sheet, "A1"));
  const term = asText(getMergedCellValue(sheet, "A2")) || null;
  const emailHeader = asText(getMergedCellValue(sheet, "A14")).toLowerCase();
  const hiredHeader = asText(getMergedCellValue(sheet, "B14")).toLowerCase();
  const staffHiringRaw = asText(getMergedCellValue(sheet, "D13"));
  const sessions: ParsedSession[] = [];
  const dateColumns = ["D", "E", "F", "G"];
  const statusColumnsByDate = new Map<string, string>();

  dateColumns.forEach((column) => {
    const date = parseExcelDate(getMergedCellValue(sheet, `${column}14`));
    const time = parseTimeValue(getMergedCellValue(sheet, `${column}15`));
    addUniqueDateSession(sessions, date, time);
    if (date) {
      statusColumnsByDate.set(date, column);
    }
  });

  const looksValid =
    Boolean(title) &&
    emailHeader.includes("email") &&
    hiredHeader.includes("sp hired") &&
    sessions.length > 0;

  if (!looksValid) {
    return null;
  }

  const rosterRows: ParsedRosterRow[] = [];
  let blankRowStreak = 0;

  for (let row = 16; row <= 250; row += 1) {
    const email = asText(getMergedCellValue(sheet, `A${row}`));
    const name = asText(getMergedCellValue(sheet, `B${row}`));
    const caseText = asText(getMergedCellValue(sheet, `H${row}`)) || null;
    const assignmentText = asText(getMergedCellValue(sheet, `I${row}`)) || null;
    const notesText = asText(getMergedCellValue(sheet, `J${row}`)) || null;

    const statuses = Object.fromEntries(
      [...statusColumnsByDate.entries()].map(([date, column]) => [date, asText(getMergedCellValue(sheet, `${column}${row}`))])
    );
    const hasUsefulStatus = Object.values(statuses).some(Boolean);
    const isBlank = !email && !name && !caseText && !assignmentText && !notesText && !hasUsefulStatus;

    if (isBlank) {
      blankRowStreak += 1;
      if (blankRowStreak >= 5) break;
      continue;
    }

    blankRowStreak = 0;

    if (!email && !name) continue;

    rosterRows.push({
      email,
      name,
      caseText,
      assignmentText,
      notesText,
      statusByDate: statuses,
    });
  }

  const staffLine = staffHiringRaw
    ? /^staff hiring\s*:/i.test(staffHiringRaw)
      ? staffHiringRaw
      : `Staff Hiring: ${staffHiringRaw}`
    : null;
  const simStaffNames = splitStaffNames(staffHiringRaw);
  const caseText = rosterRows.map((row) => row.caseText).find(Boolean) || null;

  return {
    sheet: sheetName,
    format: "sp_info",
    title,
    term,
    sessions,
    trainingDate: null,
    zoomLink: null,
    caseText,
    simStaffNames,
    staffLine,
    rosterRows,
  };
}

function parseSupportedSheet(sheet: XLSX.WorkSheet, sheetName: string) {
  return parseSpEventInfoSheet(sheet, sheetName) || parseSpInfoSheet(sheet, sheetName);
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

  const inserts = parsed.sessions
    .filter((session) => !existingKeys.has(`${session.date}|${session.time || ""}`))
    .map((session) => ({
      event_id: eventId,
      session_date: session.date,
      start_time: session.time,
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

function isPositiveAssignmentMark(value: string) {
  const normalized = value.trim().toLowerCase();
  return ["x", "yes", "y", "assigned", "hired", "confirmed"].includes(normalized);
}

async function syncRosterAssignments(
  supabaseServer: ReturnType<typeof createSupabaseServerClient>,
  eventId: string,
  parsed: ParsedSheet,
  spDirectory: SPDirectoryRow[]
) {
  if (!parsed.rosterRows.length) {
    return { extractedCount: 0 };
  }

  const actionableRows = parsed.rosterRows.filter((row) =>
    Object.values(row.statusByDate).some((value) => isPositiveAssignmentMark(value))
  );

  if (!actionableRows.length) {
    return { extractedCount: parsed.rosterRows.length };
  }

  const { data: existingAssignments, error: existingAssignmentError } = await supabaseServer
    .from("event_sps")
    .select("id,event_id,sp_id,status,confirmed")
    .eq("event_id", eventId);

  if (existingAssignmentError) {
    throw new Error(existingAssignmentError.message);
  }

  const assignmentBySpId = new Map<string, EventAssignmentRow>();
  (existingAssignments || []).forEach((assignment) => {
    assignmentBySpId.set(asText(assignment.sp_id), assignment as EventAssignmentRow);
  });

  for (const row of actionableRows) {
    const normalizedEmail = normalizeEmail(row.email);
    const normalizedName = normalizeName(row.name);
    const matchedSp =
      spDirectory.find((sp) => normalizedEmail && normalizeEmail(sp.working_email) === normalizedEmail) ||
      spDirectory.find((sp) => normalizedEmail && normalizeEmail(sp.email) === normalizedEmail) ||
      spDirectory.find((sp) => normalizedName && normalizeName(sp.full_name) === normalizedName);

    if (!matchedSp) {
      continue;
    }

    const existingAssignment = assignmentBySpId.get(matchedSp.id);
    if (existingAssignment) {
      if (existingAssignment.status !== "confirmed" || existingAssignment.confirmed !== true) {
        const { error } = await supabaseServer
          .from("event_sps")
          .update({ status: "confirmed", confirmed: true })
          .eq("id", existingAssignment.id);
        if (error) {
          throw new Error(error.message);
        }
      }
      continue;
    }

    const { data: insertedAssignment, error: insertError } = await supabaseServer
      .from("event_sps")
      .insert({
        event_id: eventId,
        sp_id: matchedSp.id,
        status: "confirmed",
        confirmed: true,
      })
      .select("id,event_id,sp_id,status,confirmed")
      .single();

    if (insertError) {
      throw new Error(insertError.message);
    }

    if (insertedAssignment) {
      assignmentBySpId.set(matchedSp.id, insertedAssignment as EventAssignmentRow);
    }
  }

  return { extractedCount: parsed.rosterRows.length };
}

async function processWorkbookFile(
  supabaseServer: ReturnType<typeof createSupabaseServerClient>,
  file: File,
  existingEvents: EventRow[],
  spDirectory: SPDirectoryRow[],
  results: ImportResponse
) {
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const checkedSheets = [...workbook.SheetNames];
    const parsedSheets = workbook.SheetNames
      .map((sheetName) => parseSupportedSheet(workbook.Sheets[sheetName], sheetName))
      .filter((value): value is ParsedSheet => Boolean(value));

    if (!parsedSheets.length) {
      results.skipped.push({
        file: file.name,
        checkedSheets,
        reason: `No supported sheet format found. Checked sheets: ${checkedSheets.join(", ")}`,
      });
      return;
    }

    for (const parsed of parsedSheets) {
      const primaryDate = parsed.sessions[0]?.date || null;
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
            detectorMatched: parsed.format,
          });
          continue;
        }

        await ensureSessions(supabaseServer, matchingEvent.id, parsed);
        await syncRosterAssignments(supabaseServer, matchingEvent.id, parsed, spDirectory);

        matchingEvent.notes = nextNotes;
        matchingEvent.date_text = normalizeDateKey(primaryDate) || matchingEvent.date_text;

        results.updated.push({
          file: file.name,
          sheet: parsed.sheet,
          event: parsed.title,
          date: primaryDate,
          simStaffCount: parsed.simStaffNames.length,
          detectorMatched: parsed.format,
          extractedTitle: parsed.title,
          extractedDates: parsed.sessions.map((session) => session.date),
          staffExtracted: parsed.staffLine,
          spRowCount: parsed.rosterRows.length,
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
          detectorMatched: parsed.format,
        });
        continue;
      }

      await ensureSessions(supabaseServer, createdEvent.id, parsed);
      await syncRosterAssignments(supabaseServer, createdEvent.id, parsed, spDirectory);
      existingEvents.push(createdEvent);

      results.created.push({
        file: file.name,
        sheet: parsed.sheet,
        event: parsed.title,
        date: primaryDate,
        simStaffCount: parsed.simStaffNames.length,
        detectorMatched: parsed.format,
        extractedTitle: parsed.title,
        extractedDates: parsed.sessions.map((session) => session.date),
        staffExtracted: parsed.staffLine,
        spRowCount: parsed.rosterRows.length,
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

    const { data: spDirectory, error: spDirectoryError } = await supabaseServer
      .from("sps")
      .select("id,full_name,working_email,email");

    if (spDirectoryError) {
      return NextResponse.json({ error: spDirectoryError.message }, { status: 500 });
    }

    const results: ImportResponse = {
      created: [],
      updated: [],
      skipped: [],
      errors: [],
    };
    const mutableExistingEvents: EventRow[] = [...(existingEvents || [])];

    for (const file of uploadedFiles) {
      await processWorkbookFile(
        supabaseServer,
        file,
        mutableExistingEvents,
        [...(spDirectory || [])] as SPDirectoryRow[],
        results
      );
    }

    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not import workbooks." },
      { status: 500 }
    );
  }
}
