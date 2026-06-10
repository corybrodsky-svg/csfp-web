import type { SupabaseClient } from "@supabase/supabase-js";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeEmail(value: unknown) {
  return asText(value).toLowerCase();
}

function getErrorText(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const source = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
  return [source.message, source.details, source.hint, source.code].map(asText).join(" ").toLowerCase();
}

export function isMissingOrganizationContactsTable(error: unknown) {
  const text = getErrorText(error);
  return /organization_contacts|relation .* does not exist|schema cache|pgrst205|42p01/.test(text);
}

export async function upsertOrganizationFacultyContact(args: {
  db: SupabaseClient;
  organizationId: string;
  name: string;
  email: string;
  sourceEventId?: string | null;
}) {
  const organizationId = asText(args.organizationId);
  const email = normalizeEmail(args.email);
  const name = asText(args.name);

  if (!organizationId || !email) {
    return { ok: true as const, skipped: true as const, warning: "" };
  }

  const payload = {
    organization_id: organizationId,
    full_name: name || email,
    email,
    normalized_email: email,
    contact_type: "faculty",
    role_metadata: { role: "faculty", source: "event_settings", source_event_id: asText(args.sourceEventId) || null },
    source_event_id: asText(args.sourceEventId) || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await args.db
    .from("organization_contacts")
    .upsert(payload, { onConflict: "organization_id,normalized_email" });

  if (error && isMissingOrganizationContactsTable(error)) {
    return {
      ok: true as const,
      skipped: true as const,
      warning: "organization_contacts table is not available; faculty contact metadata remains on the event.",
    };
  }

  if (error) {
    return { ok: false as const, skipped: false as const, warning: asText(error.message) || "Could not save faculty contact." };
  }

  return { ok: true as const, skipped: false as const, warning: "" };
}
