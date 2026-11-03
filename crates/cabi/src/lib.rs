//! `pcx_circuit` C ABI。契约见 `docs/api.md` §2 / §4。
//!
//! 边界纪律：本 crate 只做「结构体 ↔ 内核类型」翻译与缓冲校验，
//! **不含任何电气规则**；`unsafe` 仅出现在这里且每处带 SAFETY 说明。

use std::os::raw::c_char;

use pcx_core::diag;
use pcx_core::solver;
use pcx_core::{kind, Kind};
use pcx_core::{Config, Device, Input, Wire};

pub const ABI_VERSION: u32 = 1;

#[repr(C)]
#[derive(Clone, Copy)]
pub struct PcxDevice {
    pub params: [f64; 8],
    pub id: u32,
    pub terminal_base: u32,
    pub elapsed_ms: u32,
    pub reserved0: u32,
    pub state_bits: u16,
    pub rpm: u16,
    pub kind: u8,
    pub shaft_group: u8,
    pub aux: u8,
    pub flags: u8,
}

#[repr(C)]
#[derive(Clone, Copy)]
pub struct PcxWire {
    pub a: u32,
    pub b: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
pub struct PcxConfig {
    pub v_line: f64,
    pub freq_hz: f64,
    pub r_src: f64,
    pub r_contact: f64,
    pub r_open: f64,
    pub i_open_a: f64,
    pub i_over_a: f64,
    pub tol: f64,
}

#[repr(C)]
pub struct PcxInput {
    pub devices: *const PcxDevice,
    pub device_count: u32,
    pub wires: *const PcxWire,
    pub wire_count: u32,
    pub requested_terminals: *const u32,
    pub requested_terminal_count: u32,
    pub requested_devices: *const u32,
    pub requested_device_count: u32,
    pub config: *const PcxConfig,
    pub flags: u32,
    pub reserved: u32,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct PcxTerminalResult {
    pub terminal_id: u32,
    pub flags: u32,
    pub v_rms: f64,
    pub v_phase_deg: f64,
    pub i_rms: f64,
    pub i_phase_deg: f64,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct PcxDeviceResult {
    pub device_id: u32,
    pub closed_bits: u16,
    pub flags: u16,
    pub coil_i_rms: f64,
    pub coil_i_phase_deg: f64,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct PcxDiag {
    pub code: u32,
    pub level: u32,
    pub device_id: u32,
    pub terminal_id: u32,
}

#[repr(C)]
pub struct PcxOutput {
    pub terminals: *mut PcxTerminalResult,
    pub terminal_cap: u32,
    pub devices: *mut PcxDeviceResult,
    pub device_cap: u32,
    pub diags: *mut PcxDiag,
    pub diag_cap: u32,
    pub terminal_count: u32,
    pub device_count: u32,
    pub diag_count: u32,
}

static VERSION_C: &[u8] = b"0.1.0\0";

#[no_mangle]
pub extern "C" fn pcx_abi_version() -> u32 {
    ABI_VERSION
}

#[no_mangle]
pub extern "C" fn pcx_version() -> *const c_char {
    VERSION_C.as_ptr() as *const c_char
}

#[no_mangle]
pub extern "C" fn pcx_terminal_count(kind_u8: u8, aux: u8) -> u32 {
    match Kind::from_u8(kind_u8) {
        Some(k) => kind::terminal_count(k, aux).unwrap_or(0),
        None => 0,
    }
}

/// 一次求解。返回 `docs/api.md` §5 的码表值。
///
/// 两阶段调用：缓冲传 NULL / cap=0 → 返回 `NEED_BUFFERS(1)` 且 `*_count` 已填；
/// 容量不足 → `E_BUFFER_TOO_SMALL(50)`。
///
/// # Safety
/// - `inp` / `out` 必须指向有效的、可读写对应结构体的内存；
/// - `inp.devices` / `wires` / `requested_*` 若计数非 0，必须指向相应长度的连续数组；
/// - 两阶段调用的第二段中，`out.*` 的缓冲指针必须指向容量不小于 `*_count` 的可写内存。
#[no_mangle]
pub unsafe extern "C" fn pcx_solve(inp: *const PcxInput, out: *mut PcxOutput) -> u32 {
    if inp.is_null() || out.is_null() {
        return diag::E_INVALID_ARG;
    }
    // SAFETY: 调用方保证指针有效；下面逐字段读取前先判长度与空指针
    let i = &*inp;
    let o = &mut *out;
    if i.reserved != 0 {
        return diag::E_INVALID_ARG;
    }

    let mut input = Input {
        strict_reference: i.flags & 1 != 0,
        ..Default::default()
    };

    if i.device_count > 0 {
        if i.devices.is_null() {
            return diag::E_INVALID_ARG;
        }
        // SAFETY: 由调用方保证 devices 指向 device_count 个 PcxDevice
        let slice = std::slice::from_raw_parts(i.devices, i.device_count as usize);
        for d in slice {
            let k = match Kind::from_u8(d.kind) {
                Some(k) => k,
                None => return diag::E_UNKNOWN_KIND,
            };
            if d.reserved0 != 0 {
                return diag::E_INVALID_ARG;
            }
            input.devices.push(Device {
                kind: k,
                id: d.id,
                terminal_base: d.terminal_base,
                params: d.params,
                elapsed_ms: d.elapsed_ms,
                state_bits: d.state_bits,
                rpm: d.rpm,
                aux: d.aux,
                shaft_group: d.shaft_group,
                flags: d.flags,
            });
        }
    }
    if i.wire_count > 0 {
        if i.wires.is_null() {
            return diag::E_INVALID_ARG;
        }
        // SAFETY: 同上，wire_count 个 PcxWire
        let slice = std::slice::from_raw_parts(i.wires, i.wire_count as usize);
        for w in slice {
            input.wires.push(Wire { a: w.a, b: w.b });
        }
    }
    if i.requested_terminal_count > 0 {
        if i.requested_terminals.is_null() {
            return diag::E_INVALID_ARG;
        }
        // SAFETY: requested_terminal_count 个 u32
        let slice =
            std::slice::from_raw_parts(i.requested_terminals, i.requested_terminal_count as usize);
        input.requested_terminals = Some(slice.to_vec());
    }
    if i.requested_device_count > 0 {
        if i.requested_devices.is_null() {
            return diag::E_INVALID_ARG;
        }
        // SAFETY: requested_device_count 个 u32
        let slice =
            std::slice::from_raw_parts(i.requested_devices, i.requested_device_count as usize);
        input.requested_devices = Some(slice.to_vec());
    }
    if !i.config.is_null() {
        // SAFETY: 单个 PcxConfig
        let c = &*i.config;
        input.config = Config::default().with_overrides(&Config {
            v_line: c.v_line,
            freq_hz: c.freq_hz,
            r_src: c.r_src,
            r_contact: c.r_contact,
            r_open: c.r_open,
            i_open_a: c.i_open_a,
            i_over_a: c.i_over_a,
            tol: c.tol,
        });
    }

    let res = solver::solve(&input);

    o.terminal_count = res.terminals.len() as u32;
    o.device_count = res.devices.len() as u32;
    o.diag_count = res.diags.len() as u32;

    let need_t = o.terminals.is_null() || o.terminal_cap < o.terminal_count;
    let need_d = o.devices.is_null() || o.device_cap < o.device_count;
    let need_g = o.diags.is_null() || o.diag_cap < o.diag_count;
    if need_t || need_d || need_g {
        let all_zero = o.terminal_cap == 0 && o.device_cap == 0 && o.diag_cap == 0;
        return if all_zero {
            diag::NEED_BUFFERS
        } else {
            diag::E_BUFFER_SMALL
        };
    }

    // SAFETY: 容量已逐个校验过，按 *_count 写入不越界
    let ts = std::slice::from_raw_parts_mut(o.terminals, o.terminal_count as usize);
    for (dst, s) in ts.iter_mut().zip(res.terminals.iter()) {
        *dst = PcxTerminalResult {
            terminal_id: s.terminal_id,
            flags: s.flags,
            v_rms: s.v_rms,
            v_phase_deg: s.v_deg,
            i_rms: s.i_rms,
            i_phase_deg: s.i_deg,
        };
    }
    let ds = std::slice::from_raw_parts_mut(o.devices, o.device_count as usize);
    for (dst, s) in ds.iter_mut().zip(res.devices.iter()) {
        *dst = PcxDeviceResult {
            device_id: s.device_id,
            closed_bits: s.closed_bits,
            flags: s.flags,
            coil_i_rms: s.coil_i_rms,
            coil_i_phase_deg: s.coil_i_deg,
        };
    }
    let gs = std::slice::from_raw_parts_mut(o.diags, o.diag_count as usize);
    for (dst, s) in gs.iter_mut().zip(res.diags.iter()) {
        *dst = PcxDiag {
            code: s.code,
            level: s.level as u32,
            device_id: s.device_id,
            terminal_id: s.terminal_id,
        };
    }

    res.code
}

#[cfg(test)]
mod layout_tests {
    use super::*;
    use std::mem::size_of;

    #[test]
    fn sizes_match_api_md() {
        assert_eq!(size_of::<PcxDevice>(), 88, "pcx_device_t 必须是 88 字节");
        assert_eq!(size_of::<PcxWire>(), 8);
        assert_eq!(size_of::<PcxConfig>(), 64);
        assert_eq!(size_of::<PcxTerminalResult>(), 40);
        assert_eq!(size_of::<PcxDeviceResult>(), 24);
        assert_eq!(size_of::<PcxDiag>(), 16);
    }

    #[test]
    fn device_offsets_match_api_md() {
        let d = PcxDevice {
            params: [0.0; 8],
            id: 0,
            terminal_base: 0,
            elapsed_ms: 0,
            reserved0: 0,
            state_bits: 0,
            rpm: 0,
            kind: 0,
            shaft_group: 0,
            aux: 0,
            flags: 0,
        };
        let p = &d as *const _ as usize;
        assert_eq!(&d.params as *const _ as usize - p, 0);
        assert_eq!(&d.id as *const _ as usize - p, 64);
        assert_eq!(&d.terminal_base as *const _ as usize - p, 68);
        assert_eq!(&d.elapsed_ms as *const _ as usize - p, 72);
        assert_eq!(&d.state_bits as *const _ as usize - p, 80);
        assert_eq!(&d.rpm as *const _ as usize - p, 82);
        assert_eq!(&d.kind as *const _ as usize - p, 84);
    }
}
