import { describe, expect, it } from "vitest";
import {
  chooseLatestSpLifecycleRow,
  getSpLifecyclePersonKey,
  shouldShowInMainSpLifecycleRoster,
} from "./spLifecycleRoster";

describe("SP lifecycle roster rules", () => {
  it("keeps contact-only no-response outreach recipients out of the main roster", () => {
    const contactedNoResponseRecipients = Array.from({ length: 25 }, (_, index) => ({
      spId: `sp-${index + 1}`,
      responseBucket: "no_response",
      hasAssignment: false,
      selectedForHireConfirmation: false,
      hasImportedResponse: false,
    }));

    expect(
      contactedNoResponseRecipients.filter((recipient) =>
        shouldShowInMainSpLifecycleRoster(recipient)
      )
    ).toHaveLength(0);
  });

  it("keeps operationally relevant SPs in the main roster", () => {
    expect(shouldShowInMainSpLifecycleRoster({ hasAssignment: true, responseBucket: "no_response" })).toBe(true);
    expect(shouldShowInMainSpLifecycleRoster({ selectedForHireConfirmation: true, responseBucket: "no_response" })).toBe(true);
    expect(shouldShowInMainSpLifecycleRoster({ responseBucket: "available" })).toBe(true);
    expect(shouldShowInMainSpLifecycleRoster({ responseBucket: "maybe" })).toBe(true);
    expect(shouldShowInMainSpLifecycleRoster({ responseBucket: "declined" })).toBe(true);
    expect(shouldShowInMainSpLifecycleRoster({ pollResponseStatus: "not_available" })).toBe(true);
  });

  it("uses stable identity for outreach recipient display dedupe", () => {
    expect(getSpLifecyclePersonKey({ spId: "sp-123", email: "eli@example.edu", name: "Eli Walker" })).toBe("sp:sp-123");
    expect(getSpLifecyclePersonKey({ email: "ELI@EXAMPLE.EDU", name: "Eli Walker" })).toBe("email:eli@example.edu");
    expect(getSpLifecyclePersonKey({ name: "Eli Walker" })).toBe("name:eli walker");
  });

  it("chooses the latest outreach row when the same SP is contacted more than once", () => {
    const current = {
      row: { openingTitle: "Older outreach", responseStatus: "No response" },
      timestamp: "2026-07-01T10:00:00.000Z",
    };
    const latest = chooseLatestSpLifecycleRow(current, {
      row: { openingTitle: "Latest outreach", responseStatus: "Available" },
      timestamp: "2026-07-02T10:00:00.000Z",
    });

    expect(latest.row).toEqual({ openingTitle: "Latest outreach", responseStatus: "Available" });
  });
});
