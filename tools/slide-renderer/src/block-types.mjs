export const EXPLANATION_BAND_HEIGHT = 38;

export function explanationBandHeight(text, width) {
  if (typeof text !== "string" || !text.trim()) return 0;
  const charactersPerLine = Math.max(22, Math.floor(Number(width) / 8));
  const lines = Math.max(1, Math.ceil(text.trim().length / charactersPerLine));
  return Math.max(EXPLANATION_BAND_HEIGHT, 14 + lines * 13);
}

const BLOCK_TYPE_DEFINITIONS = [
  {
    id: "matrix_table",
    rendererKey: "matrix_table",
    preferredSpan: "full",
    minItems: 1,
    maxItems: 10,
    minHeight: { portrait: 170, landscape: 130 },
    preferredHeight: { portrait: 250, landscape: 190 },
    contentKind: "table",
  },
  {
    id: "metric_dashboard",
    rendererKey: "metric_dashboard",
    preferredSpan: "half",
    minItems: 1,
    maxItems: 6,
    minHeight: { portrait: 120, landscape: 90 },
    preferredHeight: { portrait: 170, landscape: 130 },
    contentKind: "metrics",
  },
  {
    id: "scope_outcome_mapping",
    rendererKey: "scope_outcome_mapping",
    preferredSpan: "half",
    minItems: 1,
    maxItems: 6,
    minHeight: { portrait: 140, landscape: 105 },
    preferredHeight: { portrait: 190, landscape: 145 },
    contentKind: "mapping",
  },
  {
    id: "blueprint_flow",
    rendererKey: "blueprint_flow",
    preferredSpan: "full",
    minItems: 2,
    maxItems: 8,
    minHeight: { portrait: 190, landscape: 145 },
    preferredHeight: { portrait: 270, landscape: 205 },
    contentKind: "flow",
  },
  {
    id: "chevron_pipeline",
    rendererKey: "chevron_pipeline",
    preferredSpan: "half",
    minItems: 2,
    maxItems: 8,
    minHeight: { portrait: 120, landscape: 90 },
    preferredHeight: { portrait: 170, landscape: 130 },
    contentKind: "pipeline",
  },
  {
    id: "gantt_roadmap",
    rendererKey: "gantt_roadmap",
    preferredSpan: "full",
    minItems: 2,
    maxItems: 12,
    minHeight: { portrait: 180, landscape: 135 },
    preferredHeight: { portrait: 240, landscape: 180 },
    contentKind: "roadmap",
  },
  // 아래 8개는 이미 동작하는 렌더러인데 블록 타입으로 등록되지 않아 block_pool_auto가
  // 거부했다. 등록 전에는 로드맵을 뺀 5개 타입만 남아, 최소 5블록 규칙과 맞물려
  // 어떤 요구사항이든 같은 타입 조합이 강제되고 장표가 서로 구분되지 않았다.
  // 내용 단위마다 어울리는 그릇을 고를 수 있도록 풀을 넓힌다.
  { id: "process_grid", rendererKey: "process_grid", preferredSpan: "full", minItems: 2, maxItems: 8, minHeight: { portrait: 170, landscape: 130 }, preferredHeight: { portrait: 240, landscape: 180 }, contentKind: "labels" },
  { id: "comparison", rendererKey: "comparison", preferredSpan: "full", minItems: 2, maxItems: 4, minHeight: { portrait: 160, landscape: 120 }, preferredHeight: { portrait: 230, landscape: 175 }, contentKind: "labels" },
  { id: "mapping", rendererKey: "mapping", preferredSpan: "half", minItems: 4, maxItems: 6, minHeight: { portrait: 140, landscape: 105 }, preferredHeight: { portrait: 190, landscape: 145 }, contentKind: "labels" },
  { id: "feedback_loop", rendererKey: "feedback_loop", preferredSpan: "half", minItems: 4, maxItems: 5, minHeight: { portrait: 150, landscape: 115 }, preferredHeight: { portrait: 200, landscape: 155 }, contentKind: "labels" },
  { id: "quality_gate", rendererKey: "quality_gate", preferredSpan: "full", minItems: 4, maxItems: 6, minHeight: { portrait: 150, landscape: 115 }, preferredHeight: { portrait: 210, landscape: 160 }, contentKind: "labels" },
  { id: "swimlane", rendererKey: "swimlane", preferredSpan: "full", minItems: 4, maxItems: 6, minHeight: { portrait: 160, landscape: 120 }, preferredHeight: { portrait: 220, landscape: 165 }, contentKind: "labels" },
  { id: "hub_spoke", rendererKey: "hub_spoke", preferredSpan: "half", minItems: 6, maxItems: 9, minHeight: { portrait: 150, landscape: 115 }, preferredHeight: { portrait: 200, landscape: 155 }, contentKind: "labels" },
  { id: "architecture", rendererKey: "architecture", preferredSpan: "full", minItems: 4, maxItems: 5, minHeight: { portrait: 180, landscape: 135 }, preferredHeight: { portrait: 250, landscape: 190 }, contentKind: "labels" },
];

const DEFINITIONS_BY_ID = new Map(BLOCK_TYPE_DEFINITIONS.map((definition) => [definition.id, definition]));

function requireContent(type, content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw new TypeError(`${type} content must be an object`);
  }
}

function stringValue(value, type, field, index = null) {
  const name = index == null ? `${type} ${field}` : `${type} ${field}[${index}]`;
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}

function stringArray(content, type, field, min, max) {
  if (!Array.isArray(content[field])) throw new TypeError(`${type} ${field} must be an array`);
  const values = content[field].filter((value) => typeof value !== "string" || value.trim()).map((value, index) => stringValue(value, type, field, index));
  if (values.length < min || values.length > max) {
    throw new RangeError(`${type} ${field} must contain ${min} to ${max} items; found ${values.length}`);
  }
  return values;
}

function optionalStringArray(content, type, field, max) {
  if (content[field] == null) return [];
  if (!Array.isArray(content[field])) throw new TypeError(`${type} ${field} must be an array`);
  const values = content[field].filter((value) => typeof value !== "string" || value.trim()).map((value, index) => stringValue(value, type, field, index));
  if (values.length > max) throw new RangeError(`${type} ${field} must contain at most ${max} items; found ${values.length}`);
  return values;
}

function labelItem(value, type, field, index) {
  if (typeof value === "string") return { label: stringValue(value, type, field, index) };
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${type} ${field}[${index}] must be a string or object`);
  return { ...structuredClone(value), label: stringValue(value.label, type, `${field}[${index}].label`) };
}

function labelItems(content, type, field, min, max) {
  if (!Array.isArray(content[field])) throw new TypeError(`${type} ${field} must be an array`);
  const values = content[field].filter((value) => !(typeof value === "string" && !value.trim())).map((value, index) => labelItem(value, type, field, index));
  if (values.length < min || values.length > max) {
    throw new RangeError(`${type} ${field} must contain ${min} to ${max} items; found ${values.length}`);
  }
  return values;
}

function validateMatrixTable(content) {
  const columns = stringArray(content, "matrix_table", "columns", 2, 5);
  if (!Array.isArray(content.rows)) throw new TypeError("matrix_table rows must be an array");
  const rows = content.rows.filter(Boolean).map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new TypeError(`matrix_table rows[${index}] must be an object`);
    const cells = Array.isArray(row.cells)
      ? row.cells.filter((cell) => typeof cell !== "string" || cell.trim()).map((cell, cellIndex) => stringValue(cell, "matrix_table", `rows[${index}].cells`, cellIndex))
      : null;
    if (!cells || cells.length !== columns.length - 1) {
      throw new RangeError(`matrix_table rows[${index}].cells must contain ${columns.length - 1} items for ${columns.length} columns`);
    }
    return { ...structuredClone(row), label: stringValue(row.label, "matrix_table", `rows[${index}].label`), cells };
  });
  if (rows.length < 1 || rows.length > 10) throw new RangeError(`matrix_table rows must contain 1 to 10 items; found ${rows.length}`);
  return { ...structuredClone(content), columns, rows };
}

function validateMetricDashboard(content) {
  if (!Array.isArray(content.metrics)) throw new TypeError("metric_dashboard metrics must be an array");
  const metrics = content.metrics.filter(Boolean).map((metric, index) => {
    if (!metric || typeof metric !== "object" || Array.isArray(metric)) throw new TypeError(`metric_dashboard metrics[${index}] must be an object`);
    const normalized = {
      ...structuredClone(metric),
      label: stringValue(metric.label, "metric_dashboard", `metrics[${index}].label`),
      value_text: stringValue(metric.value_text, "metric_dashboard", `metrics[${index}].value_text`),
    };
    for (const field of ["delta_text", "target_text"]) {
      if (metric[field] != null) normalized[field] = stringValue(metric[field], "metric_dashboard", `metrics[${index}].${field}`);
    }
    return normalized;
  });
  if (metrics.length < 1 || metrics.length > 6) throw new RangeError(`metric_dashboard metrics must contain 1 to 6 items; found ${metrics.length}`);
  return { ...structuredClone(content), metrics };
}

function validateScopeOutcomeMapping(content) {
  const left = labelItems(content, "scope_outcome_mapping", "left", 1, 6);
  const right = labelItems(content, "scope_outcome_mapping", "right", 1, 6);
  let links = [];
  if (content.links != null) {
    if (!Array.isArray(content.links)) throw new TypeError("scope_outcome_mapping links must be an array");
    links = content.links.map((link, index) => {
      if (!link || typeof link !== "object" || Array.isArray(link)) throw new TypeError(`scope_outcome_mapping links[${index}] must be an object`);
      const from = link.from;
      const to = link.to;
      if (!Number.isInteger(from) || from < 0 || from >= left.length) throw new RangeError(`scope_outcome_mapping links[${index}].from is outside left item range`);
      if (!Number.isInteger(to) || to < 0 || to >= right.length) throw new RangeError(`scope_outcome_mapping links[${index}].to is outside right item range`);
      return { ...structuredClone(link), from, to };
    });
  }
  return { ...structuredClone(content), left, right, links };
}

function validateBlueprintFlow(content) {
  const inputs = stringArray(content, "blueprint_flow", "inputs", 1, 3);
  const steps = stringArray(content, "blueprint_flow", "steps", 2, 8);
  const stepDetails = optionalStringArray(content, "blueprint_flow", "step_details", steps.length);
  if (stepDetails.length && stepDetails.length !== steps.length) {
    throw new RangeError(`blueprint_flow step_details must contain exactly ${steps.length} items to match steps`);
  }
  const outputs = stringArray(content, "blueprint_flow", "outputs", 1, 3);
  const tools = optionalStringArray(content, "blueprint_flow", "tools", 6);
  const fallbacks = optionalStringArray(content, "blueprint_flow", "fallbacks", 6);
  return { ...structuredClone(content), inputs, steps, step_details: stepDetails, tools, outputs, fallbacks };
}

function validateChevronPipeline(content) {
  const steps = stringArray(content, "chevron_pipeline", "steps", 2, 8);
  const criteria = optionalStringArray(content, "chevron_pipeline", "criteria", steps.length);
  const gates = optionalStringArray(content, "chevron_pipeline", "gates", steps.length);
  return { ...structuredClone(content), steps, criteria, gates };
}

function validateGanttRoadmap(content) {
  const timeUnits = stringArray(content, "gantt_roadmap", "time_units", 2, 12);
  if (!Array.isArray(content.rows)) throw new TypeError("gantt_roadmap rows must be an array");
  const rows = content.rows.filter(Boolean).map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new TypeError(`gantt_roadmap rows[${index}] must be an object`);
    if (!Number.isInteger(row.start) || !Number.isInteger(row.end) || row.start < 0 || row.end > timeUnits.length || row.start >= row.end) {
      throw new RangeError(`gantt_roadmap rows[${index}] must have start < end within time_units`);
    }
    return { ...structuredClone(row), label: stringValue(row.label, "gantt_roadmap", `rows[${index}].label`) };
  });
  if (rows.length < 1 || rows.length > 12) throw new RangeError(`gantt_roadmap rows must contain 1 to 12 items; found ${rows.length}`);
  const milestones = content.milestones == null ? [] : content.milestones.map((milestone, index) => {
    if (!milestone || typeof milestone !== "object" || Array.isArray(milestone)) throw new TypeError(`gantt_roadmap milestones[${index}] must be an object`);
    const at = milestone.at ?? milestone.index;
    if (!Number.isInteger(at) || at < 0 || at >= timeUnits.length) throw new RangeError(`gantt_roadmap milestones[${index}].at is outside time_units`);
    return { ...structuredClone(milestone), at, label: milestone.label == null ? "" : stringValue(milestone.label, "gantt_roadmap", `milestones[${index}].label`) };
  });
  return { ...structuredClone(content), time_units: timeUnits, rows, milestones };
}

export function getBlockTypeDefinition(type) {
  if (typeof type !== "string") return null;
  const definition = DEFINITIONS_BY_ID.get(type.trim());
  return definition ? structuredClone(definition) : null;
}

export function listBlockTypeDefinitions() {
  return structuredClone(BLOCK_TYPE_DEFINITIONS);
}

// 라벨형 블록은 렌더러가 labelsFor()로 steps·options·diagram_labels·bullets 중
// 먼저 채워진 것을 읽는다. 어느 하나만 타입이 요구하는 개수만큼 있으면 된다.
function validateLabelBlock(type, content) {
  const definition = DEFINITIONS_BY_ID.get(type);
  const normalized = structuredClone(content);
  normalized.headline = stringValue(content.headline, type, "headline");
  const sources = ["steps", "diagram_labels", "bullets"];
  const filled = sources.filter((field) => Array.isArray(content[field]) && content[field].length);
  const optionLabels = Array.isArray(content.options)
    ? content.options.map((option) => option?.label ?? option?.summary).filter((value) => typeof value === "string" && value.trim())
    : [];
  if (!filled.length && !optionLabels.length) {
    throw new TypeError(`${type} content must provide one of steps, options, diagram_labels, or bullets`);
  }
  const count = filled.length ? content[filled[0]].filter(Boolean).length : optionLabels.length;
  if (count < definition.minItems || count > definition.maxItems) {
    throw new RangeError(`${type} must contain ${definition.minItems} to ${definition.maxItems} items; found ${count}`);
  }
  for (const field of filled) normalized[field] = stringArray(content, type, field, 1, definition.maxItems);
  return normalized;
}

export function validateBlockTypeContent(type, content) {
  const normalizedType = typeof type === "string" ? type.trim() : "";
  if (!DEFINITIONS_BY_ID.has(normalizedType)) throw new TypeError(`Unknown block type ${type}`);
  requireContent(normalizedType, content);
  if (normalizedType === "matrix_table") return validateMatrixTable(content);
  if (normalizedType === "metric_dashboard") return validateMetricDashboard(content);
  if (normalizedType === "scope_outcome_mapping") return validateScopeOutcomeMapping(content);
  if (normalizedType === "blueprint_flow") return validateBlueprintFlow(content);
  if (normalizedType === "chevron_pipeline") return validateChevronPipeline(content);
  if (normalizedType === "gantt_roadmap") return validateGanttRoadmap(content);
  return validateLabelBlock(normalizedType, content);
}
