---
name: proposal-reference-search
description: RFP 요구사항이나 자연어 질의를 바탕으로 Elasticsearch KNN 벡터 검색을 수행하고, HitL Launcher를 통해 Bridge/UI 서버 준비 및 기본 브라우저를 자동으로 띄워 사용자가 참고할 장표를 직접 비교·선택할 수 있도록 돕는 Skill.
---

# Proposal Reference Search

RFP 요구사항이나 작성하고자 하는 장표의 핵심 주제를 자연어로 입력받아, 과거 우수 제안서 슬라이드 데이터베이스에서 유사한 레퍼런스 장표를 검색하고, **기본 브라우저를 자동으로 열어** 사용자가 시각적으로 비교·선택할 수 있도록 안내합니다.

---

## 1. 실행 흐름

1. **질의 분석 및 검색 실행 (Tool)**:
   - 사용자의 질의나 RFP 요구사항 문장을 추출하여 `tools/reference-search/search_cli.mjs`를 실행합니다.
   ```powershell
   node tools/reference-search/search_cli.mjs --query "<요구사항 또는 검색어>" --size 7
   ```
   - 출력된 Session ID (`ref_YYYYMMDD_xxxx`) 및 세션 파일(`storage/sessions/ref_xxxx.json`) 생성을 확인합니다.

2. **HitL Launcher 호출 (브라우저 자동 오픈)**:
   - 세션 URL(`http://localhost:5173/search?session=ref_xxxx`)을 대상으로 `hitl_launcher.mjs`를 실행합니다:
   ```powershell
   node tools/hitl-bridge/hitl_launcher.mjs --open "http://localhost:5173/search?session=ref_xxxx"
   ```
   - Launcher는 Bridge(5174)와 UI(5173) 헬스체크를 수행하여 미기동 시 자동 실행하고, 사용자의 기본 브라우저에 해당 화면을 자동으로 엽니다.
   - 만약 기동 실패(`error`)가 발생하면 사용자에게 해당 에러 원인을 명확히 안내합니다.

3. **사용자 안내 및 입력 대기**:
   - 브라우저가 열린 후 사용자에게 다음 메시지로 안내합니다:
   ```text
   요구사항에 맞는 유사 제안 장표 후보 7건을 검색하여 **기본 브라우저로 화면을 열었습니다.**
   (브라우저가 열리지 않은 경우: http://localhost:5173/search?session=ref_xxxx)

   슬라이드 구성과 HTML을 비교하신 후 참고할 장표를 선택하고 확정해주세요.
   선택을 마치신 후 채팅창에 **"골랐어"**라고 알려주시면 다음 작업을 이어가겠습니다!
   ```

4. **수동 Resume 처리**:
   - 사용자가 채팅창에 "골랐어", "선택했어" 등으로 응답하면, `storage/sessions/ref_xxxx.json` 파일을 다시 읽습니다.
   - `selected_slide_ids`에 포함된 슬라이드의 제목, 구조, 태그를 확인하고, 후속 장표 기획(`proposal-slide-planner`) 또는 제안 작업에 레퍼런스로 활용합니다.

---

## 2. 세션 데이터 규격 (`ReferencePickerSession`)

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
  selected_slide_ids: string[]; // 사용자가 브라우저에서 선택한 ID 배열
  status: "pending" | "completed";
}
```
