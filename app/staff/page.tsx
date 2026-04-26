"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../components/SiteShell";

type StaffMember = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  schedule_match_name: string;
  status: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

type StaffResponse = {
  ok?: boolean;
  members?: StaffMember[];
  limited?: boolean;
  role?: string;
  warning?: string;
  error?: string;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function formatRole(role: string) {
  const normalized = asText(role).toLowerCase();
  if (normalized === "super_admin") return "Super Admin";
  if (normalized === "admin") return "Admin";
  if (normalized === "sim_op") return "Sim Op";
  return "SP";
}

function formatDate(value: string | null) {
  const text = asText(value);
  if (!text) return "Not available";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleString();
}

function getRoleTone(role: string) {
  const normalized = asText(role).toLowerCase();
  if (normalized === "super_admin") return { background: "#eaf7f2", border: "#bfe4d6", color: "#196b57" };
  if (normalized === "admin") return { background: "#edf5fb", border: "#c7dcee", color: "#165a96" };
  if (normalized === "sim_op") return { background: "#f4f7fb", border: "#d6e0e8", color: "#4f677d" };
  return { background: "#fff6e8", border: "#f1d1a7", color: "#a86411" };
}

export default function StaffPage() {
  const router = useRouter();
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [warningMessage, setWarningMessage] = useState("");
  const [limited, setLimited] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;

    async function loadMembers() {
      setLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch("/api/staff", {
          cache: "no-store",
          credentials: "include",
        });

        if (cancelled) return;

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        const body = (await response.json().catch(() => null)) as StaffResponse | null;

        if (!response.ok) {
          setErrorMessage(asText(body?.error) || "Could not load organization members.");
          setLoading(false);
          return;
        }

        setMembers(Array.isArray(body?.members) ? body.members : []);
        setLimited(Boolean(body?.limited));
        setWarningMessage(asText(body?.warning));
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "Could not load organization members.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadMembers();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const filteredMembers = useMemo(() => {
    const query = asText(searchTerm).toLowerCase();

    return members.filter((member) => {
      const matchesRole = roleFilter === "all" || asText(member.role).toLowerCase() === roleFilter;
      if (!matchesRole) return false;

      if (!query) return true;

      return [
        member.full_name,
        member.email,
        member.schedule_match_name,
        formatRole(member.role),
      ]
        .map((value) => asText(value).toLowerCase())
        .some((value) => value.includes(query));
    });
  }, [members, roleFilter, searchTerm]);

  return (
    <SiteShell
      title="Organization"
      subtitle="View organization members, roles, and schedule-match details in one place."
    >
      <div className="grid gap-5">
        <section className="cfsp-panel px-5 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="cfsp-kicker">Organization directory</p>
              <h2 className="mt-2 text-[1.55rem] font-black text-[#14304f]">Organization members</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5e7388]">
                Search by name, email, role, or schedule match name to find the right person quickly.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                <div className="cfsp-label">Members</div>
                <div className="mt-1 text-xl font-black text-[#14304f]">{members.length}</div>
              </div>
              <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                <div className="cfsp-label">Visible scope</div>
                <div className="mt-1 text-base font-black text-[#14304f]">{limited ? "My profile only" : "All members"}</div>
              </div>
            </div>
          </div>
        </section>

        {warningMessage ? <div className="cfsp-alert cfsp-alert-info">{warningMessage}</div> : null}
        {errorMessage ? <div className="cfsp-alert cfsp-alert-error">{errorMessage}</div> : null}

        <section className="cfsp-panel px-5 py-5">
          <div className="grid gap-3 lg:grid-cols-[1.8fr_0.9fr]">
            <label className="grid gap-2">
              <span className="cfsp-label">Search members</span>
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by name, email, role, or schedule match name"
                className="cfsp-input"
              />
            </label>

            <label className="grid gap-2">
              <span className="cfsp-label">Role</span>
              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                className="cfsp-input"
              >
                <option value="all">All roles</option>
                <option value="super_admin">Super Admin</option>
                <option value="admin">Admin</option>
                <option value="sim_op">Sim Op</option>
                <option value="sp">SP</option>
              </select>
            </label>
          </div>
        </section>

        <section className="grid gap-3">
          {loading ? (
            <div className="cfsp-panel px-5 py-6 text-sm font-semibold text-[#5e7388]">Loading organization members...</div>
          ) : filteredMembers.length === 0 ? (
            <div className="cfsp-panel px-5 py-6">
              <h3 className="m-0 text-[1.1rem] font-black text-[#14304f]">No members found</h3>
              <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                Try changing the search text or role filter to broaden the results.
              </p>
            </div>
          ) : (
            filteredMembers.map((member) => {
              const roleTone = getRoleTone(member.role);
              return (
                <article
                  key={member.id}
                  className="cfsp-panel px-5 py-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">
                          {member.full_name || "Unnamed member"}
                        </h3>
                        <span className="cfsp-badge" style={roleTone}>
                          {formatRole(member.role)}
                        </span>
                        <span
                          className="cfsp-badge"
                          style={
                            member.is_active
                              ? { background: "#eaf7f2", borderColor: "#bfe4d6", color: "#196b57" }
                              : { background: "#f4f7fb", borderColor: "#d6e0e8", color: "#5e7388" }
                          }
                        >
                          {member.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <div className="mt-2 text-sm font-semibold text-[#5e7388]">{member.email || "No email available"}</div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                      <div className="cfsp-label">Schedule Match Name</div>
                      <div className="mt-2 text-sm font-bold text-[#14304f]">
                        {member.schedule_match_name || "Not set"}
                      </div>
                    </div>
                    <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                      <div className="cfsp-label">Role</div>
                      <div className="mt-2 text-sm font-bold text-[#14304f]">{formatRole(member.role)}</div>
                    </div>
                    <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                      <div className="cfsp-label">Created</div>
                      <div className="mt-2 text-sm font-bold text-[#14304f]">{formatDate(member.created_at)}</div>
                    </div>
                    <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                      <div className="cfsp-label">Updated</div>
                      <div className="mt-2 text-sm font-bold text-[#14304f]">{formatDate(member.updated_at)}</div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>
    </SiteShell>
  );
}
