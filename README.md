# 제안 업무 자동화 워크벤치 (Proposal Workbench)

> **Agent 중심 독립 Skill 체계 + Zero-dependency 초경량 HitL 뷰어 기반의 제안 업무 자동화 플랫폼**

---

## 1. 아키텍처 개요

이 프로젝트는 단일 모놀리식 웹 서비스가 아닌, **Codex / Claude 같은 Agent가 제안 업무 단계별로 필요한 전문 Skill을 독립적으로 호출하고, 시각적 판단이 필요한 순간에만 Human-in-the-Loop (HitL) 뷰어를 활용하는 분산 워크벤치**입니다.

```text
               ┌────────────────────────────────────────────────────────┐
               │              AI Agent (Codex / Claude)                 │
               └─┬─────────┬─────────┬─────────┬─────────┬─────────┬────┘
                 │         │         │         │         │         │
                 ▼         ▼         ▼         ▼         ▼         ▼
  ┌────────────────┐┌────────────┐┌────────────┐┌────────────┐┌────────────┐┌──────────────┐
  │$document-      ││$rfp-       ││$proposal-  ││$proposal-  ││$proposal-  ││$proposal-    │
  │converter       ││analyzer    ││ppt-ingest  ││reference-  ││slide-      ││ppt-maker     │
  │                ││            ││            ││search      ││planner     ││              │
  └───────┬────────┘└─────┬──────┘└─────┬──────┘└─────┬──────┘└─────┬──────┘└──────┬───────┘
          │               │             │             │             │              │
          │               ▼             │             ▼             ▼              │
          │     ┌──────────────────┐    │       ┌────────────────────────┐         │
          │     │ company_profile/ │    │       │ HitL Bridge (Port 5174)│         │
          │     │ (제안사 프로필)  │    │       │ • picker.html          │         │
          │     └──────────────────┘    │       │ • planner.html         │         │
          │                             │       │ • ingest.html          │         │
          │                             │       └────────────────────────┘         │
          ▼                             ▼                                          ▼
  ┌────────────────┐           ┌────────────────┐                         ┌────────────────┐
  │tool-doc-       │           │tool-ppt-ingest │                         │tool-slide-     │
  │converter       │           │(COM + M3 + SQLite) │                     │renderer        │
  └────────────────┘           └────────────────┘                         └────────────────┘
```

---

## 2. 디렉터리 구성

```text
proposal-workbench/
├─ skills/                           ──▶ Agent Skills (업무 판단 및 오케스트레이션)
│  ├─ document-converter/            ──▶ HWP/PDF/DOCX -> Markdown 독립 변환
│  ├─ rfp-analyzer/                  ──▶ 목표업무흐름, 13대 도메인, KPI, 역량 Gap 정밀 분석
  │  ├─ proposal-ppt-ingest/           ──▶ 과거 제안서 PPTX 분해, COM 렌더링, BGE-M3 + SQLite 색인
  │  ├─ proposal-reference-search/     ──▶ SQLite lexical/vector 검색 + HitL Reference Picker 자동 오픈
│  ├─ proposal-slide-planner/        ──▶ 5개 블록, 거버닝 메시지(~니다.), 정량지표 보존 장표 기획
│  ├─ proposal-ppt-maker/            ──▶ OpenXML 기반 네이티브 도형 PPTX 생성
│  └─ proposal-reviewer/             ──▶ 4대 결함(요구사항누락, 수치왜곡, 과장표현, 레이아웃) QA
│
├─ tools/                            ──▶ Execution / Non-agentic Tools
│  ├─ slide-renderer/                ──▶ OpenXML 파워포인트 도형 렌더링 엔진
│  ├─ pattern-library/               ──▶ 45개 제안 도식 패턴 카탈로그 & 레시피
│  ├─ ppt-ingest/                    ──▶ COM 고화질 PNG 렌더러 + python-pptx 구조 추출기
  │  ├─ reference-search/              ──▶ SQLite lexical/vector 검색 모듈
│  ├─ hitl-bridge/                   ──▶ Zero-dependency 단일 포트(5174) 브릿지 & HTML 뷰어
│  │  ├─ bridge_server.mjs           ──▶ 세션 API 및 HTML 뷰어 서빙 서버
│  │  ├─ hitl_launcher.mjs           ──▶ 자동 헬스체크 및 브라우저 오픈 도구
│  │  └─ public/                     ──▶ 순수 Standalone HTML 뷰어 (picker, planner, ingest)
│  └─ doc-converter/                 ──▶ kordoc 기반 문서 파서
│
├─ company_profile/                  ──▶ 제안사 역량 프로필 (범용 플러그인)
│  ├─ README.md                      ──▶ 작성 가이드
│  ├─ overview.md                    ──▶ 회사 개요 & 주력 제품
│  ├─ core_competencies.md           ──▶ 강점 기술 스택
│  └─ gap_criteria.md                ──▶ 직접 수행이 어려워 파트너 협력이 필요한 영역 기준
│
├─ references/                       ──▶ 공통 데이터 계약 및 방법론
│  └─ data-contract-v2.md            ──▶ SourceRef, QuantitativeMetrics, Blueprint 스키마
│
└─ storage/                          ──▶ 런타임 저장소 (.gitignore 적용)
   ├─ sessions/                      ──▶ HitL 세션 교환 JSON 파일
   ├─ ingest_data/                   ──▶ 색인 슬라이드 PNG, HTML, 매니페스트
   ├─ index/                         ──▶ SQLite 슬라이드 색인 DB
   └─ deliverables/                  ──▶ 최종 생성 PPTX 및 검수 보고서
```

---

## 3. 빠른 시작 가이드

### 0) Codex 로컬 플러그인 설치
`.codex-plugin/plugin.json`이 있는 저장소 루트를 로컬 marketplace로 등록한 뒤 ChatGPT 데스크톱 앱을 재시작하고 Plugins Directory에서 설치합니다.

```powershell
codex plugin marketplace add .
```

### 1) 슬라이드 렌더러 무결성 검증 (45개 도식 패턴)
```powershell
node skills/proposal-ppt-maker/scripts/verify-skill.mjs
```

### 2) 제안서 PPT 인제스트 (PowerPoint COM 렌더링 + python-pptx)
개발용 Python 가상환경은 플러그인 루트 밖에 두고 활성화합니다. PATH에 Python이 없으면 `PROPOSAL_WORKBENCH_PYTHON`에 실행 파일 경로를 지정합니다.

```powershell
python -m pip install -r tools/ppt-ingest/requirements.txt
python tools/ppt-ingest/ingest_pipeline.py --pptx "경로/제안서.pptx"
```

### 3) HitL 세션 브릿지 & 뷰어 테스트 (포트 5174 단일 서버)
```powershell
node tools/hitl-bridge/hitl_launcher.mjs --open "http://localhost:5174/picker.html?session=ref_test_001"
```

---

## 4. 제안 업무 수행 흐름 (End-to-End)

1. **RFP 분석**: `$rfp-analyzer` 실행 → `storage/runs/<id>/rfp_analysis.json` 및 `RFP_분석보고서.md` 산출.
2. **레퍼런스 탐색**: `$proposal-reference-search` 실행 → 브라우저에 `picker.html` 자동 팝업 → 후보 슬라이드 선택 후 "골랐어".
3. **장표 기획**: `$proposal-slide-planner` 실행 → 브라우저에 `planner.html` 자동 팝업 → 거버닝 메시지/5개 블록 확인 후 "승인했어".
4. **PPTX 생성**: `$proposal-ppt-maker` 실행 → `deliverables/<id>.pptx` 생성.
5. **품질 검수**: `$proposal-reviewer` 실행 → 4대 결함 검수 보고서(`review_report.json`) 산출.
