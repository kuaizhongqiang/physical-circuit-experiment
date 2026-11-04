// geometry.js —— 器件接点坐标与边界标注方向（纯函数）。
//
// 契约：docs/playground.md §3.1 / §3.3、docs/demo.md §3.4。
// 接点坐标 = 盒子左上角 + (u × w, v × h)；edge 只决定编号 / 标注文字的偏移方向。
// 本文件不决定器件位置，也不做走线（正交走线与框内裁剪属于 M6.3）。

import { terminalsFor } from "./device-catalog.js";

/** 接点圆点半径（docs/playground.md §3.1）。 */
export const TERMINAL_DOT_RADIUS = 4;
/** 接点命中半径；触屏可放宽到 10 px。 */
export const TERMINAL_HIT_RADIUS = 6;
/** 接点编号 / 标注文字相对接点的默认外偏距离。 */
export const TERMINAL_LABEL_OFFSET = 6;

const EDGE_NORMALS = Object.freeze({
  left: Object.freeze({ dx: -1, dy: 0 }),
  right: Object.freeze({ dx: 1, dy: 0 }),
  top: Object.freeze({ dx: 0, dy: -1 }),
  bottom: Object.freeze({ dx: 0, dy: 1 }),
});

/**
 * 取某个接点的完整几何信息。
 * @param {{kind: string, aux?: number, x: number, y: number, w: number, h: number}} device
 * @param {number} terminalIndex 接点序号（0 起，按 docs/domain-model.md §2 表内顺序）
 * @returns {{index: number, name: string, edge: string, u: number, v: number, x: number, y: number}}
 */
export function terminalGeometry(device, terminalIndex) {
  if (!device || typeof device !== "object") {
    throw new TypeError("terminalGeometry 需要器件对象");
  }
  const terminals = terminalsFor(device.kind, device.aux);
  if (!Number.isInteger(terminalIndex) || terminalIndex < 0 || terminalIndex >= terminals.length) {
    throw new RangeError(
      `${device.kind} 没有序号为 ${terminalIndex} 的接点（共 ${terminals.length} 个）`,
    );
  }
  const terminal = terminals[terminalIndex];
  const { x, y, w, h } = device;
  for (const [name, value] of [["x", x], ["y", y], ["w", w], ["h", h]]) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(`器件盒子缺少有效的 ${name}`);
    }
  }
  return {
    index: terminal.index,
    name: terminal.name,
    edge: terminal.edge,
    u: terminal.u,
    v: terminal.v,
    x: x + terminal.u * w,
    y: y + terminal.v * h,
  };
}

/** 接点坐标 = 盒子左上角 + (u × w, v × h)。 */
export function terminalPoint(device, terminalIndex) {
  const { x, y } = terminalGeometry(device, terminalIndex);
  return { x, y };
}

/** 边的向外单位法向量（只用于编号 / 标注文字偏移，不改变接点坐标）。 */
export function edgeNormal(edge) {
  const normal = EDGE_NORMALS[edge];
  if (!normal) throw new RangeError(`未知的接点边：${edge}`);
  return { ...normal };
}

/** 接点编号 / 标注文字的落点：接点沿边法向向外偏 distance px。 */
export function labelPoint(device, terminalIndex, distance = TERMINAL_LABEL_OFFSET) {
  const geometry = terminalGeometry(device, terminalIndex);
  const normal = edgeNormal(geometry.edge);
  return {
    x: geometry.x + normal.dx * distance,
    y: geometry.y + normal.dy * distance,
  };
}
