# 서브에이전트 실행 계약

서브에이전트는 기본 실행 방식이 아니다. 사용자가 명시적으로 요청한 경우에만 아래 JSON 계약을 전달하고 실행 전에 검증한다.

```json
{
  "requirement_ids": ["SFR-002", "SFR-003"],
  "slide_scope": { "count": 4, "orientation": "portrait" },
  "palette": { "primary": "#1769E0", "navy": "#123B78" },
  "reference_context": { "mode": "none", "selected_slide_ids": [], "notes": [] },
  "layout_constraints": ["agent_authored_shape_plan", "distinct_composition_signature", "editable_powerpoint_shapes"],
  "forbidden_actions": ["start_localhost", "create_review_ppt", "expand_requirement_scope", "require_asset_catalog"],
  "time_budget_minutes": 30,
  "max_review_rounds": 1,
  "completion_criteria": ["editable_pptx", "inline_preview", "native_diagram_report"]
}
```

```powershell
node "<skill-root>/scripts/validate-agent-brief.mjs" --brief "<brief.json>"
```

필수 필드는 `requirement_ids`, `slide_scope`, `palette`, `reference_context`, `layout_constraints`, `forbidden_actions`, `time_budget_minutes`, `max_review_rounds`, `completion_criteria`다. `max_review_rounds`는 0 또는 1이어야 한다.

빌더 서브에이전트는 요구사항별로 의미 블록과 `shape_plan`을 저작한다. 한 명의 리뷰어가 렌더 PNG에서 겹침·잘림·반복 구성을 검사하며 수정 라운드는 최대 1회다. 메인 에이전트가 결과를 결합하고 계약·산출물 검증을 수행한다. 범위 밖 문제는 수정하지 않고 상위 에이전트에게 보고한다.
