// solve.js —— state → pcx.js JSON 入参 → solve → 结果并入 state。
//
// 契约：
//   docs/playground.md §2.2  只做映射与结果并入；不做任何电气判定、不改输入数值
//   docs/playground.md §2.3  只有提交型事件触发 solve；失败保留上一次成功结果并置错误
//   docs/playground.md §5.3  第 4 条：失败保留上次成功结果用于绘制，诊断栏显示错误
//   docs/playground.md §5.4  每次成功后回传 KM / KA / KT / KS / FR 的 closed_bits 作为下一轮提示
//   docs/api.md §7           wasm JSON 门面：输入 / 输出字段
//
// 本文件不碰 DOM，可在 node --test 里注入一个假的 pcx 对象直接测映射与并入逻辑。

import { defaultAux } from "./device-catalog.js";

// 触点状态由库自解的器件：求解后把 closed_bits 写回 state_bits，flags.bit0 = 0（§5.4）。
const SELF_SOLVED = new Set(["KM", "KA", "KT", "KS", "FR"]);

function eightParams(params) {
  return Array.from({ length: 8 }, (_, index) => {
    const value = Array.isArray(params) ? params[index] : undefined;
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  });
}

/** state → docs/api.md §7 的 JSON 入参（只搬字符串与数字，不做电气判断）。 */
export function toNetlist(state) {
  return {
    // 编辑中间态（白画布）默认宽松：空网表也必须 solve 成功并出数（§5.3 第 7 条）。
    strict_reference: state.strictReference === true,
    config: { ...(state.config ?? {}) },
    devices: (state.devices ?? []).map((device) => ({
      ref: device.ref,
      kind: device.kind,
      id: device.id,
      terminal_base: device.terminal_base,
      aux: device.aux ?? defaultAux(device.kind),
      params: eightParams(device.params),
      state_bits: device.state_bits ?? 0,
      flags: device.flags ?? 0,
      elapsed_ms: device.elapsed_ms ?? 0,
      rpm: device.rpm ?? 0,
      shaft_group: device.shaft_group ?? 0,
    })),
    wires: (state.wires ?? []).map((wire) => ({ a: wire.a, b: wire.b })),
  };
}

/** 求解成功后把库自解器件的 closed_bits 写成下一轮的 state_bits 提示（D-20261103-29）。 */
export function writeBackClosedBits(devices, deviceResults) {
  const byId = new Map((deviceResults ?? []).map((result) => [result.id, result]));
  return (devices ?? []).map((device) => {
    if (!SELF_SOLVED.has(device.kind)) return device;
    const result = byId.get(device.id);
    if (!result || typeof result.closed_bits !== "number") return device;
    return { ...device, state_bits: result.closed_bits, flags: 0 };
  });
}

function failureMessage(code) {
  if (code === null || code === undefined) return "求解失败：未收到内核结果";
  return `求解失败（code ${code}）`;
}

/**
 * 把一次 solve 的输出并入 state。
 * - code === 0：result 换成新结果，回写自解触点；
 * - 其余：result 保留上一次成功结果（供画布继续显示），只更新 diags 与 solveError。
 */
export function applySolveResult(state, output) {
  const diags = Array.isArray(output?.diags) ? output.diags : [];
  const code = output && Number.isInteger(output.code) ? output.code : null;

  if (code === 0) {
    return {
      ...state,
      devices: writeBackClosedBits(state.devices, output.devices),
      result: output,
      diags,
      solveError: null,
      needsSolve: false,
      solveRevision: state.revision,
      resultRevision: state.revision,
    };
  }

  return {
    ...state,
    diags,
    solveError: { code, message: failureMessage(code) },
    needsSolve: false,
    solveRevision: state.revision,
  };
}

/**
 * 宿主入口：对当前 state 调一次 solve。
 * @param {object} state
 * @param {{solve: (netlist: object) => object}} pcx  pcx.js 门面（或 node 测试里的替身）
 */
export function solveState(state, pcx) {
  if (!pcx || typeof pcx.solve !== "function") {
    return {
      ...state,
      solveError: { code: null, message: "求解器未加载：先构建 wasm 并刷新页面" },
      needsSolve: false,
    };
  }

  let output;
  try {
    output = pcx.solve(toNetlist(state));
  } catch (error) {
    return {
      ...state,
      solveError: { code: null, message: `求解调用异常：${error?.message ?? error}` },
      needsSolve: false,
    };
  }
  return applySolveResult(state, output);
}
