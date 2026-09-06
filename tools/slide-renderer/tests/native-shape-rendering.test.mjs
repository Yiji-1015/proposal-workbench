import assert from "node:assert/strict";
import test from "node:test";
import { applyNativeShapePlan } from "../src/render-presentation.mjs";

function fakeShape(spec = {}) {
  const textRange = { style: null };
  return {
    name: spec.name ?? "",
    assignedText: "",
    get text() { return textRange; },
    set text(value) { this.assignedText = value; },
  };
}

test("applies editable primitives and preserves connector names", () => {
  const added = [];
  const connected = [];
  const slide = {
    shapes: {
      add(spec) {
        const shape = fakeShape(spec);
        added.push({ spec, shape });
        return shape;
      },
      connect(from, to, options) {
        const connector = { from, to, options, name: "" };
        connected.push(connector);
        return connector;
      },
    },
    images: { add() { throw new Error("agent-authored plans must not add images"); } },
  };
  const recipe = {
    rendererKey: "agent_authored_shape_plan",
    requiredMotifs: ["editable_native_primitives"],
    producedMotifs: ["editable_native_primitives"],
    structureFingerprint: "agent_authored_shape_plan:test",
    primitives: [
      { kind: "roundRect", name: "source", position: { left: 30, top: 180, width: 120, height: 60 }, fill: "#FFFFFF", stroke: "#C8D2DF" },
      { kind: "ellipse", name: "target", position: { left: 240, top: 180, width: 80, height: 80 }, fill: "#EEF5FF", stroke: "#1769E0" },
      { kind: "text", name: "label", position: { left: 40, top: 195, width: 100, height: 30 }, text: "편집 가능", color: "#172033" },
      { kind: "connector", name: "source-to-target", position: { left: 150, top: 205, width: 90, height: 10 }, from: "source", to: "target", connectorKind: "straight", stroke: "#4A8CF0" },
    ],
  };

  const result = applyNativeShapePlan(slide, recipe);
  assert.equal(added.length, 3);
  assert.equal(added[2].shape.assignedText, "편집 가능");
  assert.equal(connected.length, 1);
  assert.equal(connected[0].name, "source-to-target");
  assert.equal(result.pictureShapeCount, 0);
  assert.equal(result.fidelityPassed, true);
});

test("points the connector arrow at the destination shape", () => {
  const connected = [];
  const slide = {
    shapes: {
      add(spec) { return fakeShape(spec); },
      connect(from, to, options) {
        const connector = { from, to, options, name: "" };
        connected.push(connector);
        return connector;
      },
    },
    images: { add() { throw new Error("agent-authored plans must not add images"); } },
  };
  const recipe = {
    rendererKey: "agent_authored_shape_plan",
    requiredMotifs: [],
    producedMotifs: [],
    structureFingerprint: "agent_authored_shape_plan:arrow",
    primitives: [
      { kind: "rect", name: "source", position: { left: 30, top: 180, width: 120, height: 60 }, fill: "#FFFFFF", stroke: "#C8D2DF" },
      { kind: "rect", name: "target", position: { left: 240, top: 180, width: 120, height: 60 }, fill: "#FFFFFF", stroke: "#C8D2DF" },
      { kind: "connector", name: "source-to-target", position: { left: 150, top: 205, width: 90, height: 10 }, from: "source", to: "target", connectorKind: "straight", stroke: "#4A8CF0" },
    ],
  };

  applyNativeShapePlan(slide, recipe);
  // OOXML에서 head는 선의 시작점이다. head에 화살표를 달면 관계가 반대로 읽힌다.
  assert.equal(connected[0].options.tail.type, "arrow");
  assert.equal(connected[0].options.head, undefined);
});
