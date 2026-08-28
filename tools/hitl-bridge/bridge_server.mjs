#!/usr/bin/env node
/**
 * bridge_server.mjs
 * Human-in-the-loop (HitL) 브라우저 UI (deal-mechanic)와 Agent 간의 데이터 교환을 위한 초경량 로컬 세션 서버입니다.
 * - 포트: 5174 (또는 PORT 환경변수)
 * - CORS 지원 (Vite 프론트엔드 localhost:5173 연동)
 */

import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workbenchRoot = path.resolve(__dirname, "..", "..");
const PORT = Number(process.env.BRIDGE_PORT || 5174);

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function readBodyJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  // 1. 세션 조회: GET /api/sessions/:id
  const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (req.method === "GET" && sessionMatch) {
    const sessionId = decodeURIComponent(sessionMatch[1]);
    const sessionFile = path.join(workbenchRoot, "storage", "sessions", `${sessionId}.json`);
    try {
      const data = JSON.parse(await fs.readFile(sessionFile, "utf8"));
      sendJson(res, 200, data);
    } catch {
      sendError(res, 404, `Session not found: ${sessionId}`);
    }
    return;
  }

  // 1-1. Ingest Manifest 조회: GET /api/ingest/:stem
  const ingestMatch = url.pathname.match(/^\/api\/ingest\/([^/]+)$/);
  if (req.method === "GET" && ingestMatch) {
    const stem = decodeURIComponent(ingestMatch[1]);
    const manifestFile = path.join(workbenchRoot, "storage", "ingest_data", stem, "manifest.json");
    try {
      const data = JSON.parse(await fs.readFile(manifestFile, "utf8"));
      sendJson(res, 200, data);
    } catch {
      sendError(res, 404, `Ingest manifest not found: ${stem}`);
    }
    return;
  }

  // 2. Reference Picker 선택 저장: POST /api/sessions/:id/select
  const selectMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/select$/);
  if (req.method === "POST" && selectMatch) {
    const sessionId = decodeURIComponent(selectMatch[1]);
    const sessionFile = path.join(workbenchRoot, "storage", "sessions", `${sessionId}.json`);
    try {
      const body = await readBodyJson(req);
      const selectedIds = Array.isArray(body.selected_slide_ids) ? body.selected_slide_ids : (body.selectedIds || []);
      const session = JSON.parse(await fs.readFile(sessionFile, "utf8"));
      session.selected_slide_ids = selectedIds;
      session.status = "completed";
      session.completed_at = new Date().toISOString();
      await fs.writeFile(sessionFile, JSON.stringify(session, null, 2), "utf8");
      console.log(`[Bridge Server] Session ${sessionId} selected: ${selectedIds.join(", ")}`);
      sendJson(res, 200, { success: true, session_id: sessionId, selected_slide_ids: selectedIds });
    } catch (err) {
      sendError(res, 500, err.message);
    }
    return;
  }

  // 3. Blueprint Review 승인/수정 저장: POST /api/sessions/:id/approve
  const approveMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/approve$/);
  if (req.method === "POST" && approveMatch) {
    const sessionId = decodeURIComponent(approveMatch[1]);
    const sessionFile = path.join(workbenchRoot, "storage", "sessions", `${sessionId}.json`);
    try {
      const body = await readBodyJson(req);
      const session = JSON.parse(await fs.readFile(sessionFile, "utf8"));
      if (body.blueprint) {
        session.blueprint = body.blueprint;
      }
      session.status = "approved";
      session.approved_at = new Date().toISOString();
      await fs.writeFile(sessionFile, JSON.stringify(session, null, 2), "utf8");
      console.log(`[Bridge Server] Blueprint Session ${sessionId} approved!`);
      sendJson(res, 200, { success: true, session_id: sessionId, status: "approved" });
    } catch (err) {
      sendError(res, 500, err.message);
    }
    return;
  }

  // 4. 정적 파일 서빙: 슬라이드 이미지 및 HTML 서빙 (/storage/ingest_data/...)
  if (url.pathname.startsWith("/storage/ingest_data/")) {
    const relativePath = decodeURIComponent(url.pathname.replace(/^\/storage\/ingest_data\//, ""));
    const filePath = path.join(workbenchRoot, "storage", "ingest_data", relativePath);
    try {
      const data = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const contentType = ext === ".png" ? "image/png" : (ext === ".html" ? "text/html; charset=utf-8" : "application/octet-stream");
      res.writeHead(200, { "Content-Type": contentType, "Access-Control-Allow-Origin": "*" });
      res.end(data);
      return;
    } catch {
      sendError(res, 404, "File not found");
      return;
    }
  }

  // 기본 상태 확인 (고유 식별 정보 포함)
  if (url.pathname === "/health" || url.pathname === "/") {
    sendJson(res, 200, {
      status: "ok",
      app: "proposal-workbench-bridge",
      name: "HitL Bridge Server",
      port: PORT,
      version: "2.0.0"
    });
    return;
  }

  sendError(res, 404, "Not found");
});

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[HitL Bridge Server] Running at http://localhost:${PORT}`);
  });
}
