#!/usr/bin/env node
// 双端比对：同一份 fixtures/C*.json 在 Rust（cargo test 已断言）与 wasm（这里）上跑，
// 用**同一套期望值**核对。判据见 docs/verification.md §4。
//
// 判据逻辑（容差与断言）只存在于 scripts/lib/fixture-compare.mjs；
// 本文件只负责读取 fixture、调用 wasm、打印结果（M6.6 抽取，行为不变）。
//
// 用法：node scripts/compare.mjs [--verbose]

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPcx } from "../bindings/web/pcx.js";
import {
  buildCaseInput,
  buildRefs,
  caseEntries,
  compareCase,
  formatFailure,
} from "./lib/fixture-compare.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const VERBOSE = process.argv.includes("--verbose");

const wasmPath = join(ROOT, "bindings/web/pkg/pcx_circuit.wasm");
if (!existsSync(wasmPath)) {
  console.error(`找不到 ${wasmPath}\n先跑：node scripts/build.mjs`);
  process.exit(1);
}
const pcx = createPcx(readFileSync(wasmPath));

const dir = join(ROOT, "fixtures");
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
let cases = 0;
let fails = 0;

for (const f of files) {
  const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
  const refs = buildRefs(doc);

  for (const c of caseEntries(doc)) {
    const name = c.name || "默认";
    let result;
    try {
      const output = pcx.solve(buildCaseInput(doc, c));
      result = compareCase(doc, c, output, refs);
    } catch (error) {
      console.error(`✗ ${f} / ${name}: ${error?.message ?? error}`);
      fails++;
      continue;
    }

    if (!result.codeOk) {
      for (const failure of result.failures) {
        console.error(`✗ ${f} / ${name}: ${formatFailure(failure)}`);
      }
      fails++;
      continue;
    }
    if (result.want !== 0) {
      cases++;
      continue;
    }
    for (const failure of result.failures) {
      console.error(`✗ ${f} / ${name}: ${formatFailure(failure)}`);
      fails++;
    }
    if (VERBOSE) {
      for (const pass of result.passes) {
        console.log(`  ✓ ${f}/${name} ${pass.key}.${pass.field} = ${pass.value}`);
      }
    }
    cases++;
  }
}

console.log(`\nwasm 侧跑了 ${cases} 个 case，失败 ${fails} 处`);
if (fails) process.exit(1);
console.log("双端比对通过（wasm 结果与 fixture 期望一致；Rust 侧由 cargo test 覆盖）");
