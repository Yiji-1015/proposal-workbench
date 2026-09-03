---
name: proposal-slide-planner
description: RFP 요구사항과 선택적으로 제공된 구조 레퍼런스를 바탕으로 고밀도 제안 슬라이드 청사진과 자산 매핑을 만드는 Skill.
---

# Proposal Slide Planner

요구사항 ID, 정량지표, 근거와 선택적 구조 레퍼런스를 `slide-blueprint.json`과 `asset-mapping.json`으로 정규화한다. 최종 렌더링은 `tools/slide-renderer`가 담당한다.

## 비협상 규칙

1. `density`는 반드시 `high`로 둔다.
2. `blocks[]`에는 서로 다른 역할을 가진 독립 내용 상자를 최소 5개 둔다.
3. 세로형 `portrait` 청사진에는 제안사의 행동과 결과를 말하는 `governing_message`를 넣고 `니다.`로 끝낸다.
4. 원문 정량지표의 `value_text`와 `source_refs[]`를 `protected_metrics`에 그대로 보존한다.
5. 비교 블록은 나열로 끝내지 않고 `content.conclusion`에 적용 방향을 쓴다.
6. `requirement_summary`와 자산 검색 메모는 최종 가시 제목에 노출하지 않는다.
6-1. **근거 메타와 가시 문구를 분리한다.** `source_refs`, 원문 인용, 보호 정량지표, 자산 매핑·fallback 정보는 JSON·검수용 메타에만 남긴다. 장표 카피에는 “RFP에서”, “요구사항에서”, “원문”, “근거”, “출처” 같은 표현을 넣지 않고 구현·운영·활용 언어로 정리한다. 사용자가 원문 인용을 요청한 경우만 예외다.
6-2. **로드맵은 근거가 있을 때만 선택한다.** 원문이나 사용자 지시에 기간·마일스톤·일정·단계 전환이 있을 때만 `gantt_roadmap`을 사용한다. 요구사항의 처리 순서나 기능 목록을 임의의 주차·월차 로드맵으로 변환하지 않는다. 근거가 없으면 `blueprint_flow`, `chevron_pipeline`, `matrix_table` 등 요구사항에 직접 답하는 구조를 선택한다.
7. 사용자에게 가로형(`landscape`)·세로형(`portrait`) 방향을 묻는다.
8. 별도 팔레트나 템플릿이 없으면 `#1769E0`, `#123B78`, `#4A8CF0`, `#EEF5FF`를 사용한다.
9. 이 Skill은 검색이나 인제스트를 호출하지 않는다.
10. **장표 단위를 명시한다.** 기본은 `slide_scope: "requirement"`로 RFP 개별 요구사항 1건당 1페이지를 만들고 `primary_requirement_id`와 단일 `requirement_ids`를 기록한다. 전체 추진방향·아키텍처·로드맵 같은 개요 장표만 여러 요구사항을 묶을 수 있으며, 이때 `slide_scope: "overview"`, `primary_requirement_id: null`과 포함 `requirement_ids`를 기록한다. 하나의 요구사항이 여러 페이지를 필요로 하면 동일 요구사항 ID의 연속 장표로 구성한다.
11. **복잡한 아키텍처는 설명 우선으로 판단하되, 네이티브 도식은 끝까지 구성한다.** 간단한 도식과 부연설명을 기본으로 하되 출발점·처리·데이터 흐름·통제·도착점·운영상 의미를 가능한 한 빠짐없이 `native_diagram`과 `content.explanation`에 담는다. 도식 라벨은 짧게 축약할 수 있지만 기능·수치·관계는 생략하지 않는다. 네이티브 도식을 끝까지 구성해도 읽기·의사결정이 불가능할 때만 `architecture_treatment: "text_explainer"`를 사용한다. 사용자가 나노바나나/imagegen을 허용한 경우에만 `generated_visual_with_text`를 보조 시각으로 선택하며, 이미지에 사실·수치·근거를 맡기지 않는다.
12. **가독성 한도까지 정보량을 채운다.** RFP 기능·세부 처리·통제·검증 기준·성과·자사 역량 상태를 가능한 한 빠짐없이 기록하고 큰 빈 패널이나 두세 줄 요약으로 끝내지 않는다. 긴 내용은 노드·주석·편집 텍스트로 나누며, 8pt 이하 축소나 중복 문장으로 밀도를 만들지 않는다.
13. **블록별 내용을 먼저 확정하고 그다음에 그릇을 고른다.** 요구사항 원문을 내용 단위로 쪼개 각 블록이 무엇을 말할지 문장 수준으로 확정한 뒤에 `visual_category`를 정한다. 그릇을 먼저 고르고 내용을 끼워 맞추면 어떤 요구사항이든 같은 장표가 나온다. 내용 단위가 5개보다 적으면 원문을 다시 읽어 통제·검증·산출물·예외 처리처럼 빠진 단위를 찾고, 그래도 부족하면 억지로 늘리지 말고 그 사실을 보고한다.

13-1. **확정한 내용에 맞는 블록 타입을 고른다.** 표·검증은 `matrix_table`, 지표는 `metric_dashboard`, 범위·효과는 `scope_outcome_mapping`, 입력·처리·결과는 `blueprint_flow`, 단계·게이트는 `chevron_pipeline`, 근거 있는 일정만 `gantt_roadmap`을 사용한다. 계층 구조는 `architecture`, 순환·환류는 `feedback_loop`, 1:N 연결은 `mapping`, 병렬 역할은 `swimlane`, 통과 기준은 `quality_gate`, 방사형 연결은 `hub_spoke`, 순차 격자는 `process_grid`, 대립하는 선택지는 `comparison`을 쓴다. `comparison`은 두 항목이 실제로 대립할 때만 쓰고 병행·동시 확보에는 쓰지 않는다. `blueprint_flow`의 단계는 일정으로 간주하지 않으며 `steps[]`와 동일 길이의 `step_details[]`를 작성해 각 처리 노드의 세부 문구를 보존한다. `layout_family: "block_pool_auto"`에서는 5~6개 블록을 `slot: "auto"`로 선언한다.

14. **자산은 끝까지 찾아보고 근거와 함께 추천한다.** 카탈로그를 실제로 검색하지 않고 모든 블록을 `fallback_native_shapes`로 적는 것은 금지한다. 블록마다 `display_name`, `description`, `design_traits`, `use_cases`, `search_tags`로 후보를 찾고, 고른 이유와 어떤 구조를 참고할지를 `usage_note`에 남긴다. 맞는 자산이 없으면 무엇을 찾았고 왜 맞지 않았는지를 적고 폴백으로 내린다. 자산은 구조 레퍼런스이며 원본 도형·문구를 그대로 옮기는 수단이 아니다.

## 선택적 구조 레퍼런스

레퍼런스 없이도 RFP만으로 기획할 수 있다. 사용자가 첨부 이미지를 주면 구조와 배치만 참고하고 색상, 타이포그래피, 문구, 업무 내용은 무시한다. 첨부 이미지를 인제스트하거나 검색 색인에 추가하지 않는다. 이미지를 읽을 수 없으면 다시 첨부해 달라고 요청하고 자동 검색으로 대체하지 않는다.

완료된 검색 세션이나 `selected_slide_ids`는 사용자가 명시적으로 전달한 경우에만 사용한다. 세션을 받으면 완료 상태와 `selected_slide_ids`를 확인한다. 세션이 없거나 완료되지 않았으면 그 상태를 보고하고 레퍼런스 없이 계속할지 묻는다. 레퍼런스가 없거나 사용하지 않기로 한 경우 자산 재사용을 가장하지 않고 RFP 근거와 기본 도식 카탈로그로 진행한다.

## 실행 흐름

1. 요구사항 ID와 범위를 먼저 확정한다.
2. 방향을 확인하고 기본 팔레트 또는 사용자가 명시한 팔레트를 적용한다.
3. 첨부 이미지, 명시적으로 전달된 완료 세션, 레퍼런스 없음 중 입력 상태를 확정한다.
3-1. **블록별 내용을 확정한다.** 요구사항 원문을 내용 단위로 쪼개고 각 단위가 말할 내용을 문장 수준으로 적는다. 이 단계가 끝나기 전에는 `visual_category`를 정하지 않는다.
3-2. **확정한 내용마다 그릇과 자산을 고른다.** 내용에 맞는 블록 타입을 정하고, 카탈로그에서 참고할 자산을 찾아 고른 이유를 기록한다. 맞는 자산이 없으면 무엇을 찾았는지와 함께 폴백으로 내린다.
4. `references/data-contract-v2.md` 계약에 맞춰 두 JSON을 만든다.
5. 승인 대기 세션을 `storage/sessions/plan_<id>.json`에 저장한다.
6. 와이어프레임을 채팅에 표시하고 사용자 명시 승인 전에는 `$proposal-ppt-maker` 호출과 최종 PPTX 생성을 금지한다. 청사진의 `status`는 승인 전까지 `draft`로 둔다. 렌더러가 이 값을 검사해 승인 없는 PPTX 생성을 거부한다.
7. 필요하면 HitL 검토 화면을 연다.

`block_pool_auto`를 선택한 경우 요구사항의 표·지표·매핑·흐름·단계·일정 신호에 따라 블록 타입을 조합하고, 같은 카드 모양을 반복하지 않는다.

```powershell
node tools/hitl-bridge/hitl_launcher.mjs --open "http://127.0.0.1:5274/planner.html?session=plan_<id>"
```

사용자 승인 후에만 `$proposal-ppt-maker`를 호출한다. 승인 전에는 PPTX를 만들지 않는다.
