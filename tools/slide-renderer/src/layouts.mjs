import { EXPLANATION_BAND_HEIGHT } from "./block-types.mjs";

function frame(left, top, width, height) { return { left, top, width, height }; }

function registeredFrames(model) {
  if (model.canvas.orientation === "portrait") {
    return {
      metric_highlight: frame(36, 176, 648, 64),
      requirement_summary: frame(36, 254, 648, 188),
      main_process: frame(36, 456, 648, 298),
      technology_comparison: frame(36, 768, 648, 180),
      operation_quality: frame(36, 962, 648, 252),
    };
  }
  return {
    metric_highlight: frame(48, 160, 220, 72),
    requirement_summary: frame(48, 246, 220, 386),
    main_process: frame(294, 160, 626, 300),
    technology_comparison: frame(294, 478, 626, 154),
    operation_quality: frame(946, 160, 286, 472),
  };
}

function genericFrames(model) {
  const { width, height, orientation } = model.canvas;
  const margin = orientation === "portrait" ? 36 : 48;
  const top = orientation === "portrait" ? 166 : 160;
  const bottom = height - 66;
  const gap = 14;
  const columns = orientation === "portrait" ? 1 : 2;
  const rows = Math.ceil(model.blocks.length / columns);
  const availableWidth = width - margin * 2 - gap * (columns - 1);
  const availableHeight = bottom - top - gap * (rows - 1);
  const cellWidth = availableWidth / columns;
  const cellHeight = availableHeight / rows;
  return Object.fromEntries(model.blocks.map((block, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return [block.blockId, frame(margin + column * (cellWidth + gap), top + row * (cellHeight + gap), cellWidth, cellHeight)];
  }));
}

function poolFrames(model) {
  const { width, height, orientation } = model.canvas;
  const margin = orientation === "portrait" ? 36 : 48;
  const top = orientation === "portrait" ? 166 : 160;
  const bottom = height - 66;
  const gap = 14;
  const availableWidth = width - margin * 2;
  const rows = [];
  for (const block of model.blocks) {
    const span = block.blockTypeDefinition?.preferredSpan;
    if (span !== "full" && span !== "half") throw new Error(`block_pool_auto requires a full or half span for ${block.blockId}`);
    const previous = rows.at(-1);
    if (span === "half" && previous?.span === "half" && previous.blocks.length < 2) previous.blocks.push(block);
    else rows.push({ span, blocks: [block] });
  }
  const dimensions = rows.map((row) => {
    const definitions = row.blocks.map((block) => block.blockTypeDefinition);
    const explanationHeight = row.blocks.some((block) => typeof block.content?.explanation === "string" && block.content.explanation.trim())
      ? EXPLANATION_BAND_HEIGHT
      : 0;
    const baseMinHeight = Math.max(...definitions.map((definition) => Number(definition.minHeight?.[orientation])));
    const basePreferredHeight = Math.max(baseMinHeight, ...definitions.map((definition) => Number(definition.preferredHeight?.[orientation])));
    const minHeight = baseMinHeight + explanationHeight;
    const preferredHeight = basePreferredHeight + explanationHeight;
    if (!Number.isFinite(minHeight) || !Number.isFinite(preferredHeight)) throw new Error(`block_pool_auto requires numeric heights for ${row.blocks.map((block) => block.blockId).join(", ")}`);
    return { ...row, minHeight, preferredHeight };
  });
  const availableHeight = bottom - top - gap * Math.max(0, dimensions.length - 1);
  const minimumHeight = dimensions.reduce((total, row) => total + row.minHeight, 0);
  if (minimumHeight > availableHeight) throw new Error(`block_pool_auto cannot fit ${minimumHeight} minimum height into ${availableHeight} available height`);
  const heights = dimensions.map((row) => row.minHeight);
  let remaining = availableHeight - minimumHeight;
  for (let index = 0; index < dimensions.length && remaining > 0; index += 1) {
    const room = dimensions[index].preferredHeight - heights[index];
    const addition = Math.min(room, remaining);
    heights[index] += addition;
    remaining -= addition;
  }
  if (remaining > 0) {
    const addition = remaining / heights.length;
    for (let index = 0; index < heights.length; index += 1) heights[index] += addition;
  }
  const frames = {};
  let currentTop = top;
  for (let rowIndex = 0; rowIndex < dimensions.length; rowIndex += 1) {
    const row = dimensions[rowIndex];
    const rowHeight = heights[rowIndex];
    const cellWidth = row.blocks.length === 2 ? (availableWidth - gap) / 2 : row.span === "half" ? (availableWidth - gap) / 2 : availableWidth;
    row.blocks.forEach((block, index) => {
      frames[block.blockId] = frame(margin + index * (cellWidth + gap), currentTop, cellWidth, rowHeight);
    });
    currentTop += rowHeight + gap;
  }
  return frames;
}

function processCells(model, frames) {
  const process = model.blocks.find((block) => block.role === "main_process" || block.blockId === "main_process");
  if (!process?.steps?.length) return [];
  const processFrame = frames[process.blockId];
  if (!processFrame) return [];
  const count = process.steps.length;
  const columns = model.canvas.orientation === "portrait" && count === 4 ? 2 : Math.min(3, count);
  const rows = Math.ceil(count / columns);
  const gap = model.canvas.orientation === "portrait" ? 10 : 12;
  const inner = { left: processFrame.left + 24, top: processFrame.top + 72, width: processFrame.width - 48, height: processFrame.height - 92 };
  const cellWidth = (inner.width - gap * (columns - 1)) / columns;
  const cellHeight = (inner.height - gap * (rows - 1)) / rows;
  return process.steps.map((label, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return { index: index + 1, label, left: inner.left + column * (cellWidth + gap), top: inner.top + row * (cellHeight + gap), width: cellWidth, height: cellHeight };
  });
}

export function createLayoutPlan(model) {
  const registered = model.layoutFamily === "three_column_with_bottom_band";
  const pool = model.layoutFamily === "block_pool_auto";
  const templateFrames = pool ? poolFrames(model) : registered ? registeredFrames(model) : genericFrames(model);
  const frames = registered
    ? Object.fromEntries(model.blocks
      .map((block) => [block.blockId, templateFrames[block.role] ?? templateFrames[block.blockId]])
      .filter(([, value]) => value))
    : templateFrames;
  return {
    layoutKey: `${pool || registered ? model.layoutFamily : "generic_grid"}:${model.canvas.orientation}`,
    frames,
    processCells: processCells(model, frames),
  };
}
