function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
}

function ownString(object, key, name = key) {
  if (!Object.hasOwn(object, key) || typeof object[key] !== "string" || !object[key].trim()) throw new TypeError(`${name} must be a non-empty own string`);
  return object[key].trim();
}

function normalizeBlock(block) {
  requireObject(block, "blueprint block");
  const blockId = ownString(block, "block_id", "block_id");
  const steps = Array.isArray(block.content?.steps) ? block.content.steps.map((step) => String(step).trim()).filter(Boolean) : [];
  const options = Array.isArray(block.content?.options) ? structuredClone(block.content.options) : [];
  const countedItems = steps.length ? steps.length : options.length;
  if (block.step_count != null && (!Number.isInteger(block.step_count) || block.step_count !== countedItems)) {
    throw new Error(`step_count for ${blockId} must equal actual steps or options (${countedItems})`);
  }
  return {
    blockId,
    role: ownString(block, "role"),
    slot: ownString(block, "slot"),
    visualCategory: ownString(block, "visual_category"),
    direction: typeof block.direction === "string" ? block.direction : "none",
    importance: typeof block.importance === "string" ? block.importance : "optional",
    content: structuredClone(block.content ?? {}),
    steps,
    options,
    sourceRefs: Array.isArray(block.source_refs) ? [...block.source_refs] : [],
  };
}

function inferAssetStepCount(catalogItem) {
  if (Number.isInteger(catalogItem.step_count) && catalogItem.step_count > 1) return catalogItem.step_count;
  const words = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const match = String(catalogItem.module_type ?? "").toLowerCase().match(/(?:^|_)(two|three|four|five|six|seven|eight|nine|ten)_step(?:_|$)/);
  return match ? words[match[1]] : null;
}

function normalizeTheme(theme = {}) {
  requireObject(theme, "blueprint.theme");
  const normalized = { ...DEFAULT_THEME };
  for (const key of Object.keys(DEFAULT_THEME)) {
    if (theme[key] == null) continue;
    if (typeof theme[key] !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(theme[key])) throw new Error(`blueprint.theme.${key} must be a #RRGGBB color`);
    normalized[key] = theme[key].toUpperCase();
  }
  return normalized;
}

function countMeaningfulAreas(blocks) {
  return blocks.reduce((total, block) => {
    const bullets = Array.isArray(block.content?.bullets) ? block.content.bullets.length : 0;
    const labels = Array.isArray(block.content?.diagram_labels) ? block.content.diagram_labels.length : 0;
    return total + Math.max(1, block.steps.length, block.options.length, bullets, labels);
  }, 0);
}

export function compileRenderModel({ requirement, blueprint, mapping, catalog }) {
  requireObject(requirement, "requirement");
  requireObject(blueprint, "blueprint");
  requireObject(mapping, "mapping");
  if (!Array.isArray(catalog)) throw new TypeError("catalog must be an array");
  const requirementId = ownString(requirement, "requirement_id", "requirement.requirement_id");
  const blueprintId = ownString(blueprint, "requirement_id", "blueprint.requirement_id");
  const mappingId = ownString(mapping, "requirement_id", "mapping.requirement_id");
  if (new Set([requirementId, blueprintId, mappingId]).size !== 1) throw new Error("Requirement IDs must match across requirement, blueprint, and mapping inputs");
  if (!Array.isArray(blueprint.blocks) || blueprint.blocks.length < 5) {
    throw new Error(`blueprint.blocks must contain at least 5 content boxes; found ${Array.isArray(blueprint.blocks) ? blueprint.blocks.length : 0}`);
  }
  const density = blueprint.density ?? "high";
  if (density !== "high") throw new Error(`blueprint.density must be high for proposal slides; received ${density}`);
  if (!Array.isArray(mapping.mappings)) throw new Error("mapping.mappings must be an array");

  const blocks = blueprint.blocks.map(normalizeBlock);
  for (const block of blocks) {
    if (block.role === "technology_comparison") {
      const conclusion = block.content?.conclusion;
      if (typeof conclusion !== "string" || !conclusion.trim()) {
        throw new Error(`technology_comparison block ${block.blockId} must include content.conclusion`);
      }
    }
  }
  const blockIds = new Set(blocks.map((block) => block.blockId));
  if (blockIds.size !== blocks.length) throw new Error("blueprint block IDs must be unique");
  const meaningfulAreaCount = countMeaningfulAreas(blocks);
  if (meaningfulAreaCount < 5) throw new Error(`blueprint must contain at least 5 meaningful areas across nodes, lanes, steps, conclusions, and text regions; found ${meaningfulAreaCount}`);
  const catalogById = new Map(catalog.map((item) => [item.module_id, item]));
  const selectedAssets = [];
  const fallbackBlocks = [];
  for (const item of mapping.mappings) {
    requireObject(item, "mapping item");
    const blockId = ownString(item, "block_id", "mapping.block_id");
    if (!blockIds.has(blockId)) throw new Error(`mapping references unknown block ${blockId}`);
    if (item.status === "architecture_required") {
      throw new Error(`Block ${blockId} is marked 상세 아키텍처 필요 and cannot be rendered as a final slide`);
    }
    if (item.status === "selected_candidate") {
      const assetId = ownString(item, "asset_id", "mapping.asset_id");
      const catalogItem = catalogById.get(assetId);
      if (!catalogItem) throw new Error(`Unknown asset ${assetId} selected for ${blockId}`);
      const rendererKey = resolveRendererKey(item, catalogItem);
      if (!rendererKey) throw new Error(`Unsupported renderer for selected asset ${assetId}; declare a supported renderer_key or choose no_suitable_asset`);
      const block = blocks.find((candidate) => candidate.blockId === blockId);
      const actualStepCount = block.steps.length || block.options.length;
      const assetStepCount = inferAssetStepCount(catalogItem);
      const adaptations = [];
      if (rendererKey === "process_grid" && actualStepCount && assetStepCount && actualStepCount !== assetStepCount) {
        if (actualStepCount < 2 || actualStepCount > 12) throw new Error(`Process asset ${assetId} cannot reflow ${actualStepCount} steps; supported range is 2-12`);
        adaptations.push({ type: "node_count_reflow", from: assetStepCount, to: actualStepCount });
      }
      selectedAssets.push({
        blockId,
        assetId,
        template: item.template ?? catalogItem.template,
        usageMode: item.usage_mode ?? "semantic",
        rendererKey,
        adaptations,
        mapping: structuredClone(item),
        catalog: structuredClone(catalogItem),
      });
    } else if (item.status === "no_suitable_asset" || String(item.status).startsWith("fallback")) {
      fallbackBlocks.push({ blockId, fallback: item.fallback ?? "native_shapes", reason: item.usage_note ?? "No compatible selected asset" });
    }
  }

  const orientation = blueprint.orientation === "portrait" ? "portrait" : "landscape";
  let governingMessage = "";
  if (orientation === "portrait") {
    governingMessage = ownString(blueprint, "governing_message", "blueprint.governing_message");
    if (!/니다\.$/.test(governingMessage)) {
      throw new Error("blueprint.governing_message for portrait slides must end in 니다.");
    }
  } else if (typeof blueprint.governing_message === "string") {
    governingMessage = blueprint.governing_message.trim();
  }
  const protectedMetrics = Array.isArray(blueprint.protected_metrics)
    ? blueprint.protected_metrics.map((metric) => ({ metricId: metric.metric_id, label: metric.label, valueText: String(metric.value_text), sourceRefs: [...(metric.source_refs ?? [])] }))
    : [];
  return {
    requirementId,
    requirementName: requirement.requirement_name ?? requirementId,
    requirementSummary: requirement.requirement_summary ?? "",
    governingMessage,
    title: ownString(blueprint, "slide_title", "blueprint.slide_title"),
    layoutFamily: ownString(blueprint, "layout_family", "blueprint.layout_family"),
    density,
    canvas: orientation === "portrait" ? { width: 720, height: 1280, orientation } : { width: 1280, height: 720, orientation },
    protectedMetrics,
    theme: normalizeTheme(blueprint.theme ?? {}),
    contentBoxCount: blocks.length,
    meaningfulAreaCount,
    blocks,
    selectedAssets,
    fallbackBlocks,
  };
}
import { resolveRendererKey } from "./asset-recipes.mjs";

const DEFAULT_THEME = {
  primary: "#1769E0",
  navy: "#123B78",
  accent: "#4A8CF0",
  pale: "#EEF5FF",
  surface: "#F3F6FA",
  ink: "#172033",
  gray: "#5F6B7A",
  line: "#C8D2DF",
  white: "#FFFFFF",
};
