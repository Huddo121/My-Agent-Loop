import { describe, expect, it } from "vitest";
import routes from "../routes";

describe("route config", () => {
  it("does not expose the admin route in the frontend route table", () => {
    expect(JSON.stringify(routes)).not.toContain("admin");
  });
});
