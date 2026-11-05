// export.test.js —— issue #62：导出网表 JSON 后原样回喂 pcx.js，结果必须与页面一致。
//
// 契约：
//   docs/playground.md §5.5  顶层是 pcx.js 入参；playground 只放 layout / 操作状态，不污染入参
//   docs/api.md §7           wasm JSON 门面对未知顶层键按忽略处理，不会改变求解结果
//   issue #62                至少覆盖 C3 与白画布最小网表；state.result 缺失时拒绝导出
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
import { terminalsFor } from "../device-catalog.js";
import { buildSampleStateInput } from "../samples.js";
import { createInitialState, reducer } from "../state.js";
import { exportNetlist, solveState, toNetlist } from "../solve.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const WASM_PATH = resolve(ROOT, "bindings/web/pkg/pcx_circuit.wasm");
const SKIP = existsSync(WASM_PATH) ? false : `wasm 未构建：${WASM_PATH}`;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadPcx() {
  return createPcx(readFileSync(WASM_PATH));
}

/** 用样例 sidecar + fixture 生成初始 state 并求解一次，等价于页面切到该样例。 */
function loadSampleState(pcx, name) {
  const sample = readJson(resolve(ROOT, `bindings/web/playground/samples/${name}.json`));
  const fixture = readJson(resolve(ROOT, sample.fixture));
  const event = buildSampleStateInput(sample, fixture);
  return solveState(reducer(createInitialState(), event), pcx);
}

function terminalId(state, ref, name) {
  const device = state.devices.find((item) => item.ref === ref);
  assert.ok(device, `找不到器件 ${ref}`);
  const index = terminalsFor(device.kind, device.aux).findIndex((terminal) => terminal.name === name);
  assert.ok(index >= 0, `找不到接点 ${ref}.${name}`);
  return device.terminal_base + index;
}

/** 白画布最小网表：POWER + PE + 电阻的单相回路（不是 C1…C10 样例）。 */
function whiteCanvasState(pcx) {
  let state = createInitialState();
  state = reducer(state, { type: "place", kind: "POWER", ref: "P1", x: 40, y: 60 });
  state = reducer(state, { type: "place", kind: "PE", ref: "PE1", x: 220, y: 60 });
  state = reducer(state, { type: "place", kind: "R", ref: "R1", x: 340, y: 60 });
  for (const [refA, nameA, refB, nameB] of [
    ["P1", "L1", "R1", "1"],
    ["R1", "2", "P1", "N"],
    ["P1", "N", "PE1", "PE"],
  ]) {
    state = reducer(state, {
      type: "addWire",
      a: terminalId(state, refA, nameA),
      b: terminalId(state, refB, nameB),
    });
  }
  return solveState(state, pcx);
}

test("state.result 缺失时拒绝导出（不产生半成品）", () => {
  const state = reducer(createInitialState(), { type: "place", kind: "POWER", ref: "P1" });
  assert.equal(state.result, null);
  assert.throws(() => exportNetlist(state), /尚未求解/);
});

test("C3：导出顶层就是 pcx.js 入参，辅助字段只挂在 playground 下", { skip: SKIP }, () => {
  const state = loadSampleState(loadPcx(), "C3");
  assert.ok(state.result, "C3 应已求解");
  const payload = exportNetlist(state);
  const { playground, ...netlist } = payload;

  assert.deepEqual(netlist, toNetlist(state));
  assert.deepEqual(Object.keys(netlist).sort(), ["config", "devices", "strict_reference", "wires"]);
  assert.deepEqual(Object.keys(playground).sort(), ["elapsed_ms", "layout", "rpm", "state_bits"]);
  assert.equal(playground.layout.length, state.devices.length);
  for (const device of state.devices) {
    const layout = playground.layout.find((item) => item.ref === device.ref);
    assert.deepEqual(layout, {
      ref: device.ref,
      x: device.x,
      y: device.y,
      w: device.w,
      h: device.h,
    });
    assert.equal(playground.state_bits[device.ref], device.state_bits ?? 0);
    assert.equal(playground.rpm[device.ref], device.rpm ?? 0);
    assert.equal(playground.elapsed_ms[device.ref], device.elapsed_ms ?? 0);
  }
});

test("C3：导出的整个 JSON 回喂 pcx.js，结果与页面 state.result 逐字段一致", { skip: SKIP }, () => {
  const pcx = loadPcx();
  const state = loadSampleState(pcx, "C3");
  const exported = JSON.parse(JSON.stringify(exportNetlist(state)));
  const roundTrip = pcx.solve(exported);

  assert.equal(roundTrip.code, 0);
  assert.deepEqual(roundTrip, state.result);
});

test("白画布最小网表：导出 → 回喂 pcx.js，结果与页面 state.result 逐字段一致", { skip: SKIP }, () => {
  const pcx = loadPcx();
  const state = whiteCanvasState(pcx);
  assert.equal(state.solveError, null);
  assert.equal(state.result.code, 0);

  const exported = JSON.parse(JSON.stringify(exportNetlist(state)));
  assert.equal(exported.devices.length, 3);
  assert.equal(exported.wires.length, 3);
  assert.deepEqual(exported.devices.map((device) => device.ref), ["P1", "PE1", "R1"]);

  const roundTrip = pcx.solve(exported);
  assert.equal(roundTrip.code, 0);
  assert.deepEqual(roundTrip, state.result);
});

test("白画布空网表（0 器件 / 0 导线）同样可导出并回喂", { skip: SKIP }, () => {
  const pcx = loadPcx();
  const state = solveState(createInitialState(), pcx);
  assert.equal(state.result.code, 0);

  const exported = JSON.parse(JSON.stringify(exportNetlist(state)));
  assert.deepEqual(exported.devices, []);
  assert.deepEqual(exported.wires, []);
  assert.deepEqual(exported.playground, { layout: [], state_bits: {}, rpm: {}, elapsed_ms: {} });
  assert.deepEqual(pcx.solve(exported), state.result);
});
