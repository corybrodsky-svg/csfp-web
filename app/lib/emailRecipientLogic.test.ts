import { describe, expect, it } from "vitest";
import { getAvailabilityPollClosedRecipients } from "./emailRecipientLogic";

describe("getAvailabilityPollClosedRecipients", () => {
  it("returns original poll recipients minus hired or selected SPs", () => {
    const recipients = getAvailabilityPollClosedRecipients({
      originalPollRecipients: [
        { id: "A", email: "a@example.com" },
        { id: "B", email: "b@example.com" },
        { id: "C", email: "c@example.com" },
        { id: "D", email: "d@example.com" },
        { id: "E", email: "e@example.com" },
        { id: "F", email: "f@example.com" },
        { id: "G", email: "g@example.com" },
        { id: "H", email: "h@example.com" },
        { id: "I", email: "i@example.com" },
        { id: "J", email: "j@example.com" },
      ],
      hiredSelectedSPs: [
        { id: "A", email: "a@example.com" },
        { id: "C", email: "c@example.com" },
        { id: "F", email: "f@example.com" },
      ],
    });

    expect(recipients.map((recipient) => recipient.email)).toEqual([
      "b@example.com",
      "d@example.com",
      "e@example.com",
      "g@example.com",
      "h@example.com",
      "i@example.com",
      "j@example.com",
    ]);
  });

  it("dedupes original recipients and excludes hired matches by email when IDs are unavailable", () => {
    const recipients = getAvailabilityPollClosedRecipients({
      originalPollRecipients: [
        { id: "1", email: "One@Example.com" },
        { id: "1", email: "one@example.com" },
        { email: "two@example.com" },
        { email: "TWO@example.com" },
        { email: "three@example.com" },
      ],
      hiredSelectedSPs: [
        { email: "THREE@example.com" },
      ],
    });

    expect(recipients.map((recipient) => recipient.email)).toEqual([
      "One@Example.com",
      "two@example.com",
    ]);
  });

  it("does not fall back to hired SPs when every poll recipient was hired", () => {
    const recipients = getAvailabilityPollClosedRecipients({
      originalPollRecipients: [
        { id: "1", email: "one@example.com" },
        { id: "2", email: "two@example.com" },
      ],
      hiredSelectedSPs: [
        { id: "1", email: "one@example.com" },
        { id: "2", email: "two@example.com" },
      ],
    });

    expect(recipients).toEqual([]);
  });
});
