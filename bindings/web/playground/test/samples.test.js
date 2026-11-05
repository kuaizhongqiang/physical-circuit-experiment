// samples.test.js —— 样例加载的纯逻辑单测（无 DOM、无 wasm）。
//
// 契约：
//   docs/playground.md §4.1  sample 只存 case / fixture / layout / initial / note
//   docs/playground.md §4.2  读取顺序、initial 应用、layout 坐标
//   docs/playground.md §4.4  失败提示：fixture 缺失 / layout 缺 ref / 未知 ref
//
// 覆盖 issue #42：10 份样例都从 fixtures 取原值（id / terminal_base / aux / params /
// state_bits / flags 不重新分配），initial.case 按 fixture case 生成初始状态。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  SAMPLE_NAMES,
  SampleLoadError,
  buildSampleStateInput,
  loadSample,
} from "../samples.js";
import { CANVAS, createInitialState, reducer, totalTerminalCount } from "../state.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const SAMPLE_DIR = resolve(ROOT, "bindings/web/playground/samples");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readFixture(name) {
  return readJson(resolve(ROOT, "fixtures", `${name}.json`));
}

function readSample(name) {
  return readJson(resolve(SAMPLE_DIR, `${name}.json`));
}

function boxesDoNotOverlap(layout) {
  for (let i = 0; i < layout.length; i += 1) {
    for (let j = i + 1; j < layout.length; j += 1) {
      const a = layout[i];
      const b = layout[j];
      const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      assert.equal(overlap, false, `${a.ref} 与 ${b.ref} 的盒子重叠`);
    }
  }
}

function assertSampleError(fn, code, pattern) {
  assert.throws(fn, (error) => {
    assert.equal(error instanceof SampleLoadError, true);
    assert.equal(error.code, code);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

test("10 份 sample 只存 layout / initial / note，不复制网表或期望值", () => {
  assert.deepEqual([...SAMPLE_NAMES], ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10"]);
  for (const name of SAMPLE_NAMES) {
    const sample = readSample(name);
    assert.deepEqual(
      Object.keys(sample).sort(),
      ["case", "fixture", "initial", "layout", "note"],
      `${name} 的顶层字段必须只有 case / fixture / layout / initial / note`,
    );
  }
});

test("10 份 sample 加载：id / terminal_base / aux / params 全部沿用 fixture 原值", () => {
  for (const name of SAMPLE_NAMES) {
    const sample = readSample(name);
    const fixture = readFixture(name);
    const input = buildSampleStateInput(sample, fixture);

    assert.equal(input.sample, name);
    assert.equal(input.fixturePath, `fixtures/${name}.json`);
    assert.equal(input.strictReference, false, "样例默认宽松（docs/playground.md §4.2）");
    assert.deepEqual(input.config, fixture.config ?? {});
    assert.equal(input.devices.length, fixture.devices.length);
    for (let index = 0; index < fixture.devices.length; index += 1) {
      const source = fixture.devices[index];
      const device = input.devices[index];
      assert.equal(device.ref, source.ref);
      assert.equal(device.kind, source.kind);
      assert.equal(device.id, source.id, `${name}.${source.ref} 的 id 必须沿用 fixture`);
      assert.equal(
        device.terminal_base,
        source.terminal_base,
        `${name}.${source.ref} 的 terminal_base 必须沿用 fixture`,
      );
      assert.equal(device.aux, source.aux ?? device.aux);
      assert.deepEqual(device.params, source.params);
      // state_bits / flags 可能被 initial.case 的 set 覆盖，但不得是 samples 自造的值。
      const patch = fixture.cases?.[sample.initial?.case ?? 0]?.set?.[source.ref];
      if (patch?.state_bits !== undefined) assert.equal(device.state_bits, patch.state_bits);
      if (patch?.flags !== undefined) assert.equal(device.flags, patch.flags);
      if (patch?.rpm !== undefined) assert.equal(device.rpm, patch.rpm);
      if (patch?.elapsed_ms !== undefined) assert.equal(device.elapsed_ms, patch.elapsed_ms);
      assert.equal(Number.isInteger(device.x), true);
      assert.equal(Number.isInteger(device.y), true);
      assert.equal(device.w > 0, true);
      assert.equal(device.h > 0, true);
      assert.equal(device.x + device.w <= CANVAS.w, true, `${name}.${source.ref} 超出画布宽`);
      assert.equal(device.y + device.h <= CANVAS.h, true, `${name}.${source.ref} 超出画布高`);
    }

    const terminalTotal = totalTerminalCount(input.devices);
    for (const wire of input.wires) {
      assert.equal(Number.isInteger(wire.a) && Number.isInteger(wire.b), true);
      assert.equal(wire.a >= 0 && wire.a < terminalTotal, true, `${name} 导线端点越界`);
      assert.equal(wire.b >= 0 && wire.b < terminalTotal, true, `${name} 导线端点越界`);
      assert.notEqual(wire.a, wire.b);
    }
  }
});

test("10 份 sample 的 layout 恰好覆盖 fixture 全部 ref，且盒子不重叠", () => {
  for (const name of SAMPLE_NAMES) {
    const sample = readSample(name);
    const fixture = readFixture(name);
    const refs = fixture.devices.map((device) => device.ref);
    assert.deepEqual(
      sample.layout.map((item) => item.ref).sort(),
      [...refs].sort(),
      `${name} 的 layout 必须不重不漏`,
    );
    boxesDoNotOverlap(sample.layout);
  }
});

test("10 份 sample 都能套进 reducer，保留接点 id 且 reset 重新加载", () => {
  for (const name of SAMPLE_NAMES) {
    const sample = readSample(name);
    const fixture = readFixture(name);
    const input = buildSampleStateInput(sample, fixture);

    const state = reducer(createInitialState(), input);
    assert.equal(state.sample, name);
    assert.equal(state.sampleNote, sample.note);
    assert.deepEqual(state.config, fixture.config ?? {});
    assert.equal(state.fixtureStrictReference, fixture.strict_reference === true);
    assert.equal(state.needsSolve, true);
    assert.equal(totalTerminalCount(state.devices), totalTerminalCount(fixture.devices));

    const reset = reducer({ ...state, strictReference: true }, { type: "reset" });
    assert.equal(reset.sample, name);
    assert.equal(reset.sampleNote, sample.note);
    assert.equal(reset.strictReference, true, "reset 沿用当前严格 / 宽松开关");
    assert.deepEqual(
      reset.devices.map((device) => [device.ref, device.id, device.terminal_base]),
      state.devices.map((device) => [device.ref, device.id, device.terminal_base]),
    );
    assert.deepEqual(reset.wires, state.wires);
    assert.equal(reset.revision, state.revision + 1);
  }
});

test("initial.case 从 fixture 取 set / add_wires / drop_wires；C9 case 0 的 rpm 生效", () => {
  const sample = readSample("C9");
  const fixture = readFixture("C9");
  const input = buildSampleStateInput(sample, fixture);
  const ks = input.devices.find((device) => device.ref === "KS1");
  assert.equal(ks.rpm, 1300);
  // C9 case 0 的 drop_wires 在 fixture 原网表上生效。
  assert.equal(input.wires.length, fixture.wires.length - (fixture.cases[0].drop_wires?.length ?? 0));

  const c3 = buildSampleStateInput(readSample("C3"), readFixture("C3"));
  assert.equal(c3.fixtureCase, 0);
  assert.equal(c3.wires.length, 30);
});

test("loadSample 按顺序读 sample → fixture，fixture 缺失给明确提示", async () => {
  const sample = readSample("C1");
  const calls = [];
  const readJson = async (path) => {
    calls.push(path);
    if (path === sample.fixture) throw new Error("HTTP 404");
    return sample;
  };

  await assert.rejects(
    () => loadSample("C1", { readJson }),
    (error) => {
      assert.equal(error.code, "FIXTURE_MISSING");
      assert.match(error.message, /fixture 缺失/);
      assert.match(error.message, /fixtures\/C1\.json/);
      return true;
    },
  );
  assert.deepEqual(calls, ["samples/C1.json", "fixtures/C1.json"]);

  const input = await loadSample("C1", {
    readJson: async (path) => (path === "samples/C1.json" ? sample : readFixture("C1")),
  });
  assert.equal(input.sample, "C1");
});

test("样例文件缺失 / fixture 路径非法 / case 不一致都给明确提示", async () => {
  await assert.rejects(
    () => loadSample("C2", { readJson: async () => { throw new Error("HTTP 404"); } }),
    (error) => error.code === "SAMPLE_MISSING" && /样例文件缺失/.test(error.message),
  );

  const badFixture = { ...readSample("C1"), fixture: "../fixtures/C1.json" };
  assertSampleError(
    () => buildSampleStateInput(badFixture, readFixture("C1")),
    "SAMPLE_FIXTURE_INVALID",
    /fixture 必须是 fixtures/,
  );

  const badCase = { ...readSample("C1"), case: "C2" };
  await assert.rejects(
    () => loadSample("C1", { readJson: async (path) => (path === "samples/C1.json" ? badCase : readFixture("C1")) }),
    (error) => error.code === "SAMPLE_CASE_MISMATCH" && /应等于 C1/.test(error.message),
  );

  assertSampleError(
    () => buildSampleStateInput(readSample("C1"), { ...readFixture("C1"), case: "C2" }),
    "FIXTURE_CASE_MISMATCH",
    /该 fixture 的 case 是 "C2"/,
  );
});

test("layout 缺 ref / 未知 ref / 重复 ref / 越界 / 重叠都拒绝并给明确提示", () => {
  const baseSample = readSample("C1");
  const fixture = readFixture("C1");

  const missing = { ...baseSample, layout: baseSample.layout.filter((item) => item.ref !== "PE1") };
  assertSampleError(
    () => buildSampleStateInput(missing, fixture),
    "LAYOUT_MISSING_REF",
    /layout 缺少 ref：PE1/,
  );

  const unknown = {
    ...baseSample,
    layout: [...baseSample.layout, { ref: "NOPE", x: 0, y: 0, w: 10, h: 10 }],
  };
  assertSampleError(
    () => buildSampleStateInput(unknown, fixture),
    "LAYOUT_UNKNOWN_REF",
    /未知 ref：NOPE/,
  );

  const duplicate = {
    ...baseSample,
    layout: [...baseSample.layout, { ...baseSample.layout[0] }],
  };
  assertSampleError(
    () => buildSampleStateInput(duplicate, fixture),
    "LAYOUT_DUPLICATE_REF",
    /重复 ref：P1/,
  );

  const outside = {
    ...baseSample,
    layout: baseSample.layout.map((item) => (
      item.ref === "P1" ? { ...item, x: CANVAS.w - 1 } : item
    )),
  };
  assertSampleError(
    () => buildSampleStateInput(outside, fixture),
    "LAYOUT_OUT_OF_CANVAS",
    /超出 1600×1000/,
  );

  const overlap = {
    ...baseSample,
    layout: baseSample.layout.map((item) => (
      item.ref === "PE1" ? { ...item, x: baseSample.layout[0].x, y: baseSample.layout[0].y } : item
    )),
  };
  assertSampleError(
    () => buildSampleStateInput(overlap, fixture),
    "LAYOUT_OVERLAP",
    /盒子重叠/,
  );
});

test("sample 复制网表字段、initial.case 越界、initial.rpm 给错器件都被拒绝", () => {
  const baseSample = readSample("C1");
  const fixture = readFixture("C1");

  assertSampleError(
    () => buildSampleStateInput({ ...baseSample, devices: fixture.devices }, fixture),
    "SAMPLE_FIELD_UNKNOWN",
    /不允许的字段 devices/,
  );

  assertSampleError(
    () => buildSampleStateInput({ ...baseSample, initial: { case: 99 } }, fixture),
    "SAMPLE_INITIAL_CASE_RANGE",
    /超出 fixture case 数/,
  );

  const rpmOnMotor = { ...baseSample, initial: { case: 0, rpm: { M1: 100 } } };
  assertSampleError(
    () => buildSampleStateInput(rpmOnMotor, fixture),
    "SAMPLE_INITIAL_INVALID",
    /initial.rpm 只能给 KS/,
  );

  const elapsedOnMotor = { ...baseSample, initial: { case: 0, elapsed_ms: { M1: 100 } } };
  assertSampleError(
    () => buildSampleStateInput(elapsedOnMotor, fixture),
    "SAMPLE_INITIAL_INVALID",
    /initial.elapsed_ms 只能给 KT \/ FR/,
  );
});
