# 서브에이전트 실행 계약

서브에이전트는 기본 실행 방식이 아니다. 8쪽 이하에서는 현재 에이전트가 직접 실행한다. 사용자가 서브에이전트를 명시적으로 선택한 경우에만 아래 JSON 계약을 전달하고 실행 전에 검증한다.

```json
{
  "requirement_ids": ["SFR-002", "SFR-003"],
  "slide_scope": { "count": 4, "orientation": "portrait" },
  "palette": { "primary": "#1769E0", "navy": "#123B78" },
  "approved_asset_mappings": [
    { "block_id": "quality", "asset_id": "source_template_quality_feedback_loop", "renderer_key": "feedback_loop" }
  ],
  "forbidden_actions": [
    "start_localhost",
    "create_review_ppt",
    "expand_validation_infrastructure",
    "change_palette",
    "expand_requirement_scope"
  ],
  "time_budget_minutes": 30,
  "max_review_rounds": 1,
  "completion_criteria": ["editable_pptx", "inline_preview", "honest_asset_report"]
}
```

검증:

```powershell
node "<skill-root>/scripts/validate-agent-brief.mjs" --brief "<brief.json>"
```

필수 필드는 `requirement_ids`, `slide_scope`, `palette`, `approved_asset_mappings`, `forbidden_actions`, `time_budget_minutes`, `max_review_rounds`, `completion_criteria`다. `max_review_rounds`는 0 또는 1이어야 한다.

서브에이전트는 시작 응답에서 대상 ID, 장표 수, 방향, 팔레트, 에셋 매핑, 금지 작업, 시간 예산을 한 번 요약해 계약 수신을 확인한다. 계약 밖의 검증기, 체크섬 체계, 골든 이미지, 아카이브 파이프라인 또는 테스트 인프라를 만들지 않는다. 범위 밖 문제가 발견되면 수정하지 말고 상위 에이전트에게 한 문장으로 보고한다.
