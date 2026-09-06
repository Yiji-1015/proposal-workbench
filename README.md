# 제안 업무 자동화 워크벤치 (Proposal Workbench)

> **RFP 분석부터 편집 가능한 네이티브 도형 PPTX 장표 생성까지, Agent Skill 6개와 Human-in-the-Loop 뷰어로 구성한 제안 업무 워크벤치**

---

## 1. 아키텍처 개요

단일 웹 서비스가 아니라, **Codex / Claude 같은 Agent가 제안 업무 단계별로 필요한 Skill을 독립적으로 호출하고, 시각적 판단이 필요한 순간에만 Human-in-the-Loop(HitL) 뷰어를 여는 분산 워크벤치**다. 각 Skill은 다른 Skill을 자동 호출하지 않으며, 산출물 파일을 통해서만 이어진다.

```text
                 ┌──────────────────────────────────────────────────────────────┐
                 │                    AI Agent (Codex / Claude)                 │
                 └──┬──────────┬──────────┬──────────┬──────────┬──────────┬────┘
                    │          │          │          │          │          │
                    ▼          ▼          ▼          ▼          ▼          ▼
            ┌───────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐
            │$document- ││$rfp-     ││$proposal-││$proposal-││$proposal-││$proposal-│
            │converter  ││analyzer  ││ppt-ingest││reference-││slide-    ││ppt-maker │
            │           ││          ││          ││search    ││planner   ││          │
            └─────┬─────┘└────┬─────┘└────┬─────┘└────┬─────┘└────┬─────┘└────┬─────┘
                  │           │           │           │           │           │
                  │           ▼           │           ▼           ▼           │
                  │  ┌────────────────┐   │   ┌──────────────────────────┐    │
                  │  │company_profile/│   │   │ HitL Bridge (포트 5274)  │    │
                  │  │ 제안사 프로필  │   │   │ picker · planner · ingest│    │
                  │  └────────────────┘   │   └──────────────────────────┘    │
                  ▼                       ▼                                   ▼
          ┌──────────────┐        ┌──────────────┐                    ┌──────────────┐
          │tools/        │        │tools/        │                    │tools/        │
          │doc-converter │        │ppt-ingest    │                    │slide-renderer│
          │(kordoc)      │        │(COM+SQLite)  │                    │(OpenXML)     │
          └──────────────┘        └──────────────┘                    └──────────────┘
```

핵심 원칙은 두 가지다.

- **PPT 코어는 에셋에 의존하지 않는다.** 장표는 AI가 `shape_plan`에 직접 저작한 네이티브 PowerPoint 도형으로 만든다. 에셋 카탈로그, 고정 도식 레시피, 검색 색인, 임베딩이 없어도 렌더링된다.
- **과거 장표는 구조 레퍼런스일 뿐이다.** 인제스트와 검색은 선택 도구이며, 사용자가 고른 슬라이드는 도형을 복사하는 원본이 아니라 배치를 참고하는 힌트다.

---

## 2. 디렉터리 구성

```text
proposal-workbench/
├─ skills/                           ──▶ Agent Skills (업무 판단 및 오케스트레이션)
│  ├─ document-converter/            ──▶ HWP/HWPX/PDF/DOCX → Markdown 독립 변환
│  ├─ rfp-analyzer/                  ──▶ 업무 흐름, 기능 도메인, KPI, 역량 Gap 분석 → RFP_분석보고서.md
│  ├─ proposal-ppt-ingest/           ──▶ 독립 PPTX/POTX 분해, COM 렌더링, 선택적 BGE-M3 + SQLite 색인
│  ├─ proposal-reference-search/     ──▶ 독립 SQLite lexical/vector 검색 + HitL Reference Picker
│  ├─ proposal-slide-planner/        ──▶ 요구사항별 5~6개 블록 청사진 기획 (1차 승인)
│  └─ proposal-ppt-maker/            ──▶ shape_plan 저작과 네이티브 도형 PPTX 렌더링 (2차 승인)
│     ├─ references/                 ──▶ io-contract, agent-authored-layout, portrait-proposal 규약
│     ├─ scripts/                    ──▶ run-proposal.mjs, verify-skill.mjs, validate-agent-brief.mjs
│     └─ agents/openai.yaml          ──▶ Codex 표시 이름과 기본 프롬프트
│
├─ tools/                            ──▶ 실행 도구 (Agent 판단 없이 동작)
│  ├─ slide-renderer/                ──▶ OpenXML 네이티브 도형 렌더러 (bin/build-proposal.mjs, src/, tests/)
│  ├─ ppt-ingest/                    ──▶ COM PNG 렌더러, OOXML 패키지 리더, python-pptx 구조 추출, SQLite 색인
│  ├─ reference-search/              ──▶ SQLite lexical/vector 검색 모듈 + search_cli.mjs
│  ├─ hitl-bridge/                   ──▶ 무의존성 단일 포트(5274) 브릿지 & HTML 뷰어
│  │  ├─ bridge_server.mjs           ──▶ 세션 API, 인제스트 매니페스트, 원본 장표 추출, 정적 뷰어 서빙
│  │  ├─ hitl_launcher.mjs           ──▶ 헬스체크 후 브라우저 오픈
│  │  └─ public/                     ──▶ index, picker, planner, ingest HTML + style.css
│  ├─ doc-converter/                 ──▶ kordoc 기반 문서 파서 (cli.mjs, server.js)
│  └─ verify-workbench.mjs           ──▶ WorkBench Doctor (환경·의존성·Skill 점검)
│
├─ company_profile/                  ──▶ 제안사 역량 프로필 (초기 템플릿 — 표식 제거 전까지 자사 자료로 쓰지 않음)
│  ├─ README.md                      ──▶ 작성 가이드
│  ├─ overview.md                    ──▶ 회사 개요 & 주력 제품
│  ├─ core_competencies.md           ──▶ 강점 기술 스택
│  └─ gap_criteria.md                ──▶ 파트너 협력이 필요한 영역 기준
│
├─ references/
│  └─ data-contract-v2.md            ──▶ SourceRef, QuantitativeMetrics, Blueprint, shape_plan 스키마
│
├─ storage/                          ──▶ 런타임 저장소 (.gitignore 적용, .gitkeep만 추적)
│  ├─ runs/<run-id>/                 ──▶ RFP 한 건의 작업 폴더 (변환본, 분석보고서, 청사진, 산출물)
│  ├─ sessions/                      ──▶ HitL 세션 교환 JSON
│  ├─ ingest_data/<source_key>/      ──▶ 인제스트한 덱의 슬라이드 PNG, HTML, 매니페스트
│  ├─ index/slides.sqlite3           ──▶ 슬라이드 색인 DB
│  └─ deliverables/                  ──▶ 피커에서 추출한 원본 장표 PPTX
│
├─ .claude-plugin/                   ──▶ Claude Code 플러그인 매니페스트 + 로컬 marketplace
├─ .codex-plugin/                    ──▶ Codex 플러그인 매니페스트
└─ .agents/plugins/marketplace.json  ──▶ Codex 로컬 marketplace
```

---

## 3. 빠른 시작 가이드

### 0) 로컬 플러그인 설치

저장소 루트가 곧 플러그인 소스다. 도구 경로를 함께 유지하기 위해 저장소를 통째로 설치한다.

**Claude Code** — `.claude-plugin/marketplace.json`을 로컬 marketplace로 등록한 뒤 설치한다. 경로는 `.`이 아니라 `./` 형태여야 한다.

```powershell
claude plugin marketplace add ./
claude plugin install proposal-workbench@proposal-workbench-local
```

설치 후 `claude plugin details proposal-workbench`로 Skill 6개가 표시되는지 확인한다. 새 세션부터 로드된다.

> 플러그인 캐시는 저장소의 복사본이며 경로가 버전으로 구분된다. 저장소를 고쳐도 `plugin.json`의 버전이 그대로면 `claude plugin install`·`update`·`marketplace update`가 모두 "이미 최신"으로 건너뛴다. 개발 중에 수정본을 반영하려면 버전을 올리거나 다음처럼 재설치한다.

```powershell
claude plugin uninstall proposal-workbench@proposal-workbench-local
claude plugin install proposal-workbench@proposal-workbench-local
```

**Codex** — `.codex-plugin/plugin.json`이 있는 저장소 루트를 로컬 marketplace로 등록한 뒤 ChatGPT 데스크톱 앱을 재시작하고 Plugins Directory에서 설치한다.

```powershell
codex plugin marketplace add .
```

### 0-1) 환경 점검 및 의존성 설치

플러그인 설치 후 먼저 Doctor를 실행한다. 실패한 항목마다 출력된 `Run:` 명령을 PowerShell에 붙여 넣고 다시 실행한다.

```powershell
node tools/verify-workbench.mjs
```

| 항목 | 필요한 경우 | 설치 |
| --- | --- | --- |
| `doc_converter_kordoc` | HWP·PDF·DOCX 원문 변환 | `npm --prefix tools/doc-converter install` |
| `python_pptx` | PPTX 구조 추출·인제스트 | `python -m pip install -r tools/ppt-ingest/requirements.txt` |
| `powerpoint_com` | 슬라이드 PNG 렌더링, 원본 장표 추출 | `pywin32` + 데스크톱 PowerPoint |
| `@oai/artifact-tool` | 최종 PPTX 렌더링 | Codex를 한 번 실행하면 런타임에 번들됨 |

구조·텍스트 추출만 할 때는 `powerpoint_com` 경고를 허용할 수 있다. 최종 PPTX 렌더링은 Codex 번들 런타임의 `@oai/artifact-tool`을 읽기 전용으로 사용하며, 다른 위치에 있으면 `CODEX_ARTIFACT_TOOL_PATH`로 지정한다.

### 1) 코어 슬라이드 렌더러 검증

```powershell
node skills/proposal-ppt-maker/scripts/verify-skill.mjs
```

### 2) 제안서 PPT 인제스트 (선택)

```powershell
python tools/ppt-ingest/ingest_pipeline.py --source "경로/제안서.pptx 또는 템플릿.potx"
```

### 3) HitL 브릿지 & 뷰어

```powershell
node tools/hitl-bridge/hitl_launcher.mjs --open "http://127.0.0.1:5274/picker.html?session=ref_<id>"
```

---

## 4. 제안 업무 수행 흐름 (End-to-End)

인제스트와 검색은 각각 독립 실행하며 장표 기획의 필수 선행 단계가 아니다.

| 단계 | Skill | 입력 | 산출 |
| --- | --- | --- | --- |
| 1. 문서 변환 | `$document-converter` | RFP·회사자료 HWP/PDF/DOCX | `converted_doc.md`, `doc_analysis.json` |
| 2. RFP 분석 | `$rfp-analyzer` | 변환본 + `company_profile/` | `RFP_분석보고서.md` 하나 |
| 3. 인제스트 (선택) | `$proposal-ppt-ingest` | 과거 제안서 PPTX/POTX | `storage/ingest_data/`, `storage/index/` |
| 4. 레퍼런스 탐색 (선택) | `$proposal-reference-search` | 요구사항 또는 자연어 질의 | 세션의 `selected_slide_ids` |
| 5. 장표 기획 (1차 승인) | `$proposal-slide-planner` | 요구사항 ID, 방향 | `slide-blueprint.json` (`structure_approved`) |
| 6. 장표 생성 (2차 승인) | `$proposal-ppt-maker` | 승인된 청사진 | `.pptx`, `wireframe.png`, `final-slide.png`, `verification-report.json` |

### 실행 폴더 예시

RFP 한 건은 `storage/runs/<run-id>/` 아래에 모은다. 요구사항마다 폴더를 나누고, 렌더러 출력도 한 상위 폴더 아래 요구사항별로 둔다. 렌더러가 그 상위 폴더의 다른 검수 보고서를 읽어 인접 장표와의 구조 반복을 검사하기 때문이다.

```text
storage/runs/<run-id>/
├─ converted_doc.md · doc_analysis.json     ──▶ RFP 변환본
├─ company-materials/<doc>/                 ──▶ 회사자료 변환본
├─ RFP_분석보고서.md
├─ slides/<REQ-ID>/
│  ├─ input/requirement.json                ──▶ 요구사항 ID·이름·요약·정량지표
│  ├─ blueprint/slide-blueprint.json        ──▶ 블록 + shape_plan + status
│  └─ preview/wireframe.png                 ──▶ 1차 승인용 개요
└─ deliverables/<REQ-ID>/
   ├─ <REQ-ID>.pptx                         ──▶ 1번 청사진 슬라이드 + 2번 최종 장표
   ├─ wireframe.png · final-slide.png
   └─ verification-report.json
```

렌더 명령은 다음과 같다.

```powershell
node skills/proposal-ppt-maker/scripts/run-proposal.mjs --project "storage/runs/<run-id>/slides/<REQ-ID>" --output "storage/runs/<run-id>/deliverables/<REQ-ID>/<REQ-ID>.pptx" --wireframe-only
node skills/proposal-ppt-maker/scripts/run-proposal.mjs --project "storage/runs/<run-id>/slides/<REQ-ID>" --output "storage/runs/<run-id>/deliverables/<REQ-ID>/<REQ-ID>.pptx"
```

### 승인을 두 번 나누는 이유

| 단계 | 담당 | 확정하는 것 | 청사진 `status` |
| --- | --- | --- | --- |
| 1차 | `$proposal-slide-planner` | 방향, 블록 5~6개 구성, 블록별 헤드라인·요약 | `draft` → `structure_approved` |
| 2차 | `$proposal-ppt-maker` | `shape_plan` 네이티브 도식, 문구 상세화 | `structure_approved` → `approved` |

한 번에 완성본을 들이밀면 구조를 바꾸기 어려워진다. 1차에서 뼈대를 합의한 뒤 2차에서 살을 붙인다. 1차에서 확정된 블록 구성은 사용자가 바꾸라고 하지 않는 한 2차에서 임의로 바꾸지 않는다. 렌더러는 `approved`만 통과시키므로 `draft`와 `structure_approved` 단계에서는 와이어프레임만 만들어지고 PPTX는 만들어지지 않는다.

### PPTX 구성과 장표 경계

- **PPTX는 두 장이다.** 1번은 `청사진 | <제목>` 와이어프레임, 2번이 최종 장표다. 1번은 PPTX만 여는 검토자가 같은 파일에서 구조 의도를 볼 수 있도록 의도적으로 넣는다. 제안서 원고에 합칠 때는 요구사항별 2번 슬라이드만 순서대로 모은다.
- **한 PPTX에는 청사진 하나만 담는다.** 여러 요구사항을 한 파일이나 한 슬라이드에 합치지 않고, 한 요구사항을 여러 파일로 나누지도 않는다. 합본 과정에서 다른 요구사항의 문구나 도형을 옮겨 붙이지 않는다.

### 네이티브 도식을 만드는 원칙

신규 장표는 **AI가 `shape_plan`에 직접 저작한 네이티브 PowerPoint 도형으로 완성**한다. `layout_family: "agent_authored"`에서 도형 종류·크기·좌표·연결과 구성 서명을 장표마다 결정하며, 고정 레시피나 `visual_category`를 선택하지 않는다. 기존 레시피 경로는 과거 청사진 하위 호환용으로만 보관하며, 렌더러가 `--legacy-layout` 없이는 열지 않는다.

작업 순서도 고정이다. **블록별 내용을 문장 수준으로 확정한 다음에** 의미 관계와 시선 흐름에 맞춰 전체 구성을 설계한다. 렌더러는 블록의 `headline`·`summary`와 보호 정량지표가 가시 텍스트에 그대로 들어 있는지 검사하고, 출력 상위 폴더의 다른 검수 보고서와 `structure_fingerprint`·`composition_signature`를 비교해 반복 구성을 렌더 실패로 막는다. 같은 구조가 의미상 필수일 때만 `--allow-repeat-structure`로 통과시킨다.

세로형(720×1280)은 `density: high`, `니다.`로 끝나는 거버닝 메시지, 본문 안전 영역(`left ≥ 24`, `top ≥ 166`, `right ≤ 696`, `bottom ≤ 1230`)을 지킨다. 상세 계약은 `skills/proposal-ppt-maker/references/`를 따른다.

### 참고 라이브러리는 슬라이드 색인이다

과거 장표를 참고하는 경로는 **`ppt-ingest` → 슬라이드 PNG + SQLite 색인 → `$proposal-reference-search` → `picker.html`** 하나다. 색인은 슬라이드마다 `image_ref`, `title`, `tags`, `layout`, `slide_type`을 들고 있어 사람이 그림을 보고 고를 수 있다. 고른 슬라이드는 **구조 레퍼런스**이며, 장표는 그 구조를 참고해 네이티브 도형으로 다시 만든다. 사용자가 레퍼런스를 전달했으면 `reference_context.notes`에 어떤 구조를 참고했는지 남기고, 렌더러는 세션·색인·원본 파일을 열지 않는다.

**이 경로는 장표 기획의 필수 선행 단계가 아니다.** 인제스트·검색·기획은 각각 독립 실행한다. 기획은 RFP만으로도 가능하며, 사용자가 완료된 검색 세션이나 `selected_slide_ids`를 명시적으로 전달했을 때만 레퍼런스를 참고한다. 검색 중 주변 폴더에서 발견한 PPTX를 자동 인제스트하지 않으며, 파일명과 개수를 보여주고 확인받은 뒤에만 인제스트한다.

---

## 5. 테스트와 검증

```powershell
node --test "tools/slide-renderer/tests/*.test.mjs"     # 렌더러·청사진 계약·스킬 문서 검사
node --test "tools/hitl-bridge/*.test.mjs"              # 브릿지 API·피커 검사
node --test "tools/reference-search/*.test.mjs"         # 검색 엔진 검사
node --test "tools/doc-converter/*.test.mjs"            # 문서 변환 CLI 검사
python -m pytest tools/ppt-ingest -q                    # 패키지 리더·원본 추출 검사 (python-pptx 필요)
node tools/verify-workbench.mjs                         # 환경·의존성·Skill 6개 점검
```

렌더러 검수 보고서의 합격값은 사진·로고 예외가 없을 때 `picture_shape_count: 0`이며, PowerPoint에서 직접 열어 확인하기 전까지 상태는 `generated_pending_powerpoint_review`다.
