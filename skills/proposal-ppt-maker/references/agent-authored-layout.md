# Agent-authored native layout

신규 장표는 고정 도식 레시피를 선택하지 않는다. 메이커 에이전트가 승인된 내용 블록의 의미와 관계를 읽고 `shape_plan`에 편집 가능한 PowerPoint 기본 도형을 직접 배치한다.

## 저작 순서

1. 장표의 한 문장 메시지와 시선 흐름을 정한다.
2. 블록 5~8개의 상대적 중요도와 연결 관계를 정한다.
3. 한 장을 지배할 구성 원리를 하나 선택한다. 예: 비대칭 중심축, 중심-주변, 계층형, 수렴형, 교차 레인, 단계형. 이는 예시이며 고정 목록이 아니다.
4. 빈 공간, 강조 대비, 읽기 순서를 고려해 각 도형의 절대 좌표를 작성한다.
5. 각 블록을 최소 하나의 비텍스트 도형과 하나의 편집 가능한 텍스트로 표현한다. 블록 `content` 안의 모든 문자열과 모든 `protected_metrics[].value_text`는 해당 블록의 가시 텍스트에 원문 그대로 포함한다.
6. PNG로 렌더링한 뒤 겹침, 잘림, 작은 글자, 반복 구조를 한 번 검토한다.

## `shape_plan` 계약

```json
{
  "layout_family": "agent_authored",
  "shape_plan": {
    "design_rationale": "핵심 처리 허브를 중심으로 입력·통제·활용 결과가 수렴하도록 구성한다.",
    "composition_signature": "portrait-offset-hub-with-control-rail-v1",
    "primitives": [
      {
        "kind": "roundRect",
        "name": "scope-surface",
        "block_id": "scope",
        "position": { "left": 48, "top": 184, "width": 624, "height": 126 },
        "fill": "pale",
        "stroke": "line",
        "line_width": 1
      },
      {
        "kind": "text",
        "name": "scope-title",
        "block_id": "scope",
        "position": { "left": 72, "top": 214, "width": 576, "height": 48 },
        "text": "통합 대상과 적용 범위",
        "font_size": 18,
        "color": "navy",
        "bold": true,
        "alignment": "left"
      }
    ]
  }
}
```

허용 `kind`는 `text`, `rect`, `roundRect`, `ellipse`, `diamond`, `line`, `connector`다. 이미지와 SVG는 허용하지 않는다. `connector`는 앞에서 선언된 비연결선 도형의 고유 `name`을 `from`, `to`로 참조하고 `connector_kind`는 `straight`만 사용한다. `from_side`, `to_side`는 `left`, `right`, `top`, `bottom` 중 하나다.

색은 `primary`, `navy`, `accent`, `pale`, `surface`, `ink`, `gray`, `line`, `white`, `none` 토큰을 우선 사용한다. 직접 쓴 `#RRGGBB`는 현재 테마 값과 정확히 일치해야 한다. 글자 크기는 10~44pt, 선 두께는 0~8 범위다.

모든 좌표는 슬라이드 단위의 절대값이다. 세로형 캔버스는 720×1280이며 본문 안전 영역은 `left >= 24`, `top >= 166`, `right <= 696`, `bottom <= 1230`이다. 가로형은 1280×720이며 `left >= 24`, `top >= 150`, `right <= 1256`, `bottom <= 670`이다. 제목·거버닝 메시지·푸터는 렌더러가 담당하므로 `shape_plan`이 침범하지 않는다.

## 다양성 원칙

- 같은 크기의 카드 행렬을 기본값으로 삼지 않는다.
- 블록 수를 맞추기 위해 문장을 쪼개거나 장식 도형을 내용 블록으로 세지 않는다.
- 장표별 `composition_signature`는 실제 도형 그래프와 시선 흐름을 설명해야 한다.
- 검증 보고서의 `structure_fingerprint`는 도형 종류·상대 좌표·연결 그래프에서 자동 계산된다. 여러 장을 만들 때 인접 장표의 값을 비교한다.
- 인접 장표의 서명이 같거나 도형 종류·크기·배열이 사실상 같으면 한 장을 다시 설계한다.
- 시각적 다양성보다 의미 전달이 우선이다. 동일 관계가 반복될 때만 동일 구조를 재사용한다.

## 실패 조건

렌더 전에 다음을 거부한다.

- 블록 5개 미만 또는 8개 초과
- 도형 10개 미만, 중복 이름, 지원하지 않는 도형
- 안전 영역 밖 좌표, 0 이하 크기, 유효하지 않은 색·폰트·선 두께
- 존재하지 않거나 뒤에 선언된 도형을 가리키는 연결선
- 도형 또는 편집 가능한 텍스트로 표현되지 않은 블록
- 이미지·SVG·고정 레시피 참조

기존 `block_pool_auto`와 `visual_category` 청사진은 하위 호환 입력으로만 유지한다. 신규 장표 설계의 근거로 사용하지 않는다.
