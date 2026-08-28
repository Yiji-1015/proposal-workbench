import assert from "node:assert/strict";
import test from "node:test";
import { createAssetRecipe } from "../src/asset-recipes.mjs";

const frame = { left: 20, top: 40, width: 600, height: 300 };
const theme = {
  primary: "#1769E0",
  navy: "#123B78",
  accent: "#4A8CF0",
  pale: "#EEF5FF",
  surface: "#F3F6FA",
  ink: "#172033",
  gray: "#5F6B7A",
  line: "#C8D2DF",
  white: "#FFFFFF",
};
const block = {
  blockId: "main",
  content: { headline: "품질 검증", bullets: ["설계", "검증", "개선", "재검증"] },
  steps: ["설계", "검증", "개선", "재검증"],
  options: [],
};

test("different renderer keys create different native structure fingerprints", () => {
  const feedback = createAssetRecipe({ rendererKey: "feedback_loop", block, frame, theme });
  const gates = createAssetRecipe({ rendererKey: "quality_gate", block, frame, theme });
  const hub = createAssetRecipe({ rendererKey: "hub_spoke", block, frame, theme });
  assert.equal(new Set([feedback.structureFingerprint, gates.structureFingerprint, hub.structureFingerprint]).size, 3);
  assert.ok(feedback.producedMotifs.includes("return_connector"));
  assert.ok(gates.producedMotifs.includes("stage_gate"));
  assert.ok(hub.producedMotifs.includes("radial_spokes"));
});
test("asset recipes use only the approved palette", () => {
  const recipe = createAssetRecipe({ rendererKey: "comparison", block, frame, theme });
  const colors = recipe.primitives.flatMap((primitive) => [primitive.fill, primitive.stroke, primitive.color]).filter(Boolean);
  assert.equal(colors.includes("#009C9C"), false);
  assert.equal(colors.includes("#007A7A"), false);
  assert.ok(colors.every((color) => Object.values(theme).includes(color) || color === "none"));
});

test("unsupported renderer keys fail closed", () => {
  assert.throws(() => createAssetRecipe({ rendererKey: "generic_grid", block, frame, theme }), /unsupported asset renderer/i);
});
