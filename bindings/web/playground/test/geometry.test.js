// geometry.test.js —— 按 docs/playground.md §3.3 的表格逐行断言
// （edge / u / v 与 terminalPoint 的像素落点）。

import test from "node:test";
import assert from "node:assert/strict";

import { terminalsFor } from "../device-catalog.js";
import {
  TERMINAL_DOT_RADIUS,
  TERMINAL_HIT_RADIUS,
  TERMINAL_LABEL_OFFSET,
  WIRE_HIT_DISTANCE,
  WIRE_LEAD,
  edgeNormal,
  labelPoint,
  outwardPoint,
  pointSegmentDistance,
  runsHit,
  segBoxInterval,
  terminalGeometry,
  terminalPoint,
  visibleRuns,
  wirePoints,
} from "../geometry.js";

const row = (index, name, edge, u, v) => ({ index, name, edge, u, v });

// 每一行直接对应 docs/playground.md §3.3 的表格行，一行都不能省。
const CASES = [
  ["POWER", 0, [
    row(0, "L1", "right", 1, 0.2),
    row(1, "L2", "right", 1, 0.5),
    row(2, "L3", "right", 1, 0.8),
    row(3, "N", "right", 1, 1),
  ]],
  ["QS", 1, [
    row(0, "1", "left", 0, 0.5),
    row(1, "2", "right", 1, 0.5),
  ]],
  ["QS", 3, [
    row(0, "1", "left", 0, 0.2),
    row(1, "3", "left", 0, 0.5),
    row(2, "5", "left", 0, 0.8),
    row(3, "2", "right", 1, 0.2),
    row(4, "4", "right", 1, 0.5),
    row(5, "6", "right", 1, 0.8),
  ]],
  ["FU", 0, [
    row(0, "1", "left", 0, 0.5),
    row(1, "2", "right", 1, 0.5),
  ]],
  ["KM", 5, [
    row(0, "A1", "bottom", 0.10, 1),
    row(1, "A2", "bottom", 0.24, 1),
    row(2, "1", "left", 0, 0.2),
    row(3, "2", "right", 1, 0.2),
    row(4, "3", "left", 0, 0.5),
    row(5, "4", "right", 1, 0.5),
    row(6, "5", "left", 0, 0.8),
    row(7, "6", "right", 1, 0.8),
    row(8, "13", "bottom", 0.42, 1),
    row(9, "14", "bottom", 0.54, 1),
    row(10, "21", "bottom", 0.74, 1),
    row(11, "22", "bottom", 0.86, 1),
  ]],
  ["KM", 9, [
    row(0, "A1", "bottom", 0.10, 1),
    row(1, "A2", "bottom", 0.24, 1),
    row(2, "1", "left", 0, 0.2),
    row(3, "2", "right", 1, 0.2),
    row(4, "3", "left", 0, 0.5),
    row(5, "4", "right", 1, 0.5),
    row(6, "5", "left", 0, 0.8),
    row(7, "6", "right", 1, 0.8),
    row(8, "13", "bottom", 0.42, 1),
    row(9, "14", "bottom", 0.54, 1),
    row(10, "21", "bottom", 0.74, 1),
    row(11, "22", "bottom", 0.86, 1),
    row(12, "43", "top", 0.30, 0),
    row(13, "44", "top", 0.45, 0),
  ]],
  ["KM", 6, [
    row(0, "A1", "bottom", 0.10, 1),
    row(1, "A2", "bottom", 0.24, 1),
    row(2, "1", "left", 0, 0.2),
    row(3, "2", "right", 1, 0.2),
    row(4, "3", "left", 0, 0.5),
    row(5, "4", "right", 1, 0.5),
    row(6, "5", "left", 0, 0.8),
    row(7, "6", "right", 1, 0.8),
    row(8, "13", "bottom", 0.42, 1),
    row(9, "14", "bottom", 0.54, 1),
    row(10, "21", "bottom", 0.74, 1),
    row(11, "22", "bottom", 0.86, 1),
    row(12, "31", "top", 0.60, 0),
    row(13, "32", "top", 0.75, 0),
  ]],
  ["KM", 10, [
    row(0, "A1", "bottom", 0.10, 1),
    row(1, "A2", "bottom", 0.24, 1),
    row(2, "1", "left", 0, 0.2),
    row(3, "2", "right", 1, 0.2),
    row(4, "3", "left", 0, 0.5),
    row(5, "4", "right", 1, 0.5),
    row(6, "5", "left", 0, 0.8),
    row(7, "6", "right", 1, 0.8),
    row(8, "13", "bottom", 0.42, 1),
    row(9, "14", "bottom", 0.54, 1),
    row(10, "21", "bottom", 0.74, 1),
    row(11, "22", "bottom", 0.86, 1),
    row(12, "43", "top", 0.30, 0),
    row(13, "44", "top", 0.45, 0),
    row(14, "31", "top", 0.60, 0),
    row(15, "32", "top", 0.75, 0),
  ]],
  ["KA", 5, [
    row(0, "A1", "bottom", 0.10, 1),
    row(1, "A2", "bottom", 0.24, 1),
    row(2, "13", "bottom", 0.42, 1),
    row(3, "14", "bottom", 0.54, 1),
    row(4, "21", "bottom", 0.74, 1),
    row(5, "22", "bottom", 0.86, 1),
  ]],
  ["KA", 9, [
    row(0, "A1", "bottom", 0.10, 1),
    row(1, "A2", "bottom", 0.24, 1),
    row(2, "13", "bottom", 0.42, 1),
    row(3, "14", "bottom", 0.54, 1),
    row(4, "21", "bottom", 0.74, 1),
    row(5, "22", "bottom", 0.86, 1),
    row(6, "43", "top", 0.30, 0),
    row(7, "44", "top", 0.45, 0),
  ]],
  ["KA", 6, [
    row(0, "A1", "bottom", 0.10, 1),
    row(1, "A2", "bottom", 0.24, 1),
    row(2, "13", "bottom", 0.42, 1),
    row(3, "14", "bottom", 0.54, 1),
    row(4, "21", "bottom", 0.74, 1),
    row(5, "22", "bottom", 0.86, 1),
    row(6, "31", "top", 0.60, 0),
    row(7, "32", "top", 0.75, 0),
  ]],
  ["KA", 10, [
    row(0, "A1", "bottom", 0.10, 1),
    row(1, "A2", "bottom", 0.24, 1),
    row(2, "13", "bottom", 0.42, 1),
    row(3, "14", "bottom", 0.54, 1),
    row(4, "21", "bottom", 0.74, 1),
    row(5, "22", "bottom", 0.86, 1),
    row(6, "43", "top", 0.30, 0),
    row(7, "44", "top", 0.45, 0),
    row(8, "31", "top", 0.60, 0),
    row(9, "32", "top", 0.75, 0),
  ]],
  ["KT", 0, [
    row(0, "A1", "bottom", 0.10, 1),
    row(1, "A2", "bottom", 0.24, 1),
    row(2, "55", "bottom", 0.45, 1),
    row(3, "56", "bottom", 0.60, 1),
    row(4, "67", "bottom", 0.74, 1),
    row(5, "68", "bottom", 0.86, 1),
  ]],
  ["KS", 0, [
    row(0, "13", "bottom", 0.30, 1),
    row(1, "14", "bottom", 0.45, 1),
    row(2, "23", "bottom", 0.70, 1),
    row(3, "24", "bottom", 0.85, 1),
  ]],
  ["FR", 0, [
    row(0, "1", "left", 0, 0.2),
    row(1, "2", "right", 1, 0.2),
    row(2, "3", "left", 0, 0.5),
    row(3, "4", "right", 1, 0.5),
    row(4, "5", "left", 0, 0.8),
    row(5, "6", "right", 1, 0.8),
    row(6, "95", "bottom", 0.20, 1),
    row(7, "96", "bottom", 0.35, 1),
    row(8, "97", "bottom", 0.65, 1),
    row(9, "98", "bottom", 0.80, 1),
  ]],
  ["SB", 1, [
    row(0, "1", "left", 0, 0.40),
    row(1, "2", "right", 1, 0.40),
    row(2, "3", "left", 0, 0.60),
    row(3, "4", "right", 1, 0.60),
  ]],
  ["SQ", 2, [
    row(0, "1", "left", 0, 0.40),
    row(1, "2", "right", 1, 0.40),
    row(2, "3", "left", 0, 0.60),
    row(3, "4", "right", 1, 0.60),
  ]],
  ["M", 0, [
    row(0, "U1", "top", 0.2, 0),
    row(1, "V1", "top", 0.5, 0),
    row(2, "W1", "top", 0.8, 0),
    row(3, "U2", "bottom", 0.2, 1),
    row(4, "V2", "bottom", 0.5, 1),
    row(5, "W2", "bottom", 0.8, 1),
  ]],
  ["R", 0, [
    row(0, "1", "left", 0, 0.5),
    row(1, "2", "right", 1, 0.5),
  ]],
  ["EL", 0, [
    row(0, "1", "left", 0, 0.5),
    row(1, "2", "right", 1, 0.5),
  ]],
  ["TB", 2, [
    row(0, "0", "bottom", 0.25, 1),
    row(1, "1", "bottom", 0.75, 1),
  ]],
  ["TB", 3, [
    row(0, "0", "bottom", 0.5 / 3, 1),
    row(1, "1", "bottom", 1.5 / 3, 1),
    row(2, "2", "bottom", 2.5 / 3, 1),
  ]],
  ["TB", 4, [
    row(0, "0", "bottom", 0.5 / 4, 1),
    row(1, "1", "bottom", 1.5 / 4, 1),
    row(2, "2", "bottom", 2.5 / 4, 1),
    row(3, "3", "bottom", 3.5 / 4, 1),
  ]],
  ["TB", 5, [
    row(0, "0", "bottom", 0.5 / 5, 1),
    row(1, "1", "bottom", 1.5 / 5, 1),
    row(2, "2", "bottom", 2.5 / 5, 1),
    row(3, "3", "bottom", 3.5 / 5, 1),
    row(4, "4", "bottom", 4.5 / 5, 1),
  ]],
  ["TB", 6, [
    row(0, "0", "bottom", 0.5 / 6, 1),
    row(1, "1", "bottom", 1.5 / 6, 1),
    row(2, "2", "bottom", 2.5 / 6, 1),
    row(3, "3", "bottom", 3.5 / 6, 1),
    row(4, "4", "bottom", 4.5 / 6, 1),
    row(5, "5", "bottom", 5.5 / 6, 1),
  ]],
  ["TB", 7, [
    row(0, "0", "bottom", 0.5 / 7, 1),
    row(1, "1", "bottom", 1.5 / 7, 1),
    row(2, "2", "bottom", 2.5 / 7, 1),
    row(3, "3", "bottom", 3.5 / 7, 1),
    row(4, "4", "bottom", 4.5 / 7, 1),
    row(5, "5", "bottom", 5.5 / 7, 1),
    row(6, "6", "bottom", 6.5 / 7, 1),
  ]],
  ["TB", 8, [
    row(0, "0", "bottom", 0.5 / 8, 1),
    row(1, "1", "bottom", 1.5 / 8, 1),
    row(2, "2", "bottom", 2.5 / 8, 1),
    row(3, "3", "bottom", 3.5 / 8, 1),
    row(4, "4", "bottom", 4.5 / 8, 1),
    row(5, "5", "bottom", 5.5 / 8, 1),
    row(6, "6", "bottom", 6.5 / 8, 1),
    row(7, "7", "bottom", 7.5 / 8, 1),
  ]],
  ["PE", 0, [
    row(0, "PE", "top", 0.5, 0),
  ]],
];

for (const [kind, aux, expected] of CASES) {
  test(`几何表 ${kind} aux=${aux} 逐行一致`, () => {
    assert.deepEqual(terminalsFor(kind, aux), expected);
  });
}

test("接点圆点 / 命中半径与标注偏移是契约值", () => {
  assert.equal(TERMINAL_DOT_RADIUS, 4);
  assert.equal(TERMINAL_HIT_RADIUS, 6);
  assert.equal(TERMINAL_LABEL_OFFSET, 6);
});

test("terminalPoint = 盒子左上角 + (u × w, v × h)", () => {
  const power = { kind: "POWER", aux: 0, x: 40, y: 60, w: 70, h: 300 };
  assert.deepEqual(terminalPoint(power, 3), { x: 110, y: 360 }); // N
  const km = { kind: "KM", aux: 10, x: 100, y: 50, w: 160, h: 200 };
  assert.deepEqual(terminalPoint(km, 0), { x: 116, y: 250 }); // A1
  assert.deepEqual(terminalPoint(km, 12), { x: 148, y: 50 }); // 43（顶边）
  assert.deepEqual(terminalPoint(km, 15), { x: 220, y: 50 }); // 32（顶边）
  const tb = { kind: "TB", aux: 8, x: 0, y: 0, w: 240, h: 60 };
  assert.deepEqual(terminalPoint(tb, 4), { x: 135, y: 60 }); // (4 + 0.5) / 8 × 240
  const pe = { kind: "PE", aux: 0, x: 0, y: 0, w: 70, h: 70 };
  assert.deepEqual(terminalPoint(pe, 0), { x: 35, y: 0 });
});

test("terminalGeometry 同时给出接点名、边与相对偏移", () => {
  const km = { kind: "KM", aux: 10, x: 100, y: 50, w: 160, h: 200 };
  assert.deepEqual(terminalGeometry(km, 1), {
    index: 1,
    name: "A2",
    edge: "bottom",
    u: 0.24,
    v: 1,
    x: 138.4,
    y: 250,
  });
});

test("edgeNormal 是向外的单位法向量", () => {
  assert.deepEqual(edgeNormal("left"), { dx: -1, dy: 0 });
  assert.deepEqual(edgeNormal("right"), { dx: 1, dy: 0 });
  assert.deepEqual(edgeNormal("top"), { dx: 0, dy: -1 });
  assert.deepEqual(edgeNormal("bottom"), { dx: 0, dy: 1 });
  assert.throws(() => edgeNormal("center"), /未知的接点边/);
});

test("labelPoint 按边向外偏 6 px（编号 / 标注方向）", () => {
  const km = { kind: "KM", aux: 10, x: 100, y: 50, w: 160, h: 200 };
  assert.deepEqual(labelPoint(km, 0), { x: 116, y: 256 }); // A1 底边 → 向下
  assert.deepEqual(labelPoint(km, 12), { x: 148, y: 44 }); // 43 顶边 → 向上
  const power = { kind: "POWER", aux: 0, x: 40, y: 60, w: 70, h: 300 };
  assert.deepEqual(labelPoint(power, 3), { x: 116, y: 360 }); // N 右边 → 向右
  const qs = { kind: "QS", aux: 1, x: 200, y: 100, w: 80, h: 160 };
  assert.deepEqual(labelPoint(qs, 0), { x: 194, y: 180 }); // 左边 → 向左
  assert.deepEqual(labelPoint(qs, 0, 10), { x: 190, y: 180 });
});

test("序号越界 / 盒子缺字段 / 未知 kind 明确报错", () => {
  const device = { kind: "FU", aux: 0, x: 0, y: 0, w: 60, h: 80 };
  assert.throws(() => terminalGeometry(device, -1), /没有序号为 -1 的接点/);
  assert.throws(() => terminalGeometry(device, 2), /没有序号为 2 的接点/);
  assert.throws(() => terminalGeometry(device, 1.5), /没有序号为 1\.5 的接点/);
  assert.throws(() => terminalGeometry({ ...device, w: undefined }, 0), /缺少有效的 w/);
  assert.throws(() => terminalGeometry({ ...device, kind: "NOPE" }, 0), /未知器件 kind/);
});

// ── M6.3 导线：正交走线 ＋ Liang–Barsky 框内裁剪（issue #41） ────────────────

test("outwardPoint 按接点边向外偏 16 px（左 / 右 / 上 / 下）", () => {
  assert.equal(WIRE_LEAD, 16);
  assert.deepEqual(outwardPoint({ x: 10, y: 20, edge: "left" }), { x: -6, y: 20 });
  assert.deepEqual(outwardPoint({ x: 10, y: 20, edge: "right" }), { x: 26, y: 20 });
  assert.deepEqual(outwardPoint({ x: 10, y: 20, edge: "top" }), { x: 10, y: 4 });
  assert.deepEqual(outwardPoint({ x: 10, y: 20, edge: "bottom" }), { x: 10, y: 36 });
});

test("wirePoints 固定用例：外引 ＋ 先横后竖折点；对齐时退化为直线", () => {
  const a = { x: 100, y: 100, edge: "right" };
  const b = { x: 300, y: 200, edge: "left" };
  // a → (116,100)；先横到 (284,100)，再竖到 (284,200)；到 b。
  assert.deepEqual(wirePoints(a, b), [
    { x: 100, y: 100 },
    { x: 116, y: 100 },
    { x: 284, y: 100 },
    { x: 284, y: 200 },
    { x: 300, y: 200 },
  ]);

  // y 已经对齐：不加折点，只有外引段。
  const sameRow = wirePoints(
    { x: 100, y: 100, edge: "right" },
    { x: 300, y: 100, edge: "left" },
  );
  assert.deepEqual(sameRow, [
    { x: 100, y: 100 },
    { x: 116, y: 100 },
    { x: 284, y: 100 },
    { x: 300, y: 100 },
  ]);

  // 顶 / 底边：x 已经对齐，先竖后横退化为一条竖线。
  const vertical = wirePoints(
    { x: 100, y: 100, edge: "top" },
    { x: 100, y: 300, edge: "bottom" },
  );
  assert.deepEqual(vertical, [
    { x: 100, y: 100 },
    { x: 100, y: 84 },
    { x: 100, y: 316 },
    { x: 100, y: 300 },
  ]);

  // 终点是顶边：折点先竖后横，最后一段从框外垂直进入顶边（不穿框）。
  const toTop = wirePoints(
    { x: 100, y: 100, edge: "right" },
    { x: 300, y: 200, edge: "top" },
  );
  assert.deepEqual(toTop, [
    { x: 100, y: 100 },
    { x: 116, y: 100 },
    { x: 116, y: 184 },
    { x: 300, y: 184 },
    { x: 300, y: 200 },
  ]);
});

test("segBoxInterval：Liang–Barsky 求交固定用例", () => {
  const box = { x: 100, y: 100, w: 100, h: 50 };
  // 横穿整框：t = 0.4 … 0.8（x = 100 … 200，线段 x 0 … 250）。
  assert.deepEqual(segBoxInterval(0, 125, 250, 125, box), [0.4, 0.8]);
  // 从框上边进入、穿过框下边：t = 0 … 0.5。
  assert.deepEqual(segBoxInterval(150, 100, 150, 200, box), [0, 0.5]);
  // 完全在框外 / 平行于边且在框外。
  assert.equal(segBoxInterval(0, 0, 50, 0, box), null);
  // 沿框上边：两侧边界都算，区间 [0.5, 1]。
  assert.deepEqual(segBoxInterval(0, 100, 200, 100, box), [0.5, 1]);
  // 端点刚好在框边界外侧（从 x=200 向右）不算框内。
  assert.equal(segBoxInterval(200, 125, 300, 125, box), null);
});

// Liang–Barsky 的 t 是浮点数，比较前统一收敛到 6 位小数。
function roundRuns(runs) {
  const round = (value) => Number(value.toFixed(6));
  return runs.map((run) => ({
    x1: round(run.x1), y1: round(run.y1), x2: round(run.x2), y2: round(run.y2),
  }));
}

test("visibleRuns：裁掉框内段落，保留框外可见段（含多框重叠）", () => {
  const boxes = [{ x: 100, y: 90, w: 100, h: 20 }];
  const points = [{ x: 0, y: 100 }, { x: 250, y: 100 }];
  assert.deepEqual(roundRuns(visibleRuns(points, boxes)), [
    { x1: 0, y1: 100, x2: 100, y2: 100 },
    { x1: 200, y1: 100, x2: 250, y2: 100 },
  ]);

  // 两个框的裁剪区间重叠：并集是 x = 100 … 250，不能画出中间的 150…200。
  const overlapping = [
    { x: 100, y: 90, w: 100, h: 20 },
    { x: 150, y: 90, w: 100, h: 20 },
  ];
  assert.deepEqual(roundRuns(visibleRuns([{ x: 0, y: 100 }, { x: 300, y: 100 }], overlapping)), [
    { x1: 0, y1: 100, x2: 100, y2: 100 },
    { x1: 250, y1: 100, x2: 300, y2: 100 },
  ]);

  // 折线逐段裁剪；零长段不输出；没有框时每段一条 run。
  const polyline = [
    { x: 0, y: 0 },
    { x: 150, y: 0 },
    { x: 150, y: 150 },
    { x: 150, y: 150 },
  ];
  assert.deepEqual(roundRuns(visibleRuns(polyline, [boxes[0]])), [
    { x1: 0, y1: 0, x2: 150, y2: 0 },
    { x1: 150, y1: 0, x2: 150, y2: 90 },
    { x1: 150, y1: 110, x2: 150, y2: 150 },
  ]);
  assert.equal(visibleRuns(polyline, []).length, 2);
});

test("点选辅助：点到线段距离与命中判定（容差 5 px）", () => {
  assert.equal(WIRE_HIT_DISTANCE, 5);
  assert.equal(pointSegmentDistance(50, 3, 0, 0, 100, 0), 3);
  assert.equal(pointSegmentDistance(-10, 0, 0, 0, 100, 0), 10);
  assert.equal(pointSegmentDistance(50, 4, 50, 0, 50, 100), 0);

  const runs = [{ x1: 0, y1: 0, x2: 100, y2: 0 }];
  assert.equal(runsHit(runs, { x: 50, y: 3 }), true);
  assert.equal(runsHit(runs, { x: 50, y: 6 }), false);
  assert.equal(runsHit([], { x: 0, y: 0 }), false);
});
