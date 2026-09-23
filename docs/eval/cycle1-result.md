# rfp-analyzer eval — 1회차 (baseline) 결과

- 실행일: 2026-09-22
- 루브릭: `rubric.md` (실행 전 고정)
- 입력: 코레일 XAIS RFP 227p (제안요청서 153 + 공고문 12 + 설계서 62)
- 산출물: `RFP_분석보고서.md` (약 20KB, 8절)

## 점수

| 항목 | 배점 | 득점 | 근거 |
| --- | --- | --- | --- |
| R1 요구사항 recall | 40 | **40** | 49/49 전건 검출. ID·명칭·구분 모두 일치 |
| R2 분류 정확도 | 15 | **14** | 9개 도메인 배치 정확. 13개 표준 도메인 매핑 시 "워크스페이스"에 SFR-011만 넣어 다소 빈약 |
| R3 정량 KPI 추출 | 15 | **15** | 정답지 10건 전건 + 정답지에 없던 5건 추가 검출 (아래 참조) |
| R4 숨은 의무 | 15 | **12** | 정답지 9건 중 7건. 누락: 영문약어표 제공, 사본 "사실과 상위없음" 날인 |
| R5 환각 | -30~0 | **0** | 검증한 모든 수치·조항이 원문 대조 일치. 추론은 전부 `[추론]`/`[확인 필요]`로 표시 |
| R6 산출물 사용성 | 15 | **13** | 제안서 목차로 이어붙일 수 있는 구조. 다만 요구사항→평가배점 항목 간 매핑표가 없어 추적표 작성 시 한 단계 수작업 필요 |
| **합계** | 100 | **94** | 실무 투입 가능 (기준 60) |

## 루브릭 정답지의 결함

내가 실행 전에 만든 정답지 B(정량 KPI 10건)가 불완전했다. 실행 결과가 정답지보다 더 많이 찾아냈다.

정답지에 없었으나 원문에 있던 mandatory 수치:

- **하도급 불허** (제안요청서 Ⅳ.1.라) — 가장 중요한 제약인데 정답지에서 빠졌다
- 앱 로그 전송 **응답시간 2초 초과 시 전송 실패 처리**
- 프록시 서버 **2대 이상** 이중화
- (참고) 명절 최대 동시접속자 **203만명**
- 결제금액 **상위 100위** 순위 통계
- 청렴계약 특별신인도 **0 ~ -4** 감점

→ n=1 eval에서 정답지를 사람이 손으로 만들면 이런 누락이 생긴다. 다음 사이클 전에 정답지를 요구사항 원문에서 기계적으로 재추출해야 한다.

## 발견된 스킬 버그

### 1. document-converter — PPTX 미지원 (심각)

SKILL.md 첫 줄: "HWP, HWPX, PDF, DOCX, **PPTX** 원문을 `kordoc`으로 파싱해..."

실제: kordoc이 `.pptx`를 지원하지 않는다. kordoc 자체 에러 메시지가 허용 확장자를 나열한다.

```
오류: 지원하지 않는 확장자입니다: .pptx
(허용: .hwp, .hwpx, .hml, .pdf, .xls, .xlsx, .docx, .png, .jpg, .jpeg, .webp)
```

더 나쁜 건 CLI가 확장자 게이트 없이 kordoc에 넘기는 바람에, PPTX도 ZIP이라 HWPX로 오인돼 엉뚱한 메시지가 나온다.

```
$ node cli.mjs --input "DO3.0 솔루션소개서_v1.5.pptx" --output-dir ...
{ "error": "HWPX에서 섹션 파일을 찾을 수 없습니다" }
```

`cli.mjs`의 헤더 주석은 "HWP, HWPX, PDF, DOCX"로 정확히 적혀 있다 — SKILL.md만 틀렸다.

**수정 방향 (택 1)**
- (a) SKILL.md에서 PPTX를 빼고, PPTX 입력 시 `proposal-ppt-ingest`로 안내
- (b) `cli.mjs`에 python-pptx 또는 JS 기반 PPTX 텍스트 추출 경로를 추가하고 SKILL.md 유지
- 어느 쪽이든 CLI에 확장자 화이트리스트를 두어 "HWPX에서 섹션 파일을 찾을 수 없습니다" 같은 오인 메시지가 나오지 않게 할 것

**우회 방법 (이번에 사용)**: python-pptx로 47슬라이드 20KB 텍스트 추출. PDF 변환본보다 오히려 구조가 깨끗했다.

### 2. rfp-analyzer — company_profile 경로 표기 불일치 (경미)

SKILL.md 필수 참조:

```
- `<plugin-root>/references/data-contract-v2.md`의 ...
- `company_profile/overview.md`, `core_competencies.md`, `gap_criteria.md`
```

앞 항목은 `<plugin-root>/` 접두사가 있는데 뒤 항목은 없다. 실제 위치는 `<plugin-root>/company_profile/`이라서, 스킬 폴더 기준으로 찾으면 "No such file or directory"가 난다.

**수정 방향**: `<plugin-root>/company_profile/...`로 통일

### 3. document-converter — node_modules 미포함 (환경 의존)

`npm --prefix <plugin-root>/tools/doc-converter install`이 SKILL.md에 적혀 있긴 하나, 첫 실행 시 반드시 필요하다는 점이 "kordoc 의존성이 필요하며" 한 줄에 묻혀 있다. 설치에 18초, 144패키지.

**수정 방향**: "첫 실행 전 반드시" 수준으로 올리고, `node_modules` 부재 시 CLI가 친절한 에러를 내도록

## 잘 작동한 것

- **rfp-analyzer의 시작 전 게이트가 제대로 동작했다.** `company_profile/` 3개 파일이 전부 `<!-- status: template`이라 자사 역량 추정을 막고 사용자에게 자료를 물었다. 이 게이트가 없었으면 로이드케이 역량을 내가 지어냈을 가능성이 높다. 플러그인에서 가장 잘 설계된 부분.
- `[확인 필요]` 사용 조건을 3가지로 못박은 규칙(원문 없음 / 자료 없음 / 원문 모호)이 남용을 억제했다. 특히 "원문에 명확히 적힌 사실은 확인 필요로 낮추지 말라"는 문장이 있어 안전빵 회피가 줄었다.
- "자사 자료 없음을 RFP 불확실성으로 표현하지 말라"는 지시가 Gap 절과 리스크 절을 분리시켰다.
- 단일 산출물 원칙(`RFP_분석보고서.md` 하나, JSON/HTML 중복 생성 금지)이 형식 분기로 인한 내용 갈림을 막았다.
- PDF 변환: 14MB / 15초 / 142섹션. 개요번호 체계(Ⅰ. / 1. / 가. / 1) / 가))로 헤딩을 복원하는 `OUTLINE_PATTERNS` 보조 규칙이 실제로 동작했다.

## 다음 사이클 개선 타깃

1. document-converter SKILL.md의 PPTX 기재 수정 + CLI 확장자 게이트 (버그 1)
2. rfp-analyzer SKILL.md의 company_profile 경로 통일 (버그 2)
3. 요구사항 ID ↔ 평가배점 항목 매핑표를 산출물에 추가 (R6 감점 사유)
4. 정답지를 원문에서 기계적으로 재추출 (eval 설계 결함)
5. 개선 전후 각 2~3회 반복 실행해 변동성 확인 — 1회 비교로는 개선 여부를 판정할 수 없음

## 후속 조치

버그 1·2는 수정 후 커밋 `b415c21` (브랜치 `fix/doc-converter-pptx-guard`)로 반영했다.

- `document-converter/SKILL.md`: PPTX 기재 제거, 지원 확장자 표 명시, PPTX·POTX는 `proposal-ppt-ingest`로 안내, npm install을 "최초 실행" 절로 분리
- `tools/doc-converter/cli.mjs`: `assertSupportedExtension()` 추가 — 파싱 전에 확장자를 거르고, PPT 계열은 전용 메시지로 안내
- `tools/doc-converter/cli.test.mjs`: 확장자 게이트 테스트 3건 추가 (기존 5건 + 신규 3건 = 8건 통과)
- `rfp-analyzer/SKILL.md`: `company_profile` 경로를 `<plugin-root>/` 기준으로 통일
- `plugin.json`: 2.2.0 → 2.2.1

회귀 확인: 회사소개서 PDF(14MB)의 `converted_doc.md`가 수정 전후 `diff -q` 기준 완전 동일, 142섹션 유지.

버그 3(node_modules 미포함)은 SKILL.md에 "최초 실행" 절을 분리하는 것으로 문서상 완화했고, CLI가 `node_modules` 부재를 친절하게 안내하는 부분은 반영하지 않았다.

### 이 수정이 eval 점수를 올리지는 않는다

고친 것은 문서 정확성과 오류 메시지이고 분석 품질이 아니다. R1~R6 배점 중 어느 항목도 직접 겨냥하지 않았으므로 2회차에서 94점 근처가 다시 나오는 것이 정상이다. 개선 효과는 "PPTX를 넣은 사용자가 원인을 오해하지 않는다"는 데 있고, 그건 이 루브릭이 측정하지 않는다. 다음 사이클은 R6(요구사항 ID ↔ 평가배점 매핑표)와 R4(누락된 숨은 의무 2건)를 겨냥해야 점수 변화를 볼 수 있다.
