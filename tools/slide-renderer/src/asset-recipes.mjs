import { explanationBandHeight } from "./block-types.mjs";

const SUPPORTED_RENDERERS = new Set([
  "process_grid",
  "comparison",
  "mapping",
  "feedback_loop",
  "quality_gate",
  "hub_spoke",
  "swimlane",
  "architecture",
  "matrix_table",
  "metric_dashboard",
  "scope_outcome_mapping",
  "blueprint_flow",
  "chevron_pipeline",
  "gantt_roadmap",
]);

const REQUIRED_MOTIFS = {
  process_grid: ["ordered_steps", "directional_connectors"],
  comparison: ["comparison_axes", "central_relation"],
  mapping: ["source_node", "mapped_list", "mapping_connectors"],
  feedback_loop: ["central_loop", "stage_nodes", "return_connector"],
  quality_gate: ["stage_lanes", "stage_gate", "handoff_connector"],
  hub_spoke: ["central_hub", "radial_nodes", "radial_spokes"],
  swimlane: ["parallel_lanes", "lane_headers", "handoff_connector"],
  architecture: ["layered_architecture", "gateway", "control_loop"],
  matrix_table: ["table_header", "table_cells", "row_labels"],
  metric_dashboard: ["metric_tiles", "metric_values", "metric_labels"],
  scope_outcome_mapping: ["scope_nodes", "outcome_nodes", "mapping_connectors"],
  blueprint_flow: ["input_band", "process_steps", "directional_connectors", "output_band"],
  chevron_pipeline: ["chevron_steps", "validation_row"],
  gantt_roadmap: ["timeline_header", "schedule_bars", "milestones"],
};

export function resolveRendererKey(mapping, catalogItem) {
  const explicit = typeof mapping?.renderer_key === "string" ? mapping.renderer_key.trim() : "";
  if (explicit) return SUPPORTED_RENDERERS.has(explicit) ? explicit : null;
  const moduleType = String(catalogItem?.module_type ?? "").toLowerCase();
  const tags = [...(catalogItem?.visual_tags ?? []), ...(catalogItem?.semantic_tags ?? [])].map((tag) => String(tag).toLowerCase());
  if (moduleType === "feedback_loop" || tags.includes("circular-flow")) return "feedback_loop";
  if (moduleType === "hub_spoke" || tags.some((tag) => tag.includes("wheel"))) return "hub_spoke";
  if (moduleType === "swimlane" && tags.some((tag) => tag.includes("quality-gate"))) return "quality_gate";
  if (moduleType === "swimlane") return "swimlane";
  if (moduleType === "metric_bars") return "metric_dashboard";
  if (moduleType === "before_after_metric_table") return "matrix_table";
  if (moduleType === "parallel_rows" || moduleType === "comparison_flow") return "scope_outcome_mapping";
  if (moduleType === "system_flow") return "blueprint_flow";
  if (moduleType === "chevron_process") return "chevron_pipeline";
  if (moduleType === "gantt") return "gantt_roadmap";
  if (moduleType.includes("comparison")) return "comparison";
  if (moduleType.includes("mapping")) return "mapping";
  if (moduleType.includes("architecture")) return "architecture";
  if (moduleType.includes("process") || moduleType.includes("chevron") || moduleType.includes("timeline") || moduleType.includes("chain")) return "process_grid";
  return null;
}
function primitive(kind, name, position, style = {}, text = "") {
  return { kind, name, position, ...style, ...(text ? { text } : {}) };
}

function labelsFor(block, minimum = 2) {
  const values = block.steps?.length
    ? block.steps
    : block.options?.length
      ? block.options.map((option) => option.label ?? option.summary)
      : block.content?.diagram_labels?.length
        ? block.content.diagram_labels
        : block.content?.bullets ?? [];
  const labels = values.map((value) => String(value)).filter(Boolean);
  while (labels.length < minimum) labels.push(`영역 ${labels.length + 1}`);
  return labels;
}

function titlePrimitive(block, frame, theme) {
  return primitive("text", `asset-title:${block.blockId}`, { left: frame.left + 12, top: frame.top + 8, width: frame.width - 24, height: 24 }, { color: theme.navy, fontSize: 17, bold: true }, block.content?.headline ?? "");
}

function explanationText(block) {
  return typeof block.content?.explanation === "string" ? block.content.explanation.trim() : "";
}

function explanationPrimitives(block, frame, theme) {
  const explanation = explanationText(block);
  if (!explanation) return [];
  const explanationHeight = explanationBandHeight(explanation, frame.width);
  const band = {
    left: frame.left + 12,
    top: frame.top + frame.height - explanationHeight + 4,
    width: frame.width - 24,
    height: explanationHeight - 8,
  };
  return [
    primitive("roundRect", `explanation-band:${block.blockId}`, band, { fill: theme.surface, stroke: theme.line }),
    primitive("rect", `explanation-rule:${block.blockId}`, { left: band.left + 8, top: band.top + 6, width: 3, height: band.height - 12 }, { fill: theme.accent, stroke: theme.accent }),
    primitive("text", `explanation:${block.blockId}`, { left: band.left + 18, top: band.top + 5, width: band.width - 26, height: band.height - 8 }, { color: theme.gray, fontSize: 10 }, explanation),
  ];
}

function processRecipe(block, frame, theme) {
  const labels = labelsFor(block);
  const primitives = [titlePrimitive(block, frame, theme)];
  const gap = 10;
  const columns = Math.min(3, labels.length);
  const rows = Math.ceil(labels.length / columns);
  const inner = { left: frame.left + 12, top: frame.top + 46, width: frame.width - 24, height: frame.height - 58 };
  const width = (inner.width - gap * (columns - 1)) / columns;
  const height = (inner.height - gap * (rows - 1)) / rows;
  labels.forEach((label, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const box = { left: inner.left + column * (width + gap), top: inner.top + row * (height + gap), width, height };
    primitives.push(primitive("roundRect", `ordered-step:${index + 1}`, box, { fill: theme.pale, stroke: theme.accent }));
    primitives.push(primitive("text", `ordered-step-label:${index + 1}`, { left: box.left + 8, top: box.top + 12, width: box.width - 16, height: box.height - 20 }, { color: theme.navy, fontSize: 14, bold: true, alignment: "center" }, `${index + 1}. ${label}`));
    if (column > 0) primitives.push(primitive("rect", `directional-connector:${index}`, { left: box.left - gap, top: box.top + box.height / 2 - 1, width: gap, height: 2 }, { fill: theme.primary, stroke: theme.primary }));
  });
  return primitives;
}

function feedbackRecipe(block, frame, theme) {
  const labels = labelsFor(block, 4).slice(0, 5);
  const primitives = [titlePrimitive(block, frame, theme)];
  const center = { x: frame.left + frame.width / 2, y: frame.top + frame.height / 2 + 16 };
  const radiusX = frame.width * 0.32;
  const radiusY = frame.height * 0.29;
  primitives.push(primitive("ellipse", "central-loop", { left: center.x - 46, top: center.y - 28, width: 92, height: 56 }, { fill: theme.navy, stroke: theme.navy }));
  primitives.push(primitive("text", "central-loop-label", { left: center.x - 40, top: center.y - 10, width: 80, height: 22 }, { color: theme.white, fontSize: 13, bold: true, alignment: "center" }, "품질 환류"));
  labels.forEach((label, index) => {
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / labels.length);
    const x = center.x + Math.cos(angle) * radiusX;
    const y = center.y + Math.sin(angle) * radiusY;
    primitives.push(primitive("ellipse", `stage-node:${index + 1}`, { left: x - 38, top: y - 24, width: 76, height: 48 }, { fill: index === 0 ? theme.primary : theme.pale, stroke: theme.primary }));
    primitives.push(primitive("text", `stage-label:${index + 1}`, { left: x - 32, top: y - 9, width: 64, height: 22 }, { color: index === 0 ? theme.white : theme.navy, fontSize: 12, bold: true, alignment: "center" }, label));
  });
  primitives.push(primitive("ellipse", "return-connector", { left: center.x - radiusX - 18, top: center.y - radiusY - 18, width: radiusX * 2 + 36, height: radiusY * 2 + 36 }, { fill: "none", stroke: theme.accent, lineWidth: 3 }));
  return primitives;
}

function gateRecipe(block, frame, theme, swimlane = false) {
  const labels = labelsFor(block, 4).slice(0, 6);
  const primitives = [titlePrimitive(block, frame, theme)];
  const top = frame.top + 48;
  const gap = 8;
  const laneHeight = (frame.height - 62 - gap * (labels.length - 1)) / labels.length;
  labels.forEach((label, index) => {
    const y = top + index * (laneHeight + gap);
    primitives.push(primitive("rect", `parallel-lane:${index + 1}`, { left: frame.left + 16, top: y, width: frame.width - 32, height: laneHeight }, { fill: index % 2 ? theme.surface : theme.pale, stroke: theme.line }));
    primitives.push(primitive("rect", `lane-header:${index + 1}`, { left: frame.left + 16, top: y, width: 96, height: laneHeight }, { fill: theme.navy, stroke: theme.navy }));
    primitives.push(primitive("text", `lane-label:${index + 1}`, { left: frame.left + 24, top: y + 8, width: 80, height: laneHeight - 12 }, { color: theme.white, fontSize: 12, bold: true, alignment: "center" }, label));
    if (!swimlane) primitives.push(primitive("diamond", `stage-gate:${index + 1}`, { left: frame.left + frame.width - 72, top: y + Math.max(2, laneHeight / 2 - 14), width: 28, height: 28 }, { fill: theme.primary, stroke: theme.primary }));
  });
  primitives.push(primitive("rect", "handoff-connector", { left: frame.left + 128, top: top + 10, width: 3, height: Math.max(8, frame.height - 92) }, { fill: theme.accent, stroke: theme.accent }));
  return primitives;
}

function hubRecipe(block, frame, theme) {
  const labels = labelsFor(block, 6).slice(0, 9);
  const primitives = [titlePrimitive(block, frame, theme)];
  const center = { x: frame.left + frame.width / 2, y: frame.top + frame.height / 2 + 14 };
  primitives.push(primitive("ellipse", "central-hub", { left: center.x - 54, top: center.y - 34, width: 108, height: 68 }, { fill: theme.navy, stroke: theme.navy }));
  primitives.push(primitive("text", "central-hub-label", { left: center.x - 44, top: center.y - 10, width: 88, height: 24 }, { color: theme.white, fontSize: 14, bold: true, alignment: "center" }, block.content?.headline ?? "통합 허브"));
  labels.forEach((label, index) => {
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / labels.length);
    const x = center.x + Math.cos(angle) * frame.width * 0.34;
    const y = center.y + Math.sin(angle) * frame.height * 0.31;
    primitives.push(primitive("ellipse", `radial-node:${index + 1}`, { left: x - 34, top: y - 22, width: 68, height: 44 }, { fill: theme.pale, stroke: theme.primary }));
    primitives.push(primitive("text", `radial-label:${index + 1}`, { left: x - 30, top: y - 8, width: 60, height: 20 }, { color: theme.navy, fontSize: 11, bold: true, alignment: "center" }, label));
    const horizontal = Math.abs(x - center.x) >= Math.abs(y - center.y);
    primitives.push(primitive("rect", `radial-spoke:${index + 1}`, horizontal
      ? { left: Math.min(x, center.x), top: center.y - 1, width: Math.abs(x - center.x), height: 2 }
      : { left: center.x - 1, top: Math.min(y, center.y), width: 2, height: Math.abs(y - center.y) }, { fill: theme.accent, stroke: theme.accent }));
  });
  return primitives;
}

function mappingRecipe(block, frame, theme) {
  const labels = labelsFor(block, 4).slice(0, 6);
  const primitives = [titlePrimitive(block, frame, theme)];
  const circle = { left: frame.left + 28, top: frame.top + frame.height / 2 - 52, width: 104, height: 104 };
  primitives.push(primitive("ellipse", "source-node", circle, { fill: theme.primary, stroke: theme.primary }));
  primitives.push(primitive("text", "source-node-label", { left: circle.left + 12, top: circle.top + 36, width: 80, height: 32 }, { color: theme.white, fontSize: 13, bold: true, alignment: "center" }, block.content?.headline ?? "핵심"));
  const listLeft = frame.left + frame.width * 0.42;
  const rowHeight = (frame.height - 62) / labels.length;
  labels.forEach((label, index) => {
    const y = frame.top + 46 + index * rowHeight;
    primitives.push(primitive("text", `mapped-list:${index + 1}`, { left: listLeft, top: y, width: frame.width - (listLeft - frame.left) - 18, height: rowHeight - 4 }, { color: theme.navy, fontSize: 13, bold: index === 0 }, `${index + 1}. ${label}`));
    primitives.push(primitive("rect", `mapping-connector:${index + 1}`, { left: circle.left + circle.width, top: circle.top + circle.height / 2 - 1, width: listLeft - circle.left - circle.width - 8, height: 2 }, { fill: theme.accent, stroke: theme.accent }));
  });
  return primitives;
}

function itemLabel(item) {
  return typeof item === "string" ? item : item?.label ?? item?.name ?? "";
}

function listText(items, prefix = "· ") {
  return items.map(itemLabel).filter(Boolean).map((item) => `${prefix}${item}`).join("\n");
}

function detailText(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => /^[•·]/.test(line) ? line : `· ${line}`)
    .join("\n");
}

function multilineHeight(value) {
  const lineCount = Math.max(1, String(value ?? "").split(/\r?\n/).length);
  return Math.max(24, 10 + lineCount * 12);
}

function matrixTableRecipe(block, frame, theme) {
  const columns = block.content?.columns ?? ["구분", "내용"];
  const rows = block.content?.rows ?? [];
  const hasConclusion = Boolean(block.content?.conclusion);
  const primitives = [titlePrimitive(block, frame, theme)];
  const inner = { left: frame.left + 12, top: frame.top + 42, width: frame.width - 24, height: frame.height - (hasConclusion ? 72 : 54) };
  const headerHeight = Math.min(30, inner.height * 0.25);
  const rowHeight = Math.max(8, (inner.height - headerHeight) / Math.max(1, rows.length));
  const columnWidth = inner.width / columns.length;
  columns.forEach((column, index) => {
    const cell = { left: inner.left + index * columnWidth, top: inner.top, width: columnWidth, height: headerHeight };
    primitives.push(primitive("rect", `table-header:${index + 1}`, cell, { fill: theme.navy, stroke: theme.white }));
    primitives.push(primitive("text", `table-header-label:${index + 1}`, { left: cell.left + 5, top: cell.top + 5, width: cell.width - 10, height: Math.max(6, cell.height - 8) }, { color: theme.white, fontSize: 11, bold: true, alignment: "center" }, column));
  });
  rows.forEach((row, rowIndex) => {
    const values = [row.label, ...(row.cells ?? [])];
    values.slice(0, columns.length).forEach((value, columnIndex) => {
      const cell = { left: inner.left + columnIndex * columnWidth, top: inner.top + headerHeight + rowIndex * rowHeight, width: columnWidth, height: rowHeight };
      primitives.push(primitive("rect", `table-cell:${rowIndex + 1}:${columnIndex + 1}`, cell, { fill: columnIndex === 0 ? theme.pale : rowIndex % 2 ? theme.surface : theme.white, stroke: theme.line }));
      primitives.push(primitive("text", `table-cell-label:${rowIndex + 1}:${columnIndex + 1}`, { left: cell.left + 5, top: cell.top + 3, width: cell.width - 10, height: Math.max(6, cell.height - 5) }, { color: theme.navy, fontSize: 10, bold: columnIndex === 0, alignment: columnIndex === 0 ? "center" : "left" }, value));
    });
  });
  if (block.content?.conclusion) {
    primitives.push(primitive("text", "table-conclusion", { left: frame.left + 14, top: frame.top + frame.height - 20, width: frame.width - 28, height: 14 }, { color: theme.gray, fontSize: 9, bold: true }, block.content.conclusion));
  }
  return primitives;
}

function metricDashboardRecipe(block, frame, theme) {
  const metrics = block.content?.metrics ?? [];
  const primitives = [titlePrimitive(block, frame, theme)];
  const columns = metrics.length > 4 ? 3 : 2;
  const rows = Math.ceil(metrics.length / columns);
  const gap = 10;
  const inner = { left: frame.left + 12, top: frame.top + 42, width: frame.width - 24, height: frame.height - 54 };
  const tileWidth = (inner.width - gap * (columns - 1)) / columns;
  const tileHeight = Math.max(18, (inner.height - gap * (rows - 1)) / Math.max(1, rows));
  metrics.forEach((metric, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const tile = { left: inner.left + column * (tileWidth + gap), top: inner.top + row * (tileHeight + gap), width: tileWidth, height: tileHeight };
    primitives.push(primitive("roundRect", `metric-tile:${index + 1}`, tile, { fill: index === 0 ? theme.pale : theme.surface, stroke: theme.accent }));
    primitives.push(primitive("text", `metric-label:${index + 1}`, { left: tile.left + 8, top: tile.top + 6, width: tile.width - 16, height: 16 }, { color: theme.gray, fontSize: 10, bold: true }, metric.label));
    primitives.push(primitive("text", `metric-value:${index + 1}`, { left: tile.left + 8, top: tile.top + 23, width: tile.width - 16, height: Math.max(8, tile.height - 42) }, { color: theme.navy, fontSize: 18, bold: true }, metric.value_text));
    const detail = [metric.delta_text, metric.target_text].filter(Boolean).join(" · ");
    if (detail) primitives.push(primitive("text", `metric-detail:${index + 1}`, { left: tile.left + 8, top: tile.top + tile.height - 16, width: tile.width - 16, height: 12 }, { color: theme.blue ?? theme.primary, fontSize: 9, bold: true }, detail));
  });
  return primitives;
}

function scopeOutcomeMappingRecipe(block, frame, theme) {
  const left = block.content?.left ?? [];
  const right = block.content?.right ?? [];
  const links = block.content?.links?.length ? block.content.links : left.map((_, index) => ({ from: index, to: Math.min(index, right.length - 1) }));
  const primitives = [titlePrimitive(block, frame, theme)];
  const gap = 6;
  const nodeHeight = (height, count) => Math.max(10, (height - gap * Math.max(0, count - 1)) / Math.max(1, count));
  const nodeTop = frame.top + 44;
  const nodeAreaHeight = frame.height - 58;
  const leftWidth = frame.width * 0.31;
  const rightWidth = frame.width * 0.31;
  const leftX = frame.left + 12;
  const rightX = frame.left + frame.width - rightWidth - 12;
  const leftHeight = nodeHeight(nodeAreaHeight, left.length);
  const rightHeight = nodeHeight(nodeAreaHeight, right.length);
  const leftCenters = left.map((_, index) => nodeTop + index * (leftHeight + gap) + leftHeight / 2);
  const rightCenters = right.map((_, index) => nodeTop + index * (rightHeight + gap) + rightHeight / 2);
  links.forEach((link, index) => {
    const from = leftCenters[link.from];
    const to = rightCenters[link.to];
    if (from == null || to == null) return;
    const centerX = (leftX + leftWidth + rightX) / 2;
    primitives.push(primitive("rect", `mapping-connector:${index + 1}`, { left: leftX + leftWidth, top: (from + to) / 2 - 1, width: rightX - leftX - leftWidth, height: 2 }, { fill: theme.accent, stroke: theme.accent }));
    if (Math.abs(from - to) > 1) primitives.push(primitive("rect", `mapping-connector-vertical:${index + 1}`, { left: centerX - 1, top: Math.min(from, to), width: 2, height: Math.abs(from - to) }, { fill: theme.accent, stroke: theme.accent }));
  });
  left.forEach((item, index) => {
    const node = { left: leftX, top: nodeTop + index * (leftHeight + gap), width: leftWidth, height: leftHeight };
    primitives.push(primitive("roundRect", `scope-node:${index + 1}`, node, { fill: theme.primary, stroke: theme.primary }));
    primitives.push(primitive("text", `scope-node-label:${index + 1}`, { left: node.left + 6, top: node.top + 4, width: node.width - 12, height: Math.max(6, node.height - 8) }, { color: theme.white, fontSize: 10, bold: true, alignment: "center" }, itemLabel(item)));
  });
  right.forEach((item, index) => {
    const node = { left: rightX, top: nodeTop + index * (rightHeight + gap), width: rightWidth, height: rightHeight };
    primitives.push(primitive("roundRect", `outcome-node:${index + 1}`, node, { fill: theme.pale, stroke: theme.primary }));
    primitives.push(primitive("text", `outcome-node-label:${index + 1}`, { left: node.left + 6, top: node.top + 4, width: node.width - 12, height: Math.max(6, node.height - 8) }, { color: theme.navy, fontSize: 10, bold: true, alignment: "center" }, itemLabel(item)));
  });
  return primitives;
}

function bandPrimitive(primitives, name, label, value, frame, top, theme, fill) {
  const box = { left: frame.left + 12, top, width: frame.width - 24, height: multilineHeight(value) };
  primitives.push(primitive("roundRect", `${name}-band`, box, { fill, stroke: theme.line }));
  primitives.push(primitive("text", `${name}-band-label`, { left: box.left + 8, top: box.top + Math.max(5, (box.height - 12) / 2), width: 76, height: 12 }, { color: theme.navy, fontSize: 9, bold: true }, label));
  primitives.push(primitive("text", `${name}-band-value`, { left: box.left + 84, top: box.top + 5, width: box.width - 92, height: box.height - 8 }, { color: theme.ink, fontSize: 9 }, value));
  return box.height;
}

function blueprintFlowRecipe(block, frame, theme) {
  const inputs = block.content?.inputs ?? [];
  const steps = block.content?.steps ?? [];
  const stepDetails = block.content?.step_details ?? [];
  const tools = block.content?.tools ?? [];
  const outputs = block.content?.outputs ?? [];
  const fallbacks = block.content?.fallbacks ?? [];
  const primitives = [titlePrimitive(block, frame, theme)];
  const inputValue = listText(inputs);
  const inputTop = frame.top + 40;
  const inputHeight = bandPrimitive(primitives, "input", "입력", inputValue, frame, inputTop, theme, theme.pale);
  const toolValue = listText(tools.length ? tools : ["분석 엔진"]);
  const toolTop = inputTop + inputHeight + 4;
  const toolHeight = bandPrimitive(primitives, "tool", "도구·모델", toolValue, frame, toolTop, theme, theme.surface);
  const columns = Math.min(4, Math.max(1, steps.length));
  const rows = Math.ceil(steps.length / columns);
  const gap = 7;
  const stepTop = toolTop + toolHeight + 8;
  const outputItems = [...outputs, ...fallbacks.map((item) => ({ label: `장애 대응: ${itemLabel(item)}` }))];
  const outputValue = listText(outputItems);
  const outputHeight = multilineHeight(outputValue);
  const outputTop = frame.top + frame.height - outputHeight - 4;
  const stepHeight = Math.max(24, (outputTop - stepTop - gap * (rows - 1)) / Math.max(1, rows));
  const innerWidth = frame.width - 24;
  const stepWidth = (innerWidth - gap * (columns - 1)) / columns;
  steps.forEach((step, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const box = { left: frame.left + 12 + column * (stepWidth + gap), top: stepTop + row * (stepHeight + gap), width: stepWidth, height: stepHeight };
    primitives.push(primitive("roundRect", `process-step:${index + 1}`, box, { fill: index === 0 ? theme.primary : theme.pale, stroke: theme.accent }));
    const labelColor = index === 0 ? theme.white : theme.navy;
    const detailColor = index === 0 ? theme.white : theme.ink;
    const detail = detailText(stepDetails[index]);
    primitives.push(primitive("text", `process-step-label:${index + 1}`, { left: box.left + 8, top: box.top + 8, width: box.width - 16, height: detail ? 18 : Math.max(18, box.height - 16) }, { color: labelColor, fontSize: 10, bold: true, alignment: detail ? "left" : "center" }, `${index + 1}. ${itemLabel(step)}`));
    if (detail) primitives.push(primitive("text", `process-step-detail:${index + 1}`, { left: box.left + 8, top: box.top + 30, width: box.width - 16, height: Math.max(12, box.height - 38) }, { color: detailColor, fontSize: 9 }, detail));
    if (column < columns - 1) {
      primitives.push(primitive("rect", `process-connector:${index + 1}`, { left: box.left + box.width + 1, top: box.top + box.height / 2 - 1, width: gap - 2, height: 2 }, { fill: theme.accent, stroke: theme.accent }));
    }
  });
  bandPrimitive(primitives, "output", "결과·대응", outputValue, frame, outputTop, theme, theme.pale);
  return primitives;
}

function chevronPipelineRecipe(block, frame, theme) {
  const steps = block.content?.steps ?? [];
  const criteria = block.content?.criteria ?? [];
  const gates = block.content?.gates ?? [];
  const primitives = [titlePrimitive(block, frame, theme)];
  const gap = 4;
  const inner = { left: frame.left + 12, top: frame.top + 44, width: frame.width - 24, height: Math.max(20, frame.height - 86) };
  const width = (inner.width - gap * (steps.length - 1)) / Math.max(1, steps.length);
  const height = Math.max(18, inner.height);
  steps.forEach((step, index) => {
    const box = { left: inner.left + index * (width + gap), top: inner.top, width, height };
    const fill = index === 0 ? theme.primary : index % 2 ? theme.pale : theme.surface;
    primitives.push(primitive("chevron", `chevron-step:${index + 1}`, box, { fill, stroke: theme.accent }));
    primitives.push(primitive("text", `chevron-step-label:${index + 1}`, { left: box.left + 5, top: box.top + height / 2 - 9, width: box.width - 10, height: 18 }, { color: index === 0 ? theme.white : theme.navy, fontSize: Math.min(12, Math.max(8, width / 18)), bold: true, alignment: "center" }, `${index + 1}. ${itemLabel(step)}`));
  });
  const validation = [...criteria.map((item) => `기준 ${itemLabel(item)}`), ...gates.map((item) => `Gate ${itemLabel(item)}`)].join(" · ");
  if (validation) primitives.push(primitive("text", "validation-row", { left: frame.left + 14, top: frame.top + frame.height - 24, width: frame.width - 28, height: 14 }, { color: theme.gray, fontSize: 9, bold: true }, validation));
  else primitives.push(primitive("text", "validation-row", { left: frame.left + 14, top: frame.top + frame.height - 24, width: frame.width - 28, height: 14 }, { color: theme.gray, fontSize: 9, bold: true }, "검증 기준: 단계별 인수 조건 확인"));
  return primitives;
}

function ganttRoadmapRecipe(block, frame, theme) {
  const timeUnits = block.content?.time_units ?? [];
  const rows = block.content?.rows ?? [];
  const milestones = block.content?.milestones ?? [];
  const primitives = [titlePrimitive(block, frame, theme)];
  const labelWidth = Math.min(150, frame.width * 0.25);
  const gridLeft = frame.left + 12 + labelWidth;
  const gridWidth = frame.width - labelWidth - 24;
  const headerTop = frame.top + 42;
  const headerHeight = 22;
  const rowGap = 4;
  const rowHeight = Math.max(10, (frame.height - 78 - rowGap * Math.max(0, rows.length - 1)) / Math.max(1, rows.length));
  primitives.push(primitive("rect", "timeline-label-header", { left: frame.left + 12, top: headerTop, width: labelWidth, height: headerHeight }, { fill: theme.navy, stroke: theme.white }));
  primitives.push(primitive("text", "timeline-label-header-text", { left: frame.left + 18, top: headerTop + 5, width: labelWidth - 12, height: 12 }, { color: theme.white, fontSize: 10, bold: true }, "작업"));
  timeUnits.forEach((unit, index) => {
    const width = gridWidth / Math.max(1, timeUnits.length);
    const cell = { left: gridLeft + index * width, top: headerTop, width, height: headerHeight };
    primitives.push(primitive("rect", `timeline-header:${index + 1}`, cell, { fill: theme.navy, stroke: theme.white }));
    primitives.push(primitive("text", `timeline-header-label:${index + 1}`, { left: cell.left + 3, top: cell.top + 5, width: cell.width - 6, height: 12 }, { color: theme.white, fontSize: 9, bold: true, alignment: "center" }, unit));
  });
  rows.forEach((row, index) => {
    const top = headerTop + headerHeight + rowGap + index * (rowHeight + rowGap);
    primitives.push(primitive("text", `schedule-row-label:${index + 1}`, { left: frame.left + 16, top: top + 4, width: labelWidth - 16, height: Math.max(6, rowHeight - 8) }, { color: theme.navy, fontSize: 10, bold: true }, row.label));
    const bar = { left: gridLeft + (row.start / timeUnits.length) * gridWidth, top: top + Math.max(1, rowHeight * 0.2), width: ((row.end - row.start) / timeUnits.length) * gridWidth, height: Math.max(8, rowHeight * 0.6) };
    primitives.push(primitive("roundRect", `schedule-bar:${index + 1}`, bar, { fill: index === 0 ? theme.primary : theme.accent, stroke: theme.primary }));
  });
  milestones.forEach((milestone, index) => {
    const at = milestone.at ?? milestone.index;
    const x = gridLeft + (at / timeUnits.length) * gridWidth;
    primitives.push(primitive("diamond", `milestone:${index + 1}`, { left: x - 8, top: frame.top + 34, width: 16, height: 16 }, { fill: theme.primary, stroke: theme.primary }));
  });
  return primitives;
}

function comparisonRecipe(block, frame, theme) {
  const options = block.options?.length >= 2 ? block.options : labelsFor(block, 2).map((label) => ({ label, summary: "" }));
  const primitives = [titlePrimitive(block, frame, theme)];
  const half = frame.width / 2;
  [0, 1].forEach((index) => {
    const left = frame.left + 16 + index * half;
    primitives.push(primitive("roundRect", `comparison-axis:${index + 1}`, { left, top: frame.top + 46, width: half - 32, height: frame.height - 62 }, { fill: index === 0 ? theme.surface : theme.pale, stroke: theme.accent }));
    primitives.push(primitive("text", `comparison-label:${index + 1}`, { left: left + 12, top: frame.top + 62, width: half - 56, height: 28 }, { color: theme.navy, fontSize: 15, bold: true, alignment: "center" }, options[index]?.label ?? `대안 ${index + 1}`));
    primitives.push(primitive("text", `comparison-summary:${index + 1}`, { left: left + 12, top: frame.top + 98, width: half - 56, height: frame.height - 126 }, { color: theme.ink, fontSize: 13, alignment: "center" }, options[index]?.summary ?? ""));
  });
  primitives.push(primitive("ellipse", "central-relation", { left: frame.left + half - 24, top: frame.top + frame.height / 2 - 24, width: 48, height: 48 }, { fill: theme.primary, stroke: theme.primary }));
  primitives.push(primitive("text", "central-relation-label", { left: frame.left + half - 18, top: frame.top + frame.height / 2 - 7, width: 36, height: 18 }, { color: theme.white, fontSize: 13, bold: true, alignment: "center" }, "VS"));
  return primitives;
}

function architectureRecipe(block, frame, theme) {
  const labels = labelsFor(block, 4).slice(0, 5);
  const primitives = [titlePrimitive(block, frame, theme)];
  const top = frame.top + 48;
  const layerHeight = Math.max(30, (frame.height - 82) / labels.length);
  labels.forEach((label, index) => {
    const inset = index * 12;
    primitives.push(primitive("rect", `architecture-layer:${index + 1}`, { left: frame.left + 28 + inset, top: top + index * layerHeight, width: frame.width - 56 - inset * 2, height: layerHeight - 6 }, { fill: index === 0 ? theme.navy : index % 2 ? theme.pale : theme.surface, stroke: theme.accent }));
    primitives.push(primitive("text", `architecture-label:${index + 1}`, { left: frame.left + 42 + inset, top: top + index * layerHeight + 8, width: frame.width - 84 - inset * 2, height: layerHeight - 14 }, { color: index === 0 ? theme.white : theme.navy, fontSize: 13, bold: true, alignment: "center" }, label));
  });
  primitives.push(primitive("diamond", "architecture-gateway", { left: frame.left + frame.width - 82, top: top + 8, width: 42, height: 42 }, { fill: theme.primary, stroke: theme.primary }));
  primitives.push(primitive("rect", "architecture-control-loop", { left: frame.left + 18, top: frame.top + frame.height - 22, width: frame.width - 36, height: 3 }, { fill: theme.accent, stroke: theme.accent }));
  return primitives;
}

export function createAssetRecipe({ rendererKey, block, frame, theme }) {
  if (!SUPPORTED_RENDERERS.has(rendererKey)) throw new Error(`Unsupported asset renderer: ${rendererKey}`);
  const builders = {
    process_grid: processRecipe,
    comparison: comparisonRecipe,
    mapping: mappingRecipe,
    feedback_loop: feedbackRecipe,
    quality_gate: (currentBlock, currentFrame, currentTheme) => gateRecipe(currentBlock, currentFrame, currentTheme, false),
    swimlane: (currentBlock, currentFrame, currentTheme) => gateRecipe(currentBlock, currentFrame, currentTheme, true),
    hub_spoke: hubRecipe,
    architecture: architectureRecipe,
    matrix_table: matrixTableRecipe,
    metric_dashboard: metricDashboardRecipe,
    scope_outcome_mapping: scopeOutcomeMappingRecipe,
    blueprint_flow: blueprintFlowRecipe,
    chevron_pipeline: chevronPipelineRecipe,
    gantt_roadmap: ganttRoadmapRecipe,
  };
  const explanation = explanationText(block);
  const renderFrame = explanation
    ? { ...frame, height: Math.max(40, frame.height - explanationBandHeight(explanation, frame.width)) }
    : frame;
  const primitives = [...builders[rendererKey](block, renderFrame, theme), ...explanationPrimitives(block, frame, theme)];
  const requiredMotifs = REQUIRED_MOTIFS[rendererKey];
  const producedMotifs = [...requiredMotifs];
  const structureFingerprint = `${rendererKey}|${producedMotifs.join(",")}|${primitives.map((item) => `${item.kind}:${item.name.split(":")[0]}`).join(";")}`;
  return { rendererKey, requiredMotifs, producedMotifs, structureFingerprint, primitives };
}
