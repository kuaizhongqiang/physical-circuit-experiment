// PcxCircuit.cs —— Unity 侧唯一入口（托管门面）。
// 只做三件事：把网表填进结构体、调 pcx_solve、把结果搬回托管对象。**不含任何电气规则**。

using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace Pcx
{
    /// <summary>器件类型编号，与 docs/domain-model.md §2 一致</summary>
    public static class Kinds
    {
        public const byte Power = 1, Qs = 2, Fu = 3, Km = 4, Ka = 5, Kt = 6, Ks = 7,
            Fr = 8, Sb = 9, Sq = 10, M = 11, R = 12, El = 13, Tb = 14, Pe = 15;
    }

    public sealed class DeviceSpec
    {
        public string Ref;
        public byte Kind;
        public uint Id;
        public byte Aux;
        public double[] Params = new double[8];
        public ushort StateBits;
        public byte Flags;
        public uint ElapsedMs;
        public ushort Rpm;
        public byte ShaftGroup;

        /// <summary>由 Solve 按前缀和填充，不要手写</summary>
        public uint TerminalBase;

        public uint TerminalCount() => Native.pcx_terminal_count(Kind, Aux);
    }

    public struct Wire
    {
        public uint A, B;
        public Wire(uint a, uint b) { A = a; B = b; }
    }

    public sealed class Netlist
    {
        public readonly List<DeviceSpec> Devices = new List<DeviceSpec>();
        public readonly List<Wire> Wires = new List<Wire>();
        /// <summary>true = 严格参考点（fixture / 正式用途）；false = 编辑中间态允许隐含参考</summary>
        public bool StrictReference = true;
        public double VLine = 380;
        public double FreqHz = 50;
    }

    public struct TerminalValue
    {
        public uint TerminalId, Flags;
        public double VRms, VPhaseDeg, IRms, IPhaseDeg;
        public bool HasI => (Flags & 2u) != 0;
        public bool Floating => (Flags & 4u) != 0;
    }

    public struct DeviceValue
    {
        public uint DeviceId;
        public ushort ClosedBits, Flags;
        public double CoilIRms, CoilIPhaseDeg;
        public bool Energized => (Flags & 1u) != 0;
    }

    public struct DiagValue
    {
        public uint Code, Level, DeviceId, TerminalId;
    }

    public sealed class SolveResult
    {
        public uint Code;
        public TerminalValue[] Terminals = Array.Empty<TerminalValue>();
        public DeviceValue[] Devices = Array.Empty<DeviceValue>();
        public DiagValue[] Diags = Array.Empty<DiagValue>();
        public bool Ok => Code == 0;

        /// <summary>按接点 id 取值；不存在返回 default</summary>
        public TerminalValue Terminal(uint id)
        {
            for (int i = 0; i < Terminals.Length; i++)
                if (Terminals[i].TerminalId == id) return Terminals[i];
            return default;
        }

        /// <summary>按器件 id 取值</summary>
        public DeviceValue Device(uint id)
        {
            for (int i = 0; i < Devices.Length; i++)
                if (Devices[i].DeviceId == id) return Devices[i];
            return default;
        }
    }

    public static class Pcx
    {
        public const uint AbiVersion = 1;
        private static bool _checked;

        /// <summary>首次调用前执行：校验 ABI 版本与结构体布局（防"两端布局悄悄漂移"）</summary>
        public static void Initialize()
        {
            if (_checked) return;
            AssertSize<PcxDevice>(88, "PcxDevice");
            AssertSize<PcxTerminalResult>(40, "PcxTerminalResult");
            AssertSize<PcxDeviceResult>(24, "PcxDeviceResult");
            AssertSize<PcxDiag>(16, "PcxDiag");
            AssertSize<PcxWire>(8, "PcxWire");
            AssertSize<PcxConfig>(64, "PcxConfig");
            uint v = Native.pcx_abi_version();
            if (v != AbiVersion)
                throw new InvalidOperationException($"ABI 版本不匹配：native {v} / 绑定 {AbiVersion}");
            _checked = true;
        }

        private static void AssertSize<T>(int expect, string name)
        {
            int got = Marshal.SizeOf<T>();
            if (got != expect)
                throw new InvalidOperationException($"{name} 布局不一致：{got} 字节，应为 {expect}（见 docs/api.md §2）");
        }

        public static uint TerminalCount(byte kind, byte aux) => Native.pcx_terminal_count(kind, aux);

        /// <summary>一次求解。返回码见 <see cref="ErrorText.Of"/>。</summary>
        public static unsafe SolveResult Solve(Netlist netlist)
        {
            Initialize();
            if (netlist == null) throw new ArgumentNullException(nameof(netlist));

            uint acc = 0;
            foreach (var d in netlist.Devices)
            {
                uint n = d.TerminalCount();
                if (n == 0) throw new ArgumentException($"器件 {d.Ref} 的 kind={d.Kind} / aux={d.Aux} 非法");
                d.TerminalBase = acc;
                acc += n;
            }

            int nd = netlist.Devices.Count;
            int nw = netlist.Wires.Count;
            int devSize = sizeof(PcxDevice);

            IntPtr devBuf = Marshal.AllocHGlobal(devSize * Math.Max(nd, 1));
            IntPtr wireBuf = Marshal.AllocHGlobal(sizeof(PcxWire) * Math.Max(nw, 1));
            IntPtr cfgBuf = Marshal.AllocHGlobal(sizeof(PcxConfig));
            IntPtr termBuf = IntPtr.Zero, devResBuf = IntPtr.Zero, diagBuf = IntPtr.Zero;

            try
            {
                byte* p = (byte*)devBuf;
                for (int i = 0; i < nd; i++)
                {
                    var s = netlist.Devices[i];
                    var d = (PcxDevice*)(p + i * devSize);
                    for (int k = 0; k < 8; k++) d->Params[k] = s.Params[k];
                    d->Id = s.Id;
                    d->TerminalBase = s.TerminalBase;
                    d->ElapsedMs = s.ElapsedMs;
                    d->Reserved0 = 0;
                    d->StateBits = s.StateBits;
                    d->Rpm = s.Rpm;
                    d->Kind = s.Kind;
                    d->ShaftGroup = s.ShaftGroup;
                    d->Aux = s.Aux;
                    d->Flags = s.Flags;
                }

                var w = (PcxWire*)wireBuf;
                for (int i = 0; i < nw; i++)
                {
                    w[i].A = netlist.Wires[i].A;
                    w[i].B = netlist.Wires[i].B;
                }

                var cfg = new PcxConfig
                {
                    VLine = netlist.VLine,
                    FreqHz = netlist.FreqHz,
                    RSrc = 0,
                    RContact = 0,
                    ROpen = 0,
                    IOpenA = 0,
                    IOverA = 0,
                    Tol = 0,
                };
                Marshal.StructureToPtr(cfg, cfgBuf, false);

                var input = new PcxInput
                {
                    Devices = devBuf,
                    DeviceCount = (uint)nd,
                    Wires = wireBuf,
                    WireCount = (uint)nw,
                    Config = cfgBuf,
                    Flags = netlist.StrictReference ? 1u : 0u,
                    Reserved = 0,
                };

                var output = new PcxOutput();
                uint rc = Native.pcx_solve(ref input, ref output);   // 第一段：取数量
                if (rc != 1 && rc != 0)
                    return new SolveResult { Code = rc };

                int tc = (int)output.TerminalCount;
                int dc = (int)output.DeviceCount;
                int gc = (int)output.DiagCount;

                termBuf = Marshal.AllocHGlobal(sizeof(PcxTerminalResult) * Math.Max(tc, 1));
                devResBuf = Marshal.AllocHGlobal(sizeof(PcxDeviceResult) * Math.Max(dc, 1));
                diagBuf = Marshal.AllocHGlobal(sizeof(PcxDiag) * Math.Max(gc, 1));

                output.Terminals = termBuf;
                output.TerminalCap = (uint)tc;
                output.Devices = devResBuf;
                output.DeviceCap = (uint)dc;
                output.Diags = diagBuf;
                output.DiagCap = (uint)gc;

                rc = Native.pcx_solve(ref input, ref output);        // 第二段：填结果

                var res = new SolveResult
                {
                    Code = rc,
                    Terminals = new TerminalValue[tc],
                    Devices = new DeviceValue[dc],
                    Diags = new DiagValue[gc],
                };

                var tp = (PcxTerminalResult*)termBuf;
                for (int i = 0; i < tc; i++)
                {
                    res.Terminals[i] = new TerminalValue
                    {
                        TerminalId = tp[i].TerminalId,
                        Flags = tp[i].Flags,
                        VRms = tp[i].VRms,
                        VPhaseDeg = tp[i].VPhaseDeg,
                        IRms = tp[i].IRms,
                        IPhaseDeg = tp[i].IPhaseDeg,
                    };
                }

                var dp = (PcxDeviceResult*)devResBuf;
                for (int i = 0; i < dc; i++)
                {
                    res.Devices[i] = new DeviceValue
                    {
                        DeviceId = dp[i].DeviceId,
                        ClosedBits = dp[i].ClosedBits,
                        Flags = dp[i].Flags,
                        CoilIRms = dp[i].CoilIRms,
                        CoilIPhaseDeg = dp[i].CoilIPhaseDeg,
                    };
                }

                var gp = (PcxDiag*)diagBuf;
                for (int i = 0; i < gc; i++)
                {
                    res.Diags[i] = new DiagValue
                    {
                        Code = gp[i].Code,
                        Level = gp[i].Level,
                        DeviceId = gp[i].DeviceId,
                        TerminalId = gp[i].TerminalId,
                    };
                }

                return res;
            }
            finally
            {
                if (devBuf != IntPtr.Zero) Marshal.FreeHGlobal(devBuf);
                if (wireBuf != IntPtr.Zero) Marshal.FreeHGlobal(wireBuf);
                if (cfgBuf != IntPtr.Zero) Marshal.FreeHGlobal(cfgBuf);
                if (termBuf != IntPtr.Zero) Marshal.FreeHGlobal(termBuf);
                if (devResBuf != IntPtr.Zero) Marshal.FreeHGlobal(devResBuf);
                if (diagBuf != IntPtr.Zero) Marshal.FreeHGlobal(diagBuf);
            }
        }
    }
}
