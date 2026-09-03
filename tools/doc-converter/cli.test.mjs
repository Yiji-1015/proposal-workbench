import assert from "node:assert/strict";
import test from "node:test";
import { extractSectionsFromMarkdown } from "./cli.mjs";

test("마크다운 헤딩을 레벨과 함께 추출한다", () => {
  const sections = extractSectionsFromMarkdown("# 제안요청서\n본문\n### 2026. 6.\n꼬리말");
  assert.equal(sections.length, 2);
  assert.deepEqual(
    sections.map((s) => [s.heading, s.level, s.source]),
    [["제안요청서", 1, "markdown"], ["2026. 6.", 3, "markdown"]],
  );
  assert.equal(sections[0].text, "본문");
});

test("헤딩 스타일이 없는 문서는 개요 번호로 목차를 복원한다", () => {
  // HWP 장 제목이 표 셀에 들어가 kordoc이 #을 붙이지 못한 실제 RFP 패턴.
  const md = [
    "Ⅲ. 추진개요 및 과업범위",
    "1. 추진목표",
    "가. 사 업 명 : 고객경험 기반 AI 행동분석 시스템 구축",
    "2) 시나리오별 상세 과업내용",
    "나) 수집활동은 체계적으로 수집되어야 한다.",
  ].join("\n");
  assert.deepEqual(
    extractSectionsFromMarkdown(md).map((s) => [s.level, s.source]),
    [[1, "outline"], [2, "outline"], [3, "outline"], [4, "outline"], [5, "outline"]],
  );
});

test("표 마크업과 긴 문장은 제목으로 잡지 않는다", () => {
  const md = [
    "<tr><td>1. 사업개요</td></tr>",
    "| 1. 사업명 | 값 |",
    "- 1. 목록 항목",
    `가. ${"매우 긴 문장이 이어진다".repeat(6)}`,
  ].join("\n");
  assert.deepEqual(extractSectionsFromMarkdown(md), []);
});

test("두 방식이 섞인 문서는 둘 다 인정한다", () => {
  const sections = extractSectionsFromMarkdown("## 별표1 보안특약\n1. 사업개요\n내용");
  assert.deepEqual(
    sections.map((s) => s.source),
    ["markdown", "outline"],
  );
});

test("헤딩이 없으면 빈 배열을 반환한다", () => {
  assert.deepEqual(extractSectionsFromMarkdown("그냥 본문입니다.\n두 번째 줄."), []);
});
