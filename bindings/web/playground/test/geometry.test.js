// geometry.test.js —— 按 docs/playground.md §3.3 的表格逐行断言
// （edge / u / v 与 terminalPoint 的像素落点）。

import test from "node:test";
import assert from "node:assert/strict";

import { terminalsFor } from "../device-catalog.js";
import {
  TERMINAL_DOT_RADIUS,
  TERMINAL_HIT_RADIUS,
  TERMINAL_LABEL_OFFSET,
  edgeNormal,
  labelPoint,
  terminalGeometry,
  terminalPoint,
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
