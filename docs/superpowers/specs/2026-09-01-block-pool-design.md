# 제안 장표 블록 풀 확장 설계

상태: 사용자 설계 승인 후 구현 전 검토본

## 1. 목표

현재 제안 장표는 `three_column_with_bottom_band`와 다섯 개 고정 역할에 의존한다. 제출본처럼 요구사항에 따라 표·지표·매핑·에이전트 흐름·단계·일정이 달라지는 장표를 만들 수 있도록, 요구사항에 맞는 블록을 선택하는 제한된 풀과 네이티브 렌더러를 추가한다.

핵심 목표는 다음과 같다.

- 기존 `visual_category`를 블록 타입으로 활용해 기존 청사진과 호환한다.
- 최소 5개 내용 상자와 `density: high` 규칙은 유지한다.
- 초기 풀은 `matrix_table`, `metric_dashboard`, `scope_outcome_mapping`, `blueprint_flow`, `chevron_pipeline`, `gantt_roadmap` 6개로 제한한다.
- 플래너가 요구사항 성격에 맞춰 5~6개 블록을 선택하고, 렌더러가 세로·가로 방향에 맞춰 안전하게 배치한다.
- 모든 핵심 문구·수치·근거는 편집 가능한 PowerPoint 네이티브 도형과 텍스트로 유지한다.

## 2. 비목표

- 임의 좌표를 허용하는 완전 자유 배치 엔진
- 모든 블록 조합을 무제한으로 허용하는 범용 제약조건 솔버
- 생성 이미지에 사실·수치·근거를 맡기는 방식
- 이번 단계의 `evidence_cluster`, `risk_control_matrix` 전용 렌더러 구현
- 외부 레퍼런스 검색·인제스트·새 npm 의존성 추가

## 3. 제안 구조

### 3.1 블록 풀

블록의 의미 역할은 기존 `role`에 남기고, 시각 구조 선택은 `visual_category`가 담당한다. `visual_category`가 초기 풀의 타입이면 블록 타입 레지스트리에서 기본 렌더러와 배치 메타데이터를 결정한다. 기존 값이나 기존 역할만 있는 청사진은 현재 동작을 유지한다.

| `visual_category` | 적합한 내용 | 기본 렌더러 | 기본 폭 |
|---|---|---|---|
| `matrix_table` | 요구사항 대응, 검증 기준, 연계·보안·역할 표 | `matrix_table` | full |
| `metric_dashboard` | KPI 카드, 증감값, 목표·실적, 미니 막대 | `metric_dashboard` | half 또는 full |
| `scope_outcome_mapping` | 구축 범위와 적용 효과, 입력과 결과 매핑 | `scope_outcome_mapping` | half 또는 full |
| `blueprint_flow` | 입력, 처리 단계, 도구·모델, 출력·Fallback | `blueprint_flow` | full |
| `chevron_pipeline` | 단계, 게이트, 검증 기준, 인수 흐름 | `chevron_pipeline` | full 또는 half |
| `gantt_roadmap` | 월별 작업 바, 담당 행, 마일스톤 | `gantt_roadmap` | full |

카탈로그에 이미 있는 `metric_bars`, `before_after_metric_table`, `chevron_process`, `system_flow`, `gantt` 등의 자산은 위 타입으로 매핑할 수 있으면 재사용한다. 자산이 없거나 타입과 맞지 않으면 `fallback_native_shapes`로 기록하고 같은 네이티브 렌더러를 사용한다.

### 3.2 자동 배치

새 `block_pool_auto` 레이아웃을 추가한다. 기존 고정 레이아웃은 그대로 둔다.

- 블록 순서는 청사진 순서를 기본으로 한다.
- `full` 블록은 단독 행을 사용한다.
- 연속된 `half` 블록은 한 행에 최대 2개 배치한다.
- 남은 반쪽 칸은 같은 행의 블록이 확장하지 않고, 다음 행의 블록이 사용한다.
- 세로형에서는 위에서 아래로, 가로형에서는 좌에서 우로 읽히도록 한다.
- 각 블록은 최소 높이와 권장 높이를 가지며, 내용이 권장 높이를 넘으면 자동 축소하지 않는다.
- 배치가 불가능하면 렌더러가 겹침을 만들지 않고 구조화된 오류를 반환한다. 플래너는 같은 요구사항의 시리즈 장표 또는 `text_explainer` 전환을 선택한다.

`slot: "auto"`를 새 풀의 기본값으로 사용한다. 기존 `left`, `right`, `bottom_center` 등 명시 슬롯은 기존 레이아웃에서 계속 유효하다.

### 3.3 렌더러

`tools/slide-renderer/src/block-types.mjs`에 블록 타입 레지스트리를 두고, `asset-recipes.mjs`에 타입별 네이티브 도식 recipe를 연결한다. 새 renderer key와 핵심 모티프는 다음과 같다.

| 렌더러 | 네이티브 구조 |
|---|---|
| `matrix_table` | 헤더 행, 본문 행, 선택적 그룹 라벨·결론 행 |
| `metric_dashboard` | 지표 타일, 큰 값, 증감·목표 배지, 수평 막대 |
| `scope_outcome_mapping` | 좌측 범위, 우측 효과, 행별 연결선 |
| `blueprint_flow` | 입력 레인, 번호 단계, 도구·모델 밴드, 결과·Fallback |
| `chevron_pipeline` | 방향성 셰브론, 단계 설명, 검증 게이트 |
| `gantt_roadmap` | 기간 헤더, 작업 행, 기간 바, 마일스톤 다이아몬드 |

렌더러는 이미지·SVG를 삽입하지 않는다. 필요한 경우 카탈로그 자산은 구조를 결정하는 레퍼런스로만 사용하고, 최종 결과는 개별 도형과 텍스트로 생성한다.

## 4. 입력 계약

기존 `blocks[]` 필드는 유지하고, 타입별 콘텐츠를 다음처럼 정규화한다.

- `matrix_table`: `content.columns[]`, `content.rows[]`, 선택적 `content.row_groups[]`, `content.conclusion`
- `metric_dashboard`: `content.metrics[]`의 `label`, `value_text`, 선택적 `delta_text`, `target_text`, `source_refs[]`
- `scope_outcome_mapping`: `content.left[]`, `content.right[]`, 선택적 `content.links[]`
- `blueprint_flow`: `content.inputs[]`, `content.steps[]`, `content.tools[]`, `content.outputs[]`, 선택적 `content.fallbacks[]`, `content.explanation`
- `chevron_pipeline`: `content.steps[]`, 선택적 `content.criteria[]`와 `content.gates[]`
- `gantt_roadmap`: `content.time_units[]`, `content.rows[]`의 `label`, `start`, `end`, 선택적 `milestones[]`

기존 `bullets`, `steps`, `options`, `diagram_labels`는 타입별 콘텐츠가 없을 때 하위 호환 fallback으로 사용한다. 원문 정량값은 기존 `protected_metrics`와 `source_refs[]`에 계속 보존한다.

## 5. 선택·검증 규칙

플래너는 요구사항의 내용 신호를 보고 타입을 선택한다.

- 행·열·검증·기준·역할이 중심이면 `matrix_table`
- 숫자·목표·증감·성능이 중심이면 `metric_dashboard`
- 범위와 효과 또는 출발점과 도착점이 대응하면 `scope_outcome_mapping`
- 입력부터 모델·도구·결과까지의 실행 순서가 중심이면 `blueprint_flow`
- 단계별 게이트·검증·인수 조건이 있으면 `chevron_pipeline`
- 월·기간·작업·마일스톤이 있으면 `gantt_roadmap`

렌더러는 다음을 검증한다.

- 타입이 레지스트리에 존재하는가
- 타입별 필수 콘텐츠가 존재하는가
- 방향과 배치 폭이 캔버스에 맞는가
- 행·열·단계 수가 지원 범위에 들어오는가
- 블록 간 프레임이 겹치지 않는가
- 비교·매핑·지표 블록에 적용 결론 또는 근거가 있는가
- 세로형 거버닝 메시지, `density: high`, 최소 5개 내용 상자 규칙을 만족하는가

복잡한 아키텍처는 이 변경에서도 `text_explainer`를 우선한다. `generated_visual_with_text`는 사용자 허용이 있을 때만 보조 시각으로 사용하고, 설명·수치·근거는 네이티브 텍스트로 둔다.

## 6. 호환성과 변경 범위

- 기존 `three_column_with_bottom_band`와 기존 5개 역할 렌더링은 변경하지 않는다.
- `block_pool_auto`를 명시한 청사진만 새 자동 배치를 사용한다.
- 기존 자산 매핑의 `selected_candidate`, `fallback_native_shapes`, 검증 상태 필드는 유지한다.
- 초기 구현은 새 registry, renderer recipe, auto-layout, 계약 검증, 문서·테스트만 수정한다.
- 카탈로그의 기존 모듈을 새 타입으로 연결하되, 카탈로그 JSON 전체를 재작성하지 않는다.

## 7. 검증 계획

1. 블록 타입 레지스트리가 6개 초기 타입과 메타데이터를 반환하는지 검사한다.
2. 각 renderer key가 portrait·landscape에서 필수 모티프를 생성하는지 검사한다.
3. 타입별 누락 콘텐츠·잘못된 행 수·잘못된 기간을 거부하는지 검사한다.
4. 5~6개 블록 조합의 자동 배치 프레임이 캔버스 밖으로 나가거나 겹치지 않는지 검사한다.
5. 기존 fixture와 기존 고정 레이아웃 회귀 테스트를 통과시킨다.
6. 실제 샘플 청사진을 렌더링하고 와이어프레임·완성 장표에서 표, 지표, 흐름, 셰브론, Gantt의 텍스트가 읽히는지 확인한다.
7. `node --test`와 `skills/proposal-ppt-maker/scripts/verify-skill.mjs`를 실행한다.

## 8. 이후 확장

초기 6개가 안정화된 뒤, 제출본에서 확인한 `evidence_cluster`와 `risk_control_matrix`를 각각 증빙형과 위험·통제형 변형으로 추가한다. 이들은 기존 `matrix_table`과 `metric_dashboard`의 공통 primitive를 재사용한다.
