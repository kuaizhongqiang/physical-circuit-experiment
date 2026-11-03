// PcxNative.cs —— C ABI 的 1:1 映射。布局必须与 docs/api.md §2 逐字节一致。
// 改了这里的字段顺序或类型，必须同批改 docs/api.md 与 crates/cabi。

using System;
using System.Runtime.InteropServices;

namespace Pcx
{
    [StructLayout(LayoutKind.Sequential)]
    public unsafe struct PcxDevice
    {
        public fixed double Params[8];   // 0
        public uint Id;                  // 64
        public uint TerminalBase;        // 68
        public uint ElapsedMs;           // 72
        public uint Reserved0;           // 76
        public ushort StateBits;         // 80
        public ushort Rpm;               // 82
        public byte Kind;                // 84
        public byte ShaftGroup;          // 85
        public byte Aux;                 // 86
        public byte Flags;               // 87
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PcxWire
    {
        public uint A;
        public uint B;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PcxConfig
    {
        public double VLine;
        public double FreqHz;
        public double RSrc;
        public double RContact;
        public double ROpen;
        public double IOpenA;
        public double IOverA;
        public double Tol;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PcxInput
    {
        public IntPtr Devices;
        public uint DeviceCount;
        public IntPtr Wires;
        public uint WireCount;
        public IntPtr RequestedTerminals;
        public uint RequestedTerminalCount;
        public IntPtr RequestedDevices;
        public uint RequestedDeviceCount;
        public IntPtr Config;
        public uint Flags;
        public uint Reserved;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PcxTerminalResult
    {
        public uint TerminalId;
        public uint Flags;
        public double VRms;
        public double VPhaseDeg;
        public double IRms;
        public double IPhaseDeg;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PcxDeviceResult
    {
        public uint DeviceId;
        public ushort ClosedBits;
        public ushort Flags;
        public double CoilIRms;
        public double CoilIPhaseDeg;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PcxDiag
    {
        public uint Code;
        public uint Level;
        public uint DeviceId;
        public uint TerminalId;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PcxOutput
    {
        public IntPtr Terminals;
        public uint TerminalCap;
        public IntPtr Devices;
        public uint DeviceCap;
        public IntPtr Diags;
        public uint DiagCap;
        public uint TerminalCount;
        public uint DeviceCount;
        public uint DiagCount;
    }

    internal static class Native
    {
        private const string Lib = "pcx_circuit";

        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)]
        internal static extern uint pcx_abi_version();

        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)]
        internal static extern uint pcx_terminal_count(byte kind, byte aux);

        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)]
        internal static extern uint pcx_solve(ref PcxInput input, ref PcxOutput output);
    }
}
