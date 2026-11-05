#!/usr/bin/env node
// 极简静态服务器（演示页需要 http:// 才能 fetch wasm 与 fixture）。
// 用法：node scripts/serve.mjs [port] [--host <addr>]
// 打开：http://localhost:8080/bindings/web/demo.html

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { isIP } from "node:net";
import { join, extname, normalize, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const USAGE = "用法：node scripts/serve.mjs [port] [--host <addr>]";

function failUsage(message) {
  console.error(`参数错误：${message}`);
  console.error(USAGE);
  process.exit(2);
}

// IPv4 / IPv6 用 net.isIP 判；主机名按 DNS label 规则判（字母 / 数字 / 连字符）。
function isValidHost(value) {
  if (!value || value.length > 253 || /[\s/\\]/.test(value)) return false;
  if (isIP(value)) return true;
  if (/^[0-9.]+$/.test(value)) return false; // 形似 IPv4 但不是合法地址
  const labels = value.split(".");
  return labels.every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
}

function parseArgs(argv) {
  let portText = null;
  let host = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--host") {
      if (host !== null) failUsage("--host 只能出现一次");
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("-")) {
        failUsage("--host 需要一个地址，例如 --host 0.0.0.0");
      }
      host = value;
      i += 1;
    } else if (arg.startsWith("--")) {
      failUsage(`未知参数 ${JSON.stringify(arg)}`);
    } else if (arg.startsWith("-")) {
      failUsage(`未知参数 ${JSON.stringify(arg)}`);
    } else if (portText === null) {
      portText = arg;
    } else {
      failUsage(`多余的参数 ${JSON.stringify(arg)}`);
    }
  }

  const port = portText === null ? 8080 : Number(portText);
  if (portText !== null && (!/^[0-9]+$/.test(portText) || port < 1 || port > 65535)) {
    failUsage(`非法端口 ${JSON.stringify(portText)}（需为 1…65535 的整数）`);
  }
  if (host !== null && !isValidHost(host)) {
    failUsage(`非法主机地址 ${JSON.stringify(host)}（需为 IPv4 / IPv6 / 主机名）`);
  }
  return { port, host };
}

const { port: PORT, host: HOST } = parseArgs(process.argv.slice(2));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".css": "text/css; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    let p = normalize(join(ROOT, url));
    if (!p.startsWith(ROOT)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const st = await stat(p).catch(() => null);
    if (!st) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end(`404 ${url}`);
      return;
    }
    if (st.isDirectory()) p = join(p, "index.html");
    const buf = await readFile(p);
    res.writeHead(200, {
      "content-type": MIME[extname(p).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(buf);
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" }).end(String(e));
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`启动失败：端口 ${PORT} 已被占用，请先停止占用进程或换端口。`);
  } else {
    console.error(`启动失败：${err.message}`);
  }
  process.exit(1);
});

const onListening = () => {
  console.log(`静态服务已启动：http://localhost:${PORT}`);
  if (HOST !== null) console.log(`监听地址：${HOST}:${PORT}`);
  console.log(`演示页：http://localhost:${PORT}/bindings/web/demo.html`);
  console.log("（Ctrl+C 停止）");
};

// 不传 --host 时保持原行为：listen(PORT) 走 Node 默认监听（不改变输出与并发）。
if (HOST === null) server.listen(PORT, onListening);
else server.listen(PORT, HOST, onListening);
