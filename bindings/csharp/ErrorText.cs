// ErrorText.cs —— 错误码 → 中文。文案只存在于绑定层（内核只回码）。

using System.Collections.Generic;

namespace Pcx
{
    public static class ErrorText
    {
        private static readonly Dictionary<uint, string> Map = new Dictionary<uint, string>
        {
            { 0, "正常" },
            { 1, "需要先取结果数量" },
            { 10, "参数非法：空指针或保留字段非 0" },
            { 11, "未知器件类型" },
            { 12, "器件 id 重复" },
            { 13, "参数越界（电阻/电流为负等）" },
            { 14, "接点编号不一致：terminal_base 与接点数前缀和不符" },
            { 15, "接点总数超过上限" },
            { 16, "ABI 版本不匹配" },
            { 20, "缺少接地参考点：请接一个 PE 并接到电源中性点" },
            { 21, "接地参考点重复：一个电路只允许一个 PE" },
            { 30, "矩阵奇异：多半是某处该接的线没接" },
            { 31, "开关状态振荡：自锁/互锁回路无法稳定" },
            { 40, "短路：相与相（或相与中性线）之间被导线或闭合触点直接连通" },
            { 50, "缓冲不足" },
            { 100, "过流告警：某支路电流超过阈值" },
            { 101, "该通的支路没有电流：检查接点是否真的连通" },
            { 102, "电路尚未接地，已临时以电源中性点作参考" },
            { 103, "有若干接点尚未接入任何回路（数值显示 0）" },
        };

        public static string Of(uint code)
        {
            return Map.TryGetValue(code, out var s) ? s : $"未知错误码 {code}";
        }
    }
}
