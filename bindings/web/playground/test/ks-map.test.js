// ks-map.test.js —— KS 转速 → state_bits 的期望映射（走真实 wasm 内核）。
//
// 契约：
//   docs/playground.md §5.4  rpm 由应用给；≥ n_pick 闭合、≤ n_drop 释放，区间内保持
//   docs/api.md §3           KS bit0 = 13-14（正转）、bit1 = 23-24（反转）
//   D-20261104-05            不建惯性模型，只验证阈值与滞环
//
// 本测试在 bindings/web/pkg/pcx_circuit.wasm 存在时才跑（产物不入库）；本地验收先构建：
//   cargo build -p pcx-wasm --release --target wasm32-unknown-unknown
//   cp target/wasm32-unknown-unknown/release/pcx_wasm.wasm bindings/web/pkg/pcx_circuit.wasm

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPcx } from "../../pcx.js";
import { createInitialState, reducer } from "../state.js";
import { buildSampleStateInput } from "../samples.js";
import { solveState } from "../solve.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const WASM_PATH = resolve(ROOT, "bindings/web/pkg/pcx_circuit.wasm");
const SKIP = existsSync(WASM_PATH) ? false : `wasm 未构建：${WASM_PATH}`;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadC9(pcx) {
  const sample = readJson(resolve(ROOT, "bindings/web/playground/samples/C9.json"));
  const fixture = readJson(resolve(ROOT, "fixtures/C9.json"));
  const event = buildSampleStateInput(sample, fixture);
  return reducer(createInitialState(), event);
}

function withRpm(state, rpm, hintBits) {
  return {
    ...state,
    devices: state.devices.map((device) => (
      device.ref === "KS1"
        ? { ...device, rpm, state_bits: hintBits, flags: 0 }
        : device
    )),
  };
}

function ksBits(state) {
  const device = state.devices.find((item) => item.ref === "KS1");
  const result = state.result?.devices?.find((item) => item.id === device.id);
  return { stateBits: device.state_bits, closedBits: result?.closed_bits };
}

test("rpm → KS state_bits 映射表：吸合 / 释放阈值与滞环保持位", { skip: SKIP }, () => {
  const pcx = createPcx(readFileSync(WASM_PATH));
  const base = loadC9(pcx);

  // [rpm, 上一轮 state_bits 提示, 期望 bits]；bit0 = 13-14 正转。
  const rows = [
    [1300, 0, 1], // ≥ n_pick(120)：闭合
    [120, 0, 1],  // 正好吸合
    [90, 1, 0],   // ≤ n_drop(100)：释放
    [100, 1, 0],  // 正好释放
    [110, 0, 0],  // 滞环区间：保持上一轮断开
    [110, 1, 1],  // 滞环区间：保持上一轮闭合
    [101, 1, 1],  // 区间内保持闭合
    [0, 1, 0],    // 停转：释放
  ];
  for (const [rpm, hint, expected] of rows) {
    const solved = solveState(withRpm(base, rpm, hint), pcx);
    const bits = ksBits(solved);
    assert.equal(bits.stateBits, expected, `rpm=${rpm} hint=${hint} 的 state_bits`);
    assert.equal(bits.closedBits, expected, `rpm=${rpm} hint=${hint} 的内核 closed_bits`);
  }
});

test("应用操作 KS：setRpm → solve → 写回 state_bits；跨阈值切换并保留滞环", { skip: SKIP }, () => {
  const pcx = createPcx(readFileSync(WASM_PATH));
  let state = loadC9(pcx);

  state = solveState(reducer(state, { type: "operate", ref: "KS1", action: "setRpm", value: 1300 }), pcx);
  assert.equal(ksBits(state).stateBits, 1, "1300 rpm：13-14 闭合");

  state = solveState(reducer(state, { type: "operate", ref: "KS1", action: "setRpm", value: 110 }), pcx);
  assert.equal(ksBits(state).stateBits, 1, "降到 110 rpm：滞环内保持闭合");

  state = solveState(reducer(state, { type: "operate", ref: "KS1", action: "setRpm", value: 90 }), pcx);
  assert.equal(ksBits(state).stateBits, 0, "90 rpm：13-14 断开");

  state = solveState(reducer(state, { type: "operate", ref: "KS1", action: "setRpm", value: 110 }), pcx);
  assert.equal(ksBits(state).stateBits, 0, "升到 110 rpm：滞环内保持断开");

  state = solveState(reducer(state, { type: "operate", ref: "KS1", action: "setRpm", value: 1300 }), pcx);
  assert.equal(ksBits(state).stateBits, 1, "重新升到 1300 rpm：再次闭合");
});
