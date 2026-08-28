---
name: proposal-ppt-ingest
description: 기존 제안서 PPTX 파일을 입력받아 슬라이드 분할, 고화질 PNG 렌더링, 텍스트/도형 구조 추출, 메타데이터 생성(설명/태그/레이아웃), BGE-M3 임베딩 및 Elasticsearch 색인을 수행하고, HitL Launcher를 통해 브라우저 인제스트 뷰어를 자동으로 띄우는 제안서 인덱싱 Skill.
---

# Proposal PPT Ingest

임의의 과거 제안서 `.pptx` 파일을 입력받아 슬라이드 단위로 분해하고, 검색 가능한 벡터 DB(Elasticsearch)에 등록한 후, **기본 브라우저를 자동으로 열어** 분할된 슬라이드 썸네일과 색인 상태를 시각적으로 보여줍니다.

---

## 1. 실행 흐름

1. **파이프라인 실행 (Tool)**:
   - 사용자가 제안서 PPTX 파일의 등록/색인을 요청하면 `tools/ppt-ingest/ingest_pipeline.py`를 실행합니다:
   ```powershell
   py -3.13 tools/ppt-ingest/ingest_pipeline.py --pptx "<경로/제안서.pptx>"
   ```

2. **HitL Launcher 호출 (브라우저 자동 오픈)**:
   - 파이프라인이 완료되면 파일명 stem을 기반으로 브라우저 뷰어를 엽니다:
   ```powershell
   node tools/hitl-bridge/hitl_launcher.mjs --open "http://localhost:5173/ingest?pptx=<파일명_stem>"
   ```

3. **결과 보고**:
   - 사용자에게 기본 브라우저에 인제스트 뷰어를 열었음을 알리고 핵심 요약을 보고합니다:
   ```text
   제안서 '<파일명.pptx>'의 슬라이드 분할(총 N장) 및 고화질 PNG 렌더링, 색인을 완료하여 **기본 브라우저로 뷰어를 열었습니다.**
   (브라우저가 열리지 않은 경우: http://localhost:5173/ingest?pptx=<파일명_stem>)
   ```

---

## 2. 주요 옵션

* `--output-dir <경로>`: 이미지와 HTML 산출물을 저장할 디렉터리 (기본값: `storage/ingest_data/<파일명>/`)
* `--skip-com-render`: PowerPoint COM 렌더링을 건너뛰고 구조/텍스트만 추출할 때 사용
* `--no-es`: Elasticsearch 색인을 건너뛰고 로컬 파일(PNG/HTML/JSON)만 생성할 때 사용
