import { describe, expect, it } from "vitest";

import {
  buildTrainingMetadataPatch,
  getMetadataAliasValue,
  parseRawTrainingMetadataAliases,
  resolveEventSetupParsedSpNeeded,
  resolveEventSetupSpNeededInput,
} from "./EventSetupForm";
import { emptyTrainingEventMetadata, parseTrainingEventMetadata } from "../lib/trainingEventNotes";

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

  it("hydrates prebrief aliases into canonical metadata fields", () => {
    const metadata = parseTrainingEventMetadata(`
[CFSP_TRAINING_METADATA]
include_prebrief: yes
prebrief_minutes: 15
prebrief_room: 8W04
[/CFSP_TRAINING_METADATA]
`);

    expect(metadata.prebrief_enabled).toBe("yes");
    expect(metadata.prebrief_length_minutes).toBe("15");
    expect(metadata.prebrief_location).toBe("8W04");
  });

  it("hydrates training planning aliases into canonical metadata fields", () => {
    const metadata = parseTrainingEventMetadata(`
[CFSP_TRAINING_METADATA]
requires_training: checked
faculty_training_owner: faculty_led
preferred_training_date: 2026-08-11
preferred_training_start_time: 10:00
preferred_training_end_time: 11:00
zoom_required: true
recording_planned: 1
faculty_availability_unknown: false
request_faculty_availability: unchecked
[/CFSP_TRAINING_METADATA]
`);

    expect(metadata.training_required).toBe("checked");
    expect(metadata.training_ownership).toBe("faculty_led");
    expect(metadata.training_date).toBe("2026-08-11");
    expect(metadata.training_start_time).toBe("10:00");
    expect(metadata.training_end_time).toBe("11:00");
    expect(metadata.training_zoom_required).toBe("true");
    expect(metadata.training_recording_planned).toBe("1");
    expect(metadata.training_faculty_availability_unknown).toBe("false");
    expect(metadata.training_request_faculty_availability).toBe("unchecked");
  });

  it("allows explicit false metadata values without wiping related preserved values", () => {
    const initial = {
      ...emptyTrainingEventMetadata(),
      prebrief_enabled: "true",
      prebrief_length_minutes: "15",
      prebrief_location: "8W04",
      training_zoom_required: "yes",
      training_recording_planned: "yes",
    };

    expect(
      buildTrainingMetadataPatch({
        initialMetadata: initial,
        nextMetadata: {
          prebrief_enabled: "false",
          prebrief_length_minutes: "",
          prebrief_location: "",
          training_zoom_required: "no",
          training_recording_planned: "no",
        },
      })
    ).toEqual({
      prebrief_enabled: "false",
      training_zoom_required: "no",
      training_recording_planned: "no",
    });
  });

  it("hydrates SPs Needed from events.sp_needed before legacy aliases", () => {
    expect(
      resolveEventSetupSpNeededInput({
        eventSpNeeded: 6,
        metadata: { sp_needed: "2", staffing_target: "3" },
        rawMetadata: { sp_target: "4" },
        notes: "SPs Needed: 5",
      })
    ).toBe("6");
  });

  it("falls back to legacy SP target aliases only when events.sp_needed is missing", () => {
    expect(
      resolveEventSetupSpNeededInput({
        eventSpNeeded: null,
        metadata: { staffing_target: "4" },
        rawMetadata: { sp_target: "5" },
        notes: "SPs Needed: 6",
      })
    ).toBe("4");
  });

  it("uses the edited SPs Needed input for the saved PATCH value", () => {
    expect(
      resolveEventSetupParsedSpNeeded({
        spNeededInput: "7",
        calculatedSpNeeded: 2,
        needsSpStaffing: true,
      })
    ).toBe(7);
  });

  it("does not let non-SP derived defaults overwrite an explicit nonzero SP target", () => {
    expect(
      resolveEventSetupParsedSpNeeded({
        spNeededInput: "5",
        calculatedSpNeeded: 0,
        needsSpStaffing: false,
      })
    ).toBe(5);
  });

  it("keeps blank required staffing editable while resolving to the calculated target", () => {
    expect(
      resolveEventSetupParsedSpNeeded({
        spNeededInput: "",
        calculatedSpNeeded: 3,
        needsSpStaffing: true,
      })
    ).toBe(3);
  });
});
