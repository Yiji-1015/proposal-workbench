---
name: document-converter
description: HWP, HWPX, PDF, DOCX 등의 원본 제안 문서를 입력받아 Markdown 및 구조화 텍스트로 변환하는 독립 문서 파싱 Skill.
---

# Document Converter

공공 및 기업 제안에서 사용되는 HWP, HWPX, PDF, DOCX 문서를 `kordoc` 기반의 문서 파서 도구(`tool-doc-converter`)를 사용하여 Markdown 및 목차 계층 구조(`sections[]`)를 포함한 텍스트로 변환합니다.

---

## 1. 실행 방법

사용자가 파일 경로를 제공하거나 변환을 요청하면 `tools/doc-converter`를 실행합니다:

```powershell
node tools/doc-converter/server.js
```
(또는 kordoc CLI / MCP를 지원하는 환경에서는 kordoc 파싱 도구를 직접 호출합니다.)

---

## 2. 입력 및 출력 규격

* **입력 파일**: `.hwp`, `.hwpx`, `.pdf`, `.docx`, `.pptx`
* **출력 데이터**:
  - `doc_id`: 문서 해시/식별자
  - `file_name`: 원본 파일명
  - `page_count`: 총 페이지 수
  - `markdown`: 추출된 전체 Markdown 텍스트
  - `sections[]`: 목차/헤딩 계층별 `{ heading, level, text, page }`

---

## 3. 원칙

* 문서 변환은 **독립적으로 실행**되며, 변환 완료 후 자동으로 RFP 분석이나 PPT 생성을 강제 시작하지 않습니다.
* 결과물은 `storage/runs/<doc_id>/converted_doc.md`에 저장하고, 사용자가 요청할 때 후속 작업(`rfp-analyzer`)의 입력으로 제공합니다.
