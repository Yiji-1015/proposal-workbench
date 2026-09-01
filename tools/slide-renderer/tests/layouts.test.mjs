import assert from "node:assert/strict";
import test from "node:test";
import { createLayoutPlan } from "../src/layouts.mjs";

function overlaps(a, b) {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}

function poolBlock(blockId, span, minHeight = { portrait: 120, landscape: 90 }, explanation = "") {
  return {
    blockId,
    role: blockId,
    slot: "auto",
    steps: [],
    content: explanation ? { explanation } : {},
    blockTypeDefinition: {
      id: blockId,
      preferredSpan: span,
      minHeight,
      preferredHeight: minHeight,
    },
  };
}

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

test("maps registered frames to arbitrary block IDs by role", () => {
  const plan = createLayoutPlan(model({
    canvas: { width: 720, height: 1280, orientation: "portrait" },
    blocks: [
      { blockId: "blk_summary", role: "requirement_summary", steps: [], content: {} },
      { blockId: "blk_process", role: "main_process", steps: ["A", "B"], content: {} },
      { blockId: "blk_quality", role: "operation_quality", steps: [], content: {} },
      { blockId: "blk_tech", role: "technology_comparison", steps: [], content: {} },
      { blockId: "blk_metrics", role: "metric_highlight", steps: [], content: {} },
    ],
  }));
  assert.ok(plan.frames.blk_summary);
  assert.ok(plan.frames.blk_process);
  assert.ok(plan.frames.blk_quality);
  assert.ok(plan.frames.blk_tech);
  assert.ok(plan.frames.blk_metrics);
  assert.equal(plan.processCells.length, 2);
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

test("packs full and half pool blocks inside a portrait canvas", () => {
  const plan = createLayoutPlan({
    layoutFamily: "block_pool_auto",
    canvas: { width: 720, height: 1280, orientation: "portrait" },
    blocks: [
      poolBlock("metric_dashboard", "half"),
      poolBlock("scope_outcome_mapping", "half"),
      poolBlock("matrix_table", "full"),
      poolBlock("blueprint_flow", "full"),
      poolBlock("chevron_pipeline", "half"),
    ],
  });
  assert.equal(plan.layoutKey, "block_pool_auto:portrait");
  const frames = Object.values(plan.frames);
  for (const current of frames) {
    assert.ok(current.left >= 0 && current.top >= 0 && current.left + current.width <= 720 && current.top + current.height <= 1280);
  }
  for (let i = 0; i < frames.length; i += 1) {
    for (let j = i + 1; j < frames.length; j += 1) assert.equal(overlaps(frames[i], frames[j]), false);
  }
});

test("rejects a pool that cannot fit without shrinking content", () => {
  assert.throws(() => createLayoutPlan({
    layoutFamily: "block_pool_auto",
    canvas: { width: 720, height: 1280, orientation: "portrait" },
    blocks: Array.from({ length: 5 }, (_, index) => poolBlock(`full-${index}`, "full", { portrait: 300, landscape: 200 })),
  }), /block_pool_auto.*fit/i);
});

test("reserves explanation space in pool block minimum heights", () => {
  const withoutExplanation = Array.from({ length: 5 }, (_, index) => poolBlock(`plain-${index}`, "full", { portrait: 190, landscape: 140 }));
  assert.doesNotThrow(() => createLayoutPlan({ layoutFamily: "block_pool_auto", canvas: { width: 720, height: 1280, orientation: "portrait" }, blocks: withoutExplanation }));
  const withExplanation = Array.from({ length: 5 }, (_, index) => poolBlock(`explained-${index}`, "full", { portrait: 190, landscape: 140 }, "간단한 부연설명"));
  assert.throws(() => createLayoutPlan({ layoutFamily: "block_pool_auto", canvas: { width: 720, height: 1280, orientation: "portrait" }, blocks: withExplanation }), /block_pool_auto.*fit/i);
});
