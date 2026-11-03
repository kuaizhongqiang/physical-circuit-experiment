#!/usr/bin/env node
// 一键产出两端产物：Windows DLL 与 wasm（拷贝到 bindings/web/pkg）。
// 产物不入库（AGENT.md §2 / docs/architecture.md §6）。

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function run(args, label) {
  console.log(`\n▶ ${label}\n  ${args.join(" ")}`);
  const r = spawnSync(args[0], args.slice(1), { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`✗ ${label} 失败（exit ${r.status}）`);
    process.exit(r.status ?? 1);
  }
}

run(["cargo", "build", "--workspace", "--release"], "编译 workspace（release）");
run(
  ["cargo", "build", "-p", "pcx-cabi", "--release", "--target", "x86_64-pc-windows-msvc"],
  "构建 Windows DLL"
);
run(
  ["cargo", "build", "-p", "pcx-wasm", "--release", "--target", "wasm32-unknown-unknown"],
  "构建 wasm"
);

const wasmSrc = join(ROOT, "target/wasm32-unknown-unknown/release/pcx_wasm.wasm");
const pkgDir = join(ROOT, "bindings/web/pkg");
if (!existsSync(wasmSrc)) {
  console.error(`✗ 找不到 ${wasmSrc}`);
  process.exit(1);
}
mkdirSync(pkgDir, { recursive: true });
copyFileSync(wasmSrc, join(pkgDir, "pcx_circuit.wasm"));

const dll = join(ROOT, "target/x86_64-pc-windows-msvc/release/pcx_circuit.dll");
console.log(`\n✓ wasm → bindings/web/pkg/pcx_circuit.wasm`);
console.log(`✓ DLL  → ${dll}`);
console.log(`\nUnity 侧：把上面的 dll 拷到 <工程>/Assets/Plugins/x86_64/（.meta 交给 Unity 生成）`);
