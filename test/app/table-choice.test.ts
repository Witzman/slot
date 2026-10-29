import { describe, expect, it } from "vitest";
import { chooseTable } from "../../src/app/table-choice";

describe("chooseTable", () => {
  it("plays the demo table, with its own rules and flow", () => {
    const c = chooseTable();
    expect(c.def.id).toBe("demo");
    expect(c.setup.rules).toBeDefined();
    expect(c.flow.ballsPerGame).toBeGreaterThan(0);
  });
});
