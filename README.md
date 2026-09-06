# Proposal Workbench

RFP 문서를 넣으면 요구사항을 분석하고, 요구사항마다 제안서 장표를 기획해서, 편집 가능한 PowerPoint 파일로 만들어 주는 도구 모음입니다. Claude Code나 Codex 같은 AI Agent가 Skill을 호출해 단계별로 작업하고, 사람은 중간에 결과를 보고 승인만 합니다.

## 무엇을 해주나

1. **RFP 읽기** — HWP, PDF, DOCX 원문을 Markdown으로 변환하고 요구사항, 정량 조건, 우리 회사가 대응하기 어려운 영역을 정리한 분석 보고서를 만듭니다.
2. **장표 기획** — 요구사항 하나에 장표 한 장씩, 어떤 내용을 어떤 블록으로 담을지 청사진을 만듭니다. 사람이 확인하고 승인합니다.
3. **장표 생성** — 승인된 청사진대로 도형, 텍스트, 연결선을 배치한 PPTX를 만듭니다. 결과물은 그림이 아니라 PowerPoint에서 바로 고칠 수 있는 도형입니다.
4. **과거 제안서 참고 (선택)** — 예전 제안서 PPTX를 등록해 두면 검색해서 마음에 드는 장표 구성을 골라 참고할 수 있습니다.

## 어떻게 돌아가나

```text
         RFP (HWP/PDF/DOCX)                     과거 제안서 PPTX (선택)
                │                                        │
                ▼                                        ▼
     $document-converter  ──▶ Markdown         $proposal-ppt-ingest ──▶ 슬라이드 이미지 + 검색 색인
                │                                        │
                ▼                                        ▼
     $rfp-analyzer  ──▶ RFP_분석보고서.md       $proposal-reference-search ──▶ 참고 장표 선택 (브라우저 피커)
                │                                        │
                ▼                                        │
     $proposal-slide-planner  ──▶ 요구사항별 청사진  ◀───┘  (참고 장표는 있어도 되고 없어도 됨)
                │
                │  사람 승인 ①  블록 구성 확인
                ▼
     $proposal-ppt-maker  ──▶ 와이어프레임
                │
                │  사람 승인 ②  배치 확인
                ▼
           PPTX + 미리보기 PNG + 검수 보고서
```

Skill은 여섯 개이고 서로를 자동으로 부르지 않습니다. 각 단계의 결과 파일을 다음 단계가 읽는 방식입니다. 사람이 눈으로 봐야 하는 순간(참고 장표 고르기, 인제스트 결과 확인)에는 로컬 브라우저 뷰어가 열립니다.

| Skill | 하는 일 |
| --- | --- |
| `document-converter` | HWP, HWPX, PDF, DOCX를 Markdown으로 변환 |
| `rfp-analyzer` | 업무 흐름, 기능 도메인, 정량 지표, 역량 Gap을 분석해 보고서 작성 |
| `proposal-ppt-ingest` | 과거 제안서 PPTX/POTX를 슬라이드 이미지와 검색 색인으로 등록 (선택) |
| `proposal-reference-search` | 등록된 슬라이드를 검색하고 브라우저에서 참고 장표 선택 (선택) |
| `proposal-slide-planner` | 요구사항별 청사진 작성, 1차 승인 |
| `proposal-ppt-maker` | 청사진을 도형 배치로 구체화해 PPTX 렌더링, 2차 승인 |

## 폴더 구성

```text
proposal-workbench/
├─ skills/                        Agent가 호출하는 Skill 6개 (각 폴더의 SKILL.md가 설명서)
│  └─ proposal-ppt-maker/
│     ├─ references/              청사진·도형 배치 규약 문서
│     └─ scripts/run-proposal.mjs PPTX 렌더 명령
│
├─ tools/                         Skill이 실행하는 프로그램
│  ├─ slide-renderer/             청사진 → PPTX 렌더러
│  ├─ ppt-ingest/                 PPTX 분해, 슬라이드 PNG 렌더링, 검색 색인 생성 (Python)
│  ├─ reference-search/           슬라이드 검색 엔진
│  ├─ hitl-bridge/                브라우저 뷰어 서버 (포트 5274) + picker/planner/ingest 화면
│  ├─ doc-converter/              문서 변환기 (kordoc)
│  └─ verify-workbench.mjs        환경 점검 스크립트
│
├─ company_profile/               우리 회사 소개·강점·약점 (초기 템플릿, 실제 자료로 교체해서 사용)
├─ references/data-contract-v2.md 청사진 JSON 스키마
│
└─ storage/                       작업 데이터 (Git에 올라가지 않음)
   ├─ runs/<run-id>/              RFP 한 건의 작업 폴더
   ├─ ingest_data/                등록한 과거 제안서의 슬라이드 이미지
   ├─ index/slides.sqlite3        슬라이드 검색 색인
   ├─ sessions/                   브라우저 뷰어 세션
   └─ deliverables/               피커에서 추출한 원본 장표
```

## 설치

### 1. 플러그인 등록

저장소 루트가 플러그인입니다. 저장소를 통째로 받은 뒤 등록합니다.

Claude Code:

```powershell
claude plugin marketplace add ./
claude plugin install proposal-workbench@proposal-workbench-local
```

Codex: 저장소 루트를 로컬 marketplace로 등록한 뒤 ChatGPT 데스크톱 앱을 재시작하고 Plugins Directory에서 설치합니다.

```powershell
codex plugin marketplace add .
```

> 저장소를 고친 뒤 반영이 안 되면 `plugin.json`의 버전을 올리거나 `claude plugin uninstall` 후 다시 `install` 합니다. 플러그인 캐시는 버전 단위로 구분되기 때문입니다.

### 2. 환경 점검

```powershell
node tools/verify-workbench.mjs
```

실패한 항목마다 설치 명령이 함께 출력됩니다. 어떤 기능을 쓸지에 따라 필요한 것이 다릅니다.

| 필요한 것 | 언제 필요한가 | 설치 |
| --- | --- | --- |
| Node.js 22 이상 | 항상 | — |
| kordoc | HWP·PDF·DOCX 변환 | `npm --prefix tools/doc-converter install` |
| Python + python-pptx | 과거 제안서 등록 | `python -m pip install -r tools/ppt-ingest/requirements.txt` |
| pywin32 + 데스크톱 PowerPoint | 슬라이드 PNG 렌더링, 원본 장표 추출 | Windows 전용 |
| Codex 데스크톱 앱 | 최종 PPTX 렌더링 | 한 번 실행하면 필요한 런타임이 설치됨 |

PPTX 렌더링은 Codex가 설치하는 `@oai/artifact-tool` 런타임을 사용합니다. 다른 경로에 있으면 환경변수 `CODEX_ARTIFACT_TOOL_PATH`로 지정합니다.

## 사용 방법

Agent 채팅에서 Skill 이름을 부르면 됩니다. 아래는 명령을 직접 실행할 때의 순서입니다.

### 1. RFP 분석

`$document-converter`로 RFP와 회사 자료를 변환하고 `$rfp-analyzer`로 분석합니다. 결과는 `storage/runs/<run-id>/RFP_분석보고서.md` 한 파일입니다.

### 2. 과거 제안서 등록과 검색 (선택)

인제스트와 검색은 각각 독립 실행하는 선택 단계입니다. 안 해도 장표는 만들어집니다.

```powershell
python tools/ppt-ingest/ingest_pipeline.py --source "경로/제안서.pptx"
node tools/reference-search/search_cli.mjs --query "검색어" --size 7
node tools/hitl-bridge/hitl_launcher.mjs --open "http://127.0.0.1:5274/picker.html?session=ref_<id>"
```

피커에서 고른 장표는 "이런 식으로 배치하면 좋겠다"는 참고용입니다. 도형이나 문구를 복사하지 않고 새로 그립니다.

### 3. 장표 기획 (1차 승인)

`$proposal-slide-planner`가 장표 방향(가로/세로)을 묻고, 요구사항마다 블록 5~6개짜리 청사진을 만듭니다. 사람이 블록 구성을 확인하면 청사진 상태가 `structure_approved`가 됩니다.

### 4. 장표 생성 (2차 승인)

`$proposal-ppt-maker`가 청사진에 도형 배치를 채우고 와이어프레임을 보여 줍니다. 확인하면 상태가 `approved`가 되고 최종 PPTX가 렌더링됩니다.

```powershell
# 와이어프레임만
node skills/proposal-ppt-maker/scripts/run-proposal.mjs --project "storage/runs/<run-id>/slides/<REQ-ID>" --output "storage/runs/<run-id>/deliverables/<REQ-ID>/<REQ-ID>.pptx" --wireframe-only

# 최종 렌더링 (청사진 status가 approved여야 함)
node skills/proposal-ppt-maker/scripts/run-proposal.mjs --project "storage/runs/<run-id>/slides/<REQ-ID>" --output "storage/runs/<run-id>/deliverables/<REQ-ID>/<REQ-ID>.pptx"
```

작업 폴더는 이렇게 생깁니다.

```text
storage/runs/<run-id>/
├─ RFP_분석보고서.md
├─ slides/<REQ-ID>/
│  ├─ input/requirement.json          요구사항 ID, 이름, 요약
│  ├─ blueprint/slide-blueprint.json  청사진 (블록, 도형 배치, 승인 상태)
│  └─ preview/wireframe.png
└─ deliverables/<REQ-ID>/
   ├─ <REQ-ID>.pptx
   ├─ wireframe.png · final-slide.png
   └─ verification-report.json
```

## 알아 둘 규칙

- **승인은 두 번입니다.** 1차에서 블록 구성을, 2차에서 도형 배치를 확인합니다. 승인 전에는 PPTX가 만들어지지 않습니다.
- **PPTX는 두 장입니다.** 1번은 "청사진 | 제목"이 붙은 와이어프레임, 2번이 최종 장표입니다. 1번은 파일만 받아 보는 검토자를 위한 것이고, 제안서에 합칠 때는 2번만 가져갑니다.
- **PPTX 하나에 요구사항 하나입니다.** 여러 요구사항을 한 파일이나 한 장에 합치지 않습니다. 제안서 합본은 요구사항별 2번 슬라이드를 순서대로 모아 만듭니다.
- **장표마다 구성이 달라야 합니다.** 렌더러가 같은 폴더의 다른 장표와 도형 배치를 비교해서 똑같으면 렌더링을 거부합니다.
- **모든 도형은 편집 가능합니다.** 결과물에 이미지나 캡처를 넣지 않습니다. 사용자가 사진이나 로고를 요청한 경우만 예외입니다.

세부 규칙(안전 영역, 글자 크기, 청사진 필드)은 `skills/proposal-ppt-maker/references/`와 `references/data-contract-v2.md`에 있습니다.

## 테스트

```powershell
node --test "tools/slide-renderer/tests/*.test.mjs"
node --test "tools/hitl-bridge/*.test.mjs"
node --test "tools/reference-search/*.test.mjs"
node --test "tools/doc-converter/*.test.mjs"
python -m pytest tools/ppt-ingest -q
node tools/verify-workbench.mjs
```
