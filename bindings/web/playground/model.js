// model.js —— 器件增删改与接点 id / terminal_base 分配（纯函数，无 DOM）。
//
// 契约：docs/playground.md §2.2 / §2.4。
//   - 全局接点 id = terminal_base + 接点序号；序号按 docs/domain-model.md §2 表内顺序。
//   - 放置：追加到末尾，id 与 terminal_base 连续分配。
//   - 删除：先级联删掉连到它的导线，再重排 id / terminal_base，并按旧→新接点 id 重写剩余导线。
//   - 未删器件的接点（ref + 接点名）语义不变，因此导线端点只换 id，不改含义。
//
// 本文件不决定布局：x / y / w / h 只是携带在器件上的数据，moveDevice 也只改 x / y。

import {
  CATALOG,
  defaultAux,
  defaultBox,
  defaultFlags,
  defaultParams,
  defaultStateBits,
  normalizeAux,
  terminalCount,
} from "./device-catalog.js";

function entryFor(kind) {
  const entry = CATALOG[kind];
  if (!entry) throw new RangeError(`未知器件 kind: ${kind}`);
  return entry;
}

// 新器件只补元数据缺省值；调用方显式给了的字段一律保留。
function normalizeDevice(device) {
  if (!device || typeof device !== "object") {
    throw new TypeError("placeDevice 需要器件对象");
  }
  const entry = entryFor(device.kind);
  const aux = normalizeAux(device.kind, device.aux ?? entry.defaultAux);
  const box = defaultBox(device.kind, aux);
  return {
    ...device,
    kind: device.kind,
    aux,
    params: Array.isArray(device.params) ? [...device.params] : defaultParams(device.kind),
    state_bits: device.state_bits ?? defaultStateBits(device.kind, aux),
    flags: device.flags ?? defaultFlags(device.kind),
    x: device.x ?? 0,
    y: device.y ?? 0,
    w: device.w ?? box.w,
    h: device.h ?? box.h,
  };
}

/** 重排 id 与 terminal_base：id 从 1 开始，terminal_base 是前面器件接点数的前缀和。 */
export function allocIds(devices) {
  let terminalBase = 0;
  return devices.map((device, index) => {
    const next = { ...device, id: index + 1, terminal_base: terminalBase };
    terminalBase += terminalCount(device.kind, device.aux);
    return next;
  });
}

/**
 * 采用已有 id / terminal_base 的器件（样例来自 fixtures/C*.json）。
 *
 * 与 placeDevice 的区别：**不重排 id / terminal_base**，只补缺省元数据（aux / params /
 * state_bits / flags / w / h），并校验 id 从 1 连续、terminal_base 等于前面器件接点数的
 * 前缀和 —— 否则 fixture 导线端点会错位（docs/playground.md §4.2）。
 */
export function adoptDevices(devices = []) {
  let terminalBase = 0;
  return devices.map((raw, index) => {
    const device = normalizeDevice(raw);
    if (device.id !== index + 1) {
      throw new RangeError(`器件 ${device.ref ?? index} 的 id 应为 ${index + 1}，实际 ${device.id}`);
    }
    if (device.terminal_base !== terminalBase) {
      throw new RangeError(
        `器件 ${device.ref ?? index} 的 terminal_base 应为 ${terminalBase}，实际 ${device.terminal_base}`,
      );
    }
    terminalBase += terminalCount(device.kind, device.aux);
    return device;
  });
}

/** 追加一台器件；缺省 aux / params / state_bits / flags / w / h 由 catalog 补齐。 */
export function placeDevice(state = {}, device) {
  const devices = state.devices ?? [];
  const normalized = normalizeDevice(device);
  return {
    ...state,
    devices: allocIds([...devices, normalized]),
    wires: state.wires ?? [],
  };
}

/** 移动器件到新位置（只改 x / y，不改 w / h 与任何接点 id）。 */
export function moveDevice(state, id, position) {
  const devices = state.devices ?? [];
  const index = devices.findIndex((device) => device.id === id);
  if (index < 0) return state; // 器件已删除：幂等，不制造新状态
  if (!position || typeof position.x !== "number" || typeof position.y !== "number") {
    throw new TypeError("moveDevice 需要 {x, y}");
  }
  const moved = devices.map((device, i) => (
    i === index ? { ...device, x: position.x, y: position.y } : device
  ));
  return { ...state, devices: moved };
}

/** 删除器件：先级联删线，再重排 id / terminal_base，并把剩余导线端点重写成新 id。 */
export function removeDevice(state, id) {
  const devices = state.devices ?? [];
  const index = devices.findIndex((device) => device.id === id);
  if (index < 0) return state; // 已删除：幂等

  const removed = devices[index];
  const removedCount = terminalCount(removed.kind, removed.aux);

  // 旧 terminal_base 按当前数组顺序重算，避免依赖可能过期的字段。
  let removedBase = 0;
  for (let i = 0; i < index; i += 1) {
    removedBase += terminalCount(devices[i].kind, devices[i].aux);
  }
  const removedEnd = removedBase + removedCount;

  const keptOld = devices.filter((_, i) => i !== index);
  const keptNew = allocIds(keptOld);

  // 旧接点 id → 新接点 id；被删器件的接点不在表中。
  const terminalIdMap = new Map();
  let oldBase = 0;
  let keptIndex = 0;
  for (let i = 0; i < devices.length; i += 1) {
    const device = devices[i];
    const count = terminalCount(device.kind, device.aux);
    if (i === index) {
      oldBase += count;
      continue;
    }
    const newBase = keptNew[keptIndex].terminal_base;
    for (let k = 0; k < count; k += 1) {
      terminalIdMap.set(oldBase + k, newBase + k);
    }
    keptIndex += 1;
    oldBase += count;
  }

  const isRemovedTerminal = (terminalId) => terminalId >= removedBase && terminalId < removedEnd;
  const wires = (state.wires ?? [])
    .filter((wire) => !isRemovedTerminal(wire.a) && !isRemovedTerminal(wire.b))
    .map((wire) => ({
      ...wire,
      a: terminalIdMap.has(wire.a) ? terminalIdMap.get(wire.a) : wire.a,
      b: terminalIdMap.has(wire.b) ? terminalIdMap.get(wire.b) : wire.b,
    }));

  return { ...state, devices: keptNew, wires };
}
