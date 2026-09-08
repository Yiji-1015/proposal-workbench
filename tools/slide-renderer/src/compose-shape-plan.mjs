// 구성(composition) → shape_plan 컴파일러.
//
// 에이전트가 좌표를 손으로 쓰면 환경(Claude Code, Codex)과 그날의 성의에 따라 결과가
// 갈렸다. 여기서는 에이전트가 "어느 골격의 어느 슬롯에 어느 블록을 두고, 안에 어떤
// 요소(칩·루프·체크리스트·판정·게이지·단계·수치·메모)를 넣을지"만 적는다. 상자 크기는
// 맑은 고딕 실측 폭(estimateTextFit)으로 계산하고, 결과는 그대로 배치 품질 게이트를
// 통과해야 한다. 슬롯에 내용이 넘치면 어느 블록이 몇 px 부족한지 알려 준다.
import { estimateTextFit } from "./agent-shape-plan.mjs";

const r = (left, top, width, height, extra = {}) => ({ left, top, width, height, ...extra });

// 골격 슬롯. references/composition-skeletons.md와 같은 좌표다.
export const SKELETONS = {
  portrait: {
    A: {
      description: "상단 2단 · 중앙 허브 · 하단 2단 · 결론 밴드",
      slots: { "top-left": r(36, 180, 312, 240), "top-right": r(372, 180, 312, 240), hub: r(216, 446, 288, 220, { ellipse: true }), "foot-left": r(36, 696, 312, 220), "foot-right": r(372, 696, 312, 220), band: r(36, 940, 648, 280) },
    },
    B: {
      description: "좌측 단계 레일 · 우측 상세 패널 · 하단 통제 밴드",
      slots: { rail: r(36, 180, 200, 760), "panel-1": r(256, 180, 428, 240), "panel-2": r(256, 440, 428, 240), "panel-3": r(256, 700, 428, 240), band: r(36, 960, 648, 260) },
    },
    "B-tall": {
      description: "좌측 단계 레일(전체 높이) · 우측 패널 4단 (2단은 좌우 분할)",
      slots: { rail: r(36, 180, 200, 1040), "panel-1": r(256, 180, 428, 190), "panel-2-left": r(256, 390, 206, 230), "panel-2-right": r(478, 390, 206, 230), "panel-3": r(256, 640, 428, 250), "panel-4": r(256, 910, 428, 310) },
    },
    C: {
      description: "풀폭 범위 밴드 · 중앙 3열 파이프라인 · 하단 2단 · 결론 밴드",
      slots: { band: r(36, 180, 648, 150), "col-1": r(36, 350, 204, 340), "col-2": r(258, 350, 204, 340), "col-3": r(480, 350, 204, 340), "foot-left": r(36, 710, 312, 240), "foot-right": r(372, 710, 312, 240), conclusion: r(36, 970, 648, 250) },
    },
    "C-deep": {
      description: "풀폭 범위 밴드 · 3열 파이프라인 · 하단 2단(결론 밴드 없음, 하단이 깊음)",
      slots: { band: r(36, 180, 648, 150), "col-1": r(36, 350, 204, 330), "col-2": r(258, 350, 204, 330), "col-3": r(480, 350, 204, 330), "foot-left": r(36, 706, 312, 514), "foot-right": r(372, 706, 312, 514) },
    },
    D: {
      description: "세로 스윔레인 3레인 · 하단 2단",
      slots: { "lane-1": r(36, 180, 204, 720), "lane-2": r(258, 180, 204, 720), "lane-3": r(480, 180, 204, 720), "foot-left": r(36, 930, 312, 290), "foot-right": r(372, 930, 312, 290) },
    },
    E: {
      description: "계층형: 상단 1 · 중단 3 · 하단 2",
      slots: { top: r(36, 180, 648, 170), "mid-1": r(36, 400, 204, 330), "mid-2": r(258, 400, 204, 330), "mid-3": r(480, 400, 204, 330), "foot-left": r(36, 770, 312, 450), "foot-right": r(372, 770, 312, 450) },
    },
    F: {
      description: "매핑형: 좌 항목 4 ↔ 우 대응 4 · 하단 결론",
      slots: Object.fromEntries([
        ...[0, 1, 2, 3].map((i) => [`left-${i + 1}`, r(36, 180 + i * 190, 280, 170)]),
        ...[0, 1, 2, 3].map((i) => [`right-${i + 1}`, r(404, 180 + i * 190, 280, 170)]),
        ["band", r(36, 960, 648, 260)],
      ]),
    },
  },
  landscape: {
    G: {
      description: "좌측 요약 · 중앙 흐름 + 세부 2단 · 우측 통제",
      slots: { summary: r(48, 160, 260, 490), flow: r(330, 160, 620, 300), "detail-left": r(330, 480, 300, 170), "detail-right": r(650, 480, 300, 170), control: r(972, 160, 260, 490) },
    },
    H: {
      description: "상단 3열 · 하단 풀폭 결론",
      slots: { "col-1": r(48, 160, 388, 330), "col-2": r(456, 160, 388, 330), "col-3": r(864, 160, 388, 330), band: r(48, 510, 1180, 150) },
    },
  },
};

const STYLES = {
  white: { fill: "white", stroke: "line", headline: "navy", body: "ink", muted: "gray" },
  pale: { fill: "pale", stroke: "line", headline: "navy", body: "ink", muted: "gray" },
  navy: { fill: "navy", stroke: "navy", headline: "white", body: "white", muted: "white" },
  primary: { fill: "primary", stroke: "primary", headline: "white", body: "white", muted: "white" },
};

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
}

function lineHeight(size) { return size * (96 / 72) * 1.3; }

function textHeight(value, width, size) {
  const fit = estimateTextFit(value, { left: 0, top: 0, width, height: 4000 }, size);
  return Math.round(fit.neededLines * lineHeight(size) + 8);
}

class Emitter {
  constructor() { this.primitives = []; this.names = new Set(); }
  add(kind, name, blockId, position, extra = {}) {
    if (this.names.has(name)) throw new Error(`composition produced a duplicate primitive name: ${name}`);
    this.names.add(name);
    this.primitives.push({ kind, name, block_id: blockId, position: { left: Math.round(position.left), top: Math.round(position.top), width: Math.round(position.width), height: Math.round(position.height) }, ...extra });
    return name;
  }
  shape(kind, name, blockId, position, fill, stroke, lineWidth = 1) { return this.add(kind, name, blockId, position, { fill, stroke, line_width: lineWidth }); }
  text(name, blockId, position, text, fontSize, { bold = false, color = "ink", alignment = "left" } = {}) {
    return this.add("text", name, blockId, position, { text, font_size: fontSize, bold, color, alignment });
  }
  connector(name, blockId, from, to, fromSide, toSide, stroke = "primary", lineWidth = 1.5) {
    return this.add("connector", name, blockId, { left: 100, top: 300, width: 20, height: 20 }, { from, to, from_side: fromSide, to_side: toSide, connector_kind: "straight", stroke, line_width: lineWidth });
  }
}

// 칩 한 개. 라벨이 한 줄에 안 들어가면 두 줄 칩으로 키운다.
function chipHeightFor(label, width, size) {
  const fit = estimateTextFit(label, { left: 0, top: 0, width, height: 4000 }, size);
  return fit.neededLines > 1 ? Math.round(fit.neededLines * lineHeight(size) + 16) : 38;
}

function emitChip(em, name, blockId, box, label, { fill = "white", stroke = "primary", color = "navy", size = 10.5 } = {}) {
  em.shape("roundRect", name, blockId, box, fill, stroke, 1.2);
  const lines = estimateTextFit(label, { ...box, height: 4000 }, size).neededLines;
  const th = Math.round(lines * lineHeight(size) + 8);
  em.text(`${name}-label`, blockId, { left: box.left, top: box.top + (box.height - th) / 2, width: box.width, height: th }, label, size, { bold: true, color, alignment: "center" });
}

const CHIP_FILLS = {
  white: { fill: "white", stroke: "primary", color: "navy" },
  accent: { fill: "white", stroke: "accent", color: "navy" },
  primary: { fill: "primary", stroke: "primary", color: "white" },
  navy: { fill: "navy", stroke: "navy", color: "white" },
};

// ---------- 요소 렌더러. 각 함수는 (em, ctx, item, cursorTop) → 다음 cursorTop ----------
// ctx: { blockId, inner: {left, width, bottom}, style, slotWidth }

function itemChips(em, ctx, item, top, index) {
  const labels = item.labels ?? [];
  const chipStyle = CHIP_FILLS[item.fill ?? "white"] ?? CHIP_FILLS.white;
  const size = item.size ?? 10.5;
  if (item.layout === "row") {
    const gap = 12;
    const width = (ctx.inner.width - gap * (labels.length - 1)) / labels.length;
    const height = Math.max(...labels.map((label) => chipHeightFor(label, width, size)));
    labels.forEach((label, i) => emitChip(em, `${ctx.blockId}-chip-${index}-${i + 1}`, ctx.blockId, { left: ctx.inner.left + i * (width + gap), top, width, height }, label, { ...chipStyle, size }));
    return top + height;
  }
  let cursor = top;
  labels.forEach((label, i) => {
    const height = chipHeightFor(label, ctx.inner.width, size);
    const style = item.alternate && i % 2 === 1 ? CHIP_FILLS.accent : chipStyle;
    emitChip(em, `${ctx.blockId}-chip-${index}-${i + 1}`, ctx.blockId, { left: ctx.inner.left, top: cursor, width: ctx.inner.width, height }, label, { ...style, size });
    cursor += height + 8;
  });
  return cursor - 8;
}

function itemLoop(em, ctx, item, top, index) {
  const labels = item.labels ?? [];
  const n = labels.length;
  // 폭이 넉넉하면 92px 원 안에 라벨을 넣고, 좁으면 번호 원 아래에 라벨을 둔다. 원을 줄여
  // 라벨을 욱여넣으면 곡선 안쪽 검사에 걸리고 실제로도 읽기 어렵다.
  const minGap = 16;
  const inside = 92 * n + minGap * (n - 1) <= ctx.inner.width;
  const diameter = inside ? 92 : 52;
  const gap = inside ? Math.min(24, (ctx.inner.width - diameter * n) / Math.max(1, n - 1)) : 0;
  const cell = inside ? diameter + gap : ctx.inner.width / n;
  const start = inside ? ctx.inner.left + (ctx.inner.width - (diameter * n + gap * (n - 1))) / 2 : ctx.inner.left;
  let cursor = top + diameter;
  labels.forEach((label, i) => {
    const emphasized = i === n - 1 && item.emphasize_last;
    const left = inside ? start + i * cell : start + i * cell + (cell - diameter) / 2;
    const name = `${ctx.blockId}-loop-${index}-${i + 1}`;
    em.shape("ellipse", name, ctx.blockId, { left, top, width: diameter, height: diameter }, emphasized ? "primary" : "pale", "primary", 1.5);
    if (inside) {
      em.text(`${name}-label`, ctx.blockId, { left: left + 2, top: top + Math.round(diameter / 2) - 21, width: diameter - 4, height: 42 }, label, 10, { bold: true, color: emphasized ? "white" : "navy", alignment: "center" });
    } else {
      em.text(`${name}-no`, ctx.blockId, { left, top: top + 14, width: diameter, height: 24 }, String(i + 1), 12, { bold: true, color: emphasized ? "white" : "navy", alignment: "center" });
      const labelHeight = textHeight(label, cell - 6, 10);
      em.text(`${name}-label`, ctx.blockId, { left: start + i * cell + 3, top: top + diameter + 6, width: cell - 6, height: labelHeight }, label, 10, { bold: true, color: "navy", alignment: "center" });
      cursor = Math.max(cursor, top + diameter + 6 + labelHeight);
    }
    if (i > 0) em.connector(`${ctx.blockId}-loop-${index}-link-${i}`, ctx.blockId, `${ctx.blockId}-loop-${index}-${i}`, name, "right", "left");
  });
  if (item.caption) {
    const height = textHeight(item.caption, ctx.inner.width - 8, 10.5);
    em.shape("roundRect", `${ctx.blockId}-loop-${index}-caption`, ctx.blockId, { left: ctx.inner.left, top: cursor + 20, width: ctx.inner.width, height: height + 8 }, "navy", "navy");
    em.text(`${ctx.blockId}-loop-${index}-caption-label`, ctx.blockId, { left: ctx.inner.left + 4, top: cursor + 24, width: ctx.inner.width - 8, height }, item.caption, 10.5, { bold: true, color: "white", alignment: "center" });
    em.connector(`${ctx.blockId}-loop-${index}-to-caption`, ctx.blockId, `${ctx.blockId}-loop-${index}-${n}`, `${ctx.blockId}-loop-${index}-caption`, "bottom", "top", "accent", 1.2);
    cursor += 20 + height + 8;
  }
  return cursor;
}

function itemChecklist(em, ctx, item, top, index) {
  let cursor = top;
  (item.labels ?? []).forEach((label, i) => {
    const last = item.emphasize_last && i === item.labels.length - 1;
    em.shape("rect", `${ctx.blockId}-check-${index}-${i + 1}`, ctx.blockId, { left: ctx.inner.left, top: cursor, width: ctx.inner.width, height: 36 }, "white", "line");
    em.shape("rect", `${ctx.blockId}-check-${index}-${i + 1}-mark`, ctx.blockId, { left: ctx.inner.left + 8, top: cursor + 8, width: 20, height: 20 }, last ? "navy" : "primary", last ? "navy" : "primary");
    em.text(`${ctx.blockId}-check-${index}-${i + 1}-label`, ctx.blockId, { left: ctx.inner.left + 38, top: cursor + 6, width: ctx.inner.width - 50, height: 26 }, label, 11, { bold: last, color: "ink" });
    cursor += 44;
  });
  return cursor - 8;
}

function itemGauges(em, ctx, item, top, index) {
  let cursor = top;
  (item.rows ?? []).forEach(([label, desc], i) => {
    const name = `${ctx.blockId}-gauge-${index}-${i + 1}`;
    em.shape("rect", name, ctx.blockId, { left: ctx.inner.left, top: cursor, width: ctx.inner.width, height: 60 }, "white", "line");
    em.shape("rect", `${name}-bar`, ctx.blockId, { left: ctx.inner.left, top: cursor, width: 6, height: 60 }, "primary", "primary");
    em.text(`${name}-label`, ctx.blockId, { left: ctx.inner.left + 18, top: cursor + 6, width: ctx.inner.width - 30, height: 24 }, label, 12, { bold: true, color: "navy" });
    if (desc) em.text(`${name}-desc`, ctx.blockId, { left: ctx.inner.left + 18, top: cursor + 30, width: ctx.inner.width - 30, height: 24 }, desc, 10.5, { color: "gray" });
    cursor += 72;
  });
  return cursor - 12;
}

function itemDecision(em, ctx, item, top, index) {
  const base = `${ctx.blockId}-decision-${index}`;
  const gateW = 110;
  const inputW = Math.min(130, Math.round(ctx.inner.width * 0.28));
  const outcomeW = ctx.inner.width - inputW - gateW - 32;
  emitChip(em, `${base}-input`, ctx.blockId, { left: ctx.inner.left, top: top + 22, width: inputW, height: 40 }, item.input, { ...CHIP_FILLS.white });
  em.shape("diamond", `${base}-gate`, ctx.blockId, { left: ctx.inner.left + inputW + 16, top, width: gateW, height: 84 }, "primary", "primary");
  em.text(`${base}-gate-label`, ctx.blockId, { left: ctx.inner.left + inputW + 16 + 25, top: top + 30, width: 60, height: 24 }, item.gate ?? "판정", 11, { bold: true, color: "white", alignment: "center" });
  em.connector(`${base}-in`, ctx.blockId, `${base}-input`, `${base}-gate`, "right", "left");
  const outcomes = item.outcomes ?? [];
  const outLeft = ctx.inner.left + inputW + 16 + gateW + 16;
  outcomes.forEach((label, i) => {
    const style = i === outcomes.length - 1 ? CHIP_FILLS.navy : CHIP_FILLS.accent;
    emitChip(em, `${base}-out-${i + 1}`, ctx.blockId, { left: outLeft, top: top + 2 + i * 46, width: outcomeW, height: 36 }, label, style);
    em.connector(`${base}-gate-out-${i + 1}`, ctx.blockId, `${base}-gate`, `${base}-out-${i + 1}`, "right", "left", i === outcomes.length - 1 ? "navy" : "accent");
  });
  return top + Math.max(84, 2 + outcomes.length * 46);
}

// 세로 단계 레일. 남은 슬롯 높이에 맞춰 원을 고르게 퍼뜨린다.
function itemSteps(em, ctx, item, top, index) {
  const labels = item.labels ?? [];
  const available = ctx.inner.bottom - top - 44;
  const spacing = labels.length > 1 ? Math.min(item.spacing ?? 150, available / (labels.length - 1)) : 0;
  labels.forEach((label, i) => {
    const y = top + i * spacing;
    const name = `${ctx.blockId}-step-${index}-${i + 1}`;
    const last = i === labels.length - 1;
    em.shape("ellipse", name, ctx.blockId, { left: ctx.inner.left, top: y, width: 44, height: 44 }, last ? "navy" : "primary", last ? "navy" : "primary");
    em.text(`${name}-no`, ctx.blockId, { left: ctx.inner.left, top: y + 10, width: 44, height: 24 }, String(i + 1), 12, { bold: true, color: "white", alignment: "center" });
    em.text(`${name}-label`, ctx.blockId, { left: ctx.inner.left + 52, top: y - 2, width: ctx.inner.width - 52, height: 48 }, label, 11, { bold: true, color: "navy" });
    if (i > 0) em.connector(`${ctx.blockId}-step-${index}-link-${i}`, ctx.blockId, `${ctx.blockId}-step-${index}-${i}`, name, "bottom", "top", "primary", 1.5);
  });
  return top + (labels.length - 1) * spacing + 44;
}

function itemNote(em, ctx, item, top, index) {
  const bodyHeight = item.body ? textHeight(item.body, ctx.inner.width - 20, 10) : 0;
  const height = 6 + 24 + bodyHeight + 6;
  const name = `${ctx.blockId}-note-${index}`;
  em.shape("rect", name, ctx.blockId, { left: ctx.inner.left, top, width: ctx.inner.width, height }, ctx.style.fill === "pale" ? "white" : "pale", "line");
  em.text(`${name}-label`, ctx.blockId, { left: ctx.inner.left + 10, top: top + 6, width: ctx.inner.width - 20, height: 24 }, item.label, 11, { bold: true, color: "navy" });
  if (item.body) em.text(`${name}-body`, ctx.blockId, { left: ctx.inner.left + 10, top: top + 30, width: ctx.inner.width - 20, height: bodyHeight }, item.body, 10, { color: "gray" });
  return top + height;
}

function itemText(em, ctx, item, top, index) {
  const size = item.size ?? 11;
  const height = textHeight(item.text, ctx.inner.width, size);
  em.text(`${ctx.blockId}-text-${index}`, ctx.blockId, { left: ctx.inner.left, top, width: ctx.inner.width, height }, item.text, size, { bold: item.bold === true, color: item.color ?? ctx.style.muted, alignment: item.alignment ?? "left" });
  return top + height;
}

// ---------- 표·매핑·계층·부분 수동 ----------

// 표. 헤더 행은 navy, 본문 행은 흰색·연한 파랑을 번갈아 쓴다. 셀 높이는 가장 긴 셀의 줄 수로 정한다.
function itemTable(em, ctx, item, top, index) {
  const columns = item.columns ?? [];
  const rows = item.rows ?? [];
  if (!columns.length) throw new Error(`composition block ${ctx.blockId} table needs columns[]`);
  const ratios = item.widths ?? columns.map(() => 1);
  const total = ratios.reduce((sum, value) => sum + value, 0);
  const widths = ratios.map((value) => (ctx.inner.width * value) / total);
  const size = item.size ?? 10.5;
  const base = `${ctx.blockId}-table-${index}`;
  let cursor = top;
  const drawRow = (cells, rowIndex, header) => {
    const height = Math.max(30, ...cells.map((cell, c) => textHeight(String(cell ?? ""), widths[c] - 12, size) + 6));
    let left = ctx.inner.left;
    cells.forEach((cell, c) => {
      const name = `${base}-r${rowIndex}-c${c + 1}`;
      const fill = header ? "navy" : rowIndex % 2 === 0 ? "pale" : "white";
      em.shape("rect", name, ctx.blockId, { left, top: cursor, width: widths[c], height }, fill, header ? "navy" : "line");
      em.text(`${name}-label`, ctx.blockId, { left: left + 6, top: cursor + 3, width: widths[c] - 12, height: height - 6 }, String(cell ?? ""), size, { bold: header || (item.bold_first_column && c === 0), color: header ? "white" : "ink", alignment: header ? "center" : c === 0 ? "left" : "center" });
      left += widths[c];
    });
    return height;
  };
  cursor += drawRow(columns, 0, true);
  rows.forEach((cells, r) => {
    if (cells.length !== columns.length) throw new Error(`composition block ${ctx.blockId} table row ${r + 1} has ${cells.length} cells but ${columns.length} columns`);
    cursor += drawRow(cells, r + 1, false);
  });
  return cursor;
}

// 좌우 매핑. 왼쪽 항목과 오른쪽 대응을 칩 두 열로 두고 links로 잇는다. links가 없으면 같은 행끼리 잇는다.
function itemMapping(em, ctx, item, top, index) {
  const left = item.left ?? [];
  const right = item.right ?? [];
  if (!left.length || !right.length) throw new Error(`composition block ${ctx.blockId} mapping needs left[] and right[]`);
  const gutter = item.gutter ?? 56;
  const width = (ctx.inner.width - gutter) / 2;
  const size = item.size ?? 10.5;
  const base = `${ctx.blockId}-map-${index}`;
  const rowGap = 10;
  const column = (labels, x, key, style) => {
    let cursor = top;
    labels.forEach((label, i) => {
      const height = chipHeightFor(label, width, size);
      emitChip(em, `${base}-${key}-${i + 1}`, ctx.blockId, { left: x, top: cursor, width, height }, label, { ...style, size });
      cursor += height + rowGap;
    });
    return cursor - rowGap;
  };
  const leftEnd = column(left, ctx.inner.left, "l", CHIP_FILLS[item.left_fill ?? "white"] ?? CHIP_FILLS.white);
  const rightEnd = column(right, ctx.inner.left + width + gutter, "r", CHIP_FILLS[item.right_fill ?? "primary"] ?? CHIP_FILLS.primary);
  const links = item.links ?? left.map((_, i) => [i + 1, Math.min(i + 1, right.length)]);
  links.forEach(([l, r], i) => {
    if (!left[l - 1] || !right[r - 1]) throw new Error(`composition block ${ctx.blockId} mapping link ${i + 1} points outside left/right`);
    em.connector(`${base}-link-${i + 1}`, ctx.blockId, `${base}-l-${l}`, `${base}-r-${r}`, "right", "left", item.stroke ?? "accent", 1.2);
  });
  return Math.max(leftEnd, rightEnd);
}

// 계층. 루트 상자 아래에 자식 상자를 가로로 두고, 자식 아래에 손자 칩을 세로로 단다.
function itemHierarchy(em, ctx, item, top, index) {
  if (!item.root) throw new Error(`composition block ${ctx.blockId} hierarchy needs root`);
  const children = item.children ?? [];
  const base = `${ctx.blockId}-tree-${index}`;
  const rootWidth = Math.min(ctx.inner.width, Math.max(160, ctx.inner.width * 0.5));
  const rootHeight = chipHeightFor(item.root, rootWidth, 11) + 4;
  emitChip(em, `${base}-root`, ctx.blockId, { left: ctx.inner.left + (ctx.inner.width - rootWidth) / 2, top, width: rootWidth, height: rootHeight }, item.root, { ...CHIP_FILLS.navy, size: 11 });
  if (!children.length) return top + rootHeight;
  const gap = 12;
  const width = (ctx.inner.width - gap * (children.length - 1)) / children.length;
  const childTop = top + rootHeight + 28;
  let deepest = childTop;
  children.forEach((child, i) => {
    const label = typeof child === "string" ? child : child.label;
    const leaves = typeof child === "string" ? [] : child.children ?? [];
    const left = ctx.inner.left + i * (width + gap);
    const height = chipHeightFor(label, width, 10.5);
    emitChip(em, `${base}-c${i + 1}`, ctx.blockId, { left, top: childTop, width, height }, label, { ...CHIP_FILLS.white, size: 10.5 });
    em.connector(`${base}-root-c${i + 1}`, ctx.blockId, `${base}-root`, `${base}-c${i + 1}`, "bottom", "top", "primary", 1.2);
    let cursor = childTop + height + 8;
    leaves.forEach((leaf, j) => {
      const leafHeight = chipHeightFor(leaf, width, 10);
      emitChip(em, `${base}-c${i + 1}-l${j + 1}`, ctx.blockId, { left, top: cursor, width, height: leafHeight }, leaf, { ...CHIP_FILLS.accent, size: 10 });
      cursor += leafHeight + 6;
    });
    deepest = Math.max(deepest, leaves.length ? cursor - 6 : childTop + height);
  });
  return deepest;
}

// 부분 수동 요소. 골격에 없는 도식 하나를 슬롯 안에서만 직접 그린다. 좌표는 origin에 따라
// "flow"(본문 아래 현재 위치, x는 안쪽 여백 기준) 또는 "slot"(슬롯 좌상단) 기준의 상대값이다.
// 이름은 블록 접두어가 붙고, 연결선의 from/to는 같은 요소 안의 이름이나 다른 블록 ID를 쓴다.
function itemPrimitives(em, ctx, item, top, index) {
  const list = item.primitives ?? [];
  if (!list.length) throw new Error(`composition block ${ctx.blockId} primitives item needs primitives[]`);
  const origin = item.origin === "slot" ? { left: ctx.slot.left, top: ctx.slot.top } : { left: ctx.inner.left, top };
  const prefix = `${ctx.blockId}-custom-${index}-`;
  const local = new Set(list.filter((p) => p.kind !== "connector").map((p) => p.name));
  let bottom = top;
  for (const [i, raw] of list.entries()) {
    requireObject(raw, `composition block ${ctx.blockId} primitives[${i}]`);
    if (typeof raw.name !== "string" || !raw.name) throw new Error(`composition block ${ctx.blockId} primitives[${i}] needs a name`);
    const name = prefix + raw.name;
    if (raw.kind === "connector") {
      const resolve = (value) => (local.has(value) ? prefix + value : em.names.has(value) ? value : `${value}-surface`);
      em.connector(name, ctx.blockId, resolve(raw.from), resolve(raw.to), raw.from_side, raw.to_side, raw.stroke ?? "primary", raw.line_width ?? 1.5);
      continue;
    }
    requireObject(raw.position, `composition block ${ctx.blockId} primitives[${i}].position`);
    const position = { left: origin.left + raw.position.left, top: origin.top + raw.position.top, width: raw.position.width, height: raw.position.height };
    if (raw.kind === "text") {
      em.text(name, ctx.blockId, position, raw.text, raw.font_size ?? 11, { bold: raw.bold === true, color: raw.color ?? "ink", alignment: raw.alignment ?? "left" });
    } else {
      em.shape(raw.kind, name, ctx.blockId, position, raw.fill ?? "white", raw.stroke ?? "line", raw.line_width ?? 1);
    }
    bottom = Math.max(bottom, position.top + position.height);
  }
  return bottom;
}

const ITEM_RENDERERS = { chips: itemChips, loop: itemLoop, checklist: itemChecklist, gauges: itemGauges, decision: itemDecision, steps: itemSteps, note: itemNote, text: itemText, table: itemTable, mapping: itemMapping, hierarchy: itemHierarchy, primitives: itemPrimitives };

function defaultSizes(slot, styleName) {
  if (styleName === "navy" || styleName === "primary") return { headline: 17, body: 12 };
  if (slot.width <= 210) return { headline: 15, body: 11.5 };
  return { headline: 16, body: 12 };
}

function resolveSlot(spec, skeleton, blockId) {
  if (spec.slot && typeof spec.slot === "object") {
    const { left, top, width, height } = spec.slot;
    if (![left, top, width, height].every(Number.isFinite)) throw new Error(`composition block ${blockId} slot must have numeric left, top, width, height`);
    return { left, top, width, height, ellipse: spec.slot.ellipse === true };
  }
  if (typeof spec.slot !== "string") throw new Error(`composition block ${blockId} needs a slot name or rect`);
  const slot = skeleton.slots[spec.slot];
  if (!slot) throw new Error(`composition block ${blockId} refers to unknown slot ${spec.slot}; available: ${Object.keys(skeleton.slots).join(", ")}`);
  return { ...slot };
}

function composeBlock(em, blockId, content, spec, slot) {
  const styleName = spec.style ?? (slot.ellipse ? "primary" : "white");
  const style = STYLES[styleName];
  if (!style) throw new Error(`composition block ${blockId} has unknown style ${styleName}; use white, pale, navy, or primary`);
  const kind = slot.ellipse ? "ellipse" : (spec.shape ?? "roundRect");
  em.shape(kind, `${blockId}-surface`, blockId, slot, style.fill, style.stroke, 1);

  // 타원은 내접 사각형 안에만 글을 둔다.
  let inner;
  if (slot.ellipse) {
    const w = slot.width * 0.68; const h = slot.height * 0.68;
    inner = { left: slot.left + (slot.width - w) / 2, top: slot.top + (slot.height - h) / 2, width: w, bottom: slot.top + (slot.height + h) / 2 };
  } else {
    const pad = spec.padding ?? (slot.width <= 210 ? 14 : 20);
    // 아래 여백은 위·옆보다 좁아도 된다. 칩이 표면 테두리에 12px만 남기고 닿는 편이
    // 표면 아래를 비워 두는 것보다 낫다.
    inner = { left: slot.left + pad, top: slot.top + pad - 4, width: slot.width - pad * 2, bottom: slot.top + slot.height - Math.min(pad, 12) };
  }
  if (spec.accent === "bar" && !slot.ellipse) {
    em.shape("rect", `${blockId}-accent`, blockId, { left: slot.left + 12, top: slot.top + 16, width: 6, height: slot.height - 32 }, "primary", "primary");
    inner = { ...inner, left: inner.left + 12, width: inner.width - 12 };
  } else if (spec.accent === "stripe" && !slot.ellipse) {
    em.shape("rect", `${blockId}-accent`, blockId, { left: inner.left, top: slot.top + 14, width: 40, height: 5 }, "primary", "primary");
    inner = { ...inner, top: inner.top + 10 };
  }
  const sizes = defaultSizes(slot, styleName);
  const headlineSize = spec.headline_size ?? sizes.headline;
  const bodySize = spec.body_size ?? sizes.body;
  const alignment = spec.align ?? (slot.ellipse ? "center" : "left");

  // 수치 배지는 우측 상단에 고정하고 본문 폭을 그만큼 줄인다.
  let textWidth = inner.width;
  const metric = (spec.items ?? []).find((item) => item.type === "metric");
  if (metric) {
    const badge = { left: slot.left + slot.width - 24 - 132, top: slot.top + 24, width: 132, height: 100 };
    em.shape("roundRect", `${blockId}-metric`, blockId, badge, styleName === "navy" ? "primary" : "navy", styleName === "navy" ? "primary" : "navy");
    em.text(`${blockId}-metric-value`, blockId, { left: badge.left, top: badge.top + 12, width: badge.width, height: 44 }, metric.value, 24, { bold: true, color: "white", alignment: "center" });
    if (metric.label) em.text(`${blockId}-metric-label`, blockId, { left: badge.left, top: badge.top + 58, width: badge.width, height: 26 }, metric.label, 11, { bold: true, color: "white", alignment: "center" });
    textWidth = badge.left - inner.left - 20;
  }

  let cursor = inner.top;
  const headlineHeight = textHeight(content.headline, textWidth, headlineSize);
  em.text(`${blockId}-headline`, blockId, { left: inner.left, top: cursor, width: textWidth, height: headlineHeight }, content.headline, headlineSize, { bold: true, color: style.headline, alignment });
  cursor += headlineHeight + 4;
  if (content.summary) {
    const bodyHeight = textHeight(content.summary, textWidth, bodySize);
    em.text(`${blockId}-body`, blockId, { left: inner.left, top: cursor, width: textWidth, height: bodyHeight }, content.summary, bodySize, { color: style.body, alignment });
    cursor += bodyHeight;
  }

  const items = (spec.items ?? []).filter((item) => item.type !== "metric");
  const pinned = items.filter((item) => item.pin === "bottom");
  const flowing = items.filter((item) => item.pin !== "bottom");
  const ctx = { blockId, inner, style, slotWidth: slot.width, slot };
  const gap = spec.item_gap ?? 14;
  flowing.forEach((item, index) => {
    const render = ITEM_RENDERERS[item.type];
    if (!render) throw new Error(`composition block ${blockId} has unknown item type ${item.type}; use ${Object.keys(ITEM_RENDERERS).join(", ")}`);
    cursor = render(em, ctx, item, cursor + (item.gap ?? gap), index + 1);
  });
  // 하단 고정 요소는 슬롯 바닥에서 위로 쌓는다.
  let floor = inner.bottom;
  [...pinned].reverse().forEach((item, i) => {
    const render = ITEM_RENDERERS[item.type];
    if (!render) throw new Error(`composition block ${blockId} has unknown item type ${item.type}`);
    // 높이를 알기 위해 한 번 임시로 그려 본다.
    const probe = new Emitter();
    const end = render(probe, ctx, item, 0, 900 + i);
    const top = floor - end;
    render(em, ctx, item, top, 900 + i);
    floor = top - 12;
  });
  if (cursor > floor + 1) {
    throw new Error(`composition block ${blockId} overflows its slot by ${Math.round(cursor - floor)}px (content ends at ${Math.round(cursor)}, slot allows ${Math.round(floor)}). Shorten the summary or item labels, drop an item, or give the block a taller slot`);
  }
  return { cursor, floor };
}

export function composeShapePlan(composition, { blocks, orientation }) {
  requireObject(composition, "blueprint.composition");
  const family = SKELETONS[orientation];
  const skeletonName = composition.skeleton;
  const skeleton = skeletonName ? family[skeletonName] : { slots: {} };
  if (skeletonName && !skeleton) throw new Error(`composition.skeleton ${skeletonName} is not a ${orientation} skeleton; available: ${Object.keys(family).join(", ")}`);
  requireObject(composition.blocks, "blueprint.composition.blocks");
  const em = new Emitter();
  const contentById = new Map(blocks.map((block) => [block.block_id, block.content ?? {}]));
  const usedSlots = new Set();
  for (const block of blocks) {
    const spec = composition.blocks[block.block_id];
    if (!spec) throw new Error(`composition.blocks is missing block ${block.block_id}`);
    const slot = resolveSlot(spec, skeleton, block.block_id);
    if (typeof spec.slot === "string") {
      if (usedSlots.has(spec.slot)) throw new Error(`composition assigns slot ${spec.slot} to more than one block`);
      usedSlots.add(spec.slot);
    }
    composeBlock(em, block.block_id, contentById.get(block.block_id), spec, slot);
  }
  for (const [index, link] of (composition.connectors ?? []).entries()) {
    requireObject(link, `composition.connectors[${index}]`);
    const resolveName = (value) => (em.names.has(value) ? value : `${value}-surface`);
    const from = resolveName(link.from);
    const to = resolveName(link.to);
    if (!em.names.has(from) || !em.names.has(to)) throw new Error(`composition.connectors[${index}] refers to unknown block or primitive: ${link.from} → ${link.to}`);
    const owner = em.primitives.find((primitive) => primitive.name === from).block_id;
    em.connector(link.name ?? `link-${index + 1}`, owner, from, to, link.from_side, link.to_side, link.stroke ?? "primary", link.width ?? 1.5);
  }
  return {
    design_rationale: composition.rationale,
    composition_signature: composition.signature,
    primitives: em.primitives,
  };
}

// 블록별로 어떤 슬롯에 어떤 요소를 썼는지 요약한다. 와이어프레임 승인 때 "이 블록이 칩
// 나열로 끝났는지"를 사람이 바로 보게 하려는 것이다.
export function summarizeComposition(composition, blocks) {
  const summary = {};
  for (const block of blocks) {
    const spec = composition.blocks?.[block.block_id];
    if (!spec) continue;
    const slot = typeof spec.slot === "string" ? spec.slot : `custom ${spec.slot?.width}x${spec.slot?.height}@${spec.slot?.left},${spec.slot?.top}`;
    const items = (spec.items ?? []).map((item) => {
      const count = item.labels?.length ?? item.rows?.length ?? item.children?.length ?? item.primitives?.length ?? item.left?.length ?? null;
      return count == null ? item.type : `${item.type}(${count})`;
    });
    summary[block.block_id] = { slot, style: spec.style ?? "white", items: items.length ? items : ["headline+body only"] };
  }
  return summary;
}
