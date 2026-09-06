import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAgentBrief } from "../../../skills/proposal-ppt-maker/scripts/validate-agent-brief.mjs";

const rendererRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workbenchRoot = path.resolve(rendererRoot, "..", "..");

async function read(relativePath) {
  return fs.readFile(path.join(workbenchRoot, relativePath), "utf8");
}

test("maker contract is asset-independent and native-first", async () => {
  const [skill, io, metadata, contract] = await Promise.all([
    read("skills/proposal-ppt-maker/SKILL.md"),
    read("skills/proposal-ppt-maker/references/io-contract.md"),
    read("skills/proposal-ppt-maker/agents/openai.yaml"),
    read("skills/proposal-ppt-maker/references/agent-execution-contract.md"),
  ]);

  for (const phrase of ["asset-mapping.json", "SQLite", "임베딩", "에셋 카탈로그"]) {
    assert.match(skill, new RegExp(phrase.replace(".", "\\.")));
  }
  assert.match(skill, /요구하지 않는다/);
  assert.match(skill, /visual_category.*renderer_key.*직접 선택/s);
  assert.match(skill, /한 장의 `visual_category`가 모두 달라야 한다/);
  assert.match(skill, /proposal-ppt-ingest.*proposal-reference-search.*독립 도구/s);
  assert.match(skill, /reference_context/);
  assert.match(skill, /embedded_media_count: 0/);
  assert.doesNotMatch(skill, /asset-selection\.md/);

  for (const input of ["input/requirement.json", "blueprint/slide-blueprint.json"]) assert.ok(io.includes(input));
  assert.doesNotMatch(io, /mapping\/asset-mapping\.json/);
  assert.match(io, /visual_category.*내장 `renderer_key`를 직접 선택/s);
  assert.match(io, /세션·SQLite·원본 파일·미리보기 이미지를 로드하지 않는다/);
  for (const output of ["wireframe.png", "final-slide.png", "verification-report.json", ".pptx"]) assert.ok(io.includes(output));
  for (const field of ["native_diagrams", "reference_context", "content_box_count"]) assert.ok(io.includes(field));

  assert.match(metadata, /built-in native shape renderers/i);
  assert.match(metadata, /never require ingest, search, an asset catalog, or asset mapping/i);
  for (const field of ["requirement_ids", "slide_scope", "palette", "reference_context", "native_topology_constraints", "forbidden_actions", "time_budget_minutes", "max_review_rounds", "completion_criteria"]) {
    assert.ok(contract.includes(field), `missing agent contract field ${field}`);
  }
});

test("planner treats references as optional metadata", async () => {
  const [planner, ingest, search, readme, dataContract] = await Promise.all([
    read("skills/proposal-slide-planner/SKILL.md"),
    read("skills/proposal-ppt-ingest/SKILL.md"),
    read("skills/proposal-reference-search/SKILL.md"),
    read("README.md"),
    read("references/data-contract-v2.md"),
  ]);

  assert.match(planner, /레퍼런스 없이도 RFP만으로 완전하게 기획한다/);
  assert.match(planner, /검색, 인제스트, SQLite, 임베딩, 에셋 카탈로그를 호출하거나 요구하지 않는다/);
  assert.match(planner, /asset-mapping\.json`을 만들지 않는다/);
  assert.match(planner, /한 장 안의 `visual_category`를 서로 다르게 쓴다/);
  assert.match(planner, /reference_context/);
  assert.match(planner, /세션 파일을 열거나 완료 상태를 재확인하지 않으며/);
  assert.match(ingest, /독립 인제스트/);
  assert.match(search, /proposal-slide-planner.*호출하지 않는다/s);
  assert.match(readme, /인제스트와 검색은 각각 독립 실행/);
  assert.match(readme, /실험 격리/);
  assert.match(dataContract, /asset-mapping\.json`은 코어 계약에 없다/);
});

test("agent brief validates native topology contract", () => {
  const valid = {
    requirement_ids: ["SFR-002"],
    slide_scope: { count: 1, orientation: "portrait" },
    palette: { primary: "#1769E0", navy: "#123B78" },
    reference_context: { mode: "none", selected_slide_ids: [], notes: [] },
    native_topology_constraints: ["unique_visual_category_per_slide"],
    forbidden_actions: ["require_asset_catalog"],
    time_budget_minutes: 20,
    max_review_rounds: 1,
    completion_criteria: ["editable_pptx"],
  };
  assert.deepEqual(validateAgentBrief(valid), { requirementIds: ["SFR-002"], slideCount: 1, maxReviewRounds: 1 });
  assert.throws(() => validateAgentBrief({ ...valid, reference_context: { mode: "session_lookup" } }), /reference_context\.mode/);
});
