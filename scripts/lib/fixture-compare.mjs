// fixture-compare.mjs —— fixtures/ 复算判据的唯一实现（容差与断言逻辑只此一份）。
//
// 契约：docs/playground.md §8.2（样例复算）、docs/verification.md §2（容差）。
//   - scripts/compare.mjs            双端比对（行为与抽取前一致）
//   - scripts/playground-check.mjs   10 样例 × 28 case 复算
//   - bindings/web/playground/selftest.html  浏览器内同一批判据
//
// 本文件是**浏览器 / Node 通用**的纯 ESM：不 import node:fs / node:path，
// 不读环境变量、不打印；调用方负责读取 JSON、调用 wasm 与输出失败明细。

/** 返回码（docs/api.md §5）；与 compare.mjs 抽取前完全一致的集合。 */
export const CODE = Object.freeze({
  OK: 0, E_INVALID_ARG: 10, E_UNKNOWN_KIND: 11, E_DUPLICATE_ID: 12, E_PARAM_RANGE: 13,
  E_TERMINAL_RANGE: 14, E_TERMINAL_LIMIT: 15, E_NO_REFERENCE: 20, E_MULTI_REFERENCE: 21,
  E_SINGULAR: 30, E_OSCILLATION: 31, E_SHORT_CIRCUIT: 40, E_BUFFER_SMALL: 50,
});

const CODE_NAME = new Map(Object.entries(CODE).map(([name, value]) => [value, name]));

/** 数值码 → 名字；未知码原样返回 `code N`。 */
export function codeName(code) {
  return CODE_NAME.get(code) ?? `code ${code}`;
}

/** fixture 的 case 列表；没有 cases 时按 compare.mjs 的旧行为视为一个空 case。 */
export function caseEntries(fixture) {
  return fixture.cases && fixture.cases.length ? fixture.cases : [{}];
}

/** ref → { id, terminal_base }（与 compare.mjs 抽取前一致，只取 fixture.devices）。 */
export function buildRefs(fixture) {
  const refs = new Map();
  for (const device of fixture.devices || []) {
    refs.set(device.ref, { id: device.id, base: device.terminal_base });
  }
  return refs;
}

/**
 * fixture + case → solve 入参。逻辑与 compare.mjs 抽取前逐行一致：
 * set → add_wires → drop_wires（从大到小删）→ add_devices。
 */
export function buildCaseInput(fixture, entry = {}) {
  const input = JSON.parse(JSON.stringify({
    strict_reference: fixture.strict_reference,
    config: fixture.config || {},
    devices: fixture.devices,
    wires: fixture.wires,
  }));

  if (entry.set) {
    for (const [ref, patch] of Object.entries(entry.set)) {
      const device = input.devices.find((item) => item.ref === ref);
      if (!device) {
        throw new Error(`${fixture.case ?? "fixture"}/${entry.name || "默认"}: 未知 ref ${ref}`);
      }
      Object.assign(device, patch);
    }
  }
  for (const [a, b] of entry.add_wires || []) input.wires.push({ a, b });
  if (entry.drop_wires) {
    for (const index of [...entry.drop_wires].sort((x, y) => y - x)) input.wires.splice(index, 1);
  }
  for (const device of entry.add_devices || []) {
    input.devices.push(JSON.parse(JSON.stringify(device)));
  }
  return input;
}

function tolerance(entry, field) {
  // 器件字段与接点电流共用 tol / tol_abs；接点电压用 v_tol / v_tol_abs。
  if (field === "i_rms" || field === "coil_i_rms") {
    return { tol: entry.tol ?? 0.01, tolAbs: entry.tol_abs ?? 0 };
  }
  return { tol: entry.v_tol ?? 0.01, tolAbs: entry.v_tol_abs ?? 0 };
}

function withinTolerance(actual, expected, tol, tolAbs) {
  if (expected === 0) return Math.abs(actual) <= Math.max(tolAbs, 1e-12);
  return Math.abs(actual - expected) / Math.abs(expected) <= tol
    || Math.abs(actual - expected) <= tolAbs;
}

/**
 * 比较一次 solve 输出与 fixture case 的期望值。
 *
 * @returns {{
 *   want: number,
 *   codeOk: boolean,
 *   failures: Array<object>,
 *   passes: Array<{key: string, field: string, value: number}>,
 * }} failures 是结构化对象，格式化交给调用方（compare.mjs / playwright-check / 页面）。
 */
export function compareCase(fixture, entry, output, refs = buildRefs(fixture)) {
  const want = entry.expect_code ? CODE[entry.expect_code] : 0;
  const failures = [];
  const passes = [];

  if (output.code !== want) {
    failures.push({ kind: "code", expected: want, actual: output.code });
    return { want, codeOk: false, failures, passes };
  }
  if (want !== 0) return { want, codeOk: true, failures, passes };

  for (const [key, expected] of Object.entries(entry.expect || {})) {
    const [ref, rawIndex] = key.split(":");
    const index = Number(rawIndex);
    const refInfo = refs.get(ref);
    if (!refInfo) {
      failures.push({ kind: "ref-missing", key, ref });
      continue;
    }
    const terminalId = refInfo.base + index;
    const got = (output.terminals || []).find((terminal) => terminal.id === terminalId);
    if (!got) {
      failures.push({ kind: "terminal-missing", key, ref, index, terminalId });
      continue;
    }
    for (const field of ["i_rms", "v_rms"]) {
      const wantValue = expected[field];
      if (wantValue === undefined) continue;
      const { tol, tolAbs } = tolerance(expected, field);
      const actual = got[field];
      if (!withinTolerance(actual, wantValue, tol, tolAbs)) {
        failures.push({
          kind: "terminal-field", key, ref, index, terminalId, field,
          expected: wantValue, actual,
        });
      } else {
        passes.push({ key, ref, index, terminalId, field, value: actual });
      }
    }
  }

  for (const [ref, expected] of Object.entries(entry.expect_devices || {})) {
    const refInfo = refs.get(ref);
    if (!refInfo) {
      failures.push({ kind: "ref-missing", ref });
      continue;
    }
    if (expected.coil_i_rms === undefined) continue;
    const got = (output.devices || []).find((device) => device.id === refInfo.id);
    if (!got) {
      failures.push({ kind: "device-missing", ref, deviceId: refInfo.id });
      continue;
    }
    const { tol, tolAbs } = tolerance(expected, "coil_i_rms");
    if (!withinTolerance(got.coil_i_rms, expected.coil_i_rms, tol, tolAbs)) {
      failures.push({
        kind: "device-field", ref, deviceId: refInfo.id, field: "coil_i_rms",
        expected: expected.coil_i_rms, actual: got.coil_i_rms,
      });
    }
  }

  return { want, codeOk: true, failures, passes };
}

/** 与 compare.mjs 抽取前逐字一致的失败文案（不含 `✗ 文件 / case：` 前缀）。 */
export function formatFailure(failure) {
  switch (failure.kind) {
    case "code":
      return `code ${failure.actual} ≠ ${failure.expected}`;
    case "ref-missing":
      return `fixture 里没有 ref ${failure.ref}`;
    case "terminal-missing":
      return `结果里没有接点 ${failure.terminalId}`;
    case "terminal-field":
      return `${failure.key}.${failure.field} = ${failure.actual} 期望 ${failure.expected}`;
    case "device-missing":
      return `结果里没有器件 ${failure.deviceId}`;
    case "device-field":
      return `${failure.ref}.${failure.field} = ${failure.actual} 期望 ${failure.expected}`;
    default:
      return `未知失败类型 ${failure.kind}`;
  }
}
