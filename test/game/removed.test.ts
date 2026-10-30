import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../src", import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : []));
}

describe("the removed pusher and poker (#10)", () => {
  it("no source file names them any more, except the refund table of old chips", () => {
    const words = /\b(pusher|poker|tickPusher|dropAt|drawPoker|zoneHeat)\b/i;
    for (const f of files(root)) {
      const code = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      const hit = code.split("\n").filter((l) => words.test(l) && !l.includes("REMOVED_TECH_COST") && !l.includes('"pusher" in o'));
      expect(hit, f).toEqual([]);
    }
  });
});
