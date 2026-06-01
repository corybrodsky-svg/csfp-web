import { normalizeEmailPlainText } from "./emailTemplates";

const FACULTY_EMAIL_PLACEHOLDERS = new Set([
  "",
  "name@school.edu",
  "email@example.com",
  "faculty@example.com",
  "name@example.com",
  "user@example.com",
]);

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function normalizeStudentListEmail(value: unknown) {
  return asText(value).toLowerCase();
}

export function isValidStudentListFacultyEmail(value: unknown) {
  const email = normalizeStudentListEmail(value);
  if (!email || FACULTY_EMAIL_PLACEHOLDERS.has(email)) return false;
  if ((email.match(/@/g) || []).length !== 1) return false;
  const [, domain = ""] = email.split("@");
  if (!domain || !domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function extractStudentListFacultyEmails(value: unknown) {
  const matches = asText(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(
    new Set(
      matches
        .map((item) => normalizeStudentListEmail(item))
        .filter(isValidStudentListFacultyEmail)
    )
  );
}

export function buildStudentListRequestMailtoHref(args: {
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
}) {
  const parts: string[] = [];
  if (args.cc?.length) parts.push(`cc=${encodeURIComponent(args.cc.join(","))}`);
  if (args.bcc?.length) parts.push(`bcc=${encodeURIComponent(args.bcc.join(","))}`);
  parts.push(`subject=${encodeURIComponent(normalizeEmailPlainText(args.subject))}`);
  parts.push(`body=${encodeURIComponent(normalizeEmailPlainText(args.body))}`);
  return `mailto:${encodeURIComponent(args.to)}?${parts.join("&")}`;
}

export function buildStudentListRequestDraft(args: {
  eventTitle?: string | null;
  eventDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  locationAccess?: string | null;
  facultyName?: string | null;
  facultyEmails: string[];
  senderName?: string | null;
}) {
  const eventTitle = asText(args.eventTitle) || "CFSP Event";
  const eventDate = asText(args.eventDate) || "Date TBD";
  const facultyName = asText(args.facultyName);
  const startTime = asText(args.startTime);
  const endTime = asText(args.endTime);
  const timeLabel = startTime && endTime ? `${startTime}-${endTime}` : startTime || endTime || "TBD";
  const locationAccess = asText(args.locationAccess) || "TBD";
  const senderName = asText(args.senderName) || "CFSP Simulation Operations";
  const subject = `Student List Request: ${eventTitle} - ${eventDate}`;

  const body = [
    facultyName ? `Hello ${facultyName},` : "Hello,",
    "",
    "I hope you're doing well.",
    "",
    `I'm preparing the schedule for ${eventTitle} on ${eventDate} and wanted to request the student list/roster for this event when you have a chance.`,
    "",
    "If possible, please send the list in Excel or CSV format with student names in one column. Email addresses and notes are optional, but helpful if available.",
    "",
    "Event details:",
    `Event: ${eventTitle}`,
    `Date: ${eventDate}`,
    `Time: ${timeLabel}`,
    `Location/Access: ${locationAccess}`,
    "",
    "Thank you,",
    "",
    senderName,
  ].join("\n");

  return {
    to: args.facultyEmails.join(","),
    subject,
    body,
  };
}
