---
name: proposal-ppt-maker
description: RFP와 승인된 슬라이드 청사진을 편집 가능한 네이티브 PowerPoint/PPTX 장표로 생성하는 Skill.
---

# Proposal PPT Maker

승인된 RFP 범위와 `slide-blueprint.json`을 편집 가능한 PowerPoint 네이티브 도형 장표로 변환한다. AI가 장표마다 도형·관계·좌표를 직접 저작하며 에셋 카탈로그, 고정 도식 레시피, 검색 색인, SQLite, 임베딩 또는 `asset-mapping.json`을 요구하지 않는다.

승인은 두 번 나눠 받는다. 1차는 `$proposal-slide-planner`가 블록 구성과 간단 내용을 확정한다. 이 Skill은 `status: "structure_approved"` 이후 상세 문구와 네이티브 도식을 완성해 2차 승인을 받고, 청사진을 `status: "approved"`로 바꾼 뒤 최종 렌더링한다.

PPTX 제작과 시각 QA에는 `presentations:Presentations`를 사용한다.

## 필수 참조

- 입력·출력 JSON을 만들기 전에 [references/io-contract.md](references/io-contract.md)를 전체 읽는다.
- 자유 배치 도형 계획을 만들기 전에 [references/agent-authored-layout.md](references/agent-authored-layout.md)를 전체 읽는다.
- 세로형 장표는 [references/portrait-proposal.md](references/portrait-proposal.md)를 전체 읽는다.
- 사용자가 서브에이전트를 명시적으로 요청한 경우만 [references/agent-execution-contract.md](references/agent-execution-contract.md)를 읽고 계약을 검증한다.

## 비협상 원칙

1. 장표 범위와 요구사항 ID를 먼저 확정한다. 범위 밖 회사소개나 다른 요구사항 내용을 임의로 추가하지 않는다.
2. 방향을 확인한다. 별도 팔레트가 없으면 `#1769E0`, `#123B78`, `#4A8CF0`, `#EEF5FF`를 적용한다. 사용자가 명시한 팔레트나 템플릿만 기본값을 덮어쓴다.
3. `source_refs`, 원문 인용, 제작 메모와 보호 지표는 JSON·검수 메타에 보존하고 최종 가시 문구에는 구현·운영·활용 언어만 쓴다.
4. 기간 근거가 없으면 로드맵을 만들지 않는다. 비교 블록은 `content.conclusion`에 적용 방향을 쓴다.
5. `portrait`에는 `니다.`로 끝나는 `governing_message`가 필수다.
6. `density: high`와 5~8개의 독립 내용 블록을 유지한다. 같은 카드 모양을 반복하지 않는다.
7. 신규 장표는 `layout_family: "agent_authored"`와 `shape_plan`을 사용한다. AI가 전체 메시지와 블록 관계를 보고 네이티브 도형, 크기, 좌표, 연결을 직접 결정한다.
8. `composition_signature`와 `design_rationale`로 구조 선택을 설명한다. 인접 장표와 같은 구조 서명이 반복되면 의미상 필수인 경우가 아니면 다시 구성한다. 고정 `visual_category`→`renderer_key` 경로는 기존 청사진 호환용이다.
9. 세 개 이상의 병렬 항목은 단순 불릿 대신 도식 노드, 레인, 매핑 또는 표로 표현한다.
10. 최종 도식은 원·사각형·선·텍스트 등 편집 가능한 네이티브 PowerPoint 도형이어야 한다. 사용자가 요청한 사진·로고와 허용한 생성 이미지만 예외다.
11. 복잡한 구조도 먼저 `native_diagram`과 편집 가능한 `content.explanation`으로 구성한다. 읽기 어려운 경우만 `text_explainer`, 사용자 허용 시만 `generated_visual_with_text`를 쓴다.
12. 다른 요구사항의 몫을 가져오지 않는다. 연결이 필요하면 ID 한 줄 참조만 둔다.
13. 레퍼런스가 없어도 동일한 생성 경로로 완성한다. 사용자가 전달한 레퍼런스는 구조적 힌트일 뿐 렌더링 입력 파일이나 런타임 의존성이 아니다.

## 선택적 구조 레퍼런스

사용자가 첨부 이미지나 `selected_slide_ids`를 직접 제공한 경우만 구조와 배치를 참고한다. 문구·색상·업무 내용을 복사하지 않는다. 정보는 `blueprint.reference_context`에 메타데이터로 남길 수 있지만 렌더러는 세션, 색인, 원본 PPTX 또는 슬라이드 이미지를 열지 않는다.

`proposal-ppt-ingest`와 `proposal-reference-search`는 독립 도구다. 이 Skill은 두 Skill을 자동 호출하지 않으며, 결과가 없거나 손상돼도 네이티브 도형 생성은 계속한다.

## 실행

프로젝트 필수 입력은 두 파일뿐이다.

```text
<requirement-project>/
├─ input/requirement.json
└─ blueprint/slide-blueprint.json
```

1. `structure_approved` 청사진의 상세 콘텐츠를 채운다.
2. 장표별 `shape_plan`을 직접 저작하고 와이어프레임을 렌더링해 채팅에 표시한다.
3. 2차 명시 승인을 받은 뒤 `status: "approved"`로 바꾼다.
4. 최종 PPTX와 PNG를 생성하고 시각 QA를 수행한다.

```powershell
node "<skill-root>/scripts/run-proposal.mjs" --project "<requirement-project>" --output "<output-dir>"
```

결과는 `.pptx`, `wireframe.png`, `final-slide.png`, `verification-report.json`이다. 보고서는 `native_shape_plan`, `composition_signature`, `reference_context`, 콘텐츠 상자 수, 방향, 렌더 상태와 산출물 경로를 기록한다.

## 설치 검증

플러그인에는 `tools/slide-renderer`가 포함돼야 한다. `@oai/artifact-tool`은 Codex 번들 런타임에서 읽기 전용으로 탐색한다. 패턴 카탈로그는 검증 대상이 아니다.

개별 Skill로 설치한 경우 워크벤치 루트에서 실행하거나 `PROPOSAL_WORKBENCH_ROOT`에 저장소 경로를 지정한다.

```powershell
node "<skill-root>/scripts/verify-skill.mjs"
```

## 완료 조건

- 승인 전 최종 렌더링 금지
- 최종 장표 `density: high`, 내용 상자 5개 이상
- `agent_authored`의 모든 블록이 도형과 편집 가능한 텍스트로 표현됨
- 도형이 안전 영역 안에 있고 연결선 참조가 유효함
- 보호 정량지표 보존
- 사진·로고 예외가 없으면 `embedded_media_count: 0`, `picture_shape_count: 0`
- PowerPoint 검증을 할 수 없으면 `generated_pending_powerpoint_review`로 보고

실행당 검토 라운드는 최대 1회다. 8쪽 이하에서는 현재 에이전트가 직접 실행하고, 서브에이전트는 사용자가 명시적으로 요청한 경우에만 사용한다.
