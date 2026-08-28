#!/usr/bin/env node
/**
 * hitl_launcher.mjs
 * HitL Bridge Server(5174) 및 Vite UI Dev Server(5173)의 고유 헬스체크를 수행하고,
 * 필요한 경우 백그라운드로 자동 기동한 뒤 사용자의 기본 브라우저에서 지정된 세션 URL을 엽니다.
 */

import { spawn, exec } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workbenchRoot = path.resolve(__dirname, "..", "..");

const BRIDGE_HEALTH_URL = "http://localhost:5174/health";
const UI_URL = "http://localhost:5173";

function fetchText(url, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode || 0, data }));
    });
    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout connecting to ${url}`));
    });
  });
}

/**
 * 1. Bridge Server 헬스체크 (고유 식별자 검증)
 */
export async function checkBridgeHealth() {
  try {
    const res = await fetchText(BRIDGE_HEALTH_URL);
    if (res.status === 200) {
      try {
        const payload = JSON.parse(res.data);
        if (payload.app === "proposal-workbench-bridge" || payload.name === "HitL Bridge Server") {
          return { ready: true, payload };
        }
        return { ready: false, error: "Port 5174 is in use by another application." };
      } catch {
        return { ready: false, error: "Port 5174 responded with invalid payload." };
      }
    }
    return { ready: false, error: `Bridge returned HTTP ${res.status}` };
  } catch (err) {
    return { ready: false, error: err.message };
  }
}

/**
 * 2. UI Dev Server 헬스체크
 */
export async function checkUiHealth() {
  try {
    const res = await fetchText(UI_URL);
    if (res.status === 200) {
      return { ready: true };
    }
    return { ready: false, error: `UI returned HTTP ${res.status}` };
  } catch (err) {
    return { ready: false, error: err.message };
  }
}

async function waitFor(checkFn, timeoutMs = 6000, intervalMs = 250) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const check = await checkFn();
    if (check.ready) return check;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ready: false, error: `Server failed to start within ${timeoutMs}ms` };
}

/**
 * Bridge Server 자동 기동
 */
export async function ensureBridgeServer() {
  const health = await checkBridgeHealth();
  if (health.ready) return { started: false, already_running: true };

  console.log("[HitL Launcher] Starting Bridge Server (port 5174)...");
  const bridgeScript = path.join(workbenchRoot, "tools", "hitl-bridge", "bridge_server.mjs");
  const child = spawn(process.execPath, [bridgeScript], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  const waitRes = await waitFor(checkBridgeHealth, 5000);
  if (!waitRes.ready) {
    throw new Error(`Failed starting Bridge Server: ${waitRes.error}`);
  }
  return { started: true, already_running: false };
}

/**
 * UI Dev Server 자동 기동
 */
export async function ensureUiServer() {
  const health = await checkUiHealth();
  if (health.ready) return { started: false, already_running: true };

  console.log("[HitL Launcher] Starting UI Dev Server (port 5173)...");
  const uiDir = path.join(workbenchRoot, "ui");
  const bunPath = "C:\\Users\\LLOYDK\\.bun\\bin\\bun.exe";

  const child = spawn(bunPath, ["run", "dev"], {
    cwd: uiDir,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  const waitRes = await waitFor(checkUiHealth, 8000);
  if (!waitRes.ready) {
    throw new Error(`Failed starting UI Dev Server: ${waitRes.error}`);
  }
  return { started: true, already_running: false };
}

/**
 * 기본 브라우저 자동 Open (Cross-Platform & Safe Fallback)
 */
export function openBrowser(url) {
  return new Promise((resolve) => {
    let command = "";
    const platform = process.platform;

    if (platform === "win32") {
      // Windows: start "" "<url>"
      command = `start "" "${url}"`;
    } else if (platform === "darwin") {
      command = `open "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }

    exec(command, { windowsHide: true }, (err) => {
      if (err) {
        console.warn(`[HitL Launcher Warn] Browser open command failed (${err.message}). Fallback to URL output.`);
        resolve({ opened: false, error: err.message, fallback_url: url });
      } else {
        resolve({ opened: true, url });
      }
    });
  });
}

/**
 * 통합 세션 런처 (Health Check -> Auto Spawn -> Browser Open)
 */
export async function launchHitlSession(url) {
  const result = {
    bridge_ready: false,
    ui_ready: false,
    browser_opened: false,
    url,
    error: null,
  };

  try {
    // 1. Bridge Server 준비
    await ensureBridgeServer();
    result.bridge_ready = true;

    // 2. UI Server 준비
    await ensureUiServer();
    result.ui_ready = true;

    // 3. 기본 브라우저 자동 오픈
    const openRes = await openBrowser(url);
    result.browser_opened = openRes.opened;
    if (!openRes.opened) {
      result.browser_error = openRes.error;
    }

    return result;
  } catch (err) {
    result.error = err.message;
    return result;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let targetUrl = "http://localhost:5173";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--open" && args[i + 1]) {
      targetUrl = args[i + 1];
    }
  }

  const result = await launchHitlSession(targetUrl);
  console.log(JSON.stringify(result, null, 2));

  if (result.error) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(JSON.stringify({ error: err.message }, null, 2));
    process.exit(1);
  });
}
