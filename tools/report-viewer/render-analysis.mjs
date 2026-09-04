#!/usr/bin/env node
/**
 * render-analysis.mjs
 * rfp_analysis.json(RfpAnalysisContract) -> 자체 완결 HTML 보고서.
 *
 * 서버 없이 파일 하나로 열리도록 CSS/JS를 인라인한다(Zero CDN).
 * 색은 tools/hitl-bridge/public/style.css의 토큰을 그대로 쓴다.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const LEVEL_CLASS = { "높음": "lv-high", "중간": "lv-mid", "낮음": "lv-low" };

function head(title) {
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg-main:#f8fafc;--bg-card:#fff;--text-main:#0f172a;--text-muted:#64748b;
--primary:#1d4ed8;--border:#e2e8f0;--high:#b91c1c;--high-bg:#fef2f2;
--mid:#b45309;--mid-bg:#fffbeb;--low:#065f46;--low-bg:#ecfdf5;
--font:system-ui,-apple-system,"Segoe UI",Roboto,"Malgun Gothic","Pretendard",sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font);background:var(--bg-main);color:var(--text-main);
line-height:1.6;padding:20px;font-size:14px}
.wrap{max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:18px}
h1{font-size:21px;line-height:1.35}
h2{font-size:16px;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid var(--primary)}
h3{font-size:13px;color:var(--text-muted);margin:14px 0 6px;font-weight:600}
.sub{color:var(--text-muted);font-size:12px;margin-top:4px}
section{background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:16px 18px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--border);vertical-align:top}
th{background:var(--bg-main);font-weight:600;font-size:12px;color:var(--text-muted);
position:sticky;top:0}
tbody tr:hover{background:#f1f5f9}
.scroll{overflow:auto;max-height:520px;border:1px solid var(--border);border-radius:8px}
.tags{display:flex;flex-wrap:wrap;gap:6px}
.tag{border:1px solid var(--border);border-radius:999px;padding:2px 10px;font-size:12px;
background:var(--bg-main);cursor:pointer;user-select:none}
.tag[aria-pressed="true"]{background:var(--primary);color:#fff;border-color:var(--primary)}
.kv{display:grid;grid-template-columns:130px 1fr;gap:2px 14px}
.kv dt{color:var(--text-muted);font-size:13px}
.kv dd{font-size:13px}
.bar{height:7px;background:var(--primary);border-radius:4px;min-width:2px}
.lv-high{color:var(--high);background:var(--high-bg)}
.lv-mid{color:var(--mid);background:var(--mid-bg)}
.lv-low{color:var(--low);background:var(--low-bg)}
.pill{border-radius:6px;padding:1px 8px;font-size:12px;font-weight:600;white-space:nowrap}
.mono{font-family:ui-monospace,Consolas,monospace;font-size:12px;white-space:nowrap}
.quote{color:var(--text-muted);font-size:12px;line-height:1.5}
input[type=search]{width:100%;padding:7px 10px;border:1px solid var(--border);
border-radius:8px;font:inherit;font-size:13px}
.count{color:var(--text-muted);font-size:12px}
.note{background:var(--mid-bg);border-left:3px solid var(--mid);padding:9px 12px;
border-radius:0 6px 6px 0;font-size:13px}
</style>
`;
}

function sectionOverview(d) {
  return `<section>
<h1>${esc(d.doc_name)} — RFP 분석보고서</h1>
<p class="sub">분석일 ${esc(d.analyzed_at)} · 요구사항 ${d.requirements.length}건 · 정량지표 ${d.kpis.length}건 · 리스크 ${d.risk_areas.length}건</p>
<h3>사업 개요</h3>
<dl class="kv">${d.overview.map((o) => `<dt>${esc(o.label)}</dt><dd>${esc(o.value)}</dd>`).join("")}</dl>
</section>`;
}

function sectionFlow(d) {
  const max = Math.max(...d.domains.map((x) => x.req_count), 1);
  return `<section>
<h2>요구사항 처리 흐름</h2>
<table><thead><tr><th style="width:34px">#</th><th style="width:150px">단계</th><th>내용</th></tr></thead><tbody>
${d.workflow_steps.map((s) => `<tr><td>${s.step}</td><td><b>${esc(s.title)}</b></td><td>${esc(s.desc)}</td></tr>`).join("")}
</tbody></table>
<h3>기능 도메인 분포 (요구사항 1건 = 주 도메인 1개)</h3>
<table><tbody>
${d.domains.slice().sort((a, b) => b.req_count - a.req_count).map((x) => `<tr>
<td style="width:110px"><b>${esc(x.name)}</b></td>
<td style="width:44px" class="mono">${x.req_count}</td>
<td style="width:190px"><div class="bar" style="width:${Math.round((x.req_count / max) * 100)}%"></div></td>
<td>${esc(x.desc)}</td></tr>`).join("")}
</tbody></table>
</section>`;
}

function sectionKpis(d) {
  const row = (k) => `<tr>
<td class="mono">${esc(k.id ?? "")}</td><td>${esc(k.name)}</td>
<td>${esc(k.value_text)}</td>
<td><span class="pill ${k.level === "guideline" ? "lv-mid" : "lv-low"}">${esc(k.level ?? "mandatory")}</span></td></tr>`;
  return `<section>
<h2>정량·기한 조건</h2>
<p class="sub">원문 표현(<code>value_text</code>)을 그대로 보존했다. guideline은 RFP가 예시로 든 값이다.</p>
<div class="scroll"><table><thead><tr><th style="width:60px">ID</th><th style="width:170px">지표</th><th>원문</th><th style="width:90px">구분</th></tr></thead>
<tbody>${d.kpis.map(row).join("")}</tbody></table></div>
</section>`;
}

function sectionHidden(d) {
  return `<section>
<h2>분석상 숨은 설계 포인트</h2>
<p class="sub">여러 요구사항을 겹쳐 읽어 도출한 추론이다. 원문에 명시되지 않았다.</p>
<table><thead><tr><th style="width:250px">항목</th><th>도출 근거</th></tr></thead><tbody>
${d.hidden_features.map((h) => `<tr><td><b>${esc(h.text)}</b></td><td>${esc(h.reason)}</td></tr>`).join("")}
</tbody></table></section>`;
}

function sectionRisks(d) {
  const order = { "높음": 0, "중간": 1, "낮음": 2 };
  return `<section>
<h2>리스크 및 확인 필요</h2>
<table><thead><tr><th style="width:64px">수준</th><th style="width:250px">영역</th><th>내용</th></tr></thead><tbody>
${d.risk_areas.slice().sort((a, b) => order[a.level] - order[b.level]).map((r) => `<tr>
<td><span class="pill ${LEVEL_CLASS[r.level] ?? ""}">${esc(r.level)}</span></td>
<td><b>${esc(r.area)}</b></td><td>${esc(r.reason)}</td></tr>`).join("")}
</tbody></table></section>`;
}

function sectionRequirements(d) {
  const cats = [...new Set(d.requirements.map((r) => r.category))];
  const rows = d.requirements.map((r) => `<tr data-cat="${esc(r.category)}" data-t="${esc((r.id + " " + r.name + " " + r.summary).toLowerCase())}">
<td class="mono">${esc(r.id)}</td>
<td>${esc(r.category)}</td>
<td><b>${esc(r.name)}</b><div class="quote">${esc(r.summary)}</div></td>
<td><span class="pill ${r.priority === "필수" ? "lv-high" : "lv-low"}">${esc(r.priority)}</span></td>
</tr>`).join("");
  return `<section>
<h2>요구사항 ${d.requirements.length}건</h2>
<div class="tags" id="cats">
<button class="tag" data-cat="" aria-pressed="true">전체</button>
${cats.map((c) => `<button class="tag" data-cat="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join("")}
</div>
<p style="margin:10px 0 6px"><input type="search" id="q" placeholder="ID·명칭·요약 검색"></p>
<p class="count" id="count"></p>
<div class="scroll"><table><thead><tr><th style="width:96px">ID</th><th style="width:110px">분류</th><th>명칭 / 정의</th><th style="width:64px">우선</th></tr></thead>
<tbody id="rows">${rows}</tbody></table></div>
<script>
(function(){
  var rows=[].slice.call(document.querySelectorAll('#rows tr'));
  var q=document.getElementById('q'), count=document.getElementById('count'), cat='';
  function apply(){
    var t=q.value.trim().toLowerCase(), n=0;
    rows.forEach(function(r){
      var ok=(!cat||r.dataset.cat===cat)&&(!t||r.dataset.t.indexOf(t)>-1);
      r.hidden=!ok; if(ok)n++;
    });
    count.textContent=n+' / '+rows.length+'건 표시';
  }
  q.addEventListener('input',apply);
  document.getElementById('cats').addEventListener('click',function(e){
    var b=e.target.closest('.tag'); if(!b)return;
    cat=b.dataset.cat;
    [].forEach.call(this.querySelectorAll('.tag'),function(x){
      x.setAttribute('aria-pressed', String(x===b));});
    apply();
  });
  apply();
})();
</script>
</section>`;
}

export function renderAnalysisHtml(d) {
  const title = `${d.doc_name} — RFP 분석보고서`;
  return head(title) + `<div class="wrap">
${sectionOverview(d)}
${sectionFlow(d)}
${sectionKpis(d)}
${sectionHidden(d)}
${sectionRisks(d)}
${sectionRequirements(d)}
<p class="sub">이 보고서는 분석 결과이며 제안 범위 승인은 별도다.</p>
</div>
`;
}

async function main() {
  const args = process.argv.slice(2);
  const input = args[0];
  if (!input) {
    console.error("Usage: node render-analysis.mjs <rfp_analysis.json> [output.html]");
    process.exit(1);
  }
  const data = JSON.parse(await fs.readFile(input, "utf8"));
  for (const key of ["doc_name", "overview", "workflow_steps", "requirements",
                     "domains", "hidden_features", "kpis", "risk_areas"]) {
    if (!data[key]) throw new Error(`rfp_analysis.json에 ${key}가 없다. RfpAnalysisContract를 확인할 것.`);
  }
  const out = args[1] ?? path.join(path.dirname(input), "RFP_분석보고서.html");
  await fs.writeFile(out, renderAnalysisHtml(data), "utf8");
  console.log(JSON.stringify({ output: path.resolve(out), requirements: data.requirements.length }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => { console.error(`[Error] ${err.message}`); process.exit(1); });
}
