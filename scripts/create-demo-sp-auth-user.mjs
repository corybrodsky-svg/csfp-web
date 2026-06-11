import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const DEMO_ORG_SLUG = "keystone-simulation-alliance";
const DEMO_ORG_NAME = "Keystone Simulation Alliance";
const DEMO_EVENT_NAME = "Simulation Orientation Lab";
const DEMO_SP_EMAIL = "sp.demo1@conflictfreesp.com";
const DEMO_SP_PASSWORD = "Test1234!";
const DEMO_SP_FULL_NAME = "Portal Demo One";
const DEMO_MARKER = "CFSP_KEYSTONE_DEMO_FAKE_DATA";

const RELEASE_GATE_PATCH = {
  schedule_preview_enabled_for_sps: "yes",
  sp_portal_release_location: "yes",
  sp_portal_release_role_case: "yes",
  sp_portal_release_arrival_instructions: "no",
  sp_portal_release_virtual_access: "no",
  sp_portal_release_training_details: "no",
  sp_portal_release_case_files: "no",
  sp_portal_release_training_materials: "no",
};

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
        return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, "")];
      })
  );
}

function getEnvironment() {
  const cwd = process.cwd();
  return { ...readEnvFile(path.join(cwd, ".env.local")), ...process.env };
}

function parseArgs(argv) {
  const args = { write: false, help: false };
  for (const arg of argv) {
    if (arg === "--write") args.write = true;
    if (arg === "--help" || arg === "-h") args.help = true;
  }
  return args;
}

function showHelp() {
  console.log(`Create/verify a fake Keystone demo SP login for local SP portal testing.

Usage:
  npm run demo:sp-portal
  CFSP_ALLOW_DEMO_SEED=true CFSP_DEMO_SEED_TARGET=dev npm run demo:sp-portal -- --write

Demo login:
  Email: ${DEMO_SP_EMAIL}
  Password: ${DEMO_SP_PASSWORD}

Safety:
  --write requires CFSP_ALLOW_DEMO_SEED=true and CFSP_DEMO_SEED_TARGET=dev.
  The script only targets the Keystone demo org, the fake SP profile, and the demo event.`);
}

function asText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeEmail(value) {
  return asText(value).toLowerCase();
}

function assertSafeWrite(env, supabaseUrl) {
  if (env.CFSP_ALLOW_DEMO_SEED !== "true") {
    throw new Error("Refusing to write. Set CFSP_ALLOW_DEMO_SEED=true.");
  }
  if (env.CFSP_DEMO_SEED_TARGET !== "dev") {
    throw new Error("Refusing to write. Set CFSP_DEMO_SEED_TARGET=dev for local/demo databases.");
  }
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing to write with NODE_ENV=production.");
  }
  if (/prod|production/i.test(supabaseUrl) && !/preview|staging|dev|development|localhost|127\.0\.0\.1/i.test(supabaseUrl)) {
    throw new Error("Refusing to write to a Supabase URL that looks production-like.");
  }
}

function createSupabaseClientOrExit(env) {
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  return {
    supabaseUrl,
    db: createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

async function findAuthUserByEmail(db, email) {
  const target = normalizeEmail(email);
  const perPage = 200;
  let page = 1;
  while (true) {
    const result = await db.auth.admin.listUsers({ page, perPage });
    if (result.error) throw new Error(`Auth lookup failed: ${result.error.message}`);
    const users = result.data?.users || [];
    const match = users.find((user) => normalizeEmail(user.email) === target);
    if (match) return match;
    if (users.length < perPage) return null;
    page += 1;
  }
}

async function selectDemoContext(db) {
  const orgResult = await db
    .from("organizations")
    .select("id,name,slug,type,status")
    .eq("slug", DEMO_ORG_SLUG)
    .maybeSingle();
  if (orgResult.error) throw new Error(`Demo org lookup failed: ${orgResult.error.message}`);
  const org = orgResult.data;
  if (!org?.id || org.name !== DEMO_ORG_NAME || org.type !== "demo") {
    throw new Error(`Keystone demo org not found. Run: CFSP_ALLOW_DEMO_SEED=true CFSP_DEMO_SEED_TARGET=dev npm run seed:demo-org -- --write`);
  }

  const spResult = await db
    .from("sps")
    .select("id,organization_id,first_name,last_name,full_name,working_email,email,notes")
    .eq("organization_id", org.id)
    .or(`working_email.eq.${DEMO_SP_EMAIL},email.eq.${DEMO_SP_EMAIL}`)
    .maybeSingle();
  if (spResult.error) throw new Error(`Demo SP lookup failed: ${spResult.error.message}`);
  const sp = spResult.data;
  if (!sp?.id || normalizeEmail(sp.working_email || sp.email) !== DEMO_SP_EMAIL || !asText(sp.notes).includes(DEMO_MARKER)) {
    throw new Error(`Fake demo SP ${DEMO_SP_EMAIL} not found in Keystone demo data. Run the demo org seeder first.`);
  }

  const eventResult = await db
    .from("events")
    .select("id,organization_id,name,date_text,status,location,notes")
    .eq("organization_id", org.id)
    .eq("name", DEMO_EVENT_NAME)
    .maybeSingle();
  if (eventResult.error) throw new Error(`Demo event lookup failed: ${eventResult.error.message}`);
  const event = eventResult.data;
  if (!event?.id || !asText(event.notes).includes(DEMO_MARKER)) {
    throw new Error(`Demo event ${DEMO_EVENT_NAME} not found. Run the demo org seeder first.`);
  }

  const assignmentResult = await db
    .from("event_sps")
    .select("id,event_id,sp_id,status,assignment_status,role_name,confirmed")
    .eq("event_id", event.id)
    .eq("sp_id", sp.id)
    .maybeSingle();
  if (assignmentResult.error) throw new Error(`Demo assignment lookup failed: ${assignmentResult.error.message}`);
  const assignment = assignmentResult.data;
  if (!assignment?.id || assignment.confirmed !== true) {
    throw new Error(`Confirmed demo assignment for ${DEMO_SP_EMAIL} on ${DEMO_EVENT_NAME} was not found.`);
  }

  return { org, sp, event, assignment };
}

async function ensureAuthUser(db, context) {
  const metadata = {
    full_name: DEMO_SP_FULL_NAME,
    schedule_name: DEMO_SP_FULL_NAME,
    role: "sp",
    organization_id: context.org.id,
    sp_id: context.sp.id,
    demo: true,
    source: "create-demo-sp-auth-user",
  };
  const existing = await findAuthUserByEmail(db, DEMO_SP_EMAIL);
  if (!existing) {
    const result = await db.auth.admin.createUser({
      email: DEMO_SP_EMAIL,
      password: DEMO_SP_PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (result.error) throw new Error(`Could not create fake demo SP auth user: ${result.error.message}`);
    return { user: result.data.user, created: true };
  }

  const result = await db.auth.admin.updateUserById(existing.id, {
    password: DEMO_SP_PASSWORD,
    email_confirm: true,
    user_metadata: {
      ...(existing.user_metadata || {}),
      ...metadata,
    },
  });
  if (result.error) throw new Error(`Could not update fake demo SP auth user: ${result.error.message}`);
  return { user: result.data.user || existing, created: false };
}

async function upsertProfile(db, user, context) {
  const base = {
    id: user.id,
    full_name: DEMO_SP_FULL_NAME,
    schedule_name: DEMO_SP_FULL_NAME,
    email: DEMO_SP_EMAIL,
    role: "sp",
    is_active: true,
    sp_id: context.sp.id,
  };
  const result = await db.from("profiles").upsert(base, { onConflict: "id" }).select("id").maybeSingle();
  if (!result.error) return;
  const text = [result.error.code, result.error.message, result.error.details, result.error.hint].map(asText).join(" ");
  if (!/schedule_name|sp_id|profile_image_url/i.test(text)) {
    throw new Error(`Profile upsert failed: ${result.error.message}`);
  }
  const fallback = { ...base };
  delete fallback.sp_id;
  const fallbackResult = await db.from("profiles").upsert(fallback, { onConflict: "id" }).select("id").maybeSingle();
  if (fallbackResult.error) throw new Error(`Profile fallback upsert failed: ${fallbackResult.error.message}`);
}

async function upsertMembership(db, user, context) {
  const existingResult = await db
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", context.org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingResult.error) throw new Error(`Membership lookup failed: ${existingResult.error.message}`);
  const payload = {
    organization_id: context.org.id,
    user_id: user.id,
    sp_id: context.sp.id,
    role: "sp",
    status: "active",
  };
  const query = existingResult.data?.id
    ? db.from("organization_memberships").update(payload).eq("id", existingResult.data.id)
    : db.from("organization_memberships").insert(payload);
  const result = await query.select("id").maybeSingle();
  if (!result.error) return;
  const text = [result.error.code, result.error.message, result.error.details, result.error.hint].map(asText).join(" ");
  if (!/sp_id/i.test(text)) throw new Error(`Membership upsert failed: ${result.error.message}`);
  const fallbackPayload = { ...payload };
  delete fallbackPayload.sp_id;
  const fallbackQuery = existingResult.data?.id
    ? db.from("organization_memberships").update(fallbackPayload).eq("id", existingResult.data.id)
    : db.from("organization_memberships").insert(fallbackPayload);
  const fallbackResult = await fallbackQuery.select("id").maybeSingle();
  if (fallbackResult.error) throw new Error(`Membership fallback upsert failed: ${fallbackResult.error.message}`);
}

async function upsertPreference(db, context) {
  const payload = {
    organization_id: context.org.id,
    sp_id: context.sp.id,
    preferred_mode: "portal",
    portal_status: "linked",
    onboarding_status: "complete",
  };
  const result = await db
    .from("sp_communication_preferences")
    .upsert(payload, { onConflict: "organization_id,sp_id" })
    .select("id")
    .maybeSingle();
  if (result.error && !/sp_communication_preferences|relation .* does not exist|PGRST205|42P01/i.test(result.error.message || "")) {
    throw new Error(`Communication preference upsert failed: ${result.error.message}`);
  }
}

function parseMetadataBlock(notes) {
  const text = asText(notes);
  const start = "[CFSP_TRAINING_METADATA]";
  const end = "[/CFSP_TRAINING_METADATA]";
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return { text, start, end, startIndex: -1, endIndex: -1, metadata: new Map() };
  }
  const block = text.slice(startIndex + start.length, endIndex).trim();
  const metadata = new Map();
  block.split(/\r?\n/).forEach((line) => {
    const index = line.indexOf(":");
    if (index <= 0) return;
    metadata.set(line.slice(0, index).trim(), line.slice(index + 1).trim());
  });
  return { text, start, end, startIndex, endIndex, metadata };
}

function upsertMetadata(notes, patch) {
  const parsed = parseMetadataBlock(notes);
  const metadata = parsed.metadata;
  Object.entries(patch).forEach(([key, value]) => metadata.set(key, value));
  const nextBlock = [
    parsed.start,
    ...Array.from(metadata.entries()).map(([key, value]) => `${key}: ${value}`),
    parsed.end,
  ].join("\n");
  if (parsed.startIndex === -1) {
    return `${nextBlock}\n${parsed.text}`.trim();
  }
  return [
    parsed.text.slice(0, parsed.startIndex).trimEnd(),
    nextBlock,
    parsed.text.slice(parsed.endIndex + parsed.end.length).trimStart(),
  ].filter(Boolean).join("\n");
}

async function ensureReleaseGates(db, context) {
  const nextNotes = upsertMetadata(context.event.notes, RELEASE_GATE_PATCH);
  if (nextNotes === context.event.notes) return false;
  const result = await db
    .from("events")
    .update({ notes: nextNotes })
    .eq("id", context.event.id)
    .eq("organization_id", context.org.id)
    .select("id")
    .maybeSingle();
  if (result.error) throw new Error(`Release gate update failed: ${result.error.message}`);
  return true;
}

function printSummary(context, authState = null) {
  console.log("SP portal demo test target");
  console.log(`Organization: ${context.org.name} (${context.org.slug})`);
  console.log(`Event: ${context.event.name} (${context.event.date_text || "date TBD"})`);
  console.log(`SP: ${DEMO_SP_FULL_NAME} <${DEMO_SP_EMAIL}>`);
  console.log(`Assignment: ${context.assignment.status || "status TBD"} / ${context.assignment.role_name || context.assignment.assignment_status || "role TBD"}`);
  console.log(`Login password: ${DEMO_SP_PASSWORD}`);
  if (authState) console.log(`Auth user: ${authState.created ? "created" : "updated"} (${authState.user.id})`);
  console.log("Released for the demo: location/room, role/case, schedule preview.");
  console.log("Intentionally not released: arrival instructions, virtual access, training details, case files, training materials.");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    showHelp();
    return;
  }

  const env = getEnvironment();
  const { supabaseUrl, db } = createSupabaseClientOrExit(env);
  const context = await selectDemoContext(db);
  if (!args.write) {
    const existing = await findAuthUserByEmail(db, DEMO_SP_EMAIL);
    printSummary(context);
    console.log(`Auth user exists: ${existing ? "yes" : "no"}`);
    console.log("No changes made. Add --write with the explicit demo env guards to create/update the test login.");
    return;
  }

  assertSafeWrite(env, supabaseUrl);
  const authState = await ensureAuthUser(db, context);
  await upsertProfile(db, authState.user, context);
  await upsertMembership(db, authState.user, context);
  await upsertPreference(db, context);
  const gatesChanged = await ensureReleaseGates(db, context);
  printSummary(context, authState);
  console.log(`Release gates: ${gatesChanged ? "updated" : "already set"}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
