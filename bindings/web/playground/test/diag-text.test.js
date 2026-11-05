// diag-text.test.js —— 诊断码文案、分级与排序（纯逻辑，无 DOM）。
//
// 契约：docs/playground.md §6.4、docs/api.md §5、docs/demo.md §8。

import test from "node:test";
import assert from "node:assert/strict";

import { DIAG_TEXT, diagLevelClass, diagLevelText, diagText, sortDiags } from "../diag-text.js";

test("返回码与诊断码都有中文文案，表外码显示未知诊断码", () => {
  const codes = [0, 10, 11, 12, 13, 14, 15, 16, 20, 21, 30, 31, 40, 50, 100, 101, 102, 103];
  for (const code of codes) {
    assert.equal(typeof DIAG_TEXT[code], "string", `缺码 ${code}`);
    assert.notEqual(diagText(code), `未知诊断码 ${code}`);
  }
  assert.match(diagText(20), /接地参考点/);
  assert.match(diagText(40), /短路/);
  assert.match(diagText(102), /P1\.N/);
  assert.equal(diagText(999), "未知诊断码 999");
});

test("分级：0 info / 1 warn / 2 error，未知级按 info", () => {
  assert.equal(diagLevelText(0), "info");
  assert.equal(diagLevelText(1), "warn");
  assert.equal(diagLevelText(2), "error");
  assert.equal(diagLevelText(9), "info");
  assert.equal(diagLevelClass(2), "error");
  assert.equal(diagLevelClass(9), "info");
});

test("诊断栏排序：error → warn → info，同级保持内核返回顺序", () => {
  const input = [
    { code: 102, level: 1 },
    { code: 101, level: 1 },
    { code: 103, level: 0 },
    { code: 40, level: 2 },
    { code: 100, level: 1 },
  ];
  const sorted = sortDiags(input);
  assert.deepEqual(sorted.map((item) => item.code), [40, 102, 101, 100, 103]);
  // 不改入参，且排序稳定。
  assert.deepEqual(input.map((item) => item.code), [102, 101, 103, 40, 100]);
});
