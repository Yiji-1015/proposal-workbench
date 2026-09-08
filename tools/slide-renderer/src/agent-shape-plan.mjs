import { createHash } from "node:crypto";

const ALLOWED_KINDS = new Set(["text", "rect", "roundRect", "ellipse", "diamond", "line", "connector"]);
const ALLOWED_ALIGNMENTS = new Set(["left", "center", "right"]);
const ALLOWED_SIDES = new Set(["left", "right", "top", "bottom"]);
const ALLOWED_CONNECTOR_KINDS = new Set(["straight"]);
const MIN_PRIMITIVES = 8;
const SURFACE_KINDS = new Set(["rect", "roundRect", "ellipse", "diamond"]);

// 배치 품질 하한선. 같은 렌더러로 만든 장표가 어떤 날은 상하좌우를 다 쓰는 구성으로,
// 어떤 날은 상자 한 줄을 세로로 쌓고 아래 40%를 비운 채로 나왔다. 검증기가 도형 수와
// 안전영역만 보고 배치 자체는 보지 않았기 때문이다. 아래 값은 실제로 승인된 장표
// (상단 2단·중앙 허브·하단 2단·결론 밴드)는 통과하고, 1열 스택은 떨어지도록 잡았다.
const LAYOUT_RULES = {
  portrait: { minSurfaceCoverage: 0.6, maxEmptyBand: 120, minHeadlineFont: 14 },
  landscape: { minSurfaceCoverage: 0.55, maxEmptyBand: 80, minHeadlineFont: 14 },
};

// 내용 보존 검사는 원문을 지키려는 것이지 표기 방식을 지키려는 것이 아니다. 불릿 기호,
// 대시, 따옴표, 공백만 다른 문장이 계속 거부되면서 저작 경로 자체가 포기되고 고정
// 레이아웃으로 되돌아갔다. 같은 내용의 다른 표기는 같은 것으로 본다.
function comparableText(value) {
  return String(value ?? "")
    .replace(/[·•∙○●・]/g, " ")
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[ ​]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
}

function requiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}

function finiteNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${name} must be a finite number`);
  return number;
}

function resolveColor(value, name, theme, fallback = "none") {
  if (value == null) return fallback;
  const color = requiredString(value, name);
  if (color === "none") return color;
  if (Object.hasOwn(theme, color)) return theme[color];
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
    const normalized = color.toUpperCase();
    if (!Object.values(theme).includes(normalized)) {
      throw new Error(`${name} must use a theme token or one of the approved theme colors`);
    }
    return normalized;
  }
  throw new Error(`${name} must be none, a theme token, or a #RRGGBB theme color`);
}

export function bodySafeArea(canvas) {
  const margin = 24;
  const top = canvas.orientation === "portrait" ? 166 : 150;
  const bottom = canvas.height - 50;
  return { left: margin, top, right: canvas.width - margin, bottom, width: canvas.width - margin * 2, height: bottom - top };
}

function normalizePosition(value, name, canvas) {
  requireObject(value, name);
  const position = {
    left: finiteNumber(value.left, `${name}.left`),
    top: finiteNumber(value.top, `${name}.top`),
    width: finiteNumber(value.width, `${name}.width`),
    height: finiteNumber(value.height, `${name}.height`),
  };
  if (position.width <= 0 || position.height <= 0) throw new RangeError(`${name} width and height must be positive`);
  const body = bodySafeArea(canvas);
  if (position.left < body.left || position.top < body.top || position.left + position.width > body.right || position.top + position.height > body.bottom) {
    throw new RangeError(`${name} must stay inside the agent-authored body safe area`);
  }
  return position;
}

function unionFrame(current, position) {
  if (!current) return { ...position };
  const left = Math.min(current.left, position.left);
  const top = Math.min(current.top, position.top);
  const right = Math.max(current.left + current.width, position.left + position.width);
  const bottom = Math.max(current.top + current.height, position.top + position.height);
  return { left, top, width: right - left, height: bottom - top };
}

function structureFingerprint(primitives, canvas) {
  const indexes = new Map(primitives.map((primitive, index) => [primitive.name, index]));
  const bucket = (value, total) => Math.round((value / total) * 20);
  const canonical = primitives.map((primitive) => {
    if (primitive.kind === "connector") {
      return `connector:${indexes.get(primitive.from)}>${indexes.get(primitive.to)}:${primitive.fromSide ?? "auto"}:${primitive.toSide ?? "auto"}:${primitive.connectorKind}`;
    }
    const { left, top, width, height } = primitive.position;
    return `${primitive.kind}:${bucket(left, canvas.width)},${bucket(top, canvas.height)},${bucket(width, canvas.width)},${bucket(height, canvas.height)}`;
  }).join("|");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

// ---------- 배치 품질 ----------

// 렌더러는 슬라이드 단위를 96dpi 픽셀로, 글자 크기를 pt로 받는다. 폭 계수는 맑은 고딕
// 실측값이다(한글 1.00em, 영문 0.47~0.50em, 숫자 0.55em, 공백 0.35em). 미리보기 PNG는
// 대체 글꼴로 그려져 한글이 약 25% 좁게 보이므로, PNG에서 한 줄에 들어가던 문장이
// PowerPoint에서는 두 줄로 넘친다. 그래서 미리보기가 아니라 실제 글꼴 기준으로 잡는다.
function glyphWidth(char, px) {
  const code = char.codePointAt(0);
  if (char === " ") return px * 0.35;
  if (char === "\n") return 0;
  if ((code >= 0x1100 && code <= 0x11FF) || (code >= 0x3000 && code <= 0x303F) || (code >= 0x3130 && code <= 0x318F)
    || (code >= 0x4E00 && code <= 0x9FFF) || (code >= 0xAC00 && code <= 0xD7AF) || (code >= 0xFF00 && code <= 0xFFEF)) return px * 0.98;
  if (/[0-9]/.test(char)) return px * 0.56;
  if (/[.,:;'"()\-·]/.test(char)) return px * 0.33;
  return px * 0.5;
}

// 텍스트 상자 안쪽 여백(좌우 7.2px, 상하 3.6px)과 맑은 고딕 줄 간격(약 1.3em)을 반영한다.
export function estimateTextFit(text, position, fontSize) {
  const px = fontSize * (96 / 72);
  const lineHeight = px * 1.3;
  const usableWidth = Math.max(1, position.width - 14);
  const allowedLines = Math.max(1, Math.floor((position.height - 7 + lineHeight * 0.15) / lineHeight));
  let neededLines = 0;
  let widestLine = 0;
  for (const line of String(text).split("\n")) {
    let width = 0;
    for (const char of line) width += glyphWidth(char, px);
    widestLine = Math.max(widestLine, Math.min(width, usableWidth));
    neededLines += Math.max(1, Math.ceil(width / usableWidth));
  }
  return { allowedLines, neededLines, fits: neededLines <= allowedLines, extent: { width: widestLine + 14, height: neededLines * lineHeight + 7 } };
}

function surfaceCoverage(surfaces, body, step = 8) {
  const columns = Math.ceil(body.width / step);
  const rows = Math.ceil(body.height / step);
  const covered = new Uint8Array(columns * rows);
  for (const { position } of surfaces) {
    const c0 = Math.max(0, Math.floor((position.left - body.left) / step));
    const c1 = Math.min(columns - 1, Math.floor((position.left + position.width - body.left - 1) / step));
    const r0 = Math.max(0, Math.floor((position.top - body.top) / step));
    const r1 = Math.min(rows - 1, Math.floor((position.top + position.height - body.top - 1) / step));
    for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) covered[r * columns + c] = 1;
  }
  let count = 0;
  for (const cell of covered) count += cell;
  return count / (columns * rows);
}

function largestEmptyBand(surfaces, body) {
  const intervals = surfaces.map(({ position }) => [position.top, position.top + position.height]).sort((a, b) => a[0] - b[0]);
  let cursor = body.top;
  let largest = { size: 0, from: body.top, to: body.top };
  for (const [top, bottom] of intervals) {
    if (top - cursor > largest.size) largest = { size: top - cursor, from: cursor, to: top };
    cursor = Math.max(cursor, bottom);
  }
  if (body.bottom - cursor > largest.size) largest = { size: body.bottom - cursor, from: cursor, to: body.bottom };
  return largest;
}

function sideBySidePairs(blockFrames) {
  const frames = Object.entries(blockFrames);
  let pairs = 0;
  for (let i = 0; i < frames.length; i += 1) {
    for (let j = i + 1; j < frames.length; j += 1) {
      const a = frames[i][1];
      const b = frames[j][1];
      const horizontallyDisjoint = a.left + a.width <= b.left + 8 || b.left + b.width <= a.left + 8;
      const verticalOverlap = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
      if (horizontallyDisjoint && verticalOverlap > 40) pairs += 1;
    }
  }
  return pairs;
}

function contains(outer, inner) {
  return inner.left >= outer.left && inner.top >= outer.top
    && inner.left + inner.width <= outer.left + outer.width && inner.top + inner.height <= outer.top + outer.height;
}

function inscribedRect(shape) {
  const { left, top, width, height } = shape.position;
  const scale = shape.kind === "ellipse" ? 0.71 : 0.5;
  const w = width * scale;
  const h = height * scale;
  return { left: left + (width - w) / 2, top: top + (height - h) / 2, width: w, height: h };
}

function checkLayoutQuality(primitives, blockIds, blockFrames, canvas) {
  const rules = LAYOUT_RULES[canvas.orientation];
  const body = bodySafeArea(canvas);
  const surfaces = primitives.filter((primitive) => SURFACE_KINDS.has(primitive.kind));
  const texts = primitives.filter((primitive) => primitive.kind === "text");
  const problems = [];

  const coverage = surfaceCoverage(surfaces, body);
  if (coverage < rules.minSurfaceCoverage) {
    problems.push(`surface shapes cover ${Math.round(coverage * 100)}% of the body safe area; at least ${Math.round(rules.minSurfaceCoverage * 100)}% is required. Use the width and height of the canvas instead of stacking a few boxes in one column`);
  }

  const band = largestEmptyBand(surfaces, body);
  if (band.size > rules.maxEmptyBand) {
    problems.push(`an empty horizontal band of ${Math.round(band.size)}px (top ${Math.round(band.from)} to ${Math.round(band.to)}) has no surface shape; the largest allowed gap is ${rules.maxEmptyBand}px. Fill the space with content or shrink the slide's blank area`);
  }

  const pairs = sideBySidePairs(blockFrames);
  if (blockIds.size >= 4 && pairs === 0) {
    problems.push("all blocks are stacked in a single column; at least two blocks must sit side by side when the slide has four or more blocks");
  }

  for (const blockId of blockIds) {
    const blockTexts = texts.filter((primitive) => primitive.blockId === blockId);
    const sizes = new Set(blockTexts.map((primitive) => primitive.fontSize));
    const largest = Math.max(...blockTexts.map((primitive) => primitive.fontSize));
    const headline = blockTexts.find((primitive) => primitive.fontSize === largest);
    if (sizes.size < 2 || largest < rules.minHeadlineFont || !headline?.bold) {
      problems.push(`block ${blockId} needs a bold headline text of at least ${rules.minHeadlineFont}pt and a smaller body text as separate text primitives; found font sizes [${[...sizes].join(", ")}]`);
    }
  }

  const overflows = [];
  for (const primitive of texts) {
    const fit = estimateTextFit(primitive.text, primitive.position, primitive.fontSize);
    if (!fit.fits) overflows.push(`${primitive.name} (${fit.neededLines} lines needed, ${fit.allowedLines} fit at ${primitive.fontSize}pt in ${Math.round(primitive.position.width)}x${Math.round(primitive.position.height)})`);
    const center = { left: primitive.position.left + primitive.position.width / 2, top: primitive.position.top + primitive.position.height / 2 };
    for (const shape of surfaces) {
      if (shape.kind !== "ellipse" && shape.kind !== "diamond") continue;
      const p = shape.position;
      if (center.left < p.left || center.left > p.left + p.width || center.top < p.top || center.top > p.top + p.height) continue;
      // 상자 크기가 아니라 실제 글자가 차지하는 넓이를 본다. 작은 원 안의 두 글자 라벨은
      // 상자가 원보다 넓어도 문제가 없고, 타원을 꽉 채운 문단은 상자가 안에 있어도 잘린다.
      const inscribed = inscribedRect(shape);
      // 가운데 정렬된 짧은 라벨은 상자 안쪽 여백을 다 쓰지 않으므로 20%까지 봐준다.
      if (fit.extent.width > inscribed.width * 1.2 || fit.extent.height > inscribed.height * 1.2) {
        problems.push(`text ${primitive.name} needs about ${Math.round(fit.extent.width)}x${Math.round(fit.extent.height)} but ${shape.kind} ${shape.name} only offers ${Math.round(inscribed.width)}x${Math.round(inscribed.height)} inside its curve; shorten the text, enlarge the shape, or use a rectangle`);
      }
    }
  }
  if (overflows.length) problems.push(`text does not fit its box: ${overflows.join("; ")}`);

  if (problems.length) {
    throw new Error(`Agent-authored shape plan fails the layout quality gate:\n- ${problems.join("\n- ")}`);
  }
  return {
    surfaceCoverage: Number(coverage.toFixed(3)),
    largestEmptyBand: Math.round(band.size),
    sideBySidePairs: pairs,
    textPrimitiveCount: texts.length,
  };
}

export function normalizeAgentShapePlan(value, { canvas, blockIds, blockRequiredTexts, protectedMetricValues, theme }) {
  requireObject(value, "blueprint.shape_plan");
  const designRationale = requiredString(value.design_rationale, "blueprint.shape_plan.design_rationale");
  const compositionSignature = requiredString(value.composition_signature, "blueprint.shape_plan.composition_signature");
  if (!Array.isArray(value.primitives) || value.primitives.length < MIN_PRIMITIVES) {
    throw new RangeError(`blueprint.shape_plan.primitives must contain at least ${MIN_PRIMITIVES} native primitives; found ${Array.isArray(value.primitives) ? value.primitives.length : 0}`);
  }
  const names = new Set();
  const textBlocks = new Set();
  const visualBlocks = new Set();
  const blockFrames = {};
  const primitives = value.primitives.map((item, index) => {
    requireObject(item, `blueprint.shape_plan.primitives[${index}]`);
    const name = requiredString(item.name, `blueprint.shape_plan.primitives[${index}].name`);
    if (names.has(name)) throw new Error(`blueprint.shape_plan primitive name must be unique: ${name}`);
    names.add(name);
    const kind = requiredString(item.kind, `blueprint.shape_plan.primitives[${index}].kind`);
    if (!ALLOWED_KINDS.has(kind)) throw new Error(`Unsupported agent-authored primitive kind: ${kind}`);
    const blockId = requiredString(item.block_id, `blueprint.shape_plan.primitives[${index}].block_id`);
    if (!blockIds.has(blockId)) throw new Error(`Agent-authored primitive ${name} references unknown block ${blockId}`);
    if (kind !== "text" && kind !== "line" && kind !== "connector") {
      visualBlocks.add(blockId);
    }
    const position = normalizePosition(item.position, `blueprint.shape_plan.primitives[${index}].position`, canvas);
    const normalized = {
      kind,
      name,
      blockId,
      position,
      fill: resolveColor(item.fill, `blueprint.shape_plan.primitives[${index}].fill`, theme, kind === "text" || kind === "line" || kind === "connector" ? "none" : theme.white),
      stroke: resolveColor(item.stroke, `blueprint.shape_plan.primitives[${index}].stroke`, theme, kind === "text" ? "none" : theme.line),
      lineWidth: item.line_width == null ? 1 : finiteNumber(item.line_width, `blueprint.shape_plan.primitives[${index}].line_width`),
    };
    if (normalized.lineWidth < 0 || normalized.lineWidth > 8) throw new RangeError(`Agent-authored primitive ${name} line_width must be between 0 and 8`);
    if (kind === "text") {
      normalized.text = requiredString(item.text, `blueprint.shape_plan.primitives[${index}].text`);
      normalized.fontSize = item.font_size == null ? 14 : finiteNumber(item.font_size, `blueprint.shape_plan.primitives[${index}].font_size`);
      if (normalized.fontSize < 10 || normalized.fontSize > 44) throw new RangeError(`Agent-authored text ${name} font_size must be between 10 and 44`);
      normalized.color = resolveColor(item.color, `blueprint.shape_plan.primitives[${index}].color`, theme, theme.ink);
      normalized.bold = item.bold === true;
      normalized.alignment = item.alignment == null ? "left" : requiredString(item.alignment, `blueprint.shape_plan.primitives[${index}].alignment`);
      if (!ALLOWED_ALIGNMENTS.has(normalized.alignment)) throw new Error(`Agent-authored text ${name} has unsupported alignment`);
      textBlocks.add(blockId);
    }
    if (kind === "connector") {
      normalized.from = requiredString(item.from, `blueprint.shape_plan.primitives[${index}].from`);
      normalized.to = requiredString(item.to, `blueprint.shape_plan.primitives[${index}].to`);
      normalized.connectorKind = item.connector_kind == null ? "straight" : requiredString(item.connector_kind, `blueprint.shape_plan.primitives[${index}].connector_kind`);
      if (!ALLOWED_CONNECTOR_KINDS.has(normalized.connectorKind)) throw new Error(`Agent-authored connector ${name} has unsupported connector_kind`);
      for (const [source, target] of [["from_side", "fromSide"], ["to_side", "toSide"]]) {
        if (item[source] == null) continue;
        const side = requiredString(item[source], `blueprint.shape_plan.primitives[${index}].${source}`);
        if (!ALLOWED_SIDES.has(side)) throw new Error(`Agent-authored connector ${name} has unsupported ${source}`);
        normalized[target] = side;
      }
    }
    // 연결선의 position은 자리표시자일 뿐 렌더러가 쓰지 않는다. 블록 영역에 넣으면 좌우
    // 배치 검사가 엉뚱한 겹침을 본다.
    if (kind !== "connector") blockFrames[blockId] = unionFrame(blockFrames[blockId], position);
    return normalized;
  });
  const primitivesByName = new Map(primitives.map((primitive) => [primitive.name, primitive]));
  for (const primitive of primitives) {
    if (primitive.kind !== "connector") continue;
    if (!names.has(primitive.from) || !names.has(primitive.to)) throw new Error(`Agent-authored connector ${primitive.name} must reference existing primitive names`);
    if (primitive.from === primitive.to) throw new Error(`Agent-authored connector ${primitive.name} cannot connect a primitive to itself`);
    if (primitivesByName.get(primitive.from)?.kind === "connector" || primitivesByName.get(primitive.to)?.kind === "connector") {
      throw new Error(`Agent-authored connector ${primitive.name} endpoints must be drawable shapes, not connectors`);
    }
  }
  // 렌더러는 연결선을 만나는 시점에 이미 그려진 도형만 참조할 수 있고, 참조가 없으면
  // 조용히 엉뚱한 직선으로 폴백한다. 저작 순서를 강제하는 대신 여기서 연결선을 뒤로
  // 모은다. 같은 종류끼리의 상대 순서는 그대로 둔다.
  const orderedPrimitives = [
    ...primitives.filter((primitive) => primitive.kind !== "connector"),
    ...primitives.filter((primitive) => primitive.kind === "connector"),
  ];
  for (const blockId of blockIds) {
    if (!blockFrames[blockId]) throw new Error(`Agent-authored shape plan does not represent block ${blockId}`);
    if (!visualBlocks.has(blockId)) throw new Error(`Agent-authored shape plan must include a non-text visual shape for block ${blockId}`);
    if (!textBlocks.has(blockId)) throw new Error(`Agent-authored shape plan must include editable text for block ${blockId}`);
    const blockText = comparableText(orderedPrimitives
      .filter((primitive) => primitive.kind === "text" && primitive.blockId === blockId)
      .map((primitive) => primitive.text)
      .join(" "));
    for (const requiredText of blockRequiredTexts.get(blockId)) {
      if (!blockText.includes(comparableText(requiredText.value))) {
        throw new Error(`Agent-authored shape plan is missing content.${requiredText.field} for block ${blockId}. Add a text primitive with block_id ${JSON.stringify(blockId)} whose text contains ${JSON.stringify(requiredText.value)}`);
      }
    }
  }
  const visibleText = comparableText(orderedPrimitives.filter((primitive) => primitive.kind === "text").map((primitive) => primitive.text).join(" "));
  for (const valueText of protectedMetricValues) {
    if (!visibleText.includes(comparableText(valueText))) throw new Error(`Agent-authored shape plan must visibly preserve protected metric ${valueText}`);
  }
  const layoutQuality = checkLayoutQuality(orderedPrimitives, blockIds, blockFrames, canvas);
  return {
    designRationale,
    compositionSignature,
    structureFingerprint: structureFingerprint(orderedPrimitives, canvas),
    primitives: orderedPrimitives,
    blockFrames,
    layoutQuality,
  };
}

export function agentShapeRecipe(shapePlan) {
  return {
    rendererKey: "agent_authored_shape_plan",
    requiredMotifs: ["agent_authored_composition", "editable_native_primitives"],
    producedMotifs: ["agent_authored_composition", "editable_native_primitives"],
    structureFingerprint: `agent_authored_shape_plan:${shapePlan.structureFingerprint}`,
    primitives: shapePlan.primitives,
  };
}
