import { describe, expect, it } from "vitest";
import {
  emptyTrainingEventMetadata,
  parseTrainingEventMetadata,
  upsertTrainingEventMetadata,
} from "./trainingEventNotes";

describe("training event metadata", () => {
  it("keeps the event-scoped SP poll builder state in structured notes", () => {
    const pollBuilderState = encodeURIComponent(
      JSON.stringify({
        method: "microsoft_forms",
        status: "poll_sent",
        hiring_process_started: true,
        selected_sp_ids: ["sp-1", "sp-2"],
        selected_emails: ["one@example.com", "two@example.com"],
        poll_url: "https://forms.example/poll",
        sent_at: "2026-06-04T14:00:00.000Z",
      })
    );

    const notes = upsertTrainingEventMetadata("Coordinator notes stay here.", {
      case_name: "Appendicitis",
      sp_poll_builder_state: pollBuilderState,
    });
    const parsed = parseTrainingEventMetadata(notes);

    expect(parsed.case_name).toBe("Appendicitis");
    expect(parsed.sp_poll_builder_state).toBe(pollBuilderState);
    expect(notes).toContain("Coordinator notes stay here.");

    const updated = upsertTrainingEventMetadata(notes, {
      event_material_status: "materials_ready",
    });

    expect(parseTrainingEventMetadata(updated).sp_poll_builder_state).toBe(pollBuilderState);
  });

  it("defaults SP poll builder state to empty", () => {
    expect(emptyTrainingEventMetadata().sp_poll_builder_state).toBe("");
  });
});
