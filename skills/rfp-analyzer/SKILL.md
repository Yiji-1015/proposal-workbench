---
name: rfp-analyzer
description: RFP, 과업지시서, 공고문을 분석해 업무 흐름, 기능 도메인, 숨은 기능, 정량 KPI, 제안사 역량 갭과 리스크를 구조화하는 Skill.
---

# RFP Analyzer

RFP를 단순 요약하지 않고 고객의 실제 업무 흐름을 복원한다. 요구사항과 원문 근거, 정량 KPI, 제안사 관점의 수행 갭을 분리해 `rfp_analysis.json`과 Markdown 보고서로 만든다.

## 필수 참조

- `references/rfp-analysis-methodology.md`
- `references/data-contract-v2.md`의 `RfpAnalysisContract`
- `company_profile/overview.md`, `core_competencies.md`, `gap_criteria.md`

## 분석 원칙

1. `수집 → 보안/반입 → 전처리/OCR → 메타/품질 → 저장/인덱싱 → 카탈로그/검색 → AI/업무 → 결과/반출 → 이력/모니터링`의 End-to-End 흐름을 먼저 복원한다.
2. 요구 문장을 사용자 행동, 내부 처리, 검증, 저장, 알림 반응으로 분해한다.
3. 포털, 사용자/권한, 워크스페이스, 데이터수집, 저장, 품질, 가공, 검색, AI학습, AI추론, 보안, 인프라, 교육의 13개 도메인으로 분류한다.
4. 전처리, 파일 검증, 청킹, 메타데이터 추출, 오류 재처리처럼 명시되지 않았지만 필요한 기능을 `inferred: true`로 표시한다.
5. KPI는 `mandatory`, `guideline`, `tbd`로 나누고 `value_text`와 `source_refs[]`를 원문 그대로 보존한다.
6. 제안사가 단독 수행하기 어려운 영역은 참여 가능성과 섞지 않고 Gap과 협력 필요성으로 분리한다.

## 산출

- `rfp_analysis.json`: 공통 데이터 계약 JSON
- `RFP_분석보고서.md`: 사업 개요, 업무 흐름, 기능 도메인, KPI, Gap과 리스크

분석이 끝나면 후속 `proposal-slide-planner`로 자동 진행하지 않고 결과를 먼저 보고한다.
