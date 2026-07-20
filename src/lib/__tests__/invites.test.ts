import { describe, it, expect } from "vitest";
import { normalizeInviteEmail } from "../invites";

describe("normalizeInviteEmail", () => {
  it("lowercases the email", () => {
    expect(normalizeInviteEmail("Paul@Example.com")).toBe("paul@example.com");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeInviteEmail("  paul@example.com  ")).toBe("paul@example.com");
  });

  it("leaves already-normalized input unchanged", () => {
    expect(normalizeInviteEmail("paul@example.com")).toBe("paul@example.com");
  });
});
