"use client";

import EventScheduleBuilder from "../components/EventScheduleBuilder";
import SiteShell from "../components/SiteShell";

export default function ScheduleBuilderPage() {
  return (
    <SiteShell
      title="Build Schedule"
      subtitle="Select a CFSP event and build a full-day learner session schedule in 12-hour time."
    >
      <EventScheduleBuilder />
    </SiteShell>
  );
}
