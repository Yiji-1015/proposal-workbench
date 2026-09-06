---
name: proposal-slide-planner
description: RFP 요구사항과 선택적으로 제공된 구조 레퍼런스를 바탕으로 고밀도 제안 슬라이드 청사진을 만드는 Skill.
---

# Proposal Slide Planner

요구사항 ID, 정량지표, 근거와 선택적 구조 레퍼런스를 `blueprint/slide-blueprint.json`으로 정규화한다. 최종 렌더링은 `tools/slide-renderer`가 담당한다.

이 Skill은 1차 승인까지만 담당한다. 블록 구성과 블록별 간단 내용을 확정하고 `status: "structure_approved"`로 넘긴다. 자산을 검색하거나 고르지 않으며 `asset-mapping.json`을 만들지 않는다.

## 비협상 규칙

1. `density`는 `high`, `blocks[]`는 서로 다른 역할의 독립 내용 단위 5~8개로 둔다.
2. 신규 청사진은 `layout_family: "agent_authored"`를 쓴다. 고정 `visual_category`, `slot`, 카드 템플릿을 선택하지 않는다. `block_pool_auto`를 비롯한 하위 호환 값은 렌더러가 거부한다.
3. 각 블록에 `content.headline`, `content.summary`, 자유 서술형 `visual_intent`, `content_priority`, `composition_constraints`를 기록한다. 이 값은 도형 이름이 아니라 전달할 의미, 강조 순서, 관계를 설명한다.
4. 표·검증·흐름·계층·순환·1:N·병렬 역할 같은 관계를 분석하되 미리 정해진 토폴로지 enum으로 환원하지 않는다. 메이커 에이전트가 장표 전체의 주도 도식을 결정한다.
5. 기간·마일스톤 근거가 없으면 로드맵을 만들지 않는다. 비교에는 `content.conclusion`으로 적용 방향을 쓴다.
6. `slide_scope: "requirement"`는 개별 요구사항 1건과 단일 `requirement_ids`를 사용한다. 여러 요구사항을 묶는 개요만 `slide_scope: "overview"`로 둔다.
7. 한 요구사항을 여러 장으로 나눌 때 각 장이 원문 근거만으로 5개 블록을 채우고 비슷한 분량으로 스스로 성립해야 한다. 자리표시자나 반복 문장이 필요하면 나누지 않는다.
8. 다른 요구사항의 세부 내용을 끌어오지 않는다. 연결이 필요하면 요구사항 ID 한 줄 참조만 남긴다.
9. 원문 정량지표의 `value_text`와 `source_refs[]`는 `protected_metrics`에 보존한다. 근거·출처·제작 메모는 가시 장표 문구에 노출하지 않는다.
10. `portrait`에는 제안사의 행동과 결과를 말하고 `니다.`로 끝나는 `governing_message`를 넣는다.
11. 방향은 사용자에게 확인한다. 팔레트나 템플릿이 없으면 `#1769E0`, `#123B78`, `#4A8CF0`, `#EEF5FF`를 쓴다.
12. 복잡한 구조도 우선 `native_diagram`과 `content.explanation`으로 구성한다. 끝까지 구성해도 읽기 어려울 때만 `text_explainer`를 사용하고, 사용자가 허용한 경우만 `generated_visual_with_text`를 보조 시각으로 쓴다.
13. 검색, 인제스트, SQLite, 임베딩, 에셋 카탈로그를 호출하거나 요구하지 않는다.

## 선택적 구조 레퍼런스

레퍼런스 없이도 RFP만으로 완전하게 기획한다. 사용자가 첨부 이미지나 완료된 검색 결과의 `selected_slide_ids`를 명시적으로 제공한 경우에만 구조와 배치를 참고한다. 색상, 타이포그래피, 문구와 업무 내용은 복사하지 않는다.

레퍼런스 정보는 청사진의 선택 필드에만 기록한다.

```json
{
  "reference_context": {
    "mode": "user_provided",
    "selected_slide_ids": ["slide_001"],
    "notes": [
      { "block_id": "process", "reference_id": "slide_001", "usage_note": "상단 흐름과 하단 통제 영역의 구조만 참고" }
    ]
  }
}
```

레퍼런스가 없으면 `mode: "none"`, 빈 배열을 사용하거나 필드 자체를 생략한다. 세션 파일을 열거나 완료 상태를 재확인하지 않으며, 레퍼런스가 없거나 읽을 수 없어도 작업을 막거나 자동 검색으로 대체하지 않는다. `proposal-ppt-ingest`와 `proposal-reference-search`는 사용자가 별도로 실행하는 독립 도구다.

## 실행 흐름

1. 요구사항 ID, 범위와 인접 요구사항 경계를 확정한다.
2. 방향과 팔레트를 확정한다.
3. 원문을 내용 단위로 나누고 블록별 `headline`과 `summary`를 쓴다.
4. 블록별 `visual_intent`, 우선순위와 서로 연결되어야 하는 관계를 작성한다. 도형과 좌표는 이 단계에서 고정하지 않는다.
5. `<plugin-root>/references/data-contract-v2.md`의 `agent_authored` 계약에 맞춰 `slide-blueprint.json`을 만든다. 초기 `status`는 `draft`다.
6. `--outline` 와이어프레임을 보여주고 1차 승인을 받는다. 승인 후 `status`를 `structure_approved`로 바꾼다.
7. 사용자 승인 후에만 `$proposal-ppt-maker`로 상세 문구와 최종 PPTX를 만든다.

승인 전에는 최종 PPTX를 만들지 않는다.
