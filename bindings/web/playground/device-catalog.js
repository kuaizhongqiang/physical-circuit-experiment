// device-catalog.js —— 15 类器件图元元数据的唯一来源（纯数据 ＋ 纯函数）。
//
// 契约：
//   docs/playground.md §3.2  15 类 kind 的符号 / 显示名 / 默认框尺寸
//   docs/playground.md §3.3  接点几何表（本文件是它的机器可读版本）
//   docs/playground.md §7.1  可编辑参数子集与落位
//   docs/api.md §3           state_bits 位映射
//   docs/domain-model.md §2  接点名称与顺序
//
// 本文件不含器件坐标：layout 与编辑状态由 state / 样例提供。
// 参数缺省值取自 docs/domain-model.md §4 的教学典型值与 fixtures/C3.json，
// 并且只在这里作为「新放置器件的缺省值」出现（docs/playground.md §7.2）。

export const KIND_ORDER = Object.freeze([
  "POWER", "QS", "FU", "KM", "KA", "KT", "KS",
  "FR", "SB", "SQ", "M", "R", "EL", "TB", "PE",
]);

// ── 接点描述 ────────────────────────────────────────────────────────────────
// 接点 = 盒子左上角 + (u × w, v × h)；edge 只决定编号 / 标注文字的偏移方向。
const T = (name, edge, u, v) => Object.freeze({ name, edge, u, v });

const V3 = Object.freeze([0.2, 0.5, 0.8]);

// ── 参数编码 / 校验 ─────────────────────────────────────────────────────────
// QS: aux = poles（1 / 3）。
function qsPoles(aux) {
  const poles = aux === undefined || aux === null ? 3 : aux;
  if (poles !== 1 && poles !== 3) {
    throw new RangeError(`QS.poles 只能为 1 或 3，收到 ${aux}`);
  }
  return poles;
}

// KM / KA: aux = aux_no × 4 + aux_nc（docs/playground.md §7.1）。
function relayAux(aux) {
  const value = aux === undefined || aux === null ? 5 : aux;
  if (value !== 5 && value !== 6 && value !== 9 && value !== 10) {
    throw new RangeError(`KM/KA 的 aux 必须是 aux_no×4 + aux_nc 的合法值（5/6/9/10），收到 ${aux}`);
  }
  return { auxNo: Math.floor(value / 4), auxNc: value % 4 };
}

// SB / SQ: aux = 1 NC / 2 NO / 3 BOTH。
function buttonType(aux) {
  const type = aux === undefined || aux === null ? 2 : aux;
  if (type !== 1 && type !== 2 && type !== 3) {
    throw new RangeError(`SB/SQ 的 type 只能为 1 / 2 / 3，收到 ${aux}`);
  }
  return type;
}

// TB: aux = n（2…8）。
function tbCount(aux) {
  const n = aux === undefined || aux === null ? 5 : aux;
  if (!Number.isInteger(n) || n < 2 || n > 8) {
    throw new RangeError(`TB.n 必须是 2…8 的整数，收到 ${aux}`);
  }
  return n;
}

/** 把 kind 的 aux 规整为契约值；固定接点数的 kind 返回 0。 */
export function normalizeAux(kind, aux) {
  switch (kind) {
    case "QS":
      return qsPoles(aux);
    case "KM":
    case "KA":
      relayAux(aux);
      return aux === undefined || aux === null ? 5 : aux;
    case "SB":
    case "SQ":
      return buttonType(aux);
    case "TB":
      return tbCount(aux);
    default:
      return 0;
  }
}

// ── 接点几何（顺序严格按 docs/domain-model.md §2） ─────────────────────────
function powerTerminals() {
  return [
    T("L1", "right", 1, 0.2),
    T("L2", "right", 1, 0.5),
    T("L3", "right", 1, 0.8),
    T("N", "right", 1, 1),
  ];
}

function qsTerminals(aux) {
  const poles = qsPoles(aux);
  if (poles === 1) {
    return [
      T("1", "left", 0, 0.5),
      T("2", "right", 1, 0.5),
    ];
  }
  return [
    T("1", "left", 0, V3[0]),
    T("3", "left", 0, V3[1]),
    T("5", "left", 0, V3[2]),
    T("2", "right", 1, V3[0]),
    T("4", "right", 1, V3[1]),
    T("6", "right", 1, V3[2]),
  ];
}

function twoLeadTerminals() {
  return [
    T("1", "left", 0, 0.5),
    T("2", "right", 1, 0.5),
  ];
}

function frTerminals() {
  return [
    T("1", "left", 0, V3[0]),
    T("2", "right", 1, V3[0]),
    T("3", "left", 0, V3[1]),
    T("4", "right", 1, V3[1]),
    T("5", "left", 0, V3[2]),
    T("6", "right", 1, V3[2]),
    T("95", "bottom", 0.20, 1),
    T("96", "bottom", 0.35, 1),
    T("97", "bottom", 0.65, 1),
    T("98", "bottom", 0.80, 1),
  ];
}

function kmTerminals(aux) {
  const { auxNo, auxNc } = relayAux(aux);
  const terminals = [
    T("A1", "bottom", 0.10, 1),
    T("A2", "bottom", 0.24, 1),
    T("1", "left", 0, V3[0]),
    T("2", "right", 1, V3[0]),
    T("3", "left", 0, V3[1]),
    T("4", "right", 1, V3[1]),
    T("5", "left", 0, V3[2]),
    T("6", "right", 1, V3[2]),
    T("13", "bottom", 0.42, 1),
    T("14", "bottom", 0.54, 1),
    T("21", "bottom", 0.74, 1),
    T("22", "bottom", 0.86, 1),
  ];
  if (auxNo === 2) terminals.push(T("43", "top", 0.30, 0), T("44", "top", 0.45, 0));
  if (auxNc === 2) terminals.push(T("31", "top", 0.60, 0), T("32", "top", 0.75, 0));
  return terminals;
}

function kaTerminals(aux) {
  const { auxNo, auxNc } = relayAux(aux);
  const terminals = [
    T("A1", "bottom", 0.10, 1),
    T("A2", "bottom", 0.24, 1),
    T("13", "bottom", 0.42, 1),
    T("14", "bottom", 0.54, 1),
    T("21", "bottom", 0.74, 1),
    T("22", "bottom", 0.86, 1),
  ];
  if (auxNo === 2) terminals.push(T("43", "top", 0.30, 0), T("44", "top", 0.45, 0));
  if (auxNc === 2) terminals.push(T("31", "top", 0.60, 0), T("32", "top", 0.75, 0));
  return terminals;
}

function ktTerminals() {
  return [
    T("A1", "bottom", 0.10, 1),
    T("A2", "bottom", 0.24, 1),
    T("55", "bottom", 0.45, 1),
    T("56", "bottom", 0.60, 1),
    T("67", "bottom", 0.74, 1),
    T("68", "bottom", 0.86, 1),
  ];
}

function ksTerminals() {
  return [
    T("13", "bottom", 0.30, 1),
    T("14", "bottom", 0.45, 1),
    T("23", "bottom", 0.70, 1),
    T("24", "bottom", 0.85, 1),
  ];
}

function buttonTerminals() {
  return [
    T("1", "left", 0, 0.40),
    T("2", "right", 1, 0.40),
    T("3", "left", 0, 0.60),
    T("4", "right", 1, 0.60),
  ];
}

function motorTerminals() {
  return [
    T("U1", "top", V3[0], 0),
    T("V1", "top", V3[1], 0),
    T("W1", "top", V3[2], 0),
    T("U2", "bottom", V3[0], 1),
    T("V2", "bottom", V3[1], 1),
    T("W2", "bottom", V3[2], 1),
  ];
}

function tbTerminals(aux) {
  const n = tbCount(aux);
  return Array.from({ length: n }, (_, k) => T(String(k), "bottom", (k + 0.5) / n, 1));
}

function peTerminals() {
  return [T("PE", "top", 0.5, 0)];
}

// ── state_bits（docs/api.md §3：第 k 位 = 第 k 条可变触点闭合） ─────────────
const BIT = (bit, a, b) => Object.freeze({ bit, terminals: Object.freeze([a, b]) });

function qsStateBits(aux) {
  const poles = qsPoles(aux);
  if (poles === 1) return [BIT(0, "1", "2")];
  return [
    BIT(0, "1", "2"),
    BIT(1, "3", "4"),
    BIT(2, "5", "6"),
  ];
}

function kmStateBits(aux) {
  const { auxNo, auxNc } = relayAux(aux);
  const bits = [
    BIT(0, "1", "2"),
    BIT(1, "3", "4"),
    BIT(2, "5", "6"),
    BIT(3, "13", "14"),
    BIT(4, "21", "22"),
  ];
  if (auxNo === 2) bits.push(BIT(5, "43", "44"));
  if (auxNc === 2) bits.push(BIT(6, "31", "32"));
  return bits;
}

function kaStateBits(aux) {
  const { auxNo, auxNc } = relayAux(aux);
  const bits = [
    BIT(0, "13", "14"),
    BIT(1, "21", "22"),
  ];
  if (auxNo === 2) bits.push(BIT(2, "43", "44"));
  if (auxNc === 2) bits.push(BIT(3, "31", "32"));
  return bits;
}

const BUTTON_STATE_BITS = Object.freeze([
  BIT(0, "1", "2"),
  BIT(1, "3", "4"),
]);
const KT_STATE_BITS = Object.freeze([
  BIT(0, "55", "56"),
  BIT(1, "67", "68"),
]);
const KS_STATE_BITS = Object.freeze([
  BIT(0, "13", "14"),
  BIT(1, "23", "24"),
]);
const FR_STATE_BITS = Object.freeze([
  BIT(0, "95", "96"),
  BIT(1, "97", "98"),
]);
const NO_STATE_BITS = Object.freeze([]);

// ── 可编辑参数（docs/playground.md §7.1 的唯一子集） ─────────────────────────
const P = (key, label, control, target, extra = {}) =>
  Object.freeze({ key, label, control, target: Object.freeze(target), ...extra });

const SELECT = (value, label) => Object.freeze({ value, label });
const GROUP_OPTIONS = Object.freeze([SELECT(1, "1 组"), SELECT(2, "2 组")]);

const PARAMS = Object.freeze({
  POWER: Object.freeze([
    P("v_line", "线电压", "number", { field: "params", index: 0 }, {
      unit: "V", minExclusive: 0, suggested: Object.freeze([12, 1000]), default: 380,
    }),
    P("freq_hz", "频率", "number", { field: "params", index: 1 }, {
      unit: "Hz", minExclusive: 0, suggested: Object.freeze([1, 100]), default: 50,
    }),
  ]),
  QS: Object.freeze([
    P("poles", "极数", "select", { field: "aux" }, {
      options: Object.freeze([SELECT(1, "1 极"), SELECT(3, "3 极")]), default: 3,
    }),
  ]),
  FU: Object.freeze([]),
  KM: Object.freeze([
    P("aux_no", "常开辅助组数", "select", { field: "aux", part: "aux_no" }, {
      options: GROUP_OPTIONS, default: 1, auxEncoding: "aux_no * 4 + aux_nc",
    }),
    P("aux_nc", "常闭辅助组数", "select", { field: "aux", part: "aux_nc" }, {
      options: GROUP_OPTIONS, default: 1, auxEncoding: "aux_no * 4 + aux_nc",
    }),
  ]),
  KA: Object.freeze([
    P("aux_no", "常开辅助组数", "select", { field: "aux", part: "aux_no" }, {
      options: GROUP_OPTIONS, default: 1, auxEncoding: "aux_no * 4 + aux_nc",
    }),
    P("aux_nc", "常闭辅助组数", "select", { field: "aux", part: "aux_nc" }, {
      options: GROUP_OPTIONS, default: 1, auxEncoding: "aux_no * 4 + aux_nc",
    }),
  ]),
  KT: Object.freeze([
    P("delay_ms", "延时", "number", { field: "params", index: 5 }, {
      unit: "ms", min: 0, default: 3000,
    }),
  ]),
  KS: Object.freeze([]),
  FR: Object.freeze([
    P("set_current", "整定电流", "number", { field: "params", index: 1 }, {
      unit: "A", minExclusive: 0, default: 6,
    }),
  ]),
  SB: Object.freeze([
    P("type", "类型", "select", { field: "aux" }, {
      options: Object.freeze([
        SELECT(1, "常闭 NC"),
        SELECT(2, "常开 NO"),
        SELECT(3, "复合 BOTH"),
      ]),
      default: 2,
    }),
  ]),
  SQ: Object.freeze([
    P("type", "类型", "select", { field: "aux" }, {
      options: Object.freeze([
        SELECT(1, "常闭 NC"),
        SELECT(2, "常开 NO"),
        SELECT(3, "复合 BOTH"),
      ]),
      default: 2,
    }),
  ]),
  M: Object.freeze([]),
  R: Object.freeze([
    P("resistance", "阻值", "number", { field: "params", index: 0 }, {
      unit: "Ω", minExclusive: 0, default: 30,
    }),
  ]),
  EL: Object.freeze([]),
  TB: Object.freeze([
    P("n", "位数", "number", { field: "aux" }, {
      integer: true, min: 2, max: 8, default: 5,
    }),
  ]),
  PE: Object.freeze([]),
});

// ── 只读常量（docs/playground.md §7.2） ─────────────────────────────────────
// 只描述「哪个 params 下标 / 叫什么 / 单位 / 来源」；值一律从当前器件 params 读取，
// 不在本文件或页面另存第二份数值。
const RO = (key, label, index, unit, source) =>
  Object.freeze({ key, label, index, unit, source });

const READONLY = Object.freeze({
  POWER: Object.freeze([
    RO("r_src", "电源内阻", 2, "Ω", "domain-model.md §4"),
    RO("phase_seq", "相序", 3, "", "api.md §2.4"),
  ]),
  QS: Object.freeze([RO("r_contact", "接触电阻", 0, "Ω", "domain-model.md §4")]),
  FU: Object.freeze([RO("r_contact", "接触电阻", 0, "Ω", "domain-model.md §4")]),
  KM: Object.freeze([
    RO("coil_r", "线圈电阻", 0, "Ω", "domain-model.md §4"),
    RO("coil_x", "线圈电抗", 1, "Ω", "domain-model.md §4"),
    RO("pick_current", "吸合电流", 2, "A", "domain-model.md §4"),
    RO("drop_current", "释放电流", 3, "A", "domain-model.md §4"),
    RO("r_contact", "接触电阻", 4, "Ω", "domain-model.md §4"),
  ]),
  KA: Object.freeze([
    RO("coil_r", "线圈电阻", 0, "Ω", "domain-model.md §4"),
    RO("coil_x", "线圈电抗", 1, "Ω", "domain-model.md §4"),
    RO("pick_current", "吸合电流", 2, "A", "domain-model.md §4"),
    RO("drop_current", "释放电流", 3, "A", "domain-model.md §4"),
    RO("r_contact", "接触电阻", 4, "Ω", "domain-model.md §4"),
  ]),
  KT: Object.freeze([
    RO("coil_r", "线圈电阻", 0, "Ω", "domain-model.md §4"),
    RO("coil_x", "线圈电抗", 1, "Ω", "domain-model.md §4"),
    RO("pick_current", "吸合电流", 2, "A", "domain-model.md §4"),
    RO("drop_current", "释放电流", 3, "A", "domain-model.md §4"),
    RO("r_contact", "接触电阻", 4, "Ω", "domain-model.md §4"),
  ]),
  KS: Object.freeze([
    RO("n_pick", "吸合转速", 0, "rpm", "domain-model.md §4"),
    RO("n_drop", "释放转速", 1, "rpm", "domain-model.md §4"),
    RO("r_contact", "接触电阻", 2, "Ω", "domain-model.md §4"),
  ]),
  FR: Object.freeze([
    RO("r_thermal", "热元件电阻", 0, "Ω", "domain-model.md §4"),
    RO("delay_ms", "动作延时", 2, "ms", "domain-model.md §4"),
    RO("r_contact", "接触电阻", 3, "Ω", "domain-model.md §4"),
  ]),
  SB: Object.freeze([RO("r_contact", "接触电阻", 0, "Ω", "domain-model.md §4")]),
  SQ: Object.freeze([RO("r_contact", "接触电阻", 0, "Ω", "domain-model.md §4")]),
  M: Object.freeze([
    RO("r_phase", "每相电阻", 0, "Ω", "domain-model.md §4"),
    RO("x_phase", "每相电抗", 1, "Ω", "domain-model.md §4"),
  ]),
  R: Object.freeze([]),
  EL: Object.freeze([
    RO("rated_voltage", "额定电压", 0, "V", "domain-model.md §4"),
    RO("power", "额定功率", 1, "W", "domain-model.md §4"),
  ]),
  TB: Object.freeze([]),
  PE: Object.freeze([]),
});

// ── 新放置器件的缺省参数（docs/domain-model.md §4 / fixtures/C3.json） ──────
const DEFAULT_PARAMS = Object.freeze({
  POWER: Object.freeze([380, 50, 0.001, 1, 0, 0, 0, 0]),
  QS: Object.freeze([0.001, 0, 0, 0, 0, 0, 0, 0]),
  FU: Object.freeze([0.001, 0, 0, 0, 0, 0, 0, 0]),
  KM: Object.freeze([12000, 8000, 0.02, 0.012, 0.001, 0, 0, 0]),
  KA: Object.freeze([12000, 8000, 0.02, 0.012, 0.001, 0, 0, 0]),
  KT: Object.freeze([15000, 10000, 0.02, 0.012, 0.001, 3000, 0, 0]),
  KS: Object.freeze([120, 100, 0.001, 0, 0, 0, 0, 0]),
  FR: Object.freeze([0.001, 6, 5000, 0.001, 0, 0, 0, 0]),
  SB: Object.freeze([0.001, 0, 0, 0, 0, 0, 0, 0]),
  SQ: Object.freeze([0.001, 0, 0, 0, 0, 0, 0, 0]),
  M: Object.freeze([40, 18, 0, 0, 0, 0, 0, 0]),
  R: Object.freeze([30, 0, 0, 0, 0, 0, 0, 0]),
  EL: Object.freeze([220, 2, 0, 0, 0, 0, 0, 0]),
  TB: Object.freeze([0, 0, 0, 0, 0, 0, 0, 0]),
  PE: Object.freeze([0, 0, 0, 0, 0, 0, 0, 0]),
});

const DEFAULT_AUX = Object.freeze({
  QS: 3,
  KM: 5,
  KA: 5,
  SB: 2,
  SQ: 2,
  TB: 5,
});

// ── 目录定义 ────────────────────────────────────────────────────────────────
const DEFINITIONS = {
  POWER: {
    label: "三相电源",
    symbol: "power-bus",
    defaultBox: { w: 100, h: 220 },
    stateSource: "fixed",
    terminals: powerTerminals,
    stateBits: () => NO_STATE_BITS,
  },
  QS: {
    label: "旋钮开关",
    symbol: "knife-switch",
    defaultBox: { w: 80, h: 160 },
    stateSource: "application",
    terminals: qsTerminals,
    stateBits: qsStateBits,
  },
  FU: {
    label: "熔断器",
    symbol: "fuse",
    defaultBox: { w: 60, h: 80 },
    stateSource: "fixed",
    terminals: twoLeadTerminals,
    stateBits: () => NO_STATE_BITS,
  },
  KM: {
    label: "交流接触器",
    symbol: "contactor",
    defaultBox: { w: 160, h: 200 },
    stateSource: "solver",
    terminals: kmTerminals,
    stateBits: kmStateBits,
  },
  KA: {
    label: "中间继电器",
    symbol: "relay",
    defaultBox: { w: 160, h: 120 },
    stateSource: "solver",
    terminals: kaTerminals,
    stateBits: kaStateBits,
  },
  KT: {
    label: "时间继电器",
    symbol: "timer-relay",
    defaultBox: { w: 160, h: 120 },
    stateSource: "solver",
    terminals: ktTerminals,
    stateBits: () => KT_STATE_BITS,
  },
  KS: {
    label: "速度继电器",
    symbol: "speed-relay",
    defaultBox: { w: 160, h: 100 },
    stateSource: "solver",
    terminals: ksTerminals,
    stateBits: () => KS_STATE_BITS,
  },
  FR: {
    label: "热继电器",
    symbol: "thermal-relay",
    defaultBox: { w: 140, h: 200 },
    stateSource: "solver",
    terminals: frTerminals,
    stateBits: () => FR_STATE_BITS,
  },
  SB: {
    label: "按钮",
    symbol: "pushbutton",
    defaultBox: { w: 80, h: 80 },
    stateSource: "application",
    terminals: buttonTerminals,
    stateBits: () => BUTTON_STATE_BITS,
  },
  SQ: {
    label: "行程开关",
    symbol: "limit-switch",
    defaultBox: { w: 80, h: 80 },
    stateSource: "application",
    terminals: buttonTerminals,
    stateBits: () => BUTTON_STATE_BITS,
  },
  M: {
    label: "三相电动机",
    symbol: "motor",
    defaultBox: { w: 140, h: 200 },
    stateSource: "fixed",
    terminals: motorTerminals,
    stateBits: () => NO_STATE_BITS,
  },
  R: {
    label: "电阻",
    symbol: "resistor",
    defaultBox: { w: 60, h: 80 },
    stateSource: "fixed",
    terminals: twoLeadTerminals,
    stateBits: () => NO_STATE_BITS,
  },
  EL: {
    label: "指示灯",
    symbol: "lamp",
    defaultBox: { w: 60, h: 80 },
    stateSource: "fixed",
    terminals: twoLeadTerminals,
    stateBits: () => NO_STATE_BITS,
  },
  TB: {
    label: "接线端子排",
    symbol: "terminal-block",
    defaultBox: { w: 160, h: 60 },
    stateSource: "fixed",
    terminals: tbTerminals,
    stateBits: () => NO_STATE_BITS,
  },
  PE: {
    label: "接地",
    symbol: "ground",
    defaultBox: { w: 70, h: 70 },
    stateSource: "fixed",
    terminals: peTerminals,
    stateBits: () => NO_STATE_BITS,
  },
};

function makeEntry(kind) {
  const def = DEFINITIONS[kind];
  return Object.freeze({
    kind,
    label: def.label,
    symbol: def.symbol,
    defaultBox: Object.freeze({ ...def.defaultBox }),
    defaultAux: DEFAULT_AUX[kind] ?? 0,
    stateSource: def.stateSource,
    terminals: (aux) => def.terminals(aux).map((terminal, index) => ({ index, ...terminal })),
    stateBits: (aux) => def.stateBits(aux),
    params: PARAMS[kind],
    readonly: READONLY[kind],
    defaultParams: DEFAULT_PARAMS[kind],
  });
}

export const CATALOG = Object.freeze(
  Object.fromEntries(KIND_ORDER.map((kind) => [kind, makeEntry(kind)])),
);

function entryFor(kind) {
  const entry = CATALOG[kind];
  if (!entry) throw new RangeError(`未知器件 kind: ${kind}`);
  return entry;
}

/** 该 kind 新放置时使用的 aux（接点数 / 类型 / 位数）。 */
export function defaultAux(kind) {
  return entryFor(kind).defaultAux;
}

/** 接点数组，顺序 = docs/domain-model.md §2 表内顺序；每项含 index/name/edge/u/v。 */
export function terminalsFor(kind, aux = defaultAux(kind)) {
  const entry = entryFor(kind);
  return entry.terminals(normalizeAux(kind, aux));
}

/** 接点数（= terminalCount，后续 allocIds 用）。 */
export function terminalCount(kind, aux = defaultAux(kind)) {
  return terminalsFor(kind, aux).length;
}

/** state_bits 位定义；只列出该配置下实际存在的触点。 */
export function stateBitsFor(kind, aux = defaultAux(kind)) {
  const entry = entryFor(kind);
  return entry.stateBits(normalizeAux(kind, aux));
}

/** 默认框尺寸；TB 的宽度按 n 均分（docs/playground.md §3.2）。 */
export function defaultBox(kind, aux = defaultAux(kind)) {
  const entry = entryFor(kind);
  const normalized = normalizeAux(kind, aux);
  if (kind === "TB") {
    const n = tbCount(normalized);
    return { w: Math.max(160, 30 * n), h: entry.defaultBox.h };
  }
  return { ...entry.defaultBox };
}

/** 可编辑参数定义（docs/playground.md §7.1）；无参数的 kind 返回空数组。 */
export function paramsFor(kind) {
  return entryFor(kind).params;
}

/** 只读常量定义（docs/playground.md §7.2）；值从器件 params 读取，此处只给下标与来源。 */
export function readonlyFor(kind) {
  return entryFor(kind).readonly;
}

/** 新放置器件的 params[8] 缺省值（返回副本，调用方可安全修改）。 */
export function defaultParams(kind) {
  return [...entryFor(kind).defaultParams];
}

/** flags.bit0：应用给定触点状态的 kind 为 1，其余为 0（docs/api.md §3）。 */
export function defaultFlags(kind) {
  return entryFor(kind).stateSource === "application" ? 1 : 0;
}

/** 可人工操作的 kind；唯一清单见 docs/playground.md §5.4（QS / SB / SQ）。 */
export const OPERABLE_KINDS = Object.freeze(["QS", "SB", "SQ"]);

export function isOperable(kind) {
  return OPERABLE_KINDS.includes(kind);
}

/** 新放置器件在静止状态下的 state_bits。 */
export function defaultStateBits(kind, aux = defaultAux(kind)) {
  if (kind === "SB" || kind === "SQ") {
    // NC 侧静止闭合；NO 侧断开。BOTH 的 bit0 也因此为 1。
    return buttonType(aux) === 2 ? 0 : 1;
  }
  return 0;
}
