// catalog.test.js —— 逐项核对 docs/domain-model.md §2、docs/api.md §3、
// docs/playground.md §3.2 / §7.1 的目录行；不使用「大概一致」的循环推导。

import test from "node:test";
import assert from "node:assert/strict";

import {
  CATALOG,
  KIND_ORDER,
  defaultAux,
  defaultBox,
  defaultFlags,
  defaultParams,
  defaultStateBits,
  paramsFor,
  stateBitsFor,
  terminalCount,
  terminalsFor,
} from "../device-catalog.js";

const names = (kind, aux) => terminalsFor(kind, aux).map((terminal) => terminal.name);
const bitRows = (...pairs) => pairs.map(([bit, a, b]) => ({ bit, terminals: [a, b] }));

test("15 类 kind 齐全，顺序固定", () => {
  assert.deepEqual(KIND_ORDER, [
    "POWER", "QS", "FU", "KM", "KA", "KT", "KS",
    "FR", "SB", "SQ", "M", "R", "EL", "TB", "PE",
  ]);
  assert.equal(Object.keys(CATALOG).length, 15);
  for (const kind of KIND_ORDER) {
    const entry = CATALOG[kind];
    assert.equal(entry.kind, kind);
    assert.equal(typeof entry.label, "string");
    assert.ok(entry.label.length > 0, `${kind} 缺显示名`);
    assert.equal(typeof entry.symbol, "string");
    assert.ok(entry.symbol.length > 0, `${kind} 缺符号类型`);
    assert.ok(entry.defaultBox.w > 0 && entry.defaultBox.h > 0, `${kind} 缺默认框`);
    assert.ok(["application", "solver", "fixed"].includes(entry.stateSource));
  }
});

test("15 类接点数与 docs/domain-model.md §2 一致（含可变接点配置）", () => {
  const cases = [
    ["POWER", 0, 4],
    ["QS", 1, 2],
    ["QS", 3, 6],
    ["FU", 0, 2],
    ["KM", 5, 12],
    ["KM", 9, 14],
    ["KM", 6, 14],
    ["KM", 10, 16],
    ["KA", 5, 6],
    ["KA", 9, 8],
    ["KA", 6, 8],
    ["KA", 10, 10],
    ["KT", 0, 6],
    ["KS", 0, 4],
    ["FR", 0, 10],
    ["SB", 1, 4],
    ["SB", 2, 4],
    ["SB", 3, 4],
    ["SQ", 1, 4],
    ["SQ", 2, 4],
    ["SQ", 3, 4],
    ["M", 0, 6],
    ["R", 0, 2],
    ["EL", 0, 2],
    ["TB", 2, 2],
    ["TB", 3, 3],
    ["TB", 4, 4],
    ["TB", 5, 5],
    ["TB", 6, 6],
    ["TB", 7, 7],
    ["TB", 8, 8],
    ["PE", 0, 1],
  ];
  for (const [kind, aux, expected] of cases) {
    assert.equal(terminalCount(kind, aux), expected, `${kind} aux=${aux}`);
  }
});

test("接点名称与顺序严格按 docs/domain-model.md §2", () => {
  assert.deepEqual(names("POWER"), ["L1", "L2", "L3", "N"]);
  assert.deepEqual(names("QS", 1), ["1", "2"]);
  assert.deepEqual(names("QS", 3), ["1", "3", "5", "2", "4", "6"]);
  assert.deepEqual(names("FU"), ["1", "2"]);
  assert.deepEqual(names("KM", 5), [
    "A1", "A2", "1", "2", "3", "4", "5", "6", "13", "14", "21", "22",
  ]);
  assert.deepEqual(names("KM", 9), [
    "A1", "A2", "1", "2", "3", "4", "5", "6", "13", "14", "21", "22", "43", "44",
  ]);
  assert.deepEqual(names("KM", 6), [
    "A1", "A2", "1", "2", "3", "4", "5", "6", "13", "14", "21", "22", "31", "32",
  ]);
  assert.deepEqual(names("KM", 10), [
    "A1", "A2", "1", "2", "3", "4", "5", "6", "13", "14", "21", "22",
    "43", "44", "31", "32",
  ]);
  assert.deepEqual(names("KA", 5), ["A1", "A2", "13", "14", "21", "22"]);
  assert.deepEqual(names("KA", 9), ["A1", "A2", "13", "14", "21", "22", "43", "44"]);
  assert.deepEqual(names("KA", 6), ["A1", "A2", "13", "14", "21", "22", "31", "32"]);
  assert.deepEqual(names("KA", 10), [
    "A1", "A2", "13", "14", "21", "22", "43", "44", "31", "32",
  ]);
  assert.deepEqual(names("KT"), ["A1", "A2", "55", "56", "67", "68"]);
  assert.deepEqual(names("KS"), ["13", "14", "23", "24"]);
  assert.deepEqual(names("FR"), ["1", "2", "3", "4", "5", "6", "95", "96", "97", "98"]);
  assert.deepEqual(names("SB", 1), ["1", "2", "3", "4"]);
  assert.deepEqual(names("SQ", 2), ["1", "2", "3", "4"]);
  assert.deepEqual(names("M"), ["U1", "V1", "W1", "U2", "V2", "W2"]);
  assert.deepEqual(names("R"), ["1", "2"]);
  assert.deepEqual(names("EL"), ["1", "2"]);
  assert.deepEqual(names("TB", 2), ["0", "1"]);
  assert.deepEqual(names("TB", 5), ["0", "1", "2", "3", "4"]);
  assert.deepEqual(names("TB", 8), ["0", "1", "2", "3", "4", "5", "6", "7"]);
  assert.deepEqual(names("PE"), ["PE"]);
});

test("state_bits 位映射逐条对应 docs/api.md §3", () => {
  assert.deepEqual(stateBitsFor("QS", 1), bitRows([0, "1", "2"]));
  assert.deepEqual(stateBitsFor("QS", 3), bitRows(
    [0, "1", "2"], [1, "3", "4"], [2, "5", "6"],
  ));
  assert.deepEqual(stateBitsFor("SB", 1), bitRows([0, "1", "2"], [1, "3", "4"]));
  assert.deepEqual(stateBitsFor("SQ", 3), bitRows([0, "1", "2"], [1, "3", "4"]));
  assert.deepEqual(stateBitsFor("KM", 5), bitRows(
    [0, "1", "2"], [1, "3", "4"], [2, "5", "6"], [3, "13", "14"], [4, "21", "22"],
  ));
  assert.deepEqual(stateBitsFor("KM", 9), bitRows(
    [0, "1", "2"], [1, "3", "4"], [2, "5", "6"],
    [3, "13", "14"], [4, "21", "22"], [5, "43", "44"],
  ));
  assert.deepEqual(stateBitsFor("KM", 6), bitRows(
    [0, "1", "2"], [1, "3", "4"], [2, "5", "6"],
    [3, "13", "14"], [4, "21", "22"], [6, "31", "32"],
  ));
  assert.deepEqual(stateBitsFor("KM", 10), bitRows(
    [0, "1", "2"], [1, "3", "4"], [2, "5", "6"],
    [3, "13", "14"], [4, "21", "22"], [5, "43", "44"], [6, "31", "32"],
  ));
  assert.deepEqual(stateBitsFor("KA", 5), bitRows([0, "13", "14"], [1, "21", "22"]));
  assert.deepEqual(stateBitsFor("KA", 9), bitRows(
    [0, "13", "14"], [1, "21", "22"], [2, "43", "44"],
  ));
  assert.deepEqual(stateBitsFor("KA", 6), bitRows(
    [0, "13", "14"], [1, "21", "22"], [3, "31", "32"],
  ));
  assert.deepEqual(stateBitsFor("KA", 10), bitRows(
    [0, "13", "14"], [1, "21", "22"], [2, "43", "44"], [3, "31", "32"],
  ));
  assert.deepEqual(stateBitsFor("KT"), bitRows([0, "55", "56"], [1, "67", "68"]));
  assert.deepEqual(stateBitsFor("KS"), bitRows([0, "13", "14"], [1, "23", "24"]));
  assert.deepEqual(stateBitsFor("FR"), bitRows([0, "95", "96"], [1, "97", "98"]));
  for (const kind of ["POWER", "FU", "M", "R", "EL", "TB", "PE"]) {
    assert.deepEqual(stateBitsFor(kind), [], `${kind} 不应有 state_bits`);
  }
});

test("可编辑参数与落位逐条对应 docs/playground.md §7.1", () => {
  const expected = {
    POWER: [
      ["v_line", { field: "params", index: 0 }],
      ["freq_hz", { field: "params", index: 1 }],
    ],
    QS: [["poles", { field: "aux" }]],
    FU: [],
    KM: [
      ["aux_no", { field: "aux", part: "aux_no" }],
      ["aux_nc", { field: "aux", part: "aux_nc" }],
    ],
    KA: [
      ["aux_no", { field: "aux", part: "aux_no" }],
      ["aux_nc", { field: "aux", part: "aux_nc" }],
    ],
    KT: [["delay_ms", { field: "params", index: 5 }]],
    KS: [],
    FR: [["set_current", { field: "params", index: 1 }]],
    SB: [["type", { field: "aux" }]],
    SQ: [["type", { field: "aux" }]],
    M: [],
    R: [["resistance", { field: "params", index: 0 }]],
    EL: [],
    TB: [["n", { field: "aux" }]],
    PE: [],
  };
  assert.deepEqual(Object.keys(expected).sort(), [...KIND_ORDER].sort());
  for (const kind of KIND_ORDER) {
    const actual = paramsFor(kind).map(({ key, target }) => [key, target]);
    assert.deepEqual(actual, expected[kind], `${kind} 可编辑参数`);
  }
  // 改变接点数的参数必须明确 aux 编码（docs/playground.md §7.1）。
  for (const param of paramsFor("KM")) {
    assert.equal(param.auxEncoding, "aux_no * 4 + aux_nc");
    assert.deepEqual(param.options.map((option) => option.value), [1, 2]);
  }
  assert.deepEqual(paramsFor("QS")[0].options.map((option) => option.value), [1, 3]);
  assert.deepEqual(paramsFor("SB")[0].options.map((option) => option.value), [1, 2, 3]);
  assert.deepEqual(paramsFor("TB")[0].min, 2);
  assert.deepEqual(paramsFor("TB")[0].max, 8);
});

test("默认框尺寸逐条对应 docs/playground.md §3.2", () => {
  const expected = {
    POWER: { w: 100, h: 220 },
    QS: { w: 80, h: 160 },
    FU: { w: 60, h: 80 },
    KM: { w: 160, h: 200 },
    KA: { w: 160, h: 120 },
    KT: { w: 160, h: 120 },
    KS: { w: 160, h: 100 },
    FR: { w: 140, h: 200 },
    SB: { w: 80, h: 80 },
    SQ: { w: 80, h: 80 },
    M: { w: 140, h: 200 },
    R: { w: 60, h: 80 },
    EL: { w: 60, h: 80 },
    TB: { w: 160, h: 60 },
    PE: { w: 70, h: 70 },
  };
  for (const kind of KIND_ORDER) {
    assert.deepEqual(defaultBox(kind), expected[kind], kind);
  }
});

test("TB 宽度按 n 计算：max(160, 30 × n)", () => {
  const expected = [
    [2, 160],
    [3, 160],
    [4, 160],
    [5, 160],
    [6, 180],
    [7, 210],
    [8, 240],
  ];
  for (const [n, w] of expected) {
    assert.deepEqual(defaultBox("TB", n), { w, h: 60 }, `TB n=${n}`);
  }
});

test("新放置器件的 aux 缺省值与 flags / state_bits 缺省值", () => {
  assert.equal(defaultAux("QS"), 3);
  assert.equal(defaultAux("KM"), 5);
  assert.equal(defaultAux("KA"), 5);
  assert.equal(defaultAux("SB"), 2);
  assert.equal(defaultAux("SQ"), 2);
  assert.equal(defaultAux("TB"), 5);
  for (const kind of ["POWER", "FU", "KT", "KS", "FR", "M", "R", "EL", "PE"]) {
    assert.equal(defaultAux(kind), 0, kind);
  }

  for (const kind of ["QS", "SB", "SQ"]) {
    assert.equal(defaultFlags(kind), 1, `${kind} 的 flags.bit0 应为 1`);
  }
  for (const kind of ["POWER", "FU", "KM", "KA", "KT", "KS", "FR", "M", "R", "EL", "TB", "PE"]) {
    assert.equal(defaultFlags(kind), 0, `${kind} 的 flags.bit0 应为 0`);
  }

  assert.equal(defaultStateBits("SB", 1), 1);
  assert.equal(defaultStateBits("SB", 2), 0);
  assert.equal(defaultStateBits("SB", 3), 1);
  assert.equal(defaultStateBits("SQ", 1), 1);
  assert.equal(defaultStateBits("SQ", 2), 0);
  assert.equal(defaultStateBits("SQ", 3), 1);
  for (const kind of ["POWER", "QS", "FU", "KM", "KA", "KT", "KS", "FR", "M", "R", "EL", "TB", "PE"]) {
    assert.equal(defaultStateBits(kind), 0, kind);
  }
});

test("默认参数只有一份来源，且每次返回副本", () => {
  assert.deepEqual(defaultParams("POWER"), [380, 50, 0.001, 1, 0, 0, 0, 0]);
  assert.deepEqual(defaultParams("KM"), [12000, 8000, 0.02, 0.012, 0.001, 0, 0, 0]);
  assert.deepEqual(defaultParams("KT"), [15000, 10000, 0.02, 0.012, 0.001, 3000, 0, 0]);
  assert.deepEqual(defaultParams("FR"), [0.001, 6, 5000, 0.001, 0, 0, 0, 0]);
  assert.deepEqual(defaultParams("M"), [40, 18, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(defaultParams("R"), [30, 0, 0, 0, 0, 0, 0, 0]);
  for (const kind of KIND_ORDER) {
    const params = defaultParams(kind);
    assert.equal(params.length, 8, `${kind} params 必须是 8 个`);
    params[0] = -1;
    assert.notEqual(defaultParams(kind)[0], -1, `${kind} 返回的 params 不能共享`);
  }
});

test("非法 kind / aux 明确报错，不静默落回缺省值", () => {
  assert.throws(() => terminalsFor("NOPE"), /未知器件 kind/);
  assert.throws(() => paramsFor("NOPE"), /未知器件 kind/);
  assert.throws(() => terminalsFor("QS", 2), /QS\.poles/);
  assert.throws(() => terminalsFor("KM", 7), /aux_no×4 \+ aux_nc/);
  assert.throws(() => terminalsFor("KA", 0), /aux_no×4 \+ aux_nc/);
  assert.throws(() => terminalsFor("SB", 4), /type/);
  assert.throws(() => terminalsFor("TB", 1), /TB\.n/);
  assert.throws(() => terminalsFor("TB", 9), /TB\.n/);
  assert.throws(() => terminalsFor("TB", 5.5), /TB\.n/);
});
