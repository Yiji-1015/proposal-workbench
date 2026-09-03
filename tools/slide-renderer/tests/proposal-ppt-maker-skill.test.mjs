import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rendererRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workbenchRoot = path.resolve(rendererRoot, "..", "..");
const skillRoot = path.resolve(workbenchRoot, "skills", "proposal-ppt-maker");

test("proposal-ppt-maker formalizes scope, bounded execution, honest asset use, and inline approval", async () => {
  const [skill, io, assetSelection, portraitProposal, metadata, agentContract] = await Promise.all([
    fs.readFile(path.join(skillRoot, "SKILL.md"), "utf8"),
    fs.readFile(path.join(skillRoot, "references", "io-contract.md"), "utf8"),
    fs.readFile(path.join(skillRoot, "references", "asset-selection.md"), "utf8"),
    fs.readFile(path.join(skillRoot, "references", "portrait-proposal.md"), "utf8"),
    fs.readFile(path.join(skillRoot, "agents", "openai.yaml"), "utf8"),
    fs.readFile(path.join(skillRoot, "references", "agent-execution-contract.md"), "utf8"),
  ]);

  assert.match(skill, /^---\s+name: proposal-ppt-maker\s+description: [^]*?---/);
  for (const trigger of ["제안서", "RFP", "PowerPoint", "PPTX", "HWPX"]) assert.ok(skill.includes(trigger), `missing trigger ${trigger}`);
  for (const gate of ["장표 범위와 요구사항 ID를 가장 먼저 확정한다", "장표 단위를 구분한다", "방향을 승인받는다", "가로형(`landscape`)", "세로형(`portrait`)", "와이어프레임"]) {
    assert.ok(skill.includes(gate), `missing approval rule ${gate}`);
  }
  assert.match(skill, /색상을 묻지 않는다/);
  assert.match(skill, /첨부 이미지.*구조와 배치.*색상.*타이포그래피.*문구.*무시/s);
  assert.match(skill, /superpowers.*요구하거나 호출하지 않는다/);
  assert.match(skill, /governing_message.*`니다\.`/);
  assert.match(skill, /요구사항 해석은 내부 작업/);
  assert.match(skill, /content\.conclusion/);
  assert.match(skill, /가로형 자산.*세로형/);
  assert.match(skill, /내용 도식으로 먼저 사용/);
  assert.match(skill, /불릿 옆에 장식만 붙이는 방식은 후순위/);
  assert.match(skill, /모든 문장을 사각형에 넣지 않는다/);
  assert.match(skill, /스크린샷, 캡처 이미지, PNG\/JPG 래스터/);
  assert.match(skill, /그룹 해제/);
  assert.match(skill, /native_powerpoint_shapes/);
  assert.match(skill, /상세 아키텍처 필요/);
  assert.match(skill, /p:pic/);
  assert.match(skill, /p:grpSp/);
  assert.match(skill, /네이티브 도형의 논리적 그룹/);
  assert.match(skill, /그룹 해제 후에도 각 도형과 텍스트가 개별 편집 가능/);
  assert.match(skill, /복잡한 아키텍처는 설명 우선/);
  assert.match(skill, /architecture_treatment/);
  assert.match(skill, /content\.explanation/);
  assert.match(skill, /나노바나나\/imagegen/);
  assert.match(skill, /간단한 도식.*부연설명/s);
  assert.match(skill, /도식 라벨.*짧게/s);
  assert.match(skill, /가독성 한도까지 정보량/s);
  assert.match(skill, /큰 빈 패널.*금지/s);
  assert.match(skill, /네이티브 도식.*끝까지 구성/s);
  assert.match(skill, /steps\[\].*step_details\[\]/s);
  for (const blockType of [
    "matrix_table",
    "metric_dashboard",
    "scope_outcome_mapping",
    "blueprint_flow",
    "chevron_pipeline",
    "gantt_roadmap",
  ]) assert.ok(io.includes(blockType), `missing block type ${blockType}`);
  assert.match(io, /block_pool_auto/);
  assert.match(io, /content\.explanation.*부연설명/s);
  assert.match(io, /step_details\[\].*동일 길이/s);
  // 내용을 먼저 확정하고 그다음에 그릇을 고르는 순서가 규칙으로 남아 있어야 한다.
  assert.match(skill, /블록별 내용을 먼저 확정하고 그다음에 그릇을 고른다/);
  assert.match(skill, /확정한 내용에 맞는 블록 타입을 고른다/);
  // 승인은 두 단계다. 1차 구조 승인 없이 2차 상세화를 시작하지 않는다.
  assert.match(skill, /structure_approved/);
  assert.match(skill, /2차 승인을 받은 뒤에만.*approved.*최종 렌더링/s);
  // pattern-library 적용 경로는 동결이고, 참고는 슬라이드 레퍼런스로 한다.
  assert.match(skill, /`tools\/pattern-library` 자산 적용 경로는 동결 상태다/);
  assert.match(skill, /참고는 슬라이드 레퍼런스로 한다/);
  assert.match(skill, /자산 적용이 거부되면 그 사유를 보고하고 네이티브 도형으로 해당 블록을 완성/);
  assert.match(skill, /scripts\/verify-skill\.mjs/);
  assert.match(skill, /scripts\/run-proposal\.mjs/);
  assert.match(skill, /요구사항 ID.*가장 먼저/);
  assert.match(skill, /별도.*localhost.*열지 않는다/);
  assert.match(skill, /8쪽 이하.*직접 실행/);
  assert.match(skill, /검토.*1회/);
  assert.match(skill, /selected.*loaded.*applied.*fidelity_passed/);
  assert.match(skill, /최소 5개의 독립된 내용 상자/);
  assert.match(skill, /density: high.*필수/);
  assert.match(skill, /같은 카드 형태를 반복하지 않는다/);
  assert.match(skill, /요구사항마다 최종 산출물 폴더를 하나씩 만들지 않는다/);
  assert.ok(skill.includes("tools/slide-renderer"));
  assert.ok(skill.includes("tools/pattern-library"));

  for (const input of ["input/requirement.json", "blueprint/slide-blueprint.json", "mapping/asset-mapping.json"]) assert.ok(io.includes(input), `missing input ${input}`);
  for (const field of ["slide_scope", "primary_requirement_id", "requirement_ids", "architecture_treatment", "content.explanation"]) assert.ok(io.includes(field), `missing contract field ${field}`);
  for (const output of ["wireframe.png", "final-slide.png", "verification-report.json", ".pptx"]) assert.ok(io.includes(output), `missing output ${output}`);
  assert.match(io, /render_mode.*native_powerpoint_shapes/);
  assert.match(io, /embedded_media_count: 0/);
  assert.match(io, /picture_shape_count: 0/);
  assert.match(io, /grouped_picture_shape_count: 0/);
  assert.match(io, /grouped_media_count: 0/);
  assert.match(io, /`group_shape_count`는 정보성 지표이며 0일 필요가 없다/);
  assert.match(io, /theme/);
  assert.match(io, /renderer_key/);
  assert.match(io, /selected.*loaded.*applied.*fidelity_passed/);
  assert.match(io, /Close-out과 최종 전달 구조/);
  assert.match(io, /요구사항 장표마다 별도 전달 폴더를 만들지 않는다/);
  assert.ok(io.includes("tools/slide-renderer"));
  assert.ok(io.includes("tools/pattern-library"));

  for (const mode of ["semantic", "structural", "decorative"]) assert.ok(assetSelection.includes(`\`${mode}\``), `missing reuse mode ${mode}`);
  assert.match(assetSelection, /내용 도식 우선/);
  assert.match(assetSelection, /원본이 가로형이고 대상이 세로형이다.*폴백 사유가 아니다/);
  assert.match(assetSelection, /화면 캡처 또는 스크린샷 붙여넣기/);
  assert.match(assetSelection, /원본 SVG 파일 직접 삽입/);
  assert.match(assetSelection, /그룹 해제하도록 사용자에게 요구/);
  assert.match(assetSelection, /네이티브 PowerPoint 도형끼리의 논리적 그룹화/);
  assert.match(assetSelection, /그룹 내부에 `p:pic`, SVG, 래스터 이미지, 미디어 관계가 없다/);
  assert.match(assetSelection, /architecture_required/);
  assert.match(assetSelection, /text_explainer/);
  assert.match(assetSelection, /generated_visual_with_text/);
  assert.match(assetSelection, /imagegen/);
  assert.match(assetSelection, /간단한 도식.*부연설명/s);

  assert.match(portraitProposal, /모든 `portrait` 청사진에 `governing_message`/);
  assert.match(portraitProposal, /반드시 `니다\.`로 끝낸다/);
  assert.match(portraitProposal, /불릿 자체를 도식 노드의 라벨로/);
  assert.match(portraitProposal, /스크린샷, 래스터 이미지, SVG 직접 삽입, 편집 불가능한 그룹 그림/);
  assert.match(portraitProposal, /네이티브 도형과 텍스트는 이동·복제 편의를 위해 논리적으로 그룹화/);
  assert.match(portraitProposal, /content\.explanation/);
  assert.match(portraitProposal, /text_explainer/);
  assert.match(portraitProposal, /최소 5개의 독립된 내용 상자/);
  assert.match(portraitProposal, /정보 밀도.*높게/);
  assert.match(portraitProposal, /`3\+2`, `2\+2\+1`/);

  assert.match(metadata, /display_name: "Proposal PPT Maker"/);
  assert.match(metadata, /default_prompt: "Use \$proposal-ppt-maker/);
  assert.match(metadata, /requirement IDs first/i);
  assert.match(metadata, /built-in blue palette/i);
  assert.match(metadata, /one review round/i);
  for (const field of ["requirement_ids", "slide_scope", "palette", "approved_asset_mappings", "forbidden_actions", "time_budget_minutes", "max_review_rounds", "completion_criteria"]) {
    assert.ok(agentContract.includes(field), `missing agent contract field ${field}`);
  }
  assert.match(agentContract, /validate-agent-brief\.mjs/);
});

test("ingest, search, and planning stay independent with optional structure references", async () => {
  const [ingest, search, planner, maker, readme] = await Promise.all([
    fs.readFile(path.join(workbenchRoot, "skills", "proposal-ppt-ingest", "SKILL.md"), "utf8"),
    fs.readFile(path.join(workbenchRoot, "skills", "proposal-reference-search", "SKILL.md"), "utf8"),
    fs.readFile(path.join(workbenchRoot, "skills", "proposal-slide-planner", "SKILL.md"), "utf8"),
    fs.readFile(path.join(workbenchRoot, "skills", "proposal-ppt-maker", "SKILL.md"), "utf8"),
    fs.readFile(path.join(workbenchRoot, "README.md"), "utf8"),
  ]);

  assert.match(ingest, /독립 인제스트/);
  assert.match(ingest, /검색이나 장표 기획을 호출하지 않는다/);
  assert.match(search, /선택 결과를 보고하고 종료/);
  assert.match(search, /proposal-slide-planner.*호출하지 않는다/s);
  assert.match(planner, /레퍼런스 없이/);
  assert.match(planner, /첨부 이미지/);
  assert.match(planner, /구조와 배치/);
  assert.match(planner, /색상.*타이포그래피.*문구.*무시/s);
  assert.match(planner, /업무 내용은 무시/);
  assert.match(planner, /이미지를 읽을 수 없으면.*다시 첨부.*자동 검색.*대체하지 않는다/s);
  assert.match(planner, /세션.*완료 상태.*selected_slide_ids.*확인/s);
  assert.match(planner, /세션이 없거나 완료되지 않았으면.*레퍼런스 없이 계속할지 묻는다/s);
  assert.match(planner, /검색이나 인제스트를 호출하지 않는다/);
  assert.match(planner, /개별 요구사항 1건당 1페이지/);
  assert.match(planner, /slide_scope: \"overview\"/);
  assert.match(planner, /복잡한 아키텍처는 설명 우선/);
  assert.match(planner, /content\.explanation/);
  assert.match(planner, /블록별 내용을 먼저 확정하고 그다음에 그릇을 고른다/);
  assert.match(planner, /확정한 내용에 맞는 블록 타입을 고른다/);
  assert.match(planner, /이 Skill은 1차 승인까지만 담당한다/);
  // 레퍼런스는 선택 사항이며 planner는 스스로 검색을 호출하지 않는다.
  assert.match(planner, /레퍼런스 없이도 RFP만으로 기획할 수 있다/);
  assert.match(planner, /동결 상태이므로 사용하지 않는다/);
  assert.match(planner, /pending_stage2/);
  assert.match(planner, /structure_approved/);
  assert.match(planner, /간단한 도식.*부연설명/s);
  assert.match(planner, /가독성 한도까지 정보량/s);
  assert.match(planner, /네이티브 도식.*끝까지 구성/s);
  assert.match(maker, /업무 내용은 무시/);
  assert.match(maker, /최종 장표에 삽입하지 않는다/);
  for (const color of ["#1769E0", "#123B78", "#4A8CF0", "#EEF5FF"]) {
    assert.ok(planner.includes(color), `planner missing default color ${color}`);
    assert.ok(maker.includes(color), `maker missing default color ${color}`);
  }
  assert.match(planner, /별도 팔레트나 템플릿이 없으면/);
  assert.match(maker, /사용자가 명시한 팔레트나 템플릿만 기본값을 덮어쓴다/);
  assert.match(readme, /인제스트와 검색은 각각 독립 실행/);
});

test("asset catalog keeps the import contract explicit", async () => {
  const catalogPath = path.resolve(rendererRoot, "..", "pattern-library", "unified-visual-module-catalog.json");
  const patternRoot = path.dirname(catalogPath);
  const manifestPath = path.resolve(rendererRoot, "..", "pattern-library", "asset-manifest.schema.json");
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.ok(Array.isArray(catalog));
  assert.equal(manifest.version, 2);
  const requiredFields = ["module_id", "display_name", "asset_kind", "module_type", "description", "design_traits", "use_cases", "search_tags", "renderer_key", "template", "usage_mode", "render_mode", "provenance_ref", "license", "license_status", "approved_at"];
  for (const field of requiredFields) {
    assert.ok(manifest.asset_required_fields.includes(field), `missing asset field ${field}`);
  }
  for (const kind of ["block_shell", "diagram_recipe", "composite_block", "icon_asset", "media_frame", "photo_asset"]) assert.ok(manifest.asset_kind_values.includes(kind), `missing asset kind ${kind}`);
  for (const field of ["source_path", "original_file", "raw_text", "raw_texts"]) assert.ok(manifest.forbidden_permanent_fields.includes(field), `missing forbidden field ${field}`);
  assert.ok(manifest.renderer_key_values.includes("responsive_native_template"));
  for (const asset of catalog) {
    for (const field of requiredFields) assert.ok(Object.hasOwn(asset, field), `${asset.module_id} missing asset field ${field}`);
    for (const field of manifest.forbidden_permanent_fields) assert.equal(Object.hasOwn(asset, field), false, `${asset.module_id} contains forbidden field ${field}`);
    assert.ok(!/[A-Z]:\\\\|\\.pptx\\b|\\.potx\\b/.test(JSON.stringify(asset)), `${asset.module_id} contains source path or filename`);
    await fs.access(path.join(patternRoot, asset.template));
  }
});
