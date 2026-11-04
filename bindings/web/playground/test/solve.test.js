// solve.test.js —— state → pcx 入参映射、结果并入与失败保留上次结果的单测。
// 用假的 pcx 对象验证映射/并入逻辑，不依赖 wasm 产物。

import test from "node:test";
import assert from "node:assert/strict";

import { placeDevice } from "../model.js";
import {
  applySolveResult,
  solveState,
  toNetlist,
  writeBackClosedBits,
} from "../solve.js";
import { createInitialState, reducer } from "../state.js";

function deviceState() {
  let state = createInitialState();
  state = reducer(state, { type: "place", kind: "POWER", ref: "P1", x: 10, y: 20 });
  state = reducer(state, { type: "place", kind: "KM", ref: "KM1", x: 200, y: 20 });
  state = reducer(state, { type: "place", kind: "PE", ref: "PE1", x: 400, y: 20 });
  return state;
}

test("toNetlist 只输出 docs/api.md §7 的 JSON 字段，保留接点 id 与顺序", () => {
  const state = deviceState();
  const netlist = toNetlist({ ...state, wires: [{ a: 0, b: 5 }] });

  assert.equal(netlist.strict_reference, false);
  assert.deepEqual(netlist.config, {});
  assert.deepEqual(netlist.wires, [{ a: 0, b: 5 }]);
  assert.equal(netlist.devices.length, 3);
  assert.deepEqual(Object.keys(netlist.devices[0]).sort(), [
    "aux", "elapsed_ms", "flags", "id", "kind", "params", "ref", "rpm", "shaft_group", "state_bits", "terminal_base",
  ]);
  assert.deepEqual(
    {
      ref: netlist.devices[0].ref,
      kind: netlist.devices[0].kind,
      id: netlist.devices[0].id,
      base: netlist.devices[0].terminal_base,
      params: netlist.devices[0].params,
    },
    { ref: "P1", kind: "POWER", id: 1, base: 0, params: [380, 50, 0.001, 1, 0, 0, 0, 0] },
  );
  assert.equal(netlist.devices[0].params.length, 8);
  // 布局坐标是数据，不进入网表。
  assert.equal("x" in netlist.devices[0], false);
  assert.equal("w" in netlist.devices[0], false);
});

test("toNetlist 把 params 补/截到 8 位，并把 strictReference / config 原样传下去", () => {
  const state = {
    ...createInitialState({ strictReference: true, config: { tol: 1e-10 } }),
    devices: [
      {
        ref: "R1", kind: "R", id: 1, terminal_base: 0, aux: 0,
        params: [30], state_bits: 0, flags: 0,
      },
    ],
  };
  const netlist = toNetlist(state);
  assert.equal(netlist.strict_reference, true);
  assert.deepEqual(netlist.config, { tol: 1e-10 });
  assert.deepEqual(netlist.devices[0].params, [30, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(netlist.devices[0].aux, 0);
});

test("空白画布映射为 0 器件 / 0 导线，宽松模式", () => {
  const netlist = toNetlist(createInitialState());
  assert.deepEqual(netlist, {
    strict_reference: false,
    config: {},
    devices: [],
    wires: [],
  });
});

test("writeBackClosedBits 只回写库自解器件，应用给状态的器件不动", () => {
  const devices = [
    { ref: "SB1", kind: "SB", id: 1, terminal_base: 0, aux: 2, state_bits: 2, flags: 1 },
    { ref: "KM1", kind: "KM", id: 2, terminal_base: 4, aux: 5, state_bits: 0, flags: 0 },
    { ref: "KT1", kind: "KT", id: 3, terminal_base: 16, aux: 0, state_bits: 0, flags: 0 },
    { ref: "PE1", kind: "PE", id: 4, terminal_base: 22, aux: 0, state_bits: 0, flags: 0 },
  ];
  const next = writeBackClosedBits(devices, [
    { id: 1, closed_bits: 0b10 },
    { id: 2, closed_bits: 0b00111 },
    { id: 3, closed_bits: 0b10 },
  ]);

  assert.equal(next[0], devices[0]); // SB 是应用给状态，不覆盖
  assert.deepEqual({ bits: next[1].state_bits, flags: next[1].flags }, { bits: 0b00111, flags: 0 });
  assert.deepEqual({ bits: next[2].state_bits, flags: next[2].flags }, { bits: 0b10, flags: 0 });
  assert.equal(next[3], devices[3]);
  assert.equal(writeBackClosedBits(devices, undefined)[1], devices[1]);
});

test("applySolveResult 成功：结果、诊断、revision 并入，needsSolve 清零", () => {
  const state = {
    ...deviceState(),
    needsSolve: true,
    revision: 7,
    resultRevision: 3,
  };
  const output = {
    code: 0,
    terminals: [{ id: 0, v_rms: 220, i_rms: 5 }],
    devices: [{ id: 2, closed_bits: 0b10000, flags: 1 }],
    diags: [{ code: 102, level: 1 }],
  };

  const next = applySolveResult(state, output);
  assert.equal(next.result, output);
  assert.deepEqual(next.diags, output.diags);
  assert.equal(next.solveError, null);
  assert.equal(next.needsSolve, false);
  assert.equal(next.solveRevision, 7);
  assert.equal(next.resultRevision, 7);
  assert.equal(next.devices.find((device) => device.ref === "KM1").state_bits, 0b10000);
  assert.equal(next.devices.find((device) => device.ref === "KM1").flags, 0);
});

test("applySolveResult 失败：保留上一次成功结果，只换诊断与错误条", () => {
  const lastGood = { code: 0, terminals: [{ id: 0, v_rms: 220 }] };
  const state = {
    ...deviceState(),
    result: lastGood,
    resultRevision: 4,
    needsSolve: true,
    revision: 8,
  };
  const failure = { code: 40, terminals: [], devices: [], diags: [{ code: 40, level: 2 }] };

  const next = applySolveResult(state, failure);
  assert.equal(next.result, lastGood);
  assert.equal(next.resultRevision, 4);
  assert.deepEqual(next.diags, failure.diags);
  assert.deepEqual(next.solveError, { code: 40, message: "求解失败（code 40）" });
  assert.equal(next.needsSolve, false);
  assert.equal(next.solveRevision, 8);
});

test("solveState 调 pcx.solve 并传入完整网表", () => {
  const state = deviceState();
  const calls = [];
  const fake = {
    solve(netlist) {
      calls.push(netlist);
      return { code: 0, terminals: [], devices: [], diags: [] };
    },
  };

  const next = solveState(state, fake);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].devices.length, 3);
  assert.equal(calls[0].devices[0].ref, "P1");
  assert.equal(next.result.code, 0);
  assert.equal(next.solveError, null);
  assert.equal(next.needsSolve, false);
});

test("solveState 的异常 / 未加载都变成错误条，不抛出", () => {
  const state = {
    ...deviceState(),
    result: { code: 0, terminals: [] },
    needsSolve: true,
  };

  const thrown = solveState(state, { solve() { throw new Error("boom"); } });
  assert.match(thrown.solveError.message, /boom/);
  assert.equal(thrown.result, state.result);
  assert.equal(thrown.needsSolve, false);

  const missing = solveState(state, null);
  assert.match(missing.solveError.message, /求解器未加载/);
  assert.equal(missing.result, state.result);
  assert.equal(missing.needsSolve, false);
});

test("solve.js 不自己改输入数值（只复制）", () => {
  const state = deviceState();
  const before = JSON.stringify(toNetlist(state));
  const netlist = toNetlist(state);
  netlist.devices[0].params[0] = 1;
  assert.equal(JSON.stringify(toNetlist(state)), before);
  assert.equal(state.devices[0].params[0], 380);
});

test("placeDevice 的故障路径不影响 solve 映射：无导线也能映射", () => {
  const state = placeDevice(createInitialState(), { ref: "PE1", kind: "PE", x: 0, y: 0 });
  const netlist = toNetlist(state);
  assert.equal(netlist.devices.length, 1);
  assert.equal(netlist.devices[0].terminal_base, 0);
  assert.deepEqual(netlist.wires, []);
});
