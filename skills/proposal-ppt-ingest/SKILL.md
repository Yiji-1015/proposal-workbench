---
name: proposal-ppt-ingest
description: 기존 제안서 PPTX를 슬라이드 이미지와 구조 데이터로 추출하고 메타데이터, 선택적 BGE-M3 임베딩, SQLite3 색인을 생성하는 제안서 인덱싱 Skill.
---

# Proposal PPT Ingest

과거 제안서 PPTX를 슬라이드 단위로 추출해 `storage/ingest_data/`와 `storage/index/slides.sqlite3`에 저장한다. 실제 미리보기는 PowerPoint COM 고화질 PNG를 우선 사용하고, 렌더링이 불가능할 때만 구조·텍스트 HTML을 보조 미리보기로 사용한다.

## 최초 실행

처음 실행하는 사용자는 먼저 WorkBench Doctor를 실행한다.

```powershell
node tools/verify-workbench.mjs
```

`python_pptx` 또는 `powerpoint_com`이 실패하면 Doctor 출력의 `Run:` 명령을 그대로 PowerShell에 붙여 넣는다. 일반 Python을 사용할 경우에도 반드시 같은 인터프리터로 다음 requirements를 설치한다.

```powershell
python -m pip install -r tools/ppt-ingest/requirements.txt
```

`python-pptx`는 구조 추출에 필요하다. 실제 PowerPoint COM 렌더링에는 `pywin32`와 데스크톱 PowerPoint가 추가로 필요하다. 설치한 인터프리터와 실행 인터프리터가 다르면 `pywin32`를 찾지 못하므로 Doctor가 출력한 동일한 Python으로 설치·실행한다. Windows 사용자 세션이 없는 샌드박스에서는 COM 로그온 오류가 날 수 있으니 일반 사용자 세션의 PowerShell에서 재실행한다.

## 실행

Python 의존성을 설치한 뒤 플러그인 루트에서 실행한다.

```powershell
python -m pip install -r tools/ppt-ingest/requirements.txt
python tools/ppt-ingest/ingest_pipeline.py --pptx "<path-to-deck.pptx>"
```

주요 옵션:

- `--data-dir <path>`: 기본 `storage/` 대신 사용할 데이터 루트
- `--skip-com-render`: PowerPoint COM PNG 렌더링 생략

처리가 끝나면 필요할 때 다음으로 인제스트 뷰어를 연다.

```powershell
node tools/hitl-bridge/hitl_launcher.mjs --open "http://127.0.0.1:5274/ingest.html?pptx=<source_key>"
```

## 산출물

- `storage/ingest_data/<source_key>/manifest.json`
- `storage/ingest_data/<source_key>/slides/`
- `storage/ingest_data/<source_key>/html/`
- `storage/index/slides.sqlite3`

매니페스트에는 원본 편집 장표를 다시 추출할 수 있도록 `source_path`를 저장한다. 원본 PPTX가 이동·삭제되면 피커 미리보기와 검색은 계속 가능하지만 PPTX 다운로드는 불가능하므로 새 위치에서 한 번 다시 인제스트한다.

매니페스트의 `render`, `extract`, `embedding`, `index` 상태를 그대로 보고한다. 임베딩 API가 없으면 lexical 검색용 메타데이터만 생성하며 semantic 검색 성공으로 표시하지 않는다. lexical 검색 품질을 위해 각 장표에서 제목·번호형 소제목·본문을 함께 분석해 `slide_type`(overview/architecture/strategy/requirements 등), 핵심 주제 태그, 검색용 요약을 만든다. 제목이 `제안 개요`처럼 넓어도 본문에 포함된 RAG·아키텍처·대시보드 같은 세부 주제가 색인되며, 임베딩 API가 설정되면 이 검색용 요약과 원문을 함께 임베딩한다.

렌더링에 성공한 실제 파일이 있을 때만 장표의 `image_ref`를 기록한다. PNG가 없으면 `image_ref`는 빈 문자열이고 `html_ref`를 보조 미리보기로 사용한다. `slide_no`는 원본 장표 순서와 파일명을 맞추기 위한 내부 자동 번호이며 사용자가 입력하거나 검색어에 포함할 필요가 없다. COM 렌더링 실패 시 전체 처리는 `partial`로 보고하고 `completed`로 표시하지 않는다.

HTTPS 임베딩 엔드포인트는 인증서를 기본 검증한다. 자체 서명 인증서를 쓰는 신뢰된 내부 엔드포인트에서만 `EMBEDDING_INSECURE_TLS=true`를 명시한다.
