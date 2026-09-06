import assert from "node:assert/strict";
import test from "node:test";
import { validateAgentBrief } from "../src/validate-agent-brief.mjs";

function validBrief() {
  return {
    requirement_ids: ["SFR-002", "SFR-003"],
    slide_scope: { count: 4, orientation: "portrait" },
    palette: { primary: "#1769E0", navy: "#123B78" },
    reference_context: { mode: "none", selected_slide_ids: [], notes: [] },
    layout_constraints: ["agent_authored_shape_plan", "distinct_composition_signature"],
    forbidden_actions: ["start_localhost", "create_review_ppt", "expand_validation_infrastructure"],
    time_budget_minutes: 30,
    max_review_rounds: 1,
    completion_criteria: ["editable_pptx", "inline_preview", "native_diagram_report"],
  };
}

test("accepts a complete bounded subagent task contract", () => {
  const result = validateAgentBrief(validBrief());
  assert.deepEqual(result.requirementIds, ["SFR-002", "SFR-003"]);
  assert.equal(result.maxReviewRounds, 1);
});
test("rejects a brief that omits requirement IDs", () => {
  const brief = validBrief();
  delete brief.requirement_ids;
  assert.throws(() => validateAgentBrief(brief), /requirement_ids/i);
});

test("rejects an unbounded review loop", () => {
  const brief = validBrief();
  brief.max_review_rounds = 2;
  assert.throws(() => validateAgentBrief(brief), /max_review_rounds.*0 or 1/i);
});
