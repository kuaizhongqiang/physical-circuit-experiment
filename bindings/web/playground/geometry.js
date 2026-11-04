// geometry.js —— 器件接点坐标、边界标注方向、正交走线与框内裁剪（纯函数）。
//
// 契约：docs/playground.md §3.1 / §3.3、§6.1 与 docs/demo.md §3.4 / §4。
// 接点坐标 = 盒子左上角 + (u × w, v × h)；edge 只决定编号 / 标注文字的偏移方向。
// 走线：接点 → 沿边法向外引 lead → L 型折点（先横后竖）→ 另一端外引点 → 接点；
//       只影响绘制，不改变网表。框内段落用 Liang–Barsky 裁掉（“框内不画线”）。
// 本文件不决定器件位置。

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

// ── 导线：正交走线与框内裁剪（§6.1 / docs/demo.md §4 实现备注） ─────────────

/** 接点沿边法向外引的固定长度（px）。 */
export const WIRE_LEAD = 16;
/** 点选导线的命中距离（px）。 */
export const WIRE_HIT_DISTANCE = 5;

/** 接点沿其所在边向外偏 length px 的落点。 */
export function outwardPoint(terminal, length = WIRE_LEAD) {
  const normal = edgeNormal(terminal?.edge);
  return {
    x: terminal.x + normal.dx * length,
    y: terminal.y + normal.dy * length,
  };
}

function dedupePoints(points) {
  const out = [];
  for (const point of points) {
    const previous = out[out.length - 1];
    if (previous && Math.abs(previous.x - point.x) <= 1e-9 && Math.abs(previous.y - point.y) <= 1e-9) {
      continue;
    }
    out.push(point);
  }
  return out;
}

/**
 * 导线折线（正交）：接点 → 外引点 → 折点 → 另一端外引点 → 接点。
 * 折点方向由“另一端外引点从哪条边出来”决定：左右边先横后竖，上下边先竖后横，
 * 这样最后一段进入接点前始终在器件框外，不会出现“进框再出来”的隐形段。
 * 两端外引点已对齐时退化为直线；返回值只用于绘制。
 */
export function wirePoints(a, b, lead = WIRE_LEAD) {
  const pa = outwardPoint(a, lead);
  const pb = outwardPoint(b, lead);
  const points = [{ x: a.x, y: a.y }, pa];
  const misaligned = Math.abs(pa.y - pb.y) >= 1 && Math.abs(pa.x - pb.x) >= 1;
  if (misaligned) {
    const bHorizontal = b.edge === "left" || b.edge === "right";
    points.push(bHorizontal ? { x: pb.x, y: pa.y } : { x: pa.x, y: pb.y });
  }
  points.push(pb, { x: b.x, y: b.y });
  return dedupePoints(points);
}

/**
 * 线段 × 轴对齐矩形求交（Liang–Barsky）。返回参数区间 [t0, t1] 或 null。
 * 端点 P(t) = P1 + t(P2-P1)，t ∈ [0, 1]；只做绘制裁剪，不改变数据。
 */
export function segBoxInterval(x1, y1, x2, y2, rect) {
  if (!rect) return null;
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - rect.x, rect.x + rect.w - x1, y1 - rect.y, rect.y + rect.h - y1];
  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) {
      if (q[i] < 0) return null; // 平行于该边且完全在框外
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0 < t1 ? [t0, t1] : null;
}

/**
 * 把折线按若干器件框裁掉“框内”部分，返回可绘制的线段列表。
 * 多个框重叠时按 t 排序后合并区间；退化（零长）线段不输出。
 * @param {{x:number,y:number}[]} points
 * @param {{x:number,y:number,w:number,h:number}[]} boxes
 * @returns {{x1:number,y1:number,x2:number,y2:number}[]}
 */
export function visibleRuns(points, boxes = []) {
  const runs = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (Math.hypot(p2.x - p1.x, p2.y - p1.y) <= 1e-9) continue;

    const cuts = [];
    for (const box of boxes) {
      const interval = segBoxInterval(p1.x, p1.y, p2.x, p2.y, box);
      if (interval) cuts.push(interval);
    }
    cuts.sort((u, v) => u[0] - v[0]);

    let cursor = 0;
    const keep = [];
    for (const [c0, c1] of cuts) {
      if (c0 > cursor) keep.push([cursor, Math.min(c0, 1)]);
      if (c1 > cursor) cursor = c1;
      if (cursor >= 1) break;
    }
    if (cursor < 1) keep.push([cursor, 1]);

    for (const [start, end] of keep) {
      if (end - start < 1e-4) continue;
      runs.push({
        x1: p1.x + (p2.x - p1.x) * start,
        y1: p1.y + (p2.y - p1.y) * start,
        x2: p1.x + (p2.x - p1.x) * end,
        y2: p1.y + (p2.y - p1.y) * end,
      });
    }
  }
  return runs;
}

/** 点到线段的距离（px）。 */
export function pointSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-12) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** 点是否落在任意一条可见线段的命中距离内（导线点选）。 */
export function runsHit(runs, point, tolerance = WIRE_HIT_DISTANCE) {
  return runs.some(
    (run) => pointSegmentDistance(point.x, point.y, run.x1, run.y1, run.x2, run.y2) <= tolerance,
  );
}
