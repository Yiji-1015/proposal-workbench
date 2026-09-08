import assert from "node:assert/strict";
import test from "node:test";
import { compileRenderModel } from "../src/compile-render-model.mjs";
import { SKELETONS, composeShapePlan } from "../src/compose-shape-plan.mjs";

const BLOCKS = [
  { block_id: "scope", role: "scope", content: { headline: "4.7TB 지식자산을 전처리 대상으로 통합", summary: "전자결재문서·매뉴얼·지침서·사규 등 4.7TB 규모의 문서를 한 파이프라인으로 수집하고 처리 범위를 착수 2개월 안에 확정합니다." } },
  { block_id: "filter", role: "stage", content: { headline: "중복·보안 선별", summary: "중복문서와 최고보안등급 문서를 제외해 노출 위험과 불필요한 처리를 줄입니다." } },
  { block_id: "transform", role: "stage", content: { headline: "청킹·태깅·OCR", summary: "청킹, 메타데이터·보안등급 태깅, 불용어 제거에 표 전처리와 도면 인식을 더합니다." } },
  { block_id: "store", role: "stage", content: { headline: "이중 검색 저장", summary: "청크와 메타는 표준 스키마에, 임베딩은 벡터 DB에 나눠 저장해 두 검색을 모두 지원합니다." } },
  { block_id: "refresh", role: "control", content: { headline: "상시 갱신과 모델 독립", summary: "신규·개정 문서를 증분 처리해 최신 상태를 유지하고, 모델이 바뀌어도 재임베딩만으로 기존 데이터를 재사용합니다." } },
  { block_id: "quality", role: "outcome", content: { headline: "전처리 품질 통제와 산출물", summary: "파싱 실패율과 OCR 정확도를 샘플 검증으로 관리하고 결과를 개발산출물과 사용자 매뉴얼로 전달합니다." } },
];

function composition(overrides = {}) {
  return {
    skeleton: "C-deep",
    rationale: "범위 밴드에서 3열 파이프라인으로, 저장 결과가 하단 두 블록으로 내려간다.",
    signature: "portrait-test-scope-band-pipeline-v1",
    blocks: {
      scope: { slot: "band", style: "navy", items: [{ type: "metric", value: "4.7TB", label: "전처리 대상 규모" }] },
      filter: { slot: "col-1", style: "pale", accent: "stripe", items: [{ type: "chips", labels: ["중복 문서 제거", "최고보안등급 제외", "개인정보 비식별화"] }] },
      transform: { slot: "col-2", style: "pale", accent: "stripe", items: [{ type: "chips", labels: ["청킹·메타 태깅", "표 구조 전처리", "도면 인식 OCR"] }] },
      store: { slot: "col-3", style: "pale", accent: "stripe", items: [{ type: "chips", labels: ["벡터 DB 적재", "키워드 인덱스", "보안등급 권한 매핑"] }] },
      refresh: { slot: "foot-left", items: [{ type: "loop", labels: ["신규 문서\n수집", "증분\n전처리", "색인\n반영"], caption: "모델 교체 시 재임베딩만 수행", gap: 40 }, { type: "note", pin: "bottom", label: "일정 연계", body: "범위 확정 M1~2 · 추가자료 검토 M6~8" }] },
      quality: { slot: "foot-right", style: "pale", items: [{ type: "gauges", rows: [["파싱 실패율", "형식별 실패 문서 격리·재처리"], ["OCR 정확도", "표·도면 샘플 검증"]], gap: 28 }, { type: "chips", layout: "row", fill: "primary", labels: ["개발산출물", "사용자 매뉴얼"] }] },
    },
    connectors: [
      { from: "filter", to: "transform", from_side: "right", to_side: "left" },
      { from: "transform", to: "store", from_side: "right", to_side: "left" },
      { from: "scope", to: "transform", from_side: "bottom", to_side: "top", stroke: "accent" },
    ],
    ...overrides,
  };
}

function blueprint(comp = composition()) {
  return {
    requirement: { requirement_id: "FUR-001", requirement_name: "데이터 파싱 & 전처리", requirement_summary: "4.7TB 문서를 AI 활용 가능한 상태로 변환한다.", rfp_facts: { quantitative_metrics: [] } },
    blueprint: {
      requirement_id: "FUR-001", slide_scope: "requirement", primary_requirement_id: "FUR-001", requirement_ids: ["FUR-001"],
      slide_title: "4.7TB 지식자산의 AI 전처리 체계", governing_message: "문서 특성별 전처리와 모델 독립적 저장 구조로 지식자산을 검색 가능한 AI 데이터로 전환합니다.",
      orientation: "portrait", layout_family: "agent_authored", density: "high", blocks: BLOCKS,
      protected_metrics: [{ metric_id: "M1", label: "규모", value_text: "4.7TB", source_refs: [] }],
      composition: comp, status: "approved",
    },
  };
}

test("composes a skeleton-based composition into a plan that passes the layout gate", () => {
  const plan = composeShapePlan(composition(), { blocks: BLOCKS, orientation: "portrait" });
  assert.ok(plan.primitives.length >= 40);
  assert.equal(plan.composition_signature, "portrait-test-scope-band-pipeline-v1");
  const model = compileRenderModel(blueprint());
  assert.equal(model.shapePlanSource, "composition");
  assert.ok(model.shapePlan.layoutQuality.surfaceCoverage >= 0.6);
  assert.ok(model.shapePlan.layoutQuality.largestEmptyBand <= 120);
  // 블록마다 헤드라인과 본문이 별도 텍스트로 나온다.
  for (const block of BLOCKS) {
    assert.ok(plan.primitives.some((primitive) => primitive.name === `${block.block_id}-headline` && primitive.bold));
    assert.ok(plan.primitives.some((primitive) => primitive.name === `${block.block_id}-body`));
  }
  // 연결선은 블록 이름을 표면 도형으로 풀어 준다.
  const link = plan.primitives.find((primitive) => primitive.kind === "connector" && primitive.from === "filter-surface");
  assert.equal(link.to, "transform-surface");
});

test("an explicit shape_plan still wins over composition", () => {
  const inputs = blueprint();
  const plan = composeShapePlan(composition(), { blocks: BLOCKS, orientation: "portrait" });
  inputs.blueprint.shape_plan = plan;
  const model = compileRenderModel(inputs);
  assert.equal(model.shapePlanSource, "shape_plan");
});

test("reports which block overflows its slot and by how much", () => {
  const comp = composition();
  comp.blocks.filter.items[0].labels.push("추가 라벨 하나", "추가 라벨 둘", "추가 라벨 셋", "추가 라벨 넷");
  assert.throws(() => composeShapePlan(comp, { blocks: BLOCKS, orientation: "portrait" }), /composition block filter overflows its slot by \d+px/);
});

test("names unknown slots, skeletons, and item types", () => {
  const badSlot = composition();
  badSlot.blocks.scope.slot = "header";
  assert.throws(() => composeShapePlan(badSlot, { blocks: BLOCKS, orientation: "portrait" }), /unknown slot header; available: band, col-1/);

  assert.throws(() => composeShapePlan(composition({ skeleton: "Z" }), { blocks: BLOCKS, orientation: "portrait" }), /skeleton Z is not a portrait skeleton/);

  const badItem = composition();
  badItem.blocks.refresh.items = [{ type: "wheel" }];
  assert.throws(() => composeShapePlan(badItem, { blocks: BLOCKS, orientation: "portrait" }), /unknown item type wheel; use chips, loop/);

  const doubleSlot = composition();
  doubleSlot.blocks.store.slot = "col-2";
  assert.throws(() => composeShapePlan(doubleSlot, { blocks: BLOCKS, orientation: "portrait" }), /assigns slot col-2 to more than one block/);
});

test("accepts an explicit rect instead of a skeleton slot", () => {
  const comp = composition({ skeleton: undefined });
  const slots = SKELETONS.portrait["C-deep"].slots;
  for (const [blockId, spec] of Object.entries(comp.blocks)) spec.slot = { ...slots[spec.slot] };
  const plan = composeShapePlan(comp, { blocks: BLOCKS, orientation: "portrait" });
  assert.ok(plan.primitives.some((primitive) => primitive.name === "scope-surface" && primitive.position.top === 180));
});

test("every skeleton slot stays inside the body safe area", () => {
  for (const [orientation, family] of Object.entries(SKELETONS)) {
    const canvas = orientation === "portrait" ? { width: 720, height: 1280 } : { width: 1280, height: 720 };
    const bodyTop = orientation === "portrait" ? 166 : 150;
    for (const [name, skeleton] of Object.entries(family)) {
      for (const [slot, rect] of Object.entries(skeleton.slots)) {
        assert.ok(rect.left >= 24 && rect.top >= bodyTop && rect.left + rect.width <= canvas.width - 24 && rect.top + rect.height <= canvas.height - 50, `${orientation} ${name} ${slot} leaves the safe area`);
      }
    }
  }
});
