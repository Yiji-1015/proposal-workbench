#!/usr/bin/env node
/**
 * cli.mjs
 * HWP, HWPX, PDF, DOCX ?? ?? ??? ????
 * SHA-256 ?? doc_id? ???? Markdown ? ??? sections[] JSON? ?????.
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

export function extractSectionsFromMarkdown(markdown) {
  const sections = [];
  const lines = markdown.split(/\r?\n/);
  let currentSection = null;
  let currentText = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (currentSection) {
        currentSection.text = currentText.join("\n").trim();
        sections.push(currentSection);
      }
      currentSection = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        text: "",
        page: null,
      };
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
