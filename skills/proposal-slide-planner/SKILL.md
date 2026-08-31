---
name: proposal-slide-planner
description: RFP 요구사항과 선택된 레퍼런스를 바탕으로 고밀도 제안 슬라이드 청사진과 자산 매핑을 만드는 Skill.
---

# Proposal Slide Planner

요구사항 ID, 정량지표, 근거, 선택된 레퍼런스를 `slide-blueprint.json`과 `asset-mapping.json`으로 정규화한다. 최종 렌더링은 `tools/slide-renderer`가 담당한다.

## 비협상 규칙

1. `density`는 반드시 `high`로 둔다.
2. `blocks[]`에는 서로 다른 역할을 가진 독립 내용 상자를 최소 5개 둔다.
3. 세로형 `portrait` 청사진에는 제안사의 행동과 결과를 말하는 `governing_message`를 넣고 `니다.`로 끝낸다.
4. 원문 정량지표의 `value_text`와 `source_refs[]`를 `protected_metrics`에 그대로 보존한다.
5. 비교 블록은 나열로 끝내지 않고 `content.conclusion`에 적용 방향을 쓴다.
6. `requirement_summary`와 자산 검색 메모는 최종 가시 제목에 노출하지 않는다.

## 실행 흐름

1. 요구사항 ID와 범위를 먼저 확정한다.
2. `references/data-contract-v2.md` 계약에 맞춰 두 JSON을 만든다.
3. 승인 대기 세션을 `storage/sessions/plan_<id>.json`에 저장한다.
4. 필요하면 HitL 검토 화면을 연다.

```powershell
node tools/hitl-bridge/hitl_launcher.mjs --open "http://127.0.0.1:5274/planner.html?session=plan_<id>"
```

사용자 승인 후에만 `$proposal-ppt-maker`를 호출한다. 승인 전에는 PPTX를 만들지 않는다.
