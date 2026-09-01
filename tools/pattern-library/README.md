# Proposal Asset Library

승인된 네이티브 제안서 자산만 보관하는 라이브러리다. 원본 PPTX/POTX, 원본 파일명·경로, 회사·인명·원문 문구, 별도 미리보기는 저장하지 않는다.

## 흐름

1. `asset_curator.py discover`가 로컬 ingest 원본을 읽어 블록·도식·아이콘·사진 프레임 후보를 `storage/asset_candidates/`에 만든다.
2. 사용자가 후보의 선별 결과와 익명화 템플릿·메타데이터를 검토한다.
3. 승인한 후보만 `asset_curator.py promote`로 종류별 폴더에 승격한다.

`templates/`에는 `block_shell`, `diagram_recipe`, `composite_block` 템플릿을, `icons/`에는 네이티브 아이콘, `media-frames/`에는 사진 프레임, `photos/`에는 사용 권한이 확인된 사진만 둔다. 자산 JSON은 블록 로컬 좌표와 `wide`·`compact`·`tall` 배치 규칙을 사용한다.

영구 카탈로그 계약은 [asset-manifest.schema.json](asset-manifest.schema.json)에 있다. 사진은 `license_status: user_confirmed` 또는 허용된 라이선스 상태가 있어야 하며, 구조 자산은 현재 장표 테마로 재색상된다.
