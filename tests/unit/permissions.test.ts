import { describe, expect, it } from "vitest";
import { can, homeFor, PERMISSIONS, ROLE_PERMISSIONS } from "@/lib/permissions";

describe("role → permission matrix", () => {
  it("owner can do everything", () => {
    for (const p of PERMISSIONS) expect(can("OWNER", p)).toBe(true);
  });
  it("manager: everything except staff & settings", () => {
    for (const p of PERMISSIONS) expect(can("MANAGER", p)).toBe(p !== "staff" && p !== "settings");
  });
  it("receptionist: dashboard, bookings, calendar, guests, housekeeping view — no prices, reports, settings", () => {
    expect([...ROLE_PERMISSIONS.RECEPTION].sort()).toEqual(["bookings", "calendar", "dashboard", "guests", "housekeeping"]);
    for (const p of ["prices", "rooms", "reports", "settings", "staff", "media", "content", "housekeeping.inspect"] as const) expect(can("RECEPTION", p)).toBe(false);
  });
  it("housekeeping: only the housekeeping screen (and cannot mark rooms inspected)", () => {
    expect([...ROLE_PERMISSIONS.HOUSEKEEPING]).toEqual(["housekeeping"]);
    expect(can("HOUSEKEEPING", "housekeeping.inspect")).toBe(false);
    expect(can("MANAGER", "housekeeping.inspect")).toBe(true);
  });
  it("each role lands on a screen it may open", () => {
    expect(homeFor("HOUSEKEEPING")).toBe("/admin/housekeeping");
    expect(homeFor("RECEPTION")).toBe("/admin");
  });
});
