import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import StaffingOverviewDisclosure from "../StaffingOverviewDisclosure";

function StaffingOverviewHarness() {
  const [open, setOpen] = useState(false);

  return (
    <StaffingOverviewDisclosure
      open={open}
      onOpenChange={setOpen}
      metrics={[
        { label: "Needed", value: 7 },
        { label: "Selected", value: 6 },
        { label: "Confirmed", value: 6 },
        { label: "Primary", value: 6 },
        { label: "Backup", value: 0 },
      ]}
      selectedSps={[{ id: "sp-1", name: "Alex Hart", detail: "alex@example.edu", status: "Selected primary" }]}
      confirmedSps={[{ id: "sp-1", name: "Alex Hart", detail: "alex@example.edu", status: "Confirmed primary" }]}
      backupSps={[]}
      remainingGaps={["0 primary still needed", "1 backup still needed"]}
      blockers={["1 backup still needed"]}
      nextAction="Review backup coverage."
      backupStatus="0/1 backup selected"
      buttonStyle={{}}
      activeButtonStyle={{}}
    />
  );
}

describe("StaffingOverviewDisclosure", () => {
  it("opens a visible staffing overview when the button is clicked", () => {
    render(<StaffingOverviewHarness />);

    expect(screen.queryByRole("region", { name: "Staffing Overview" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open Staffing Overview" }));

    expect(screen.getByRole("region", { name: "Staffing Overview" })).toBeTruthy();
    expect(screen.getByText("Needed")).toBeTruthy();
    expect(screen.getByText("Selected / staged SPs")).toBeTruthy();
    expect(screen.getAllByText("Alex Hart").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 backup still needed").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Hide Staffing Overview" })).toBeTruthy();
  });
});
