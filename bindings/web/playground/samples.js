// samples.js —— 样例加载、切换、重置：读 samples/C*.json 与 fixtures/C*.json。
//
// 契约：
//   docs/playground.md §4.1  sample 只存 case / fixture / layout / initial / note
//   docs/playground.md §4.2  运行时读取顺序：sample → fixture → initial → layout → solve
//   docs/playground.md §4.4  失败提示：fixture 缺失 / layout 缺 ref / 未知 ref
//   docs/playground.md §2.1  样例加载纯函数（node --test 可直接测）
//
// 本文件不写网表、不写期望值：网表、id、terminal_base、aux、params、state_bits、
// flags 全部来自 fixtures/C*.json；本文件只合并 layout 与 initial。
// 不碰 DOM：浏览器用 fetch，node --test 注入 readJson。

import { CANVAS } from "./state.js";

/** 本期样例清单（与 fixtures/C1…C10.json 一一对应）。 */
export const SAMPLE_NAMES = Object.freeze([
  "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10",
]);

/** sample 允许出现且必须出现的字段（§4.1）：只存 layout 与操作状态。 */
const SAMPLE_FIELDS = Object.freeze(["case", "fixture", "layout", "initial", "note"]);
const INITIAL_FIELDS = Object.freeze(["case", "rpm", "elapsed_ms"]);

/** 样例加载 / 校验错误；code 供脚本与页面统一识别，message 直接给用户看。 */
export class SampleLoadError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SampleLoadError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new SampleLoadError(code, message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function samplePath(name) {
  return `samples/${name}.json`;
}

// ── 校验 ────────────────────────────────────────────────────────────────────

function validateSampleShape(sample, name) {
  if (!isPlainObject(sample)) {
    fail("SAMPLE_INVALID", `样例 ${name} 不是 JSON 对象：${samplePath(name)}`);
  }
  if (sample.case !== name) {
    fail("SAMPLE_CASE_MISMATCH", `样例 ${name} 的 case 字段是 ${JSON.stringify(sample.case)}，应等于 ${name}`);
  }
  for (const field of SAMPLE_FIELDS) {
    if (!(field in sample)) {
      fail("SAMPLE_FIELD_MISSING", `样例 ${name} 缺少字段 ${field}：${samplePath(name)}`);
    }
  }
  const unknown = Object.keys(sample).filter((field) => !SAMPLE_FIELDS.includes(field));
  if (unknown.length > 0) {
    fail("SAMPLE_FIELD_UNKNOWN", `样例 ${name} 含不允许的字段 ${unknown.join("、")}（只允许 ${SAMPLE_FIELDS.join(" / ")}）`);
  }
  if (typeof sample.fixture !== "string" || !/^fixtures\/[^/]+\.json$/.test(sample.fixture)) {
    fail("SAMPLE_FIXTURE_INVALID", `样例 ${name} 的 fixture 必须是 fixtures/ 下的 .json 路径，实际 ${JSON.stringify(sample.fixture)}`);
  }
  if (typeof sample.note !== "string" || sample.note.trim() === "") {
    fail("SAMPLE_NOTE_INVALID", `样例 ${name} 的 note 不能为空`);
  }
  if (!Array.isArray(sample.layout)) {
    fail("SAMPLE_LAYOUT_INVALID", `样例 ${name} 的 layout 必须是数组`);
  }
  validateInitialShape(sample.initial, name);
}

function validateInitialShape(initial, name) {
  if (!isPlainObject(initial)) {
    fail("SAMPLE_INITIAL_INVALID", `样例 ${name} 的 initial 必须是对象`);
  }
  const unknown = Object.keys(initial).filter((field) => !INITIAL_FIELDS.includes(field));
  if (unknown.length > 0) {
    fail("SAMPLE_INITIAL_INVALID", `样例 ${name} 的 initial 含未知字段 ${unknown.join("、")}`);
  }
  if (initial.case !== undefined && (!Number.isInteger(initial.case) || initial.case < 0)) {
    fail("SAMPLE_INITIAL_INVALID", `样例 ${name} 的 initial.case 必须是非负整数`);
  }
  for (const field of ["rpm", "elapsed_ms"]) {
    if (initial[field] === undefined) continue;
    if (!isPlainObject(initial[field])) {
      fail("SAMPLE_INITIAL_INVALID", `样例 ${name} 的 initial.${field} 必须是 { "<ref>": number }`);
    }
    for (const [ref, value] of Object.entries(initial[field])) {
      if (!Number.isFinite(value)) {
        fail("SAMPLE_INITIAL_INVALID", `样例 ${name} 的 initial.${field}.${ref} 必须是有限数字`);
      }
    }
  }
}

function validateFixtureShape(fixture, sampleName, fixturePath) {
  if (!isPlainObject(fixture)) {
    fail("FIXTURE_INVALID", `fixture 不是 JSON 对象：${fixturePath}（样例 ${sampleName}）`);
  }
  if (fixture.case !== undefined && fixture.case !== sampleName) {
    fail("FIXTURE_CASE_MISMATCH", `样例 ${sampleName} 指向 ${fixturePath}，但该 fixture 的 case 是 ${JSON.stringify(fixture.case)}`);
  }
  if (!Array.isArray(fixture.devices) || fixture.devices.length === 0) {
    fail("FIXTURE_INVALID", `fixture 没有 devices：${fixturePath}`);
  }
  if (!Array.isArray(fixture.wires)) {
    fail("FIXTURE_INVALID", `fixture 没有 wires 数组：${fixturePath}`);
  }
  const seenRefs = new Set();
  for (const device of fixture.devices) {
    if (!isPlainObject(device) || typeof device.ref !== "string" || !device.ref) {
      fail("FIXTURE_INVALID", `fixture 有器件缺少 ref：${fixturePath}`);
    }
    if (seenRefs.has(device.ref)) {
      fail("FIXTURE_INVALID", `fixture 器件 ref 重复：${device.ref}（${fixturePath}）`);
    }
    seenRefs.add(device.ref);
    if (!isPlainObject(device) || typeof device.kind !== "string" || !device.kind) {
      fail("FIXTURE_INVALID", `fixture 器件 ${device.ref} 缺少 kind：${fixturePath}`);
    }
    if (!Number.isInteger(device.id) || !Number.isInteger(device.terminal_base)) {
      fail("FIXTURE_INVALID", `fixture 器件 ${device.ref} 缺少整数 id / terminal_base：${fixturePath}`);
    }
  }
}

// layout 必须恰好覆盖 fixture 的全部 ref，坐标在 1600×1000 内且盒子不重叠（§4.1）。
function validateLayout(sample, devices, sampleName) {
  const boxes = new Map();
  const knownRefs = new Set(devices.map((device) => device.ref));

  for (const item of sample.layout) {
    if (!isPlainObject(item) || typeof item.ref !== "string" || !item.ref) {
      fail("LAYOUT_INVALID", `样例 ${sampleName} 的 layout 有项缺少 ref`);
    }
    const ref = item.ref;
    if (boxes.has(ref)) {
      fail("LAYOUT_DUPLICATE_REF", `样例 ${sampleName} 的 layout 重复 ref：${ref}`);
    }
    for (const field of ["x", "y", "w", "h"]) {
      if (!Number.isFinite(item[field])) {
        fail("LAYOUT_INVALID", `样例 ${sampleName} 的 layout.${ref}.${field} 必须是有限数字`);
      }
    }
    const { x, y, w, h } = item;
    if (w <= 0 || h <= 0) {
      fail("LAYOUT_INVALID", `样例 ${sampleName} 的 layout.${ref} 宽高必须大于 0（w=${w}, h=${h}）`);
    }
    if (x < 0 || y < 0 || x + w > CANVAS.w || y + h > CANVAS.h) {
      fail(
        "LAYOUT_OUT_OF_CANVAS",
        `样例 ${sampleName} 的 layout.${ref} 超出 ${CANVAS.w}×${CANVAS.h}：x=${x}, y=${y}, w=${w}, h=${h}`,
      );
    }
    boxes.set(ref, { ref, x, y, w, h });
  }

  const unknown = [...boxes.keys()].filter((ref) => !knownRefs.has(ref));
  if (unknown.length > 0) {
    fail("LAYOUT_UNKNOWN_REF", `样例 ${sampleName} 的 layout 含未知 ref：${unknown.join("、")}`);
  }
  const missing = [...knownRefs].filter((ref) => !boxes.has(ref));
  if (missing.length > 0) {
    fail("LAYOUT_MISSING_REF", `样例 ${sampleName} 的 layout 缺少 ref：${missing.join("、")}`);
  }

  const entries = [...boxes.values()];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i];
      const b = entries[j];
      const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      if (overlap) {
        fail("LAYOUT_OVERLAP", `样例 ${sampleName} 的 layout 盒子重叠：${a.ref} 与 ${b.ref}`);
      }
    }
  }
  return boxes;
}

// ── initial 应用（§4.2 第 3 步：先套 case，再套 rpm / elapsed_ms 覆盖） ─────

function applyInitial(fixture, initial, sampleName) {
  const devices = clone(fixture.devices);
  const wires = clone(fixture.wires).map((wire) => ({ a: wire.a, b: wire.b }));

  const cases = Array.isArray(fixture.cases) ? fixture.cases : [];
  const caseIndex = initial.case ?? 0;
  if (cases.length === 0) {
    if (caseIndex !== 0) {
      fail(
        "SAMPLE_INITIAL_CASE_RANGE",
        `样例 ${sampleName} 的 initial.case=${caseIndex} 超出 fixture case 数 0`,
      );
    }
  } else if (caseIndex >= cases.length) {
    fail(
      "SAMPLE_INITIAL_CASE_RANGE",
      `样例 ${sampleName} 的 initial.case=${caseIndex} 超出 fixture case 数 ${cases.length}`,
    );
  }
  const entry = cases[caseIndex];
  if (entry !== undefined) {
    if (entry.set !== undefined) {
      if (!isPlainObject(entry.set)) {
        fail("FIXTURE_INVALID", `fixture 的 case ${caseIndex} set 必须是对象（样例 ${sampleName}）`);
      }
      for (const [ref, patch] of Object.entries(entry.set)) {
        const device = devices.find((item) => item.ref === ref);
        if (!device) fail("FIXTURE_INVALID", `fixture 的 case ${caseIndex} set 了未知 ref ${ref}（样例 ${sampleName}）`);
        if (!isPlainObject(patch)) {
          fail("FIXTURE_INVALID", `fixture 的 case ${caseIndex} set.${ref} 必须是对象（样例 ${sampleName}）`);
        }
        Object.assign(device, clone(patch));
      }
    }
    for (const pair of entry.add_wires ?? []) {
      if (!Array.isArray(pair) || pair.length !== 2 || !Number.isInteger(pair[0]) || !Number.isInteger(pair[1])) {
        fail("FIXTURE_INVALID", `fixture 的 case ${caseIndex} add_wires 项必须是 [a, b]（样例 ${sampleName}）`);
      }
      wires.push({ a: pair[0], b: pair[1] });
    }
    for (const index of [...(entry.drop_wires ?? [])].sort((a, b) => b - a)) {
      if (!Number.isInteger(index) || index < 0 || index >= wires.length) {
        fail("FIXTURE_INVALID", `fixture 的 case ${caseIndex} drop_wires 下标越界：${index}（样例 ${sampleName}）`);
      }
      wires.splice(index, 1);
    }
    for (const device of entry.add_devices ?? []) {
      if (!isPlainObject(device) || !Number.isInteger(device.id) || !Number.isInteger(device.terminal_base)) {
        fail("FIXTURE_INVALID", `fixture 的 case ${caseIndex} add_devices 需要显式 id / terminal_base（样例 ${sampleName}）`);
      }
      devices.push(clone(device));
    }
  }

  for (const [ref, value] of Object.entries(initial.rpm ?? {})) {
    const device = devices.find((item) => item.ref === ref);
    if (!device) fail("SAMPLE_INITIAL_INVALID", `样例 ${sampleName} 的 initial.rpm 指向未知 ref：${ref}`);
    if (device.kind !== "KS") fail("SAMPLE_INITIAL_INVALID", `样例 ${sampleName} 的 initial.rpm 只能给 KS，${ref} 是 ${device.kind}`);
    device.rpm = value;
  }
  for (const [ref, value] of Object.entries(initial.elapsed_ms ?? {})) {
    const device = devices.find((item) => item.ref === ref);
    if (!device) fail("SAMPLE_INITIAL_INVALID", `样例 ${sampleName} 的 initial.elapsed_ms 指向未知 ref：${ref}`);
    if (!["KT", "FR"].includes(device.kind)) {
      fail("SAMPLE_INITIAL_INVALID", `样例 ${sampleName} 的 initial.elapsed_ms 只能给 KT / FR，${ref} 是 ${device.kind}`);
    }
    device.elapsed_ms = value;
  }

  return { devices, wires, caseIndex };
}

// ── 纯函数：sample + fixture → reducer 的 loadSample 事件 ───────────────────

/**
 * 合并 sample 与 fixture，生成 `reducer({ type: "loadSample", … })` 的入参。
 * fixture 的 id / terminal_base / aux / params / state_bits / flags 原值全部保留；
 * layout 只补 x / y / w / h。
 */
export function buildSampleStateInput(sample, fixture) {
  if (!isPlainObject(sample) || typeof sample.case !== "string") {
    fail("SAMPLE_INVALID", "样例缺少 case 字段");
  }
  const name = sample.case;
  validateSampleShape(sample, name);
  validateFixtureShape(fixture, name, sample.fixture);

  const initial = applyInitial(fixture, sample.initial, name);
  const layout = validateLayout(sample, initial.devices, name);

  const devices = initial.devices.map((device) => {
    const box = layout.get(device.ref);
    return { ...device, x: box.x, y: box.y, w: box.w, h: box.h };
  });

  return {
    type: "loadSample",
    sample: name,
    devices,
    wires: initial.wires,
    // 样例默认宽松模式（§4.2，口径 06）；严格模式由 M6.5 的手动开关切换。
    strictReference: false,
    config: clone(fixture.config ?? {}),
    note: sample.note,
    initial: clone(sample.initial),
    fixturePath: sample.fixture,
    fixtureCase: initial.caseIndex,
    fixtureStrictReference: fixture.strict_reference === true,
  };
}

// ── 读取（浏览器 fetch / node 注入 readJson） ────────────────────────────────

async function defaultReadJson(relativePath) {
  const url = relativePath.startsWith("fixtures/")
    ? new URL(`../../../${relativePath}`, import.meta.url)
    : new URL(`./${relativePath}`, import.meta.url);
  let response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch (error) {
    throw new Error(`网络错误：${error?.message ?? error}`);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`JSON 解析失败：${error?.message ?? error}`);
  }
}

/**
 * 读取并构建一个样例。
 *
 * 读取顺序（§4.2）：
 *   1. samples/<name>.json       —— layout ＋ initial
 *   2. samples/<name>.json 的 fixture（fixtures/C*.json）—— 网表与期望值
 *   3. 套 initial.case / rpm / elapsed_ms
 *   4. 套 layout
 *
 * @param {string} name
 * @param {{ readJson?: (path: string) => Promise<object> }} [deps]
 * @returns {Promise<object>} reducer 的 loadSample 事件
 */
export async function loadSample(name, deps = {}) {
  if (!SAMPLE_NAMES.includes(name)) {
    fail("SAMPLE_UNKNOWN", `未知样例：${JSON.stringify(name)}（可选 ${SAMPLE_NAMES.join(" / ")}）`);
  }
  const readJson = deps.readJson ?? defaultReadJson;
  const path = samplePath(name);

  let sample;
  try {
    sample = await readJson(path);
  } catch (error) {
    fail("SAMPLE_MISSING", `样例文件缺失或读取失败：${path}（${error?.message ?? error}）`);
  }
  validateSampleShape(sample, name);

  let fixture;
  try {
    fixture = await readJson(sample.fixture);
  } catch (error) {
    fail("FIXTURE_MISSING", `fixture 缺失或读取失败：${sample.fixture}（${error?.message ?? error}）`);
  }

  return buildSampleStateInput(sample, fixture);
}
