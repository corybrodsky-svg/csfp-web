import { describe, expect, it } from "vitest";
import {
  dedupeOpenShiftOfferRows,
  getOpenShiftRecipientCount,
  getOpenShiftResponseReceivedCount,
  getOpenShiftResponseTotal,
  parseOpenShiftOfferMetadata,
  parseOpenShiftSelectedSpIds,
} from "./spOpenShiftOffers";

const metadataBlock = (selectedSpIds: string[], status = "sent") =>
  [
    "[CFSP_SHIFT_POLL_METADATA]",
    "pollMethod: cfsp",
    `cfspPollStatus: ${status}`,
    `cfspSelectedSpIds: ${encodeURIComponent(selectedSpIds.join(","))}`,
    "[/CFSP_SHIFT_POLL_METADATA]",
  ].join("\n");

describe("SP open shift offer display helpers", () => {
  it("dedupes repeated open shift records by event schedule and outreach scope", () => {
    const older = {
      id: "opening-old",
      event_id: "event-123",
      organization_id: "org-123",
      shift_date: "2026-07-30",
      start_time: "08:00:00",
      end_time: "10:00:00",
      location: "Main Campus",
      room: "Room 1",
      status: "open",
      visibility: "portal_and_email",
      notes: metadataBlock(["sp-1", "sp-2"]),
      created_at: "2026-07-07T12:00:00.000Z",
      updated_at: "2026-07-07T12:00:00.000Z",
    };
    const latest = {
      ...older,
      id: "opening-latest",
      title: "Repeated click result",
      updated_at: "2026-07-07T12:05:00.000Z",
    };

    expect(dedupeOpenShiftOfferRows([older, latest], (row) => row)).toEqual([latest]);
  });

  it("keeps selected recipients separate from outreach responses", () => {
    const selectedSpIds = Array.from({ length: 25 }, (_, index) => `sp-${index + 1}`);
    const metadata = parseOpenShiftOfferMetadata(metadataBlock(selectedSpIds));
    const metadataSelectedCount = parseOpenShiftSelectedSpIds(metadata.cfspSelectedSpIds).length;
    const counts = {
      no_response: 0,
      available: 0,
      accepted: 0,
      maybe: 0,
      declined: 0,
      withdrawn: 0,
    };

    expect(metadataSelectedCount).toBe(25);
    expect(getOpenShiftRecipientCount({ counts, metadataSelectedCount })).toBe(25);
    expect(getOpenShiftResponseTotal(counts)).toBe(0);
    expect(getOpenShiftResponseReceivedCount(counts)).toBe(0);
  });
});
