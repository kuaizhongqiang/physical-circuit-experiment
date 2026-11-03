// demo.js —— C3 两地控制演示页（Canvas 2D）。规格见 docs/demo.md。
// 数据全部来自 wasm 内核；这里只画图、命中测试、转发操作。

import { loadPcx } from "./pcx.js";

const FIXTURE = "../../fixtures/C3.json";
const WASM = "./pkg/pcx_circuit.wasm";

// 器件类型编号（与 docs/domain-model.md §2 一致），用于和内核核对接点数
const KIND_NUM = {
  POWER: 1, QS: 2, FU: 3, KM: 4, KA: 5, KT: 6, KS: 7, FR: 8,
  SB: 9, SQ: 10, M: 11, R: 12, EL: 13, TB: 14, PE: 15,
};

// ── 器件名称 ──
const NAME = {
  POWER: "三相电源", QS: "旋钮开关", FU: "熔断器", KM: "接触器", KA: "中间继电器",
  KT: "时间继电器", KS: "速度继电器", FR: "热继电器", SB: "按钮", SQ: "行程开关",
  M: "三相电动机", R: "电阻", EL: "指示灯", TB: "端子排", PE: "接地",
};

// ── 盒子（可整体微调，接点几何规则不能变）──
const BOXES = {
  P1: { x: 40, y: 60, w: 70, h: 300 },
  QS1: { x: 140, y: 60, w: 80, h: 300 },
  FU1: { x: 250, y: 90, w: 56, h: 60 },
  FU2: { x: 250, y: 180, w: 56, h: 60 },
  FU3: { x: 250, y: 270, w: 56, h: 60 },
  FR1: { x: 350, y: 60, w: 110, h: 300 },
  KM1: { x: 510, y: 60, w: 130, h: 300 },
  M1: { x: 700, y: 60, w: 120, h: 300 },
  PE1: { x: 40, y: 430, w: 70, h: 60 },
  FU4: { x: 150, y: 440, w: 56, h: 50 },
  FU5: { x: 150, y: 760, w: 56, h: 50 },
  SB1: { x: 240, y: 435, w: 70, h: 60 },
  SB3: { x: 340, y: 435, w: 70, h: 60 },
  SB2: { x: 500, y: 435, w: 70, h: 60 },
  SB4: { x: 500, y: 545, w: 70, h: 60 },
};

// ── 接点名称（顺序 = 内核的局部序号）──
function names(dev) {
  const a = dev.aux || 0;
  switch (dev.kind) {
    case "POWER": return ["L1", "L2", "L3", "N"];
    case "QS": return a === 1 ? ["1", "2"] : ["1", "3", "5", "2", "4", "6"];
    case "FU": case "R": case "EL": return ["1", "2"];
    case "FR": return ["1", "2", "3", "4", "5", "6", "95", "96", "97", "98"];
    case "KM": {
      const no = a ? a >> 2 : 1, nc = a ? a % 4 : 1;
      const v = ["A1", "A2", "1", "2", "3", "4", "5", "6", "13", "14", "21", "22"];
      if (no === 2) v.push("43", "44");
      if (nc === 2) v.push("31", "32");
      return v;
    }
    case "KA": {
      const no = a ? a >> 2 : 1, nc = a ? a % 4 : 1;
      const v = ["A1", "A2", "13", "14", "21", "22"];
      if (no === 2) v.push("43", "44");
      if (nc === 2) v.push("31", "32");
      return v;
    }
    case "KT": return ["A1", "A2", "55", "56", "67", "68"];
    case "KS": return ["13", "14", "23", "24"];
    case "SB": case "SQ": return ["1", "2", "3", "4"];
    case "M": return ["U1", "V1", "W1", "U2", "V2", "W2"];
    case "TB": return Array.from({ length: a }, (_, i) => String(i));
    case "PE": return ["PE"];
    default: return ["?"];
  }
}

// ── 接点几何（边, u, v），见 docs/demo.md §3.4 ──
function geom(dev) {
  const a = dev.aux || 0;
  const right = (v) => ({ u: 1, v, e: "right" });
  const left = (v) => ({ u: 0, v, e: "left" });
  const bottom = (u) => ({ u, v: 1, e: "bottom" });
  const top = (u) => ({ u, v: 0, e: "top" });
  switch (dev.kind) {
    case "POWER": return [right(0.2), right(0.5), right(0.8), right(1)];
    case "QS":
      return a === 1 ? [left(0.5), right(0.5)]
        : [left(0.2), left(0.5), left(0.8), right(0.2), right(0.5), right(0.8)];
    case "FU": case "R": case "EL": return [left(0.5), right(0.5)];
    case "FR": return [
      left(0.2), right(0.2), left(0.5), right(0.5), left(0.8), right(0.8),
      bottom(0.2), bottom(0.35), bottom(0.65), bottom(0.8)];
    case "KM": {
      const no = a ? a >> 2 : 1, nc = a ? a % 4 : 1;
      const v = [
        bottom(0.1), bottom(0.24),
        left(0.2), right(0.2), left(0.5), right(0.5), left(0.8), right(0.8),
        bottom(0.42), bottom(0.54), bottom(0.74), bottom(0.86)];
      if (no === 2) v.push(bottom(0.93), bottom(0.98));
      if (nc === 2) v.push(top(0.3), top(0.45));
      return v;
    }
    case "KA": {
      const no = a ? a >> 2 : 1, nc = a ? a % 4 : 1;
      const v = [bottom(0.1), bottom(0.24), bottom(0.42), bottom(0.54), bottom(0.74), bottom(0.86)];
      if (no === 2) v.push(bottom(0.93), bottom(0.98));
      if (nc === 2) v.push(top(0.3), top(0.45));
      return v;
    }
    case "KT": return [bottom(0.1), bottom(0.24), bottom(0.42), bottom(0.54), bottom(0.74), bottom(0.86)];
    case "KS": return [bottom(0.3), bottom(0.45), bottom(0.7), bottom(0.85)];
    case "SB": case "SQ": return [left(0.4), right(0.4), left(0.6), right(0.6)];
    case "M": return [top(0.2), top(0.5), top(0.8), bottom(0.2), bottom(0.5), bottom(0.8)];
    case "TB": return Array.from({ length: a }, (_, i) => bottom(0.2 + (0.6 * i) / Math.max(a - 1, 1)));
    case "PE": return [top(0.5)];
    default: return [];
  }
}

// ── 触点对（顺序 = state_bits 位序）──
function contactPairs(dev) {
  const a = dev.aux || 0;
  switch (dev.kind) {
    case "QS": return a === 1 ? [[0, 1]] : [[0, 3], [1, 4], [2, 5]];
    case "FU": return [[0, 1]];
    case "KM": return [[2, 3], [4, 5], [6, 7], [8, 9], [10, 11]];
    case "KA": return [[2, 3], [4, 5]];
    case "KT": return [[2, 3], [4, 5]];
    case "KS": return [[0, 1], [2, 3]];
    case "FR": return [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]];
    case "SB": case "SQ": return [[0, 1], [2, 3]];
    case "M": return [[0, 3], [1, 4], [2, 5]];
    case "R": case "EL": return [[0, 1]];
    default: return [];
  }
}

const CODES = {
  0: "正常", 20: "缺少接地参考点：请把 P1.N 接到 PE1", 21: "接地参考点重复",
  30: "矩阵奇异：多半是某处该接的线没接", 31: "开关状态振荡：自锁回路无法稳定",
  40: "短路：相与相之间被导线或闭合触点直接连通", 50: "缓冲不足",
  100: "过流告警：某支路电流超过 50 A", 101: "该通的支路没有电流：检查接点是否连通",
  102: "电路尚未接地，已临时以 P1.N 作参考", 103: "有若干接点尚未接入回路（显示 0）",
};

const fmtV = (v) => (Math.abs(v) >= 1 ? v.toFixed(1) + " V" : v.toFixed(3) + " V");
const fmtI = (i) =>
  i >= 1 ? i.toFixed(2) + " A" : i >= 1e-3 ? (i * 1e3).toFixed(2) + " mA" : (i * 1e6).toFixed(2) + " µA";

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const tip = document.getElementById("tip");
const tbody = document.getElementById("tbody");
const wireBody = document.getElementById("wireBody");
const diagEl = document.getElementById("diag");
const statEl = document.getElementById("stat");
const sumEl = document.getElementById("sum");
const banner = document.getElementById("banner");
const toastEl = document.getElementById("toast");

let cursor = { x: -1, y: -1 };
let flashAt = 0;
let highlightWire = -1;
let toastTimer = 0;
const pressed = new Set(); // 当前被"按住"的瞬动器件（SB / SQ）

// 触点状态由库自解的器件：每次求解后要把 closed_bits 作为下一次的提示传回（D-20261103-12）
const SELF_SOLVED = new Set(["KM", "KA", "KT", "KS", "FR"]);

// SB / SQ 的 aux：1 = 只有常闭、2 = 只有常开、3（或 0）= 复合
// 松开（复位）时的触点状态
function releasedBits(dev) {
  const a = dev.aux || 0;
  if (a === 1) return 0b01; // 常闭闭合
  if (a === 2) return 0b00; // 常开断开
  return 0b01;              // 复合：常闭闭合、常开断开
}
// 按下（动作）时的触点状态
function pressedBits(dev) {
  const a = dev.aux || 0;
  if (a === 1) return 0b00; // 常闭断开
  if (a === 2) return 0b10; // 常开闭合
  return 0b10;              // 复合：常闭断开、常开闭合
}

let pcx = null;
let doc0 = null;
let netlist = null;
let initial = null;
let result = null;
let lastGood = null;
let pending = null; // 已选的第一个接点 id
let hover = null;
let terminals = []; // {id, ref, name, x, y, edge, dev, local}

// ── 启动 ──
(async function boot() {
  try {
    pcx = await loadPcx(WASM);
    doc0 = await (await fetch(FIXTURE)).json();
    verifyTables();
    resetAll();
  } catch (e) {
    banner.style.display = "block";
    banner.textContent = `加载失败：${e.message}　（请用 node scripts/serve.mjs 起本地服务，别用 file:// 打开）`;
    diagEl.textContent = "未就绪";
    diagEl.className = "err";
  }
})();

/// 自检：演示页的接点几何表必须与内核的接点数一致，否则接点 id 全错（docs/demo.md §3.4）
function verifyTables() {
  const bad = [];
  for (const d of doc0.devices) {
    const expect = pcx.terminalCount(KIND_NUM[d.kind], d.aux || 0);
    const got = geom(d).length;
    if (got !== expect) bad.push(`${d.ref}(${d.kind}) 几何 ${got} ≠ 内核 ${expect}`);
  }
  if (bad.length) throw new Error("接点几何表与内核不一致：" + bad.join("；"));
}

function resetAll() {
  netlist = {
    // 演示页走宽松模式：编辑中间态没有完整参考点也要能出数（docs/demo.md §1）
    strict_reference: false,
    config: doc0.config || {},
    devices: JSON.parse(JSON.stringify(doc0.devices)),
    wires: JSON.parse(JSON.stringify(doc0.wires)),
  };
  initial = JSON.parse(JSON.stringify(netlist));
  pending = null;
  pressed.clear();
  highlightWire = -1;
  flashAt = 0;
  solveAndDraw();
}

function solveAndDraw() {
  const out = pcx.solve(netlist);
  result = out;
  if (out.code === 0) {
    lastGood = out;
    banner.style.display = "none";
    // 库是无状态的：把这一轮自解器件的触点状态作为下一轮的"提示"传回，
    // 否则松开按钮后 KM1 的 13-14 自锁触点会一起复位，自锁永远演示不出来。
    for (const d of netlist.devices) {
      if (!SELF_SOLVED.has(d.kind)) continue;
      const r = out.devices.find((x) => x.id === d.id);
      if (!r) continue;
      d.state_bits = r.closed_bits;
      d.flags = 0;
    }
  } else {
    banner.style.display = "block";
    banner.textContent = `${CODES[out.code] || "错误 " + out.code}（code ${out.code}）`;
  }
  rebuildTerminals();
  draw();
  fillTable();
  fillWireTable();
  updateHeader(out);
}

function updateHeader(out) {
  statEl.textContent = `导线 ${netlist.wires.length} ｜ 器件 ${netlist.devices.length} ｜ 接点 ${terminals.length}`;
  const warns = (out.diags || []).filter((d) => d.code !== 0);
  if (out.code !== 0) {
    diagEl.textContent = CODES[out.code] || `错误 ${out.code}`;
    diagEl.className = "err";
  } else if (warns.length) {
    const w = warns.find((d) => d.level === 1) || warns[0];
    diagEl.textContent = CODES[w.code] || `提示 ${w.code}`;
    diagEl.className = w.level === 1 ? "warn" : "ok";
  } else {
    diagEl.textContent = "正常";
    diagEl.className = "ok";
  }
  const t = out.terminals ? out.terminals.length : 0;
  sumEl.textContent = `C3 两地控制 ｜ 器件 ${netlist.devices.length} ｜ 接点 ${t} ｜ 导线 ${netlist.wires.length}` +
    (out.code === 0 ? "" : " ｜ 当前为错误态，画面沿用上次成功结果");
}

const termById = new Map();

function rebuildTerminals() {
  terminals = [];
  termById.clear(); // 每次重建都要一起重建索引，否则导线/清单都会查到 undefined
  for (const d of netlist.devices) {
    const b = BOXES[d.ref];
    if (!b) continue;
    const g = geom(d);
    const nm = names(d);
    for (let i = 0; i < g.length; i++) {
      const t = {
        id: d.terminal_base + i, ref: d.ref, name: nm[i] || String(i),
        x: b.x + g[i].u * b.w, y: b.y + g[i].v * b.h, edge: g[i].e,
        dev: d, local: i,
      };
      terminals.push(t);
      termById.set(t.id, t);
    }
  }
}

// ── 绘制 ──
function draw() {
  const view = result && result.code === 0 ? result : lastGood;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const res = new Map();
  if (view) for (const t of view.terminals) res.set(t.id, t);

  // 顺序很重要：先底板，再导线（否则线被白底矩形盖住，等于看不见），接点与橡皮筋最后
  for (const d of netlist.devices) drawDevice(d, view, res);
  drawWires(res);
  drawTerminals(res);
  drawPending();
}

function isLive(res, id) {
  const t = res.get(id);
  if (!t) return false;
  return t.i_rms > 1e-3 || t.v_rms > 5;
}

// 接点从器件框"垂直引出"一小段，避免走线直接穿框
function outward(t, len) {
  if (t.edge === "left") return { x: t.x - len, y: t.y };
  if (t.edge === "right") return { x: t.x + len, y: t.y };
  if (t.edge === "top") return { x: t.x, y: t.y - len };
  return { x: t.x, y: t.y + len };
}

// 导线折线：接点 → 垂直引出 16px → L 型折点 → 引出点 → 接点
function wirePoints(a, b) {
  const pa = outward(a, 16), pb = outward(b, 16);
  const pts = [{ x: a.x, y: a.y }, pa];
  if (Math.abs(pa.y - pb.y) >= 1 && Math.abs(pa.x - pb.x) >= 1) {
    pts.push({ x: pb.x, y: pa.y });
  }
  pts.push(pb, { x: b.x, y: b.y });
  return pts;
}

// 线段 × 矩形求交（Liang–Barsky），返回 [t0, t1] 或 null
function segBoxInterval(x1, y1, x2, y2, r) {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
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

// 把折线按器件框裁掉"框内"部分 —— 元器件内部的线不画（用户要求）
function visibleRuns(pts) {
  const boxes = Object.values(BOXES);
  const runs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i], p2 = pts[i + 1];
    const cuts = [];
    for (const r of boxes) {
      const iv = segBoxInterval(p1.x, p1.y, p2.x, p2.y, r);
      if (iv) cuts.push(iv);
    }
    cuts.sort((u, v) => u[0] - v[0]);
    let cur = 0;
    const keep = [];
    for (const [c0, c1] of cuts) {
      if (c0 > cur) keep.push([cur, Math.min(c0, 1)]);
      if (c1 > cur) cur = c1;
      if (cur >= 1) break;
    }
    if (cur < 1) keep.push([cur, 1]);
    for (const [s, e] of keep) {
      if (e - s < 1e-4) continue;
      runs.push({
        x1: p1.x + (p2.x - p1.x) * s, y1: p1.y + (p2.y - p1.y) * s,
        x2: p1.x + (p2.x - p1.x) * e, y2: p1.y + (p2.y - p1.y) * e,
      });
    }
  }
  return runs;
}

function strokeRuns(runs, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (const r of runs) {
    ctx.moveTo(r.x1, r.y1);
    ctx.lineTo(r.x2, r.y2);
  }
  ctx.stroke();
}

function drawWires(res) {
  const now = performance.now();
  const n = netlist.wires.length;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  netlist.wires.forEach((w, i) => {
    const a = termById.get(w.a), b = termById.get(w.b);
    if (!a || !b) return;
    const runs = visibleRuns(wirePoints(a, b));
    if (!runs.length) return;
    const live = isLive(res, w.a) || isLive(res, w.b);
    const isNew = i === n - 1 && now - flashAt < 2000;
    const isHi = i === highlightWire;
    const onHover = hover !== null && (w.a === hover.id || w.b === hover.id);

    // 白色描边打底：红线压在浅色底上也不糊
    strokeRuns(runs, "#ffffff", 7.5);
    if (isNew) strokeRuns(runs, "#ff5252", 7); // 刚加的线：一圈红色光晕
    // 主色统一红色（通电深、未通电浅），选中/悬停更深更粗
    const strong = isHi || isNew || onHover;
    strokeRuns(runs, strong ? "#b71c1c" : live ? "#d32f2f" : "#ef9a9a", strong ? 4.2 : live ? 3.2 : 2.4);
  });
}

function drawPending() {
  if (pending === null) return;
  const a = termById.get(pending);
  if (!a) return;

  if (cursor.x >= 0) {
    ctx.save();
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = "#ff6d00";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(cursor.x, cursor.y);
    ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(a.x, a.y, 10, 0, Math.PI * 2);
  ctx.strokeStyle = "#ff6d00";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = "#e65100";
  ctx.font = "13px system-ui,'Microsoft YaHei',sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`已选 ${a.ref}.${a.name} → 再点一个接点完成接线（Esc 取消）`, 12, 22);
}

function drawDevice(d, view, res) {
  const b = BOXES[d.ref];
  if (!b) return;
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#37474f";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(b.x, b.y, b.w, b.h);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#263238";
  ctx.font = "12px system-ui,'Microsoft YaHei',sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(d.ref, b.x + b.w / 2, b.y + b.h / 2 - 8);
  ctx.fillStyle = "#546e7a";
  ctx.font = "10px system-ui,'Microsoft YaHei',sans-serif";
  ctx.fillText(NAME[d.kind] || d.kind, b.x + b.w / 2, b.y + b.h / 2 + 6);

  if (d.kind === "M") {
    ctx.beginPath();
    ctx.arc(b.x + b.w / 2, b.y + b.h / 2 + 26, 14, 0, Math.PI * 2);
    ctx.strokeStyle = "#37474f";
    ctx.stroke();
    ctx.fillStyle = "#263238";
    ctx.font = "11px system-ui,sans-serif";
    ctx.fillText("M", b.x + b.w / 2, b.y + b.h / 2 + 28);
    ctx.fillStyle = "#546e7a";
    ctx.fillText("3~", b.x + b.w / 2, b.y + b.h / 2 + 50);
  }
  if (d.kind === "PE") {
    const cx = b.x + b.w / 2, cy = b.y + b.h - 8;
    ctx.strokeStyle = "#37474f";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - 14 + i * 5, cy + i * 6);
      ctx.lineTo(cx + 14 - i * 5, cy + i * 6);
      ctx.stroke();
    }
  }

  // 内部元件：开关画刀闸，阻抗画矩形，绕组画线圈，接触器线圈画小方框
  const pairs = contactPairs(d);
  const dv = view ? view.devices.find((x) => x.id === d.id) : null;
  const bits = dv ? dv.closed_bits : 0;
  const g = geom(d);
  for (let k = 0; k < pairs.length; k++) {
    if (!pairExists(d, k)) continue; // SB/SQ 只画实际存在的那一组触点
    const [ia, ib] = pairs[k];
    if (!g[ia] || !g[ib]) continue;
    const pa = { x: b.x + g[ia].u * b.w, y: b.y + g[ia].v * b.h };
    const pb = { x: b.x + g[ib].u * b.w, y: b.y + g[ib].v * b.h };
    drawElement(d.kind, k, pa, pb, ((bits >> k) & 1) === 1);
  }

  if ((d.kind === "KM" || d.kind === "KA" || d.kind === "KT") && g[0] && g[1]) {
    const p1 = { x: b.x + g[0].u * b.w, y: b.y + g[0].v * b.h };
    const p2 = { x: b.x + g[1].u * b.w, y: b.y + g[1].v * b.h };
    drawCoil(p1, p2, !!(dv && dv.flags & 1));
  }
}

// ── 元件符号 ──
// SB / SQ 的 aux：1 = 只有常闭、2 = 只有常开、3（或 0）= 复合
function pairExists(dev, k) {
  if (dev.kind !== "SB" && dev.kind !== "SQ") return true;
  const a = dev.aux || 0;
  if (a === 0 || a === 3) return true;
  return a === 1 ? k === 0 : k === 1;
}

function dotAt(p, r, color) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawElement(kind, k, pa, pb, closed) {
  if (kind === "M") return drawWinding(pa, pb);
  if (kind === "R" || kind === "EL") return drawImpedance(pa, pb, false);
  if (kind === "FU") return drawImpedance(pa, pb, true);
  if (kind === "FR" && k < 3) return drawImpedance(pa, pb, false); // 热元件
  drawSwitch(pa, pb, closed, kind);
}

// 开关符号：两个端点圆点 + 闭合直杆 / 断开抬起的刀闸
function drawSwitch(pa, pb, closed, kind) {
  dotAt(pa, 3, "#37474f");
  dotAt(pb, 3, "#37474f");
  const dx = pb.x - pa.x, dy = pb.y - pa.y;
  const len = Math.hypot(dx, dy) || 1;
  const ang = Math.atan2(dy, dx);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (closed) {
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.strokeStyle = "#1b5e20";
    ctx.lineWidth = 3;
    ctx.stroke();
  } else {
    // 抬起约 28°
    const a2 = ang - 0.49;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pa.x + Math.cos(a2) * len * 0.94, pa.y + Math.sin(a2) * len * 0.94);
    ctx.strokeStyle = "#c62828";
    ctx.lineWidth = 2.8;
    ctx.stroke();
    // 静触点根部
    ctx.beginPath();
    ctx.moveTo(pb.x - Math.cos(ang) * len * 0.18, pb.y - Math.sin(ang) * len * 0.18);
    ctx.lineTo(pb.x, pb.y);
    ctx.strokeStyle = "#455a64";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // 按钮（SB / SQ）：刀闸中间加一根"按杆"
  if (kind === "SB" || kind === "SQ") {
    const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    ctx.beginPath();
    ctx.moveTo(mx + nx * 4, my + ny * 4);
    ctx.lineTo(mx + nx * 13, my + ny * 13);
    ctx.strokeStyle = "#455a64";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx + nx * 13 - Math.cos(ang) * 5, my + ny * 13 - Math.sin(ang) * 5);
    ctx.lineTo(mx + nx * 13 + Math.cos(ang) * 5, my + ny * 13 + Math.sin(ang) * 5);
    ctx.strokeStyle = "#455a64";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// 阻抗（电阻 / 指示灯 / 熔断器 / 热元件）：沿两端方向画矩形
function drawImpedance(pa, pb, fuse) {
  const dx = pb.x - pa.x, dy = pb.y - pa.y;
  const len = Math.hypot(dx, dy) || 1;
  const ang = Math.atan2(dy, dx);
  const w = Math.max(len - 10, 10);
  const h = 12;
  ctx.save();
  ctx.translate((pa.x + pb.x) / 2, (pa.y + pb.y) / 2);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = "#37474f";
  ctx.lineWidth = 1.8;
  ctx.stroke();
  if (fuse) {
    // 熔断器：中间贯穿一条线
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(w / 2, 0);
    ctx.strokeStyle = "#37474f";
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
  ctx.restore();
  dotAt(pa, 2.6, "#37474f");
  dotAt(pb, 2.6, "#37474f");
}

// 绕组（电机）：沿两端方向画 3 个半圆
function drawWinding(pa, pb) {
  const dx = pb.x - pa.x, dy = pb.y - pa.y;
  const len = Math.hypot(dx, dy) || 1;
  const ang = Math.atan2(dy, dx);
  ctx.save();
  ctx.translate(pa.x, pa.y);
  ctx.rotate(ang);
  ctx.strokeStyle = "#37474f";
  ctx.lineWidth = 1.8;
  const n = 3;
  const step = len / n;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(step * i + step / 2, 0, step / 2, Math.PI, 0, true);
    ctx.stroke();
  }
  ctx.restore();
}

// 接触器 / 继电器线圈：A1-A2 之间一个小方框
function drawCoil(p1, p2, energized) {
  const cx = (p1.x + p2.x) / 2;
  const w = Math.max(Math.abs(p2.x - p1.x) - 4, 12);
  const h = 14;
  const top = Math.min(p1.y, p2.y) - h - 8;
  ctx.beginPath();
  ctx.rect(cx - w / 2, top, w, h);
  ctx.fillStyle = energized ? "#fff3e0" : "#ffffff";
  ctx.fill();
  ctx.strokeStyle = energized ? "#e65100" : "#90a4ae";
  ctx.lineWidth = 1.8;
  ctx.stroke();
  if (w >= 30) {
    ctx.fillStyle = energized ? "#e65100" : "#90a4ae";
    ctx.font = "9px system-ui,'Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("线圈", cx, top + h / 2 + 0.5);
  }
}

function drawTerminals(res) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const t of terminals) {
    const r = res.get(t.id);
    const isPend = pending === t.id;
    const isHover = hover && hover.id === t.id;
    if (isPend || isHover) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, 10, 0, Math.PI * 2);
      ctx.strokeStyle = isPend ? "#ff6d00" : "#1e88e5";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(t.x, t.y, isPend || isHover ? 6 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = isPend ? "#ff6d00" : "#1e88e5";
    ctx.fill();

    const off = 14;
    let lx = t.x, ly = t.y;
    if (t.edge === "left") lx -= off;
    if (t.edge === "right") lx += off;
    if (t.edge === "top") ly -= off;
    if (t.edge === "bottom") ly += off;

    ctx.font = "9px system-ui,sans-serif";
    ctx.fillStyle = "#546e7a";
    ctx.fillText(t.name, lx, ly);

    if (r) {
      ctx.font = "10px system-ui,sans-serif";
      ctx.fillStyle = "#00695c";
      const vy = t.edge === "top" ? ly - 11 : ly + 11;
      ctx.fillText(fmtV(r.v_rms).replace(" V", "V"), lx, vy);
    }
  }
}

// ── 悬停：任意接点必有数据（docs/demo.md §5.4）──
canvas.addEventListener("mousemove", (ev) => {
  const p = toCanvas(ev);
  cursor = p;
  const t = nearestTerminal(p);
  const changed = (hover ? hover.id : -1) !== (t ? t.id : -1);
  hover = t;
  if (pending !== null || changed) draw();
  if (!t) {
    tip.style.display = "none";
    return;
  }
  const view = result && result.code === 0 ? result : lastGood;
  const r = view ? view.terminals.find((x) => x.id === t.id) : null;
  const dv = view ? view.devices.find((x) => x.id === t.dev.id) : null;
  const bits = dv ? dv.closed_bits : 0;
  const pairs = contactPairs(t.dev);
  const ci = pairs.findIndex(([a, b]) => a === t.local || b === t.local);
  const contactLine = ci >= 0 ? `<div><span class="k">触点</span> ${((bits >> ci) & 1) ? "闭合" : "断开"}</div>` : "";

  const compName = r ? (r.comp === 0 ? "有源" : r.comp === 1 ? "无源孤立" : "单接点") : "—";
  const stateText = !r ? "无数据" : r.flags & 4 ? "未接入" : r.i_rms > 1e-3 || r.v_rms > 5 ? "通电" : "未通电";
  const iText = !r ? "—" : r.flags & 2 ? `${fmtI(r.i_rms)} ∠${r.i_deg.toFixed(1)}°` : "—（该接点无内部支路）";

  tip.innerHTML =
    `<div><b>${t.ref} · ${t.name}</b> <span class="k">#${t.id}</span></div>` +
    `<div><span class="k">电压</span> ${r ? `${fmtV(r.v_rms)} ∠${r.v_deg.toFixed(1)}°` : "—"}${r && r.flags & 4 ? ' <span class="k">未接入</span>' : ""}</div>` +
    `<div><span class="k">电流</span> ${iText}</div>` +
    `<div><span class="k">等势点</span> #${r ? r.node : "—"}</div>` +
    `<div><span class="k">连通分量</span> ${compName}（${r ? r.comp_size : "—"} 个等势点）</div>` +
    `<div><span class="k">导通状态</span> ${stateText}</div>` +
    contactLine;

  tip.style.display = "block";
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = ev.clientX + 14, y = ev.clientY + 14;
  if (x + tw > window.innerWidth - 8) x = ev.clientX - tw - 14;
  if (y + th > window.innerHeight - 8) y = ev.clientY - th - 14;
  tip.style.left = x + "px";
  tip.style.top = y + "px";
});

canvas.addEventListener("mouseleave", () => {
  hover = null;
  tip.style.display = "none";
});

// ── 交互 ──
canvas.addEventListener("click", (ev) => {
  if (!netlist) return;
  const p = toCanvas(ev);
  const t = nearestTerminal(p);
  if (t) {
    if (pending === null) {
      pending = t.id;
    } else if (pending === t.id) {
      pending = null;
    } else {
      addWire(pending, t.id);
      pending = null;
    }
    draw();
    return;
  }
  const w = nearestWire(p);
  if (w >= 0) {
    const del = netlist.wires[w];
    const la = label(del.a), lb = label(del.b);
    netlist.wires.splice(w, 1);
    solveAndDraw();
    toast(`🗑 已删线：${la} ↔ ${lb}（剩 ${netlist.wires.length} 条）`);
    return;
  }
  const d = nearestOperableDevice(p);
  if (d) {
    // SB / SQ 是瞬动元件：按下与抬起由 mousedown / mouseup 处理，这里只管保持型的 QS
    if (d.kind === "QS") {
      toggleQs(d);
      solveAndDraw();
      toast(`${d.ref} 已${(d.state_bits || 0) === 0 ? "断开" : "闭合"}（旋钮保持型）`);
    }
    return;
  }
  pending = null;
  draw();
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    pending = null;
    draw();
  }
});

function addWire(a, b) {
  if (a === b) {
    toast("同一个接点不能自连");
    return;
  }
  if (netlist.wires.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a))) {
    toast(`已有这根线：${label(a)} ↔ ${label(b)}`);
    return;
  }
  netlist.wires.push({ a, b });
  flashAt = performance.now();
  solveAndDraw();
  toast(`✅ 已加线：${label(a)} ↔ ${label(b)}（现在共 ${netlist.wires.length} 条）`);
}

// 旋钮开关：保持型，点一下切换（常开常闭一起翻转）
function toggleQs(d) {
  const a = d.aux || 0;
  const n = a === 1 ? 1 : 3;
  const all = (1 << n) - 1;
  d.state_bits = (d.state_bits || 0) === all ? 0 : all;
  d.flags = 1;
}

// ── 瞬动元件：按下动作、抬起复位（SB / SQ）──
canvas.addEventListener("mousedown", (ev) => {
  if (!netlist || ev.button !== 0) return;
  const p = toCanvas(ev);
  if (nearestTerminal(p)) return; // 点在接点上，交给 click 走接线流程
  const d = nearestOperableDevice(p);
  if (!d || (d.kind !== "SB" && d.kind !== "SQ")) return;
  if (pressed.has(d.ref)) return;

  pressed.add(d.ref);
  d.state_bits = pressedBits(d);
  d.flags = 1;
  solveAndDraw();
  toast(`按住 ${d.ref}（动作中：常开闭合、常闭断开）… 松开鼠标即复位`, 6000);
});

function releaseButtons() {
  if (!pressed.size) return;
  for (const ref of pressed) {
    const d = netlist.devices.find((x) => x.ref === ref);
    if (!d) continue;
    d.state_bits = releasedBits(d);
    d.flags = 1;
  }
  pressed.clear();
  solveAndDraw();
  toast("已松开：常开复位、常闭恢复（自锁回路继续维持）");
}

// 鼠标在画布外松开也要复位，否则会"卡在按下状态"
window.addEventListener("mouseup", () => releaseButtons());
window.addEventListener("blur", () => releaseButtons());

// ── 命中测试 ──
function toCanvas(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) * canvas.width) / r.width, y: ((ev.clientY - r.top) * canvas.height) / r.height };
}
function nearestTerminal(p) {
  let best = null, bd = 14;
  for (const t of terminals) {
    const d = Math.hypot(t.x - p.x, t.y - p.y);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}
function nearestWire(p) {
  let best = -1, bd = 6;
  for (let i = 0; i < netlist.wires.length; i++) {
    const a = termById.get(netlist.wires[i].a), b = termById.get(netlist.wires[i].b);
    if (!a || !b) continue;
    const d = distToSegment(p, a, b);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = dx * dx + dy * dy;
  if (L === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function nearestOperableDevice(p) {
  for (const d of netlist.devices) {
    if (!["SB", "QS", "SQ"].includes(d.kind)) continue;
    const b = BOXES[d.ref];
    if (!b) continue;
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return d;
  }
  return null;
}

// ── 右侧接点表 ──
function fillTable() {
  const view = result && result.code === 0 ? result : lastGood;
  const byId = new Map();
  const devById = new Map();
  if (view) {
    for (const t of view.terminals) byId.set(t.id, t);
    for (const d of view.devices) devById.set(d.id, d);
  }
  const rows = [];
  for (const t of terminals) {
    const r = byId.get(t.id);
    const dv = devById.get(t.dev.id);
    const pairs = contactPairs(t.dev);
    const ci = pairs.findIndex(([a, b]) => a === t.local || b === t.local);
    const st = dv && ci >= 0 ? (((dv.closed_bits >> ci) & 1) ? "闭合" : "断开") : "";
    rows.push(`<tr><td>${t.ref}</td><td>${t.name}</td>` +
      `<td>${r ? r.v_rms.toFixed(1) : "—"}</td>` +
      `<td>${r ? (r.flags & 2 ? fmtI(r.i_rms) : "—") : "—"}</td>` +
      `<td>${st}</td></tr>`);
  }
  tbody.innerHTML = rows.join("");
}

// ── 导线清单 + 提示（"连上没有"要能一眼确认）──
function label(id) {
  const t = termById.get(id);
  return t ? `${t.ref}.${t.name}` : `#${id}`;
}

function toast(msg, ms = 2400) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
}

function fillWireTable() {
  const view = result && result.code === 0 ? result : lastGood;
  const byId = new Map();
  if (view) for (const t of view.terminals) byId.set(t.id, t);
  const now = performance.now();
  const n = netlist.wires.length;
  const rows = [];
  for (let i = n - 1; i >= 0; i--) {
    const w = netlist.wires[i];
    const a = termById.get(w.a), b = termById.get(w.b);
    if (!a || !b) continue;
    const ia = byId.get(w.a), ib = byId.get(w.b);
    const cur = Math.max(ia ? ia.i_rms : 0, ib ? ib.i_rms : 0);
    const cls = i === n - 1 && now - flashAt < 2000 ? ' class="new"' : "";
    rows.push(
      `<tr data-i="${i}"${cls}><td>${i + 1}</td><td>${a.ref}.${a.name}</td>` +
        `<td>${b.ref}.${b.name}</td><td>${cur > 1e-3 ? fmtI(cur) : "—"}</td></tr>`
    );
  }
  wireBody.innerHTML = rows.join("") || `<tr><td colspan="4" style="color:#90a4ae">（当前 0 条导线）</td></tr>`;
}

wireBody.addEventListener("click", (ev) => {
  const tr = ev.target.closest("tr");
  if (!tr || tr.dataset.i === undefined) return;
  const i = Number(tr.dataset.i);
  highlightWire = highlightWire === i ? -1 : i;
  draw();
});

// ── 工具栏 ──
document.getElementById("clear").addEventListener("click", () => {
  if (!netlist.wires.length) {
    toast("当前已经是 0 条导线");
    return;
  }
  if (!confirm("清空全部导线？之后可以从零逐条重接。")) return;
  netlist.wires = [];
  highlightWire = -1;
  flashAt = 0;
  solveAndDraw();
  toast("已清空全部导线（0 条）—— 现在可以点两个接点重新接线");
});
document.getElementById("reset").addEventListener("click", () => {
  netlist = JSON.parse(JSON.stringify(initial));
  pending = null;
  pressed.clear();
  highlightWire = -1;
  flashAt = 0;
  solveAndDraw();
  toast("已恢复初始网表（30 条导线，按钮全部复位）");
});
