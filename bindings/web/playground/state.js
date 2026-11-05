// state.js —— 画布编辑器的纯数据模型与纯函数 reducer（无 DOM、不调 solve、不读时钟）。
//
// 契约：
//   docs/playground.md §2.2  模块职责与禁令：事件入、状态出；不碰 DOM / solve / Date
//   docs/playground.md §2.4  接点 id / terminal_base 分配与删除后的重排
//   docs/playground.md §5.1  交互状态机：mode / devices / wires / selected / drag / sample / result / diags
//   docs/playground.md §5.4  操作器件的触点状态（SB / SQ 瞬动，QS 保持，KS 转速）与 KT / FR 应用侧时钟
//   docs/playground.md §7.1  可编辑参数子集与非法值处理
//
// 本文件只做“状态转换”：提交型事件把 needsSolve 置 true，由宿主（index.html）调用 solve.js。
// 拖动预览、选中、取消都不触发求解（§5.3）。

import {
  CATALOG,
  defaultAux,
  defaultBox,
  defaultStateBits,
  paramsFor,
  terminalCount,
  terminalsFor,
} from "./device-catalog.js";
import { adoptDevices, allocIds, moveDevice, placeDevice, removeDevice } from "./model.js";

/** 逻辑画布尺寸（docs/playground.md §3.1）。 */
export const CANVAS = Object.freeze({ w: 1600, h: 1000 });

/** 交互模式（§5.1）：只有三种。 */
export const MODE = Object.freeze({ IDLE: "IDLE", PICK_A: "PICK_A", DRAG: "DRAG" });

// 新放置器件的位号前缀（与 fixtures/ 的既有位号一致：P1 / QS1 / FU1 / KM1 / M1 …）。
const REF_PREFIX = Object.freeze({
  POWER: "P", QS: "QS", FU: "FU", KM: "KM", KA: "KA", KT: "KT", KS: "KS",
  FR: "FR", SB: "SB", SQ: "SQ", M: "M", R: "R", EL: "EL", TB: "TB", PE: "PE",
});

// 提交型事件：必须重新 solve（§5.3 第 1 条）。select / movePreview / cancel 不在其中。
const COMMIT_TYPES = Object.freeze(new Set([
  "place", "moveCommit", "remove", "setParam", "operate", "tick", "loadSample", "reset", "clear",
  "setStrict", "addWire", "completeWire", "removeWire", "clearWires",
]));

const MARGIN = 24;
// 器件框外还要画接点编号与电压；留够注释宽度，避免相邻器件文字互相压住。
const GAP = 48;
const SPOT_STEP = 20;

/** 空状态；白画布入口用它启动（§1.1 入口 ②）。 */
export function createInitialState(overrides = {}) {
  return {
    mode: MODE.IDLE,
    devices: [],
    wires: [],
    selected: null,
    selectedWire: null,
    pendingTerminal: null,
    drag: null,
    sample: null,
    sampleData: null,
    sampleNote: null,
    fixtureStrictReference: false,
    config: {},
    result: null,
    diags: [],
    strictReference: false,
    solveError: null,
    paramError: null,
    notice: null,
    noticeLevel: "info",
    revision: 0,
    needsSolve: false,
    solveRevision: 0,
    resultRevision: -1,
    ...overrides,
  };
}

// ── 小工具 ──────────────────────────────────────────────────────────────────

function clonePlain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function assertState(state) {
  if (!state || typeof state !== "object") {
    throw new TypeError("reducer 需要 state 对象");
  }
}

/** 按 ref（优先）或 id 找器件；找不到返回 null。 */
export function findDevice(state, { ref, id } = {}) {
  const devices = state?.devices ?? [];
  if (ref !== undefined && ref !== null) {
    return devices.find((device) => device.ref === ref) ?? null;
  }
  if (id !== undefined && id !== null) {
    return devices.find((device) => device.id === id) ?? null;
  }
  return null;
}

function resolveDevice(state, event) {
  return findDevice(state, { ref: event?.ref, id: event?.id });
}

/** 全状态接点总数（顶部状态条用；顺序 = devices 数组顺序）。 */
export function totalTerminalCount(devices = []) {
  return devices.reduce((sum, device) => sum + terminalCount(device.kind, device.aux), 0);
}

/** 当前选中器件对象（选中值按 §5.1 存 ref，删除后 ref 仍稳定）。 */
export function selectedDevice(state) {
  return findDevice(state, { ref: state?.selected });
}

/** 下一个位号：同前缀里数字最大的 +1（P1 / P2 …）。 */
export function nextRef(devices, kind) {
  const prefix = REF_PREFIX[kind];
  if (!prefix) throw new RangeError(`未知器件 kind: ${kind}`);
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  let max = 0;
  for (const device of devices) {
    if (typeof device.ref !== "string") continue;
    const match = device.ref.match(pattern);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}${max + 1}`;
}

function boxesOverlap(a, b) {
  return a.x < b.x + b.w + GAP
    && a.x + a.w + GAP > b.x
    && a.y < b.y + b.h + GAP
    && a.y + a.h + GAP > b.y;
}

/**
 * 在画布空闲位置找一个落点：从上到下、从左到右按 SPOT_STEP 扫描，避开已有器件的盒子。
 * 纯函数、确定（同一 devices 顺序 → 同一落点），不依赖随机数。
 */
export function findFreeSpot(devices, box, canvas = CANVAS) {
  const maxX = Math.max(MARGIN, canvas.w - box.w - MARGIN);
  const maxY = Math.max(MARGIN, canvas.h - box.h - MARGIN);
  for (let y = MARGIN; y <= maxY; y += SPOT_STEP) {
    for (let x = MARGIN; x <= maxX; x += SPOT_STEP) {
      const candidate = { x, y, w: box.w, h: box.h };
      if (!devices.some((device) => boxesOverlap(candidate, device))) {
        return { x, y };
      }
    }
  }
  // 画布被占满时退化为往下叠放，仍保证落在画布内（不重叠不再是硬保证）。
  let y = MARGIN;
  for (const device of devices) y = Math.max(y, device.y + device.h + GAP);
  return { x: MARGIN, y: Math.min(y, maxY) };
}

function clampPosition(device, x, y) {
  const w = device.w ?? 0;
  const h = device.h ?? 0;
  return {
    x: Math.max(0, Math.min(Math.round(x), CANVAS.w - w)),
    y: Math.max(0, Math.min(Math.round(y), CANVAS.h - h)),
  };
}

function moveTarget(device, event) {
  if (Number.isFinite(event.x) && Number.isFinite(event.y)) {
    return clampPosition(device, event.x, event.y);
  }
  if (Number.isFinite(event.dx) && Number.isFinite(event.dy)) {
    return clampPosition(device, device.x + event.dx, device.y + event.dy);
  }
  return { x: device.x, y: device.y };
}

function commit(state, patch = {}) {
  return {
    ...state,
    mode: MODE.IDLE,
    pendingTerminal: null,
    drag: null,
    selectedWire: null,
    revision: (state.revision ?? 0) + 1,
    needsSolve: true,
    solveError: null,
    paramError: null,
    notice: null,
    noticeLevel: "info",
    ...patch,
  };
}

// ── 触点状态（§5.4 / docs/api.md §3） ───────────────────────────────────────

/** SB / SQ 按下：NC 断开、NO 闭合；BOTH = 常闭断开 ＋ 常开闭合。 */
export function pressedBits(kind, aux) {
  if (kind !== "SB" && kind !== "SQ") return 0;
  if (aux === 1) return 0b00; // 只有常闭：按下断开
  return 0b10; // 只有常开 / 复合：常开闭合
}

/** SB / SQ 抬起复位：NC 侧闭合、NO 侧断开。 */
export function releasedBits(kind, aux) {
  return defaultStateBits(kind, aux);
}

/** QS 极位掩码（aux = poles）。 */
function poleMask(kind, aux) {
  if (kind !== "QS") return 0;
  const poles = aux === 1 ? 1 : 3;
  return (1 << poles) - 1;
}

// ── 参数变更与接点重排（§2.4 / §7.1） ───────────────────────────────────────

/** 表单校验纯函数（docs/playground.md §7.1）：合法返回 `{ok, value}`，非法返回 `{ok:false, message}`。 */
export function validateParam(definition, raw) {
  const label = definition.label;
  if (definition.control === "select") {
    const value = Number(raw);
    if (!definition.options.some((option) => option.value === value)) {
      const allowed = definition.options.map((option) => option.value).join(" / ");
      return { ok: false, message: `${label}只能取 ${allowed}` };
    }
    return { ok: true, value };
  }

  if (typeof raw === "string" && raw.trim() === "") {
    return { ok: false, message: `${label}不能为空` };
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { ok: false, message: `${label}必须是数字` };
  }
  if (definition.integer && !Number.isInteger(value)) {
    return { ok: false, message: `${label}必须是整数` };
  }
  if (definition.minExclusive !== undefined && !(value > definition.minExclusive)) {
    return { ok: false, message: `${label}必须大于 ${definition.minExclusive}` };
  }
  if (definition.min !== undefined && value < definition.min) {
    return { ok: false, message: `${label}不能小于 ${definition.min}` };
  }
  if (definition.max !== undefined && value > definition.max) {
    return { ok: false, message: `${label}不能大于 ${definition.max}` };
  }
  return { ok: true, value };
}

// 接点语义键：ref + 接点名。aux 改变后据此重写导线端点。
function terminalKeyMap(devices) {
  const map = new Map();
  for (const device of devices) {
    const terminals = terminalsFor(device.kind, device.aux);
    for (let index = 0; index < terminals.length; index += 1) {
      map.set(device.terminal_base + index, `${device.ref}\u0000${terminals[index].name}`);
    }
  }
  return map;
}

function rewriteWiresForAuxChange(oldDevices, oldWires, ref, newAux) {
  const withNewAux = oldDevices.map((device) => (
    device.ref === ref ? { ...device, aux: newAux } : device
  ));
  const devices = allocIds(withNewAux);
  const oldKeys = terminalKeyMap(oldDevices);
  const newIds = new Map();
  for (const [id, key] of terminalKeyMap(devices)) newIds.set(key, id);

  let dropped = 0;
  const wires = [];
  for (const wire of oldWires ?? []) {
    const keyA = oldKeys.get(wire.a);
    const keyB = oldKeys.get(wire.b);
    const a = keyA === undefined ? undefined : newIds.get(keyA);
    const b = keyB === undefined ? undefined : newIds.get(keyB);
    if (a === undefined || b === undefined) {
      dropped += 1;
      continue;
    }
    wires.push({ ...wire, a, b });
  }
  return { devices, wires, dropped };
}

function decodeRelayAux(aux) {
  return { auxNo: Math.floor((aux ?? defaultAux("KM")) / 4), auxNc: (aux ?? defaultAux("KM")) % 4 };
}

function setParamEvent(state, event) {
  const device = resolveDevice(state, event);
  if (!device) return state;
  const definition = paramsFor(device.kind).find((item) => item.key === event.field);
  if (!definition) return state;

  const validation = validateParam(definition, event.value);
  if (!validation.ok) {
    return {
      ...state,
      paramError: {
        ref: device.ref,
        key: definition.key,
        message: validation.message,
        // 保留用户原始输入，行内报错时输入框仍显示它，便于就地改。
        raw: event.value,
      },
    };
  }

  const value = validation.value;
  const params = Array.isArray(device.params) ? [...device.params] : [];
  let aux = device.aux;

  if (definition.target.field === "params") {
    params[definition.target.index] = value;
  } else if (definition.target.field === "aux") {
    if (definition.target.part) {
      const current = decodeRelayAux(device.aux);
      aux = definition.target.part === "aux_no"
        ? value * 4 + current.auxNc
        : current.auxNo * 4 + value;
    } else {
      aux = value;
    }
  }

  if (aux === device.aux) {
    const devices = state.devices.map((item) => (
      item.ref === device.ref ? { ...item, params } : item
    ));
    return commit({ ...state, devices }, { selected: device.ref });
  }

  const rewrite = rewriteWiresForAuxChange(state.devices, state.wires, device.ref, aux);
  const devices = rewrite.devices.map((item) => (
    item.ref === device.ref ? { ...item, params } : item
  ));
  return commit(
    { ...state, devices, wires: rewrite.wires },
    {
      selected: device.ref,
      notice: rewrite.dropped > 0 ? `因参数变更删除 ${rewrite.dropped} 条导线` : null,
    },
  );
}

// ── 事件处理 ────────────────────────────────────────────────────────────────

function placeEvent(state, event) {
  const kind = event.kind;
  const entry = CATALOG[kind];
  if (!entry) throw new RangeError(`未知器件 kind: ${kind}`);
  const aux = event.aux ?? defaultAux(kind);
  const box = defaultBox(kind, aux);

  let x = event.x;
  let y = event.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    const spot = findFreeSpot(state.devices ?? [], box);
    x = spot.x;
    y = spot.y;
  }

  const device = {
    kind,
    aux,
    ref: event.ref ?? nextRef(state.devices ?? [], kind),
    x,
    y,
    w: event.w ?? box.w,
    h: event.h ?? box.h,
  };
  // 样例 / 恢复状态时允许显式带这些字段；新放置通常由 model.placeDevice 补缺省值。
  for (const field of ["params", "state_bits", "flags", "elapsed_ms", "rpm", "shaft_group"]) {
    if (event[field] !== undefined) device[field] = event[field];
  }

  const next = placeDevice(state, device);
  return commit(next, { selected: device.ref });
}

function selectEvent(state, event) {
  const device = resolveDevice(state, event);
  return { ...state, selected: device?.ref ?? null, selectedWire: null };
}

function movePreviewEvent(state, event) {
  const device = resolveDevice(state, event);
  if (!device) return state;
  const target = moveTarget(device, event);
  return {
    ...state,
    mode: MODE.DRAG,
    selected: device.ref,
    drag: { ref: device.ref, x: target.x, y: target.y, fromX: device.x, fromY: device.y },
  };
}

function moveCommitEvent(state, event) {
  const device = resolveDevice(state, event);
  if (!device) return state;
  const target = moveTarget(device, event);
  if (target.x === device.x && target.y === device.y) {
    return { ...state, mode: MODE.IDLE, drag: null, selected: device.ref };
  }
  const moved = moveDevice(state, device.id, target);
  return commit(moved, { selected: device.ref });
}

function removeEvent(state, event) {
  const device = resolveDevice(state, event);
  if (!device) return state;
  const next = removeDevice(state, device.id);
  return commit(next, {
    selected: state.selected === device.ref ? null : state.selected,
    notice: `已删除 ${device.ref}`,
  });
}

/** KS 转速是应用侧输入（docs/playground.md §5.4 / D-20261104-05）：只写 rpm，触点状态仍由内核判定。 */
const RPM_MIN = 0;
const RPM_MAX = 0xffff;

function rejectRpm(state, device, rawValue) {
  return {
    ...state,
    paramError: {
      ref: device.ref,
      key: "rpm",
      message: `转速必须是 ${RPM_MIN}…${RPM_MAX} 的整数（rpm）`,
      raw: rawValue,
    },
  };
}

function operateKs(state, device, action, rawValue) {
  if (action !== "setRpm" && action !== "rpm") return state;
  // 空输入不当作 0：避免清空转速框时误把转速归零。
  if (typeof rawValue === "string" && rawValue.trim() === "") {
    return rejectRpm(state, device, rawValue);
  }
  const value = Number(rawValue);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < RPM_MIN || value > RPM_MAX) {
    return rejectRpm(state, device, rawValue);
  }
  if (value === (device.rpm ?? 0)) return state;
  const devices = state.devices.map((item) => (
    item.ref === device.ref ? { ...item, rpm: value } : item
  ));
  return commit({ ...state, devices }, { selected: device.ref });
}

function operateEvent(state, event) {
  const device = resolveDevice(state, event);
  if (!device) return state;
  if (device.kind === "KS") return operateKs(state, device, event.action, event.value);
  if (!["SB", "SQ", "QS"].includes(device.kind)) return state;

  const action = event.action;
  let bits = device.state_bits ?? 0;
  if ((device.kind === "SB" || device.kind === "SQ") && action === "press") {
    bits = pressedBits(device.kind, device.aux);
  } else if ((device.kind === "SB" || device.kind === "SQ") && action === "release") {
    bits = releasedBits(device.kind, device.aux);
  } else if (device.kind === "QS" && action === "toggle") {
    bits = (bits ^ poleMask(device.kind, device.aux)) & 0xff;
  } else {
    return state;
  }
  if (bits === (device.state_bits ?? 0)) return state;

  const devices = state.devices.map((item) => (
    item.ref === device.ref ? { ...item, state_bits: bits, flags: 1 } : item
  ));
  return commit({ ...state, devices }, { selected: device.ref });
}

// ── 应用侧时钟（docs/playground.md §5.4 / integration.md §2） ───────────────
// 只推进 KT / FR 的累积量；电气判定（到点、跳闸、KS 触点）仍在内核。
// 由宿主按 10 ms 固定步长发 tick 事件；本函数是纯函数，不读时钟。
function tickEvent(state, event) {
  const dt = Math.floor(Number(event.dt_ms ?? event.dt));
  if (!Number.isFinite(dt) || dt <= 0) return state;
  if (!state.result) return state;

  const resultById = new Map((state.result.devices ?? []).map((result) => [result.id, result]));
  const overcurrent = (state.diags ?? []).some((diag) => diag.code === 100);
  let changed = false;

  const devices = (state.devices ?? []).map((device) => {
    if (device.kind !== "KT" && device.kind !== "FR") return device;
    const elapsed = Number.isInteger(device.elapsed_ms) ? device.elapsed_ms : 0;
    const result = resultById.get(device.id);
    let next = elapsed;

    if (device.kind === "KT") {
      const energized = Boolean(result && (result.flags & 1));
      const timed = Boolean(result && (result.closed_bits & 1)); // bit0 = 55-56 闭合
      if (!energized) next = 0;               // 通电延时型：失电归零
      else if (!timed) next = elapsed + dt;   // 到点后不再增长，避免每 10 ms 重算
    } else {
      const tripped = Boolean(result && (result.closed_bits & 2)); // bit1 = 97-98 闭合
      if (!overcurrent) next = 0;             // 上一轮无 W_OVERCURRENT：归零
      else if (!tripped) next = elapsed + dt;
    }

    if (next === elapsed) return device;
    changed = true;
    return { ...device, elapsed_ms: Math.min(next, 0xffffffff) };
  });

  if (!changed) return state;
  // 时钟 tick 不抢用户的行内错误 / 提示：只更新累积量与求解标记。
  return {
    ...state,
    devices,
    revision: (state.revision ?? 0) + 1,
    needsSolve: true,
    solveError: null,
  };
}

// ── 接线（§5.2 拒绝规则 / §5.3 提交型变更） ─────────────────────────────────

/** 接点 id 是否属于当前网表；越界 / 非整数 / 未分配都算“接点不存在”。 */
export function isKnownTerminal(state, terminalId) {
  if (!Number.isInteger(terminalId)) return false;
  return terminalId >= 0 && terminalId < totalTerminalCount(state?.devices ?? []);
}

/** 接点 id → `位号.接点名`（导线清单与提示用）；找不到时退回 `#id`。 */
export function terminalLabel(devices, terminalId) {
  for (const device of devices ?? []) {
    const terminals = terminalsFor(device.kind, device.aux);
    const index = terminalId - device.terminal_base;
    if (index >= 0 && index < terminals.length) {
      return `${device.ref}.${terminals[index].name}`;
    }
  }
  return `#${terminalId}`;
}

/**
 * 接线校验（§5.2）：自连 / 重复 / 越界或未知接点一律拒绝，其余交内核。
 * 纯函数，不读 state 以外的任何东西。
 * @returns {{ok: true} | {ok: false, message: string}}
 */
export function validateWire(state, a, b) {
  if (!isKnownTerminal(state, a) || !isKnownTerminal(state, b)) {
    return { ok: false, message: "接点不存在" };
  }
  if (a === b) {
    return { ok: false, message: "不能把接点接到自己" };
  }
  const duplicate = (state.wires ?? []).some(
    (wire) => (wire.a === a && wire.b === b) || (wire.a === b && wire.b === a),
  );
  if (duplicate) {
    return { ok: false, message: "已有此导线" };
  }
  return { ok: true };
}

// 拒绝不上屏、不求解：只清待接线状态，并在诊断栏留一条 warn（§5.2）。
function rejectWire(state, message) {
  return {
    ...state,
    mode: MODE.IDLE,
    pendingTerminal: null,
    notice: message,
    noticeLevel: "warn",
  };
}

function appendWire(state, a, b) {
  const validation = validateWire(state, a, b);
  if (!validation.ok) return rejectWire(state, validation.message);
  const wires = [...(state.wires ?? []), { a, b }];
  return commit(
    { ...state, wires },
    { notice: `已加线 ${terminalLabel(state.devices, a)} ↔ ${terminalLabel(state.devices, b)}` },
  );
}

function pickTerminalEvent(state, event) {
  const terminal = event.terminal ?? event.term ?? event.id;
  if (!isKnownTerminal(state, terminal)) return rejectWire(state, "接点不存在");
  return {
    ...state,
    mode: MODE.PICK_A,
    pendingTerminal: terminal,
    selectedWire: null,
    notice: null,
    noticeLevel: "info",
  };
}

function completeWireEvent(state, event) {
  const terminal = event.terminal ?? event.term ?? event.id;
  const pending = state.pendingTerminal;
  // 没有待接线的第二次点击没有语义：不制造状态。
  if (pending === null || pending === undefined) return state;
  return appendWire(state, pending, terminal);
}

function addWireEvent(state, event) {
  const a = event.a ?? event.from;
  const b = event.b ?? event.to;
  return appendWire(state, a, b);
}

function removeWireEvent(state, event) {
  const index = event.index ?? event.i;
  const wires = state.wires ?? [];
  if (!Number.isInteger(index) || index < 0 || index >= wires.length) return state;
  const removed = wires[index];
  const next = wires.filter((_, i) => i !== index);
  return commit(
    { ...state, wires: next },
    {
      notice: `已删除导线 ${terminalLabel(state.devices, removed.a)} ↔ ${terminalLabel(state.devices, removed.b)}`,
    },
  );
}

function selectWireEvent(state, event) {
  const index = event.index ?? event.i;
  const wires = state.wires ?? [];
  if (!Number.isInteger(index) || index < 0 || index >= wires.length) {
    return { ...state, selectedWire: null, selected: null };
  }
  return {
    ...state,
    selected: null,
    selectedWire: index,
    mode: MODE.IDLE,
    pendingTerminal: null,
  };
}

function clearWiresEvent(state) {
  if ((state.wires ?? []).length === 0) return state;
  return commit({ ...state, wires: [] }, { notice: "已清空全部导线" });
}

// 样例器件：fixtures 已给出幂等的 id / terminal_base 时原样采用（samples.js 保证）；
// 只有显式 devices 没带 id 的旧路径才按放置顺序重新分配。
function buildSampleDevices(rawDevices) {
  const list = rawDevices ?? [];
  const explicit = list.length > 0 && list.every(
    (device) => Number.isInteger(device?.id) && Number.isInteger(device?.terminal_base),
  );
  if (explicit) return adoptDevices(list);

  let devices = [];
  for (const rawDevice of list) {
    devices = placeDevice({ devices, wires: [] }, rawDevice).devices;
  }
  return devices;
}

function buildSampleState(event) {
  const name = event.sample ?? null;
  const strictReference = event.strictReference === true;
  if (name === null || name === undefined) {
    return createInitialState({ strictReference, sample: null });
  }

  const devices = buildSampleDevices(event.devices);
  const config = clonePlain(event.config ?? {});
  const note = event.note ?? null;
  const fixtureStrictReference = event.fixtureStrictReference === true;

  const terminalTotal = totalTerminalCount(devices);
  const wires = [];
  for (const wire of event.wires ?? []) {
    if (!Number.isInteger(wire.a) || !Number.isInteger(wire.b)) continue;
    if (wire.a === wire.b) continue;
    if (wire.a < 0 || wire.b < 0 || wire.a >= terminalTotal || wire.b >= terminalTotal) continue;
    wires.push({ a: wire.a, b: wire.b });
  }

  return createInitialState({
    devices,
    wires,
    config,
    sample: name,
    sampleNote: note,
    fixtureStrictReference,
    strictReference,
    sampleData: {
      devices: clonePlain(event.devices ?? []),
      wires: clonePlain(event.wires ?? []),
      config: clonePlain(config),
      note,
      fixtureStrictReference,
    },
  });
}

function loadSampleEvent(state, event) {
  const built = buildSampleState(event);
  return {
    ...built,
    revision: (state.revision ?? 0) + 1,
    needsSolve: true,
    solveRevision: state.solveRevision ?? 0,
    resultRevision: -1,
    result: null,
    diags: [],
  };
}

function resetEvent(state) {
  if (state.sample && state.sampleData) {
    return loadSampleEvent(state, {
      type: "loadSample",
      sample: state.sample,
      devices: state.sampleData.devices,
      wires: state.sampleData.wires,
      config: state.sampleData.config,
      note: state.sampleData.note,
      fixtureStrictReference: state.sampleData.fixtureStrictReference,
      strictReference: state.strictReference,
    });
  }
  const built = createInitialState({
    strictReference: state.strictReference,
    sample: null,
  });
  return {
    ...built,
    revision: (state.revision ?? 0) + 1,
    needsSolve: true,
    solveRevision: state.solveRevision ?? 0,
    resultRevision: -1,
    result: null,
    diags: [],
  };
}

// ── 主入口 ──────────────────────────────────────────────────────────────────

/**
 * 纯函数 reducer：state + event → next state。
 *
 * 事件：
 *   place        { kind, ref?, x?, y?, aux?, params?, … }        提交
 *   select       { ref }（或 { id }）                              非提交
 *   movePreview  { ref, x, y } 或 { ref, dx, dy }                 非提交（拖动中）
 *   move / moveCommit  { ref, x, y } 或 { ref, dx, dy }           move = 预览；moveCommit 提交
 *   remove       { ref }（或 { id }）                              提交（级联删线 + 重排）
 *   setParam     { ref, field, value }                            提交（仅合法值）
 *   operate      { ref, action: "press"|"release"|"toggle" }      提交（KS 用 { action:"setRpm", value }）
 *   tick         { dt_ms }                                        提交（仅 KT / FR 累积量变化时）
 *   loadSample   { sample, devices?, wires?, strictReference? }   提交
 *   reset        —                                                提交（白画布清空）
 *   clear        —                                                提交（清空为白画布）
 *   cancel       —                                                非提交（取消拖动 / 待接线 / 选中导线）
 *   setStrict    { value }                                        提交（宽松 / 严格切换）
 *   pickTerminal { terminal }                                     非提交（接线第一个接点，进入 PICK_A）
 *   completeWire { terminal }                                     提交（与 pendingTerminal 成线；拒绝规则见 §5.2）
 *   addWire      { a, b }                                         提交（直接按接点 id 加线，拒绝规则同上）
 *   removeWire   { index }                                        提交（删除导线）
 *   selectWire   { index | null }                                 非提交（选中 / 取消选中导线）
 *   clearWires   —                                                提交（清空全部导线）
 */
export function reducer(state, event) {
  assertState(state);
  if (!event || typeof event.type !== "string") return state;

  switch (event.type) {
    case "place":
      return placeEvent(state, event);
    case "select":
      return selectEvent(state, event);
    case "move":
    case "movePreview":
      return movePreviewEvent(state, event);
    case "moveCommit":
      return moveCommitEvent(state, event);
    case "remove":
    case "delete":
      return removeEvent(state, event);
    case "setParam":
      return setParamEvent(state, event);
    case "operate":
      return operateEvent(state, event);
    case "tick":
      return tickEvent(state, event);
    case "pickTerminal":
      return pickTerminalEvent(state, event);
    case "completeWire":
      return completeWireEvent(state, event);
    case "addWire":
      return addWireEvent(state, event);
    case "removeWire":
      return removeWireEvent(state, event);
    case "selectWire":
      return selectWireEvent(state, event);
    case "clearWires":
      return clearWiresEvent(state);
    case "loadSample":
      return loadSampleEvent(state, event);
    case "reset":
      return resetEvent(state);
    case "clear": {
      const built = createInitialState({
        strictReference: state.strictReference,
        sample: null,
      });
      return {
        ...built,
        revision: (state.revision ?? 0) + 1,
        needsSolve: true,
        solveRevision: state.solveRevision ?? 0,
        resultRevision: -1,
        result: null,
        diags: [],
      };
    }
    case "cancel":
      return {
        ...state,
        mode: MODE.IDLE,
        drag: null,
        pendingTerminal: null,
        selectedWire: null,
        notice: null,
        noticeLevel: "info",
      };
    case "setStrict": {
      const value = event.value === true;
      if (value === (state.strictReference === true)) return state;
      return commit({ ...state, strictReference: value });
    }
    default:
      return state;
  }
}

/** 该事件是否属于“提交型”（宿主也可据此决定是否求解；reducer 同时维护 needsSolve）。 */
export function isCommitEvent(event) {
  return Boolean(event && COMMIT_TYPES.has(event.type));
}
