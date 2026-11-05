// diag-text.js —— 诊断码 → 中文文案、分级与排序（纯数据 ＋ 纯函数，无 DOM）。
//
// 契约：
//   docs/playground.md §6.4  文案表沿用 demo.md §8；表外码显示「未知诊断码 N」
//   docs/api.md §5           返回码与诊断码枚举（中文只存在于绑定层）
//   docs/demo.md §8          中文文案
//
// 本文件不吞错误：返回码（10…50）与诊断码（100…103）都必须在表里能查到。

/** 诊断码 → 中文（docs/demo.md §8 ＋ docs/api.md §5）。 */
export const DIAG_TEXT = Object.freeze({
  0: "正常",
  10: "参数无效：空指针或输入字段矛盾",
  11: "未知器件类型",
  12: "器件 id 重复",
  13: "参数越界：负电阻、aux 越界等",
  14: "接点范围错误：terminal_base 与接点数不符，或导线端点越界",
  15: "接点总数超过上限 1024",
  16: "ABI 版本不匹配",
  20: "缺少接地参考点：请把 P1.N 接到 PE1（本演示电路需要这根线）",
  21: "接地参考点重复：一个电路只允许一个 PE",
  30: "矩阵奇异：多半是某处该接的线没接",
  31: "开关状态振荡：自锁回路无法稳定，请检查互锁",
  40: "短路：L1/L2/L3/N 之间经导线或闭合触点直接连通",
  50: "缓冲不足",
  100: "过流告警：某支路电流超过 50 A",
  101: "该通的支路没有电流：检查接点是否真的连通",
  102: "电路尚未接地，已临时以 P1.N 作参考（接上 PE 后此提示消失）",
  103: "有若干接点尚未接入任何回路（数值显示 0）",
});

const LEVEL_TEXT = Object.freeze({ 0: "info", 1: "warn", 2: "error" });
const LEVEL_CLASS = Object.freeze({ 0: "info", 1: "warn", 2: "error" });

/** 诊断码 → 中文；表外码按 docs/playground.md §6.4 显示「未知诊断码 N」，不静默吞掉。 */
export function diagText(code) {
  return DIAG_TEXT[code] ?? `未知诊断码 ${code}`;
}

export function diagLevelText(level) {
  return LEVEL_TEXT[level] ?? "info";
}

export function diagLevelClass(level) {
  return LEVEL_CLASS[level] ?? "info";
}

/**
 * 诊断栏排序（docs/playground.md §6.4）：error → warn → info，同级保持内核返回顺序。
 * `Array.prototype.sort` 在现代引擎里是稳定的；显式带原下标以便读代码的人确认。
 */
export function sortDiags(diags = []) {
  return [...diags]
    .map((diag, index) => ({ diag, index }))
    .sort((a, b) => {
      const level = (b.diag.level ?? 0) - (a.diag.level ?? 0);
      return level !== 0 ? level : a.index - b.index;
    })
    .map((item) => item.diag);
}
