import type { FlowConfig, TableSetup } from "../rules";
import type { TableDef } from "../table/schema";
import { allTables, tableSetups } from "../tables";

export interface Choice {
  def: TableDef;
  setup: TableSetup;
  flow: FlowConfig;
}

/** The table the page plays: the demo table, until the real game replaces it. No address parameter chooses another. */
export function chooseTable(): Choice {
  const def = allTables.find((t) => t.id === "demo")!;
  const setup = tableSetups[def.id]!;
  return { def, setup, flow: setup.flow! };
}
