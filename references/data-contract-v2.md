# Proposal Automation Data Contract v2 (공통 데이터 계약 명세)

본 문서는 Agent Skills, Execution Tools, 그리고 Lovable HitL UI (`deal-mechanic`) 간에 교환되는 표준 데이터 구조(Data Contract)를 정의합니다.

---

## 1. Source Reference (`SourceRef`)

원문 문서의 추적성(Traceability)을 보장하기 위한 공통 식별자입니다.

```typescript
export interface SourceRef {
  // 1. 파서가 제공 가능한 구조적 식별자 (Primary)
  doc_id?: string;           // 문서 고유 해시 또는 ID
  doc_name: string;          // 문서 파일명 (예: "2026_스마트물류_통합관제_RFP.hwp")
  page?: number;             // 페이지 번호 (1-indexed, 파서가 지원하는 경우)
  section_path?: string;     // 원문 목차 계층 (예: "3. 목표 시스템 > 3.1 통합관제 대시보드")
  block_id?: string;         // 파서가 부여한 문단/표 블록 ID

  // 2. 원문 근거 및 검색/하이라이팅 Fallback (Evidence)
  quote: string;             // 인용 원문 텍스트
}
```

---

## 2. 정량 지표 (`QuantitativeMetric` & `ProtectedMetric`)

RFP 분석부터 장표 기획, PPT 렌더링, 검수까지 **원문 수치 표현(`value_text`)을 100% 무손실 보존**하기 위한 계약입니다.

```typescript
export interface QuantitativeMetric {
  id?: string;               // 지표 ID (예: "M-01")
  name: string;              // 지표명 (예: "알림 지연시간")
  value_text: string;        // 원문 보존 텍스트 (예: "5초 이내", "99.9% 이상") - Source of Truth
  source_refs: SourceRef[];  // 원문 근거 배열

  // 검색/비교용 파싱 필드 (Optional - 원문 수정 불가)
  parsed_value?: number;     // 예: 5, 99.9
  unit?: string;             // 예: "초", "%"
  operator?: "<=" | ">=" | "=" | "within";
}
```

---

## 3. RFP 분석 결과 (`RfpAnalysisContract`)

`rfp-analyzer` Skill이 생성하여 후속 Skill(`proposal-slide-planner` 등)에 전달하는 구조화 데이터입니다.

```typescript
export interface RfpRequirement {
  id: string;                // 요구사항 ID (예: "SFR-001")
  category: string;          // 분류 (예: "기능", "연계", "보안", "성능")
  name: string;              // 요구사항 명칭
  summary: string;           // 핵심 요약 문구
  priority: "필수" | "권장" | "선택";
  quantitative_metrics?: QuantitativeMetric[];
  source_refs: SourceRef[];
}

export interface RfpAnalysisContract {
  doc_name: string;
  analyzed_at: string;
  overview: { label: string; value: string }[];
  workflow_steps: { step: number; title: string; desc: string }[];
  requirements: RfpRequirement[];
  domains: { name: string; desc: string; req_count: number }[];
  explicit_features: { text: string; source_refs: SourceRef[] }[];
  hidden_features: { text: string; reason: string }[];
  kpis: QuantitativeMetric[];
  risk_areas: { area: string; reason: string; level: "높음" | "중간" | "낮음" }[];
}
```

---

## 4. 슬라이드 청사진 (`SlideBlueprintContract`)

`proposal-slide-planner`가 기획하고, HitL UI에서 검토/승인하며, `proposal-slide-renderer`가 네이티브 도형으로 렌더링하는 핵심 계약입니다.

`requirement_id`는 입력 파일을 묶는 실행·프로젝트 키다. 실제 페이지 범위는 `slide_scope`로 구분한다. `requirement` 페이지는 `primary_requirement_id`와 단일 `requirement_ids`를 사용하고, `overview` 페이지는 `primary_requirement_id: null`과 복수 `requirement_ids`를 사용한다.

```typescript
export interface SlideBlock {
  block_id: string;          // 장표 내부 고유 블록 ID
  role: "requirement_summary" | "main_process" | "operation_quality" | "technology_comparison" | "metric_highlight";
  slot: "top" | "left" | "center" | "right" | "bottom_center" | "generic" | "auto";
                             // block_pool_auto에서는 반드시 "auto"
  span?: "full" | "half";    // block_pool_auto 전용. 연속한 half 두 개가 한 줄을 이룬다
  visual_category: BlockType; // 아래 14종. 등록되지 않은 값은 렌더러가 거부한다
  direction?: "left_to_right" | "vertical" | "horizontal" | "none";
  importance?: "mandatory" | "optional";
  architecture_treatment?: "native_diagram" | "text_explainer" | "generated_visual_with_text";
  step_count?: number;       // steps/options 수와 일치 필수
  content: {
    headline?: string;       // 개요(--outline) 모드에서는 필수
    summary?: string;        // 1차 승인용. 그 블록이 무엇을 말할지 한두 문장
    bullets?: string[];
    steps?: string[];
    step_details?: string[]; // blueprint_flow에서 steps와 같은 길이
    flow_steps?: string[];   // 복잡한 아키텍처 설명의 읽기 순서
    explanation?: string;    // native_diagram의 상세 부연설명으로 선택, 나머지는 필수
    options?: { label: string; desc: string; tag?: string }[];
    rows?: unknown[];        // matrix_table
    metrics?: unknown[];     // metric_dashboard
    diagram_labels?: string[];
    conclusion?: string;     // 비교 블록 결론 필수
  };
  source_refs?: SourceRef[];
}

export interface SlideBlueprintContract {
  requirement_id: string;
  slide_scope: "requirement" | "overview";
  primary_requirement_id?: string | null;
  requirement_ids: string[];
  slide_title: string;
  governing_message?: string; // 세로형(portrait)일 때 필수, 반드시 ~니다. 종결
  orientation: "landscape" | "portrait";
  layout_family: "block_pool_auto" | "three_column_with_bottom_band" | "generic_grid";
                             // block_pool_auto는 블록 5~6개만 허용한다
  density: "high";            // 제안서는 high 필수
  theme: {
    primary: string;          // 기본: #1769E0
    navy: string;             // 기본: #123B78
    accent?: string;          // 기본: #4A8CF0
    pale?: string;            // 기본: #EEF5FF
    surface?: string;         // 기본: #F3F6FA
    ink?: string;             // 기본: #172033
    gray?: string;            // 기본: #5F6B7A
    line?: string;            // 기본: #C8D2DF
    white?: string;           // 기본: #FFFFFF
  };
  blocks: SlideBlock[];       // 최소 5개의 독립된 내용 상자
  protected_metrics: QuantitativeMetric[];
  source_refs: SourceRef[];
  reference_slide_ids?: string[];
  status?: "draft" | "structure_approved" | "approved";
                             // draft -> 1차 승인 시 structure_approved -> 2차 승인 시 approved.
                             // 렌더러는 approved만 최종 PPTX로 통과시킨다
}
```


### `BlockType` — 렌더러에 등록된 14종

이 표는 `tools/slide-renderer/src/block-types.mjs`의 등록 내용이다. 여기 없는 값을 쓰면 렌더러가 거부한다.

| visual_category | 쓰는 자리 | 기본 span | 항목 수 | content 종류 |
| --- | --- | --- | ---: | --- |
| `matrix_table` | 표·검증 기준 | full | 1~10 | table |
| `metric_dashboard` | 지표 | half | 1~6 | metrics |
| `scope_outcome_mapping` | 범위와 효과 | half | 1~6 | mapping |
| `blueprint_flow` | 입력·처리·결과 흐름 | full | 2~8 | flow |
| `chevron_pipeline` | 단계·게이트 | half | 2~8 | pipeline |
| `gantt_roadmap` | 근거 있는 일정만 | full | 2~12 | roadmap |
| `process_grid` | 순차 격자 | full | 2~8 | labels |
| `comparison` | 실제로 대립하는 선택지만 | full | 2~4 | labels |
| `mapping` | 1:N 연결 | half | 4~6 | labels |
| `feedback_loop` | 순환·환류 | half | 4~5 | labels |
| `quality_gate` | 통과 기준 | full | 4~6 | labels |
| `swimlane` | 병렬 역할 | full | 4~6 | labels |
| `hub_spoke` | 방사형 연결 | half | 6~9 | labels |
| `architecture` | 계층 구조 | full | 4~5 | labels |

`content` 종류별로 2차에서 채우는 필드가 다르다. `table`은 `rows`, `metrics`는 `metrics`, `flow`는 `steps`와 `step_details`, `labels`는 `diagram_labels`를 쓴다. 1차 승인 단계에서는 `headline`과 `summary`만 채우고 나머지는 비워 둔다.

---

## 5. HitL 세션 교환 규격 (`HitLSessionContract`)

Agent와 브라우저 UI(`deal-mechanic`) 간의 Human-in-the-loop 상호작용을 위한 세션 파일 구조입니다.

### ① Reference Picker 세션 (`session_ref_xxx.json`)
```typescript
export interface ReferencePickerSession {
  session_id: string;
  created_at: string;
  query: string;
  candidates: {
    slide_id: string;
    source_pptx: string;
    slide_no: number;
    title: string;
    image_description: string;
    tags: string[];
    similarity: number;
    image_ref: string;
    html_ref: string;
    layout?: string;
  }[];
  selected_slide_ids: string[]; // 사용자가 브라우저에서 선택한 ID 목록
  status: "pending" | "completed";
}
```

### ② Blueprint Review 세션 (`session_plan_xxx.json`)
```typescript
export interface BlueprintReviewSession {
  session_id: string;
  created_at: string;
  blueprint: SlideBlueprintContract;
  wireframe_png_url?: string;
  final_preview_png_url?: string;
  user_modifications?: Partial<SlideBlueprintContract>;
  status: "pending" | "approved" | "rejected";
}
```
