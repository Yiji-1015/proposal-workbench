---
name: proposal-slide-planner
description: RFP 요구사항과 선택된 레퍼런스 장표를 바탕으로 고밀도(density high), 거버닝 메시지(~니다.), 최소 5개 독립 블록, 정량지표 보존을 준수하는 제안 슬라이드 청사진(slide-blueprint.json)을 기획하고, HitL Launcher를 통해 기본 브라우저를 띄워 사용자가 검토·승인할 수 있도록 돕는 Skill.
---

# Proposal Slide Planner

RFP 분석 결과의 특정 요구사항(ID, 정량지표, 세부 내용)과 사용자가 선택한 레퍼런스 슬라이드를 바탕으로, PowerPoint 네이티브 렌더러(`proposal-slide-renderer`)가 요구하는 엄격한 **슬라이드 청사진(`slide-blueprint.json`)과 자산 매핑(`asset-mapping.json`)**을 기획합니다.

---

## 1. 비협상 기획 원칙 (Non-negotiable Rules)

1. **거버닝 메시지 (세로형 필수)**:
   * 세로형(`portrait`) 장표의 `governing_message`는 제안사의 실행과 결과를 명확히 제시하며 **반드시 `니다.`로 끝나야 합니다.**
2. **고밀도 및 최소 5개 독립 내용 상자 강제**:
   * `density: "high"`가 필수입니다.
   * 장식 요소를 제외하고 최소 5개의 독립된 내용 상자(`blocks[]`)를 배치합니다.
   * 각 상자는 서로 다른 역할(`requirement_summary`, `main_process`, `operation_quality`, `technology_comparison`, `metric_highlight`)과 서로 다른 도식 토폴로지(`process`, `hub_spoke`, `comparison`, `mapping`, `quality_gate`)를 가져야 합니다.
3. **정량 지표 100% 무손실 보존 (`protected_metrics`)**:
   * RFP의 `quantitative_metrics`의 `value_text`("5초 이내", "99.9% 이상" 등)를 원문 그대로 `protected_metrics` 배열에 복사하고, 블록 헤드라인/가시 텍스트에도 동일하게 배치합니다.
4. **비교 블록에는 적용 결론 필수**:
   * 대안/기술 비교 블록은 나열로 끝내지 않고 `content.conclusion`에 무엇을 선택·통합할지 명시합니다.
5. **내부 분석 메모 노출 금지**:
   * `요구사항 해석`, 자산 검색 메모, 제작 지시 문구를 가시 제목에 노출하지 않고, `핵심 구현 전략`, `통합 실행 절차`, `운영 통제` 등 실행 중심의 제목을 사용합니다.

---

## 2. 실행 흐름

1. **입력 수집**:
   - 대상 요구사항 ID (예: `SFR-001`), 명칭, 요약 문구, 정량지표 목록.
   - 방향 (`portrait` 기본 권장) 및 주조색 팔레트 (`primary: #1769E0`, `navy: #123B78`).
   - (선택) 이전 단계(`proposal-reference-search`)에서 선택된 레퍼런스 슬라이드 ID/구조.

2. **청사진(`slide-blueprint.json`) 생성 및 세션 저장**:
   - `data-contract-v2.md` 규격에 맞는 JSON 생성.
   - 세션 ID 생성: `plan_YYYYMMDD_xxxx`
   - 세션 파일 저장: `storage/sessions/plan_xxxx.json`

3. **HitL Launcher 호출 (브라우저 자동 오픈)**:
   - 세션 URL을 대상으로 `hitl_launcher.mjs`를 실행합니다:
   ```powershell
   node tools/hitl-bridge/hitl_launcher.mjs --open "http://localhost:5173/planning?session=plan_xxxx"
   ```
   - Launcher는 Bridge/UI 헬스체크 및 자동 기동 후 기본 브라우저를 엽니다.
   - 기동 실패 시 사용자에게 오류 원인을 보고합니다.

4. **사용자 안내 및 입력 대기**:
   - 브라우저가 열린 후 사용자에게 다음 메시지로 안내합니다:
   ```text
   SFR-001 요구사항에 대한 슬라이드 청사진(Blueprint)을 기획하여 **기본 브라우저로 화면을 열었습니다.**
   (브라우저가 열리지 않은 경우: http://localhost:5173/planning?session=plan_xxxx)

   거버닝 메시지와 5개 블록 구성을 확인하시고, 문구 수정 또는 승인을 진행해 주세요.
   확인 및 승인 후 채팅창에 **"승인했어"**라고 알려주시면 최종 PPT를 생성하겠습니다!
   ```

5. **수동 Resume 처리**:
   - 사용자가 "승인했어", "확인했어" 등으로 응답하면 `storage/sessions/plan_xxxx.json` 파일을 다시 읽습니다.
   - `status: "approved"` 및 사용자가 수정한 문구를 반영하여, 최종 산출물 폴더(`storage/runs/<doc_id>/work/<req_id>/`)에 `requirement.json`, `slide-blueprint.json`, `asset-mapping.json`을 저장하고 `$proposal-ppt-maker`를 호출합니다.

---

## 3. 청사진 데이터 스키마 참조

[../../references/data-contract-v2.md](../../references/data-contract-v2.md)의 `SlideBlueprintContract` 정의를 그대로 따릅니다.
