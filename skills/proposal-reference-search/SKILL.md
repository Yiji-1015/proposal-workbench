---
name: proposal-reference-search
description: RFP 요구사항이나 자연어 질의로 SQLite3 슬라이드 색인을 검색하고 HitL 피커에서 참고 장표를 선택하도록 돕는 Skill.
---

# Proposal Reference Search

과거 제안서 슬라이드 색인에서 유사 장표를 찾는다. 검색어는 고정 문구가 아니라 사용자가 입력한 임의의 자연어 질의다. BGE-M3 임베딩 API가 설정되어 있으면 semantic 검색을 사용하고, 그렇지 않거나 API가 실패하면 lexical 검색으로 제한한다. 현재 색인은 SQLite3이며 FAISS는 사용하지 않는다. semantic 검색도 SQLite에서 벡터를 읽어 애플리케이션 코드로 cosine similarity를 계산한다.

## 실행

```powershell
node tools/reference-search/search_cli.mjs --query "<요구사항 또는 검색어>" --size 7
```

검색 결과는 `storage/sessions/ref_<id>.json`에 저장된다. 사용자가 시각적으로 후보를 비교해야 하면 다음을 실행한다.

```powershell
node tools/hitl-bridge/hitl_launcher.mjs --open "http://127.0.0.1:5274/picker.html?session=ref_<id>"
```

사용자에게 후보와 세션 URL을 보고하고, 선택 완료 전에는 후속 장표 기획으로 진행하지 않는다. 사용자가 "골랐어" 또는 "선택했어"라고 하면 세션의 `selected_slide_ids`를 읽어 `proposal-slide-planner`에 전달한다.

피커의 `레퍼런스 자유 검색` 입력창에서 질의를 바꾸면 같은 세션의 후보가 새로 검색되고 기존 선택은 초기화된다. 렌더링 PNG가 없거나 파일이 사라진 후보는 깨진 이미지 대신 `html_ref` 구조 미리보기를 사용한다.

카드는 명시적인 선택 상태와 선택 개수를 표시한다. 상단 `PPTX 다운로드`는 선택을 세션에 저장한 뒤 같은 원본 덱의 선택 장표를 편집 가능한 PPTX 한 파일로 추출한다. 원본 PPTX의 도형·텍스트·서식을 유지하려고 PowerPoint COM을 사용한다. `PNG 다운로드`는 이미지 보관용 보조 기능이다. 여러 원본 덱의 장표는 한 PPTX로 섞지 말고 덱별로 나눠 선택한다. 후속 `proposal-slide-planner` 연계에는 다운로드 파일이 아니라 세션의 `selected_slide_ids`를 사용한다.

lexical 검색은 실제 매칭된 장표만 반환하며, 매칭이 없으면 빈 후보를 반환한다. 모든 검색어를 사전에 등록할 필요는 없다. 등록되지 않은 단어도 일반 lexical 검색으로 동일·부분 일치 장표를 찾고, BGE-M3 임베딩이 색인되어 있으면 의미가 가까운 장표까지 찾는다. `tools/reference-search/query_concepts.json`은 `RAG`/`검색증강생성`처럼 모델 없이도 동등 취급해야 하는 표현이나 특정 도메인의 구조 신호를 위한 선택적 예외표다. 새 용어마다 반드시 추가하는 운영 절차가 아니다.

따라서 등록 없는 동의어 검색의 조건은 BGE-M3다. 임베딩 API가 없거나 장표 벡터가 없으면 시스템은 이를 가장하지 않고 lexical 모드로 표시한다. FAISS는 벡터를 빠르게 찾는 인덱스일 뿐이며, `RAG`와 `검색증강생성`을 같은 의미로 판단하는 역할은 임베딩 모델이 한다.

현재 벡터 색인은 SQLite3 원본과 애플리케이션 cosine 계산으로 충분한 규모를 처리한다. FAISS는 임베딩 생성·갱신 파이프라인과 대규모 벡터 수요가 생길 때 선택적으로 추가하며, FAISS만 덧대어 lexical 검색을 semantic 검색으로 바꾸지는 않는다.

## 세션 계약

세션에는 `session_id`, `created_at`, `query`, `candidates[]`, `selected_slide_ids`, `status`를 포함한다. 후보에는 `slide_id`, `source_key`, `source_pptx`, `slide_no`, `title`, `image_description`, `tags`, `similarity`, `image_ref`, `html_ref`, `layout`, `slide_type`을 보존한다. `slide_no`는 추적과 원본 장표 추출용 내부 번호이며 검색 입력값이 아니다. `image_ref`가 빈 문자열이면 PNG를 사용할 수 없다는 뜻이다.
