# 서브에이전트 실행 계약

서브에이전트는 기본 실행 방식이 아니다. 사용자가 명시적으로 요청한 경우에만 아래 JSON 계약을 전달하고 실행 전에 검증한다.

```json
{
  "requirement_ids": ["SFR-002", "SFR-003"],
  "slide_scope": { "count": 4, "orientation": "portrait" },
  "palette": { "primary": "#1769E0", "navy": "#123B78" },
  "reference_context": { "mode": "none", "selected_slide_ids": [], "notes": [] },
  "native_topology_constraints": ["unique_visual_category_per_slide", "editable_powerpoint_shapes"],
  "forbidden_actions": ["start_localhost", "create_review_ppt", "expand_requirement_scope", "require_asset_catalog"],
  "time_budget_minutes": 30,
  "max_review_rounds": 1,
  "completion_criteria": ["editable_pptx", "inline_preview", "native_diagram_report"]
}
```

```powershell
node "<skill-root>/scripts/validate-agent-brief.mjs" --brief "<brief.json>"
```

필수 필드는 `requirement_ids`, `slide_scope`, `palette`, `reference_context`, `native_topology_constraints`, `forbidden_actions`, `time_budget_minutes`, `max_review_rounds`, `completion_criteria`다. `max_review_rounds`는 0 또는 1이어야 한다.

서브에이전트는 대상 ID, 장표 수, 방향, 팔레트, 선택 레퍼런스, 네이티브 토폴로지 제약, 금지 작업과 시간 예산을 시작 응답에서 확인한다. 범위 밖 문제는 수정하지 않고 상위 에이전트에게 보고한다.
