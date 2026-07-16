import { describe, expect, it } from "vitest";
import {
  deriveAccountProvisioningStatus,
  formatProvisioningRoleLabel,
  provisionOrganizationAccount,
} from "./adminAccountProvisioning";

function createProvisioningAdminStub(options?: {
  existingSp?: Record<string, unknown> | null;
  createSpError?: { message: string };
}) {
  const calls = {
    spInserts: [] as unknown[],
    profileUpserts: [] as unknown[],
    membershipUpserts: [] as unknown[],
    preferenceUpserts: [] as unknown[],
    metadataUpdates: [] as unknown[],
  };

  const invitedUser = {
    id: "user-1",
    email: "new.sp@example.edu",
    user_metadata: {},
  };

  const createQuery = (table: string) => {
    const state = {
      table,
      action: "",
      payload: null as unknown,
      filters: [] as Array<[string, unknown]>,
    };

    const builder = {
      select() {
        return builder;
      },
      ilike(column: string, value: unknown) {
        state.filters.push([column, value]);
        return builder;
      },
      eq(column: string, value: unknown) {
        state.filters.push([column, value]);
        return builder;
      },
      limit() {
        return builder;
      },
      returns() {
        if (table === "sps" && state.action === "select") {
          return Promise.resolve({ data: options?.existingSp ? [options.existingSp] : [], error: null });
        }
        return Promise.resolve({ data: [], error: null });
      },
      insert(payload: unknown) {
        state.action = "insert";
        state.payload = payload;
        if (table === "sps") calls.spInserts.push(payload);
        return builder;
      },
      upsert(payload: unknown) {
        state.action = "upsert";
        state.payload = payload;
        if (table === "profiles") calls.profileUpserts.push(payload);
        if (table === "organization_memberships") calls.membershipUpserts.push(payload);
        if (table === "sp_communication_preferences") calls.preferenceUpserts.push(payload);
        return builder;
      },
      single() {
        if (table === "sps" && options?.createSpError) {
          return Promise.resolve({ data: null, error: options.createSpError });
        }
        return Promise.resolve({
          data: {
            id: "sp-1",
            organization_id: "org-1",
            full_name: "New SP",
            working_email: "new.sp@example.edu",
            email: "new.sp@example.edu",
          },
          error: null,
        });
      },
      maybeSingle() {
        return Promise.resolve({ data: { id: `${table}-row` }, error: null });
      },
    };

    state.action = "select";
    return builder;
  };

  const admin = {
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: [] }, error: null }),
        inviteUserByEmail: async () => ({ data: { user: invitedUser }, error: null }),
        updateUserById: async (_userId: string, payload: unknown) => {
          calls.metadataUpdates.push(payload);
          return {
            data: {
              user: {
                ...invitedUser,
                user_metadata: (payload as { user_metadata?: Record<string, unknown> }).user_metadata || {},
              },
            },
            error: null,
          };
        },
      },
    },
    from(table: string) {
      return createQuery(table);
    },
  };

  return { admin, calls };
}

describe("admin account provisioning", () => {
  it("labels account roles in admin-facing language", () => {
    expect(formatProvisioningRoleLabel("org_admin")).toBe("Admin");
    expect(formatProvisioningRoleLabel("sim_ops")).toBe("Simulation Operations");
    expect(formatProvisioningRoleLabel("faculty")).toBe("Faculty / Instructor");
    expect(formatProvisioningRoleLabel("viewer")).toBe("Observer / Client");
  });

  it("flags active SP accounts without a durable SP profile link", () => {
    expect(
      deriveAccountProvisioningStatus({
        role: "sp",
        membershipStatus: "active",
        profileActive: true,
        inviteSent: true,
        spLinkId: "",
      })
    ).toBe("needs_profile_link");
    expect(
      deriveAccountProvisioningStatus({
        role: "sp",
        membershipStatus: "active",
        profileActive: true,
        spLinkId: "sp-1",
      })
    ).toBe("active");
    expect(deriveAccountProvisioningStatus({ role: "faculty", inviteSent: true })).toBe("pending_invite");
  });

  it("creates and links an SP profile before activating SP membership", async () => {
    const { admin, calls } = createProvisioningAdminStub();

    const result = await provisionOrganizationAccount({
      admin: admin as never,
      organizationId: "org-1",
      email: "new.sp@example.edu",
      fullName: "New SP",
      role: "sp",
      approvedBy: "admin-1",
      sendInvite: true,
      createAuthUserIfMissing: true,
      schemaAvailable: true,
    });

    expect(result.ok).toBe(true);
    expect(result.spId).toBe("sp-1");
    expect(calls.spInserts).toHaveLength(1);
    expect(calls.membershipUpserts).toHaveLength(1);
    expect(calls.membershipUpserts[0]).toMatchObject({
      organization_id: "org-1",
      user_id: "user-1",
      role: "sp",
      status: "active",
      sp_id: "sp-1",
    });
    expect(calls.profileUpserts[0]).toMatchObject({
      id: "user-1",
      role: "sp",
      sp_id: "sp-1",
    });
    expect(calls.metadataUpdates[0]).toMatchObject({
      user_metadata: expect.objectContaining({
        role: "sp",
        organization_role: "sp",
        sp_id: "sp-1",
        sp_link_status: "linked",
      }),
    });
  });

  it("does not activate SP membership when the required SP profile cannot be created", async () => {
    const { admin, calls } = createProvisioningAdminStub({
      createSpError: { message: "insert failed" },
    });

    const result = await provisionOrganizationAccount({
      admin: admin as never,
      organizationId: "org-1",
      email: "new.sp@example.edu",
      fullName: "New SP",
      role: "sp",
      approvedBy: "admin-1",
      sendInvite: true,
      createAuthUserIfMissing: true,
      schemaAvailable: true,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(calls.membershipUpserts).toHaveLength(0);
    expect(calls.profileUpserts).toHaveLength(0);
    expect(calls.preferenceUpserts).toHaveLength(0);
  });
});
