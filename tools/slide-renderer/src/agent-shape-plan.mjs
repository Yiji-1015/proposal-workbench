import { createHash } from "node:crypto";

const ALLOWED_KINDS = new Set(["text", "rect", "roundRect", "ellipse", "diamond", "line", "connector"]);
const ALLOWED_ALIGNMENTS = new Set(["left", "center", "right"]);
const ALLOWED_SIDES = new Set(["left", "right", "top", "bottom"]);
const ALLOWED_CONNECTOR_KINDS = new Set(["straight"]);

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

function normalizePosition(value, name, canvas) {
  requireObject(value, name);
  const position = {
    left: finiteNumber(value.left, `${name}.left`),
    top: finiteNumber(value.top, `${name}.top`),
    width: finiteNumber(value.width, `${name}.width`),
    height: finiteNumber(value.height, `${name}.height`),
  };
  if (position.width <= 0 || position.height <= 0) throw new RangeError(`${name} width and height must be positive`);
  const margin = 24;
  const bodyTop = canvas.orientation === "portrait" ? 166 : 150;
  const bodyBottom = canvas.height - 50;
  if (position.left < margin || position.top < bodyTop || position.left + position.width > canvas.width - margin || position.top + position.height > bodyBottom) {
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

export function normalizeAgentShapePlan(value, { canvas, blockIds, blockRequiredTexts, protectedMetricValues, theme }) {
  requireObject(value, "blueprint.shape_plan");
  const designRationale = requiredString(value.design_rationale, "blueprint.shape_plan.design_rationale");
  const compositionSignature = requiredString(value.composition_signature, "blueprint.shape_plan.composition_signature");
  if (!Array.isArray(value.primitives) || value.primitives.length < 10) {
    throw new RangeError("blueprint.shape_plan.primitives must contain at least 10 native primitives");
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
    blockFrames[blockId] = unionFrame(blockFrames[blockId], position);
    return normalized;
  });
  const primitiveIndexes = new Map(primitives.map((primitive, index) => [primitive.name, index]));
  const primitivesByName = new Map(primitives.map((primitive) => [primitive.name, primitive]));
  for (const [index, primitive] of primitives.entries()) {
    if (primitive.kind !== "connector") continue;
    if (!names.has(primitive.from) || !names.has(primitive.to)) throw new Error(`Agent-authored connector ${primitive.name} must reference existing primitive names`);
    if (primitive.from === primitive.to) throw new Error(`Agent-authored connector ${primitive.name} cannot connect a primitive to itself`);
    if (primitivesByName.get(primitive.from)?.kind === "connector" || primitivesByName.get(primitive.to)?.kind === "connector") {
      throw new Error(`Agent-authored connector ${primitive.name} endpoints must be drawable shapes, not connectors`);
    }
    if (primitiveIndexes.get(primitive.from) >= index || primitiveIndexes.get(primitive.to) >= index) {
      throw new Error(`Agent-authored connector ${primitive.name} must appear after its endpoint primitives`);
    }
  }
  for (const blockId of blockIds) {
    if (!blockFrames[blockId]) throw new Error(`Agent-authored shape plan does not represent block ${blockId}`);
    if (!visualBlocks.has(blockId)) throw new Error(`Agent-authored shape plan must include a non-text visual shape for block ${blockId}`);
    if (!textBlocks.has(blockId)) throw new Error(`Agent-authored shape plan must include editable text for block ${blockId}`);
    const blockText = primitives.filter((primitive) => primitive.kind === "text" && primitive.blockId === blockId).map((primitive) => primitive.text).join("\n");
    const normalizedBlockText = blockText.replace(/\s+/g, " ").trim();
    for (const requiredText of blockRequiredTexts.get(blockId)) {
      if (!normalizedBlockText.includes(requiredText.value.replace(/\s+/g, " ").trim())) {
        throw new Error(`Agent-authored shape plan must preserve content.${requiredText.field} for block ${blockId}`);
      }
    }
  }
  const visibleText = primitives.filter((primitive) => primitive.kind === "text").map((primitive) => primitive.text).join("\n").replace(/\s+/g, " ").trim();
  for (const valueText of protectedMetricValues) {
    if (!visibleText.includes(valueText.replace(/\s+/g, " ").trim())) throw new Error(`Agent-authored shape plan must visibly preserve protected metric ${valueText}`);
  }
  return { designRationale, compositionSignature, structureFingerprint: structureFingerprint(primitives, canvas), primitives, blockFrames };
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
