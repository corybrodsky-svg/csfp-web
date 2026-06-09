import { describe, expect, it } from "vitest";

import {
  buildTrainingMetadataPatch,
  getMetadataAliasValue,
  parseRawTrainingMetadataAliases,
} from "./EventSetupForm";
import { emptyTrainingEventMetadata } from "../lib/trainingEventNotes";

describe("EventSetupForm metadata hydration", () => {
  it("reads legacy metadata aliases for visible edit fields", () => {
    const raw = parseRawTrainingMetadataAliases(`
[CFSP_TRAINING_METADATA]
event_zoom_url: https://zoom.example/event
training_zoom_url: https://zoom.example/training
sim_lead: Sim Lead Name
course_faculty: Faculty Name
faculty_email: faculty@example.edu
[/CFSP_TRAINING_METADATA]
Human notes
`);

    expect(getMetadataAliasValue(raw, ["event_zoom_url", "zoom_url"])).toBe("https://zoom.example/event");
    expect(getMetadataAliasValue(raw, ["training_zoom_url", "training_zoom_link"])).toBe("https://zoom.example/training");
    expect(getMetadataAliasValue(raw, ["sim_lead", "sim_contact"])).toBe("Sim Lead Name");
    expect(getMetadataAliasValue(raw, ["course_faculty", "faculty_names"])).toBe("Faculty Name");
    expect(getMetadataAliasValue(raw, ["faculty_email"])).toBe("faculty@example.edu");
  });

  it("does not generate blank metadata patches over existing saved values", () => {
    const initial = {
      ...emptyTrainingEventMetadata(),
      zoom_url: "https://zoom.example/event",
      faculty_email: "faculty@example.edu",
      schedule_learner_count: "42",
    };

    expect(
      buildTrainingMetadataPatch({
        initialMetadata: initial,
        nextMetadata: {
          zoom_url: "",
          faculty_email: "",
          schedule_learner_count: "",
          schedule_room_count: "14",
        },
      })
    ).toEqual({
      schedule_room_count: "14",
    });
  });
});
