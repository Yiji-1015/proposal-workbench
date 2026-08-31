---
name: proposal-reviewer
description: 생성된 제안 장표와 원본 RFP를 대조해 요구사항 누락, 정량 수치 왜곡, 근거 없는 표현, 레이아웃과 자산 충실도 결함을 검수하는 QA Skill.
---

# Proposal Reviewer

`deliverables/`의 PPTX, 청사진, 검증 보고서를 `rfp_analysis.json`과 교차 검증해 `review_report.json`과 Markdown 검수 보고서를 만든다.

## 검수 영역

1. **요구사항 누락**: 필수 요구사항 ID와 슬라이드 대응 여부
2. **정량 수치 변경**: `rfp_facts.quantitative_metrics[]`, `protected_metrics[]`, 최종 슬라이드 텍스트의 값과 단위
3. **근거 없는 표현**: 가시 문구와 `source_refs[]`의 근거 일치 여부
4. **레이아웃 문제**: `density: high`, `content_box_count >= 5`, 세로형 `governing_message`, 자산 `fidelity_passed`

## 판정

100점에서 `CRITICAL`은 건당 15점, `WARNING`은 5점, `INFO`는 1점을 감점한다.

- `REJECTED`: 점수 < 50 또는 `CRITICAL` >= 3
- `NEEDS_REVISION`: `CRITICAL` >= 1 또는 점수 < 80
- `PASS`: `CRITICAL` 0개이고 점수 >= 80 (필수 검수 항목을 모두 확인한 경우)

검수하지 않은 항목을 통과로 표시하지 않는다.

## 입력과 출력

- 입력: `storage/` 아래 RFP 분석, 청사진, PPTX, `verification-report.json`
- 출력: 실행 단위 `deliverables/review_report.json`, `deliverables/제안서_검수보고서.md`

각 이슈에는 `id`, `type`, `severity`, `slide_number`, `requirement_id`, `message`, `evidence`, `suggestion`을 기록한다.
