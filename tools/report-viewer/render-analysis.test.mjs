import test from "node:test";
import assert from "node:assert/strict";
import { renderAnalysisHtml } from "./render-analysis.mjs";

const minimal = {
  doc_name: "샘플.hwp",
  analyzed_at: "2026-09-04",
  overview: [{ label: "사업명", value: "샘플 사업" }],
  workflow_steps: [{ step: 1, title: "수집", desc: "수집 단계" }],
  requirements: [
    { id: "SER-001", category: "서비스", name: "대화형", summary: "정의 A", priority: "필수", source_refs: [] },
    { id: "SEC-001", category: "보안", name: "정책 준수", summary: "정의 B", priority: "권장", source_refs: [] },
  ],
  domains: [{ name: "포털", desc: "화면", req_count: 1 }, { name: "보안", desc: "통제", req_count: 1 }],
  explicit_features: [],
  hidden_features: [{ text: "OCR", reason: "스캔 비중" }],
  kpis: [{ id: "M-01", name: "응답", value_text: "3초 이내", level: "mandatory", source_refs: [] }],
  risk_areas: [{ area: "전기공사", reason: "면허 필요", level: "높음" }],
};

test("계약 필드를 모두 렌더링한다", () => {
  const html = renderAnalysisHtml(minimal);
  for (const needle of ["샘플.hwp", "샘플 사업", "수집 단계", "SER-001", "SEC-001",
                        "3초 이내", "OCR", "전기공사"]) {
    assert.ok(html.includes(needle), `${needle} 누락`);
  }
});

test("사용자 데이터를 이스케이프한다", () => {
  const html = renderAnalysisHtml({
    ...minimal,
    doc_name: '<script>alert(1)</script>',
    risk_areas: [{ area: 'a"b', reason: "c<d>e", level: "높음" }],
  });
  assert.ok(!html.includes("<script>alert(1)</script>"), "스크립트가 그대로 들어갔다");
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(html.includes("c&lt;d&gt;e"));
});

test("외부 CDN을 참조하지 않는다", () => {
  const html = renderAnalysisHtml(minimal);
  assert.ok(!/https?:\/\//.test(html), "외부 URL이 들어 있다");
});

test("필터 대상 행에 분류와 검색 텍스트가 실린다", () => {
  const html = renderAnalysisHtml(minimal);
  assert.ok(html.includes('data-cat="서비스"'));
  assert.ok(html.includes('data-t="ser-001 대화형 정의 a"'));
});

test("도메인 막대 폭은 최댓값 기준 백분율이다", () => {
  const html = renderAnalysisHtml({
    ...minimal,
    domains: [{ name: "보안", desc: "", req_count: 20 }, { name: "포털", desc: "", req_count: 5 }],
  });
  assert.ok(html.includes('style="width:100%"'));
  assert.ok(html.includes('style="width:25%"'));
});
