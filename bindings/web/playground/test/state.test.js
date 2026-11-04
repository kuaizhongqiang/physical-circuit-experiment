// state.test.js —— 画布编辑器 reducer 的纯逻辑单测（无 DOM、无 wasm）。
// 覆盖 issue #40 验收判据：放置 / 移动 / 删除 / 选中 / 清空，以及 §2.4 的重排与 §5.4 的操作。

import test from "node:test";
import assert from "node:assert/strict";

import { defaultBox, terminalCount, terminalsFor } from "../device-catalog.js";
import {
  CANVAS,
  MODE,
  createInitialState,
  findFreeSpot,
  isCommitEvent,
  reducer,
  selectedDevice,
  totalTerminalCount,
} from "../state.js";

const place = (state, kind, extra = {}) => reducer(state, { type: "place", kind, ...extra });

function boxesDoNotOverlap(devices) {
  for (let i = 0; i < devices.length; i += 1) {
    for (let j = i + 1; j < devices.length; j += 1) {
      const a = devices[i];
      const b = devices[j];
      const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      assert.equal(overlap, false, `${a.ref} 与 ${b.ref} 的盒子重叠`);
    }
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

test("createInitialState 是白画布空状态，不触发求解", () => {
  const state = createInitialState();
  assert.deepEqual(state.devices, []);
  assert.deepEqual(state.wires, []);
  assert.equal(state.selected, null);
  assert.equal(state.mode, MODE.IDLE);
  assert.equal(state.sample, null);
  assert.equal(state.result, null);
  assert.equal(state.strictReference, false);
  assert.equal(state.needsSolve, false);
});

test("place 追加器件、分配 id / terminal_base、自动选中断提交求解", () => {
  let state = createInitialState();
  state = place(state, "POWER");

  assert.equal(state.devices.length, 1);
  assert.equal(state.selected, "P1");
  assert.equal(state.needsSolve, true);
  assert.equal(state.revision, 1);
  assert.deepEqual(
    { ref: state.devices[0].ref, id: state.devices[0].id, base: state.devices[0].terminal_base },
    { ref: "P1", id: 1, base: 0 },
  );
  assert.equal(state.devices[0].x >= 0, true);
  assert.equal(state.devices[0].x + state.devices[0].w <= CANVAS.w, true);
  assert.equal(state.devices[0].y + state.devices[0].h <= CANVAS.h, true);

  state = place(state, "POWER");
  assert.equal(state.devices[1].ref, "P2");
  assert.equal(state.devices[1].id, 2);
  assert.equal(state.devices[1].terminal_base, 4);
  assert.equal(state.revision, 2);
});

test("place 允许显式坐标 / 位号，并保留调用方给的 state_bits / params", () => {
  const params = [220, 60, 0.001, 1, 0, 0, 0, 0];
  let state = createInitialState();
  state = place(state, "POWER", { ref: "PX", x: 100, y: 200, params });
  state = place(state, "TB", { ref: "TBX", x: 300, y: 200, aux: 8 });

  const power = state.devices[0];
  assert.deepEqual({ ref: power.ref, x: power.x, y: power.y, w: power.w, h: power.h }, {
    ref: "PX", x: 100, y: 200, w: 100, h: 220,
  });
  assert.deepEqual(power.params, params);
  assert.notEqual(power.params, params);
  assert.equal(state.devices[1].w, defaultBox("TB", 8).w);
  assert.equal(state.devices[1].h, defaultBox("TB", 8).h);
});

test("15 类器件各放 1 台：位号唯一、盒子不重叠、接点总数与 catalog 一致", () => {
  const order = [
    "POWER", "QS", "FU", "KM", "KA", "KT", "KS",
    "FR", "SB", "SQ", "M", "R", "EL", "TB", "PE",
  ];
  let state = createInitialState();
  for (const kind of order) state = place(state, kind);

  assert.equal(state.devices.length, 15);
  assert.equal(new Set(state.devices.map((device) => device.ref)).size, 15);
  assert.deepEqual(state.devices.map((device) => device.ref), [
    "P1", "QS1", "FU1", "KM1", "KA1", "KT1", "KS1",
    "FR1", "SB1", "SQ1", "M1", "R1", "EL1", "TB1", "PE1",
  ]);
  boxesDoNotOverlap(state.devices);

  const expected = state.devices.reduce(
    (sum, device) => sum + terminalCount(device.kind, device.aux),
    0,
  );
  assert.equal(totalTerminalCount(state.devices), expected);
  assert.equal(expected, 74); // 默认配置：POWER4 QS6 FU2 KM12 KA6 KT6 KS4 FR10 SB4 SQ4 M6 R2 EL2 TB5 PE1
  assert.equal(totalTerminalCount([]), 0);
});

test("findFreeSpot 对同一输入结果确定，且避开已有盒子", () => {
  const box = defaultBox("FU");
  const devices = [{ ref: "A", kind: "FU", x: 24, y: 24, w: 60, h: 80 }];
  const spot = findFreeSpot(devices, box);
  assert.deepEqual(findFreeSpot(devices, box), spot);
  assert.equal(spot.x >= 0 && spot.x + box.w <= CANVAS.w, true);
  assert.equal(spot.y >= 0 && spot.y + box.h <= CANVAS.h, true);
  const overlap = spot.x < 24 + 60 && spot.x + box.w > 24 && spot.y < 24 + 80 && spot.y + box.h > 24;
  assert.equal(overlap, false);
});

test("select 只改选中，不触发求解；未知 ref 清空选中", () => {
  let state = place(createInitialState(), "POWER");
  state = place(state, "FU");
  const solved = deepFreeze({ ...state, needsSolve: false });

  const selected = reducer(solved, { type: "select", ref: "FU1" });
  assert.equal(selected.selected, "FU1");
  assert.equal(selected.needsSolve, false);
  assert.equal(selected.revision, solved.revision);
  assert.equal(selectedDevice(selected).ref, "FU1");

  const byId = reducer(solved, { type: "select", id: state.devices[1].id });
  assert.equal(byId.selected, "FU1");

  const unknown = reducer(solved, { type: "select", ref: "NOPE" });
  assert.equal(unknown.selected, null);
  assert.equal(selectedDevice(unknown), null);
});

test("movePreview 只更新预览；moveCommit 提交坐标并触发求解", () => {
  let state = place(createInitialState(), "FU", { x: 100, y: 100 });
  state = { ...state, needsSolve: false };
  const before = state.devices[0];

  const preview = reducer(state, { type: "movePreview", ref: "FU1", x: 300, y: 240 });
  assert.equal(preview.mode, MODE.DRAG);
  assert.deepEqual(preview.drag, { ref: "FU1", x: 300, y: 240, fromX: 100, fromY: 100 });
  assert.equal(preview.devices[0].x, before.x);
  assert.equal(preview.devices[0].y, before.y);
  assert.equal(preview.needsSolve, false);

  const committed = reducer(preview, { type: "moveCommit", ref: "FU1", x: 300, y: 240 });
  assert.equal(committed.mode, MODE.IDLE);
  assert.equal(committed.drag, null);
  assert.deepEqual({ x: committed.devices[0].x, y: committed.devices[0].y }, { x: 300, y: 240 });
  assert.equal(committed.needsSolve, true);
  assert.equal(committed.revision, state.revision + 1);

  // move 是 movePreview 的别名；dx / dy 相对当前位置。
  const relative = reducer(state, { type: "move", ref: "FU1", dx: 40, dy: -20 });
  assert.deepEqual({ x: relative.drag.x, y: relative.drag.y }, { x: 140, y: 80 });
  assert.equal(relative.devices[0].x, 100);

  const cancelled = reducer(preview, { type: "cancel" });
  assert.equal(cancelled.mode, MODE.IDLE);
  assert.equal(cancelled.drag, null);
  assert.deepEqual({ x: cancelled.devices[0].x, y: cancelled.devices[0].y }, { x: 100, y: 100 });

  const same = reducer(state, { type: "moveCommit", ref: "FU1", x: 100, y: 100 });
  assert.equal(same.needsSolve, false);
});

test("move 提交被限制在逻辑画布内", () => {
  let state = place(createInitialState(), "FU", { x: 10, y: 10 });
  state = reducer(state, { type: "moveCommit", ref: "FU1", x: -50, y: 5000 });
  assert.deepEqual({ x: state.devices[0].x, y: state.devices[0].y }, {
    x: 0,
    y: CANVAS.h - state.devices[0].h,
  });
});

test("remove 级联删线、重排 id / terminal_base 并重写剩余导线", () => {
  let state = createInitialState();
  state = place(state, "POWER", { x: 20, y: 20 });
  state = place(state, "FU", { x: 200, y: 20 });
  state = place(state, "PE", { x: 320, y: 20 });

  // 接点 id：POWER 0..3；FU 4/5；PE 6。
  state = {
    ...state,
    wires: [{ a: 0, b: 4 }, { a: 4, b: 6 }, { a: 1, b: 7 }],
    selected: "PE1",
    needsSolve: false,
  };

  const next = reducer(state, { type: "remove", ref: "P1" });
  assert.deepEqual(next.devices.map((device) => [device.ref, device.id, device.terminal_base]), [
    ["FU1", 1, 0],
    ["PE1", 2, 2],
  ]);
  // FU.1 → PE.PE 的语义不变，id 从 4→0 / 6→2；接 POWER 与越界端点的导线被删。
  assert.deepEqual(next.wires, [{ a: 0, b: 2 }]);
  assert.equal(next.selected, "PE1");
  assert.equal(next.needsSolve, true);
  assert.match(next.notice, /已删除 P1/);
  assert.equal(next.revision, state.revision + 1);

  const removedSelected = reducer({ ...state, selected: "P1" }, { type: "remove", ref: "P1" });
  assert.equal(removedSelected.selected, null);

  const unknown = reducer(state, { type: "remove", ref: "NOPE" });
  assert.equal(unknown, state);
});

test("reset / clear 回到白画布并清空结果", () => {
  let state = createInitialState();
  state = place(state, "POWER");
  state = {
    ...state,
    result: { code: 0, terminals: [] },
    solveError: { code: 90, message: "old" },
    selected: "P1",
    mode: MODE.DRAG,
    drag: { ref: "P1", x: 1, y: 2 },
  };

  const reset = reducer(state, { type: "reset" });
  assert.deepEqual(reset.devices, []);
  assert.deepEqual(reset.wires, []);
  assert.equal(reset.selected, null);
  assert.equal(reset.mode, MODE.IDLE);
  assert.equal(reset.drag, null);
  assert.equal(reset.sample, null);
  assert.equal(reset.result, null);
  assert.deepEqual(reset.diags, []);
  assert.equal(reset.solveError, null);
  assert.equal(reset.needsSolve, true);
  assert.equal(reset.revision, state.revision + 1);

  const clear = reducer(state, { type: "clear" });
  assert.deepEqual(clear.devices, []);
  assert.deepEqual(clear.wires, []);
  assert.equal(clear.needsSolve, true);
});

test("loadSample 从显式 devices / wires 建状态，reset 重新加载同一样例", () => {
  const devices = [
    { ref: "P1", kind: "POWER", x: 10, y: 10 },
    { ref: "PE1", kind: "PE", x: 200, y: 10 },
  ];
  const sample = {
    type: "loadSample",
    sample: "T-1",
    devices,
    wires: [{ a: 0, b: 4 }, { a: 99, b: 0 }, { a: 3, b: 3 }],
    strictReference: true,
  };

  let state = reducer(createInitialState(), sample);
  assert.equal(state.sample, "T-1");
  assert.equal(state.strictReference, true);
  assert.deepEqual(state.devices.map((device) => [device.ref, device.id, device.terminal_base]), [
    ["P1", 1, 0],
    ["PE1", 2, 4],
  ]);
  // 越界与自连被过滤，保留合法导线的语义。
  assert.deepEqual(state.wires, [{ a: 0, b: 4 }]);
  assert.equal(state.needsSolve, true);
  assert.equal(state.result, null);

  const before = state;
  const reset = reducer(state, { type: "reset" });
  assert.equal(reset.sample, "T-1");
  assert.deepEqual(reset.devices.map((device) => [device.ref, device.id]), [["P1", 1], ["PE1", 2]]);
  assert.deepEqual(reset.wires, [{ a: 0, b: 4 }]);
  assert.equal(reset.strictReference, true);
  assert.equal(reset.revision, before.revision + 1);

  const white = reducer(createInitialState(), { type: "loadSample", sample: null });
  assert.deepEqual(white.devices, []);
  assert.equal(white.sample, null);
});

test("setParam 改参数（不改变接点数）只重算，不改接点 id", () => {
  let state = place(createInitialState(), "POWER", { x: 10, y: 10 });
  state = place(state, "PE", { x: 200, y: 10 });
  const before = { ...state, needsSolve: false };

  const next = reducer(before, { type: "setParam", ref: "P1", field: "v_line", value: 220 });
  assert.equal(next.devices[0].params[0], 220);
  assert.equal(next.devices[1].params[0], 0);
  assert.equal(next.devices[1].terminal_base, 4);
  assert.equal(next.needsSolve, true);
  assert.equal(next.paramError, null);
});

test("setParam 非法值不改状态、不求解，并给行内错误", () => {
  let state = place(createInitialState(), "POWER");
  state = { ...state, needsSolve: false };
  const before = state;

  const zero = reducer(state, { type: "setParam", ref: "P1", field: "v_line", value: 0 });
  assert.equal(zero.devices[0].params[0], before.devices[0].params[0]);
  assert.equal(zero.needsSolve, false);
  assert.match(zero.paramError.message, /必须大于 0/);

  const empty = reducer(state, { type: "setParam", ref: "P1", field: "freq_hz", value: "" });
  assert.match(empty.paramError.message, /不能为空/);

  const negative = reducer(state, { type: "setParam", ref: "R1", field: "resistance", value: -1 });
  assert.equal(negative, state); // 没有 R1：幂等

  const unknownField = reducer(state, { type: "setParam", ref: "P1", field: "nope", value: 1 });
  assert.equal(unknownField, state);
});

test("setParam 改变接点数时按 ref + 接点名重写导线，删掉不存在的接点", () => {
  let state = createInitialState();
  state = place(state, "QS", { x: 10, y: 10 }); // 3 极：接点 0..5
  state = place(state, "FU", { x: 200, y: 10 }); // 接点 6/7
  state = {
    ...state,
    // QS.1 → FU.1（两端都保留）与 QS.5 → FU.2（QS.5 在 1 极配置下不存在）
    wires: [{ a: 0, b: 6 }, { a: 2, b: 7 }],
    needsSolve: false,
  };

  const next = reducer(state, { type: "setParam", ref: "QS1", field: "poles", value: 1 });
  assert.equal(next.devices[0].aux, 1);
  assert.equal(terminalCount("QS", 1), 2);
  assert.deepEqual(next.devices.map((device) => [device.ref, device.id, device.terminal_base]), [
    ["QS1", 1, 0],
    ["FU1", 2, 2],
  ]);
  assert.deepEqual(next.wires, [{ a: 0, b: 2 }]);
  assert.match(next.notice, /删除 1 条导线/);
  assert.equal(next.needsSolve, true);

  // KM 辅助组数：aux 5 → 9（aux_no = 2），接点数 12 → 14，A1 / 主触点等语义不变。
  let km = place(createInitialState(), "KM", { x: 10, y: 10 });
  km = place(km, "PE", { x: 300, y: 10 }); // PE 接点 12
  km = { ...km, wires: [{ a: 12, b: 0 }], needsSolve: false };
  const kmNext = reducer(km, { type: "setParam", ref: "KM1", field: "aux_no", value: 2 });
  assert.equal(kmNext.devices[0].aux, 9);
  assert.equal(terminalCount("KM", 9), 14);
  assert.equal(kmNext.devices[1].terminal_base, 14);
  assert.deepEqual(kmNext.wires, [{ a: 14, b: 0 }]);
});

test("setParam 改 TB 位数：接点数、后续 terminal_base 与导线一起重排", () => {
  let state = createInitialState();
  state = place(state, "TB", { x: 10, y: 10, aux: 2 }); // 接点 0/1
  state = place(state, "PE", { x: 300, y: 10 }); // 接点 2
  state = { ...state, wires: [{ a: 1, b: 2 }], needsSolve: false };

  const next = reducer(state, { type: "setParam", ref: "TB1", field: "n", value: 5 });
  assert.equal(next.devices[0].aux, 5);
  assert.equal(next.devices[1].terminal_base, 5);
  assert.deepEqual(next.wires, [{ a: 1, b: 5 }]);

  const outOfRange = reducer(state, { type: "setParam", ref: "TB1", field: "n", value: 9 });
  assert.match(outOfRange.paramError.message, /不能大于 8/);
});

test("operate：SB / SQ 瞬动，QS 点击保持，KM 等不可人工操作", () => {
  let state = createInitialState();
  state = place(state, "SB", { aux: 1 }); // 常闭
  state = place(state, "SB", { aux: 2 }); // 常开
  state = place(state, "SB", { aux: 3 }); // 复合
  state = place(state, "QS"); // 3 极
  state = place(state, "KM");
  state = { ...state, needsSolve: false };

  const ncPressed = reducer(state, { type: "operate", ref: "SB1", action: "press" });
  assert.equal(ncPressed.devices[0].state_bits, 0b00);
  assert.equal(ncPressed.devices[0].flags, 1);
  assert.equal(ncPressed.needsSolve, true);
  assert.equal(reducer(ncPressed, { type: "operate", ref: "SB1", action: "release" }).devices[0].state_bits, 0b01);

  const noPressed = reducer(state, { type: "operate", ref: "SB2", action: "press" });
  assert.equal(noPressed.devices[1].state_bits, 0b10);
  assert.equal(reducer(noPressed, { type: "operate", ref: "SB2", action: "release" }).devices[1].state_bits, 0b00);

  const bothPressed = reducer(state, { type: "operate", ref: "SB3", action: "press" });
  assert.equal(bothPressed.devices[2].state_bits, 0b10);

  const qs = reducer(state, { type: "operate", ref: "QS1", action: "toggle" });
  assert.equal(qs.devices[3].state_bits, 0b111);
  assert.equal(reducer(qs, { type: "operate", ref: "QS1", action: "toggle" }).devices[3].state_bits, 0);

  assert.equal(reducer(state, { type: "operate", ref: "KM1", action: "press" }), state);
  assert.equal(reducer(state, { type: "operate", ref: "SB1", action: "bogus" }), state);
});

test("setStrict 只在值变化时求解；cancel 只清临时态", () => {
  const state = deepFreeze({ ...place(createInitialState(), "FU"), needsSolve: false });
  const strict = reducer(state, { type: "setStrict", value: true });
  assert.equal(strict.strictReference, true);
  assert.equal(strict.needsSolve, true);
  assert.equal(reducer(strict, { type: "setStrict", value: true }), strict);

  const preview = reducer(state, { type: "movePreview", ref: "FU1", dx: 10, dy: 10 });
  const cancelled = reducer(preview, { type: "cancel" });
  assert.equal(cancelled.mode, MODE.IDLE);
  assert.equal(cancelled.drag, null);
  assert.equal(cancelled.needsSolve, false);
});

test("reducer 不改入参（纯函数）", () => {
  let state = createInitialState();
  state = place(state, "POWER", { x: 20, y: 20 });
  state = place(state, "QS", { x: 200, y: 20 });
  state = { ...state, wires: [{ a: 0, b: 4 }], needsSolve: false };
  const frozen = deepFreeze(state);
  const snapshot = JSON.parse(JSON.stringify(frozen));

  reducer(frozen, { type: "select", ref: "QS1" });
  reducer(frozen, { type: "movePreview", ref: "QS1", x: 300, y: 300 });
  reducer(frozen, { type: "moveCommit", ref: "QS1", x: 300, y: 300 });
  reducer(frozen, { type: "setParam", ref: "QS1", field: "poles", value: 1 });
  reducer(frozen, { type: "setParam", ref: "P1", field: "v_line", value: 220 });
  reducer(frozen, { type: "operate", ref: "QS1", action: "toggle" });
  reducer(frozen, { type: "remove", ref: "P1" });
  reducer(frozen, { type: "reset" });

  assert.deepEqual(JSON.parse(JSON.stringify(frozen)), snapshot);
});

test("isCommitEvent 只把会改变网表 / 需要重算的事件标为提交型", () => {
  for (const type of ["place", "moveCommit", "remove", "setParam", "operate", "loadSample", "reset", "clear", "setStrict"]) {
    assert.equal(isCommitEvent({ type }), true, `${type} 应为提交型`);
  }
  for (const type of ["select", "move", "movePreview", "cancel", "unknown"]) {
    assert.equal(isCommitEvent({ type }), false, `${type} 不应为提交型`);
  }
  assert.equal(isCommitEvent(null), false);
});

test("接点表驱动的默认位号前缀与 fixture 一致", () => {
  let state = createInitialState();
  for (const kind of ["FU", "FU", "FU", "SB", "SB", "KM", "M", "PE"]) state = place(state, kind);
  assert.deepEqual(state.devices.map((device) => device.ref), [
    "FU1", "FU2", "FU3", "SB1", "SB2", "KM1", "M1", "PE1",
  ]);
  assert.deepEqual(terminalsFor("PE").map((terminal) => terminal.name), ["PE"]);
});
