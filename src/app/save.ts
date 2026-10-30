import { type Meta, newMeta, restoreMeta } from "../game/meta";
import { type Run, restoreRun } from "../game/run";
import type { Store } from "../storage";

const META_KEY = "slot/meta/v2";
/** The meta before the two modes had their own chips and trees (#10): read once when there is no v2. */
const OLD_META_KEY = "slot/meta/v1";
const RUN_KEY = "slot/run/v1";

function parse(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function loadMeta(store: Store): Promise<Meta> {
  const text = (await store.get(META_KEY)) ?? (await store.get(OLD_META_KEY));
  return restoreMeta(parse(text));
}

export async function loadRun(store: Store): Promise<Run | null> {
  return restoreRun(parse(await store.get(RUN_KEY)));
}

export async function save(store: Store, meta: Meta, run: Run | null): Promise<void> {
  // both writes start in the same tick, so a closing tab still gets them
  await Promise.all([store.set(META_KEY, JSON.stringify(meta)), store.set(RUN_KEY, run ? JSON.stringify(run) : "null")]);
}

export { newMeta };
