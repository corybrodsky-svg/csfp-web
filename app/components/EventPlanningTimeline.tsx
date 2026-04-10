"use client";

type EventPlanningTimelineProps = {
  eventDateLabel: string;
  summaryTimeLabel: string;
};

const sectionStyle: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: "18px",
  padding: "16px",
  background: "#f8fbff",
  marginBottom: "14px",
};

const stepStyle: React.CSSProperties = {
  position: "relative",
  paddingLeft: "22px",
  paddingBottom: "14px",
  borderLeft: "2px solid #bfdbfe",
  marginLeft: "8px",
};

const dotStyle: React.CSSProperties = {
  position: "absolute",
  left: "-7px",
  top: "2px",
  width: "12px",
  height: "12px",
  borderRadius: "999px",
  background: "#173b6c",
  boxShadow: "0 0 0 3px #dbeafe",
};

function buildTimeline(eventDateLabel: string, summaryTimeLabel: string) {
  const eventDayLabel = eventDateLabel || "Event day";

  return [
    {
      title: "Handoff / Team Meeting #1",
      timing: "Within 1 business day after handoff",
      tasks: ["Confirm session scope", "Assign lead roles"],
    },
    {
      title: "Hire SPs",
      timing: "Within 1 week after handoff",
      tasks: ["Poll and confirm SPs", "Close open staffing gaps"],
    },
    {
      title: "Order Supplies",
      timing: "6-8 weeks before event",
      tasks: ["Order only if needed", "Track special equipment"],
    },
    {
      title: "Team Meeting #2",
      timing: "1 week before SP training",
      tasks: ["Verify SP confirmations", "Review training materials", "Check supplies and build readiness"],
    },
    {
      title: "Session Build Complete",
      timing: "Before event sessions are finalized",
      tasks: ["Finish build and test session", "Resolve missing details"],
    },
    {
      title: "Prep Email for SP Training",
      timing: "48 business hours before training",
      tasks: ["Send prep email", "Attach training materials"],
    },
    {
      title: "Team Meeting #3",
      timing: "Within 1 business day after SP training",
      tasks: ["Capture training issues", "Finalize day-of assignments"],
    },
    {
      title: "Day-Before Setup",
      timing: eventDateLabel ? `Day before ${eventDayLabel}` : "Day before event",
      tasks: ["Set up SPL rooms", "Confirm room-by-room readiness"],
    },
    {
      title: "Event Day Operations",
      timing: eventDateLabel ? `${eventDayLabel}${summaryTimeLabel && summaryTimeLabel !== "Time TBD" ? ` · ${summaryTimeLabel}` : ""}` : "Event day",
      tasks: ["Staff and SP arrival", "Prebrief and session start", "Support live operations"],
    },
    {
      title: "Reset / Wrap-Up",
      timing: eventDateLabel ? `After ${eventDayLabel}` : "After event",
      tasks: ["Reset SPL", "Capture follow-up items"],
    },
  ];
}

export default function EventPlanningTimeline({
  eventDateLabel,
  summaryTimeLabel,
}: EventPlanningTimelineProps) {
  const steps = buildTimeline(eventDateLabel, summaryTimeLabel);

  return (
    <section style={sectionStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, color: "#173b6c", fontSize: "22px" }}>Planning Timeline</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontWeight: 700, fontSize: "13px" }}>
            Draft milestone view based on the SPL Session Details planning template.
          </p>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: "999px",
            padding: "6px 10px",
            background: "#eff6ff",
            border: "1px solid #93c5fd",
            color: "#1d4ed8",
            fontWeight: 900,
            fontSize: "12px",
          }}
        >
          Planning Aid
        </span>
      </div>

      <div style={{ display: "grid", gap: "2px", marginTop: "14px" }}>
        {steps.map((step, index) => (
          <div
            key={step.title}
            style={{
              ...stepStyle,
              paddingBottom: index === steps.length - 1 ? 0 : "14px",
              borderLeft: index === steps.length - 1 ? "2px solid transparent" : stepStyle.borderLeft,
            }}
          >
            <span style={dotStyle} aria-hidden="true" />
            <div style={{ color: "#173b6c", fontWeight: 900 }}>{step.title}</div>
            <div style={{ marginTop: "3px", color: "#64748b", fontWeight: 800, fontSize: "13px" }}>
              {step.timing}
            </div>
            <ul style={{ margin: "8px 0 0", paddingLeft: "18px", color: "#334155", lineHeight: 1.6 }}>
              {step.tasks.map((task) => (
                <li key={task}>{task}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
