#!/usr/bin/env node
// 极简静态服务器（演示页需要 http:// 才能 fetch wasm 与 fixture）。
// 用法：node scripts/serve.mjs [port]
// 打开：http://localhost:8080/bindings/web/demo.html

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const PORT = Number(process.argv[2] || 8080);

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

createServer(async (req, res) => {
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
}).listen(PORT, () => {
  console.log(`静态服务已启动：http://localhost:${PORT}`);
  console.log(`演示页：http://localhost:${PORT}/bindings/web/demo.html`);
  console.log("（Ctrl+C 停止）");
});
