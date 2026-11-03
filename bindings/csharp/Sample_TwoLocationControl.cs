// Sample_TwoLocationControl.cs —— C3 两地控制（双开双控）样例。
// 纯 C#，不依赖 UnityEngine：Unity 里把 Console.WriteLine 换成 Debug.Log，
// 并在 Update 里按固定 10ms 累加器调用 StepOnce（见 docs/integration.md §2）。

using System;

namespace Pcx.Samples
{
    public static class TwoLocationControl
    {
        // ── 位号（与 fixtures/C3.json 完全一致）──
        private const uint P1 = 1, QS1 = 2, FU1 = 3, FU2 = 4, FU3 = 5, FR1 = 6,
            KM1 = 7, M1 = 8, PE1 = 9, FU4 = 10, FU5 = 11, SB1 = 12, SB2 = 13, SB3 = 14, SB4 = 15;

        public static Netlist Build()
        {
            var n = new Netlist { VLine = 380, FreqHz = 50, StrictReference = true };

            Add(n, "P1", Kinds.Power, P1, 0, 380, 50, 0.001, 1);
            Add(n, "QS1", Kinds.Qs, QS1, 3, 0.001).StateBits = 0b111; // 三极闭合
            Add(n, "FU1", Kinds.Fu, FU1, 0, 0.001);
            Add(n, "FU2", Kinds.Fu, FU2, 0, 0.001);
            Add(n, "FU3", Kinds.Fu, FU3, 0, 0.001);
            Add(n, "FR1", Kinds.Fr, FR1, 0, 0.001, 6, 5000, 0.001);
            Add(n, "KM1", Kinds.Km, KM1, 5, 12000, 8000, 0.02, 0.012, 0.001);
            Add(n, "M1", Kinds.M, M1, 0, 40, 18);
            Add(n, "PE1", Kinds.Pe, PE1, 0);
            Add(n, "FU4", Kinds.Fu, FU4, 0, 0.001);
            Add(n, "FU5", Kinds.Fu, FU5, 0, 0.001);
            Add(n, "SB1", Kinds.Sb, SB1, 1, 0.001).StateBits = 0b1;   // 常闭
            Add(n, "SB2", Kinds.Sb, SB2, 2, 0.001);                    // 常开
            Add(n, "SB3", Kinds.Sb, SB3, 1, 0.001).StateBits = 0b1;
            Add(n, "SB4", Kinds.Sb, SB4, 2, 0.001);

            // 主回路
            W(n, 0, 4); W(n, 1, 5); W(n, 2, 6);            // L1/L2/L3 → QS1
            W(n, 7, 10); W(n, 8, 12); W(n, 9, 14);          // QS1 → FU1-3
            W(n, 11, 16); W(n, 13, 18); W(n, 15, 20);       // FU → FR 热元件
            W(n, 17, 28); W(n, 19, 30); W(n, 21, 32);       // FR → KM1 主触点
            W(n, 29, 38); W(n, 31, 39); W(n, 33, 40);       // KM1 → 定子
            W(n, 41, 42); W(n, 42, 43);                     // 星点 U2-V2-W2
            W(n, 3, 44);                                    // N → PE（参考点）
            // 控制回路
            W(n, 0, 45);                                    // L1 → FU4
            W(n, 46, 49);                                   // FU4 → SB1
            W(n, 50, 57);                                   // SB1 → SB3（两处停止串联）
            W(n, 58, 55); W(n, 58, 63); W(n, 58, 34);       // X 节点 → SB2/SB4/自锁
            W(n, 56, 22); W(n, 64, 22); W(n, 35, 22);       // Y 节点 → FR95
            W(n, 23, 26);                                   // FR96 → KM1.A1
            W(n, 27, 47);                                   // KM1.A2 → FU5
            W(n, 48, 1);                                    // FU5 → L2
            return n;
        }

        private static DeviceSpec Add(Netlist n, string reference, byte kind, uint id, byte aux, params double[] p)
        {
            var d = new DeviceSpec { Ref = reference, Kind = kind, Id = id, Aux = aux, Flags = 1 };
            for (int i = 0; i < p.Length && i < 8; i++) d.Params[i] = p[i];
            n.Devices.Add(d);
            return d;
        }

        private static void W(Netlist n, uint a, uint b) => n.Wires.Add(new Wire(a, b));

        private static uint T(Netlist n, uint deviceId, int local)
        {
            var d = n.Devices.Find(x => x.Id == deviceId);
            return d.TerminalBase + (uint)local;
        }

        /// <summary>演示：初始 → 按 SB2 → 松手（自锁）→ 按 SB3 停止</summary>
        public static void Run()
        {
            var n = Build();
            var km = n.Devices.Find(x => x.Id == KM1);
            var sb2 = n.Devices.Find(x => x.Id == SB2);
            var sb3 = n.Devices.Find(x => x.Id == SB3);
            uint u1 = T(n, M1, 0);

            Report("① 初始（未动作）", Pcx.Solve(n), u1, KM1);

            sb2.StateBits = 0b10;                                    // 地点 1 按下（常开闭合）
            var r2 = Pcx.Solve(n);
            Report("② 地点1 按 SB2", r2, u1, KM1);
            km.StateBits = r2.Device(KM1).ClosedBits;                // 松手后把触点状态作为提示传回
            km.Flags = 0;

            sb2.StateBits = 0b00;                                    // 松手
            Report("③ 松开 SB2（自锁维持）", Pcx.Solve(n), u1, KM1);

            sb3.StateBits = 0b00;                                    // 地点 2 停止（常开断开常闭）
            Report("④ 地点2 按 SB3（停止）", Pcx.Solve(n), u1, KM1);
        }

        private static void Report(string title, SolveResult r, uint u1, uint kmId)
        {
            Console.WriteLine($"— {title}");
            if (!r.Ok)
            {
                Console.WriteLine($"   失败：{ErrorText.Of(r.Code)}（{r.Code}）");
                return;
            }
            var t = r.Terminal(u1);
            var k = r.Device(kmId);
            Console.WriteLine($"   M1.U1: {t.VRms:F1} V / {t.IRms * 1000:F2} mA");
            Console.WriteLine($"   KM1 线圈: {k.CoilIRms * 1000:F2} mA，{(k.Energized ? "吸合" : "释放")}，触点 0b{Convert.ToString(k.ClosedBits, 2).PadLeft(5, '0')}");
        }
    }
}
