const SUPPORTED_RENDERERS = new Set([
  "process_grid",
  "comparison",
  "mapping",
  "feedback_loop",
  "quality_gate",
  "hub_spoke",
  "swimlane",
  "architecture",
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
  };
  const primitives = builders[rendererKey](block, frame, theme);
  const requiredMotifs = REQUIRED_MOTIFS[rendererKey];
  const producedMotifs = [...requiredMotifs];
  const structureFingerprint = `${rendererKey}|${producedMotifs.join(",")}|${primitives.map((item) => `${item.kind}:${item.name.split(":")[0]}`).join(";")}`;
  return { rendererKey, requiredMotifs, producedMotifs, structureFingerprint, primitives };
}
