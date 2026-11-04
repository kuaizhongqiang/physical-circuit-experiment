// model.test.js —— id / terminal_base 分配、增删改与级联删线（纯函数，不改入参）。

import test from "node:test";
import assert from "node:assert/strict";

import { defaultParams, terminalsFor } from "../device-catalog.js";
import { allocIds, moveDevice, placeDevice, removeDevice } from "../model.js";

const pairs = (devices) => devices.map((device) => [device.id, device.terminal_base]);

// 把全局接点 id 投影回「ref.接点名」，用于证明重排只换 id、不换接点语义。
function projectTerminal(devices, terminalId) {
  for (const device of devices) {
    const terminals = terminalsFor(device.kind, device.aux);
    const offset = terminalId - device.terminal_base;
    if (offset >= 0 && offset < terminals.length) {
      return `${device.ref}.${terminals[offset].name}`;
    }
  }
  return `?${terminalId}`;
}

const wireSemantics = (state) => state.wires
  .map((wire) => `${projectTerminal(state.devices, wire.a)}→${projectTerminal(state.devices, wire.b)}`)
  .sort();

function baseDevices() {
  return allocIds([
    { ref: "P1", kind: "POWER", aux: 0 },
    { ref: "QS1", kind: "QS", aux: 3 },
    { ref: "FU1", kind: "FU", aux: 0 },
    { ref: "PE1", kind: "PE", aux: 0 },
  ]);
}

test("allocIds 按接点数前缀和连续分配 id / terminal_base", () => {
  const devices = [
    { ref: "P1", kind: "POWER", aux: 0, note: "keep" },
    { ref: "QS1", kind: "QS", aux: 3 },
    { ref: "TB1", kind: "TB", aux: 8 },
    { ref: "PE1", kind: "PE", aux: 0 },
  ];
  const allocated = allocIds(devices);
  assert.deepEqual(pairs(allocated), [[1, 0], [2, 4], [3, 10], [4, 18]]);
  assert.equal(allocated[0].note, "keep");
  // 入参不被修改。
  assert.equal("id" in devices[0], false);
  assert.equal("terminal_base" in devices[0], false);
  // 再跑一次结果不变。
  assert.deepEqual(allocIds(allocated), allocated);
  assert.deepEqual(allocIds([]), []);
});

test("allocIds 对 TB 可变接点数取前缀和", () => {
  const allocated = allocIds([
    { ref: "TB2", kind: "TB", aux: 2 },
    { ref: "TB8", kind: "TB", aux: 8 },
    { ref: "TB5", kind: "TB", aux: 5 },
  ]);
  assert.deepEqual(pairs(allocated), [[1, 0], [2, 2], [3, 10]]);
});

test("placeDevice 追加器件并补齐 aux / params / state_bits / flags / w / h", () => {
  const state = { devices: [], wires: [], selection: null };
  const next = placeDevice(state, { ref: "P1", kind: "POWER", x: 10, y: 20 });

  assert.equal(state.devices.length, 0, "入参 state 不能被子函数修改");
  assert.equal(next.devices.length, 1);
  assert.equal(next.selection, null);
  assert.deepEqual(next.wires, []);
  const power = next.devices[0];
  assert.deepEqual(
    { id: power.id, terminal_base: power.terminal_base, x: power.x, y: power.y, w: power.w, h: power.h },
    { id: 1, terminal_base: 0, x: 10, y: 20, w: 100, h: 220 },
  );
  assert.equal(power.aux, 0);
  assert.deepEqual(power.params, defaultParams("POWER"));
  assert.equal(power.state_bits, 0);
  assert.equal(power.flags, 0);

  const next2 = placeDevice(next, { ref: "TB1", kind: "TB", aux: 8 });
  assert.deepEqual(pairs(next2.devices), [[1, 0], [2, 4]]);
  assert.deepEqual(
    { w: next2.devices[1].w, h: next2.devices[1].h, aux: next2.devices[1].aux },
    { w: 240, h: 60, aux: 8 },
  );
  assert.deepEqual(next2.devices[1].params, [0, 0, 0, 0, 0, 0, 0, 0]);
});

test("placeDevice 按类型给 SB / QS 缺省 state_bits 与 flags", () => {
  let state = { devices: [], wires: [] };
  state = placeDevice(state, { ref: "SB1", kind: "SB", aux: 1 });
  state = placeDevice(state, { ref: "SB2", kind: "SB", aux: 2 });
  state = placeDevice(state, { ref: "SB3", kind: "SB", aux: 3 });
  state = placeDevice(state, { ref: "QS1", kind: "QS" });
  state = placeDevice(state, { ref: "KM1", kind: "KM" });

  assert.deepEqual(state.devices.map((device) => device.aux), [1, 2, 3, 3, 5]);
  assert.deepEqual(state.devices.map((device) => device.state_bits), [1, 0, 1, 0, 0]);
  assert.deepEqual(state.devices.map((device) => device.flags), [1, 1, 1, 1, 0]);
  assert.deepEqual(pairs(state.devices), [[1, 0], [2, 4], [3, 8], [4, 12], [5, 18]]);
});

test("placeDevice 允许调用方覆盖 params / 尺寸，但不会共享 params 引用", () => {
  const params = [30, 0, 0, 0, 0, 0, 0, 0];
  const state = placeDevice({ devices: [], wires: [] }, {
    ref: "R1", kind: "R", params, w: 99, h: 77,
  });
  assert.deepEqual(state.devices[0].params, params);
  assert.notEqual(state.devices[0].params, params);
  assert.equal(state.devices[0].w, 99);
  assert.equal(state.devices[0].h, 77);
  params[0] = 1;
  assert.equal(state.devices[0].params[0], 30);
});

test("placeDevice 拒绝未知 kind", () => {
  assert.throws(
    () => placeDevice({ devices: [], wires: [] }, { ref: "X1", kind: "NOPE" }),
    /未知器件 kind/,
  );
});

test("moveDevice 只改 x / y，不动 id / terminal_base / 导线", () => {
  const state = {
    devices: baseDevices(),
    wires: [{ a: 0, b: 4, note: "P1.L1 → QS1.1" }],
    selection: 2,
  };
  const moved = moveDevice(state, 3, { x: 500, y: 600 });

  assert.equal(state.devices[2].x, undefined, "入参 state 不能被修改");
  assert.notEqual(moved, state);
  assert.deepEqual(pairs(moved.devices), pairs(state.devices));
  assert.deepEqual(
    {
      x: moved.devices[2].x, y: moved.devices[2].y,
      w: moved.devices[2].w, h: moved.devices[2].h,
    },
    { x: 500, y: 600, w: undefined, h: undefined },
  );
  assert.deepEqual(moved.wires, state.wires);
  assert.equal(moved.selection, 2);
  // 未知 id 幂等返回原 state。
  assert.equal(moveDevice(state, 999, { x: 0, y: 0 }), state);
  assert.throws(() => moveDevice(state, 1, { x: 1 }), /moveDevice 需要 \{x, y\}/);
});

test("removeDevice 先级联删线，再重排 id / terminal_base 并重写剩余导线", () => {
  const state = {
    devices: baseDevices(),
    wires: [
      { a: 0, b: 4, note: "P1.L1 → QS1.1" }, // 连到被删 QS → 删
      { a: 10, b: 12, note: "FU1.2 → PE1.PE" }, // 保留，重写为 4 / 6
      { a: 5, b: 10, note: "QS1.3 → FU1.1" }, // 连到被删 QS → 删
      { a: 4, b: 5, note: "QS1 内部" }, // 连到被删 QS → 删
      { a: 10, b: 11, note: "FU1 两端" }, // 保留，重写为 4 / 5
    ],
    selection: 2,
  };
  const next = removeDevice(state, 2); // 删 QS1

  assert.equal(state.devices.length, 4, "入参 state 不能被修改");
  assert.deepEqual(next.devices.map((device) => device.ref), ["P1", "FU1", "PE1"]);
  assert.deepEqual(pairs(next.devices), [[1, 0], [2, 4], [3, 6]]);
  assert.deepEqual(next.wires, [
    { a: 4, b: 6, note: "FU1.2 → PE1.PE" },
    { a: 4, b: 5, note: "FU1 两端" },
  ]);
  assert.deepEqual(wireSemantics(next), ["FU1.1→FU1.2", "FU1.1→PE1.PE"]);
  assert.equal(next.selection, 2);
});

test("removeDevice 删除首台器件时后续接点全部前移", () => {
  const state = {
    devices: baseDevices(),
    wires: [
      { a: 0, b: 4 }, // POWER → QS，删
      { a: 5, b: 10 }, // QS.3 → FU.1，保留：1 / 6
      { a: 4, b: 5 }, // QS 内部：0 / 1
      { a: 10, b: 12 }, // FU.2 → PE：6 / 8
    ],
  };
  const next = removeDevice(state, 1); // 删 POWER

  assert.deepEqual(next.devices.map((device) => device.ref), ["QS1", "FU1", "PE1"]);
  assert.deepEqual(pairs(next.devices), [[1, 0], [2, 6], [3, 8]]);
  assert.deepEqual(next.wires, [
    { a: 1, b: 6 },
    { a: 0, b: 1 },
    { a: 6, b: 8 },
  ]);
  assert.deepEqual(wireSemantics(next), [
    "FU1.1→PE1.PE",
    "QS1.1→QS1.3",
    "QS1.3→FU1.1",
  ]);
});

test("removeDevice 删除末台器件时前面的接点 id 不变", () => {
  const state = {
    devices: baseDevices(),
    wires: [
      { a: 0, b: 4 },
      { a: 10, b: 12, note: "连到 PE → 删" },
      { a: 10, b: 11, note: "FU 两端" },
    ],
  };
  const next = removeDevice(state, 4); // 删 PE

  assert.deepEqual(pairs(next.devices), [[1, 0], [2, 4], [3, 10]]);
  assert.deepEqual(next.wires, [
    { a: 0, b: 4 },
    { a: 10, b: 11, note: "FU 两端" },
  ]);
});

test("removeDevice 对 TB 可变接点数先删线再整体重排", () => {
  const state = {
    devices: [
      { ref: "P1", kind: "POWER", aux: 0 },
      { ref: "TB1", kind: "TB", aux: 5 },
      { ref: "TB2", kind: "TB", aux: 8 },
      { ref: "PE1", kind: "PE", aux: 0 },
    ],
    wires: [
      { a: 4, b: 9 }, // TB1.0 → TB2.0，删
      { a: 9, b: 17 }, // TB2.0 → PE.PE，保留：4 / 12
      { a: 0, b: 4 }, // P1.L1 → TB1.0，删
      { a: 0, b: 9 }, // P1.L1 → TB2.0，保留：0 / 4
      { a: 9, b: 10 }, // TB2 内部：4 / 5
    ],
  };
  state.devices = allocIds(state.devices); // 0/4/9/17
  assert.deepEqual(pairs(state.devices), [[1, 0], [2, 4], [3, 9], [4, 17]]);

  const next = removeDevice(state, 2); // 删 TB1（5 个接点）

  assert.deepEqual(next.devices.map((device) => device.ref), ["P1", "TB2", "PE1"]);
  assert.deepEqual(pairs(next.devices), [[1, 0], [2, 4], [3, 12]]);
  assert.deepEqual(next.wires, [
    { a: 4, b: 12 },
    { a: 0, b: 4 },
    { a: 4, b: 5 },
  ]);
});

test("removeDevice 未知 id 幂等返回原 state", () => {
  const state = { devices: baseDevices(), wires: [] };
  assert.equal(removeDevice(state, 999), state);
});
