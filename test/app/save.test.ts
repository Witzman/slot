import { describe, expect, it } from "vitest";
import { loadMeta, save } from "../../src/app/save";
import { newMeta } from "../../src/game/meta";
import { memoryStore } from "../../src/storage";

describe("saving the meta", () => {
  it("writes the v2 key and reads it back per mode", async () => {
    const store = memoryStore();
    const meta = newMeta();
    meta.endless.chips = 9;
    await save(store, meta, null);
    expect(await store.get("slot/meta/v2")).not.toBeNull();
    expect((await loadMeta(store)).endless.chips).toBe(9);
  });

  it("reads a v1 save once when there is no v2 save, as climb", async () => {
    const store = memoryStore();
    await store.set("slot/meta/v1", JSON.stringify({ v: 1, chips: 6, tech: ["purse1", "pbet"], relics: [], ach: [], runs: 2, bestRound: 3, life: {}, seedCounter: 1, maxStake: 0, loadout: [] }));
    const meta = await loadMeta(store);
    expect([meta.climb.chips, meta.climb.tech, meta.endless.chips]).toEqual([6 + 4, ["purse1"], 0]);
    await save(store, meta, null);
    await store.set("slot/meta/v1", "garbage");
    expect((await loadMeta(store)).climb.chips).toBe(10);
  });

  it("does not fall back to v1 when the v2 save is there but unreadable", async () => {
    const store = memoryStore();
    await store.set("slot/meta/v1", JSON.stringify({ v: 1, chips: 99, tech: [] }));
    await store.set("slot/meta/v2", "{not json");
    expect((await loadMeta(store)).climb.chips).toBe(0);
  });
});
