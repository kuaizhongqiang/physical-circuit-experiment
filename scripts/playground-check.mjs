#!/usr/bin/env node
// playground-check.mjs —— M6.6 自检脚本：结构 / 几何 / 数值 / 误接四段判据。
//
// 契约：docs/playground.md §8.1（三层判据）、§8.2（样例复算）、§8.3（M-01…M-20）、
//       §4.3（10 样例 / 28 case）；容差见 docs/verification.md §2。
//
// 四段：
//   ① 样例 ↔ fixtures 一致性（sample schema / layout / initial / case 数）；
//   ② 几何表 vs 15 类接点数（目录的 terminalsFor ↔ wasm pcx_terminal_count）；
//   ③ 10 样例 × 28 个 fixture case 复算（走 wasm，同一 fixture-compare 判据）；
//   ④ §8.3 的 M-01…M-20 二十条误接逐条断言（REJECT 由 reducer 判，其余走 wasm）。
//
// 用法：node scripts/playground-check.mjs
// 失败逐条打印原因并以非零码退出；不改 fixtures/ 的期望值。

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPcx } from "../bindings/web/pcx.js";
import {
  KIND_ORDER,
  defaultAux,
  defaultParams,
  terminalCount,
  terminalsFor,
} from "../bindings/web/playground/device-catalog.js";
import { createInitialState, reducer } from "../bindings/web/playground/state.js";
import { SAMPLE_NAMES, buildSampleStateInput } from "../bindings/web/playground/samples.js";
import {
  buildCaseInput,
  buildRefs,
  caseEntries,
  codeName,
  compareCase,
} from "./lib/fixture-compare.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SAMPLES_DIR = join(ROOT, "bindings/web/playground/samples");
const WASM_PATH = join(ROOT, "bindings/web/pkg/pcx_circuit.wasm");

// wasm 侧 pcx_terminal_count(kind: u8, aux: u8) 的 kind 编号；
// 与 bindings/web/playground/index.html 的 KIND_NUM 同源（kind 枚举顺序）。
const KIND_NUM = Object.freeze({
  POWER: 1, QS: 2, FU: 3, KM: 4, KA: 5, KT: 6, KS: 7, FR: 8,
  SB: 9, SQ: 10, M: 11, R: 12, EL: 13, TB: 14, PE: 15,
});

// docs/playground.md §4.3：10 份 fixture 的 case 数，合计 28。
const EXPECTED_CASES = Object.freeze({
  C1: 2, C2: 2, C3: 7, C4: 3, C5: 3, C6: 2, C7: 2, C8: 2, C9: 3, C10: 2,
});
const EXPECTED_TOTAL_CASES = 28;
const EXPECTED_MISWIRES = 20;

let failureCount = 0;
const fail = (message) => {
  failureCount += 1;
  console.error(`✗ ${message}`);
};
const pass = (message) => console.log(`✓ ${message}`);

const readJson = (absolutePath) => JSON.parse(readFileSync(absolutePath, "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));

function readSample(name) {
  return readJson(join(SAMPLES_DIR, `${name}.json`));
}

function readFixtureBySample(sample) {
  return readJson(join(ROOT, sample.fixture));
}

function assertFixturePath(sample, name) {
  if (typeof sample.fixture !== "string" || !/^fixtures\/[^/]+\.json$/.test(sample.fixture)) {
    throw new Error(`fixture 路径非法：${JSON.stringify(sample.fixture)}（样例 ${name}）`);
  }
}

// ── ① 样例 ↔ fixtures 一致性 ────────────────────────────────────────────────

function checkSamples() {
  console.log("\n== 1. 样例 ↔ fixtures 一致性 ==");
  let passed = 0;
  for (const name of SAMPLE_NAMES) {
    try {
      const sample = readSample(name);
      assertFixturePath(sample, name);
      const fixture = readFixtureBySample(sample);
      const input = buildSampleStateInput(sample, fixture);
      const actualCases = caseEntries(fixture).length;
      const expectedCases = EXPECTED_CASES[name];
      if (actualCases !== expectedCases) {
        throw new Error(`case 数 ${actualCases} ≠ docs/playground.md §4.3 的 ${expectedCases}`);
      }
      passed += 1;
      pass(
        `${name}  fixture=${sample.fixture}  devices=${input.devices.length}  `
        + `wires=${input.wires.length}  cases=${actualCases}  layout=${sample.layout.length}  `
        + `initial.case=${input.fixtureCase}`,
      );
    } catch (error) {
      fail(`${name}  ${error?.message ?? error}`);
    }
  }
  console.log(`${passed}/${SAMPLE_NAMES.length} 通过：样例 fixture、layout 覆盖、ref 唯一性与画布坐标校验。`);
  return { passed, total: SAMPLE_NAMES.length };
}

// ── ② 几何表 vs 15 类接点数 ─────────────────────────────────────────────────

function auxVariants(kind) {
  switch (kind) {
    case "QS": return [1, 3];
    case "KM":
    case "KA": return [5, 6, 9, 10];
    case "SB":
    case "SQ": return [1, 2, 3];
    case "TB": return [2, 3, 4, 5, 6, 7, 8];
    default: return [defaultAux(kind)];
  }
}

function checkGeometry(pcx) {
  console.log("\n== 2. 几何表 vs 15 类接点数 ==");
  if (KIND_ORDER.length !== 15) fail(`目录 kind 数 ${KIND_ORDER.length} ≠ 15`);
  let passedKinds = 0;
  let passedConfigs = 0;
  let totalConfigs = 0;

  for (const kind of KIND_ORDER) {
    if (!(kind in KIND_NUM)) {
      fail(`几何 ${kind}：缺少 wasm kind 编号`);
      continue;
    }
    let kindOk = true;
    const parts = [];
    for (const aux of auxVariants(kind)) {
      totalConfigs += 1;
      try {
        const terminals = terminalsFor(kind, aux);
        const names = new Set();
        for (const terminal of terminals) {
          if (!Number.isFinite(terminal.u) || !Number.isFinite(terminal.v)
            || terminal.u < 0 || terminal.u > 1 || terminal.v < 0 || terminal.v > 1) {
            throw new Error(`接点 ${terminal.name} 的 u/v 越界（${terminal.u}, ${terminal.v}）`);
          }
          if (!["left", "right", "top", "bottom"].includes(terminal.edge)) {
            throw new Error(`接点 ${terminal.name} 的边非法（${terminal.edge}）`);
          }
          if (names.has(terminal.name)) throw new Error(`接点名重复：${terminal.name}`);
          names.add(terminal.name);
        }
        const kernel = pcx.terminalCount(KIND_NUM[kind], aux);
        if (kernel !== terminals.length) {
          throw new Error(`目录 ${terminals.length} 接点 ≠ 内核 ${kernel} 接点（aux=${aux}）`);
        }
        passedConfigs += 1;
        parts.push(`${aux}:${terminals.length}`);
      } catch (error) {
        kindOk = false;
        fail(`几何 ${kind}（aux=${aux}）：${error?.message ?? error}`);
      }
    }
    if (kindOk) {
      passedKinds += 1;
      pass(`${kind.padEnd(6)} ${parts.join(" / ")} 接点`);
    }
  }

  console.log(
    `${passedKinds}/${KIND_ORDER.length} 类、${passedConfigs}/${totalConfigs} 个配置通过：`
    + "几何坐标合法，接点数与内核 pcx_terminal_count 一致。",
  );
  return { passedKinds, totalKinds: KIND_ORDER.length, passedConfigs, totalConfigs };
}

// ── ③ 10 样例 × 28 个 fixture case 复算 ─────────────────────────────────────

function describeFailure(failure) {
  switch (failure.kind) {
    case "code":
      return `code 期望 ${codeName(failure.expected)}(${failure.expected})，`
        + `实际 ${failure.actual}（${codeName(failure.actual)}）`;
    case "ref-missing":
      return `fixture 里没有 ref ${failure.ref}`;
    case "terminal-missing":
      return `结果里没有接点 ${failure.terminalId}（${failure.key}）`;
    case "terminal-field":
      return `${failure.ref}:${failure.index}.${failure.field} 期望 ${failure.expected} 实际 ${failure.actual}`;
    case "device-missing":
      return `结果里没有器件 ${failure.ref}（id ${failure.deviceId}）`;
    case "device-field":
      return `${failure.ref}.${failure.field} 期望 ${failure.expected} 实际 ${failure.actual}`;
    default:
      return JSON.stringify(failure);
  }
}

function checkRecalculation(pcx) {
  console.log("\n== 3. 10 样例 × fixture case 复算（wasm） ==");
  let ran = 0;
  let passedCases = 0;

  for (const name of SAMPLE_NAMES) {
    let sampleCases = 0;
    let samplePassed = 0;
    try {
      const sample = readSample(name);
      assertFixturePath(sample, name);
      const fixture = readFixtureBySample(sample);
      const refs = buildRefs(fixture);
      const entries = caseEntries(fixture);
      if (entries.length !== EXPECTED_CASES[name]) {
        throw new Error(`case 数 ${entries.length} ≠ docs/playground.md §4.3 的 ${EXPECTED_CASES[name]}`);
      }

      for (const entry of entries) {
        const caseName = entry.name || "默认";
        sampleCases += 1;
        ran += 1;
        try {
          const output = pcx.solve(buildCaseInput(fixture, entry));
          const result = compareCase(fixture, entry, output, refs);
          if (result.failures.length === 0) {
            passedCases += 1;
            samplePassed += 1;
          } else {
            for (const failure of result.failures) {
              failureCount += 1;
              console.error(`✗ ${name} / ${caseName} / ${describeFailure(failure)}`);
            }
          }
        } catch (error) {
          failureCount += 1;
          console.error(`✗ ${name} / ${caseName} / ${error?.message ?? error}`);
        }
      }
      if (samplePassed === sampleCases) pass(`${name}  ${samplePassed}/${sampleCases} case`);
      else console.log(`✗ ${name}  ${samplePassed}/${sampleCases} case`);
    } catch (error) {
      fail(`${name}  ${error?.message ?? error}`);
    }
  }

  if (ran !== EXPECTED_TOTAL_CASES) {
    fail(`复算 case 总数 ${ran} ≠ ${EXPECTED_TOTAL_CASES}（docs/playground.md §4.3）`);
  }
  console.log(`${passedCases}/${ran} 个 case 通过（契约要求 ${EXPECTED_TOTAL_CASES}）。`);
  return { passed: passedCases, total: ran };
}

// ── ④ §8.3 M-01…M-20 二十条误接 ─────────────────────────────────────────────

function resolveTerminal(devices, label) {
  const dot = label.indexOf(".");
  if (dot <= 0) throw new Error(`接点标签非法：${label}`);
  const ref = label.slice(0, dot);
  const name = label.slice(dot + 1);
  const device = devices.find((item) => item.ref === ref);
  if (!device) throw new Error(`找不到器件 ${ref}（接点 ${label}）`);
  const terminals = terminalsFor(device.kind, device.aux);
  const index = terminals.findIndex((terminal) => terminal.name === name);
  if (index < 0) throw new Error(`找不到接点 ${label}（${device.kind}）`);
  return device.terminal_base + index;
}

function totalTerminals(devices) {
  return devices.reduce((sum, device) => sum + terminalCount(device.kind, device.aux), 0);
}

function nextDeviceId(devices) {
  return devices.reduce((max, device) => Math.max(max, device.id), 0) + 1;
}

function removeWire(input, aLabel, bLabel) {
  const a = resolveTerminal(input.devices, aLabel);
  const b = resolveTerminal(input.devices, bLabel);
  const index = input.wires.findIndex(
    (wire) => (wire.a === a && wire.b === b) || (wire.a === b && wire.b === a),
  );
  if (index < 0) throw new Error(`找不到导线 ${aLabel} – ${bLabel}`);
  input.wires.splice(index, 1);
}

function applySetup(fixture, spec) {
  const input = buildCaseInput(fixture, {});
  if (spec.strict !== undefined) input.strict_reference = spec.strict;

  for (const [ref, patch] of Object.entries(spec.set || {})) {
    const device = input.devices.find((item) => item.ref === ref);
    if (!device) throw new Error(`set 未知 ref ${ref}`);
    Object.assign(device, clone(patch));
  }
  for (const item of spec.addDevices || []) {
    const aux = item.aux ?? defaultAux(item.kind);
    input.devices.push({
      ref: item.ref,
      kind: item.kind,
      id: nextDeviceId(input.devices),
      terminal_base: totalTerminals(input.devices),
      aux,
      params: item.params ? [...item.params] : defaultParams(item.kind),
    });
  }
  for (const [a, b] of spec.dropWires || []) removeWire(input, a, b);
  for (const [a, b] of spec.addWires || []) {
    input.wires.push({
      a: resolveTerminal(input.devices, a),
      b: resolveTerminal(input.devices, b),
    });
  }
  return input;
}

function sampleState(name) {
  const sample = readSample(name);
  assertFixturePath(sample, name);
  const fixture = readFixtureBySample(sample);
  const state = reducer(createInitialState(), buildSampleStateInput(sample, fixture));
  return state;
}

function isolatedLoopInput() {
  return {
    strict_reference: false,
    config: {},
    devices: [
      { ref: "M1", kind: "M", id: 1, terminal_base: 0, aux: 0, params: defaultParams("M") },
      { ref: "R1", kind: "R", id: 2, terminal_base: 6, aux: 0, params: defaultParams("R") },
    ],
    // M1.U1 → R1.1，R1.2 → M1.U2：闭合但不含 POWER / PE 的孤立回路。
    wires: [{ a: 0, b: 6 }, { a: 7, b: 1 }],
  };
}

function emptyInput() {
  return { strict_reference: false, config: {}, devices: [], wires: [] };
}

const MISWIRES = [
  {
    id: "M-01", title: "同一接点连自己", reject: true, fixture: "C3",
    a: "P1.L1", b: "P1.L1", message: "不能把接点接到自己",
  },
  {
    id: "M-02", title: "重复接 P1.N–PE1", reject: true, fixture: "C3",
    a: "P1.N", b: "PE1.PE", message: "已有此导线",
  },
  {
    id: "M-03", title: "删 P1.N–PE1（严格）", fixture: "C3",
    setup: { dropWires: [["P1.N", "PE1.PE"]] }, expectCode: 20, expectDiags: [20],
  },
  {
    id: "M-04", title: "删 P1.N–PE1（宽松）", fixture: "C3",
    setup: { strict: false, dropWires: [["P1.N", "PE1.PE"]] }, expectCode: 0, expectDiags: [102],
  },
  {
    id: "M-05", title: "加 PE2 并接到 P1.L1", fixture: "C3",
    setup: {
      addDevices: [{ ref: "PE2", kind: "PE" }],
      addWires: [["PE2.PE", "P1.L1"]],
    },
    expectCode: 21, expectDiags: [21],
  },
  {
    id: "M-06", title: "P1.L1–P1.L2 相间直连", fixture: "C3",
    setup: { addWires: [["P1.L1", "P1.L2"]] }, expectCode: 40, expectDiags: [40],
  },
  {
    id: "M-07", title: "P1.L2–P1.N 相线对中性线", fixture: "C3",
    setup: { addWires: [["P1.L2", "P1.N"]] }, expectCode: 40, expectDiags: [40],
  },
  {
    id: "M-08", title: "FR1.2–FR1.4 热元件出口相间", fixture: "C3",
    setup: { addWires: [["FR1.2", "FR1.4"]] }, expectCode: 40, expectDiags: [40],
  },
  {
    id: "M-09", title: "QS1.2–QS1.4 总开关出线相间", fixture: "C3",
    setup: { addWires: [["QS1.2", "QS1.4"]] }, expectCode: 40, expectDiags: [40],
  },
  {
    id: "M-10", title: "按住 SB2 后 KM1.2–KM1.4", fixture: "C3",
    setup: {
      set: { SB2: { state_bits: 2, flags: 1 } },
      addWires: [["KM1.2", "KM1.4"]],
    },
    expectCode: 40, expectDiags: [40],
  },
  {
    id: "M-11", title: "C5 星点与三角同时接通", fixture: "C5",
    setup: { addWires: [["P1.L1", "KM3.A1"]] }, expectCode: 40, expectDiags: [40],
  },
  {
    id: "M-12", title: "按住 SB2 后 KM1.A1–KM1.A2", fixture: "C3",
    setup: {
      set: { SB2: { state_bits: 2, flags: 1 } },
      addWires: [["KM1.A1", "KM1.A2"]],
    },
    expectCode: 40, expectDiags: [40],
  },
  {
    id: "M-13", title: "线圈串自身常闭（KM1.21–22）", fixture: "C3",
    setup: {
      set: { SB2: { state_bits: 2, flags: 1 } },
      dropWires: [["FR1.96", "KM1.A1"]],
      addWires: [["FR1.96", "KM1.21"], ["KM1.22", "KM1.A1"]],
    },
    expectCode: 31, expectDiags: [31],
  },
  {
    id: "M-14", title: "C1 删 KM1→M1 主回路线后按住 SB1", fixture: "C1",
    setup: {
      set: { SB1: { state_bits: 2, flags: 1 } },
      dropWires: [["KM1.2", "M1.U1"], ["KM1.4", "M1.V1"], ["KM1.6", "M1.W1"]],
    },
    expectCode: 0, expectDiags: [101],
  },
  {
    id: "M-15", title: "C6 删 KM1→M1 主回路线后 KT 到点", fixture: "C6",
    setup: {
      set: { KT1: { elapsed_ms: 3000 } },
      dropWires: [["KM1.2", "M1.U1"], ["KM1.4", "M1.V1"], ["KM1.6", "M1.W1"]],
    },
    expectCode: 0, expectDiags: [101],
  },
  {
    id: "M-16", title: "C3 加悬空 R2", fixture: "C3",
    setup: { addDevices: [{ ref: "R2", kind: "R" }] }, expectCode: 0, expectDiags: [103],
  },
  {
    id: "M-17", title: "C3 加悬空 TB2（n=4）", fixture: "C3",
    setup: { addDevices: [{ ref: "TB2", kind: "TB", aux: 4 }] }, expectCode: 0, expectDiags: [103],
  },
  {
    id: "M-18", title: "白画布 M1 + R1 孤立回路", custom: isolatedLoopInput,
    expectCode: 0, expectDiags: [103],
  },
  {
    id: "M-19", title: "白画布空网表", custom: emptyInput, expectCode: 0, noError: true,
  },
  {
    id: "M-20", title: "删 FR1.96–KM1.A1（控制回路少一根）", fixture: "C3",
    setup: { dropWires: [["FR1.96", "KM1.A1"]] }, expectCode: 0, noError: true,
  },
];

function checkRejectCase(spec) {
  const state = sampleState(spec.fixture);
  const a = resolveTerminal(state.devices, spec.a);
  const b = resolveTerminal(state.devices, spec.b);
  const before = state.wires.length;
  const next = reducer(state, { type: "addWire", a, b });
  if (next.wires.length !== before) {
    throw new Error(`reducer 接受了应拒绝的接线（${before} → ${next.wires.length}）`);
  }
  if (next.noticeLevel !== "warn") throw new Error(`拒绝提示级别不是 warn：${next.noticeLevel}`);
  if (!String(next.notice).includes(spec.message)) {
    throw new Error(`拒绝提示不匹配：${JSON.stringify(next.notice)}`);
  }
  return `reducer 拒绝：${next.notice}`;
}

function checkSolveCase(pcx, spec) {
  const fixture = spec.fixture ? readJson(join(ROOT, `fixtures/${spec.fixture}.json`)) : null;
  const input = spec.custom ? spec.custom() : applySetup(fixture, spec.setup || {});
  const output = pcx.solve(input);
  const want = spec.expectCode ?? 0;
  const problems = [];
  if (output.code !== want) {
    problems.push(`code 期望 ${codeName(want)}(${want})，实际 ${output.code}（${codeName(output.code)}）`);
  }
  const diags = output.diags || [];
  const diagnosticCodes = new Set(diags.map((diag) => diag.code));
  for (const code of spec.expectDiags || []) {
    if (!diagnosticCodes.has(code)) {
      const actual = diags.length
        ? diags.map((diag) => `${diag.code}(${codeName(diag.code)})`).join(" / ")
        : "无诊断";
      problems.push(`缺少诊断 ${code}（实际 ${actual}）`);
    }
  }
  if (spec.noError) {
    const errors = diags.filter((diag) => diag.level === 2);
    if (errors.length > 0) {
      problems.push(`不应有 error 诊断，实际 ${errors.map((diag) => `${diag.code}(${codeName(diag.code)})`).join(" / ")}`);
    }
  }
  const actualDiags = diags.length
    ? diags.map((diag) => `${diag.code}${diag.level === 2 ? "(error)" : ""}`).join(" / ")
    : "无诊断";
  return { output, problems, summary: `code ${output.code}(${codeName(output.code)})，诊断 ${actualDiags}` };
}

function checkMiswires(pcx) {
  console.log("\n== 4. §8.3 M-01…M-20 二十条误接 ==");
  let passed = 0;
  for (const spec of MISWIRES) {
    try {
      if (spec.reject) {
        const summary = checkRejectCase(spec);
        passed += 1;
        pass(`${spec.id} ${spec.title}  ${summary}`);
        continue;
      }
      const result = checkSolveCase(pcx, spec);
      if (result.problems.length === 0) {
        passed += 1;
        pass(`${spec.id} ${spec.title}  ${result.summary}`);
      } else {
        for (const problem of result.problems) fail(`${spec.id} ${spec.title}：${problem}`);
      }
    } catch (error) {
      fail(`${spec.id} ${spec.title}：${error?.message ?? error}`);
    }
  }
  if (MISWIRES.length !== EXPECTED_MISWIRES) {
    fail(`误接条数 ${MISWIRES.length} ≠ ${EXPECTED_MISWIRES}（docs/playground.md §8.3）`);
  }
  console.log(`${passed}/${MISWIRES.length} 条误接通过（契约要求 ${EXPECTED_MISWIRES}）。`);
  return { passed, total: MISWIRES.length };
}

// ── 主入口 ──────────────────────────────────────────────────────────────────

function main() {
  if (!existsSync(WASM_PATH)) {
    console.error(`找不到 ${WASM_PATH}\n先跑：node scripts/build.mjs`);
    process.exit(1);
  }
  const pcx = createPcx(readFileSync(WASM_PATH));

  const samples = checkSamples();
  const geometry = checkGeometry(pcx);
  const recalculation = checkRecalculation(pcx);
  const miswires = checkMiswires(pcx);

  console.log("\n== 汇总 ==");
  console.log(
    `样例 ${samples.passed}/${samples.total}，`
    + `几何 ${geometry.passedKinds}/${geometry.totalKinds} 类（${geometry.passedConfigs}/${geometry.totalConfigs} 配置），`
    + `复算 ${recalculation.passed}/${recalculation.total} case，`
    + `误接 ${miswires.passed}/${miswires.total} 条。`,
  );

  if (failureCount > 0
    || recalculation.total !== EXPECTED_TOTAL_CASES
    || miswires.total !== EXPECTED_MISWIRES) {
    console.error(`自检未全通过：失败 ${failureCount} 处。先修目录 / 样例 / 误接，再跑本脚本。`);
    process.exit(1);
  }
  console.log("全部通过：结构 10/10、几何 15 类、复算 28/28、误接 20/20。");
}

main();
