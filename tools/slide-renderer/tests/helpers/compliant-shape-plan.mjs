// 테스트용 기준 청사진. 배치 품질 게이트가 요구하는 최소 구성(좌우 2단, 블록마다 굵은
// 헤드라인과 작은 본문, 세로 공간 채움)을 만족하는 세로형 shape_plan을 만든다.
// 5~6개 블록을 [2단 | 2단 | 풀폭 결론] 리듬으로 배치한다.

const PORTRAIT_SLOTS = [
  { left: 36, top: 180, width: 312, height: 300 },
  { left: 372, top: 180, width: 312, height: 300 },
  { left: 36, top: 500, width: 312, height: 300 },
  { left: 372, top: 500, width: 312, height: 300 },
  { left: 36, top: 820, width: 648, height: 190 },
  { left: 36, top: 1030, width: 648, height: 190 },
];

export function compliantShapePlan(blocks, { signature = "portrait-two-column-with-conclusion-band-v1", extraHeadlineSuffix = "" } = {}) {
  if (blocks.length < 5 || blocks.length > 6) throw new Error("compliantShapePlan supports 5 or 6 blocks");
  const slots = blocks.length === 5
    ? [PORTRAIT_SLOTS[0], PORTRAIT_SLOTS[1], PORTRAIT_SLOTS[2], PORTRAIT_SLOTS[3], { left: 36, top: 820, width: 648, height: 400 }]
    : PORTRAIT_SLOTS;
  return {
    design_rationale: "상단과 중단을 좌우 2단으로 나누고 하단 풀폭 밴드로 결론을 받친다.",
    composition_signature: signature,
    primitives: blocks.flatMap((block, index) => {
      const slot = { ...slots[index] };
      const surfaceKind = index === 2 ? "ellipse" : "roundRect";
      const inset = surfaceKind === "ellipse" ? 60 : 20;
      const bodyText = block.content?.summary ?? `${block.content?.headline ?? block.block_id} 세부 내용입니다.`;
      return [
        { kind: surfaceKind, name: `${block.block_id}-surface`, block_id: block.block_id, position: slot, fill: index % 2 ? "pale" : "white", stroke: "line" },
        { kind: "text", name: `${block.block_id}-headline`, block_id: block.block_id, position: { left: slot.left + inset, top: slot.top + inset, width: slot.width - inset * 2, height: 64 }, text: `${block.content.headline}${index === 0 ? extraHeadlineSuffix : ""}`, font_size: 16, color: "navy", bold: true },
        { kind: "text", name: `${block.block_id}-body`, block_id: block.block_id, position: { left: slot.left + inset, top: slot.top + inset + 72, width: slot.width - inset * 2, height: Math.max(60, slot.height - inset * 2 - 72) }, text: bodyText, font_size: 12, color: "ink" },
      ];
    }),
  };
}
