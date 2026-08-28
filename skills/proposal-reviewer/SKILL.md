---
name: proposal-reviewer
description: 생성된 제안 장표(PPTX, 청사진, 검증 보고서)와 원본 RFP 분석 결과를 대조하여 요구사항 누락, 정량 수치 왜곡/변경, 근거 없는 미사여구, 레이아웃 및 자산 충실도 결함을 정밀 검수하는 제안서 QA Skill.
---

# Proposal Reviewer

제안서 산출물(`deliverables/<id>.pptx`, `verification-report.json`, `slide-blueprint.json`)을 원본 RFP 및 `rfp_analysis.json`과 교차 검증하여, 제안 품질을 저해하는 4대 결함을 찾아내고 종합 검수 보고서(`review_report.json` 및 `제안서_검수보고서.md`)를 작성합니다.

---

## 1. 4대 핵심 검수 영역 (Inspection Domains)

### ① 요구사항 누락 (`요구사항 누락` - Critical / Warning)
* **점검 대상**: `rfp_analysis.json`의 `requirements[]` vs 생성된 슬라이드 청사진 목록.
* **위반 조건**:
  - [CRITICAL] RFP의 '필수' 요구사항 ID에 대응하는 제안 슬라이드가 아예 누락된 경우.
  - [WARNING] 요구사항 내의 핵심 필수 세부 기능이 슬라이드 내용 블록에 반영되지 않은 경우.

### ② 정량 수치 왜곡 및 변경 (`정량 수치 변경` - Critical / Warning)
* **점검 대상**: `rfp_facts.quantitative_metrics[]` 및 `protected_metrics[]` vs 슬라이드 텍스트.
* **위반 조건**:
  - [CRITICAL] 원문의 정량 기준(예: "5초 이내")이 슬라이드에서 임의로 완화되거나 변경(예: "10초 이내")된 경우.
  - [CRITICAL] 수치 단위가 누락되거나 변경된 경우 (예: "건/일" → "건/초" 오기).
  - [WARNING] 장표 간 동일 지표의 수치가 상이하게 혼재된 경우 (예: 한 장표는 99.9%, 다른 장표는 99.95%).

### ③ 근거 없는 과장 표현 (`근거 없는 표현` - Warning / Info)
* **점검 대상**: 슬라이드 가시 헤드라인 및 본문 텍스트 vs `source_refs[]`.
* **위반 조건**:
  - [WARNING] "업계 최고 수준", "완벽한 무장애", "최첨단 AI" 등 실측치나 근거 없는 형용사적 과장 표현 남발.
  - [INFO] 제안사의 입증 가능한 실적/벤치마크 데이터 인용이 결여된 주장.

### ④ 레이아웃 및 렌더링 결함 (`레이아웃 문제` - Critical / Warning)
* **점검 대상**: `verification-report.json` 및 PowerPoint 렌더 결과.
* **위반 조건**:
  - [CRITICAL] `density !== "high"`이거나 독립 내용 상자 수가 5개 미만인 경우 (`content_box_count < 5`).
  - [CRITICAL] 세로형 장표에서 거버닝 메시지가 누락되었거나 `~니다.`로 끝나지 않는 경우.
  - [CRITICAL] 카탈로그 에셋 충실도 검증 실패 (`fidelity_passed: false`).
  - [WARNING] 텍스트 박스 높이 초과로 인한 글자 잘림 또는 도형 간 겹침 의심.

---

## 2. 검수 보고서 데이터 규격 (`ReviewReportContract`)

```typescript
export type IssueType = "요구사항 누락" | "정량 수치 변경" | "근거 없는 표현" | "레이아웃 문제";
export type Severity = "critical" | "warning" | "info";

export interface ReviewIssue {
  id: string;                // 이슈 ID (예: "r-01")
  type: IssueType;
  severity: Severity;
  slide_number: number;      // 슬라이드 번호 (0: 전체 제안서 레벨)
  requirement_id?: string;   // 관련 요구사항 ID
  message: string;           // 결함 요약
  evidence: string;          // 발견된 원문 근거 및 슬라이드 위치
  suggestion: string;        // 구체적인 수정 제안 가이드
}

export interface ReviewReportContract {
  run_id: string;
  reviewed_at: string;
  summary: {
    score: number;           // 100점 만점 종합 제안 품질 점수
    critical_count: number;
    warning_count: number;
    info_count: number;
    overall_verdict: "PASS" | "NEEDS_REVISION" | "REJECTED";
  };
  issues: ReviewIssue[];
}
```

---

## 3. 실행 및 점검 절차

1. **산출물 및 원문 데이터 수집**:
   - `storage/runs/<doc_id>/rfp_analysis.json` (원문 요구사항 및 KPI)
   - `storage/runs/<doc_id>/work/*/slide-blueprint.json` (기획된 청사진들)
   - `storage/runs/<doc_id>/deliverables/verification-report.json` (렌더러 검증 결과)
2. **4대 결함 교차 검증 수행**:
   - 지침 1번의 조건에 따라 요구사항, 수치, 근거, 레이아웃 전수 대조.
3. **점수 및 판정 산출**:
   - 기본 100점에서 `CRITICAL` 1건당 -15점, `WARNING` 1건당 -5점, `INFO` 1건당 -1점 감점.
   - `CRITICAL >= 1` 이면 `NEEDS_REVISION` 판정.
4. **산출물 동시 저장**:
   - `storage/runs/<doc_id>/deliverables/review_report.json`
   - `storage/runs/<doc_id>/deliverables/제안서_검수보고서.md`
5. **사용자 보고**:
   - 채팅창에 종합 점수, 판정 결과, Critical 결함 목록 및 수정 가이드를 일목요연하게 보고합니다.
