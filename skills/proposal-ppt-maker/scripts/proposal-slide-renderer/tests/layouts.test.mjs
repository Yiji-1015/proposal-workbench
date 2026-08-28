import assert from "node:assert/strict";
import test from "node:test";
import { createLayoutPlan } from "../src/layouts.mjs";

function model(overrides = {}) {
  return {
    requirementId: "SEC-204",
    layoutFamily: "three_column_with_bottom_band",
    canvas: { width: 1280, height: 720, orientation: "landscape" },
    blocks: [
      { blockId: "requirement_summary", role: "requirement_summary", slot: "left", steps: [], content: {} },
      { blockId: "main_process", role: "main_process", slot: "center", steps: ["신청", "검토", "승인", "점검"], content: {} },
      { blockId: "operation_quality", role: "operation_quality", slot: "right", steps: [], content: {} },
      { blockId: "technology_comparison", role: "technology_comparison", slot: "bottom_center", steps: [], content: {} },
      { blockId: "metric_highlight", role: "metric_highlight", slot: "top_left", steps: [], content: {} },
    ],
    ...overrides,
  };
}

test("selects the registered three-column layout and preserves slot relationships", () => {
  const plan = createLayoutPlan(model());
  assert.equal(plan.layoutKey, "three_column_with_bottom_band:landscape");
  assert.ok(plan.frames.requirement_summary.left < plan.frames.main_process.left);
  assert.ok(plan.frames.main_process.left < plan.frames.operation_quality.left);
  assert.ok(plan.frames.technology_comparison.top > plan.frames.main_process.top);
  assert.equal(plan.frames.metric_highlight.left, plan.frames.requirement_summary.left);
});

test("computes process cells from the actual number of steps", () => {
  const plan = createLayoutPlan(model());
  assert.equal(plan.processCells.length, 4);
  assert.deepEqual(plan.processCells.map((cell) => cell.label), ["신청", "검토", "승인", "점검"]);
  assert.equal(new Set(plan.processCells.map((cell) => `${cell.left}:${cell.top}`)).size, 4);
});

test("uses a portrait variant instead of landscape coordinates", () => {
  const plan = createLayoutPlan(model({ canvas: { width: 720, height: 1280, orientation: "portrait" } }));
  assert.equal(plan.layoutKey, "three_column_with_bottom_band:portrait");
  assert.ok(plan.frames.main_process.top > plan.frames.requirement_summary.top);
  assert.ok(plan.frames.operation_quality.top > plan.frames.main_process.top);
  for (const frame of Object.values(plan.frames)) assert.ok(frame.left + frame.width <= 720 && frame.top + frame.height <= 1280);
});

test("uses a dense two-by-two process grid for four portrait steps", () => {
  const plan = createLayoutPlan(model({ canvas: { width: 720, height: 1280, orientation: "portrait" } }));
  assert.equal(new Set(plan.processCells.map((cell) => cell.left)).size, 2);
  assert.equal(new Set(plan.processCells.map((cell) => cell.top)).size, 2);
});

test("falls back to a bounded generic grid for an unknown layout family", () => {
  const plan = createLayoutPlan(model({ layoutFamily: "unregistered_architecture" }));
  assert.equal(plan.layoutKey, "generic_grid:landscape");
  assert.deepEqual(Object.keys(plan.frames).sort(), ["main_process", "metric_highlight", "operation_quality", "requirement_summary", "technology_comparison"]);
  for (const frame of Object.values(plan.frames)) assert.ok(frame.left >= 0 && frame.top >= 0 && frame.left + frame.width <= 1280 && frame.top + frame.height <= 720);
});
