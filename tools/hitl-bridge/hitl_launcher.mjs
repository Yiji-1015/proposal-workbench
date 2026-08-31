#!/usr/bin/env node
/**
 * hitl_launcher.mjs
 * HitL Bridge Server(5274)를 준비하고 검토 URL을 기본 브라우저로 연다.
 */

import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workbenchRoot = path.resolve(__dirname, "..", "..");
const BRIDGE_PORT = 5274;
const BRIDGE_BASE_URL = `http://127.0.0.1:${BRIDGE_PORT}`;
const BRIDGE_HEALTH_URL = `${BRIDGE_BASE_URL}/health`;

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

export async function checkBridgeHealth() {
  try {
    const res = await fetchText(BRIDGE_HEALTH_URL);
    if (res.status === 200) {
      try {
        const payload = JSON.parse(res.data);
        if (payload.app === "proposal-workbench-bridge" || payload.name === "HitL Bridge Server") {
          return { ready: true, payload };
        }
        return { ready: false, error: `Port ${BRIDGE_PORT} is in use by another application.` };
      } catch {
        return { ready: false, error: `Port ${BRIDGE_PORT} responded with invalid payload.` };
      }
    }
    return { ready: false, error: `Bridge returned HTTP ${res.status}` };
  } catch (err) {
    return { ready: false, error: err.message };
  }
}

async function waitFor(checkFn, timeoutMs = 4000, intervalMs = 200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const check = await checkFn();
    if (check.ready) return check;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ready: false, error: `Bridge Server failed to start within ${timeoutMs}ms` };
}

export async function ensureBridgeServer() {
  const health = await checkBridgeHealth();
  if (health.ready) return { started: false, already_running: true };

  console.log(`[HitL Launcher] Starting Bridge Server (127.0.0.1:${BRIDGE_PORT})...`);
  const bridgeScript = path.join(workbenchRoot, "tools", "hitl-bridge", "bridge_server.mjs");
  const child = spawn(process.execPath, [bridgeScript], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  const waitRes = await waitFor(checkBridgeHealth, 4000);
  if (!waitRes.ready) {
    throw new Error(`Failed starting Bridge Server: ${waitRes.error}`);
  }
  return { started: true, already_running: false };
}

export function openBrowser(url) {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      resolve({ opened: false, error: "Only HTTP(S) URLs can be opened.", fallback_url: url });
      return;
    }

    const platform = process.platform;
    const command = platform === "win32" ? "explorer.exe" : platform === "darwin" ? "open" : "xdg-open";
    const child = spawn(command, [url], { detached: true, stdio: "ignore", windowsHide: true });
    child.once("error", (err) => {
      console.warn(`[HitL Launcher Warn] Browser open failed (${err.message}). Fallback to URL output.`);
      resolve({ opened: false, error: err.message, fallback_url: url });
    });
    child.once("spawn", () => {
      child.unref();
      resolve({ opened: true, url });
    });
  });
}

export async function launchHitlSession(url) {
  const result = {
    bridge_ready: false,
    browser_opened: false,
    url,
    error: null,
  };

  try {
    await ensureBridgeServer();
    result.bridge_ready = true;
    const openRes = await openBrowser(url);
    result.browser_opened = openRes.opened;
    return result;
  } catch (err) {
    result.error = err.message;
    return result;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let targetUrl = BRIDGE_BASE_URL;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--open" && args[i + 1]) {
      targetUrl = args[i + 1].replace("localhost", "127.0.0.1");
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
