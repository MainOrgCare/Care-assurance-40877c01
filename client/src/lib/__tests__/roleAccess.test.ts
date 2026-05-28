import { describe, expect, it } from "vitest";
import {
  canAccessApiPath,
  canAccessAppPath,
  getUserRoleLabel,
} from "@shared/roles";

describe("pilot access rules", () => {
  it("allows only dashboard and settings routes for pilot users", () => {
    expect(canAccessAppPath("pilot", "/dashboard")).toBe(true);
    expect(canAccessAppPath("pilot", "/settings")).toBe(true);
    expect(canAccessAppPath("pilot", "/messages")).toBe(false);
    expect(canAccessAppPath("pilot", "/service-users/upload")).toBe(false);
  });

  it("allows only the approved dashboard and settings APIs for pilot users", () => {
    expect(canAccessApiPath("pilot", "GET", "/api/dashboard/stats")).toBe(true);
    expect(canAccessApiPath("pilot", "PUT", "/api/dashboard/widgets")).toBe(true);
    expect(canAccessApiPath("pilot", "PATCH", "/api/auth/password")).toBe(true);
    expect(canAccessApiPath("pilot", "GET", "/api/audits")).toBe(true);
    expect(canAccessApiPath("pilot", "GET", "/api/admin/rostering/workbooks/abc")).toBe(true);
    expect(canAccessApiPath("pilot", "POST", "/api/admin/rostering/recommendations/123/apply")).toBe(false);
    expect(canAccessApiPath("pilot", "DELETE", "/api/admin/rostering-recommendations")).toBe(false);
    expect(canAccessApiPath("pilot", "GET", "/api/audits/care-workers")).toBe(false);
    expect(canAccessApiPath("pilot", "POST", "/api/audits")).toBe(false);
    expect(canAccessApiPath("pilot", "GET", "/api/messages/unread-count")).toBe(false);
  });

  it("preserves broad access for staff and admin users", () => {
    expect(canAccessAppPath("staff", "/messages")).toBe(true);
    expect(canAccessAppPath("admin", "/shadow-admin-portal")).toBe(true);
    expect(canAccessApiPath("staff", "GET", "/api/messages/unread-count")).toBe(true);
  });

  it("formats the pilot role label for display", () => {
    expect(getUserRoleLabel("pilot")).toBe("Pilot");
  });
});