//! 网表：器件 / 导线 / 配置，以及输入校验。契约见 `docs/domain-model.md` §1、`docs/api.md` §2。

use crate::consts;
use crate::kind::{self, Kind};

#[derive(Clone, Copy, Debug)]
pub struct Device {
    pub kind: Kind,
    pub id: u32,
    pub terminal_base: u32,
    pub params: [f64; 8],
    pub elapsed_ms: u32,
    pub state_bits: u16,
    pub rpm: u16,
    pub aux: u8,
    pub shaft_group: u8,
    pub flags: u8,
}

impl Device {
    pub fn terminal_count(&self) -> Option<u32> {
        kind::terminal_count(self.kind, self.aux)
    }
    pub fn given_by_app(&self) -> bool {
        self.flags & 1 != 0
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Wire {
    pub a: u32,
    pub b: u32,
}

#[derive(Clone, Copy, Debug)]
pub struct Config {
    pub v_line: f64,
    pub freq_hz: f64,
    pub r_src: f64,
    pub r_contact: f64,
    pub r_open: f64,
    pub i_open_a: f64,
    pub i_over_a: f64,
    pub tol: f64,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            v_line: consts::V_LINE,
            freq_hz: consts::FREQ_HZ,
            r_src: consts::R_SRC,
            r_contact: consts::R_CONTACT,
            r_open: consts::R_OPEN,
            i_open_a: consts::I_OPEN_A,
            i_over_a: consts::I_OVER_A,
            tol: consts::TOL,
        }
    }
}

impl Config {
    /// 三档覆盖的第二层：0 或负数视为"用缺省"
    pub fn with_overrides(mut self, o: &Config) -> Self {
        if o.v_line > 0.0 {
            self.v_line = o.v_line;
        }
        if o.freq_hz > 0.0 {
            self.freq_hz = o.freq_hz;
        }
        if o.r_src > 0.0 {
            self.r_src = o.r_src;
        }
        if o.r_contact > 0.0 {
            self.r_contact = o.r_contact;
        }
        if o.r_open > 0.0 {
            self.r_open = o.r_open;
        }
        if o.i_open_a > 0.0 {
            self.i_open_a = o.i_open_a;
        }
        if o.i_over_a > 0.0 {
            self.i_over_a = o.i_over_a;
        }
        if o.tol > 0.0 {
            self.tol = o.tol;
        }
        self
    }
    pub fn v_phase(&self) -> f64 {
        self.v_line / 3.0_f64.sqrt()
    }
}

#[derive(Clone, Debug, Default)]
pub struct Input {
    pub devices: Vec<Device>,
    pub wires: Vec<Wire>,
    pub config: Config,
    pub strict_reference: bool,
    pub requested_terminals: Option<Vec<u32>>,
    pub requested_devices: Option<Vec<u32>>,
}

/// 校验结果：`Ok(接点总数)` 或 `Err((错误码, 器件下标))`
pub fn validate(input: &Input) -> Result<usize, (u32, usize, u32)> {
    use crate::diag::*;

    let mut total: u32 = 0;
    let mut seen_ids: Vec<u32> = Vec::with_capacity(input.devices.len());
    for (i, d) in input.devices.iter().enumerate() {
        if seen_ids.contains(&d.id) {
            return Err((E_DUPLICATE_ID, i, 0xFFFF_FFFF));
        }
        seen_ids.push(d.id);

        let n = match d.terminal_count() {
            Some(n) => n,
            None => return Err((E_PARAM_RANGE, i, 0xFFFF_FFFF)),
        };
        if d.terminal_base != total {
            return Err((E_TERMINAL_RANGE, i, d.terminal_base));
        }
        total += n;
        if total as usize > consts::MAX_TERMINALS {
            return Err((E_TERMINAL_LIMIT, i, 0xFFFF_FFFF));
        }

        if let Err(t) = check_params(d) {
            return Err((E_PARAM_RANGE, i, t));
        }
    }

    for (i, w) in input.wires.iter().enumerate() {
        let _ = i;
        if w.a >= total || w.b >= total {
            return Err((E_TERMINAL_RANGE, 0xFFFF_FFFF_usize, w.a.min(w.b)));
        }
    }
    Ok(total as usize)
}

/// 参数检查，返回出问题的**局部接点序号**（用于定位），全部正常返回 Ok(())
fn check_params(d: &Device) -> Result<(), u32> {
    let p = &d.params;
    let positive = |v: f64| v > 0.0 && v.is_finite();
    let non_neg = |v: f64| v >= 0.0 && v.is_finite();
    for v in p.iter() {
        if !v.is_finite() {
            return Err(0xFFFF_FFFF);
        }
    }
    match d.kind {
        Kind::Power if (p[0] < 0.0 || p[1] < 0.0 || p[2] < 0.0) => {
            return Err(0);
        }
        Kind::Km | Kind::Ka | Kind::Kt => {
            if !positive(p[0]) || !non_neg(p[1]) {
                return Err(0);
            }
            if !positive(p[2]) || !positive(p[3]) {
                return Err(0);
            }
            if p[3] > p[2] {
                return Err(0); // 释放点必须低于吸合点
            }
        }
        Kind::Ks if (!positive(p[0]) || !positive(p[1]) || p[1] > p[0]) => {
            return Err(0);
        }
        Kind::Fr if (!positive(p[0]) || !positive(p[1])) => {
            return Err(0);
        }
        Kind::M if (!positive(p[0]) || !non_neg(p[1])) => {
            return Err(0);
        }
        Kind::R if !positive(p[0]) => {
            return Err(0);
        }
        Kind::El if (p[0] < 0.0 || p[1] < 0.0) => {
            return Err(0);
        }
        _ => {}
    }
    Ok(())
}
