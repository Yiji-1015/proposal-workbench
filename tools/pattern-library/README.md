# Proposal Asset Library

사용자가 제공한 미리캔버스 도식 자산을 등록하는 빈 라이브러리다.

현재는 회사별 원본, 이미지, 미리보기, 추출 카탈로그를 포함하지 않는다. 자산이 없을 때도 렌더러는 요구사항 내용에 맞는 네이티브 PowerPoint 도형으로 폴백한다.

## 자산 추가

1. 미리캔버스에서 사용 허가된 구조 자산을 가져온다.
2. 편집 가능한 구조 템플릿을 `templates/` 아래에 둔다.
3. `unified-visual-module-catalog.json`에 [asset-manifest.schema.json](asset-manifest.schema.json)의 필드를 갖춘 항목을 추가한다.
4. 원본 파일명·제공자·라이선스를 `source`에 기록한다.

자산별 `preview` 파일은 관리하지 않는다. 최종 장표의 `wireframe.png`와 `final-slide.png`는 렌더링 실행 산출물로 별도 생성된다.
