import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

function asText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getImportedYearHint(notes) {
  const match = asText(notes).match(/\b20\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function normalizeYear(year, fallbackYear = null) {
  if (year >= 2000 && year <= 2100) return year;
  if (year >= 0 && year <= 99) return 2000 + year;
  if (fallbackYear && year < 2000) return fallbackYear;
  return year >= 1900 && year <= 2100 ? year : fallbackYear;
}

function toIsoDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeLooseDateToIso(value, fallbackYear = null) {
  const raw = asText(value);
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{1,4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = normalizeYear(Number(isoMatch[1]), fallbackYear);
    return year ? toIsoDate(year, Number(isoMatch[2]), Number(isoMatch[3])) : null;
  }

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{1,4})$/);
  if (slashMatch) {
    const year = normalizeYear(Number(slashMatch[3]), fallbackYear);
    return year ? toIsoDate(year, Number(slashMatch[1]), Number(slashMatch[2])) : null;
  }

  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return null;
  const parsedDate = new Date(parsed);
  const year = normalizeYear(parsedDate.getFullYear(), fallbackYear);
  if (!year) return null;
  return toIsoDate(year, parsedDate.getMonth() + 1, parsedDate.getDate());
}

function formatUsDate(value, fallbackYear = null) {
  const iso = normalizeLooseDateToIso(value, fallbackYear);
  if (!iso) return null;
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${match[2]}/${match[3]}/${match[1]}`;
}

function isSuspiciousDate(value) {
  const raw = asText(value);
  if (!raw) return false;
  return /\b0?\d{3}-\d{2}-\d{2}\b/.test(raw) || /\b\d{1,2}\/\d{1,2}\/\d{1,3}\b/.test(raw);
}

async function main() {
  const cwd = process.cwd();
  const env = {
    ...readEnvFile(path.join(cwd, ".env.local")),
    ...process.env,
  };

  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const shouldWrite = process.argv.includes("--write");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id,date_text,notes");

  if (eventsError) {
    console.error("Could not load events:", eventsError.message);
    process.exit(1);
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from("event_sessions")
    .select("id,event_id,session_date");

  if (sessionsError) {
    console.error("Could not load event_sessions:", sessionsError.message);
    process.exit(1);
  }

  const eventById = new Map((events || []).map((event) => [event.id, event]));

  const eventUpdates = [];
  for (const event of events || []) {
    if (!isSuspiciousDate(event.date_text)) continue;
    const fallbackYear = getImportedYearHint(event.notes);
    const normalized = formatUsDate(event.date_text, fallbackYear);
    if (!normalized || normalized === event.date_text) continue;
    eventUpdates.push({ id: event.id, before: event.date_text, after: normalized });
  }

  const sessionUpdates = [];
  for (const session of sessions || []) {
    if (!isSuspiciousDate(session.session_date)) continue;
    const event = eventById.get(session.event_id);
    const fallbackYear = getImportedYearHint(event?.notes);
    const normalized = normalizeLooseDateToIso(session.session_date, fallbackYear);
    if (!normalized || normalized === session.session_date) continue;
    sessionUpdates.push({ id: session.id, before: session.session_date, after: normalized });
  }

  console.log(`Dry run: ${shouldWrite ? "OFF (writing enabled)" : "ON"}`);
  console.log(`Event repairs queued: ${eventUpdates.length}`);
  console.log(`Session repairs queued: ${sessionUpdates.length}`);

  if (eventUpdates.length) {
    console.log("\nEvents:");
    eventUpdates.slice(0, 20).forEach((update) => {
      console.log(`- ${update.id}: ${update.before} -> ${update.after}`);
    });
  }

  if (sessionUpdates.length) {
    console.log("\nEvent sessions:");
    sessionUpdates.slice(0, 20).forEach((update) => {
      console.log(`- ${update.id}: ${update.before} -> ${update.after}`);
    });
  }

  if (!shouldWrite) {
    console.log("\nNo changes written. Re-run with --write to apply.");
    return;
  }

  for (const update of eventUpdates) {
    const { error } = await supabase
      .from("events")
      .update({ date_text: update.after })
      .eq("id", update.id);
    if (error) {
      console.error(`Failed to update event ${update.id}:`, error.message);
      process.exitCode = 1;
    }
  }

  for (const update of sessionUpdates) {
    const { error } = await supabase
      .from("event_sessions")
      .update({ session_date: update.after })
      .eq("id", update.id);
    if (error) {
      console.error(`Failed to update session ${update.id}:`, error.message);
      process.exitCode = 1;
    }
  }

  console.log("\nBackfill complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
