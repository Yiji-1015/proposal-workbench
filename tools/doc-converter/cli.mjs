#!/usr/bin/env node
/**
 * cli.mjs
 * HWP, HWPX, PDF, DOCX 원문을 kordoc으로 변환한다.
 * SHA-256 문서 ID와 Markdown sections[] JSON을 함께 만든다.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "kordoc";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

// 한국 공공문서 개요 번호 체계. kordoc은 HWP에서 헤딩 스타일이 적용된 문단만 #으로
// 내보내므로, 장 제목이 표 셀이나 본문 스타일로 작성된 문서는 헤딩이 하나도 잡히지 않는다.
// 그런 문서의 목차를 복원하기 위한 보조 규칙이다.
const OUTLINE_PATTERNS = [
  { level: 1, re: /^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*\.\s*(.+)$/ },
  { level: 2, re: /^\d{1,2}\s*\.\s*(.+)$/ },
  { level: 3, re: /^[가-힣]\s*\.\s*(.+)$/ },
  { level: 4, re: /^\d{1,2}\s*\)\s*(.+)$/ },
  { level: 5, re: /^[가-힣]\s*\)\s*(.+)$/ },
];
const OUTLINE_MAX_LENGTH = 60;

// ponytail: 한국 공공문서는 제목과 열거 조항이 같은 번호 체계를 쓴다. 길이 컷만으로는
// "가. 사 업 명 : ..."(제목)과 "가. 캐비넷을 개방한 채 퇴근"(위규 항목)을 구분할 수 없어
// 열거 조항이 섞여 들어온다. source:"outline"로 표시해 소비자가 걸러 쓰게 두었다.
// 정밀도가 문제되면 문서별 섹션 밀도나 후속 줄 패턴으로 판별하는 단계로 올린다.
function matchOutlineHeading(line) {
  // 표·목록 마크업 줄과 문장은 제목이 아니다.
  if (/^[<|!\-*>]/.test(line) || line.length > OUTLINE_MAX_LENGTH) return null;
  for (const { level, re } of OUTLINE_PATTERNS) {
    const m = line.match(re);
    if (m && m[1].trim()) return { heading: line.trim(), level, source: "outline" };
  }
  return null;
}

export function extractSectionsFromMarkdown(markdown) {
  const sections = [];
  const lines = markdown.split(/\r?\n/);
  let currentSection = null;
  let currentText = [];

  for (const line of lines) {
    const md = line.match(/^(#{1,6})\s+(.+)$/);
    // 헤딩 스타일과 개요 번호를 모두 인정한다. 한쪽만 살아있는 문서가 흔하다.
    const heading = md
      ? { heading: md[2].trim(), level: md[1].length, source: "markdown" }
      : matchOutlineHeading(line);
    if (heading) {
      if (currentSection) {
        currentSection.text = currentText.join("\n").trim();
        sections.push(currentSection);
      }
      currentSection = { ...heading, text: "", page: null };
      currentText = [];
    } else {
      currentText.push(line);
    }
  }

  if (currentSection) {
    currentSection.text = currentText.join("\n").trim();
    sections.push(currentSection);
  }

  return sections;
}

export async function convertDocument(inputFilePath, outputDir = null) {
  const resolvedInput = path.resolve(inputFilePath);
  const fileBuffer = await fs.readFile(resolvedInput);
  const fileName = path.basename(resolvedInput);
  const docId = crypto.createHash("sha256").update(fileBuffer).digest("hex");

  const parseResult = await parse(fileBuffer);
  if (!parseResult.success) {
    throw new Error(String(parseResult.error ?? "Document parsing failed in kordoc."));
  }

  const markdown = parseResult.markdown || "";
  const sections = extractSectionsFromMarkdown(markdown);

  const docAnalysis = {
    doc_id: docId,
    file_name: fileName,
    page_count: parseResult.pageCount ?? null,
    converted_at: new Date().toISOString(),
    markdown,
    sections,
  };

  const targetDir = outputDir ? path.resolve(outputDir) : path.join(path.dirname(resolvedInput), `${path.parse(fileName).name}_converted`);
  await fs.mkdir(targetDir, { recursive: true });

  const mdPath = path.join(targetDir, "converted_doc.md");
  const jsonPath = path.join(targetDir, "doc_analysis.json");

  await fs.writeFile(mdPath, markdown, "utf8");
  await fs.writeFile(jsonPath, JSON.stringify(docAnalysis, null, 2), "utf8");

  return {
    doc_id: docId,
    file_name: fileName,
    output_dir: targetDir,
    markdown_path: mdPath,
    json_path: jsonPath,
    section_count: sections.length,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputFile = args.input || args.i;
  if (!inputFile) {
    console.error("Error: --input <file_path> is required.");
    process.exit(1);
  }

  try {
    const result = await convertDocument(inputFile, args["output-dir"] || args.o);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }, null, 2));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
