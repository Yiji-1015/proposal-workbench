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
          │     │ company_profile/ │    │       │ HitL Bridge (Port 5274)│         │
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
│  ├─ proposal-ppt-ingest/           ──▶ 독립 PPTX/POTX 분해, COM 렌더링, BGE-M3 + SQLite 색인
│  ├─ proposal-reference-search/     ──▶ 독립 SQLite lexical/vector 검색 + HitL Reference Picker
│  ├─ proposal-slide-planner/        ──▶ 5개 블록, 거버닝 메시지(~니다.), 정량지표 보존 장표 기획
│  ├─ proposal-ppt-maker/            ──▶ OpenXML 기반 네이티브 도형 PPTX 생성
│  ├─ proposal-asset-curator/        ──▶ 블록·도식·아이콘 후보 선별 및 승인 자산 승격
│  └─ proposal-reviewer/             ──▶ 4대 결함(요구사항누락, 수치왜곡, 과장표현, 레이아웃) QA
│
├─ tools/                            ──▶ Execution / Non-agentic Tools
│  ├─ slide-renderer/                ──▶ OpenXML 파워포인트 도형 렌더링 엔진
│  ├─ pattern-library/               ──▶ 사용자 제공 도식 자산 카탈로그 (초기 빈 상태 허용)
│  ├─ ppt-ingest/                    ──▶ COM 고화질 PNG 렌더러 + python-pptx 구조 추출기
│  ├─ reference-search/              ──▶ SQLite lexical/vector 검색 모듈
│  ├─ hitl-bridge/                   ──▶ Zero-dependency 단일 포트(5274) 브릿지 & HTML 뷰어
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
   ├─ asset_candidates/              ──▶ 로컬 에셋 후보·익명화 검토 데이터 (Git 제외)
   └─ deliverables/                  ──▶ 최종 생성 PPTX 및 검수 보고서
```

---

## 3. 빠른 시작 가이드

### 0) 로컬 플러그인 설치

저장소 루트가 곧 플러그인 소스입니다. 스킬은 `tools/slide-renderer`와 `tools/pattern-library`를 플러그인 루트 기준으로 찾으므로 `skills/`만 따로 복사하지 말고 저장소를 통째로 설치합니다.

**Claude Code** — `.claude-plugin/marketplace.json`을 로컬 marketplace로 등록한 뒤 설치합니다. 경로는 `.`이 아니라 `./` 형태여야 합니다.

```powershell
claude plugin marketplace add ./
claude plugin install proposal-workbench@proposal-workbench-local
```

설치 후 `claude plugin details proposal-workbench`로 Skill 8개가 모두 잡혔는지 확인합니다. 새 세션부터 로드됩니다.

> 플러그인 캐시는 저장소의 복사본이며 경로가 버전으로 구분됩니다. 저장소를 고쳐도 `plugin.json`의 버전이 그대로면 `claude plugin install`·`update`·`marketplace update`가 모두 "이미 최신"으로 건너뜁니다. 개발 중에 수정본을 반영하려면 버전을 올리거나 다음처럼 재설치합니다.

```powershell
claude plugin uninstall proposal-workbench@proposal-workbench-local
claude plugin install proposal-workbench@proposal-workbench-local
```

**Codex** — `.codex-plugin/plugin.json`이 있는 저장소 루트를 로컬 marketplace로 등록한 뒤 ChatGPT 데스크톱 앱을 재시작하고 Plugins Directory에서 설치합니다.

```powershell
codex plugin marketplace add .
```

### 0-1) 최초 실행 환경 점검 및 의존성 설치
플러그인 설치 후 먼저 Doctor를 실행합니다. HWP·PDF·DOCX 원문을 변환하려면 `doc_converter_kordoc`가 필요합니다. 해당 체크가 실패하면 출력된 `Run:` 명령(`npm --prefix ... install`)을 PowerShell에 붙여 넣고 다시 실행합니다. `python_pptx` 또는 `powerpoint_com`이 실패해도 같은 방식으로 출력된 Python 설치 명령을 사용합니다.

```powershell
node tools/verify-workbench.mjs
```

문서 변환 의존성만 직접 설치할 때:

```powershell
npm --prefix tools/doc-converter install
```

실제 PowerPoint 렌더링·검증까지 하려면 `python-pptx`, `pywin32`, 데스크톱 PowerPoint가 필요합니다. 구조·텍스트 추출만 할 때는 `powerpoint_com` 경고를 허용할 수 있습니다.

### 1) 슬라이드 렌더러·자산 계약 검증
```powershell
node skills/proposal-ppt-maker/scripts/verify-skill.mjs
```

### 2) 제안서 PPT 인제스트 (PowerPoint COM 렌더링 + python-pptx)
Doctor에서 Python 의존성 설치 안내를 확인한 뒤 실행합니다. 일반 Python을 직접 지정할 때는 `python.exe`와 같은 인터프리터로 설치합니다.

```powershell
python -m pip install -r tools/ppt-ingest/requirements.txt
python tools/ppt-ingest/ingest_pipeline.py --source "경로/제안서.pptx 또는 템플릿.potx"
```

### 3) HitL 세션 브릿지 & 뷰어 테스트 (포트 5274 단일 서버)
```powershell
node tools/hitl-bridge/hitl_launcher.mjs --open "http://localhost:5274/picker.html?session=ref_test_001"
```

---

## 4. 제안 업무 수행 흐름 (End-to-End)

인제스트와 검색은 각각 독립 실행하며 장표 기획의 필수 선행 단계가 아니다.

1. **RFP 분석**: `$rfp-analyzer` 실행 → `storage/runs/<id>/rfp_analysis.json` 및 `RFP_분석보고서.md` 산출.
2. **선택적 PPT 인제스트**: 레퍼런스 라이브러리에 추가할 때만 `$proposal-ppt-ingest` 실행 후 종료.
3. **선택적 에셋 선별**: `$proposal-asset-curator` 실행 → 블록 후보를 검토하고 명시적으로 승인한 후보만 `tools/pattern-library`로 승격.
4. **선택적 레퍼런스 탐색**: 사용자가 요청할 때만 `$proposal-reference-search` 실행 → 후보 선택 결과를 보고하고 종료.
5. **장표 기획 (1차 승인)**: `$proposal-slide-planner` 실행 → 방향 선택 → **블록별 내용 확정** → 내용에 맞는 블록 타입 선택 → 블록 구성과 간단 내용을 와이어프레임으로 표시하고 승인(`status: structure_approved`).
6. **상세화·PPTX 생성 (2차 승인)**: `$proposal-ppt-maker` 실행 → 블록별 문구 상세화 → 블록마다 참고 자산 검색·선택 → 와이어프레임 재표시 후 승인(`status: approved`) → `deliverables/<id>.pptx` 생성.
7. **품질 검수**: `$proposal-reviewer` 실행 → 4대 결함 검수 보고서(`review_report.json`) 산출.

### 자산을 다루는 원칙

장표는 **네이티브 PowerPoint 도형으로 완성**한다. `tools/pattern-library`의 자산은 원본 슬라이드를 그대로 옮겨오는 부품이 아니라 **구조를 참고할 레퍼런스**다. 원본을 픽셀 단위로 재현하는 것은 이 도구의 목표가 아니며, 자산을 그대로 적용하지 못하는 것은 실패가 아니다.

그렇다고 자산 선택을 건너뛰어서는 안 된다. 블록마다 `display_name`·`description`·`design_traits`·`use_cases`·`search_tags`로 카탈로그를 실제로 검색해 최선의 후보를 고르고, 고른 이유를 `usage_note`에 남긴다. 맞는 자산이 없으면 무엇을 찾았고 왜 맞지 않았는지를 적은 뒤 네이티브 도형 폴백으로 진행한다. 검색 없이 모든 블록을 폴백으로 적는 것은 금지한다.

작업 순서도 고정이다. **블록별 내용을 문장 수준으로 확정한 다음에** 그 내용에 맞는 블록 타입을 고른다. 그릇을 먼저 정하고 내용을 끼워 맞추면 요구사항이 달라도 같은 장표가 나온다.

### 승인을 두 번 나누는 이유

| 단계 | 담당 | 확정하는 것 | 청사진 `status` |
| --- | --- | --- | --- |
| 1차 | `$proposal-slide-planner` | 블록 구성 + 블록별 간단 내용 | `draft` → `structure_approved` |
| 2차 | `$proposal-ppt-maker` | 자산 선택 + 문구 상세화 | `structure_approved` → `approved` |

한 번에 완성본을 들이밀면 구조를 바꾸기 어려워진다. 1차에서 뼈대를 합의한 뒤 2차에서 살을 붙인다. 1차에서 확정된 블록 구성은 사용자가 바꾸라고 하지 않는 한 2차에서 임의로 바꾸지 않는다. 렌더러는 `approved`만 통과시키므로 `draft`와 `structure_approved` 단계에서는 PPTX가 만들어지지 않는다.
