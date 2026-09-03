---
name: proposal-asset-curator
description: 기존 PPTX/POTX에서 재사용 가능한 네이티브 제안서 블록·도식·아이콘·사진 프레임 후보를 선별하고, 사용자가 승인한 후보만 익명화해 자산 라이브러리에 승격한다.
---

# Proposal Asset Curator

> **상태: 실험적 · 렌더링에 사용하지 않음**
>
> 이 Skill이 승격한 `responsive_native_template` 자산을 장표 렌더링에 직접 적용하는 경로는 동결되어 있다. 실측 결과 템플릿 252개 중 208개가 좌표 범위를 벗어났고(좌표 정규화 버그는 수정했으나 기존 템플릿은 원본에서 재인제스트해야 반영된다), 60%는 텍스트 슬롯이 2개 이하여서 자산을 적용하면 블록 내용이 소실된다. 원본 글꼴 크기도 추출 단계에서 유실된다.
>
> 과거 장표를 참고하려면 `$proposal-ppt-ingest`가 만드는 슬라이드 PNG와 SQLite 색인을 `$proposal-reference-search`로 검색한다. 이 Skill은 자산 파이프라인을 계속 실험할 때만 쓴다.

기존 제안서의 장표 전체를 복사하지 않고 블록 단위로 재사용 자산을 만든다. 원본 PPTX/POTX는 로컬 `source_path`에서만 읽고 저장소나 영구 카탈로그로 복사하지 않는다.

## 대상 해석

대상은 다음 우선순위로 확정한다.

1. 사용자가 지정한 `source_key`, 장표 번호 또는 선택 세션
2. 현재 작업에서 명시적으로 선택한 ingest 장표
3. 마지막으로 언급된 ingest 장표

하나로 확정되지 않으면 전체 원본·특정 장표·특정 레이아웃 중 무엇을 볼지만 묻는다. 이미지/PDF만 있고 PPTX/POTX 원본이 없으면 편집 가능한 네이티브 구조를 보장할 수 없다고 말하고 원본을 요청한다.

## 선별 모드

`골라줘`, `쓸만한 것만 추려줘`, `후보를 봐줘`는 **선별 전용**으로 처리한다. `tools/pattern-library`를 변경하지 않는다. 후보의 `selected`·`deferred`·`rejected`, 이유, 정리 작업, 중복 대표, 지원 variant만 보고한다.

사용자가 저장·등록·에셋화한다고 말해도 먼저 후보·익명화 결과·메타데이터 초안을 보여준다. 최종 `승인`을 명시적으로 받은 후보만 `asset_curator.py promote`로 승격한다. `promote` 없이 자동 저장하지 않는다.

지원 자산 종류는 `block_shell`, `diagram_recipe`, `composite_block`, `icon_asset`, `media_frame`, `photo_asset`이다. 구조 자산은 블록 로컬 좌표의 `responsive_native_template`로 만들고, 사진은 사용자가 확인한 라이선스와 `photo_asset_reference`를 함께 요구한다.

## 실행

```powershell
python tools/asset-curator/asset_curator.py discover --manifest <manifest.json> --data-dir storage
python tools/asset-curator/asset_curator.py discover --manifest <manifest.json> --slide-no 3 --data-dir storage
python tools/asset-curator/asset_curator.py promote --candidate-id <candidate_id> --request-json <approved.json> --data-dir storage --pattern-root tools/pattern-library
```

승격 요청에는 자산 ID·표시 이름·도식 유형·자산 종류·설명·디자인 특징·활용처·검색 태그·사용 모드가 있어야 한다. 메타데이터에는 회사명·인명·원본 파일명·절대경로·원문 문구를 남기지 않는다. 후보의 실제 사진을 보존할 때만 라이선스 상태가 `user_confirmed` 또는 허용된 라이선스인지 확인한다.

## 완료 기준

- 후보 보고서가 장표/블록 단위이며 원문·source path를 노출하지 않는다.
- 승인 전에는 `tools/pattern-library`와 카탈로그가 그대로다.
- 승인 후 영구 자산에는 네이티브 도형 구조와 검색 메타데이터만 남고, 사진 외에는 래스터 바이트가 없다.
- 실패한 승격은 카탈로그·자산 파일·후보 상태를 함께 되돌린다.

세부 블록 탐지·정성 판정·실패 사례는 [references/selection-playbook.md](references/selection-playbook.md)를 필요한 경우에만 읽는다.
