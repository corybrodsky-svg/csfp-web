import { afterEach, describe, expect, it, vi } from "vitest";

const sandboxPortalOne = {
  id: "sp-portal-1",
  first_name: "Sandbox",
  last_name: "Portal One",
  full_name: "Sandbox Portal One",
  working_email: "sp.demo1@conflictfreesp.com",
  email: "sp.demo1@conflictfreesp.com",
  secondary_email: null,
};

async function loadLinkingWithRows(rows: unknown[]) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-test-key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } }))
  );
  return import("./spAccountLinking");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SP account linking", () => {
  it("falls back to email when a saved membership SP id is stale", async () => {
    const { resolveSpAccountLink } = await loadLinkingWithRows([sandboxPortalOne]);

    const link = await resolveSpAccountLink({
      user: {
        id: "user-1",
        email: "sp.demo1@conflictfreesp.com",
        user_metadata: {
          role: "sp",
          sp_id: "stale-sp-id",
          linked_sp_id: "stale-sp-id",
          sp_link_sp_id: "stale-sp-id",
          full_name: "Portal Demo One",
          schedule_name: "Portal Demo One",
        },
      } as never,
      profile: {
        id: "user-1",
        email: "sp.demo1@conflictfreesp.com",
        full_name: "Portal Demo One",
        schedule_name: "Portal Demo One",
        role: "sp",
      } as never,
      organizationId: "org-1",
      membershipSpId: "stale-sp-id",
    });

    expect(link).toMatchObject({
      status: "linked",
      sp_id: "sp-portal-1",
      matched_by: "working_email",
    });
    expect(link.diagnostics?.explicitSpId).toBe("stale-sp-id");
  });

  it("does not treat profile or auth metadata SP ids as confirmed links", async () => {
    const { resolveSpAccountLink } = await loadLinkingWithRows([]);

    const link = await resolveSpAccountLink({
      user: {
        id: "user-1",
        email: "sp.demo1@conflictfreesp.com",
        user_metadata: {
          role: "sp",
          sp_id: "metadata-sp-id",
          linked_sp_id: "metadata-sp-id",
          sp_link_sp_id: "metadata-sp-id",
          full_name: "Portal Demo One",
          schedule_name: "Portal Demo One",
        },
      } as never,
      profile: {
        id: "user-1",
        email: "sp.demo1@conflictfreesp.com",
        full_name: "Portal Demo One",
        schedule_name: "Portal Demo One",
        role: "sp",
        sp_id: "profile-sp-id",
      } as never,
      organizationId: "org-1",
    });

    expect(link).toMatchObject({
      status: "pending",
      sp_id: null,
    });
    expect(link.diagnostics?.explicitSpId).toBeNull();
  });

  it("does not fall back to unscoped SP records when organization-scoped lookup fails", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-test-key");
    const fetchSpy = vi.fn(async () => new Response("missing organization scope", { status: 400 }));
    vi.stubGlobal("fetch", fetchSpy);
    const { resolveSpAccountLink } = await import("./spAccountLinking");

    const link = await resolveSpAccountLink({
      user: {
        id: "user-1",
        email: "sp.demo1@conflictfreesp.com",
        user_metadata: {
          role: "sp",
          full_name: "Portal Demo One",
          schedule_name: "Portal Demo One",
        },
      } as never,
      profile: {
        id: "user-1",
        email: "sp.demo1@conflictfreesp.com",
        full_name: "Portal Demo One",
        schedule_name: "Portal Demo One",
        role: "sp",
      } as never,
      organizationId: "org-1",
    });

    expect(link.status).toBe("pending");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const firstCall = (fetchSpy.mock.calls as unknown as Array<[unknown]>).at(0);
    expect(firstCall).toBeTruthy();
    expect(String(firstCall?.[0])).toContain("organization_id=eq.org-1");
  });

  it("matches Portal Demo One to the seeded Sandbox Portal One directory row by name alias", async () => {
    const { resolveSpAccountLink } = await loadLinkingWithRows([sandboxPortalOne]);

    const link = await resolveSpAccountLink({
      user: {
        id: "user-1",
        email: "portal.demo.one@example.test",
        user_metadata: {
          role: "sp",
          full_name: "Portal Demo One",
          schedule_name: "Portal Demo One",
        },
      } as never,
      profile: {
        id: "user-1",
        email: "portal.demo.one@example.test",
        full_name: "Portal Demo One",
        schedule_name: "Portal Demo One",
        role: "sp",
      } as never,
      organizationId: "org-1",
    });

    expect(link).toMatchObject({
      status: "linked",
      sp_id: "sp-portal-1",
      matched_by: "schedule_name",
    });
  });
});
