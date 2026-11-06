import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const state = join(root, ".omb-scratch", "personal-client");
const data = join(state, "data");
const desktop = join(state, "desktop");
const require = createRequire(import.meta.url);
const children = new Set();
let stopping = false;

const env = {
  ...process.env,
  OMB_DATA_DIR: data,
  OMB_PORT: "8799",
  OMB_WEBHOOK_PORT: "8800",
  OMB_UI_PORT: "5199",
  ELECTRON_START_URL: "http://127.0.0.1:5199",
};
delete env.ELECTRON_RUN_AS_NODE;

async function seed(file, value) {
  try {
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
  const timer = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
  }, 10_000);
  timer.unref();
}

function start(executable, args) {
  if (stopping) throw new Error("启动已取消");
  const child = spawn(executable, args, { cwd: root, env, stdio: "inherit" });
  children.add(child);
  child.once("error", error => {
    console.error(error.message);
    children.delete(child);
    stop(1);
  });
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(`进程退出：${args[0]} (${signal || code})`);
      stop(code === 0 ? 0 : 1);
    }
  });
  return child;
}

async function prepare(args) {
  if (stopping) throw new Error("启动已取消");
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: "inherit" });
  children.add(child);
  await new Promise((resolve, reject) => {
    child.once("error", error => {
      children.delete(child);
      reject(error);
    });
    child.once("exit", code => {
      children.delete(child);
      if (code === 0) resolve();
      else reject(new Error(`桌面依赖准备失败：${args[0]}`));
    });
  });
}

async function checkPort(port) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error(`端口 ${port} 已被占用，请先关闭对应开发服务。`)));
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
}

async function waitReady(url) {
  const deadline = Date.now() + 90_000;
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      await response.body?.cancel();
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`服务未就绪：${url}`);
}

process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());

try {
  for (const port of [8799, 8800, 5199]) await checkPort(port);
  await mkdir(data, { recursive: true });
  await mkdir(desktop, { recursive: true });
  await seed(join(data, "config.json"), { language: "zh" });
  await seed(join(desktop, "desktop-prefs.json"), { language: "zh", analytics: false });
  console.log(`开发数据：${data}\n桌面配置：${desktop}`);

  await prepare(["scripts/prepare-cloudflared.mjs", "--current"]);
  await prepare([require.resolve("electron/install.js")]);
  start(process.execPath, ["--experimental-strip-types", "server/dev-server.ts"]);
  start(process.execPath, ["node_modules/vite/bin/vite.js", "--strictPort"]);
  await Promise.all([waitReady("http://127.0.0.1:8799/api/health"), waitReady("http://127.0.0.1:5199")]);
  start(require("electron"), ["electron/personal-dev.mjs"]);
  console.log("自用客户端已启动：http://127.0.0.1:5199（Ctrl-C 结束全部开发进程）");
} catch (error) {
  if (!stopping) console.error(error.message);
  stop(1);
}
