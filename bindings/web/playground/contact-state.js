// contact-state.js —— 触点状态显示的唯一数据源：最近一次 solve 的 result.closed_bits。
//
// 契约：
//   issue #61：属性面板 / 接点表的「触点闭合 / 断开」一律读 result.closed_bits；
//   docs/playground.md §5.4：solve 成功后把 closed_bits 回写 state_bits 作为下一轮提示；
//   docs/api.md §3：第 k 位 = 第 k 条触点闭合（位序按 stateBitsFor）。
//
// 只有「尚未求解」——result 缺失，或 result 里没有该器件的结果——才回退到提示值
// device.state_bits，并由 UI 标注「未求解」，不能让人误以为是求解结果。
// 本文件只做位查询与文案，不写任何电气规则。

import { stateBitsFor } from "./device-catalog.js";

/** 未求解时统一使用的标注。 */
export const UNSOLVED_LABEL = "未求解";

/** 从一次 solve 结果里取某器件的结果；没有就返回 null。 */
export function resultForDevice(result, device) {
  if (!result || !Array.isArray(result.devices) || !device) return null;
  return result.devices.find((item) => item.id === device.id) ?? null;
}

/**
 * 某器件全部可变触点的显示状态。
 * @returns {{ solved: boolean, source: "solve"|"hint", bits: number,
 *   contacts: Array<{ bit: number, terminals: string[], closed: boolean }> }}
 */
export function contactStates(device, result) {
  const deviceResult = resultForDevice(result, device);
  const solved = Boolean(deviceResult) && Number.isInteger(deviceResult.closed_bits);
  const bits = solved ? deviceResult.closed_bits : (device.state_bits ?? 0);
  return {
    solved,
    source: solved ? "solve" : "hint",
    bits,
    contacts: stateBitsFor(device.kind, device.aux).map((definition) => ({
      ...definition,
      closed: (bits & (1 << definition.bit)) !== 0,
    })),
  };
}

/** SB / SQ 的 type 只暴露实际存在的那一组触点（docs/playground.md §7.1）。 */
function visibleContacts(device, contacts) {
  if (device.kind !== "SB" && device.kind !== "SQ") return contacts;
  const type = device.aux ?? 0;
  if (type === 1) return contacts.filter((item) => item.bit === 0);
  if (type === 2) return contacts.filter((item) => item.bit === 1);
  return contacts;
}

/**
 * 「当前状态 → 触点」一行文案。
 * 已求解：只由 result.closed_bits 决定；未求解：回退提示值并显式带「未求解」。
 */
export function contactSummary(device, result) {
  const { solved, contacts } = contactStates(device, result);
  const visible = visibleContacts(device, contacts);
  if (visible.length === 0) return "无可变触点";
  const text = visible
    .map((item) => `${item.terminals.join("-")} ${item.closed ? "闭合" : "断开"}`)
    .join(" · ");
  return solved ? text : `${UNSOLVED_LABEL}（提示值） ${text}`;
}
