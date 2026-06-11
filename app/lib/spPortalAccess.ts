export type PortalNavigationRole = "sp" | "faculty" | "sim_op" | "admin" | "super_admin" | "viewer";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function normalizePortalNavigationRole(value: unknown): PortalNavigationRole {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "platform_owner" || role === "owner" || role === "super_admin") return "super_admin";
  if (role === "org_admin" || role === "organization_admin" || role === "admin") return "admin";
  if (role === "sim_ops" || role === "sim_op") return "sim_op";
  if (role === "faculty") return "faculty";
  if (role === "sp") return "sp";
  return "viewer";
}

export function getEffectivePortalNavigationRole(candidates: unknown[]): PortalNavigationRole {
  for (const candidate of candidates) {
    if (asText(candidate)) return normalizePortalNavigationRole(candidate);
  }
  return "viewer";
}

export function isSpPortalRole(value: unknown) {
  return normalizePortalNavigationRole(value) === "sp";
}

export function isSpPortalAllowedPath(pathname: string) {
  const path = asText(pathname).split("?")[0] || "/";

  if (path === "/sp" || path.startsWith("/sp/")) return true;
  if (path === "/me" || path.startsWith("/me/")) return true;
  if (path === "/login" || path === "/logout" || path === "/no-access") return true;
  if (path === "/forgot-password" || path === "/reset-password" || path === "/signup") return true;
  if (path === "/privacy" || path === "/terms" || path === "/contact" || path === "/request-access" || path === "/request-demo") return true;

  return false;
}

export function getSpPortalLandingPath() {
  return "/sp";
}
