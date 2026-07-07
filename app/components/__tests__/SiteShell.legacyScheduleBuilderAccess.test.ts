import { describe, expect, it } from "vitest";
import { getVisibleSiteShellNavItems } from "../SiteShell";

describe("SiteShell legacy Schedule Builder navigation", () => {
  it("shows the global Schedule Builder nav item to platform owners", () => {
    const items = getVisibleSiteShellNavItems("super_admin", {
      isPlatformOwner: true,
      role: "platform_owner",
      legacyRole: "super_admin",
    });

    expect(items.some((item) => item.href === "/schedule-builder")).toBe(true);
  });

  it("hides the global Schedule Builder nav item from sandbox sim ops", () => {
    const items = getVisibleSiteShellNavItems("sim_op", {
      isPlatformOwner: false,
      role: "sim_ops",
      legacyRole: "sim_op",
      activeOrganization: {
        id: "org-sandbox",
        name: "CFSP Demo Sandbox",
        slug: "cfsp-demo-sandbox",
      },
    });

    expect(items.some((item) => item.href === "/schedule-builder")).toBe(false);
  });

  it("hides the global Schedule Builder nav item from regular organization admins", () => {
    const items = getVisibleSiteShellNavItems("admin", {
      isPlatformOwner: false,
      role: "org_admin",
      legacyRole: "admin",
    });

    expect(items.some((item) => item.href === "/schedule-builder")).toBe(false);
  });
});
