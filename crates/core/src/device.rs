//! 器件展开：接点 → 支路。契约见 `docs/domain-model.md` §2、`docs/solver.md` §6。

use crate::complex::{C, ZERO};
use crate::kind::{self, Kind, Pol};
use crate::netlist::{Config, Device, Input};

#[derive(Clone, Copy, Debug)]
pub struct Branch {
    pub a: u32,
    pub b: u32,
    pub y: C,
    pub i: C,
    pub conductive: bool,
    pub dev: usize,
}

#[derive(Clone, Debug, Default)]
pub struct Expansion {
    pub branches: Vec<Branch>,
    /// 每个全局接点 → (支路下标, 极性 +1 = 支路 a 端)
    pub term_branch: Vec<Option<(u32, i8)>>,
    /// 每台器件的线圈支路
    pub coil: Vec<Option<u32>>,
    /// `FR` 三相热元件支路
    pub thermal: Vec<Vec<u32>>,
    /// `M` 三相绕组支路
    pub motor: Vec<Vec<u32>>,
    /// `POWER` 的 L1/L2/L3/N 等势点
    pub power_nodes: Vec<Option<[u32; 4]>>,
}

/// 每台器件的触点个数
pub fn contact_counts(input: &Input) -> Vec<usize> {
    input
        .devices
        .iter()
        .map(|d| kind::contacts(d.kind, d.aux).len())
        .collect()
}

pub fn slot_offsets(counts: &[usize]) -> (Vec<usize>, usize) {
    let mut off = Vec::with_capacity(counts.len());
    let mut acc = 0usize;
    for c in counts {
        off.push(acc);
        acc += c;
    }
    (off, acc)
}

fn default_closed(pol: Pol) -> bool {
    match pol {
        Pol::Perm => true,
        Pol::Nc => true,
        Pol::No => false,
        Pol::Absent => false,
    }
}

/// 初始触点状态：应用给定的直接取位；其余优先取提示位，无提示则按缺省（常闭闭合）
pub fn initial_states(input: &Input, offsets: &[usize]) -> Vec<bool> {
    let mut states: Vec<bool> = Vec::new();
    for (di, d) in input.devices.iter().enumerate() {
        let cs = kind::contacts(d.kind, d.aux);
        let hint = !d.given_by_app() && d.state_bits != 0;
        for (k, ct) in cs.iter().enumerate() {
            let bit = if d.given_by_app() || hint {
                (d.state_bits >> k) & 1 != 0
            } else {
                default_closed(ct.pol)
            };
            states.push(bit);
        }
        let _ = offsets;
        let _ = di;
    }
    states
}

/// 把触点状态折回 `state_bits`
pub fn states_to_bits(input: &Input, offsets: &[usize], states: &[bool]) -> Vec<u16> {
    let mut out = vec![0u16; input.devices.len()];
    for (di, d) in input.devices.iter().enumerate() {
        let n = kind::contacts(d.kind, d.aux).len();
        let mut bits = 0u16;
        for k in 0..n {
            if states[offsets[di] + k] {
                bits |= 1 << k;
            }
        }
        out[di] = bits;
    }
    out
}

fn coil_z(d: &Device) -> C {
    let r = if d.params[0] > 0.0 { d.params[0] } else { crate::consts::COIL_R };
    let x = if d.params[1] >= 0.0 { d.params[1] } else { crate::consts::COIL_X };
    C::new(r, x)
}

fn el_resistance(d: &Device) -> f64 {
    let u = d.params[0];
    let p = d.params[1];
    if u > 0.0 && p > 0.0 {
        u * u / p
    } else {
        24200.0
    }
}

/// 展开成支路（每轮迭代调用）
pub fn expand(input: &Input, nodes: &[u32], states: &[bool], offsets: &[usize]) -> Expansion {
    let cfg: &Config = &input.config;
    let tcount = nodes.len();
    let mut ex = Expansion {
        term_branch: vec![None; tcount],
        coil: vec![None; input.devices.len()],
        thermal: vec![Vec::new(); input.devices.len()],
        motor: vec![Vec::new(); input.devices.len()],
        power_nodes: vec![None; input.devices.len()],
        ..Default::default()
    };

    for (di, d) in input.devices.iter().enumerate() {
        let base = d.terminal_base;
        let node = |local: u8| nodes[(base + local as u32) as usize];
        let term = |local: u8| base + local as u32;

        // ── 电源：三条 Norton 支路 ──
        if d.kind == Kind::Power {
            let v_line = if d.params[0] > 0.0 { d.params[0] } else { cfg.v_line };
            let v_phase = v_line / 3.0_f64.sqrt();
            let r_src = if d.params[2] > 0.0 { d.params[2] } else { cfg.r_src };
            let seq = if d.params[3] < 0.0 { -1.0 } else { 1.0 };
            let angles = [0.0, -120.0 * seq, 120.0 * seq];
            let n_node = node(3);
            let mut pn = [0u32; 4];
            for k in 0..3usize {
                let e = C::polar(v_phase, angles[k]);
                let y = C::real(1.0 / r_src);
                let i = e * y;
                let idx = ex.branches.len() as u32;
                ex.branches.push(Branch {
                    a: node(k as u8),
                    b: n_node,
                    y,
                    i,
                    conductive: false,
                    dev: di,
                });
                ex.term_branch[term(k as u8) as usize] = Some((idx, 1));
                ex.term_branch[term(3) as usize] = Some((idx, -1));
                pn[k] = node(k as u8);
            }
            pn[3] = n_node;
            ex.power_nodes[di] = Some(pn);
            continue;
        }

        // ── 线圈（KM / KA / KT）──
        if d.kind.has_coil() {
            let z = coil_z(d);
            let idx = ex.branches.len() as u32;
            ex.branches.push(Branch {
                a: node(0),
                b: node(1),
                y: z.inv(),
                i: ZERO,
                conductive: false,
                dev: di,
            });
            ex.term_branch[term(0) as usize] = Some((idx, 1));
            ex.term_branch[term(1) as usize] = Some((idx, -1));
            ex.coil[di] = Some(idx);
        }

        // ── 电机：三条绕组 ──
        if d.kind == Kind::M {
            let r = if d.params[0] > 0.0 { d.params[0] } else { crate::consts::MOTOR_R };
            let x = if d.params[1] >= 0.0 { d.params[1] } else { crate::consts::MOTOR_X };
            let y = C::new(r, x).inv();
            for k in 0..3u8 {
                let idx = ex.branches.len() as u32;
                ex.branches.push(Branch {
                    a: node(k),
                    b: node(k + 3),
                    y,
                    i: ZERO,
                    conductive: false,
                    dev: di,
                });
                ex.term_branch[term(k) as usize] = Some((idx, 1));
                ex.term_branch[term(k + 3) as usize] = Some((idx, -1));
                ex.motor[di].push(idx);
            }
            continue;
        }

        // ── 纯阻抗：R / EL ──
        if d.kind == Kind::R || d.kind == Kind::El {
            let z = if d.kind == Kind::R { d.params[0] } else { el_resistance(d) };
            let z = if z > 0.0 { z } else { 1.0 };
            let idx = ex.branches.len() as u32;
            ex.branches.push(Branch {
                a: node(0),
                b: node(1),
                y: C::real(1.0 / z),
                i: ZERO,
                conductive: false,
                dev: di,
            });
            ex.term_branch[term(0) as usize] = Some((idx, 1));
            ex.term_branch[term(1) as usize] = Some((idx, -1));
            continue;
        }

        // ── 触点类（QS / FU / SB / SQ / KM / KA / KT / KS / FR）──
        let cs = kind::contacts(d.kind, d.aux);
        for (k, ct) in cs.iter().enumerate() {
            if ct.pol == Pol::Absent {
                continue;
            }
            let closed = if ct.pol == Pol::Perm {
                true
            } else {
                states[offsets[di] + k]
            };
            let r = if closed {
                match d.kind {
                    Kind::Fr => {
                        if d.params[0] > 0.0 {
                            d.params[0]
                        } else {
                            crate::consts::R_CONTACT
                        }
                    }
                    Kind::Fu => {
                        if d.params[0] > 0.0 {
                            d.params[0]
                        } else {
                            cfg.r_contact
                        }
                    }
                    _ => cfg.r_contact,
                }
            } else {
                cfg.r_open
            };
            let idx = ex.branches.len() as u32;
            ex.branches.push(Branch {
                a: node(ct.ta),
                b: node(ct.tb),
                y: C::real(1.0 / r),
                i: ZERO,
                conductive: closed,
                dev: di,
            });
            ex.term_branch[term(ct.ta) as usize] = Some((idx, 1));
            ex.term_branch[term(ct.tb) as usize] = Some((idx, -1));
            if d.kind == Kind::Fr && ct.pol == Pol::Perm {
                ex.thermal[di].push(idx);
            }
        }
    }

    ex
}
