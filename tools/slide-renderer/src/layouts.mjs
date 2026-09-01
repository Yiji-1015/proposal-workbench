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
  const templateFrames = registered ? registeredFrames(model) : genericFrames(model);
  const frames = registered
    ? Object.fromEntries(model.blocks
      .map((block) => [block.blockId, templateFrames[block.role] ?? templateFrames[block.blockId]])
      .filter(([, value]) => value))
    : templateFrames;
  return {
    layoutKey: `${registered ? model.layoutFamily : "generic_grid"}:${model.canvas.orientation}`,
    frames,
    processCells: processCells(model, frames),
  };
}
