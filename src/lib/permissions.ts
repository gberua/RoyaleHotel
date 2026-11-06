/**
 * Role → permission matrix. Checked on the SERVER for every admin page and action
 * (requirePermission); the UI only hides what a role can't use.
 */
export const PERMISSIONS = [
  "dashboard", "bookings", "calendar", "guests", "housekeeping", "housekeeping.inspect",
  "prices", "rooms", "media", "content", "reviews", "reports", "channels", "activity", "settings", "staff",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export type RoleName = "OWNER" | "MANAGER" | "RECEPTION" | "HOUSEKEEPING";

const MANAGER: Permission[] = PERMISSIONS.filter((p) => p !== "settings" && p !== "staff");

export const ROLE_PERMISSIONS: Record<RoleName, ReadonlySet<Permission>> = {
  OWNER: new Set(PERMISSIONS),
  MANAGER: new Set(MANAGER),
  // dashboard, bookings, calendar, guests, housekeeping view — no prices, reports or settings
  RECEPTION: new Set<Permission>(["dashboard", "bookings", "calendar", "guests", "housekeeping"]),
  HOUSEKEEPING: new Set<Permission>(["housekeeping"]),
};

export const can = (role: RoleName, p: Permission) => ROLE_PERMISSIONS[role]?.has(p) ?? false;

/** First screen after login for each role. */
export const homeFor = (role: RoleName) => (role === "HOUSEKEEPING" ? "/admin/housekeeping" : can(role, "dashboard") ? "/admin" : "/admin/bookings");
