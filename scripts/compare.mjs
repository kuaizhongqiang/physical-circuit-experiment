#!/usr/bin/env node
// 双端比对：同一份 fixtures/C*.json 在 Rust（cargo test 已断言）与 wasm（这里）上跑，
// 用**同一套期望值**核对。判据见 docs/verification.md §4。
//
// 用法：node scripts/compare.mjs [--verbose]

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPcx } from "../bindings/web/pcx.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const VERBOSE = process.argv.includes("--verbose");

const wasmPath = join(ROOT, "bindings/web/pkg/pcx_circuit.wasm");
if (!existsSync(wasmPath)) {
  console.error(`找不到 ${wasmPath}\n先跑：node scripts/build.mjs`);
  process.exit(1);
}
const pcx = createPcx(readFileSync(wasmPath));

const CODE = {
  OK: 0, E_INVALID_ARG: 10, E_UNKNOWN_KIND: 11, E_DUPLICATE_ID: 12, E_PARAM_RANGE: 13,
  E_TERMINAL_RANGE: 14, E_TERMINAL_LIMIT: 15, E_NO_REFERENCE: 20, E_MULTI_REFERENCE: 21,
  E_SINGULAR: 30, E_OSCILLATION: 31, E_SHORT_CIRCUIT: 40, E_BUFFER_SMALL: 50,
};

const dir = join(ROOT, "fixtures");
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
let cases = 0;
let fails = 0;

for (const f of files) {
  const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
  const refs = new Map();
  for (const d of doc.devices || []) refs.set(d.ref, { id: d.id, base: d.terminal_base });

  const list = doc.cases && doc.cases.length ? doc.cases : [{}];
  for (const c of list) {
    const name = c.name || "默认";
    const input = JSON.parse(JSON.stringify({
      strict_reference: doc.strict_reference,
      config: doc.config || {},
      devices: doc.devices,
      wires: doc.wires,
    }));

    if (c.set) {
      for (const [ref, ov] of Object.entries(c.set)) {
        const d = input.devices.find((x) => x.ref === ref);
        if (!d) throw new Error(`${f}/${name}: 未知 ref ${ref}`);
        Object.assign(d, ov);
      }
    }
    for (const [a, b] of c.add_wires || []) input.wires.push({ a, b });
    if (c.drop_wires) {
      for (const i of [...c.drop_wires].sort((x, y) => y - x)) input.wires.splice(i, 1);
    }
    if (c.add_devices) {
      for (const d of c.add_devices) input.devices.push(d);
    }

    const out = pcx.solve(input);
    const want = c.expect_code ? CODE[c.expect_code] : 0;
    if (out.code !== want) {
      console.error(`✗ ${f} / ${name}: code ${out.code} ≠ ${want}`);
      fails++;
      continue;
    }
    if (want !== 0) {
      cases++;
      continue;
    }
    for (const [key, e] of Object.entries(c.expect || {})) {
      const [ref, idx] = key.split(":");
      const { base } = refs.get(ref);
      const tid = base + Number(idx);
      const got = out.terminals.find((t) => t.id === tid);
      if (!got) {
        console.error(`✗ ${f} / ${name}: 结果里没有接点 ${tid}`);
        fails++;
        continue;
      }
      for (const [field, wantV] of [
        ["i_rms", e.i_rms],
        ["v_rms", e.v_rms],
      ]) {
        if (wantV === undefined) continue;
        const tol = e[field === "i_rms" ? "tol" : "v_tol"] ?? 0.01;
        const tolAbs = e[field === "i_rms" ? "tol_abs" : "v_tol_abs"] ?? 0;
        const ok =
          wantV === 0
            ? Math.abs(got[field]) <= Math.max(tolAbs, 1e-12)
            : Math.abs(got[field] - wantV) / Math.abs(wantV) <= tol || Math.abs(got[field] - wantV) <= tolAbs;
        if (!ok) {
          console.error(`✗ ${f} / ${name}: ${key}.${field} = ${got[field]} 期望 ${wantV}`);
          fails++;
        } else if (VERBOSE) {
          console.log(`  ✓ ${f}/${name} ${key}.${field} = ${got[field]}`);
        }
      }
    }
    for (const [ref, e] of Object.entries(c.expect_devices || {})) {
      const { id } = refs.get(ref);
      const got = out.devices.find((d) => d.id === id);
      if (!got) {
        console.error(`✗ ${f} / ${name}: 结果里没有器件 ${id}`);
        fails++;
        continue;
      }
      if (e.coil_i_rms !== undefined) {
        const tol = e.tol ?? 0.01;
        const tolAbs = e.tol_abs ?? 0;
        const ok =
          e.coil_i_rms === 0
            ? Math.abs(got.coil_i_rms) <= Math.max(tolAbs, 1e-12)
            : Math.abs(got.coil_i_rms - e.coil_i_rms) / Math.abs(e.coil_i_rms) <= tol ||
              Math.abs(got.coil_i_rms - e.coil_i_rms) <= tolAbs;
        if (!ok) {
          console.error(`✗ ${f} / ${name}: ${ref}.coil_i_rms = ${got.coil_i_rms} 期望 ${e.coil_i_rms}`);
          fails++;
        }
      }
    }
    cases++;
  }
}

console.log(`\nwasm 侧跑了 ${cases} 个 case，失败 ${fails} 处`);
if (fails) process.exit(1);
console.log("双端比对通过（wasm 结果与 fixture 期望一致；Rust 侧由 cargo test 覆盖）");
