# Proposal PPT Maker I/O Contract

## Runtime boundary

코어 렌더링 의존성은 `tools/slide-renderer`와 Codex 번들의 `@oai/artifact-tool`뿐이다. `tools/pattern-library`, `proposal-ppt-ingest`, `proposal-reference-search`, SQLite, 임베딩과 검색 세션은 필요하지 않다.

```text
<requirement-project>/
├─ input/
│  └─ requirement.json
└─ blueprint/
   └─ slide-blueprint.json
```

두 파일의 `requirement_id`는 같아야 한다.

## `input/requirement.json`

필수 필드:

- `requirement_id`
- `requirement_name`
- `requirement_summary`

정량지표는 `rfp_facts.quantitative_metrics[]`에 `id`, `name`, 원문 그대로의 `value_text`, `source_refs[]`를 보존한다.

## `blueprint/slide-blueprint.json`

필수 상위 필드:

- `requirement_id`
- `status`: 최종 렌더링은 `approved`만 허용
- `slide_scope`: `requirement` 또는 `overview`
- `requirement_ids`
- `primary_requirement_id`: requirement 장표에서 필수, overview에서는 `null`
- `slide_title`
- `layout_family`
- `orientation`: `landscape` 또는 `portrait`
- `density`: `high`
- `blocks[]`: 최소 5개
- `shape_plan`: `layout_family: "agent_authored"`에서 필수

`portrait`에는 `니다.`로 끝나는 `governing_message`가 필수다. `protected_metrics[]`는 `metric_id`, `label`, `value_text`, `source_refs[]`를 가진다. `theme`을 생략하면 `#1769E0`, `#123B78`, `#4A8CF0`, `#EEF5FF` 중심의 기본 팔레트를 사용한다.

신규 `agent_authored` 블록은 다음을 가진다.

- `block_id`, `role`
- `content`
- `source_refs[]`
- 선택적 `visual_intent`, `content_priority`, `composition_constraints[]`, `direction`, `importance`

`shape_plan`은 `design_rationale`, `composition_signature`, `primitives[]`를 가진다. 각 primitive는 `kind`, 고유 `name`, `block_id`, `position`과 종류별 텍스트·스타일·연결 정보를 가진다. 상세 계약은 `agent-authored-layout.md`를 따른다.

기존 `block_pool_auto` 입력은 5~6개 블록, 모두 `slot: "auto"`, 서로 다른 `visual_category`를 요구한다. 이 경로와 `BlockType` 표는 하위 호환용이며 신규 장표는 사용하지 않는다.

## 선택적 `reference_context`

과거 장표는 복사할 에셋이 아니라 AI가 참고한 구조 메타데이터다.

```json
{
  "reference_context": {
    "mode": "user_provided",
    "selected_slide_ids": ["slide_001"],
    "notes": [
      { "block_id": "flow", "reference_id": "slide_001", "usage_note": "상하 영역 분할만 참고" }
    ]
  }
}
```

`mode`는 `none` 또는 `user_provided`다. 생략 시 `none`으로 정규화한다. `notes[].block_id`는 실제 블록을 가리켜야 한다. 렌더러는 ID와 메모만 보고 세션·SQLite·원본 파일·미리보기 이미지를 로드하지 않는다.

## 출력

```text
<output-dir>/
├─ <requirement-id>.pptx
├─ wireframe.png
├─ final-slide.png
└─ verification-report.json
```

- `wireframe.png`: 2차 승인용 구조 미리보기
- `final-slide.png`: 완성 장표 미리보기
- `verification-report.json`: 방향, 레이아웃, `density`, `content_box_count`, `native_shape_plan`, `composition_signature`, `reference_context`, 산출물 경로와 렌더 상태

`source_refs`, `protected_metrics`, 레퍼런스 메모는 기계 판독 메타이며 최종 장표의 가시 문구가 아니다.

## Close-out과 검증

하나의 실행은 다음처럼 정리한다.

```text
<rfp-or-run>/
├─ deliverables/
│  ├─ <rfp-id>_<orientation>_final.pptx
│  ├─ previews/
│  └─ verification-report.json
├─ work/<requirement-id>/
│  ├─ input/
│  └─ blueprint/
└─ _archive/iterations/
```

사진·로고 예외가 없는 네이티브 장표의 합격값은 `embedded_media_count: 0`, `picture_shape_count: 0`, `grouped_picture_shape_count: 0`, `grouped_media_count: 0`이다. `group_shape_count`는 정보성 지표이며 0일 필요가 없다. PowerPoint 검증 전에는 `generated_pending_powerpoint_review`로 보고한다.
