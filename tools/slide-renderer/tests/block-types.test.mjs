import assert from "node:assert/strict";
import test from "node:test";
import {
  getBlockTypeDefinition,
  listBlockTypeDefinitions,
  validateBlockTypeContent,
} from "../src/block-types.mjs";

test("lists the six selectable block types", () => {
  assert.deepEqual(listBlockTypeDefinitions().map((item) => item.id), [
    "matrix_table",
    "metric_dashboard",
    "scope_outcome_mapping",
    "blueprint_flow",
    "chevron_pipeline",
    "gantt_roadmap",
  ]);
});

test("validates a table row against its columns", () => {
  assert.throws(
    () => validateBlockTypeContent("matrix_table", { columns: ["구분", "제안"], rows: [{ label: "수집", cells: [] }] }),
    /matrix_table.*cells.*columns/i,
  );
});

test("returns null for legacy visual categories", () => {
  assert.equal(getBlockTypeDefinition("card_grid"), null);
});
