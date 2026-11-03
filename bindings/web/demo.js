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
const diagEl = document.getElementById("diag");
const statEl = document.getElementById("stat");
const sumEl = document.getElementById("sum");
const banner = document.getElementById("banner");

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
  solveAndDraw();
}

function solveAndDraw() {
  const out = pcx.solve(netlist);
  result = out;
  if (out.code === 0) {
    lastGood = out;
    banner.style.display = "none";
  } else {
    banner.style.display = "block";
    banner.textContent = `${CODES[out.code] || "错误 " + out.code}（code ${out.code}）`;
  }
  rebuildTerminals();
  draw();
  fillTable();
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

function rebuildTerminals() {
  terminals = [];
  for (const d of netlist.devices) {
    const b = BOXES[d.ref];
    if (!b) continue;
    const g = geom(d);
    const nm = names(d);
    for (let i = 0; i < g.length; i++) {
      terminals.push({
        id: d.terminal_base + i, ref: d.ref, name: nm[i] || String(i),
        x: b.x + g[i].u * b.w, y: b.y + g[i].v * b.h, edge: g[i].e,
        dev: d, local: i,
      });
    }
  }
}

const termById = new Map();
function tmap() {
  if (termById.size !== terminals.length) {
    termById.clear();
    for (const t of terminals) termById.set(t.id, t);
  }
  return termById;
}

// ── 绘制 ──
function draw() {
  const view = result && result.code === 0 ? result : lastGood;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const res = new Map();
  if (view) for (const t of view.terminals) res.set(t.id, t);

  drawWires(res);
  for (const d of netlist.devices) drawDevice(d, view, res);
  drawTerminals(res);
}

function isLive(res, id) {
  const t = res.get(id);
  if (!t) return false;
  return t.i_rms > 1e-3 || t.v_rms > 5;
}

function drawWires(res) {
  for (const w of netlist.wires) {
    const a = termById.get(w.a), b = termById.get(w.b);
    if (!a || !b) continue;
    const live = isLive(res, w.a) || isLive(res, w.b);
    ctx.strokeStyle = live ? "#d32f2f" : "#9e9e9e";
    ctx.lineWidth = live ? 2 : 1.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    if (Math.abs(a.x - b.x) < 1 || Math.abs(a.y - b.y) < 1) {
      ctx.lineTo(b.x, b.y);
    } else {
      ctx.lineTo(b.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }
  if (pending !== null) {
    const a = termById.get(pending);
    if (a) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = "#ff6d00";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
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

  // 触点开合
  const pairs = contactPairs(d);
  const dv = view ? view.devices.find((x) => x.id === d.id) : null;
  const bits = dv ? dv.closed_bits : 0;
  const g = geom(d);
  for (let k = 0; k < pairs.length; k++) {
    const [ia, ib] = pairs[k];
    if (!g[ia] || !g[ib]) continue;
    const pa = { x: b.x + g[ia].u * b.w, y: b.y + g[ia].v * b.h };
    const pb = { x: b.x + g[ib].u * b.w, y: b.y + g[ib].v * b.h };
    const closed = ((bits >> k) & 1) === 1;
    ctx.strokeStyle = closed ? "#37474f" : "#90a4ae";
    ctx.lineWidth = closed ? 2 : 1.4;
    ctx.beginPath();
    if (closed) {
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
    } else {
      const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(mx, my);
      ctx.moveTo(mx, my);
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const len = Math.hypot(dx, dy) || 1;
      ctx.lineTo(mx + dx * 0.35 - dy / len * 8, my + dy * 0.35 + dx / len * 8);
    }
    ctx.stroke();
  }
}

function drawTerminals(res) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const t of terminals) {
    const r = res.get(t.id);
    const sel = pending === t.id || (hover && hover.id === t.id);
    ctx.beginPath();
    ctx.arc(t.x, t.y, sel ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = sel ? "#ff6d00" : "#1e88e5";
    ctx.fill();

    const off = 12;
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
  const t = nearestTerminal(p);
  hover = t;
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
    netlist.wires.splice(w, 1);
    solveAndDraw();
    return;
  }
  const d = nearestOperableDevice(p);
  if (d) {
    toggleDevice(d);
    solveAndDraw();
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
  if (a === b) return;
  if (netlist.wires.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a))) {
    diagEl.textContent = "已有此导线";
    diagEl.className = "warn";
    return;
  }
  netlist.wires.push({ a, b });
  solveAndDraw();
}

function toggleDevice(d) {
  const a = d.aux || 0;
  let bits = d.state_bits || 0;
  if (d.kind === "QS") {
    const n = a === 1 ? 1 : 3;
    const all = (1 << n) - 1;
    bits = bits === all ? 0 : all;
  } else if (d.kind === "SB" || d.kind === "SQ") {
    if (a === 1) bits ^= 0b01;
    else if (a === 2) bits ^= 0b10;
    else bits = bits === 0 ? 0b11 : 0;
  }
  d.state_bits = bits;
  d.flags = 1;
}

// ── 命中测试 ──
function toCanvas(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) * canvas.width) / r.width, y: ((ev.clientY - r.top) * canvas.height) / r.height };
}
function nearestTerminal(p) {
  let best = null, bd = 10;
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

// ── 工具栏 ──
document.getElementById("clear").addEventListener("click", () => {
  if (!netlist.wires.length) return;
  if (!confirm("清空全部导线？可以从零逐条重接。")) return;
  netlist.wires = [];
  solveAndDraw();
});
document.getElementById("reset").addEventListener("click", () => {
  netlist = JSON.parse(JSON.stringify(initial));
  pending = null;
  solveAndDraw();
});
