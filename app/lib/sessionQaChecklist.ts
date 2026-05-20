const QA_CHECKLIST_CONFIG_START = "[CFSP_QA_CHECKLIST_CONFIG]";
const QA_CHECKLIST_CONFIG_END = "[/CFSP_QA_CHECKLIST_CONFIG]";
const QA_CHECKLIST_STATE_START = "[CFSP_QA_CHECKLIST_STATE]";
const QA_CHECKLIST_STATE_END = "[/CFSP_QA_CHECKLIST_STATE]";

export type SessionChecklistSection = "planning" | "day_of";
export type SessionChecklistDueAnchor = "training_date" | "event_date" | "event_start" | "event_end";
export type SessionChecklistOffsetUnit = "minutes" | "hours" | "days";
export type SessionChecklistOffsetDirection = "before" | "after";
export type SessionChecklistStatus = "complete" | "upcoming" | "due_soon" | "overdue" | "date_needed";

export type SessionChecklistTaskConfig = {
  taskId: string;
  section: SessionChecklistSection;
  label: string;
  dueAnchor: SessionChecklistDueAnchor;
  offsetValue: number;
  offsetUnit: SessionChecklistOffsetUnit;
  offsetDirection: SessionChecklistOffsetDirection;
  active: boolean;
  owner: string;
  notes: string;
  sortOrder: number;
  required: boolean;
};

export type SessionChecklistTaskState = {
  taskId: string;
  completed: boolean;
  completedAt: string;
  completedBy: string;
  notes: string;
};

export type SessionChecklistStateMap = Record<string, SessionChecklistTaskState>;

export type SessionChecklistResolvedTask = SessionChecklistTaskConfig & {
  dueRuleLabel: string;
  dueAt: Date | null;
  dueAtLabel: string;
  status: SessionChecklistStatus;
  statusLabel: string;
  completed: boolean;
  completedAt: string;
  completedBy: string;
};

export type SessionChecklistSummary = {
  planningComplete: number;
  planningTotal: number;
  dayOfComplete: number;
  dayOfTotal: number;
  overdueCount: number;
  dueSoonCount: number;
  nextDueLabel: string;
  statusLabel: string;
  statusDetail: string;
};

export type SessionChecklistBuildResult = {
  tasks: SessionChecklistResolvedTask[];
  planning: SessionChecklistResolvedTask[];
  dayOf: SessionChecklistResolvedTask[];
  summary: SessionChecklistSummary;
};

export type SessionChecklistAnchors = {
  trainingDate?: Date | null;
  eventDate?: Date | null;
  eventStart?: Date | null;
  eventEnd?: Date | null;
  now?: Date;
  dueSoonHours?: number;
};

type RawChecklistTaskConfig = Partial<SessionChecklistTaskConfig> & { id?: unknown };

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeOffsetUnit(value: unknown): SessionChecklistOffsetUnit {
  const normalized = asText(value).toLowerCase();
  if (normalized === "minute" || normalized === "minutes") return "minutes";
  if (normalized === "hour" || normalized === "hours") return "hours";
  return "days";
}

function normalizeOffsetDirection(value: unknown): SessionChecklistOffsetDirection {
  const normalized = asText(value).toLowerCase();
  return normalized === "after" ? "after" : "before";
}

function normalizeDueAnchor(value: unknown): SessionChecklistDueAnchor {
  const normalized = asText(value).toLowerCase();
  if (normalized === "training_date") return "training_date";
  if (normalized === "event_start") return "event_start";
  if (normalized === "event_end") return "event_end";
  return "event_date";
}

function normalizeSection(value: unknown): SessionChecklistSection {
  const normalized = asText(value).toLowerCase();
  return normalized === "day_of" ? "day_of" : "planning";
}

function normalizeConfigTask(task: RawChecklistTaskConfig, index: number): SessionChecklistTaskConfig {
  const taskId =
    asText(task.taskId || task.id) ||
    `qa-task-${index + 1}`;
  const offsetValueRaw = Number(task.offsetValue);
  const offsetValue = Number.isFinite(offsetValueRaw) ? Math.max(0, Math.floor(offsetValueRaw)) : 0;
  const activeText = asText(task.active).toLowerCase();
  const requiredText = asText(task.required).toLowerCase();
  return {
    taskId,
    section: normalizeSection(task.section),
    label: asText(task.label) || "Untitled task",
    dueAnchor: normalizeDueAnchor(task.dueAnchor),
    offsetValue,
    offsetUnit: normalizeOffsetUnit(task.offsetUnit),
    offsetDirection: normalizeOffsetDirection(task.offsetDirection),
    active:
      typeof task.active === "boolean"
        ? task.active
        : activeText
          ? activeText !== "false" && activeText !== "no" && activeText !== "0"
          : true,
    owner: asText(task.owner),
    notes: asText(task.notes),
    sortOrder: Number.isFinite(Number(task.sortOrder)) ? Number(task.sortOrder) : index,
    required:
      typeof task.required === "boolean"
        ? task.required
        : requiredText
          ? requiredText !== "false" && requiredText !== "no" && requiredText !== "0"
          : true,
  };
}

function normalizeStateTask(value: unknown, fallbackTaskId: string): SessionChecklistTaskState | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const completedText = asText(record.completed).toLowerCase();
  const completed =
    typeof record.completed === "boolean"
      ? record.completed
      : completedText === "true" || completedText === "yes" || completedText === "1";
  return {
    taskId: asText(record.taskId) || fallbackTaskId,
    completed,
    completedAt: asText(record.completedAt),
    completedBy: asText(record.completedBy),
    notes: asText(record.notes),
  };
}

function readMetadataBlock(notes: string | null | undefined, start: string, end: string) {
  const text = asText(notes);
  if (!text) return "";
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return "";
  return text.slice(startIndex + start.length, endIndex).trim();
}

function replaceMetadataBlock(
  notes: string | null | undefined,
  start: string,
  end: string,
  serializedValue: string
) {
  const text = asText(notes);
  const escapedStart = start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withoutExisting = text
    .replace(new RegExp(`\\n?${escapedStart}[\\s\\S]*?${escapedEnd}\\n?`, "g"), "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!serializedValue) return withoutExisting;
  const nextBlock = `${start}\n${serializedValue}\n${end}`;
  return withoutExisting ? `${nextBlock}\n${withoutExisting}` : nextBlock;
}

function parseJsonBlock<T>(notes: string | null | undefined, start: string, end: string): T | null {
  const block = readMetadataBlock(notes, start, end);
  if (!block) return null;
  try {
    return JSON.parse(block) as T;
  } catch {
    return null;
  }
}

function toMinutes(value: number, unit: SessionChecklistOffsetUnit) {
  if (unit === "minutes") return value;
  if (unit === "hours") return value * 60;
  return value * 60 * 24;
}

function formatOffsetLabel(task: SessionChecklistTaskConfig) {
  const anchorLabel =
    task.dueAnchor === "training_date"
      ? "training"
      : task.dueAnchor === "event_start"
        ? "event start"
        : task.dueAnchor === "event_end"
          ? "event end"
          : "event";
  if (task.offsetValue <= 0) {
    if (task.dueAnchor === "event_start" && task.offsetDirection === "before") return "Due before event start";
    if (task.dueAnchor === "event_date") return "Due day of event";
    if (task.dueAnchor === "training_date") return "Due day of training";
    return `Due at ${anchorLabel}`;
  }
  const unitLabel =
    task.offsetUnit === "minutes"
      ? task.offsetValue === 1 ? "minute" : "minutes"
      : task.offsetUnit === "hours"
        ? task.offsetValue === 1 ? "hour" : "hours"
        : task.offsetValue === 1 ? "day" : "days";
  return `Due ${task.offsetValue} ${unitLabel} ${task.offsetDirection} ${anchorLabel}`;
}

function formatDueDateLabel(value: Date | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function resolveAnchorDate(task: SessionChecklistTaskConfig, anchors: SessionChecklistAnchors) {
  if (task.dueAnchor === "training_date") return anchors.trainingDate || null;
  if (task.dueAnchor === "event_start") return anchors.eventStart || null;
  if (task.dueAnchor === "event_end") return anchors.eventEnd || null;
  return anchors.eventDate || null;
}

function withDayBoundary(date: Date, anchor: SessionChecklistDueAnchor) {
  if (anchor === "event_start" || anchor === "event_end") return date;
  const next = new Date(date.getTime());
  next.setHours(9, 0, 0, 0);
  return next;
}

export function getDefaultSessionChecklistConfig() {
  const defaults: Array<Omit<SessionChecklistTaskConfig, "sortOrder">> = [
    {
      taskId: "planning-event-details",
      section: "planning",
      label: "Confirm event date/time/location",
      dueAnchor: "event_date",
      offsetValue: 7,
      offsetUnit: "days",
      offsetDirection: "before",
      active: true,
      owner: "",
      notes: "",
      required: true,
    },
    {
      taskId: "planning-training-details",
      section: "planning",
      label: "Confirm training date/time/Zoom",
      dueAnchor: "training_date",
      offsetValue: 7,
      offsetUnit: "days",
      offsetDirection: "before",
      active: true,
      owner: "",
      notes: "",
      required: true,
    },
    {
      taskId: "planning-upload-materials",
      section: "planning",
      label: "Upload case materials",
      dueAnchor: "event_date",
      offsetValue: 3,
      offsetUnit: "days",
      offsetDirection: "before",
      active: true,
      owner: "",
      notes: "",
      required: true,
    },
    {
      taskId: "planning-confirm-sp-roster",
      section: "planning",
      label: "Confirm SP roster",
      dueAnchor: "event_date",
      offsetValue: 48,
      offsetUnit: "hours",
      offsetDirection: "before",
      active: true,
      owner: "",
      notes: "",
      required: true,
    },
    {
      taskId: "planning-send-sp-prep-email",
      section: "planning",
      label: "Send SP prep email",
      dueAnchor: "event_date",
      offsetValue: 48,
      offsetUnit: "hours",
      offsetDirection: "before",
      active: true,
      owner: "",
      notes: "",
      required: true,
    },
    {
      taskId: "planning-send-training-invite",
      section: "planning",
      label: "Send training invite",
      dueAnchor: "training_date",
      offsetValue: 48,
      offsetUnit: "hours",
      offsetDirection: "before",
      active: true,
      owner: "",
      notes: "",
      required: true,
    },
    {
      taskId: "planning-confirm-faculty",
      section: "planning",
      label: "Confirm faculty contact",
      dueAnchor: "event_date",
      offsetValue: 5,
      offsetUnit: "days",
      offsetDirection: "before",
      active: true,
      owner: "",
      notes: "",
      required: true,
    },
    {
      taskId: "planning-confirm-learners",
      section: "planning",
      label: "Confirm learner roster",
      dueAnchor: "event_date",
      offsetValue: 48,
      offsetUnit: "hours",
      offsetDirection: "before",
      active: true,
      owner: "",
      notes: "",
      required: true,
    },
    {
      taskId: "planning-recording-setup",
      section: "planning",
      label: "Confirm recording/SimIQ setup",
      dueAnchor: "event_start",
      offsetValue: 24,
      offsetUnit: "hours",
      offsetDirection: "before",
      active: true,
      owner: "",
      notes: "",
      required: false,
    },
    {
      taskId: "planning-review-materials",
      section: "planning",
      label: "Review materials",
      dueAnchor: "event_start",
      offsetValue: 24,
      offsetUnit: "hours",
      offsetDirection: "before",
      active: true,
      owner: "",
      notes: "",
      required: true,
    },
    {
      taskId: "dayof-open-zoom-tech",
      section: "day_of",
      label: "Open Zoom / room tech check",
      dueAnchor: "event_start",
      offsetValue: 30,
      offsetUnit: "minutes",
      offsetDirection: "before",
      active: true,
      owner: "",
      notes: "",
      required: true,
    },
    {
      taskId: "dayof-confirm-sp-arrivals",
      section: "day_of",
      label: "Confirm SP arrivals",
      dueAnchor: "event_start",
      offsetValue: 10,
      offsetUnit: "minutes",
      offsetDirection: "before",
      active: true,
      owner: "",
      notes: "",
      required: true,
    },
    {
      taskId: "dayof-confirm-learner-arrivals",
      section: "day_of",
      label: "Confirm learner arrivals",
      dueAnchor: "event_start",
      offsetValue: 5,
      offsetUnit: "minutes",
      offsetDirection: "before",
      active: true,
      owner: "",
      notes: "",
      required: true,
    },
    {
      taskId: "dayof-verify-case-files",
      section: "day_of",
      label: "Verify case files are accessible",
      dueAnchor: "event_start",
      offsetValue: 15,
      offsetUnit: "minutes",
      offsetDirection: "before",
      active: true,
      owner: "",
      notes: "",
      required: true,
    },
    {
      taskId: "dayof-confirm-room-assignments",
      section: "day_of",
      label: "Confirm room assignments",
      dueAnchor: "event_start",
      offsetValue: 10,
      offsetUnit: "minutes",
      offsetDirection: "before",
      active: true,
      owner: "",
      notes: "",
      required: true,
    },
    {
      taskId: "dayof-start-recording",
      section: "day_of",
      label: "Start recording if applicable",
      dueAnchor: "event_start",
      offsetValue: 0,
      offsetUnit: "minutes",
      offsetDirection: "before",
      active: true,
      owner: "",
      notes: "",
      required: false,
    },
    {
      taskId: "dayof-mark-attendance",
      section: "day_of",
      label: "Mark attendance complete",
      dueAnchor: "event_end",
      offsetValue: 0,
      offsetUnit: "minutes",
      offsetDirection: "before",
      active: true,
      owner: "",
      notes: "",
      required: true,
    },
    {
      taskId: "dayof-post-event-followup",
      section: "day_of",
      label: "Complete post-event follow-up",
      dueAnchor: "event_end",
      offsetValue: 2,
      offsetUnit: "hours",
      offsetDirection: "after",
      active: true,
      owner: "",
      notes: "",
      required: true,
    },
  ];

  return defaults.map((task, index) => ({
    ...task,
    sortOrder: index,
  }));
}

export function parseSessionChecklistConfig(notes?: string | null) {
  const parsed = parseJsonBlock<unknown>(notes, QA_CHECKLIST_CONFIG_START, QA_CHECKLIST_CONFIG_END);
  if (!Array.isArray(parsed)) return [] as SessionChecklistTaskConfig[];
  return parsed
    .map((entry, index) => normalizeConfigTask((entry || {}) as RawChecklistTaskConfig, index))
    .filter((task) => Boolean(task.label));
}

export function getSessionChecklistConfig(notes?: string | null) {
  const parsed = parseSessionChecklistConfig(notes);
  if (!parsed.length) return getDefaultSessionChecklistConfig();
  return [...parsed].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

export function parseSessionChecklistState(notes?: string | null) {
  const parsed = parseJsonBlock<unknown>(notes, QA_CHECKLIST_STATE_START, QA_CHECKLIST_STATE_END);
  if (!parsed || typeof parsed !== "object") return {} as SessionChecklistStateMap;

  const records = parsed as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(records).flatMap(([key, value]) => {
      const normalized = normalizeStateTask(value, key);
      if (!normalized) return [];
      return [[key, normalized]];
    })
  ) as SessionChecklistStateMap;
}

export function serializeSessionChecklistConfig(config: SessionChecklistTaskConfig[]) {
  return JSON.stringify(
    config.map((task, index) => ({
      taskId: task.taskId,
      section: normalizeSection(task.section),
      label: asText(task.label) || "Untitled task",
      dueAnchor: normalizeDueAnchor(task.dueAnchor),
      offsetValue: Math.max(0, Math.floor(Number(task.offsetValue) || 0)),
      offsetUnit: normalizeOffsetUnit(task.offsetUnit),
      offsetDirection: normalizeOffsetDirection(task.offsetDirection),
      active: task.active !== false,
      owner: asText(task.owner),
      notes: asText(task.notes),
      sortOrder: Number.isFinite(Number(task.sortOrder)) ? Number(task.sortOrder) : index,
      required: task.required !== false,
    }))
  );
}

export function serializeSessionChecklistState(state: SessionChecklistStateMap) {
  const compact = Object.fromEntries(
    Object.entries(state).flatMap(([taskId, record]) => {
      if (!record || record.completed !== true) return [];
      return [[
        taskId,
        {
          taskId,
          completed: true,
          completedAt: asText(record.completedAt),
          completedBy: asText(record.completedBy),
          notes: asText(record.notes),
        },
      ]];
    })
  );
  return Object.keys(compact).length ? JSON.stringify(compact) : "";
}

export function upsertSessionChecklistConfigInNotes(
  notes: string | null | undefined,
  config: SessionChecklistTaskConfig[]
) {
  const serialized = config.length ? serializeSessionChecklistConfig(config) : "";
  return replaceMetadataBlock(notes, QA_CHECKLIST_CONFIG_START, QA_CHECKLIST_CONFIG_END, serialized);
}

export function upsertSessionChecklistStateInNotes(
  notes: string | null | undefined,
  state: SessionChecklistStateMap
) {
  const serialized = serializeSessionChecklistState(state);
  return replaceMetadataBlock(notes, QA_CHECKLIST_STATE_START, QA_CHECKLIST_STATE_END, serialized);
}

export function buildSessionChecklist(
  config: SessionChecklistTaskConfig[],
  state: SessionChecklistStateMap,
  anchors: SessionChecklistAnchors
): SessionChecklistBuildResult {
  const now = anchors.now || new Date();
  const dueSoonHours = Number.isFinite(Number(anchors.dueSoonHours))
    ? Math.max(1, Number(anchors.dueSoonHours))
    : 48;
  const dueSoonMs = dueSoonHours * 60 * 60 * 1000;

  const tasks = config
    .filter((task) => task.active !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map((task) => {
      const stateRecord = state[task.taskId];
      const completed = Boolean(stateRecord?.completed);
      const anchorDate = resolveAnchorDate(task, anchors);
      const anchorDateWithBoundary = anchorDate ? withDayBoundary(anchorDate, task.dueAnchor) : null;
      const offsetMinutes = toMinutes(task.offsetValue, task.offsetUnit);
      const direction = task.offsetDirection === "after" ? 1 : -1;
      const dueAt = anchorDateWithBoundary ? new Date(anchorDateWithBoundary.getTime() + direction * offsetMinutes * 60 * 1000) : null;
      let status: SessionChecklistStatus = "upcoming";
      if (completed) {
        status = "complete";
      } else if (!dueAt) {
        status = "date_needed";
      } else if (now.getTime() > dueAt.getTime()) {
        status = "overdue";
      } else if (dueAt.getTime() - now.getTime() <= dueSoonMs) {
        status = "due_soon";
      } else {
        status = "upcoming";
      }
      const statusLabel =
        status === "complete"
          ? "Complete"
          : status === "overdue"
            ? "Overdue"
            : status === "due_soon"
              ? "Due Soon"
              : status === "date_needed"
                ? "Date needed"
                : "Upcoming";

      return {
        ...task,
        dueRuleLabel: formatOffsetLabel(task),
        dueAt,
        dueAtLabel: dueAt ? formatDueDateLabel(dueAt) : "Date needed",
        status,
        statusLabel,
        completed,
        completedAt: asText(stateRecord?.completedAt),
        completedBy: asText(stateRecord?.completedBy),
      } satisfies SessionChecklistResolvedTask;
    });

  const planning = tasks.filter((task) => task.section === "planning");
  const dayOf = tasks.filter((task) => task.section === "day_of");
  const planningComplete = planning.filter((task) => task.completed).length;
  const dayOfComplete = dayOf.filter((task) => task.completed).length;
  const overdueCount = tasks.filter((task) => task.status === "overdue" && task.required !== false).length;
  const dueSoonCount = tasks.filter((task) => task.status === "due_soon" && task.required !== false).length;
  const nextDueTask =
    tasks
      .filter((task) => !task.completed && task.dueAt)
      .sort((a, b) => (a.dueAt?.getTime() || Number.POSITIVE_INFINITY) - (b.dueAt?.getTime() || Number.POSITIVE_INFINITY))[0] || null;
  const planningRequiredTasks = planning.filter((task) => task.required !== false);
  const dayOfRequiredTasks = dayOf.filter((task) => task.required !== false);
  const planningRequiredComplete = planningRequiredTasks.length > 0 && planningRequiredTasks.every((task) => task.completed);
  const dayOfRequiredComplete = dayOfRequiredTasks.length > 0 && dayOfRequiredTasks.every((task) => task.completed);

  let statusLabel = "In Progress";
  let statusDetail = "Session checklist is active.";
  if (overdueCount > 0) {
    statusLabel = "Needs Action";
    statusDetail = `${overdueCount} overdue checklist item${overdueCount === 1 ? "" : "s"}.`;
  } else if (planningRequiredComplete && dayOfRequiredComplete) {
    statusLabel = "Day-of Ready";
    statusDetail = "Planning and day-of checklist items are complete.";
  } else if (planningRequiredComplete) {
    statusLabel = "Planning Ready";
    statusDetail = "Planning checklist is complete.";
  } else if (dueSoonCount > 0) {
    statusLabel = "Due Soon";
    statusDetail = `${dueSoonCount} checklist item${dueSoonCount === 1 ? "" : "s"} due soon.`;
  }

  const summary: SessionChecklistSummary = {
    planningComplete,
    planningTotal: planning.length,
    dayOfComplete,
    dayOfTotal: dayOf.length,
    overdueCount,
    dueSoonCount,
    nextDueLabel: nextDueTask ? `${nextDueTask.label} (${nextDueTask.dueAtLabel})` : "No pending due dates",
    statusLabel,
    statusDetail,
  };

  return {
    tasks,
    planning,
    dayOf,
    summary,
  };
}
