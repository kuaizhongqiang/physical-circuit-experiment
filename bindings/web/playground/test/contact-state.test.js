// contact-state.test.js —— issue #61：触点状态显示读 result.closed_bits、点击不改不可操作器件的 state_bits。
//
// 契约：
//   issue #61 / docs/playground.md §5.4：显示以最近一次 result.closed_bits 为准；
//   docs/api.md §3：第 k 位 = 第 k 条触点闭合（位序来自 stateBitsFor）；
//   尚未求解（没有 result）时才回退 device.state_bits，并标注「未求解」。
//
// 真实内核断言需要 bindings/web/pkg/pcx_circuit.wasm；本地先构建：
//   cargo build -p pcx-wasm --release --target wasm32-unknown-unknown
//   cp target/wasm32-unknown-unknown/release/pcx_wasm.wasm bindings/web/pkg/pcx_circuit.wasm

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPcx } from "../../pcx.js";
import { isOperable, stateBitsFor } from "../device-catalog.js";
import {
  contactStates,
  contactSummary,
  UNSOLVED_LABEL,
} from "../contact-state.js";
import { buildSampleStateInput } from "../samples.js";
import { createInitialState, reducer } from "../state.js";
import { solveState } from "../solve.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const WASM_PATH = join(ROOT, "bindings/web/pkg/pcx_circuit.wasm");
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

function visibleDefinitions(device) {
  const definitions = stateBitsFor(device.kind, device.aux);
  if (device.kind !== "SB" && device.kind !== "SQ") return definitions;
  const type = device.aux ?? 0;
  if (type === 1) return definitions.filter((item) => item.bit === 0);
  if (type === 2) return definitions.filter((item) => item.bit === 1);
  return definitions;
}

/** 按 docs/api.md §3 的位序，从 result.closed_bits 反推期望文案。 */
function expectedSummary(device, result) {
  const definitions = visibleDefinitions(device);
  if (definitions.length === 0) return "无可变触点";
  const deviceResult = result.devices.find((item) => item.id === device.id);
  assert.ok(deviceResult, `${device.ref} 应有求解结果`);
  return definitions
    .map((definition) => {
      const closed = (deviceResult.closed_bits & (1 << definition.bit)) !== 0;
      return `${definition.terminals.join("-")} ${closed ? "闭合" : "断开"}`;
    })
    .join(" · ");
}

test("求解后 contactSummary 与 result.closed_bits 逐位一致（QS/KM/KT/FR/SB/SQ）", { skip: SKIP }, () => {
  const pcx = loadPcx();
  const covered = new Set();
  for (const name of ["C3", "C5", "C10"]) {
    const state = loadSampleState(pcx, name);
    assert.ok(state.result, `${name} 应求解成功`);
    assert.equal(state.solveError, null, `${name} 不应有求解错误`);
    for (const device of state.devices) {
      if (visibleDefinitions(device).length === 0) continue;
      covered.add(device.kind);
      assert.equal(
        contactSummary(device, state.result),
        expectedSummary(device, state.result),
        `${name} ${device.ref} 的触点文案应逐位来自 closed_bits`,
      );
      const display = contactStates(device, state.result);
      assert.equal(display.solved, true, `${name} ${device.ref} 应标记为已求解`);
      assert.equal(display.source, "solve");
      assert.equal(display.bits, state.result.devices.find((item) => item.id === device.id).closed_bits);
    }
  }
  for (const kind of ["QS", "KM", "KT", "FR", "SB", "SQ"]) {
    assert.ok(covered.has(kind), `覆盖用例缺少 ${kind}`);
  }
});

test("线圈未接线的 KM 求解后全释放：主触点断开、13-14 断开、21-22 闭合", { skip: SKIP }, () => {
  const pcx = loadPcx();
  let state = reducer(createInitialState(), { type: "place", kind: "KM" });
  state = solveState(state, pcx);

  assert.ok(state.result, "空回路的 KM 应在宽松模式下求解成功");
  const result = state.result.devices.find((item) => item.id === state.devices[0].id);
  assert.equal(result.closed_bits, 0b10000, "线圈未接线 → 释放：只有 21-22（常闭）闭合");
  assert.equal(
    contactSummary(state.devices[0], state.result),
    "1-2 断开 · 3-4 断开 · 5-6 断开 · 13-14 断开 · 21-22 闭合",
  );
  // 下一轮提示值同样来自 closed_bits（docs/playground.md §5.4）。
  assert.equal(state.devices[0].state_bits, 0b10000);
});

test("尚未求解才回退提示值，并显式标注未求解", () => {
  const device = { ref: "KM9", kind: "KM", aux: 5, id: 7, state_bits: 0b10000 };

  const unsolved = contactSummary(device, null);
  assert.match(unsolved, new RegExp(`^${UNSOLVED_LABEL}`));
  assert.match(unsolved, /21-22 闭合/);

  // result 与该器件结果都在时，必须用 result，而不是提示值。
  const solvedResult = {
    devices: [{ id: 7, closed_bits: 0b01111, flags: 1, coil_i_rms: 0 }],
  };
  const solved = contactSummary(device, solvedResult);
  assert.doesNotMatch(solved, /未求解/);
  assert.equal(solved, "1-2 闭合 · 3-4 闭合 · 5-6 闭合 · 13-14 闭合 · 21-22 断开");
  assert.equal(contactStates(device, solvedResult).bits, 0b01111);

  // 有 result 但缺该器件结果：同样只能回退，并且必须标注。
  const missing = contactSummary(device, { devices: [{ id: 99, closed_bits: 0 }] });
  assert.match(missing, new RegExp(`^${UNSOLVED_LABEL}`));
});

test("画布点击：只有 QS / SB / SQ 可操作，其余 kind 的 state_bits 不变", () => {
  assert.equal(isOperable("QS"), true);
  assert.equal(isOperable("SB"), true);
  assert.equal(isOperable("SQ"), true);
  for (const kind of ["KM", "KA", "KT", "FR", "FU", "M", "R", "EL", "TB", "PE", "POWER"]) {
    assert.equal(isOperable(kind), false, `${kind} 不可人工操作`);
  }

  /** 与 canvas.js 的点击路径一致：先选中；SB/SQ 按下再抬起；QS 翻转；其余不发 operate。 */
  function simulateCanvasClick(state, kind, ref) {
    let next = reducer(state, { type: "select", ref });
    if (kind === "SB" || kind === "SQ") {
      next = reducer(next, { type: "operate", ref, action: "press" });
      next = reducer(next, { type: "operate", ref, action: "release" });
    } else if (kind === "QS") {
      next = reducer(next, { type: "operate", ref, action: "toggle" });
    }
    return next;
  }

  for (const kind of ["KM", "KA", "KT", "FR", "FU", "M", "R", "EL", "TB", "PE", "POWER"]) {
    const state = reducer(createInitialState(), { type: "place", kind });
    const ref = state.devices[0].ref;
    const before = state.devices[0].state_bits;
    const clicked = simulateCanvasClick(state, kind, ref);
    assert.equal(clicked.devices[0].state_bits, before, `${kind} 点击后 state_bits 不得变化`);

    // 防御：即使有人直接发 operate，reducer 也必须原样返回。
    for (const action of ["press", "release", "toggle"]) {
      assert.equal(reducer(state, { type: "operate", ref, action }), state, `${kind} ${action} 应被忽略`);
    }
  }

  // 可操作器件仍然生效，避免把 guard 写成“全部禁掉”。
  const qs = reducer(createInitialState(), { type: "place", kind: "QS" });
  const qsClicked = simulateCanvasClick(qs, "QS", qs.devices[0].ref);
  assert.equal(qsClicked.devices[0].state_bits, 0b111);

  const sb = reducer(createInitialState(), { type: "place", kind: "SB", aux: 2 });
  const sbRef = sb.devices[0].ref;
  const sbPressed = reducer(sb, { type: "operate", ref: sbRef, action: "press" });
  assert.equal(sbPressed.devices[0].state_bits, 0b10);
  assert.equal(reducer(sbPressed, { type: "operate", ref: sbRef, action: "release" }).devices[0].state_bits, 0);
});
