import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { loadArtifactTool } from "./artifact-tool-runtime.mjs";
import { createAssetRecipe } from "./asset-recipes.mjs";

const { Presentation, PresentationFile } = await loadArtifactTool();

let C = { blue: "#1769E0", navy: "#123B78", accent: "#4A8CF0", pale: "#EEF5FF", pale2: "#F3F6FA", ink: "#172033", gray: "#5F6B7A", line: "#C8D2DF", white: "#FFFFFF" };
const roleTitles = { requirement_summary: "핵심 구현 전략", main_process: "통합 실행 절차", operation_quality: "운영 통제", technology_comparison: "통합 적용 방안", metric_highlight: "핵심 적용 범위" };

async function writeBlob(file, blob) { await fs.writeFile(file, new Uint8Array(await blob.arrayBuffer())); }

function rect(slide, name, position, fill, stroke = fill, rounded = false) {
  return slide.shapes.add({ geometry: rounded ? "roundRect" : "rect", name, position, fill, line: { style: "solid", fill: stroke, width: 1 } });
}
function text(slide, name, value, position, fontSize = 16, color = C.ink, bold = false, alignment = "left") {
  const shape = slide.shapes.add({ geometry: "textbox", name, position, fill: "none", line: { style: "solid", fill: "none", width: 0 } });
  shape.text = String(value ?? "");
  shape.text.style = { fontFamily: "Malgun Gothic", fontSize, color, bold, alignment };
  return shape;
}
function blockTitle(block) { return block.content?.headline || roleTitles[block.role] || block.role; }
function optionDescription(option) { return option.desc ?? option.summary ?? ""; }
function bulletText(block) { return Array.isArray(block.content?.bullets) ? block.content.bullets.map((item) => `• ${item}`).join("\n") : ""; }
async function loadAssets(model, patternRoot) {
  const loaded = [];
  for (const asset of model.selectedAssets) {
    if (!asset.template) throw new Error(`Selected asset ${asset.assetId} has no template path`);
    const source = path.join(patternRoot, asset.template);
    const original = await fs.readFile(source, "utf8");
    loaded.push({
      ...asset,
      source,
      sha256: crypto.createHash("sha256").update(original).digest("hex"),
      renderMode: "native_powerpoint_shapes",
      selected: true,
      loaded: true,
    });
  }
  return loaded;
}
function addHeader(slide, model, page, wireframe) {
  const portrait = model.canvas.orientation === "portrait";
  const suffix = String(page);
  const headerTitle = wireframe ? `청사진 | ${model.title}` : model.title;
  slide.background.fill = C.white;
  rect(slide, `top-rule-${suffix}`, { left: 0, top: 0, width: model.canvas.width, height: 10 }, C.blue);
  text(slide, `eyebrow-${suffix}`, wireframe ? "SLIDE BLUEPRINT · WIREFRAME" : "PROPOSAL SLIDE · ASSET-BASED", { left: portrait ? 36 : 48, top: 26, width: portrait ? 400 : 520, height: 22 }, 13, C.blue, true);
  const titlePosition = { left: portrait ? 36 : 48, top: 56, width: portrait ? 648 : 980, height: portrait ? 70 : 48 };
  if (wireframe) {
    text(slide, `title-${suffix}`, headerTitle, titlePosition, portrait ? 28 : 36, C.navy, true);
  } else {
    const titleShape = rect(slide, `title-${suffix}`, titlePosition, "none", "none");
    titleShape.text = headerTitle;
    titleShape.text.style = { fontFamily: "Malgun Gothic", fontSize: portrait ? 28 : 36, color: C.navy, bold: true, alignment: "left" };
  }
  text(slide, `subtitle-${suffix}`, wireframe ? "내용 구조·배치·asset 매핑 승인용 초안" : (model.governingMessage || model.requirementSummary), { left: portrait ? 36 : 48, top: portrait ? 128 : 108, width: portrait ? 648 : 1120, height: portrait ? 42 : 34 }, portrait ? 15 : 16, C.gray);
  const displayRequirementId = model.primaryRequirementId || (model.slideScope === "overview" ? "OVERVIEW" : model.requirementId);
  text(slide, `requirement-id-${suffix}`, displayRequirementId, { left: model.canvas.width - 150, top: 42, width: 112, height: 24 }, 14, C.blue, true, "center");
  text(slide, `page-${suffix}`, String(page).padStart(2, "0"), { left: model.canvas.width - 92, top: model.canvas.height - 36, width: 54, height: 18 }, 12, C.blue, true, "right");
}
function applyAssetRecipe(slide, recipe) {
  for (const item of recipe.primitives) {
    if (item.kind === "text") {
      text(slide, item.name, item.text, item.position, item.fontSize ?? 14, item.color ?? C.ink, item.bold ?? false, item.alignment ?? "left");
      continue;
    }
    slide.shapes.add({
      geometry: item.kind,
      name: item.name,
      position: item.position,
      fill: item.fill ?? "none",
      line: { style: "solid", fill: item.stroke ?? item.fill ?? "none", width: item.lineWidth ?? 1 },
    });
  }
  const fidelityPassed = recipe.requiredMotifs.every((motif) => recipe.producedMotifs.includes(motif));
  return {
    rendererKey: recipe.rendererKey,
    structureFingerprint: recipe.structureFingerprint,
    requiredMotifs: recipe.requiredMotifs,
    producedMotifs: recipe.producedMotifs,
    fidelityPassed,
  };
}
function addWireframe(deck, model, layout, assetByBlock) {
  const slide = deck.slides.add();
  addHeader(slide, model, 1, true);
  for (const block of model.blocks) {
    const frame = layout.frames[block.blockId];
    if (!frame) continue;
    const mapping = assetByBlock.get(block.blockId);
    const rendererKey = mapping?.rendererKey ?? block.blockTypeDefinition?.rendererKey;
    if (block.architectureTreatment !== "native_diagram") {
      rect(slide, `wireframe:${block.blockId}`, frame, C.white, "#93A2B4");
      text(slide, `wireframe-title:${block.blockId}`, `[${roleTitles[block.role] ?? block.role} · ${block.architectureTreatment}]`, { left: frame.left + 14, top: frame.top + 13, width: frame.width - 28, height: 24 }, 16, C.navy, true);
      const explanation = typeof block.content?.explanation === "string" ? block.content.explanation.trim() : "";
      const flow = block.flowSteps?.length ? block.flowSteps.join(" → ") : "";
      text(slide, `wireframe-content:${block.blockId}`, [explanation, flow].filter(Boolean).join("\n\n"), { left: frame.left + 14, top: frame.top + 46, width: frame.width - 28, height: Math.max(28, frame.height - 90) }, 16, C.ink);
      const treatmentNote = block.architectureTreatment === "text_explainer" ? "editable_text_explainer" : "generated_visual_optional + editable_text";
      text(slide, `wireframe-mapping:${block.blockId}`, treatmentNote, { left: frame.left + 14, top: frame.top + frame.height - 30, width: frame.width - 28, height: 16 }, 10, C.gray, true);
      continue;
    }
    if (rendererKey) {
      const recipe = createAssetRecipe({ rendererKey, block, frame, theme: model.theme });
      applyAssetRecipe(slide, recipe);
      text(slide, `wireframe-mapping:${block.blockId}`, mapping ? `asset: ${mapping.assetId} · ${rendererKey}` : `fallback: native_shapes · ${rendererKey}`, { left: frame.left + 14, top: frame.top + 31, width: frame.width - 28, height: 9 }, 8, C.gray, true, "right");
      continue;
    }
    rect(slide, `wireframe:${block.blockId}`, frame, C.white, "#93A2B4");
    text(slide, `wireframe-title:${block.blockId}`, `[${roleTitles[block.role] ?? block.role}]`, { left: frame.left + 14, top: frame.top + 13, width: frame.width - 28, height: 24 }, 16, C.navy, true);
    const summary = block.steps.length ? block.steps.join(" → ") : block.content?.value_text || block.content?.headline || bulletText(block);
    text(slide, `wireframe-content:${block.blockId}`, summary, { left: frame.left + 14, top: frame.top + 46, width: frame.width - 28, height: Math.max(28, frame.height - 90) }, 16, C.ink);
    text(slide, `wireframe-mapping:${block.blockId}`, mapping ? mapping.assetId : "fallback: native_shapes", { left: frame.left + 14, top: frame.top + frame.height - 30, width: frame.width - 28, height: 16 }, 10, C.gray, true);
  }
  return slide;
}
function ellipse(slide, name, position, fill, stroke = fill, lineWidth = 1) {
  return slide.shapes.add({ geometry: "ellipse", name, position, fill, line: { style: "solid", fill: stroke, width: lineWidth } });
}
function renderMetric(slide, model, block, frame) {
  const metric = model.protectedMetrics[0];
  if (model.canvas.orientation === "portrait") {
    rect(slide, `metric-accent:${block.blockId}`, { left: frame.left, top: frame.top + 4, width: 6, height: frame.height - 8 }, C.blue, C.blue);
    text(slide, `metric-label:${block.blockId}`, metric?.label ?? block.content?.label ?? "핵심 적용 범위", { left: frame.left + 22, top: frame.top + 4, width: 156, height: 18 }, 13, C.blue, true);
    text(slide, `metric-value:${block.blockId}`, metric?.valueText ?? block.content?.value_text ?? "", { left: frame.left + 22, top: frame.top + 24, width: frame.width - 34, height: 30 }, 22, C.navy, true);
    rect(slide, `metric-rule:${block.blockId}`, { left: frame.left + 22, top: frame.top + frame.height - 2, width: frame.width - 22, height: 1 }, "#D8E0EA", "#D8E0EA");
    return;
  }
  rect(slide, `block:${block.blockId}`, frame, C.blue, C.blue, true);
  text(slide, `metric-label:${block.blockId}`, metric?.label ?? block.content?.label ?? "정량지표", { left: frame.left + 16, top: frame.top + 10, width: frame.width - 32, height: 18 }, 13, C.white, true, "center");
  text(slide, `metric-value:${block.blockId}`, metric?.valueText ?? block.content?.value_text ?? "", { left: frame.left + 16, top: frame.top + 32, width: frame.width - 32, height: Math.max(26, frame.height - 40) }, frame.height > 80 ? 28 : 22, C.white, true, "center");
}
function renderSummary(slide, block, frame, asset) {
  rect(slide, `block:${block.blockId}`, frame, C.white, C.white);
  if (asset?.assetId === "source_template_four_step_circle_chain") {
    text(slide, `block-title:${block.blockId}`, roleTitles[block.role], { left: frame.left + 18, top: frame.top + 10, width: frame.width - 36, height: 24 }, 18, C.navy, true);
    text(slide, `block-headline:${block.blockId}`, block.content?.headline ?? "", { left: frame.left + 18, top: frame.top + 40, width: frame.width - 36, height: 32 }, 16, C.ink, true);
    const labels = Array.isArray(block.content?.diagram_labels) ? block.content.diagram_labels : (block.content?.bullets ?? []);
    const centers = labels.map((_, index) => frame.left + frame.width * (0.2 + index * 0.205));
    for (let index = 0; index < centers.length - 1; index += 1) {
      rect(slide, `summary-link:${index + 1}`, { left: centers[index] + 38, top: frame.top + 124, width: centers[index + 1] - centers[index] - 76, height: 3 }, "#C7CED8", "#C7CED8");
      ellipse(slide, `summary-plus-bg:${index + 1}`, { left: (centers[index] + centers[index + 1]) / 2 - 10, top: frame.top + 115, width: 20, height: 20 }, "#B8BEC8", "#B8BEC8");
      text(slide, `summary-plus:${index + 1}`, "+", { left: (centers[index] + centers[index + 1]) / 2 - 8, top: frame.top + 118, width: 16, height: 14 }, 10, C.white, true, "center");
    }
    labels.forEach((label, index) => {
      const center = centers[index];
      ellipse(slide, `summary-node:${index + 1}`, { left: center - 42, top: frame.top + 84, width: 84, height: 84 }, C.blue, C.blue);
      text(slide, `summary-node-label:${index + 1}`, label, { left: center - 45, top: frame.top + 110, width: 90, height: 42 }, 12, C.white, true, "center");
    });
    return;
  }
  const assetWidth = asset ? Math.min(168, frame.width * 0.27) : 0;
  if (asset) {
    ellipse(slide, `summary-native-motif:${block.blockId}`, { left: frame.left + frame.width - assetWidth + 42, top: frame.top + 46, width: 84, height: 84 }, C.blue, C.blue);
    if (asset.assetId === "source_template_circle_to_list_mapping") {
      text(slide, `summary-asset-label:${block.blockId}`, "4대\n구현축", { left: frame.left + frame.width - assetWidth + 58, top: frame.top + 66, width: 58, height: 40 }, 12, C.white, true, "center");
    }
  }
  const textWidth = frame.width - 36 - (asset ? assetWidth + 12 : 0);
  text(slide, `block-title:${block.blockId}`, roleTitles[block.role], { left: frame.left + 18, top: frame.top + 18, width: textWidth, height: 24 }, 18, C.navy, true);
  text(slide, `block-headline:${block.blockId}`, block.content?.headline ?? "", { left: frame.left + 18, top: frame.top + 50, width: textWidth, height: 40 }, 17, C.ink, true);
  text(slide, `block-body:${block.blockId}`, bulletText(block), { left: frame.left + 18, top: frame.top + 94, width: textWidth, height: Math.max(40, frame.height - 106) }, 15, C.ink);
}
function renderNativeArchitecture(slide, blockId, frame) {
  const centerX = frame.left + frame.width / 2;
  rect(slide, `architecture-spine:${blockId}`, { left: centerX - 1, top: frame.top + 28, width: 2, height: frame.height - 52 }, "#8795A8", "#8795A8");
  rect(slide, `architecture-top-link:${blockId}`, { left: frame.left + 34, top: frame.top + 48, width: frame.width - 68, height: 2 }, "#8795A8", "#8795A8");
  rect(slide, `architecture-service-band:${blockId}`, { left: frame.left + 10, top: frame.top + 8, width: frame.width - 20, height: 18 }, C.blue, C.blue);
  rect(slide, `architecture-router:${blockId}`, { left: centerX - 112, top: frame.top + 58, width: 224, height: 54 }, C.white, "#59687B");
  [0, 1, 2].forEach((index) => rect(slide, `architecture-router-cell:${index + 1}`, { left: centerX - 100 + index * 68, top: frame.top + 72, width: 58, height: 24 }, index === 0 ? C.pale : C.white, "#8A97A8"));
  rect(slide, `architecture-left-stack:${blockId}`, { left: frame.left + 16, top: frame.top + 132, width: 90, height: 70 }, C.white, "#59687B");
  [0, 1, 2].forEach((index) => rect(slide, `architecture-left-row:${index + 1}`, { left: frame.left + 24, top: frame.top + 142 + index * 17, width: 74, height: 12 }, C.pale2, "#A7B0BC"));
  rect(slide, `architecture-control:${blockId}`, { left: centerX - 84, top: frame.top + 126, width: 168, height: 38 }, C.pale, "#6B7A8C");
  rect(slide, `architecture-control-accent:${blockId}`, { left: centerX - 84, top: frame.top + 126, width: 54, height: 38 }, C.blue, C.blue);
  rect(slide, `architecture-bottom-band:${blockId}`, { left: centerX - 116, top: frame.top + frame.height - 28, width: 232, height: 20 }, C.navy, C.navy);
}
function renderProcess(slide, block, frame, layout, asset) {
  if (asset && layout.layoutKey.endsWith(":portrait")) {
    rect(slide, `process-divider:${block.blockId}`, { left: frame.left, top: frame.top, width: frame.width, height: 2 }, C.blue, C.blue);
    text(slide, `block-title:${block.blockId}`, roleTitles[block.role], { left: frame.left + 22, top: frame.top + 18, width: 180, height: 24 }, 18, C.navy, true);
    text(slide, `asset-trace:${block.blockId}`, `asset: ${asset.assetId}`, { left: frame.left + frame.width - 330, top: frame.top + 20, width: 306, height: 16 }, 10, C.gray, true, "right");
    const rail = { left: frame.left + 18, top: frame.top + 58, width: 224, height: frame.height - 78 };
    const gap = 8;
    const itemHeight = (rail.height - gap * Math.max(0, block.steps.length - 1)) / Math.max(1, block.steps.length);
    rect(slide, `process-spine:${block.blockId}`, { left: rail.left + 16, top: rail.top + 18, width: 3, height: rail.height - 36 }, "#BCD2F1", "#BCD2F1");
    block.steps.forEach((label, index) => {
      const top = rail.top + index * (itemHeight + gap);
      rect(slide, `process-index-bg:${index + 1}`, { left: rail.left, top: top + 7, width: 36, height: 36 }, C.blue, C.blue, true);
      text(slide, `process-index:${index + 1}`, String(index + 1), { left: rail.left + 9, top: top + 17, width: 18, height: 16 }, 11, C.white, true, "center");
      text(slide, `process-label:${index + 1}`, label, { left: rail.left + 52, top: top + 12, width: rail.width - 58, height: itemHeight - 14 }, 16, C.navy, true);
    });
    renderNativeArchitecture(slide, block.blockId, { left: frame.left + 252, top: frame.top + 56, width: frame.width - 270, height: frame.height - 76 });
    return;
  }
  rect(slide, `block:${block.blockId}`, frame, C.white, asset ? C.white : "#BCD2F1");
  text(slide, `block-title:${block.blockId}`, roleTitles[block.role], { left: frame.left + 22, top: frame.top + 18, width: 180, height: 24 }, 18, C.navy, true);
  if (asset) text(slide, `asset-trace:${block.blockId}`, `asset: ${asset.assetId}`, { left: frame.left + frame.width - 250, top: frame.top + 20, width: 226, height: 16 }, 10, C.gray, true, "right");
  for (const cell of layout.processCells) {
    if (!asset) rect(slide, `process-cell:${cell.index}`, cell, C.pale, "#BCD2F1", true);
    text(slide, `process-index:${cell.index}`, String(cell.index).padStart(2, "0"), { left: cell.left + 8, top: cell.top + 10, width: cell.width - 16, height: 16 }, 11, C.blue, true, "center");
    text(slide, `process-label:${cell.index}`, cell.label, { left: cell.left + 8, top: cell.top + 34, width: cell.width - 16, height: Math.max(24, cell.height - 42) }, 14, C.navy, true, "center");
  }
}
function renderComparison(slide, block, frame, asset) {
  if (asset) {
    rect(slide, `comparison-left-surface:${block.blockId}`, { left: frame.left + 18, top: frame.top + 34, width: frame.width / 2 - 54, height: frame.height - 80 }, C.pale, C.pale, true);
    rect(slide, `comparison-right-surface:${block.blockId}`, { left: frame.left + frame.width / 2 + 36, top: frame.top + 34, width: frame.width / 2 - 54, height: frame.height - 80 }, C.pale, C.pale, true);
    ellipse(slide, `comparison-left-orbit:${block.blockId}`, { left: frame.left + frame.width / 2 - 48, top: frame.top + 58, width: 58, height: 58 }, C.blue, C.blue);
    ellipse(slide, `comparison-right-orbit:${block.blockId}`, { left: frame.left + frame.width / 2 - 10, top: frame.top + 58, width: 58, height: 58 }, C.accent, C.accent);
  } else rect(slide, `block:${block.blockId}`, frame, C.white, C.white);
  text(slide, `block-title:${block.blockId}`, roleTitles[block.role], { left: frame.left + 20, top: frame.top + 8, width: 180, height: 20 }, 15, C.navy, true);
  const options = block.options.length >= 2 ? block.options : [{ label: "대안 1", summary: "" }, { label: "대안 2", summary: "" }];
  const half = frame.width / 2;
  const compact = frame.height <= 160;
  const labelTop = frame.top + (compact ? 42 : 48);
  const summaryTop = labelTop + 24;
  const conclusionHeight = compact ? 40 : 46;
  const conclusionTop = frame.top + frame.height - conclusionHeight;
  const summaryHeight = Math.max(28, conclusionTop - summaryTop - 6);
  const labelSize = compact ? 12 : 14;
  const summarySize = 16;
  const leftPosition = { left: frame.left + 18, width: half - 54 };
  const rightPosition = { left: frame.left + half + 36, width: half - 54 };
  rect(slide, `option-vs-bg:${block.blockId}`, { left: frame.left + half - 20, top: labelTop + 11, width: 40, height: 40 }, C.blue, C.blue, true);
  text(slide, `option-left-label:${block.blockId}`, options[0].label, { ...leftPosition, top: labelTop, height: 20 }, labelSize, C.ink, true, "center");
  text(slide, `option-left-summary:${block.blockId}`, optionDescription(options[0]), { ...leftPosition, top: summaryTop, height: summaryHeight }, summarySize, C.ink, false, "center");
  text(slide, `option-right-label:${block.blockId}`, options[1].label, { ...rightPosition, top: labelTop, height: 20 }, labelSize, C.navy, true, "center");
  text(slide, `option-right-summary:${block.blockId}`, optionDescription(options[1]), { ...rightPosition, top: summaryTop, height: summaryHeight }, summarySize, C.navy, false, "center");
  text(slide, `option-vs:${block.blockId}`, "+", { left: frame.left + half - 22, top: labelTop + 19, width: 44, height: 24 }, 18, C.white, true, "center");
  rect(slide, `option-conclusion-bg:${block.blockId}`, { left: frame.left, top: conclusionTop, width: frame.width, height: conclusionHeight }, C.navy, C.navy);
  text(slide, `option-conclusion:${block.blockId}`, block.content.conclusion, { left: frame.left + 20, top: conclusionTop + 9, width: frame.width - 40, height: conclusionHeight - 14 }, 14, C.white, true, "center");
}
function renderGovernance(slide, block, frame, asset) {
  rect(slide, `governance-divider:${block.blockId}`, { left: frame.left, top: frame.top, width: frame.width, height: 2 }, C.blue, C.blue);
  text(slide, `block-title:${block.blockId}`, block.content?.headline ?? roleTitles[block.role], { left: frame.left + 18, top: frame.top + 12, width: frame.width - 36, height: 24 }, 17, C.navy, true);
  const bullets = Array.isArray(block.content?.bullets) ? block.content.bullets : [];
  const assetWidth = asset ? Math.min(210, frame.width * 0.34) : 0;
  if (asset) {
    const ring = { left: frame.left + 42, top: frame.top + 82, width: 122, height: 122 };
    ellipse(slide, `governance-ring:${block.blockId}`, ring, "none", "#78A9DF", 8);
    rect(slide, `governance-horizontal-link:${block.blockId}`, { left: ring.left + 14, top: ring.top + ring.height / 2 - 1, width: ring.width - 28, height: 2 }, "#78A9DF", "#78A9DF");
    rect(slide, `governance-vertical-link:${block.blockId}`, { left: ring.left + ring.width / 2 - 1, top: ring.top + 14, width: 2, height: ring.height - 28 }, "#78A9DF", "#78A9DF");
    ellipse(slide, `governance-center:${block.blockId}`, { left: ring.left + 45, top: ring.top + 45, width: 32, height: 32 }, C.blue, C.blue);
    const nodes = [
      { left: ring.left - 12, top: ring.top - 12 },
      { left: ring.left + ring.width - 30, top: ring.top - 12 },
      { left: ring.left - 12, top: ring.top + ring.height - 30 },
      { left: ring.left + ring.width - 30, top: ring.top + ring.height - 30 },
    ];
    nodes.forEach((position, index) => ellipse(slide, `governance-node:${index + 1}`, { ...position, width: 42, height: 42 }, "#07105F", "#07105F"));
  }
  const rowHeight = Math.max(42, (frame.height - 64) / Math.max(1, bullets.length));
  bullets.forEach((item, index) => {
    const rowLeft = frame.left + 18 + assetWidth;
    rect(slide, `governance-number-bg:${index + 1}`, { left: rowLeft, top: frame.top + 58 + index * rowHeight, width: 28, height: 28 }, C.pale, C.pale, true);
    text(slide, `governance-number:${index + 1}`, String(index + 1), { left: rowLeft + 7, top: frame.top + 65 + index * rowHeight, width: 14, height: 14 }, 10, C.blue, true, "center");
    text(slide, `governance-text:${index + 1}`, item, { left: rowLeft + 40, top: frame.top + 56 + index * rowHeight, width: frame.width - assetWidth - 58, height: rowHeight - 4 }, 16, C.ink, index === 0);
  });
}
function renderGeneric(slide, block, frame) {
  rect(slide, `block:${block.blockId}`, frame, C.white, C.line);
  text(slide, `block-title:${block.blockId}`, blockTitle(block), { left: frame.left + 16, top: frame.top + 16, width: frame.width - 32, height: 24 }, 17, C.navy, true);
  const explanation = typeof block.content?.explanation === "string" ? block.content.explanation.trim() : "";
  const flowSteps = block.flowSteps?.length ? `흐름: ${block.flowSteps.join(" → ")}` : "";
  const body = [explanation, flowSteps].filter(Boolean).join("\n\n") || bulletText(block) || JSON.stringify(block.content);
  text(slide, `block-body:${block.blockId}`, body, { left: frame.left + 16, top: frame.top + 54, width: frame.width - 32, height: frame.height - 70 }, 16, C.ink);
}
function addFinal(deck, model, layout, assets) {
  const slide = deck.slides.add();
  addHeader(slide, model, 2, false);
  const displayRequirementId = model.primaryRequirementId || (model.slideScope === "overview" ? "OVERVIEW" : model.requirementId);
  const assetByBlock = new Map(assets.map((asset) => [asset.blockId, asset]));
  const applications = [];
  for (const block of model.blocks) {
    const frame = layout.frames[block.blockId];
    if (!frame) continue;
    const asset = assetByBlock.get(block.blockId);
    const rendererKey = asset?.rendererKey ?? block.blockTypeDefinition?.rendererKey;
    if (block.architectureTreatment !== "native_diagram") {
      renderGeneric(slide, block, frame);
      continue;
    }
    if (rendererKey) {
      const recipe = createAssetRecipe({ rendererKey, block, frame, theme: model.theme });
      const application = applyAssetRecipe(slide, recipe);
      if (asset) applications.push({ blockId: block.blockId, assetId: asset.assetId, ...application });
      continue;
    }
    if (block.role === "metric_highlight") renderMetric(slide, model, block, frame);
    else if (block.role === "requirement_summary") renderSummary(slide, block, frame, assetByBlock.get(block.blockId));
    else if (block.role === "main_process") renderProcess(slide, block, frame, layout, assetByBlock.get(block.blockId));
    else if (block.role === "technology_comparison") renderComparison(slide, block, frame, assetByBlock.get(block.blockId));
    else if (block.role === "operation_quality") renderGovernance(slide, block, frame, assetByBlock.get(block.blockId));
    else renderGeneric(slide, block, frame);
  }
  const footerTop = model.canvas.height - 54;
  text(slide, "source-footer", `RFP ${displayRequirementId} | 보호 정량지표: ${model.protectedMetrics.map((metric) => metric.valueText).join(", ") || "없음"} | 자산 구조와 제안 문구는 개별 도형으로 편집 가능`, { left: model.canvas.orientation === "portrait" ? 36 : 48, top: footerTop, width: model.canvas.width - 150, height: 18 }, 11, C.gray);
  return { slide, applications };
}

export async function renderPresentation({ model, layout, patternRoot, outputPptx, wireframePng, finalSlidePng }) {
  C = {
    blue: model.theme.primary,
    navy: model.theme.navy,
    accent: model.theme.accent,
    pale: model.theme.pale,
    pale2: model.theme.surface,
    ink: model.theme.ink,
    gray: model.theme.gray,
    line: model.theme.line,
    white: model.theme.white,
  };
  await Promise.all([outputPptx, wireframePng, finalSlidePng].map((file) => fs.mkdir(path.dirname(file), { recursive: true })));
  const assets = await loadAssets(model, patternRoot);
  const assetByBlock = new Map(assets.map((asset) => [asset.blockId, asset]));
  const deck = Presentation.create({ slideSize: { width: model.canvas.width, height: model.canvas.height } });
  const wireframe = addWireframe(deck, model, layout, assetByBlock);
  const final = addFinal(deck, model, layout, assets);
  await writeBlob(wireframePng, await deck.export({ slide: wireframe, format: "png", scale: 1.25 }));
  await writeBlob(finalSlidePng, await deck.export({ slide: final.slide, format: "png", scale: 1.25 }));
  const pptx = await PresentationFile.exportPptx(deck);
  await pptx.save(outputPptx);
  const applicationsByBlock = new Map(final.applications.map((application) => [application.blockId, application]));
  return {
    assets: assets.map((asset) => {
      const application = applicationsByBlock.get(asset.blockId);
      return {
        ...asset,
        applied: Boolean(application),
        fidelityPassed: application?.fidelityPassed ?? false,
        structureFingerprint: application?.structureFingerprint ?? null,
        requiredMotifs: application?.requiredMotifs ?? [],
        producedMotifs: application?.producedMotifs ?? [],
      };
    }),
    slideCount: 2,
  };
}
