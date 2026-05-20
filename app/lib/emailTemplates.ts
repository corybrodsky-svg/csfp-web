export type EmailTemplateBodyFormat = "plain_text" | "html";

export type EmailTemplateRecord = {
  id?: string;
  name: string;
  category: string | null;
  university_name: string | null;
  program_name: string | null;
  subject_template: string;
  body_template: string;
  body_format: EmailTemplateBodyFormat | string | null;
  default_to: string | null;
  default_cc: string | null;
  default_bcc: string | null;
  default_from_label?: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type EmailTemplateContext = Record<string, string | number | boolean | null | undefined>;

const FRIENDLY_MERGE_PLACEHOLDERS: Record<string, string> = {
  eventName: "Event name TBD",
  eventDate: "Event date TBD",
  eventDates: "Event dates TBD",
  eventTime: "Event time TBD",
  eventLocation: "Location / access TBD",
  caseName: "Case / role TBD",
  simStaff: "Simulation staff TBD",
  faculty: "Faculty contact TBD",
  trainingDate: "Training date TBD",
  trainingTime: "Training time TBD",
  trainingZoomLink: "Training access TBD",
  spFirstName: "SP",
  spFullName: "Standardized Patient",
  senderName: "CFSP Simulation Operations",
  senderEmail: "Sender email TBD",
  senderTitle: "Simulation Operations",
  universityName: "University TBD",
  programName: "Program TBD",
  pollLink: "Poll link TBD",
  spEmails: "",
  generalStaffSignature: "CFSP Simulation Operations",
};

const MERGE_FIELD_ALIASES: Record<string, string> = {
  event: "eventName",
  eventname: "eventName",
  date: "eventDate",
  eventdate: "eventDate",
  time: "eventTime",
  eventtime: "eventTime",
  zoomlink: "trainingZoomLink",
  zoomurl: "trainingZoomLink",
  trainingzoomlink: "trainingZoomLink",
  senderemail: "senderEmail",
  sendername: "senderName",
  faculty: "faculty",
  spemails: "spEmails",
};

export const CFSP_EMAIL_TEMPLATE_CATEGORIES = [
  "hiring",
  "confirmation",
  "training",
  "poll",
  "cancellation",
  "faculty",
  "signature",
] as const;

export const DEFAULT_CFSP_EMAIL_TEMPLATES: EmailTemplateRecord[] = [
  {
    name: "Confirmation Hire",
    category: "confirmation",
    university_name: "CFSP",
    program_name: "",
    subject_template: "CONFIRMED: {{eventName}} - {{eventDate}}",
    body_template: [
      "Hello {{spFirstName}},",
      "",
      "You are confirmed for the following CFSP simulation event:",
      "",
      "Event: {{eventName}}",
      "Date(s): {{eventDates}}",
      "Time: {{eventTime}}",
      "Location / Access: {{eventLocation}}",
      "Case / Role: {{caseName}}",
      "",
      "Training Date: {{trainingDate}}",
      "Training Time: {{trainingTime}}",
      "Training Zoom Link: {{trainingZoomLink}}",
      "",
      "Please reply as soon as possible if your availability has changed or if any details above look incorrect.",
      "",
      "{{generalStaffSignature}}",
    ].join("\n"),
    body_format: "plain_text",
    default_to: "{{senderEmail}}",
    default_cc: "{{faculty}}",
    default_bcc: "{{spEmails}}",
    default_from_label: "{{senderName}}",
    is_active: true,
  },
  {
    name: "SP Availability Poll",
    category: "hiring",
    university_name: "CFSP",
    program_name: "",
    subject_template: "SP Availability Poll: {{eventName}} - {{eventDate}}",
    body_template: [
      "SPs,",
      "",
      "CFSP is checking availability for the following simulation event:",
      "",
      "Event: {{eventName}}",
      "Date / Time: {{eventDate}} · {{eventTime}}",
      "Location / Modality: {{eventLocation}}",
      "Role / Case Need: {{caseName}}",
      "",
      "Poll Link: {{pollLink}}",
      "",
      "Please respond with your availability as soon as possible. Confirmed details will be sent separately.",
      "",
      "{{generalStaffSignature}}",
    ].join("\n"),
    body_format: "plain_text",
    default_to: "{{senderEmail}}",
    default_cc: "{{faculty}}",
    default_bcc: "{{spEmails}}",
    default_from_label: "{{senderName}}",
    is_active: true,
  },
  {
    name: "Availability Poll Closed",
    category: "poll",
    university_name: "CFSP",
    program_name: "",
    subject_template: "Availability Poll Closed: {{eventName}}",
    body_template: [
      "Hello,",
      "",
      "The availability poll for {{eventName}} is now closed.",
      "",
      "CFSP will review responses and send confirmation details to selected SPs.",
      "",
      "{{generalStaffSignature}}",
    ].join("\n"),
    body_format: "plain_text",
    default_to: "{{senderEmail}}",
    default_cc: "",
    default_bcc: "{{spEmails}}",
    default_from_label: "{{senderName}}",
    is_active: true,
  },
  {
    name: "Prep for Training",
    category: "training",
    university_name: "CFSP",
    program_name: "",
    subject_template: "SP Training Prep: {{eventName}} - {{trainingDate}}",
    body_template: [
      "SPs,",
      "",
      "Please prepare for SP training for {{eventName}}.",
      "",
      "Training Date: {{trainingDate}}",
      "Training Time: {{trainingTime}}",
      "Training Location / Zoom: {{trainingZoomLink}}",
      "Event Date(s): {{eventDates}}",
      "Event Location / Access: {{eventLocation}}",
      "Case / Role: {{caseName}}",
      "",
      "Please review any attached materials before training and let CFSP know if you have questions.",
      "",
      "{{generalStaffSignature}}",
    ].join("\n"),
    body_format: "plain_text",
    default_to: "{{senderEmail}}",
    default_cc: "{{faculty}}",
    default_bcc: "{{spEmails}}",
    default_from_label: "{{senderName}}",
    is_active: true,
  },
  {
    name: "Prep for Training SimIQ Summative",
    category: "training",
    university_name: "CFSP",
    program_name: "SimIQ",
    subject_template: "SimIQ SP Training Prep: {{eventName}}",
    body_template: "SPs,\n\nPlease prepare for the SimIQ summative event: {{eventName}}.\n\nTraining: {{trainingDate}} · {{trainingTime}}\nAccess: {{trainingZoomLink}}\n\n{{generalStaffSignature}}",
    body_format: "plain_text",
    default_to: "{{senderEmail}}",
    default_cc: "{{faculty}}",
    default_bcc: "{{spEmails}}",
    default_from_label: "{{senderName}}",
    is_active: true,
  },
  {
    name: "Preparatory Text to SPs",
    category: "training",
    university_name: "CFSP",
    program_name: "",
    subject_template: "Prep Reminder: {{eventName}}",
    body_template: "Reminder for {{eventName}}: please review your case/prep materials and confirm arrival/access details. Training/access: {{trainingZoomLink}}",
    body_format: "plain_text",
    default_to: "",
    default_cc: "",
    default_bcc: "{{spEmails}}",
    default_from_label: "{{senderName}}",
    is_active: true,
  },
  {
    name: "Preparatory Text to SPs SimIQ",
    category: "training",
    university_name: "CFSP",
    program_name: "SimIQ",
    subject_template: "SimIQ Prep Reminder: {{eventName}}",
    body_template: "SimIQ reminder for {{eventName}}: please review instructions and confirm access details. {{trainingZoomLink}}",
    body_format: "plain_text",
    default_to: "",
    default_cc: "",
    default_bcc: "{{spEmails}}",
    default_from_label: "{{senderName}}",
    is_active: true,
  },
  {
    name: "Link to Recorded SP Training",
    category: "training",
    university_name: "CFSP",
    program_name: "",
    subject_template: "{{eventName}}: Link to Recorded SP Training",
    body_template: [
      "SPs,",
      "",
      "Please review the recorded SP training for {{eventName}}.",
      "",
      "Event Date(s): {{eventDates}}",
      "Training Recording / Access: {{trainingZoomLink}}",
      "Faculty / Contact: {{faculty}}",
      "",
      "If you were not at training but are reviewing the recording, include the approved review time on your timesheet.",
      "",
      "{{generalStaffSignature}}",
    ].join("\n"),
    body_format: "plain_text",
    default_to: "{{senderEmail}}",
    default_cc: "{{faculty}}",
    default_bcc: "{{spEmails}}",
    default_from_label: "{{senderName}}",
    is_active: true,
  },
  {
    name: "Link to Recorded SP Training SimIQ",
    category: "training",
    university_name: "CFSP",
    program_name: "SimIQ",
    subject_template: "SimIQ Recorded SP Training: {{eventName}}",
    body_template: "SPs,\n\nPlease review the recorded SimIQ SP training for {{eventName}}.\n\nRecording / Access: {{trainingZoomLink}}\n\n{{generalStaffSignature}}",
    body_format: "plain_text",
    default_to: "{{senderEmail}}",
    default_cc: "{{faculty}}",
    default_bcc: "{{spEmails}}",
    default_from_label: "{{senderName}}",
    is_active: true,
  },
  {
    name: "Introduction to SP Training Template",
    category: "training",
    university_name: "CFSP",
    program_name: "",
    subject_template: "Introduction to SP Training: {{eventName}}",
    body_template: "Hello,\n\nThis message introduces the SP training plan for {{eventName}}.\n\nTraining: {{trainingDate}} · {{trainingTime}}\nLocation / Access: {{trainingZoomLink}}\n\n{{generalStaffSignature}}",
    body_format: "plain_text",
    default_to: "{{senderEmail}}",
    default_cc: "{{faculty}}",
    default_bcc: "{{spEmails}}",
    default_from_label: "{{senderName}}",
    is_active: true,
  },
  {
    name: "SimIQ Prep to SPs",
    category: "training",
    university_name: "CFSP",
    program_name: "SimIQ",
    subject_template: "SimIQ Prep: {{eventName}}",
    body_template: "SPs,\n\nPlease review the SimIQ preparation instructions for {{eventName}}.\n\nEvent: {{eventName}}\nDate: {{eventDate}}\nAccess: {{trainingZoomLink}}\n\n{{generalStaffSignature}}",
    body_format: "plain_text",
    default_to: "{{senderEmail}}",
    default_cc: "{{faculty}}",
    default_bcc: "{{spEmails}}",
    default_from_label: "{{senderName}}",
    is_active: true,
  },
  {
    name: "SimIQ faculty/student/SP instructions",
    category: "training",
    university_name: "CFSP",
    program_name: "SimIQ",
    subject_template: "SimIQ Instructions: {{eventName}}",
    body_template: "Hello,\n\nPlease see SimIQ instructions for {{eventName}}.\n\nEvent Date(s): {{eventDates}}\nAccess: {{trainingZoomLink}}\nFaculty: {{faculty}}\n\n{{generalStaffSignature}}",
    body_format: "plain_text",
    default_to: "{{senderEmail}}",
    default_cc: "{{faculty}}",
    default_bcc: "{{spEmails}}",
    default_from_label: "{{senderName}}",
    is_active: true,
  },
  {
    name: "SP Cancellation",
    category: "cancellation",
    university_name: "CFSP",
    program_name: "",
    subject_template: "Cancellation Notice: {{eventName}} - {{eventDate}}",
    body_template: "Hello {{spFirstName}},\n\nCFSP is writing to cancel or release your assignment for {{eventName}} on {{eventDate}}.\n\nThank you for your flexibility.\n\n{{generalStaffSignature}}",
    body_format: "plain_text",
    default_to: "{{senderEmail}}",
    default_cc: "",
    default_bcc: "{{spEmails}}",
    default_from_label: "{{senderName}}",
    is_active: true,
  },
  {
    name: "General Staff Signature",
    category: "signature",
    university_name: "CFSP",
    program_name: "",
    subject_template: "General Staff Signature",
    body_template: "{{senderName}}\n{{senderTitle}}\n{{senderEmail}}\n{{universityName}} {{programName}}",
    body_format: "plain_text",
    default_to: "",
    default_cc: "",
    default_bcc: "",
    default_from_label: "{{senderName}}",
    is_active: true,
  },
];

export function normalizeEmailPlainText(value: unknown) {
  return String(value ?? "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n\n")
    .replace(/<\/\s*div\s*>/gi, "\n")
    .replace(/<\/\s*li\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function renderEmailTemplateText(
  template: string,
  context: EmailTemplateContext,
  options?: { missingMode?: "friendly" | "blank" }
) {
  const missingMode = options?.missingMode || "friendly";
  return normalizeEmailPlainText(template).replace(/\{\{\s*([A-Za-z0-9_ -]+)\s*\}\}/g, (_match, key: string) => {
    const trimmedKey = key.trim();
    const normalizedKey = trimmedKey.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const canonicalKey = MERGE_FIELD_ALIASES[normalizedKey] || trimmedKey;
    const value = context[trimmedKey] ?? context[canonicalKey];
    const renderedValue = value === null || value === undefined ? "" : String(value).trim();
    if (renderedValue) return renderedValue;
    if (missingMode === "blank") return "";
    return FRIENDLY_MERGE_PLACEHOLDERS[canonicalKey] || `${trimmedKey} TBD`;
  });
}

export function renderEmailTemplate(template: EmailTemplateRecord, context: EmailTemplateContext) {
  return {
    subject: renderEmailTemplateText(template.subject_template, context, { missingMode: "friendly" }),
    body: renderEmailTemplateText(template.body_template, context, { missingMode: "friendly" }),
    to: renderEmailTemplateText(template.default_to || "", context, { missingMode: "blank" }),
    cc: renderEmailTemplateText(template.default_cc || "", context, { missingMode: "blank" }),
    bcc: renderEmailTemplateText(template.default_bcc || "", context, { missingMode: "blank" }),
    fromLabel: renderEmailTemplateText(template.default_from_label || "", context, { missingMode: "friendly" }),
  };
}

export function findEmailTemplate(
  templates: EmailTemplateRecord[],
  category: string,
  fallbackName?: string
) {
  const normalizedCategory = category.trim().toLowerCase();
  const normalizedName = (fallbackName || "").trim().toLowerCase();
  return (
    templates.find(
      (template) =>
        template.is_active !== false &&
        String(template.category || "").trim().toLowerCase() === normalizedCategory &&
        (!normalizedName || template.name.trim().toLowerCase() === normalizedName)
    ) ||
    templates.find(
      (template) =>
        template.is_active !== false &&
        normalizedName &&
        template.name.trim().toLowerCase() === normalizedName
    ) ||
    null
  );
}
