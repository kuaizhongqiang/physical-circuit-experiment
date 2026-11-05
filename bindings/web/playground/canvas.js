// canvas.js —— Canvas 2D 渲染、命中测试与拖动 / 接线交互；把鼠标事件翻译成 reducer 事件。
//
// 契约：
//   docs/playground.md §2.2  只渲染 + 翻译事件；不做状态转换、不直接求解
//   docs/playground.md §3.1  逻辑画布 1600×1000；按 devicePixelRatio 放大重绘
//   docs/playground.md §5.1  点接点 A → 点接点 B 接线；点导线选中；Esc / 点空白取消
//   docs/playground.md §6.1  器件框 / 位号 / 器件名 / 接点圆点 / 接点编号 / 接点电压
//   docs/playground.md §6.1  导线正交走线、通电红 / 断电灰、预览橙色虚线、框内裁剪
//   docs/demo.md §4           配色与字号沿用；白底、2 秒光晕按该节“实现备注”
//   docs/playground.md §5.4  SB / SQ 按下动作、抬起复位；QS 点击切换（把事件交给 reducer）
//   docs/demo.md §8          诊断码 → 中文文案在 diag-text.js（本文件不复制第二份）
//
// 本文件不做状态转换：接线 / 删线 / 选中都通过 onEvent 交给 state.js 的 reducer。

import { CATALOG, terminalCount } from "./device-catalog.js";
import {
  edgeNormal,
  labelPoint,
  outwardPoint,
  pointSegmentDistance,
  terminalGeometry,
  visibleRuns,
  wirePoints,
  TERMINAL_DOT_RADIUS,
  TERMINAL_HIT_RADIUS,
  WIRE_HIT_DISTANCE,
} from "./geometry.js";
import { CANVAS } from "./state.js";

const COLOR = Object.freeze({
  boxFill: "#ffffff",
  boxStroke: "#37474f",
  boxSelected: "#ff6d00",
  text: "#263238",
  terminal: "#1e88e5",
  terminalPending: "#ff6d00",
  label: "#546e7a",
  voltage: "#00695c",
  wireLive: "#d32f2f",
  wireIdle: "#9e9e9e",
  wireStrong: "#b71c1c",
  wireGlow: "#ff5252",
  wireUnderlay: "#ffffff",
  wirePreview: "#ff6d00",
  grid: "#eceff1",
  hint: "#90a4ae",
});

const WIRE_FLASH_MS = 2000;

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

/** 预览折线：接点 → 外引点 →（先横后竖）→ 光标。只用于绘制，不写回状态。 */
function previewPoints(terminal, cursor) {
  const lead = outwardPoint(terminal);
  const points = [{ x: terminal.x, y: terminal.y }, lead];
  if (Math.abs(lead.x - cursor.x) >= 1 && Math.abs(lead.y - cursor.y) >= 1) {
    points.push({ x: cursor.x, y: lead.y });
  }
  points.push({ x: cursor.x, y: cursor.y });
  return points;
}

/**
 * 创建画布视图。
 * @param {HTMLCanvasElement} canvas
 * @param {{ onEvent: (event: object) => void, onError?: (error: Error) => void }} handlers
 */
export function createCanvasView(canvas, handlers = {}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器不支持 Canvas 2D");

  function strokeRuns(runs, color, width) {
    if (runs.length === 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const run of runs) {
      ctx.moveTo(run.x1, run.y1);
      ctx.lineTo(run.x2, run.y2);
    }
    ctx.stroke();
  }

  let state = null;
  let dpr = 1;
  let drag = null;
  // 当前被按住的瞬动器件（SB / SQ）；抬起、失焦、拖动都复位（§5.4）。
  let pressedRef = null;
  let cursor = { x: -1, y: -1 };
  let hoverWire = -1;
  let layout = { devices: [], terminals: [], boxes: [] };
  let wireViews = [];
  let lastWires = null;
  let flashIndex = -1;
  let flashUntil = 0;
  let flashTimer = null;

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

  function hitTerminal(point) {
    let best = null;
    let bestDistance = TERMINAL_HIT_RADIUS + 0.5;
    for (const terminal of layout.terminals) {
      const distance = Math.hypot(point.x - terminal.x, point.y - terminal.y);
      if (distance <= bestDistance) {
        best = terminal;
        bestDistance = distance;
      }
    }
    return best;
  }

  function hitWire(point) {
    let best = null;
    let bestDistance = WIRE_HIT_DISTANCE + 0.5;
    for (const view of wireViews) {
      for (const run of view.runs) {
        const distance = pointSegmentDistance(point.x, point.y, run.x1, run.y1, run.x2, run.y2);
        if (distance <= bestDistance) {
          best = view;
          bestDistance = distance;
        }
      }
    }
    return best;
  }

  function updateCursor(point) {
    const terminal = hitTerminal(point);
    if (terminal) {
      canvas.style.cursor = "crosshair";
      return;
    }
    if (hitWire(point)) {
      canvas.style.cursor = "pointer";
      return;
    }
    const device = hitDevice(point);
    if (device && ["SB", "SQ", "QS"].includes(device.kind)) {
      canvas.style.cursor = "pointer";
      return;
    }
    canvas.style.cursor = device ? "grab" : "default";
  }

  /** 松开当前按住的瞬动器件；没有按住时为幂等空操作。 */
  function releasePressed() {
    if (!pressedRef) return;
    const ref = pressedRef;
    pressedRef = null;
    emit({ type: "operate", ref, action: "release" });
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    const point = pointFromEvent(event);
    updatePointerPosition(point);

    const terminal = hitTerminal(point);
    if (terminal) {
      if (state?.pendingTerminal !== null && state?.pendingTerminal !== undefined) {
        emit({ type: "completeWire", terminal: terminal.id });
      } else {
        emit({ type: "pickTerminal", terminal: terminal.id });
      }
      paint();
      return;
    }

    const wire = hitWire(point);
    if (wire) {
      emit({ type: "selectWire", index: state?.selectedWire === wire.index ? null : wire.index });
      paint();
      return;
    }

    const device = hitDevice(point);
    if (!device) {
      emit({ type: "cancel" });
      emit({ type: "select", ref: null });
      paint();
      return;
    }
    if (state?.pendingTerminal !== null && state?.pendingTerminal !== undefined) {
      emit({ type: "cancel" });
    }
    emit({ type: "select", ref: device.ref });

    // SB / SQ 在鼠标按下时动作（常开闭合、常闭断开），抬起复位（§5.4）。
    // 按下后若开始拖动，先复位再拖，避免“一边按住一边移动”的歧义。
    if (device.kind === "SB" || device.kind === "SQ") {
      releasePressed();
      pressedRef = device.ref;
      emit({ type: "operate", ref: device.ref, action: "press" });
    }

    drag = {
      ref: device.ref,
      kind: device.kind,
      offsetX: point.x - device.x,
      offsetY: point.y - device.y,
      start: point,
      last: { x: device.x, y: device.y },
      moved: false,
    };
    canvas.setPointerCapture?.(event.pointerId);
    canvas.style.cursor = "grabbing";
  }

  function updatePointerPosition(point) {
    cursor = point;
  }

  function onPointerMove(event) {
    const point = pointFromEvent(event);
    updatePointerPosition(point);

    if (drag) {
      const target = {
        x: Math.round(point.x - drag.offsetX),
        y: Math.round(point.y - drag.offsetY),
      };
      const moved = Math.abs(point.x - drag.start.x) >= 3 || Math.abs(point.y - drag.start.y) >= 3;
      if (moved) drag.moved = true;
      drag.last = target;
      if (drag.moved) {
        releasePressed();
        emit({ type: "movePreview", ref: drag.ref, x: target.x, y: target.y });
      }
      return;
    }

    updateCursor(point);
    const hovered = hitWire(point);
    const nextHover = hovered ? hovered.index : -1;
    const pending = state?.pendingTerminal !== null && state?.pendingTerminal !== undefined;
    if (nextHover !== hoverWire || pending) {
      hoverWire = nextHover;
      paint();
    }
  }

  function finishDrag(event, cancelled) {
    if (!drag) return;
    const finished = drag;
    drag = null;
    canvas.style.cursor = "default";
    if (event?.pointerId !== undefined) canvas.releasePointerCapture?.(event.pointerId);
    releasePressed();
    if (cancelled) {
      emit({ type: "cancel" });
      return;
    }
    if (finished.moved) {
      emit({ type: "moveCommit", ref: finished.ref, x: finished.last.x, y: finished.last.y });
    } else if (finished.kind === "QS") {
      // 保持型：没拖动的一次点击 = 通断翻转（§5.4）。
      emit({ type: "operate", ref: finished.ref, action: "toggle" });
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", (event) => finishDrag(event, false));
  canvas.addEventListener("pointercancel", (event) => finishDrag(event, true));
  canvas.addEventListener("pointerleave", () => {
    if (drag) return;
    if (hoverWire !== -1) {
      hoverWire = -1;
      paint();
    }
    canvas.style.cursor = "default";
  });
  // 窗口失焦也要复位，否则按钮会“卡在按下状态”（§5.4）；拖动中的预览一并取消。
  window.addEventListener("blur", () => {
    releasePressed();
    if (drag) finishDrag(null, true);
  });

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

  function buildWireViews() {
    const terminalById = new Map(layout.terminals.map((terminal) => [terminal.id, terminal]));
    const views = [];
    (state?.wires ?? []).forEach((wire, index) => {
      const a = terminalById.get(wire.a);
      const b = terminalById.get(wire.b);
      if (!a || !b) return;
      const points = wirePoints(a, b);
      const runs = visibleRuns(points, layout.boxes);
      if (runs.length === 0) return;
      views.push({ index, wire, runs });
    });
    wireViews = views;
  }

  function drawWires() {
    const resultById = new Map(
      (state?.result?.terminals ?? []).map((terminal) => [terminal.id, terminal]),
    );
    const now = performance.now();
    const glowing = flashIndex >= 0 && now < flashUntil;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // 白色打底：红线压在浅色底上也不糊（docs/demo.md §4 实现备注）。
    for (const view of wireViews) strokeRuns(view.runs, COLOR.wireUnderlay, 7.5);
    // 新加的线额外一层红色光晕 2 秒。
    if (glowing) {
      for (const view of wireViews) {
        if (view.index === flashIndex) strokeRuns(view.runs, COLOR.wireGlow, 8);
      }
    }
    for (const view of wireViews) {
      const { wire, index } = view;
      const live = (resultById.get(wire.a)?.i_rms ?? 0) >= 1e-3
        || (resultById.get(wire.b)?.i_rms ?? 0) >= 1e-3;
      const strong = index === state?.selectedWire || index === hoverWire;
      if (strong) {
        strokeRuns(view.runs, COLOR.wireStrong, 4);
      } else if (live) {
        strokeRuns(view.runs, COLOR.wireLive, 2);
      } else {
        strokeRuns(view.runs, COLOR.wireIdle, 1.5);
      }
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
    const resultById = new Map(
      (state?.result?.terminals ?? []).map((terminal) => [terminal.id, terminal]),
    );
    const pending = state?.pendingTerminal;
    ctx.textBaseline = "middle";
    for (const device of devices) {
      const count = terminalCount(device.kind, device.aux);
      for (let index = 0; index < count; index += 1) {
        const geometry = terminalGeometry(device, index);
        const normal = edgeNormal(geometry.edge);
        const terminalId = device.terminal_base + index;
        const isPending = pending === terminalId;

        ctx.beginPath();
        ctx.arc(geometry.x, geometry.y, isPending ? 6 : TERMINAL_DOT_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = isPending ? COLOR.terminalPending : COLOR.terminal;
        ctx.fill();

        // 接点编号：沿边法向向外偏 6 px（§3.1）。
        const number = labelPoint(device, index);
        ctx.font = "9px system-ui, -apple-system, 'Segoe UI', sans-serif";
        ctx.textAlign = normal.dx < 0 ? "right" : normal.dx > 0 ? "left" : "center";
        ctx.textBaseline = normal.dy < 0 ? "bottom" : normal.dy > 0 ? "top" : "middle";
        haloText(geometry.name, number.x, number.y, COLOR.label);

        // 接点电压：标在接点另一侧（与编号相反方向），10 px（§6.1）。
        const terminalResult = resultById.get(terminalId);
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

  function drawPending() {
    const pending = state?.pendingTerminal;
    if (pending === null || pending === undefined) return;
    const terminal = layout.terminals.find((item) => item.id === pending);
    if (!terminal) return;
    const points = cursor.x >= 0
      ? previewPoints(terminal, cursor)
      : [{ x: terminal.x, y: terminal.y }, outwardPoint(terminal)];
    ctx.save();
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = COLOR.wirePreview;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  function drawHint(devices) {
    if (devices.length > 0) return;
    ctx.fillStyle = COLOR.hint;
    ctx.font = "16px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("白画布：从左侧器件面板点击放置器件", CANVAS.w / 2, CANVAS.h / 2 - 16);
    ctx.font = "12px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillText("点接点 A 再点接点 B 接线；点导线选中，Delete 删除；Esc 取消", CANVAS.w / 2, CANVAS.h / 2 + 12);
  }

  function noteWireChange() {
    const wires = state?.wires ?? [];
    if (lastWires && wires !== lastWires) {
      hoverWire = -1;
      if (wires.length === lastWires.length + 1) {
        flashIndex = wires.length - 1;
        flashUntil = performance.now() + WIRE_FLASH_MS;
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => {
          flashIndex = -1;
          paint();
        }, WIRE_FLASH_MS);
      }
    }
    lastWires = wires;
  }

  function paint() {
    resize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CANVAS.w, CANVAS.h);
    drawGrid();

    const devices = state?.devices ?? [];
    const dragState = state?.drag ?? null;
    const layoutDevices = devices.map((device) => deviceBox(device, dragState));
    layout = {
      devices: layoutDevices,
      terminals: buildTerminals(devices, dragState),
      boxes: layoutDevices.map(({ x, y, w, h }) => ({ x, y, w, h })),
    };

    buildWireViews();
    drawWires();
    for (const device of layout.devices) {
      drawDevice(device, dragState?.ref === device.ref);
    }
    drawTerminals(layout.devices);
    drawPending();
    drawHint(devices);
  }

  function render(nextState) {
    state = nextState;
    noteWireChange();
    paint();
  }

  paint();
  return { render };
}
