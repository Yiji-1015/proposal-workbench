# Proposal PPT Maker 입출력 계약

## 실행 의존성

| 구분 | 항목 | 용도 |
|---|---|---|
| 플러그인 번들 | `tools/slide-renderer`, `tools/pattern-library` | blueprint 렌더링과 도식 자산 검색 |
| 필수 런타임 | Node.js 22.5 이상, `@oai/artifact-tool` | SQLite 검색 및 PPTX/PNG 생성 |
| 권장 Skill | `presentations:Presentations` | PowerPoint 작성 규칙과 시각 QA |
| 조건부 변환기 | `kordoc` 또는 동등한 문서 파서 | PDF·DOCX·HWP 등 원문을 Markdown으로 변환할 때 사용 |
| 최종 검증 | Microsoft PowerPoint | 실제 파일 열기, 전체 슬라이드 PNG 내보내기, 호환성 확인 |

`kordoc`과 Microsoft PowerPoint는 렌더러 자체의 생성 의존성은 아니다. 원문이 이미 Markdown/JSON이면 `kordoc`을 생략할 수 있으며, PowerPoint가 없으면 결과 상태를 검증 대기로 남긴다.

## 설치 검증

`@oai/artifact-tool` 패키지는 Codex 번들 런타임이므로 일반 npm registry에서 내려받지 않는다. 플러그인 루트의 `tools/` 아래에 렌더러와 패턴 카탈로그가 포함되며, Codex를 한 번 실행한 PC에서 다음 검증을 수행한다.

```powershell
node "<skill-root>/scripts/verify-skill.mjs"
```

- 검증기는 Node.js 22.5 이상, 번들 renderer, pattern catalog와 Codex 내장 artifact-tool 탐색 결과를 검사한다.
- 렌더러는 스킬 폴더를 수정하거나 `node_modules` 링크를 만들지 않고 artifact-tool을 읽기 전용으로 불러온다.
- Codex runtime을 찾지 못하면 `CODEX_ARTIFACT_TOOL_PATH`에 해당 PC의 `@oai/artifact-tool` 패키지 폴더를 지정한 뒤 다시 실행한다.

## 입력 수준

스킬은 다음 중 하나 이상을 입력으로 받는다.

1. 원문 RFP: PDF, DOCX, HWP 변환물, Markdown
2. 분석 결과: 요구사항 목록, 정량지표, 원문 근거 위치
3. 단일 요구사항: 요구사항 ID와 상세 설명
4. 선택 입력: 가로/세로 방향, 담당 범위, 배치 크기, 참조 PPTX, 브랜드 규칙

원문 입력은 바로 렌더러에 전달하지 않는다. 요구사항별 프로젝트의 세 JSON으로 정규화한다.

## 요구사항별 작업 디렉터리

다음 구조는 렌더링 입력을 격리하기 위한 작업 구조다. 최종 전달 구조가 아니며, 요구사항마다 동일한 최종 산출물 폴더를 반복 생성하지 않는다.

```text
<requirement-project>/
├─ input/
│  └─ requirement.json
├─ blueprint/
│  └─ slide-blueprint.json
└─ mapping/
   └─ asset-mapping.json
```

세 파일의 `requirement_id`는 반드시 동일해야 한다.

## `input/requirement.json`

필수 필드:

- `requirement_id`: RFP 고유번호 또는 프로젝트에서 부여한 안정적인 ID
- `requirement_name`: 요구사항 명칭
- `requirement_summary`: 장표가 답해야 하는 한두 문장

권장 필드:

- `rfp_facts.quantitative_metrics[]`
  - `id`: 지표 ID
  - `name`: 지표 이름
  - `value_text`: 원문 표현을 보존한 값과 단위
  - `source_refs[]`: 페이지·문단·청크 근거

## `blueprint/slide-blueprint.json`

필수 상위 필드:

- `requirement_id`
- `slide_title`
- `layout_family`
- `orientation`: `landscape` 또는 `portrait`
- `blocks[]`: 최소 5개의 독립된 내용 상자. 각 상자는 고유 `block_id`와 구별되는 정보 역할을 가져야 하며, 동일 카드 복제로 개수만 채우지 않는다.

`orientation`이 `portrait`이면 다음 필드도 필수다.

- `governing_message`: 제안사의 구현 행동과 결과를 설명하며 반드시 `니다.`로 끝나는 한 문장

권장 상위 필드:

- `density`: 제안서는 반드시 `high`. `standard`, `medium`, `low`는 최종 제안 장표 입력으로 허용하지 않는다.
- `protected_metrics[]`: `metric_id`, `label`, `value_text`, `source_refs[]`
- `theme`: 승인된 색상 팔레트. 생략하면 `primary: #1769E0`, `navy: #123B78`, `accent: #4A8CF0`, `pale: #EEF5FF`, `surface: #F3F6FA`를 사용한다.

각 `blocks[]` 필드:

- `block_id`: 장표 내부 고유 ID
- `role`: 예) `requirement_summary`, `main_process`, `operation_quality`, `technology_comparison`, `metric_highlight`
- `slot`: 예) `left`, `center`, `right`, `bottom_center`, `top_left`
- `visual_category`: 내용 주제가 아닌 도식 구조
- `direction`: `left_to_right`, `vertical`, `horizontal`, `none` 등
- `importance`: `mandatory` 또는 `optional`
- `content`: `headline`, `bullets`, `steps`, `options`, `label`, `value_text`, `diagram_labels` 중 역할에 필요한 값
- `source_refs[]`: 블록 내용의 근거
- `step_count`: `steps` 또는 `options`가 있을 때 실제 항목 수와 동일해야 함

현재 등록 레이아웃은 `three_column_with_bottom_band`의 가로·세로 변형이다. 다른 값은 경계를 벗어나지 않는 `generic_grid`로 폴백된다.

`requirement_summary`는 분석 입력이며 최종 장표의 `요구사항 해석` 섹션으로 그대로 노출하지 않는다. 최종 가시 제목은 `핵심 구현 전략`, `통합 적용 방안`, `운영 통제`처럼 제안사의 실행과 결과를 표현한다. 비교 성격의 블록은 `content.conclusion`에 최종 적용 방향을 포함한다.

`diagram_labels`는 원문 근거가 있는 긴 `bullets`를 도식 노드에 넣기 위해 축약한 가시 라벨이다. 세 개 이상의 병렬 항목은 불릿 목록으로 그대로 두기 전에 chain, wheel, mapping, matrix, lifecycle 자산의 노드 라벨로 변환할 수 있는지 우선 검토한다.

## `mapping/asset-mapping.json`

필수 상위 필드:

- `requirement_id`
- `mappings[]`

각 매핑은 blueprint의 `block_id`를 참조하며 다음 중 하나를 사용한다.

- 선택 자산: `status: selected_candidate`, `asset_id`, 선택적 `template`, 필수 또는 카탈로그에서 추론 가능한 `renderer_key`, `render_mode`, `usage_mode`
- 네이티브 폴백: `status: fallback_native_shapes`, `fallback: native_shapes`, `usage_note`
- 적합 자산 없음: `status: no_suitable_asset`, `fallback: native_shapes`, `usage_note`

`asset_id`는 `tools/pattern-library/unified-visual-module-catalog.json`에 존재해야 한다. `renderer_key`는 `process_grid`, `comparison`, `mapping`, `feedback_loop`, `quality_gate`, `hub_spoke`, `swimlane`, `architecture` 중 하나다. 지원하지 않는 선택 자산은 generic grid로 대체하지 않고 실패한다. 프로세스 단계 수가 자산 구조와 다르면 2~12개 범위에서 노드 수를 재배치하고 `adaptations: [{ type: node_count_reflow, from, to }]`를 기록한다.

`usage_mode`는 `semantic`, `structural`, `decorative` 중 하나다. `decorative`는 원본 주제와의 일치가 아니라 시각적 리듬과 완성도를 위한 재사용이며, 원본 라벨을 제거하고 사실로 오인될 관계를 만들지 않아야 한다. 정확한 주제 자산이 없다는 이유만으로 즉시 `fallback_native_shapes`를 선택하지 않는다.

선택 자산의 최종 `render_mode`는 `native_powerpoint_shapes`여야 한다. 카탈로그의 SVG 파일은 구조 레퍼런스이며 최종 PPTX에 삽입하지 않는다. 스크린샷, PNG/JPG 또는 SVG 그림으로 자산을 전달하지 않는다. 사용자가 명시적으로 요청한 사진이나 로고만 이미지 예외로 허용한다. 네이티브 도형과 텍스트만 포함한 논리적 그룹은 허용한다.

카탈로그의 `aspect_ratio`는 자산이 추출된 원본 도형의 비율이며 슬라이드 방향 제한이 아니다. 가로형 자산도 세로 장표의 블록 안에서 비례 축소, 여백 크롭, 텍스트 교체, 반복 구조 재배치 방식으로 사용할 수 있다. 자산 선택과 폴백 판단 전에는 [asset-selection.md](asset-selection.md)의 방향 독립 규칙을 적용한다. 원본 비율과 슬라이드 방향이 다르다는 이유만으로 `fallback_native_shapes`를 선택하지 않는다.

## 실행 중간 출력

커스텀 `--output`을 지정하면 같은 폴더에 다음 파일이 생긴다.

```text
<output-dir>/
├─ <requirement-id>.pptx
├─ wireframe.png
├─ final-slide.png
└─ verification-report.json
```

- `.pptx`: 요구사항 1개당 2슬라이드—와이어프레임 1장과 완성안 1장
- `wireframe.png`: 배치·블록·asset 후보 검토용
- `final-slide.png`: artifact-tool이 렌더링한 완성 장표 미리보기
- `verification-report.json`: 방향, 레이아웃, 승인 theme, `density`, `content_box_count`, 의미 영역 수, 실제 사용 asset, 폴백 이유, 산출물 경로, 렌더 검증 상태

선택 자산마다 `selected`, `loaded`, `applied`, `fidelity_passed`를 별도로 기록한다. `used`는 `applied && fidelity_passed`일 때만 참이다. `structure_fingerprint`, `required_motifs`, `produced_motifs`로 에셋 고유 구조가 결과에 적용됐음을 증명한다.

여러 요구사항을 실행하면 위 출력 묶음이 요구사항별로 반복된다. 현재 렌더러는 이 묶음을 하나의 최종 제안서 덱으로 병합하지 않는다.

## Close-out과 최종 전달 구조

요구사항 장표마다 별도 전달 폴더를 만들지 않는다. 하나의 RFP 또는 생성 실행을 하나의 루트 폴더로 묶고 요구사항은 파일명으로 식별한다.

```text
<rfp-or-run>/
├─ deliverables/
│  ├─ <rfp-id>_<orientation>_final.pptx
│  ├─ previews/
│  │  └─ <sequence>_<requirement-id>.png
│  └─ verification-report.json
├─ work/
│  └─ <requirement-id>/
│     ├─ input/
│     ├─ blueprint/
│     └─ mapping/
└─ _archive/
   └─ iterations/
      └─ <version-or-timestamp>/
```

- `deliverables`에는 사용자가 받아갈 최종본만 둔다.
- 요구사항별 JSON과 재생성 자료는 `work/<requirement-id>` 아래에 둔다.
- v1, v2 같은 시험본은 삭제하지 말고 `_archive/iterations`로 이동한다.
- PowerPoint 임시 잠금 파일과 명백한 임시 렌더는 최종본 검증 후에만 정리한다.
- 여러 요구사항을 하나의 덱으로 병합하지 못한 현재 렌더러 상태에서는 요구사항별 PPTX를 `deliverables`에 평면 배치하되 `<sequence>_<requirement-id>.pptx`로 명명한다.

## 검증 상태

- `generated_pending_powerpoint_review`: PPTX 패키지와 미리보기 생성은 성공했으나 Microsoft PowerPoint 검증 전
- PowerPoint 검증 완료 보고: 파일 열기 성공, 예상 슬라이드 수, 전체 PNG 내보내기 성공, 시각 검토 결과를 별도로 기록
- PowerPoint를 사용할 수 없으면 제한을 그대로 보고하고 완성본이라고 표현하지 않는다.

최종 검증 보고서에는 가능하면 다음 항목을 기록한다.

- `powerpoint_review_completed`
- `powerpoint_exported_slide_count`
- `embedded_media_count`
- `picture_shape_count`
- `group_shape_count`
- `grouped_picture_shape_count`
- `grouped_media_count`
- `native_shape_count_final_slide`

카탈로그 기반 도식만 사용하는 장표의 합격값은 `embedded_media_count: 0`, `picture_shape_count: 0`, `grouped_picture_shape_count: 0`, `grouped_media_count: 0`이다. `group_shape_count`는 정보성 지표이며 0일 필요가 없다. 그룹이 있으면 그룹 내부가 네이티브 도형·연결선·텍스트만으로 구성되고 그룹 해제 후 개별 편집 가능한지 확인한다. 사진·로고를 사용자가 요청한 경우 해당 예외와 개수를 별도로 기록한다.
