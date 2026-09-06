import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAgentShapePlan } from "../src/agent-shape-plan.mjs";

const canvas = { width: 720, height: 1280, orientation: "portrait" };
const theme = {
  primary: "#1769E0", navy: "#123B78", accent: "#4A8CF0", pale: "#EEF5FF",
  surface: "#F3F6FA", ink: "#172033", gray: "#5F6B7A", line: "#C8D2DF", white: "#FFFFFF",
};

function plan(primitives, overrides = {}) {
  return {
    design_rationale: "중심 허브에서 통제 축으로 시선을 내린다.",
    composition_signature: "portrait-test-composition-v1",
    primitives,
    ...overrides,
  };
}

function options(overrides = {}) {
  return {
    canvas,
    blockIds: new Set(["alpha"]),
    blockRequiredTexts: new Map([["alpha", []]]),
    protectedMetricValues: [],
    theme,
    ...overrides,
  };
}

function surface(index) {
  return {
    kind: "roundRect",
    name: `surface-${index}`,
    block_id: "alpha",
    position: { left: 48, top: 180 + index * 60, width: 300, height: 48 },
    fill: "pale",
    stroke: "line",
  };
}

function label(index, text = `라벨 ${index}`) {
  return {
    kind: "text",
    name: `label-${index}`,
    block_id: "alpha",
    position: { left: 380, top: 180 + index * 60, width: 260, height: 40 },
    text,
    font_size: 14,
  };
}

test("accepts an eight-primitive plan", () => {
  const primitives = [surface(0), surface(1), surface(2), surface(3), label(0), label(1), label(2), label(3)];
  const normalized = normalizeAgentShapePlan(plan(primitives), options());
  assert.equal(normalized.primitives.length, 8);
});

test("rejects a plan below the primitive floor and names the shortfall", () => {
  const primitives = [surface(0), surface(1), surface(2), label(0), label(1), label(2), label(3)];
  assert.throws(() => normalizeAgentShapePlan(plan(primitives), options()), /at least 8 native primitives; found 7/);
});

test("moves connectors behind their endpoints instead of demanding authoring order", () => {
  const primitives = [
    { kind: "connector", name: "link", block_id: "alpha", position: { left: 350, top: 200, width: 30, height: 10 }, from: "surface-0", to: "surface-1", stroke: "accent" },
    surface(0),
    surface(1),
    surface(2),
    label(0),
    label(1),
    label(2),
    label(3),
  ];
  const normalized = normalizeAgentShapePlan(plan(primitives), options());
  assert.equal(normalized.primitives.at(-1).name, "link");
  assert.equal(normalized.primitives.filter((primitive) => primitive.kind === "connector").length, 1);
});

test("still rejects connectors that point at another connector", () => {
  const primitives = [
    surface(0), surface(1), surface(2), label(0), label(1), label(2), label(3),
    { kind: "connector", name: "link", block_id: "alpha", position: { left: 350, top: 200, width: 30, height: 10 }, from: "surface-0", to: "surface-1", stroke: "accent" },
    { kind: "connector", name: "bad", block_id: "alpha", position: { left: 350, top: 260, width: 30, height: 10 }, from: "link", to: "surface-2", stroke: "accent" },
  ];
  assert.throws(() => normalizeAgentShapePlan(plan(primitives), options()), /endpoints must be drawable shapes/);
});

test("treats bullet, dash and spacing variants as the same preserved content", () => {
  const primitives = [
    surface(0), surface(1), surface(2), surface(3),
    label(0, "인증 상태 확인 · 세션 유효성"),
    label(1, "처리 시간 30초 - 채널 3개"),
    label(2),
    label(3),
  ];
  const normalized = normalizeAgentShapePlan(plan(primitives), options({
    blockRequiredTexts: new Map([["alpha", [
      { field: "headline", value: "인증  상태 확인•세션 유효성" },
      { field: "bullets[0]", value: "처리 시간 30초 — 채널 3개" },
    ]]]),
  }));
  assert.equal(normalized.primitives.length, 8);
});

test("names the missing block and value when content is dropped", () => {
  const primitives = [surface(0), surface(1), surface(2), surface(3), label(0), label(1), label(2), label(3)];
  assert.throws(
    () => normalizeAgentShapePlan(plan(primitives), options({
      blockRequiredTexts: new Map([["alpha", [{ field: "headline", value: "빠진 문장입니다" }]]]),
    })),
    /missing content\.headline for block alpha.*빠진 문장입니다/s,
  );
});
