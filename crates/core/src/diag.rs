//! 错误码与诊断。码表见 `docs/api.md` §5；**中文文案不进内核**。

pub const OK: u32 = 0;
pub const NEED_BUFFERS: u32 = 1;

pub const E_INVALID_ARG: u32 = 10;
pub const E_UNKNOWN_KIND: u32 = 11;
pub const E_DUPLICATE_ID: u32 = 12;
pub const E_PARAM_RANGE: u32 = 13;
pub const E_TERMINAL_RANGE: u32 = 14;
pub const E_TERMINAL_LIMIT: u32 = 15;
pub const E_VERSION: u32 = 16;
pub const E_NO_REFERENCE: u32 = 20;
pub const E_MULTI_REFERENCE: u32 = 21;
pub const E_SINGULAR: u32 = 30;
pub const E_OSCILLATION: u32 = 31;
pub const E_SHORT: u32 = 40;
pub const E_BUFFER_SMALL: u32 = 50;

pub const W_OVERCURRENT: u32 = 100;
pub const W_OPEN_CIRCUIT: u32 = 101;
pub const W_IMPLICIT_REFERENCE: u32 = 102;
pub const W_ISOLATED_IGNORED: u32 = 103;

pub const LV_INFO: u8 = 0;
pub const LV_WARN: u8 = 1;
pub const LV_ERROR: u8 = 2;

pub const NO_ID: u32 = 0xFFFF_FFFF;

#[derive(Clone, Copy, Debug)]
pub struct Diag {
    pub code: u32,
    pub level: u8,
    pub device_id: u32,
    pub terminal_id: u32,
}

impl Diag {
    pub fn error(code: u32, device_id: u32, terminal_id: u32) -> Self {
        Diag {
            code,
            level: LV_ERROR,
            device_id,
            terminal_id,
        }
    }
    pub fn warn(code: u32, device_id: u32, terminal_id: u32) -> Self {
        Diag {
            code,
            level: LV_WARN,
            device_id,
            terminal_id,
        }
    }
    pub fn info(code: u32, device_id: u32, terminal_id: u32) -> Self {
        Diag {
            code,
            level: LV_INFO,
            device_id,
            terminal_id,
        }
    }
}
