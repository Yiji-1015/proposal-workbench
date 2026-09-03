# Proposal Block Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 요구사항별 장표가 표·지표·매핑·에이전트 흐름·셰브론·일정 블록을 제한된 선택 풀에서 조합하고, 세로·가로 캔버스에 겹침 없이 배치하도록 만든다.

**Architecture:** 기존 `role`은 의미 역할로 유지하고 `visual_category`를 선택 가능한 블록 타입으로 해석한다. 중앙 레지스트리가 타입별 콘텐츠 계약, 기본 renderer key, 폭·높이 메타데이터를 제공하며 `block_pool_auto` 레이아웃이 이를 이용해 full/half 행을 결정한다. 기존 고정 레이아웃과 청사진은 그대로 동작하고, 새 타입만 명시적으로 새 경로를 사용한다.

**Tech Stack:** Node.js 22.5+, native `node:test`, `@oai/artifact-tool`, PowerPoint 네이티브 도형, 기존 JSON 청사진·자산 카탈로그

**Spec:** `docs/superpowers/specs/2026-09-01-block-pool-design.md`

## Global Constraints

- 초기 풀은 `matrix_table`, `metric_dashboard`, `scope_outcome_mapping`, `blueprint_flow`, `chevron_pipeline`, `gantt_roadmap` 6개다.
- 기존 `visual_category`를 블록 타입으로 활용해 기존 청사진과 호환한다.
- 최소 5개 내용 상자와 `density: high` 규칙은 유지한다.
- 새 `block_pool_auto` 레이아웃은 기존 고정 레이아웃과 분리한다.
- 모든 핵심 문구·수치·근거는 편집 가능한 PowerPoint 네이티브 도형과 텍스트로 유지한다.
- 새 npm 의존성, SVG 삽입, 이미지 기반 핵심 정보 표현은 추가하지 않는다.
- 복잡한 아키텍처는 `text_explainer`를 우선하고, `generated_visual_with_text`는 보조 시각으로만 허용한다.
- 자산이 없을 때는 `fallback_native_shapes`를 기록하고, 기존 `selected_candidate` 상태와 검증 필드는 유지한다.
- 기존 `three_column_with_bottom_band`, 기존 역할 렌더링, 기존 JSON 입력은 회귀 없이 유지한다.

---

### Task 1: 블록 타입 레지스트리와 콘텐츠 계약

**Files:**
- Create: `tools/slide-renderer/src/block-types.mjs`
- Modify: `tools/slide-renderer/src/compile-render-model.mjs:1-190`
- Create: `tools/slide-renderer/tests/block-types.test.mjs`
- Modify: `tools/slide-renderer/tests/compile-render-model.test.mjs`

**Interfaces:**
- `getBlockTypeDefinition(type: string): BlockTypeDefinition | null`
- `listBlockTypeDefinitions(): BlockTypeDefinition[]`
- `validateBlockTypeContent(type: string, content: object): object`
- `compileRenderModel(...)`의 정규화 블록은 기존 필드에 `blockType: string | null`, `blockTypeDefinition: BlockTypeDefinition | null`을 추가한다.
- `BlockTypeDefinition`은 `id`, `rendererKey`, `preferredSpan`, `minItems`, `maxItems`, `minHeight`, `preferredHeight`, `contentKind`를 가진다.

- [ ] **Step 1: 레지스트리와 타입별 계약의 실패 테스트를 작성한다.**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  getBlockTypeDefinition,
  listBlockTypeDefinitions,
  validateBlockTypeContent,
} from "../src/block-types.mjs";

test("lists the six selectable block types", () => {
  assert.deepEqual(listBlockTypeDefinitions().map((item) => item.id), [
    "matrix_table",
    "metric_dashboard",
    "scope_outcome_mapping",
    "blueprint_flow",
    "chevron_pipeline",
    "gantt_roadmap",
  ]);
});

test("validates a table row against its columns", () => {
  assert.throws(
    () => validateBlockTypeContent("matrix_table", { columns: ["구분", "제안"], rows: [{ label: "수집", cells: [] }] }),
    /matrix_table.*cells.*columns/i,
  );
});

test("returns null for legacy visual categories", () => {
  assert.equal(getBlockTypeDefinition("card_grid"), null);
});
```

- [ ] **Step 2: 새 테스트가 아직 없는 레지스트리를 이유로 실패하는지 확인한다.**

Run: `node --test tools/slide-renderer/tests/block-types.test.mjs`

Expected: FAIL because `../src/block-types.mjs` is not present.

- [ ] **Step 3: 6개 타입의 최소 레지스트리와 콘텐츠 검증기를 구현한다.**

`block-types.mjs`는 다음 계약을 사용한다.

```js
{
  id: "matrix_table",
  rendererKey: "matrix_table",
  preferredSpan: "full",
  minItems: 1,
  maxItems: 10,
  minHeight: { portrait: 170, landscape: 130 },
  preferredHeight: { portrait: 250, landscape: 190 },
  contentKind: "table",
}
```

검증 대상은 다음으로 고정한다.

- `matrix_table`: `columns` 2~5개, `rows` 1~10개, 각 `cells` 길이는 `columns.length - 1`
- `metric_dashboard`: `metrics` 1~6개, 각 항목에 `label`과 `value_text`
- `scope_outcome_mapping`: `left`와 `right` 각각 1~6개, `links`가 있으면 유효한 인덱스만 허용
- `blueprint_flow`: `inputs` 1~3개, `steps` 2~8개, `outputs` 1~3개
- `chevron_pipeline`: `steps` 2~8개, `criteria`와 `gates`는 있으면 단계 수를 넘지 않음
- `gantt_roadmap`: `time_units` 2~12개, 행의 `start`·`end`는 기간 인덱스 범위 내이며 `start < end`

모든 문자열 배열은 공백 문자열을 제거하고, 필수 배열이 없으면 타입명과 필드명을 포함한 `TypeError`를 던진다.

- [ ] **Step 4: 컴파일러가 새 타입만 검증하고 기존 타입은 그대로 통과하도록 연결한다.**

`normalizeBlock()`에서 `visual_category`를 읽어 `getBlockTypeDefinition()`을 호출한다. 새 타입이면 `validateBlockTypeContent()`를 실행하고 정규화 결과에 `blockType`과 `blockTypeDefinition`을 포함한다. 레거시 타입이면 두 값 모두 `null`로 둔다.

`layout_family === "block_pool_auto"`인 경우에만 다음을 추가 검증한다.

```js
if (blueprint.layout_family === "block_pool_auto") {
  if (blueprint.blocks.length < 5 || blueprint.blocks.length > 6) {
    throw new Error("block_pool_auto requires 5 to 6 blocks");
  }
  for (const block of blueprint.blocks) {
    if (!getBlockTypeDefinition(block.visual_category)) {
      throw new Error(`block_pool_auto does not support visual_category ${block.visual_category}`);
    }
    if (block.slot !== "auto") throw new Error(`block_pool_auto requires slot auto for ${block.block_id}`);
  }
}
```

- [ ] **Step 5: 컴파일러 계약 테스트를 실행해 기존·신규 경로를 함께 확인한다.**

Run: `node --test tools/slide-renderer/tests/block-types.test.mjs tools/slide-renderer/tests/compile-render-model.test.mjs`

Expected: PASS for legacy fixture, valid pool fixture, invalid content, invalid type, and invalid `slot` cases.

- [ ] **Step 6: 커밋한다.**

```powershell
git add tools/slide-renderer/src/block-types.mjs tools/slide-renderer/src/compile-render-model.mjs tools/slide-renderer/tests/block-types.test.mjs tools/slide-renderer/tests/compile-render-model.test.mjs
git commit -m "feat: define selectable proposal block types"
```

### Task 2: `block_pool_auto` 자동 배치

**Files:**
- Modify: `tools/slide-renderer/src/layouts.mjs:1-80`
- Modify: `tools/slide-renderer/tests/layouts.test.mjs`

**Interfaces:**
- `createLayoutPlan(model)`의 기존 반환 형태 `{ layoutKey, frames, processCells }`를 유지한다.
- 새 레이아웃은 `layoutKey: "block_pool_auto:portrait"` 또는 `"block_pool_auto:landscape"`를 반환한다.
- `model.blocks[].blockTypeDefinition.preferredSpan`과 방향별 `minHeight`·`preferredHeight`를 소비한다.

- [ ] **Step 1: 자동 배치의 경계·겹침 실패 테스트를 작성한다.**

```js
function overlaps(a, b) {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}

function poolBlock(blockId, span, minHeight = { portrait: 120, landscape: 90 }) {
  return {
    blockId,
    role: blockId,
    slot: "auto",
    steps: [],
    content: {},
    blockTypeDefinition: {
      id: blockId,
      preferredSpan: span,
      minHeight,
      preferredHeight: minHeight,
    },
  };
}

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
  for (const frame of frames) assert.ok(frame.left >= 0 && frame.top >= 0 && frame.left + frame.width <= 720 && frame.top + frame.height <= 1280);
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
```

- [ ] **Step 2: 테스트가 새 layout branch 부재로 실패하는지 확인한다.**

Run: `node --test tools/slide-renderer/tests/layouts.test.mjs`

Expected: the two new pool tests FAIL while all existing layout tests remain PASS.

- [ ] **Step 3: full/half 행 생성과 높이 배분을 구현한다.**

`layouts.mjs`에 `poolFrames(model)`을 추가한다.

- `full` 블록은 단독 행에 넣는다.
- `half` 블록은 순서대로 최대 2개를 한 행에 넣는다.
- 행별 최소 높이는 포함 블록의 방향별 `minHeight` 최댓값이다.
- 가용 높이에서 행 간 gap과 최소 높이를 뺀 값이 음수이면 `block_pool_auto cannot fit ...` 오류를 던진다.
- 남는 높이는 행의 `preferredHeight`까지 먼저 배분하고, 이후 모든 행에 균등 배분한다.
- 한 개만 남은 `half` 블록은 폭을 확장하지 않고 반쪽 폭으로 둔다.
- `margin`, `top`, `bottom`, `gap`은 기존 `genericFrames()`의 방향별 값을 재사용한다.

`createLayoutPlan()`은 `model.layoutFamily === "block_pool_auto"`이면 `poolFrames()`를 사용하고, 그 외 branch는 변경하지 않는다.

- [ ] **Step 4: 자동 배치 테스트를 실행한다.**

Run: `node --test tools/slide-renderer/tests/layouts.test.mjs`

Expected: all existing layout tests and the new bounds/overlap/overflow tests PASS.

- [ ] **Step 5: 커밋한다.**

```powershell
git add tools/slide-renderer/src/layouts.mjs tools/slide-renderer/tests/layouts.test.mjs
git commit -m "feat: add bounded pool block layout"
```

### Task 3: 6개 네이티브 renderer recipe 연결

**Files:**
- Modify: `tools/slide-renderer/src/asset-recipes.mjs:1-205`
- Modify: `tools/slide-renderer/tests/asset-rendering.test.mjs`

**Interfaces:**
- 기존 `resolveRendererKey(mapping, catalogItem)` 시그니처를 유지한다.
- 기존 `createAssetRecipe({ rendererKey, block, frame, theme })` 시그니처를 유지한다.
- 새 renderer key는 `matrix_table`, `metric_dashboard`, `scope_outcome_mapping`, `blueprint_flow`, `chevron_pipeline`, `gantt_roadmap`이다.
- 각 recipe는 기존 반환 형태 `{ rendererKey, requiredMotifs, producedMotifs, structureFingerprint, primitives }`를 반환한다.

- [ ] **Step 1: 새 renderer key와 모티프의 실패 테스트를 추가한다.**

```js
test("creates distinct native recipes for the six pool types", () => {
  const blocks = {
    matrix_table: { blockId: "table", content: { headline: "표", columns: ["구분", "제안"], rows: [{ label: "수집", cells: ["표준화"] }] } },
    metric_dashboard: { blockId: "metric", content: { headline: "지표", metrics: [{ label: "응답", value_text: "30초" }] } },
    scope_outcome_mapping: { blockId: "mapping", content: { headline: "범위", left: [{ label: "수집" }], right: [{ label: "대시보드" }] } },
    blueprint_flow: { blockId: "blueprint", content: { headline: "흐름", inputs: ["로그"], steps: ["파싱", "분석"], outputs: ["알림"] } },
    chevron_pipeline: { blockId: "chevron", content: { headline: "단계", steps: ["설계", "검증"] } },
    gantt_roadmap: { blockId: "gantt", content: { headline: "일정", time_units: ["M1", "M2"], rows: [{ label: "구축", start: 0, end: 2 }] } },
  };
  const recipes = Object.entries(blocks).map(([rendererKey, block]) => createAssetRecipe({ rendererKey, block: { ...block, steps: [], options: [] }, frame, theme }));
  assert.equal(new Set(recipes.map((recipe) => recipe.structureFingerprint)).size, 6);
  for (const recipe of recipes) assert.ok(recipe.requiredMotifs.every((motif) => recipe.producedMotifs.includes(motif)));
});
```

- [ ] **Step 2: 테스트가 미지원 renderer key로 실패하는지 확인한다.**

Run: `node --test tools/slide-renderer/tests/asset-rendering.test.mjs`

Expected: the new test FAILS on the first pool renderer while the existing tests PASS.

- [ ] **Step 3: 기존 카탈로그 타입을 새 renderer key로 매핑한다.**

`resolveRendererKey()`에 다음 매핑을 추가한다.

```js
if (moduleType === "metric_bars") return "metric_dashboard";
if (moduleType === "before_after_metric_table") return "matrix_table";
if (moduleType === "parallel_rows" || moduleType === "comparison_flow") return "scope_outcome_mapping";
if (moduleType === "system_flow") return "blueprint_flow";
if (moduleType === "chevron_process") return "chevron_pipeline";
if (moduleType === "gantt") return "gantt_roadmap";
```

명시적인 `mapping.renderer_key`가 있으면 기존처럼 지원 목록만 허용한다.

- [ ] **Step 4: 6개 recipe를 네이티브 primitive로 구현한다.**

각 recipe는 `titlePrimitive()`을 재사용한다.

- `matrix_table`: 프레임 안에 헤더 1행과 본문 셀을 같은 열 폭으로 배치하고, 첫 셀은 행 라벨로 강조한다.
- `metric_dashboard`: 1~6개 지표를 2열 또는 3열 타일로 배치하고, 값·증감·목표를 별도 텍스트로 둔다.
- `scope_outcome_mapping`: 좌측·우측 노드를 두 열에 배치하고, 링크 인덱스에 따라 중앙 연결선을 그린다.
- `blueprint_flow`: 입력 밴드, 번호가 붙은 단계, 도구·모델 밴드, 결과·Fallback 밴드를 위에서 아래로 배치한다.
- `chevron_pipeline`: 단계별 `chevron` primitive와 설명 텍스트를 만들고, `criteria`·`gates`가 있으면 하단 검증 행에 배치한다.
- `gantt_roadmap`: 기간 헤더와 행 라벨을 만들고 `start`·`end` 인덱스로 작업 바를 계산하며 `milestones`는 다이아몬드로 표시한다.

recipe의 primitive는 `rect`, `roundRect`, `ellipse`, `diamond`, `chevron`, `textbox`만 사용하고, 모든 색은 전달받은 theme 값에서 선택한다.

- [ ] **Step 5: recipe 테스트와 기존 palette 테스트를 실행한다.**

Run: `node --test tools/slide-renderer/tests/asset-rendering.test.mjs`

Expected: all existing tests and all six pool recipe tests PASS; 구조 fingerprint가 서로 다르고 승인 팔레트 밖 색이 없다.

- [ ] **Step 6: 커밋한다.**

```powershell
git add tools/slide-renderer/src/asset-recipes.mjs tools/slide-renderer/tests/asset-rendering.test.mjs
git commit -m "feat: render proposal block pool recipes"
```

### Task 4: 최종 장표 경로와 샘플 fixture 연결

**Files:**
- Modify: `tools/slide-renderer/src/render-presentation.mjs:270-340`
- Create: `tools/slide-renderer/tests/fixtures/block-pool-project/input/requirement.json`
- Create: `tools/slide-renderer/tests/fixtures/block-pool-project/blueprint/slide-blueprint.json`
- Create: `tools/slide-renderer/tests/fixtures/block-pool-project/mapping/asset-mapping.json`
- Modify: `tools/slide-renderer/tests/build-proposal-cli.test.mjs`

**Interfaces:**
- 선택 자산이 있으면 기존 `asset.rendererKey`를 사용한다.
- 선택 자산이 없고 `block.blockTypeDefinition`이 있으면 해당 타입의 `rendererKey`로 동일한 recipe를 실행한다.
- 기존 `applications`와 `selected_assets` 검증 구조는 선택 자산에 대해서만 유지한다.
- 새 fixture는 `layout_family: "block_pool_auto"`, `orientation: "portrait"`, 5개 타입 블록, `slot: "auto"`를 사용한다.

- [ ] **Step 1: pool fixture의 렌더 결과를 먼저 검증하는 CLI 테스트를 추가한다.**

```js
test("builds a portrait block-pool proposal with native pool renderers", async (t) => {
  const rendererRoot = path.resolve(import.meta.dirname, "..");
  const project = path.join(rendererRoot, "tests", "fixtures", "block-pool-project");
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "proposal-pool-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const output = path.join(temp, "POOL-001.pptx");
  const result = spawnSync(process.execPath, [path.join(rendererRoot, "bin", "build-proposal.mjs"), "--project", project, "--output", output], { encoding: "utf8" });
  assert.equal(result.status, 0, `stderr=${result.stderr}\nstdout=${result.stdout}`);
  const report = JSON.parse(await fs.readFile(path.join(temp, "verification-report.json"), "utf8"));
  assert.equal(report.layout_family, "block_pool_auto");
  assert.equal(report.orientation, "portrait");
  assert.ok(report.content_box_count >= 5);
  assert.equal(report.picture_shape_count, 0);
  assert.equal((await fs.readFile(path.join(temp, "final-slide.png"))).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
});
```

- [ ] **Step 2: fixture JSON을 작성한다.**

`requirement.json`은 `POOL-001`과 `고객행동 데이터 분석·활용` 요약을 사용한다. `slide-blueprint.json`은 다음 5개 블록을 순서대로 사용한다.

1. `metric_dashboard`: 응답시간·수집범위 지표 2개
2. `scope_outcome_mapping`: 접점 데이터와 운영 결과 2개씩
3. `matrix_table`: `구분`, `제안 대응`, `검증` 3열과 3행
4. `blueprint_flow`: 입력 1개, 단계 3개, 출력 1개
5. `chevron_pipeline`: 단계 3개와 검증 기준 3개

각 블록의 `role`은 기존 역할 또는 `pool_block`, `visual_category`는 위 타입명, `slot`은 `auto`, `importance`는 `mandatory`로 둔다. `mapping.json`은 5개 블록 모두 `fallback_native_shapes`로 두어 자산 없이도 pool recipe가 실행되는 경로를 검증한다.

- [ ] **Step 3: 최종 렌더러가 pool recipe를 선택하도록 연결한다.**

`addFinal()`의 블록 루프에서 다음 우선순위를 구현한다.

```js
const rendererKey = asset?.rendererKey ?? block.blockTypeDefinition?.rendererKey;
if (block.architectureTreatment === "native_diagram" && rendererKey) {
  const recipe = createAssetRecipe({ rendererKey, block, frame, theme: model.theme });
  const application = applyAssetRecipe(slide, recipe);
  if (asset) applications.push({ blockId: block.blockId, assetId: asset.assetId, ...application });
  continue;
}
```

기존 `metric_highlight`, `requirement_summary`, `main_process`, `technology_comparison`, `operation_quality` handler는 `rendererKey`가 없을 때만 실행한다. `addWireframe()`에는 `blockType`을 mapping id 옆에 표시해 pool 선택을 확인할 수 있게 한다.

- [ ] **Step 4: CLI fixture와 기존 비-DAR fixture를 함께 실행한다.**

Run: `node --test tools/slide-renderer/tests/build-proposal-cli.test.mjs`

Expected: 기존 fixture와 `block_pool_auto` fixture가 모두 PASS하고, 새 fixture의 PPTX·wireframe PNG·final PNG·verification report가 생성된다.

- [ ] **Step 5: 커밋한다.**

```powershell
git add tools/slide-renderer/src/render-presentation.mjs tools/slide-renderer/tests/fixtures/block-pool-project tools/slide-renderer/tests/build-proposal-cli.test.mjs
git commit -m "feat: render auto-selected proposal blocks"
```

### Task 5: 스킬·입출력 계약에 선택 풀을 노출한다

**Files:**
- Modify: `skills/proposal-ppt-maker/SKILL.md`
- Modify: `skills/proposal-ppt-maker/references/io-contract.md`
- Modify: `skills/proposal-ppt-maker/references/portrait-proposal.md`
- Modify: `skills/proposal-slide-planner/SKILL.md`
- Modify: `tools/slide-renderer/tests/proposal-ppt-maker-skill.test.mjs`

**Interfaces:**
- 스킬 문서는 `visual_category`를 블록 타입 선택 필드로 설명한다.
- 문서는 새 `layout_family: "block_pool_auto"`, `slot: "auto"`, 6개 타입과 타입별 선택 신호를 설명한다.
- IO 계약은 타입별 `content` 필드를 JSON 예시로 명시한다.

- [ ] **Step 1: 문서 계약 테스트에 선택 풀 요구사항을 추가한다.**

```js
for (const blockType of [
  "matrix_table",
  "metric_dashboard",
  "scope_outcome_mapping",
  "blueprint_flow",
  "chevron_pipeline",
  "gantt_roadmap",
]) assert.ok(io.includes(blockType), `missing block type ${blockType}`);
assert.match(io, /block_pool_auto/);
assert.match(planner, /visual_category.*블록 타입/);
assert.match(maker, /선택 가능한 블록 풀/);
```

- [ ] **Step 2: maker·planner 문서에 선택 규칙을 추가한다.**

다음 규칙을 두 스킬에 반영한다.

- 표·기준·검증·역할 중심이면 `matrix_table`
- 숫자·목표·증감·성능 중심이면 `metric_dashboard`
- 범위와 효과가 대응하면 `scope_outcome_mapping`
- 입력·처리·도구·결과 흐름이면 `blueprint_flow`
- 단계·게이트·인수 조건이면 `chevron_pipeline`
- 기간·작업·마일스톤이면 `gantt_roadmap`

`block_pool_auto`는 5~6개 타입 블록과 `slot: "auto"`를 사용하며, 기존 레이아웃을 임의로 대체하지 않는다고 명시한다.

- [ ] **Step 3: IO 계약과 세로형 규칙에 타입별 입력을 추가한다.**

`io-contract.md`에는 `columns/rows`, `metrics`, `left/right/links`, `inputs/steps/tools/outputs/fallbacks`, `criteria/gates`, `time_units/rows/milestones` 필드를 기록한다. `portrait-proposal.md`에는 자동 배치가 최소 높이를 보장하고 초과 시 시리즈 장표 또는 `text_explainer`로 전환한다는 규칙을 추가한다.

- [ ] **Step 4: 문서 계약 테스트를 실행한다.**

Run: `node --test tools/slide-renderer/tests/proposal-ppt-maker-skill.test.mjs`

Expected: 기존 스킬 계약과 새 6개 타입·자동 레이아웃 문구 검증이 모두 PASS한다.

- [ ] **Step 5: 커밋한다.**

```powershell
git add skills/proposal-ppt-maker/SKILL.md skills/proposal-ppt-maker/references/io-contract.md skills/proposal-ppt-maker/references/portrait-proposal.md skills/proposal-slide-planner/SKILL.md tools/slide-renderer/tests/proposal-ppt-maker-skill.test.mjs
git commit -m "docs: expose selectable proposal block pool"
```

### Task 6: 전체 검증과 시각 QA

**Files:**
- Test: `tools/slide-renderer/tests/block-types.test.mjs`
- Test: `tools/slide-renderer/tests/compile-render-model.test.mjs`
- Test: `tools/slide-renderer/tests/layouts.test.mjs`
- Test: `tools/slide-renderer/tests/asset-rendering.test.mjs`
- Test: `tools/slide-renderer/tests/build-proposal-cli.test.mjs`

**Interfaces:**
- 최종 검증 명령은 기존 저장소 명령을 사용한다.
- 검증 대상은 기존 fixture와 새 `block-pool-project` fixture다.

- [ ] **Step 1: 전체 Node 테스트를 실행한다.**

Run: `node --test`

Expected: exit code 0, `fail 0`, 기존 테스트와 새 pool 테스트를 모두 포함한다.

- [ ] **Step 2: 스킬 설치·의존성 검증을 실행한다.**

Run: `node skills/proposal-ppt-maker/scripts/verify-skill.mjs`

Expected: `passed: true`, Node.js 22.5 이상, renderer, catalog, `@oai/artifact-tool` 검증 통과.

- [ ] **Step 3: 새 fixture를 직접 렌더링한다.**

Run: `node tools/slide-renderer/bin/build-proposal.mjs --project tools/slide-renderer/tests/fixtures/block-pool-project --output tmp/block-pool-qa/POOL-001.pptx`

Expected files: `tmp/block-pool-qa/POOL-001.pptx`, `wireframe.png`, `final-slide.png`, `verification-report.json`.

- [ ] **Step 4: 생성 PNG를 시각 확인한다.**

Open `tmp/block-pool-qa/wireframe.png` and `tmp/block-pool-qa/final-slide.png` with the image viewer. Verify the five blocks are visually distinct, all text remains inside its frame, no block overlaps another, and no generated image or SVG is used for the core content.

- [ ] **Step 5: 최종 diff와 상태를 확인한다.**

Run:

```powershell
git diff --check
git status --short --branch
```

Expected: no whitespace errors; only intended source, skill, documentation, and test files are tracked. `storage/work` and `tmp` remain untracked and are not staged.

- [ ] **Step 6: 구현 결과를 하나의 커밋으로 정리한다.**

```powershell
git log -6 --oneline
```

Expected: Task 1~5의 개별 커밋이 보이고, 검증 명령과 시각 QA가 끝난 뒤에만 원격 push를 실행한다. 원격 push는 사용자가 정확한 목적지 `origin/master`를 명시적으로 승인한 뒤 실행한다.
