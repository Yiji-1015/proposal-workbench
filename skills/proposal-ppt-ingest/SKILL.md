---
name: proposal-ppt-ingest
description: 기존 제안서 PPTX를 슬라이드 이미지와 구조 데이터로 추출하고 메타데이터, 선택적 BGE-M3 임베딩, SQLite3 색인을 생성하는 제안서 인덱싱 Skill.
---

# Proposal PPT Ingest

과거 제안서 PPTX를 슬라이드 단위로 추출해 `storage/ingest_data/`와 `storage/index/slides.sqlite3`에 저장한다. PowerPoint가 있으면 COM으로 고화질 PNG를 만들고, 없으면 구조와 텍스트 추출을 계속 수행한다.

## 최초 실행

처음 실행하는 사용자는 먼저 WorkBench Doctor를 실행한다.

```powershell
node tools/verify-workbench.mjs
```

`python_pptx` 또는 `powerpoint_com`이 실패하면 Doctor 출력의 `Run:` 명령을 그대로 PowerShell에 붙여 넣는다. 일반 Python을 사용할 경우에도 반드시 같은 인터프리터로 다음 requirements를 설치한다.

```powershell
python -m pip install -r tools/ppt-ingest/requirements.txt
```

`python-pptx`는 구조 추출에 필요하다. 실제 PowerPoint COM 렌더링에는 `pywin32`와 데스크톱 PowerPoint가 추가로 필요하며, 없으면 구조·텍스트 추출로 폴백한다.

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
node tools/hitl-bridge/hitl_launcher.mjs --open "http://127.0.0.1:5174/ingest.html?pptx=<source_key>"
```

## 산출물

- `storage/ingest_data/<source_key>/manifest.json`
- `storage/ingest_data/<source_key>/slides/`
- `storage/ingest_data/<source_key>/html/`
- `storage/index/slides.sqlite3`

매니페스트의 `render`, `extract`, `embedding`, `index` 상태를 그대로 보고한다. 임베딩 API가 없으면 lexical 검색용 메타데이터만 생성하며 semantic 검색 성공으로 표시하지 않는다.

HTTPS 임베딩 엔드포인트는 인증서를 기본 검증한다. 자체 서명 인증서를 쓰는 신뢰된 내부 엔드포인트에서만 `EMBEDDING_INSECURE_TLS=true`를 명시한다.
