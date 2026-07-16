import { describe, expect, it } from "vitest";
import {
  buildStaffPatchPayload,
  filterPeopleAccessMembers,
  getPeopleAccessRoleLabel,
  getSpLinkReviewQueue,
  getSpLinkStatusLabel,
  memberNeedsPeopleAccessAttention,
  normalizePeopleAccessRole,
} from "./peopleAccess";

const members = [
  {
    id: "user-sp-linked",
    full_name: "Avery Linked",
    email: "avery@example.edu",
    organization_role: "sp",
    status: "active",
    schedule_match_name: "Avery",
    sp_link_status: "linked",
    sp_link_name: "Avery SP",
  },
  {
    id: "user-sp-review",
    full_name: "Blake Review",
    email: "blake@example.edu",
    organization_role: "sp",
    status: "active",
    schedule_match_name: "Blake",
    sp_link_status: "multiple_matches",
  },
  {
    id: "user-faculty",
    full_name: "Casey Faculty",
    email: "casey@example.edu",
    organization_role: "faculty",
    status: "active",
    schedule_match_name: "",
    sp_link_status: "",
  },
  {
    id: "user-suspended",
    full_name: "Drew Suspended",
    email: "drew@example.edu",
    organization_role: "viewer",
    status: "suspended",
    schedule_match_name: "",
    sp_link_status: "",
  },
];

describe("People & Access helpers", () => {
  it("normalizes canonical organization roles without converting viewer to faculty", () => {
    expect(normalizePeopleAccessRole("admin")).toBe("org_admin");
    expect(normalizePeopleAccessRole("sim_op")).toBe("sim_ops");
    expect(normalizePeopleAccessRole("viewer")).toBe("viewer");
    expect(getPeopleAccessRoleLabel("viewer")).toBe("Viewer");
  });

  it("uses explicit SP link labels", () => {
    expect(getSpLinkStatusLabel("linked", "sp")).toBe("Linked to SP Database");
    expect(getSpLinkStatusLabel("multiple_matches", "sp")).toBe("Multiple possible SP records");
    expect(getSpLinkStatusLabel("invalid_organization", "sp")).toBe("SP link invalid for this organization");
    expect(getSpLinkStatusLabel("", "faculty")).toBe("Not applicable");
  });

  it("filters members by role, status, SP link status, search, and attention state", () => {
    expect(filterPeopleAccessMembers(members, { role: "sp" }).map((member) => member.id)).toEqual([
      "user-sp-linked",
      "user-sp-review",
    ]);
    expect(filterPeopleAccessMembers(members, { status: "suspended" }).map((member) => member.id)).toEqual([
      "user-suspended",
    ]);
    expect(filterPeopleAccessMembers(members, { spLinkStatus: "multiple_matches" }).map((member) => member.id)).toEqual([
      "user-sp-review",
    ]);
    expect(filterPeopleAccessMembers(members, { search: "casey" }).map((member) => member.id)).toEqual([
      "user-faculty",
    ]);
    expect(filterPeopleAccessMembers(members, { needsAttention: true }).map((member) => member.id)).toEqual([
      "user-sp-review",
      "user-suspended",
    ]);
  });

  it("selects the SP link review queue from unresolved SP members only", () => {
    expect(getSpLinkReviewQueue(members).map((member) => member.id)).toEqual(["user-sp-review"]);
    expect(memberNeedsPeopleAccessAttention(members[0])).toBe(false);
    expect(memberNeedsPeopleAccessAttention(members[1])).toBe(true);
  });

  it("builds staff PATCH payloads with canonical role and SP ids", () => {
    expect(buildStaffPatchPayload({ userId: "user-1", action: "change_role", role: "sim_op" })).toEqual({
      user_id: "user-1",
      action: "change_role",
      role: "sim_ops",
    });
    expect(buildStaffPatchPayload({ userId: "user-1", action: "link_sp", spId: "sp-1" })).toEqual({
      user_id: "user-1",
      action: "link_sp",
      sp_id: "sp-1",
    });
  });
});
