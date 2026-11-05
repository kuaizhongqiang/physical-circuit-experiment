#!/usr/bin/env node
// playground-check.mjs —— M6.4 样例结构校验（第一版）。
//
// 契约：docs/playground.md §4（样例 schema / 读取规则）、§8.1（结构层判据）。
// 本版只做结构校验，**不做数值复算**（10×28 case 留给 M6.6）：
//   - 每份 samples/C*.json 的 fixture 存在；
//   - fixture 的 case 与 sample.case 一致；
//   - layout 恰好覆盖 fixture 的全部 ref（不重、不漏、无未知 ref）；
//   - 坐标合法、盒子不重叠且落在 1600×1000 逻辑画布内；
//   - initial.case / rpm / elapsed_ms 可应用。
//
// 用法：node scripts/playground-check.mjs
//
// 失败时逐条打印原因并以非零码退出；成功时输出 10/10 明细。

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SAMPLE_NAMES,
  buildSampleStateInput,
} from "../bindings/web/playground/samples.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SAMPLES_DIR = join(ROOT, "bindings/web/playground/samples");

function readJson(absolutePath) {
  return JSON.parse(readFileSync(absolutePath, "utf8"));
}

let passed = 0;
const rows = [];

for (const name of SAMPLE_NAMES) {
  const sampleRel = `samples/${name}.json`;
  try {
    const samplePath = join(SAMPLES_DIR, `${name}.json`);
    if (!existsSync(samplePath)) {
      throw new Error(`样例文件缺失：bindings/web/playground/${sampleRel}`);
    }
    let sample;
    try {
      sample = readJson(samplePath);
    } catch (error) {
      throw new Error(`样例 JSON 解析失败：${sampleRel}（${error?.message ?? error}）`);
    }

    if (typeof sample.fixture !== "string" || !/^fixtures\/[^/]+\.json$/.test(sample.fixture)) {
      throw new Error(`fixture 路径非法：${JSON.stringify(sample.fixture)}`);
    }
    const fixturePath = join(ROOT, sample.fixture);
    if (!existsSync(fixturePath)) {
      throw new Error(`fixture 缺失：${sample.fixture}`);
    }
    let fixture;
    try {
      fixture = readJson(fixturePath);
    } catch (error) {
      throw new Error(`fixture JSON 解析失败：${sample.fixture}（${error?.message ?? error}）`);
    }

    const input = buildSampleStateInput(sample, fixture);
    passed += 1;
    rows.push(
      [
        `✓ ${name}`,
        `fixture=${input.fixturePath}`,
        `devices=${input.devices.length}`,
        `wires=${input.wires.length}(fixture ${fixture.wires.length})`,
        `layout=${sample.layout.length}`,
        `initial.case=${input.fixtureCase}`,
      ].join("  "),
    );
  } catch (error) {
    rows.push(`✗ ${name}  ${error?.message ?? error}`);
  }
}

for (const row of rows) console.log(row);

const total = SAMPLE_NAMES.length;
console.log(`\n${passed}/${total} 通过：样例 fixture、layout 覆盖、ref 唯一性与画布坐标校验。`);
if (passed !== total) {
  console.error("结构校验未全通过；先修 samples/ 或 fixture 引用，再跑本脚本。");
  process.exit(1);
}
console.log("M6.6 的 10×28 数值复算尚未在本脚本实现（见 docs/playground.md §8.2）。");
