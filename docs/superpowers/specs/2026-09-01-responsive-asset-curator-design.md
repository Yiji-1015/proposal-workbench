# 반응형 블록 자산 큐레이터 설계

상태: 사용자 방향 승인 후 구현 전 검토본

## 1. 목표

기존 PPTX의 블록 경계·외형·내부 영역과 자주 재사용할 도식을 함께 찾아 슬라이드 크기나 방향에 종속되지 않는 반응형 블록 자산으로 승격한다. 같은 큐레이터 코어를 다음 두 진입점에서 사용한다.

- PPT ingest 화면에서 사용자가 특정 도식 후보를 `자주 쓰는 에셋`으로 선택한다.
- 사용자가 대화에서 `이거 자주 쓰는 에셋으로 저장해줘`처럼 요청하면 현재 선택된 ingest 장표와 도식 후보를 해석해 같은 승격 절차를 실행한다.

승인된 자산은 슬라이드 절대좌표나 PNG가 아니다. 블록 외형과 콘텐츠 영역을 만드는 `shell`과, 블록 프레임을 입력받아 내부 노드·연결선·텍스트를 다시 계산하는 `diagram recipe`를 독립 또는 결합 형태로 보존한다.

## 2. 비목표

- PNG·JPG·SVG 또는 슬라이드 캡처를 자산으로 저장하는 방식
- 원본 PPTX 한 장을 그대로 자산 카탈로그에 복사하는 방식
- 사진, 차트, SmartArt, OLE 개체를 자동으로 네이티브 도식으로 변환하는 기능
- 사용자의 승인 없이 후보를 자동으로 영구 카탈로그에 등록하는 기능
- 임의 영역 자유 드래그와 모든 PowerPoint 도형 종류를 지원하는 범용 편집기
- 여러 블록의 슬라이드 전체 배치까지 재사용하는 완성 장표 레이아웃 카탈로그
- 자산 등록 과정에서 자동 Git commit 또는 push를 수행하는 기능

## 3. 핵심 구조

```text
원본 PPTX
  └─ proposal-ppt-ingest
       ├─ 기존 PNG·HTML·검색 색인
       └─ 네이티브 도형 구조 메타데이터
              ↓
      슬라이드 블록 맵 탐지
       ├─ 블록 shell·헤더·본문·강조영역
       └─ 블록 내부 도형 그룹·연결 컴포넌트
              ↓
 storage/asset_candidates/<candidate_id>/candidate.json
              ↓ 사용자 승인·익명화·슬롯화
 tools/pattern-library/templates/<module_id>.json
 tools/pattern-library/unified-visual-module-catalog.json
              ↓
 responsive_native_template renderer
              ↓ block frame 기반 재배치
 편집 가능한 PowerPoint 네이티브 도형
```

공용 코어는 `tools/asset-curator`에 둔다. ingest UI와 자연어 Skill은 후보의 출처를 해석하고 코어를 호출할 뿐, 별도의 추출·승격 로직을 구현하지 않는다.

## 4. 후보 탐색과 선택

### 4.1 지원 원본

초기 구현은 원본 PPTX 경로가 남아 있는 ingest 장표만 지원한다. `manifest.json`의 `source_path`, `source_key`, `slide_no`로 원본 장표를 다시 연다. 이미지나 PDF만 있는 경우에는 편집 가능한 네이티브 구조를 보장할 수 없으므로 승격하지 않고 원본 PPTX를 요청한다.

### 4.2 블록 맵과 후보 단위

큐레이터는 먼저 기존 장표를 블록 맵으로 나눈다. 블록은 다음 신호를 순서대로 조합해 탐지한다.

1. PowerPoint에 이미 정의된 그룹 도형과 큰 배경·테두리 컨테이너
2. 같은 정렬선, 간격, 채우기, 테두리를 공유하는 제목·본문·배지 도형
3. 연결선으로 이어진 네이티브 도형의 연결 컴포넌트
4. 그룹이 없을 때 서로 가깝고 겹치는 본문 도형의 공간 클러스터

각 블록 후보는 `bounds`, `shell`, `header_zone`, `body_zone`, 선택적 `footer_zone`, `accent_shapes`, `inner_candidates`, `reading_order`를 가진다. `shell`은 배경·모서리·테두리·강조띠·내부 여백을, `inner_candidates`는 블록 안의 프로세스·허브·매핑 등 도식 구조를 나타낸다.

상단 장표 제목과 하단 페이지 번호·회사명·각주는 블록 맵에서 제외한다. 블록 후보는 지원 도형 3~40개, 슬라이드 면적 8~85%, 텍스트 슬롯 1~16개 범위를 만족해야 한다. ingest 화면은 기존 슬라이드 PNG 위에 블록 경계와 내부 도식 후보만 표시하며 별도 asset preview 파일을 저장하지 않는다.

### 4.3 지원 primitive

초기 primitive는 `rect`, `roundRect`, `ellipse`, `diamond`, `text`, `line`, `connector`, `group`으로 제한한다. 후보 내부에 사진, 차트, SmartArt, OLE, 비디오 또는 지원하지 않는 미디어 관계가 있으면 해당 후보를 거절한다.

## 5. 두 진입점

### 5.1 ingest 화면

`tools/hitl-bridge/public/ingest.html`의 각 슬라이드 카드에 `자주 쓰는 에셋` 동작을 추가한다.

1. 사용자가 슬라이드에서 동작을 선택한다.
2. 서버가 해당 장표의 블록 맵과 블록 내부 도식 후보를 탐색한다.
3. 화면은 기존 PNG 위에 블록 번호, 블록 경계, 내부 도식 후보를 표시한다.
4. 사용자가 후보 하나, 자산 이름, 저장 범위(`block_shell`, `diagram_recipe`, `composite_block`)를 선택한다.
5. 서버가 구조에서 도식 유형·용도 설명·디자인 특징·검색 태그 초안을 만들고 로컬 후보의 익명화 결과와 함께 보여준다.
6. 사용자가 최종 승인하면 영구 카탈로그로 승격한다.

새 API는 다음 두 개로 제한한다.

- `POST /api/assets/discover`: `source_key`, `slide_no`를 받아 후보 목록을 반환한다.
- `POST /api/assets/promote`: `candidate_id`, `module_id`, `display_name`, `module_type`, `asset_kind`, `description`, `design_traits`, `use_cases`, `search_tags`, `usage_mode`를 받아 검증 후 카탈로그로 승격한다.

### 5.2 자연어 요청

새 `proposal-asset-curator` Skill은 `이거 자주 쓰는 에셋으로 저장`, `이 도식 재사용 자산으로 등록`, `선택 장표의 도형을 자산화` 같은 요청을 담당한다.

대상 해석 우선순위는 다음과 같다.

1. 사용자가 명시한 `source_key`, 장표 번호 또는 선택 세션
2. 현재 작업에서 명시적으로 선택된 ingest 장표
3. 현재 작업에서 마지막으로 언급된 ingest 장표

대상을 하나로 확정할 수 없으면 Skill은 장표 하나를 물어본다. 후보 탐색 후에는 자동 승격하지 않고 블록 번호, 저장 범위(`블록 외형`, `내부 도식`, `둘 다`), 자산 이름, 추론한 `module_type`, 용도 설명, 디자인 특징, 검색 태그, 지원 노드 수, 제거될 원본 문구를 보여준 뒤 승인받는다. 사용자는 이 메타데이터를 승인 전에 고칠 수 있다. Skill은 ingest UI와 같은 `tools/asset-curator` 코어를 호출한다.

## 6. 로컬 후보와 승인 자산의 분리

### 6.1 로컬 후보

`storage/asset_candidates/<candidate_id>/candidate.json`은 Git에 포함하지 않는다. 원본 추적과 익명화 검증을 위해 다음 정보를 보관할 수 있다.

- 원본 `source_path`, `source_key`, `slide_no`, 원본 shape ID
- 원본 텍스트와 색상
- 후보 경계와 추출 경고
- 탐지된 블록 맵, shell 영역, 콘텐츠 슬롯, 노드·연결선·그룹 구조
- 후보 상태: `discovered`, `sanitized`, `approved`, `promoted`, `rejected`

`.gitignore`에 `storage/asset_candidates/*`와 `.gitkeep` 예외를 추가한다.

### 6.2 승인 자산

`tools/pattern-library`에는 원본 회사명, 사람 이름, 파일명, 원문 문구, 절대경로를 저장하지 않는다. 승인 자산은 익명화된 블록 shell, 콘텐츠 영역, 내부 도식 구조, 의미 슬롯, 테마 토큰, 비식별 provenance hash와 라이선스 범위만 가진다.

현재 `asset-manifest.schema.json`의 `provider`, `original_file` 요구는 로컬 후보 계약으로 이동한다. 영구 카탈로그는 `provenance_ref`, `license`, `approved_at`만 요구한다.

### 6.3 자산 식별·검색 메타데이터

파일명은 설명문으로 사용하지 않고 변경되지 않는 `<module_id>.json`만 사용한다. 사람이 자산의 형태와 용도를 이해하고 검색할 수 있도록 승인 자산과 카탈로그 항목은 다음 메타데이터를 필수로 가진다.

- `display_name`: 화면에 표시할 짧은 한글 이름
- `module_type`: `process_chain`, `mapping`, `hub_spoke`, `matrix`, `feedback_loop`, `lanes`, `architecture`, `shell` 중 하나
- `description`: 어떤 형태이고 무엇을 설명할 때 쓰는지 담은 1~2문장
- `design_traits`: `라운드 카드`, `헤더 분리`, `좌측 강조띠`처럼 외형을 설명하는 짧은 배열
- `use_cases`: `업무 흐름`, `추진 절차`, `로드맵`처럼 적합한 활용처
- `search_tags`: 자산 선택기가 검색할 동의어와 구조 키워드

초안은 원본 문구가 아니라 토폴로지, 노드 수 범위, shell 영역, 도형 종류, 강조 위치에서 규칙 기반으로 생성한다. 사용자는 승격 전에 모든 표시용 메타데이터를 수정할 수 있다. 승인 검증은 빈 필드, 원본 회사명·파일명·절대경로·원문 문구의 잔존을 거절한다. `module_id`는 파일·참조 안정성을 위해 승격 후 이름이나 설명을 고쳐도 변경하지 않는다.

## 7. 2계층 반응형 블록 계약

승인 자산은 세 종류다.

- `block_shell`: 배경, 테두리, 제목 영역, 본문 영역, 강조띠, 내부 여백만 재사용한다.
- `diagram_recipe`: 블록 내부의 노드·연결선·텍스트 슬롯과 반응형 배치만 재사용한다.
- `composite_block`: `block_shell`과 `diagram_recipe`를 한 자산으로 결합한다.

승인 템플릿은 슬라이드 좌표가 아닌 블록 로컬 좌표와 배치 규칙을 저장한다.

```json
{
  "version": 1,
  "module_id": "process_chain_001",
  "display_name": "단계형 프로세스 블록",
  "asset_kind": "composite_block",
  "module_type": "process_chain",
  "description": "2~8개 업무 단계를 순차적으로 설명하는 반응형 블록 도식",
  "design_traits": ["라운드 카드", "헤더 분리", "좌측 강조띠"],
  "use_cases": ["업무 흐름", "추진 절차", "로드맵"],
  "search_tags": ["프로세스", "단계", "순차", "화살표"],
  "renderer_key": "responsive_native_template",
  "shell": {
    "container": { "kind": "roundRect", "fill": "white", "stroke": "line" },
    "header_zone": { "height_ratio": 0.16, "text_slot": "title" },
    "body_zone": { "x": 0.05, "y": 0.20, "w": 0.90, "h": 0.73 },
    "accent_shapes": [
      { "kind": "rect", "anchor": "left", "width_ratio": 0.012, "fill": "primary" }
    ]
  },
  "diagram": {
    "topology": {
      "kind": "process_chain",
      "repeat_source": "steps",
      "nodes": [
        { "id": "step", "kind": "roundRect", "repeat": true, "text_slot": "steps[]" }
      ],
      "edges": [
        { "from": "step[n]", "to": "step[n+1]", "kind": "connector", "arrow": "end" }
      ]
    },
    "variants": {
      "wide": { "layout": "row", "columns": "all" },
      "compact": { "layout": "grid", "columns": 2 },
      "tall": { "layout": "column", "columns": 1 }
    }
  },
  "style": {
    "node_fill": "pale",
    "node_stroke": "primary",
    "text_color": "navy"
  },
  "constraints": {
    "padding_ratio": 0.05,
    "gap_ratio": 0.03,
    "min_font_size": 9,
    "min_nodes": 2,
    "max_nodes": 8
  }
}
```

원본 좌표는 블록 경계, shell 비율, 콘텐츠 영역, 내부 도식 관계를 추론하는 데만 사용한다. 승인 자산은 블록 shell과 `wide`, `compact`, `tall` 토폴로지 규칙을 저장하며 최종 좌표는 렌더링 시 계산한다.

## 8. 블록 렌더링

기존 `createAssetRecipe({ rendererKey, block, frame, theme })` 흐름을 유지하고 `responsive_native_template` 해석기를 추가한다.

1. 슬라이드 레이아웃 엔진이 최종 `frame.left`, `frame.top`, `frame.width`, `frame.height`를 계산한다.
2. `block_shell` 또는 `composite_block`이면 shell 컨테이너와 header·body·accent 영역을 현재 frame 비율에 맞춰 생성한다.
3. shell의 `body_zone` 또는 기본 안쪽 여백으로 내부 `innerFrame`을 만든다.
4. `innerFrame.width / innerFrame.height`가 1.35 이상이면 `wide`, 0.80 이하이면 `tall`, 나머지는 `compact`를 선택한다. 자산이 임계값을 명시하면 그 값을 우선한다.
5. 반복 노드 수를 실제 `block.content`와 맞추고 노드·연결선 좌표를 다시 계산한다.
6. 색상은 자산 원본 RGB가 아니라 현재 장표 `theme` 토큰으로 치환한다.
7. 모든 텍스트는 현재 요구사항의 `title`, `steps`, `items`, `metrics`, `labels`, `conclusion`에서 채운다.

블록이 `min_font_size`와 최소 노드 크기를 만족하지 못하면 텍스트를 자르거나 겹치지 않는다. 다른 variant를 한 번 시도하고, 그래도 실패하면 `no_suitable_asset`로 되돌려 기존 네이티브 폴백이나 장표 분할을 선택한다.

초기 반복 구조는 2~8개 노드를 지원한다. 고정형 허브·매핑 자산은 승인된 고정 노드 수와 실제 콘텐츠 수가 다르면 적용하지 않는다. 범용 제약조건 솔버와 임의 노드 증감은 이후 확장으로 남긴다.

## 9. 추출·익명화 규칙

큐레이터는 다음 순서로 후보를 정규화한다.

1. 슬라이드 도형을 재귀 순회하고 그룹·컨테이너·primitive·텍스트·연결선을 추출한다.
2. 정렬, 간격, 배경, 테두리, 포함 관계를 이용해 블록 경계와 reading order를 만든다.
3. 각 블록에서 shell, header·body·footer zone, accent shape, 내부 도식 후보를 분리한다.
4. 블록 경계 기준으로 shell과 내부 도식의 상대 좌표와 크기를 계산한다.
5. 연결 관계와 반복 패턴으로 내부 도식을 `process_chain`, `mapping`, `hub_spoke`, `matrix`, `feedback_loop`, `lanes`, `architecture` 중 하나로 추론한다.
6. 원본 텍스트를 `title`, `steps[]`, `items[]`, `metrics[]`, `conclusion` 등의 슬롯으로 교체한다.
7. 원본 색상을 `primary`, `navy`, `accent`, `pale`, `surface`, `line`, `ink`, `gray`, `white` 토큰 중 가장 가까운 역할로 치환한다.
8. 원본 문구와 source 식별자가 승인 JSON에 남아 있지 않은지 검사한다.
9. 구조적 특징에서 표시 이름·도식 유형·설명·디자인 특징·활용처·검색 태그 초안을 생성한다.

토폴로지를 안정적으로 분류하지 못하면 `unsupported_topology`로 후보를 유지하되 영구 카탈로그로 승격하지 않는다. 사용자가 모듈 타입을 명시적으로 교정하면 다시 검증한다.

## 10. 변경 범위

- `tools/asset-curator/`: 블록 맵 탐지, 후보 추출, 익명화, 검증, 승격 공용 코어
- `skills/proposal-asset-curator/`: 자연어 진입점과 승인 절차
- `tools/ppt-ingest/`: shape ID·그룹·연결선 구조 메타데이터 추출 보강
- `tools/hitl-bridge/bridge_server.mjs`: discover·promote API
- `tools/hitl-bridge/public/ingest.html`: 후보 선택 UI
- `tools/slide-renderer/src/asset-recipes.mjs`: 반응형 템플릿 해석기 연결
- `tools/slide-renderer/src/render-presentation.mjs`: 승인 템플릿 로드와 적용 상태 기록
- `tools/pattern-library/asset-manifest.schema.json`: 로컬 provenance와 승인 provenance 분리
- `skills/proposal-ppt-ingest/SKILL.md`, `skills/proposal-ppt-maker/SKILL.md`: 선택적 큐레이션과 반응형 자산 계약 반영
- `.codex-plugin/plugin.json`, `README.md`: Skill 수와 사용 흐름 갱신

새 외부 의존성은 추가하지 않는다. Python의 기존 `python-pptx`, Node.js 표준 라이브러리, 기존 artifact-tool만 사용한다.

## 11. 오류 처리와 안전장치

- 원본 PPTX가 이동·삭제됐으면 재인제스트를 요구한다.
- 후보 안에 지원하지 않는 미디어가 있으면 파일 일부를 조용히 누락하지 않고 거절한다.
- 동일 `module_id`가 있으면 덮어쓰지 않고 다른 이름을 요구한다.
- 표시 이름·설명·디자인 특징·활용처·검색 태그가 비어 있거나 원본 식별정보를 포함하면 승격하지 않는다.
- 카탈로그와 템플릿은 모두 검증된 후 임시 파일에서 원자적으로 교체한다.
- 승격 실패 시 기존 카탈로그와 템플릿을 변경하지 않는다.
- 사용자 승인 전에는 `tools/pattern-library`에 파일을 만들지 않는다.
- 원본 텍스트·절대경로·회사명이 승인 자산에서 발견되면 검증 실패다.
- 자산 적용 후 `selected`, `loaded`, `applied`, `fidelity_passed`를 기존 보고서에 그대로 기록한다.

## 12. 검증 계획

1. 컨테이너·헤더·본문·강조띠가 있는 PPTX fixture에서 블록 경계와 reading order를 안정적으로 찾는다.
2. AutoShape, 텍스트, 그룹, 연결선으로 된 블록에서 내부 도식 후보를 안정적으로 찾는다.
3. 제목·각주·페이지 번호가 블록 맵에서 제외되는지 검사한다.
4. `block_shell`, `diagram_recipe`, `composite_block`이 각각 올바른 계약으로 승격되는지 검사한다.
5. 사진·차트·SmartArt·OLE 포함 후보가 승격되지 않는지 검사한다.
6. 승인 템플릿과 카탈로그에 원본 텍스트·회사명·절대경로가 없는지 검사한다.
7. 동일 shell과 diagram을 wide·compact·tall 블록에 렌더링하고 프레임 밖 이탈·겹침·9pt 미만 텍스트가 없는지 검사한다.
8. 반복형 템플릿이 2~8개 노드에서 연결 순서와 의미 슬롯을 보존하는지 검사한다.
9. 최종 PPTX에 `p:pic`, SVG, 래스터 미디어가 없고 도형·텍스트가 개별 편집 가능한지 검사한다.
10. ingest API와 자연어 Skill이 같은 후보 ID와 승격 코어를 사용하는지 검사한다.
11. 같은 후보에서 규칙 기반 메타데이터 초안이 재현 가능하게 생성되고 사용자가 수정한 값이 카탈로그 검색에 반영되는지 검사한다.
12. 표시용 메타데이터와 파일명에 원본 회사명·파일명·원문 문구가 없는지 검사한다.
13. 기존 빈 카탈로그 폴백과 기존 14개 renderer 회귀 테스트를 통과시킨다.
14. 실제 PowerPoint에서 wide·portrait·landscape 샘플을 열고 전체 슬라이드 PNG 내보내기를 통과시킨다.

## 13. 완료 기준

- 사용자가 ingest 장표의 블록 경계와 내부 도식 후보를 확인할 수 있다.
- 사용자가 블록 외형, 내부 도식 또는 둘을 결합한 자산을 등록할 수 있다.
- 사용자가 등록 전에 자산 이름·도식 유형·용도 설명·디자인 특징·검색 태그를 확인하고 수정할 수 있다.
- 자산 선택기는 파일명이 아니라 승인된 표시 이름·설명·활용처·검색 태그로 자산을 찾을 수 있다.
- 사용자가 대화에서 현재 선택 장표를 `자주 쓰는 에셋`으로 요청할 수 있다.
- 두 경로가 동일한 후보·익명화·검증·승격 코어를 사용한다.
- 승인 자산은 슬라이드 절대좌표와 무관하게 블록 shell과 내부 도식을 wide·compact·tall 프레임에서 재배치한다.
- 승인 자산과 최종 PPTX에 원본 회사정보·원문 문구·래스터 자산이 남지 않는다.
- 기존 자산 0개 네이티브 폴백과 기존 제안 장표 생성 흐름이 깨지지 않는다.
