import { describe, it, expect } from "vitest";
import { shouldNotifyRole } from "../notify";

describe("shouldNotifyRole", () => {
  it("notifies the artist when the manager acts on a task assigned to the artist", () => {
    expect(shouldNotifyRole("manager", "artist")).toBe("artist");
  });

  it("notifies the manager when the artist acts on a task assigned to the manager", () => {
    expect(shouldNotifyRole("artist", "manager")).toBe("manager");
  });

  it("notifies the other role when the task is assigned to both", () => {
    expect(shouldNotifyRole("manager", "both")).toBe("artist");
    expect(shouldNotifyRole("artist", "both")).toBe("manager");
  });

  it("does not notify when the task doesn't involve the other role", () => {
    expect(shouldNotifyRole("manager", "manager")).toBeNull();
    expect(shouldNotifyRole("artist", "artist")).toBeNull();
  });
});
