import assert from "node:assert/strict";
import test from "node:test";
import { estimateTextFit, normalizeAgentShapePlan } from "../src/agent-shape-plan.mjs";
import { compliantShapePlan } from "./helpers/compliant-shape-plan.mjs";

const canvas = { width: 720, height: 1280, orientation: "portrait" };
const theme = {
  primary: "#1769E0", navy: "#123B78", accent: "#4A8CF0", pale: "#EEF5FF",
  surface: "#F3F6FA", ink: "#172033", gray: "#5F6B7A", line: "#C8D2DF", white: "#FFFFFF",
};

const BLOCKS = ["scope", "flow", "control", "quality", "outcome"].map((id) => ({ block_id: id, content: { headline: `${id} 헤드라인`, summary: `${id} 블록의 본문 설명입니다.` } }));

function plan(overrides = {}) {
  return { ...compliantShapePlan(BLOCKS), ...overrides };
}

function options(overrides = {}) {
  return {
    canvas,
    blockIds: new Set(BLOCKS.map((block) => block.block_id)),
    blockRequiredTexts: new Map(BLOCKS.map((block) => [block.block_id, []])),
    protectedMetricValues: [],
    theme,
    ...overrides,
  };
}

// 단일 블록 검사용 최소 구성. 큰 표면 하나가 본문 영역을 채우고 헤드라인·본문 텍스트와
// 칩 다섯 개로 도형 하한(8개)을 넘긴다.
function singleBlockPlan(extraPrimitives = [], overrides = {}) {
  return {
    design_rationale: "중심 허브에서 통제 축으로 시선을 내린다.",
    composition_signature: "portrait-test-composition-v1",
    primitives: [
      { kind: "roundRect", name: "surface", block_id: "alpha", position: { left: 36, top: 180, width: 648, height: 1040 }, fill: "pale", stroke: "line" },
      { kind: "text", name: "headline", block_id: "alpha", position: { left: 60, top: 200, width: 600, height: 40 }, text: "알파 헤드라인", font_size: 18, bold: true, color: "navy" },
      { kind: "text", name: "body", block_id: "alpha", position: { left: 60, top: 250, width: 600, height: 200 }, text: "알파 본문 설명입니다.", font_size: 13 },
      ...[0, 1, 2, 3, 4].map((index) => ({ kind: "roundRect", name: `chip-${index}`, block_id: "alpha", position: { left: 60 + index * 120, top: 480, width: 100, height: 40 }, fill: "white", stroke: "primary" })),
      ...extraPrimitives,
    ],
    ...overrides,
  };
}

function singleOptions(overrides = {}) {
  return options({ blockIds: new Set(["alpha"]), blockRequiredTexts: new Map([["alpha", []]]), ...overrides });
}

test("accepts a compliant two-column plan and reports layout quality", () => {
  const normalized = normalizeAgentShapePlan(plan(), options());
  assert.equal(normalized.primitives.length, 15);
  assert.ok(normalized.layoutQuality.surfaceCoverage >= 0.6);
  assert.ok(normalized.layoutQuality.largestEmptyBand <= 120);
  assert.ok(normalized.layoutQuality.sideBySidePairs >= 1);
});

test("rejects a plan below the primitive floor and names the shortfall", () => {
  const short = singleBlockPlan();
  short.primitives = short.primitives.slice(0, 7);
  assert.throws(() => normalizeAgentShapePlan(short, singleOptions()), /at least 8 native primitives; found 7/);
});

test("moves connectors behind their endpoints instead of demanding authoring order", () => {
  const authored = singleBlockPlan();
  authored.primitives.unshift({ kind: "connector", name: "link", block_id: "alpha", position: { left: 160, top: 490, width: 20, height: 10 }, from: "chip-0", to: "chip-1", stroke: "accent" });
  const normalized = normalizeAgentShapePlan(authored, singleOptions());
  assert.equal(normalized.primitives.at(-1).name, "link");
  assert.equal(normalized.primitives.filter((primitive) => primitive.kind === "connector").length, 1);
});

test("still rejects connectors that point at another connector", () => {
  const authored = singleBlockPlan([
    { kind: "connector", name: "link", block_id: "alpha", position: { left: 160, top: 490, width: 20, height: 10 }, from: "chip-0", to: "chip-1", stroke: "accent" },
    { kind: "connector", name: "bad", block_id: "alpha", position: { left: 280, top: 490, width: 20, height: 10 }, from: "link", to: "chip-2", stroke: "accent" },
  ]);
  assert.throws(() => normalizeAgentShapePlan(authored, singleOptions()), /endpoints must be drawable shapes/);
});

test("treats bullet, dash and spacing variants as the same preserved content", () => {
  const authored = singleBlockPlan();
  authored.primitives[2].text = "인증 상태 확인 · 세션 유효성\n처리 시간 30초 - 채널 3개";
  const normalized = normalizeAgentShapePlan(authored, singleOptions({
    blockRequiredTexts: new Map([["alpha", [
      { field: "headline", value: "인증  상태 확인•세션 유효성" },
      { field: "bullets[0]", value: "처리 시간 30초 — 채널 3개" },
    ]]]),
  }));
  assert.equal(normalized.primitives.length, 8);
});

test("names the missing block and value when content is dropped", () => {
  assert.throws(
    () => normalizeAgentShapePlan(singleBlockPlan(), singleOptions({
      blockRequiredTexts: new Map([["alpha", [{ field: "headline", value: "빠진 문장입니다" }]]]),
    })),
    /missing content\.headline for block alpha.*빠진 문장입니다/s,
  );
});

// ---------- 배치 품질 게이트 ----------

// 한 줄 스택: 블록마다 상자 하나와 텍스트 하나를 세로로 쌓고 아래를 비운 구성. 실제로
// 나왔던 불량 장표를 그대로 옮긴 것이다.
function stackedPlan() {
  return {
    design_rationale: "위에서 아래로 순서대로 배치한다.",
    composition_signature: "portrait-single-column-stack-v1",
    primitives: BLOCKS.flatMap((block, index) => {
      const top = 184 + index * 178;
      return [
        { kind: index === 1 ? "ellipse" : "roundRect", name: `${block.block_id}-surface`, block_id: block.block_id, position: { left: 70, top, width: 580, height: 120 }, fill: index % 2 ? "primary" : "pale", stroke: "line" },
        { kind: "text", name: `${block.block_id}-text`, block_id: block.block_id, position: { left: 100, top: top + 30, width: 520, height: 60 }, text: `${block.content.headline}\n${block.content.summary}`, font_size: 14, bold: true, alignment: "center" },
      ];
    }),
  };
}

test("rejects a single-column stack that leaves the bottom of the slide empty", () => {
  assert.throws(() => normalizeAgentShapePlan(stackedPlan(), options()), (error) => {
    assert.match(error.message, /layout quality gate/);
    assert.match(error.message, /empty horizontal band/);
    assert.match(error.message, /single column/);
    assert.match(error.message, /bold headline text.*smaller body text/);
    return true;
  });
});

test("rejects surfaces that cover too little of the body area", () => {
  const sparse = plan();
  for (const primitive of sparse.primitives) {
    if (primitive.kind === "text") continue;
    primitive.position = { ...primitive.position, width: Math.round(primitive.position.width * 0.55), height: Math.round(primitive.position.height * 0.55) };
  }
  for (const primitive of sparse.primitives) {
    if (primitive.kind !== "text") continue;
    primitive.position = { ...primitive.position, width: 120, height: 24 };
    primitive.text = "짧은 라벨";
  }
  assert.throws(() => normalizeAgentShapePlan(sparse, options()), /cover \d+% of the body safe area; at least 60% is required/);
});

test("rejects a block whose headline and body share one text primitive", () => {
  const merged = plan();
  merged.primitives = merged.primitives.filter((primitive) => primitive.name !== "scope-body");
  assert.throws(() => normalizeAgentShapePlan(merged, options()), /block scope needs a bold headline text of at least 14pt and a smaller body text/);
});

test("rejects text that overflows its box using real Malgun Gothic widths", () => {
  const overflow = plan();
  const body = overflow.primitives.find((primitive) => primitive.name === "scope-body");
  body.position = { ...body.position, width: 200, height: 30 };
  body.text = "미리보기에서는 한 줄로 보이지만 파워포인트에서는 세 줄로 넘치는 긴 본문 문장입니다.";
  assert.throws(() => normalizeAgentShapePlan(overflow, options()), /text does not fit its box: scope-body \(\d+ lines needed, 1 fit at 12pt/);
});

test("rejects a paragraph crammed into an ellipse but allows a short label in a small circle", () => {
  const crammed = plan();
  const body = crammed.primitives.find((primitive) => primitive.name === "control-body");
  body.text = "타원 안에 긴 문단을 넣으면 곡선 바깥으로 글자가 밀려나 잘린다. 검색 신뢰도 점수와 원문 근거를 함께 제공해 사용자가 결과의 활용 수준을 판단하도록 지원합니다. 할루시네이션 정제와 필터링을 적용합니다.";
  body.position = { left: 46, top: body.position.top, width: 292, height: 200 };
  assert.throws(() => normalizeAgentShapePlan(crammed, options()), /control-body needs about \d+x\d+ but ellipse control-surface only offers/);

  const labelled = singleBlockPlan([
    { kind: "ellipse", name: "dot", block_id: "alpha", position: { left: 100, top: 600, width: 60, height: 60 }, fill: "primary", stroke: "primary" },
    { kind: "text", name: "dot-label", block_id: "alpha", position: { left: 90, top: 618, width: 80, height: 24 }, text: "질문", font_size: 11, bold: true, color: "white", alignment: "center" },
  ]);
  assert.doesNotThrow(() => normalizeAgentShapePlan(labelled, singleOptions()));
});

test("estimates Korean text width from Malgun Gothic metrics", () => {
  // 17pt 굵은 맑은 고딕에서 "목적 기반 Agent 자동 호출"은 약 279px다. 228px 상자에는 두 줄이 필요하다.
  const fit = estimateTextFit("목적 기반 Agent 자동 호출", { left: 0, top: 0, width: 228, height: 30 }, 17);
  assert.equal(fit.neededLines, 2);
  assert.equal(fit.allowedLines, 1);
  assert.equal(fit.fits, false);
  const wide = estimateTextFit("목적 기반 Agent 자동 호출", { left: 0, top: 0, width: 300, height: 30 }, 17);
  assert.equal(wide.fits, true);
});
