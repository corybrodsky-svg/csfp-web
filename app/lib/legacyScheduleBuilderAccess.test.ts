import { describe, expect, it } from "vitest";
import {
  canAccessLegacyGlobalScheduleBuilder,
  getLegacyGlobalScheduleBuilderUnavailableHref,
} from "./legacyScheduleBuilderAccess";

describe("legacy global Schedule Builder access", () => {
  it("allows platform owners to access the legacy global builder", () => {
    expect(canAccessLegacyGlobalScheduleBuilder({ isPlatformOwner: true, role: "platform_owner" })).toBe(true);
  });

  it("blocks sandbox sim ops from direct-accessing the legacy global builder", () => {
    const sandboxSimOp = {
      isPlatformOwner: false,
      role: "sim_ops",
      legacyRole: "sim_op",
      activeOrganization: { slug: "cfsp-demo-sandbox" },
    };

    expect(canAccessLegacyGlobalScheduleBuilder(sandboxSimOp)).toBe(false);
    expect(getLegacyGlobalScheduleBuilderUnavailableHref(sandboxSimOp)).toBe("/events");
  });

  it("blocks regular organization users and legacy super admins unless they are platform owners", () => {
    expect(canAccessLegacyGlobalScheduleBuilder({ isPlatformOwner: false, role: "org_admin", legacyRole: "admin" })).toBe(false);
    expect(canAccessLegacyGlobalScheduleBuilder({ isPlatformOwner: false, role: "sim_ops", legacyRole: "super_admin" })).toBe(false);
  });
});
