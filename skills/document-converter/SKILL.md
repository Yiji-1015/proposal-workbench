---
name: document-converter
description: HWP, HWPX, PDF, DOCX 등의 원본 제안 문서를 Markdown과 구조화 텍스트로 변환하는 독립 문서 파싱 Skill.
---

# Document Converter

HWP, HWPX, PDF, DOCX, PPTX 원문을 `kordoc`으로 파싱해 Markdown과 헤딩 계층 `sections[]`를 만든다. 변환이 끝났다고 해서 RFP 분석이나 PPT 생성을 자동으로 시작하지 않는다.

## 실행

플러그인 루트에서 CLI를 실행한다.

```powershell
node "<plugin-root>/tools/doc-converter/cli.mjs" --input "<input-file>" --output-dir "<output-dir>"
```

웹 업로드가 필요한 경우에만 `tools/doc-converter/server.js`를 사용한다. 변환기 의존성은 선택 사항이며 다음 명령으로 설치한다.

```powershell
npm --prefix "<plugin-root>/tools/doc-converter" install
```

## 출력

지정한 출력 폴더에 다음을 저장한다.

- `converted_doc.md`: 파싱된 전체 Markdown
- `doc_analysis.json`: `doc_id`, `file_name`, `page_count`, `converted_at`, `markdown`, `sections[]`
- `sections[]`: `{ heading, level, text, page }` 구조

입력 형식이 이미 Markdown 또는 JSON이면 문서 변환을 생략하고 바로 후속 Skill에 전달한다. 파서 실패 시 오류를 보고하고 불완전한 Markdown을 정상 결과로 표시하지 않는다.
