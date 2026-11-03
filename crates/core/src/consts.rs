//! 数值口径常量表。编号与 `docs/solver.md` §5 的 `N-xx` 一一对应，改值必须同批改文档。

/// `N-02` 触点 / 端子接触电阻
pub const R_CONTACT: f64 = 1e-3;
/// `N-03` 断开等效电阻（含"空气电阻"）
pub const R_OPEN: f64 = 1e9;
/// `N-04` 开路判定阈值（A）
pub const I_OPEN_A: f64 = 1e-3;
/// `N-05` 过流告警阈值（A）
pub const I_OVER_A: f64 = 50.0;
/// `N-07` 线性求解相对残差上限
pub const TOL: f64 = 1e-10;
/// `N-08` 主元阈值系数
pub const PIVOT_EPS: f64 = 1e-14;
/// `N-09` 开关迭代上限
pub const MAX_ITER: u32 = 100;
/// `N-10` 默认线电压
pub const V_LINE: f64 = 380.0;
/// `N-10` 默认频率
pub const FREQ_HZ: f64 = 50.0;
/// 电源内阻
pub const R_SRC: f64 = 1e-3;
/// 接点总数上限
pub const MAX_TERMINALS: usize = 1024;
/// `KT` 默认延时
pub const KT_DELAY_MS: f64 = 3000.0;
/// `FR` 整定电流与延时缺省
pub const FR_SET_A: f64 = 6.0;
pub const FR_DELAY_MS: f64 = 5000.0;
/// `KS` 缺省动作 / 释放转速
pub const KS_N_PICK: f64 = 120.0;
pub const KS_N_DROP: f64 = 100.0;
/// 线圈缺省参数
pub const COIL_R: f64 = 12000.0;
pub const COIL_X: f64 = 8000.0;
pub const COIL_PICK_A: f64 = 0.02;
pub const COIL_DROP_A: f64 = 0.012;
/// 电感机缺省每相参数
pub const MOTOR_R: f64 = 40.0;
pub const MOTOR_X: f64 = 18.0;
pub const MOTOR_R2: f64 = 25.0;
pub const MOTOR_X2: f64 = 12.0;
