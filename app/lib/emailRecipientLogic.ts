export type SPRecipient = {
  id?: string | number | null;
  email?: string | null;
};

function normalizeRecipientId(value: SPRecipient["id"]) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeRecipientEmail(value: SPRecipient["email"]) {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase();
}

export function getAvailabilityPollClosedRecipients<T extends SPRecipient>({
  originalPollRecipients,
  hiredSelectedSPs,
}: {
  originalPollRecipients: T[];
  hiredSelectedSPs: SPRecipient[];
}) {
  const hiredIds = new Set(
    hiredSelectedSPs
      .map((sp) => normalizeRecipientId(sp.id))
      .filter(Boolean)
  );
  const hiredEmails = new Set(
    hiredSelectedSPs
      .map((sp) => normalizeRecipientEmail(sp.email))
      .filter(Boolean)
  );
  const seen = new Set<string>();

  return originalPollRecipients.filter((sp) => {
    const id = normalizeRecipientId(sp.id);
    const email = normalizeRecipientEmail(sp.email);
    const idKey = id ? `id:${id}` : "";
    const emailKey = email ? `email:${email}` : "";

    if (!idKey && !emailKey) return false;
    if ((id && hiredIds.has(id)) || (email && hiredEmails.has(email))) return false;
    if ((idKey && seen.has(idKey)) || (emailKey && seen.has(emailKey))) return false;

    if (idKey) seen.add(idKey);
    if (emailKey) seen.add(emailKey);
    return true;
  });
}
