---
name: document-converter
description: HWP, HWPX, PDF, DOCX, XLSX 등의 원본 제안 문서를 Markdown과 구조화 텍스트로 변환하는 독립 문서 파싱 Skill.
---

# Document Converter

한글 공공문서 원문을 `kordoc`으로 파싱해 Markdown과 헤딩 계층 `sections[]`를 만든다. 변환이 끝났다고 해서 RFP 분석이나 PPT 생성을 자동으로 시작하지 않는다.

## 지원 포맷

`kordoc`이 처리하는 확장자만 입력으로 받는다.

| 확장자 | 비고 |
| --- | --- |
| `.hwp`, `.hwpx`, `.hml` | 한컴 문서. 암호 문서는 `kordoc`의 `password` 옵션 필요 |
| `.pdf` | 텍스트 레이어 기준. 스캔 PDF는 OCR 옵션 필요 |
| `.docx` | |
| `.xls`, `.xlsx` | |

**PPTX·POTX는 이 Skill로 변환하지 않는다.** `kordoc`이 지원하지 않는 확장자이며, PPTX도 내부적으로 ZIP이라 확장자 검사 없이 넘기면 HWPX로 오인되어 `"HWPX에서 섹션 파일을 찾을 수 없습니다"` 같은 무관한 오류가 난다. 제안서 PPTX·POTX는 `proposal-ppt-ingest`로 처리한다.

입력이 이미 Markdown 또는 JSON이면 문서 변환을 생략하고 바로 후속 Skill에 전달한다.

## 최초 실행

**첫 실행 전 반드시** 의존성을 설치한다. `node_modules`가 없으면 `kordoc`을 찾지 못해 CLI가 즉시 실패한다.

```powershell
npm --prefix "<plugin-root>/tools/doc-converter" install
```

## 실행

플러그인 루트에서 CLI를 실행한다.

```powershell
node "<plugin-root>/tools/doc-converter/cli.mjs" --input "<input-file>" --output-dir "<output-dir>"
```

웹 업로드가 필요한 경우에만 `<plugin-root>/tools/doc-converter/server.js`를 사용한다.

## 출력

지정한 출력 폴더에 다음을 저장한다.

- `converted_doc.md`: 파싱된 전체 Markdown
- `doc_analysis.json`: `doc_id`, `file_name`, `page_count`, `converted_at`, `markdown`, `sections[]`
- `sections[]`: `{ heading, level, text, page }` 구조

## 실패 처리

파서 실패 시 오류를 보고하고 불완전한 Markdown을 정상 결과로 표시하지 않는다. 지원하지 않는 확장자는 파싱을 시도하지 않고 지원 목록과 함께 거부한다.
