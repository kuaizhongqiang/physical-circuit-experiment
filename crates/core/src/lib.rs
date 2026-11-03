//! `pcx-core` —— 电力拖动电路计算内核。
//!
//! 边界（`AGENT.md` §2）：不读时钟 / 文件 / 环境变量，不打印，无 `unsafe`，无全局可变状态。
//! 契约见 `docs/api.md`、`docs/domain-model.md`、`docs/solver.md`。

pub mod complex;
pub mod consts;
pub mod device;
pub mod diag;
pub mod json;
pub mod kind;
pub mod mna;
pub mod netlist;
pub mod solver;
pub mod union;

pub use kind::Kind;
pub use netlist::{Config, Device, Input, Wire};
pub use solver::{solve, DeviceResult, Output, TerminalResult};

/// 与 C# / TS 绑定层比对的 ABI 版本（`docs/api.md` §6）
pub const ABI_VERSION: u32 = 1;
/// 语义版本
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// 接点数查询（与 `kind::terminal_count` 一致；非法参数返回 0）
pub fn terminal_count(kind_u8: u8, aux: u8) -> u32 {
    match Kind::from_u8(kind_u8) {
        Some(k) => kind::terminal_count(k, aux).unwrap_or(0),
        None => 0,
    }
}

/// 便捷入口：一次求解（`Input` → `Output`）
pub fn solve_once(input: &Input) -> Output {
    solver::solve(input)
}
