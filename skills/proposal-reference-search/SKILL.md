---
name: proposal-reference-search
description: RFP 요구사항이나 자연어 질의로 SQLite3 슬라이드 색인을 검색하고 HitL 피커에서 참고 장표를 선택하도록 돕는 Skill.
---

# Proposal Reference Search

과거 제안서 슬라이드 색인에서 유사 장표를 찾는다. BGE-M3 임베딩 API가 설정되어 있으면 semantic 검색을 사용하고, 그렇지 않거나 API가 실패하면 lexical 검색으로 제한한다.

## 실행

```powershell
node tools/reference-search/search_cli.mjs --query "<요구사항 또는 검색어>" --size 7
```

검색 결과는 `storage/sessions/ref_<id>.json`에 저장된다. 사용자가 시각적으로 후보를 비교해야 하면 다음을 실행한다.

```powershell
node tools/hitl-bridge/hitl_launcher.mjs --open "http://127.0.0.1:5174/picker.html?session=ref_<id>"
```

사용자에게 후보와 세션 URL을 보고하고, 선택 완료 전에는 후속 장표 기획으로 진행하지 않는다. 사용자가 "골랐어" 또는 "선택했어"라고 하면 세션의 `selected_slide_ids`를 읽어 `proposal-slide-planner`에 전달한다.

## 세션 계약

세션에는 `session_id`, `created_at`, `query`, `candidates[]`, `selected_slide_ids`, `status`를 포함한다. 후보에는 `slide_id`, `source_pptx`, `slide_no`, `title`, `image_description`, `tags`, `similarity`, `image_ref`, `html_ref`, `layout`을 보존한다.
