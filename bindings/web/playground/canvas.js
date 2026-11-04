// canvas.js —— Canvas 2D 渲染、命中测试与拖动预览；把鼠标事件翻译成 reducer 事件。
//
// 契约：
//   docs/playground.md §2.2  只渲染 + 翻译事件；不做状态转换、不直接求解
//   docs/playground.md §3.1  逻辑画布 1600×1000；按 devicePixelRatio 放大重绘
//   docs/playground.md §6.1  器件框 / 位号 / 器件名 / 接点圆点 / 接点编号 / 接点电压
//   docs/demo.md §4           配色与字号沿用（不在此重造第二套数值口径）
//   docs/demo.md §8           诊断码 → 中文文案（本片只有一条最小映射，M6.3 再抽 diag-text.js）
//
// 本片不做接线交互（M6.3）：已有导线只画直线、不可点选，不实现正交走线与框内裁剪。

import { CATALOG, terminalCount } from "./device-catalog.js";
import { edgeNormal, labelPoint, terminalGeometry, TERMINAL_DOT_RADIUS } from "./geometry.js";
import { CANVAS } from "./state.js";

const COLOR = Object.freeze({
  boxFill: "#ffffff",
  boxStroke: "#37474f",
  boxSelected: "#ff6d00",
  text: "#263238",
  terminal: "#1e88e5",
  label: "#546e7a",
  voltage: "#00695c",
  wireLive: "#d32f2f",
  wireIdle: "#9e9e9e",
  grid: "#eceff1",
  hint: "#90a4ae",
  drag: "#ff6d00",
});

const DIAG_LEVEL_TEXT = Object.freeze({ 0: "info", 1: "warn", 2: "error" });

// 沿用 docs/demo.md §8 的同一份诊断码枚举；playground 不新增错误码 / 诊断码。
const DIAG_TEXT = Object.freeze({
  0: "正常",
  20: "缺少接地参考点：请把 P1.N 接到 PE1",
  21: "接地参考点重复",
  30: "矩阵奇异：多半是某处该接的线没接",
  31: "开关状态振荡：自锁回路无法稳定",
  40: "短路：相与相之间被导线或闭合触点直接连通",
  50: "缓冲不足",
  100: "过流告警：某支路电流超过 50 A",
  101: "该通的支路没有电流：检查接点是否连通",
  102: "电路尚未接地，已临时以 P1.N 作参考",
  103: "有若干接点尚未接入回路（显示 0）",
});

/** 诊断码 → 中文；表外码按 docs/playground.md §6.4 显示“未知诊断码 N”，不静默吞掉。 */
export function diagText(code) {
  return DIAG_TEXT[code] ?? `未知诊断码 ${code}`;
}

export function diagLevelText(level) {
  return DIAG_LEVEL_TEXT[level] ?? "info";
}

const formatVoltage = (value) => (
  Math.abs(value) >= 1 ? `${value.toFixed(1)}V` : `${value.toFixed(3)}V`
);

function deviceBox(device, drag) {
  if (drag && drag.ref === device.ref) {
    return { ...device, x: drag.x, y: drag.y };
  }
  return device;
}

function buildTerminals(devices, drag) {
  const entries = [];
  for (const device of devices) {
    const box = deviceBox(device, drag);
    const count = terminalCount(device.kind, device.aux);
    for (let index = 0; index < count; index += 1) {
      const geometry = terminalGeometry(box, index);
      entries.push({
        ...geometry,
        id: device.terminal_base + index,
        ref: device.ref,
        device: box,
      });
    }
  }
  return entries;
}

/**
 * 创建画布视图。
 * @param {HTMLCanvasElement} canvas
 * @param {{ onEvent: (event: object) => void, onError?: (error: Error) => void }} handlers
 */
export function createCanvasView(canvas, handlers = {}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器不支持 Canvas 2D");

  let state = null;
  let dpr = 1;
  let drag = null;

  function resize() {
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    if (nextDpr === dpr && canvas.width === Math.round(CANVAS.w * dpr)) return;
    dpr = nextDpr;
    canvas.width = Math.round(CANVAS.w * dpr);
    canvas.height = Math.round(CANVAS.h * dpr);
    canvas.style.aspectRatio = `${CANVAS.w} / ${CANVAS.h}`;
  }

  function emit(event) {
    try {
      handlers.onEvent?.(event);
    } catch (error) {
      handlers.onError?.(error);
    }
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS.w / rect.width;
    const scaleY = CANVAS.h / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function hitDevice(point) {
    const devices = state?.devices ?? [];
    for (let index = devices.length - 1; index >= 0; index -= 1) {
      const device = devices[index];
      if (point.x >= device.x && point.x <= device.x + device.w
        && point.y >= device.y && point.y <= device.y + device.h) {
        return device;
      }
    }
    return null;
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    const point = pointFromEvent(event);
    const device = hitDevice(point);
    if (!device) {
      drag = null;
      emit({ type: "select", ref: null });
      return;
    }
    emit({ type: "select", ref: device.ref });
    drag = {
      ref: device.ref,
      offsetX: point.x - device.x,
      offsetY: point.y - device.y,
      start: point,
      last: { x: device.x, y: device.y },
      moved: false,
    };
    canvas.setPointerCapture?.(event.pointerId);
    canvas.style.cursor = "grabbing";
  }

  function onPointerMove(event) {
    if (!drag) {
      const point = pointFromEvent(event);
      canvas.style.cursor = hitDevice(point) ? "grab" : "default";
      return;
    }
    const point = pointFromEvent(event);
    const target = {
      x: Math.round(point.x - drag.offsetX),
      y: Math.round(point.y - drag.offsetY),
    };
    const moved = Math.abs(point.x - drag.start.x) >= 3 || Math.abs(point.y - drag.start.y) >= 3;
    if (moved) drag.moved = true;
    drag.last = target;
    if (drag.moved) {
      emit({ type: "movePreview", ref: drag.ref, x: target.x, y: target.y });
    }
  }

  function finishDrag(event, cancelled) {
    if (!drag) return;
    const finished = drag;
    drag = null;
    canvas.style.cursor = "default";
    if (event?.pointerId !== undefined) canvas.releasePointerCapture?.(event.pointerId);
    if (cancelled) {
      emit({ type: "cancel" });
      return;
    }
    if (finished.moved) {
      emit({ type: "moveCommit", ref: finished.ref, x: finished.last.x, y: finished.last.y });
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", (event) => finishDrag(event, false));
  canvas.addEventListener("pointercancel", (event) => finishDrag(event, true));

  // ── 绘制 ──────────────────────────────────────────────────────────────────

  function drawGrid() {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS.w, CANVAS.h);
    ctx.strokeStyle = COLOR.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= CANVAS.w; x += 40) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, CANVAS.h);
    }
    for (let y = 0; y <= CANVAS.h; y += 40) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(CANVAS.w, y + 0.5);
    }
    ctx.stroke();
  }

  function drawWires(terminals) {
    const byId = new Map(terminals.map((terminal) => [terminal.id, terminal]));
    const result = state?.result;
    const resultById = new Map((result?.terminals ?? []).map((terminal) => [terminal.id, terminal]));

    for (const wire of state?.wires ?? []) {
      const a = byId.get(wire.a);
      const b = byId.get(wire.b);
      if (!a || !b) continue;
      const live = (resultById.get(wire.a)?.i_rms ?? 0) >= 1e-3
        || (resultById.get(wire.b)?.i_rms ?? 0) >= 1e-3;
      ctx.strokeStyle = live ? COLOR.wireLive : COLOR.wireIdle;
      ctx.lineWidth = live ? 2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  function drawDevice(device, dragging) {
    const { x, y, w, h } = device;
    const selected = state?.selected === device.ref;
    ctx.fillStyle = COLOR.boxFill;
    ctx.strokeStyle = selected || dragging ? COLOR.boxSelected : COLOR.boxStroke;
    ctx.lineWidth = selected || dragging ? 2.5 : 1.5;
    if (dragging) ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.rect(x + 0.5, y + 0.5, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = COLOR.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 13px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillText(device.ref, x + w / 2, y + h / 2 - 7);
    ctx.font = "11px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillStyle = "#455a64";
    ctx.fillText(CATALOG[device.kind]?.label ?? device.kind, x + w / 2, y + h / 2 + 9);
  }

  function haloText(text, x, y, color) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawTerminals(devices) {
    const resultById = new Map((state?.result?.terminals ?? []).map((terminal) => [terminal.id, terminal]));
    ctx.textBaseline = "middle";
    for (const device of devices) {
      const count = terminalCount(device.kind, device.aux);
      for (let index = 0; index < count; index += 1) {
        const geometry = terminalGeometry(device, index);
        const normal = edgeNormal(geometry.edge);

        ctx.beginPath();
        ctx.arc(geometry.x, geometry.y, TERMINAL_DOT_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = COLOR.terminal;
        ctx.fill();

        // 接点编号：沿边法向向外偏 6 px（§3.1）。
        const number = labelPoint(device, index);
        ctx.font = "9px system-ui, -apple-system, 'Segoe UI', sans-serif";
        ctx.textAlign = normal.dx < 0 ? "right" : normal.dx > 0 ? "left" : "center";
        ctx.textBaseline = normal.dy < 0 ? "bottom" : normal.dy > 0 ? "top" : "middle";
        haloText(geometry.name, number.x, number.y, COLOR.label);

        // 接点电压：标在接点另一侧（与编号相反方向），10 px（§6.1）。
        const terminalResult = resultById.get(device.terminal_base + index);
        if (terminalResult) {
          const voltage = { x: geometry.x - normal.dx * 10, y: geometry.y - normal.dy * 10 };
          ctx.font = "10px system-ui, -apple-system, 'Segoe UI', sans-serif";
          ctx.textAlign = normal.dx < 0 ? "left" : normal.dx > 0 ? "right" : "center";
          ctx.textBaseline = normal.dy < 0 ? "top" : normal.dy > 0 ? "bottom" : "middle";
          haloText(formatVoltage(terminalResult.v_rms ?? 0), voltage.x, voltage.y, COLOR.voltage);
        }
      }
    }
  }

  function drawHint(devices) {
    if (devices.length > 0) return;
    ctx.fillStyle = COLOR.hint;
    ctx.font = "16px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("白画布：从左侧器件面板点击放置器件", CANVAS.w / 2, CANVAS.h / 2 - 16);
    ctx.font = "12px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillText("拖动器件移动，松手后才重算；选中后可删除", CANVAS.w / 2, CANVAS.h / 2 + 12);
  }

  function render(nextState) {
    state = nextState;
    resize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CANVAS.w, CANVAS.h);
    drawGrid();

    const devices = state?.devices ?? [];
    const dragState = state?.drag ?? null;
    const layoutDevices = devices.map((device) => deviceBox(device, dragState));
    const terminals = buildTerminals(devices, dragState);

    drawWires(terminals);
    for (const device of layoutDevices) {
      drawDevice(device, dragState?.ref === device.ref);
    }
    drawTerminals(layoutDevices);
    drawHint(devices);
  }

  render(null);
  return { render };
}
