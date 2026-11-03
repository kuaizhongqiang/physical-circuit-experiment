//! 求解主流程：校验 → 等势合并 → 分量分类 → 短路预检 → 开关迭代 → 结果。
//! 算法与判据见 `docs/solver.md`，输出契约见 `docs/api.md`。

use std::collections::{BTreeMap, HashSet};

use crate::complex::{C, ZERO};
use crate::consts;
use crate::device::{self, Expansion};
use crate::diag::*;
use crate::kind::{self, Kind, Pol};
use crate::mna;
use crate::netlist::{self, Input};
use crate::union::{self, Dsu};

pub const F_HAS_V: u32 = 1;
pub const F_HAS_I: u32 = 2;
pub const F_FLOATING: u32 = 4;

pub const F_DEV_ENERGIZED: u16 = 1;

#[derive(Clone, Copy, Debug, Default)]
pub struct TerminalResult {
    pub terminal_id: u32,
    pub flags: u32,
    pub v_rms: f64,
    pub v_deg: f64,
    pub i_rms: f64,
    pub i_deg: f64,
    /// 等势点编号（合并后），供诊断与演示页显示
    pub node: u32,
    /// 所在连通分量类型：0 = 有源、1 = 无源孤立、2 = 单接点
    pub comp: u8,
    /// 该分量包含的等势点个数
    pub comp_size: u32,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct DeviceResult {
    pub device_id: u32,
    pub closed_bits: u16,
    pub flags: u16,
    pub coil_i_rms: f64,
    pub coil_i_deg: f64,
}

#[derive(Clone, Debug, Default)]
pub struct Output {
    pub code: u32,
    pub node_count: u32,
    pub terminals: Vec<TerminalResult>,
    pub devices: Vec<DeviceResult>,
    pub diags: Vec<Diag>,
}

struct Eval {
    v: Vec<C>,
    floating: Vec<bool>,
}

fn err_output(code: u32, device_id: u32, terminal_id: u32) -> Output {
    Output {
        code,
        diags: vec![Diag::error(code, device_id, terminal_id)],
        ..Default::default()
    }
}

pub fn solve(input: &Input) -> Output {
    let total = match netlist::validate(input) {
        Ok(t) => t,
        Err((code, dev_idx, term)) => {
            let device_id = input.devices.get(dev_idx).map(|d| d.id).unwrap_or(NO_ID);
            return err_output(code, device_id, term);
        }
    };

    // ── 等势合并：导线 ＋ 端子排内部 ──
    let mut dsu = Dsu::new(total);
    for w in &input.wires {
        dsu.union(w.a, w.b);
    }
    for d in &input.devices {
        if d.kind == Kind::Tb {
            let n = d.terminal_count().unwrap_or(2);
            for i in 1..n {
                dsu.union(d.terminal_base, d.terminal_base + i);
            }
        }
    }
    let (nodes, node_count) = union::build_nodes(total, &mut dsu);

    // ── 触点状态 ──
    let counts = device::contact_counts(input);
    let (offsets, _slots) = device::slot_offsets(&counts);
    let mut states = device::initial_states(input, &offsets);

    let mut visited: HashSet<Vec<u8>> = HashSet::new();
    visited.insert(states.iter().map(|b| *b as u8).collect());

    let mut diags: Vec<Diag> = Vec::new();
    let mut last: Option<(Expansion, Eval)> = None;
    let mut converged = false;

    for _ in 0..consts::MAX_ITER {
        let ex = device::expand(input, &nodes, &states, &offsets);

        // 短路拓扑预检（每轮都做）
        if let Some((code, dev, term)) = check_short(input, node_count, &ex) {
            return err_output(code, dev, term);
        }

        let ev = match evaluate(input, &nodes, node_count, &ex, &mut diags) {
            Ok(v) => v,
            Err((code, dev, term)) => return err_output(code, dev, term),
        };

        let currents = branch_currents(&ex, &ev.v, node_count);
        let next = update_states(input, &offsets, &states, &ex, &currents);

        if next == states {
            converged = true;
            last = Some((ex, ev));
            break;
        }
        let key: Vec<u8> = next.iter().map(|b| *b as u8).collect();
        if visited.contains(&key) {
            let mut o = err_output(E_OSCILLATION, NO_ID, NO_ID);
            for (di, d) in input.devices.iter().enumerate() {
                if states[offsets[di]..offsets[di] + counts[di]]
                    != next[offsets[di]..offsets[di] + counts[di]]
                {
                    o.diags.push(Diag::error(E_OSCILLATION, d.id, NO_ID));
                }
            }
            return o;
        }
        visited.insert(key);
        states = next;
        last = Some((ex, ev));
    }

    if !converged {
        return err_output(E_OSCILLATION, NO_ID, NO_ID);
    }

    let (ex, ev) = match last {
        Some(x) => x,
        None => return err_output(E_OSCILLATION, NO_ID, NO_ID),
    };
    let currents = branch_currents(&ex, &ev.v, node_count);

    // ── 告警 ──
    for (di, d) in input.devices.iter().enumerate() {
        let mut over = false;
        for (bi, br) in ex.branches.iter().enumerate() {
            if br.dev == di && currents[bi].abs() > input.config.i_over_a {
                over = true;
                break;
            }
        }
        if over {
            diags.push(Diag::warn(W_OVERCURRENT, d.id, d.terminal_base));
        }
        if matches!(d.kind, Kind::Km) {
            let bits = device::states_to_bits(input, &offsets, &states)[di];
            let energized = bits & 0b10000 == 0; // 21-22 常闭：吸合时该触点断开
            if energized {
                let main_open = ex
                    .branches
                    .iter()
                    .enumerate()
                    .filter(|(_, b)| b.dev == di && b.conductive)
                    .all(|(bi, _)| currents[bi].abs() < input.config.i_open_a);
                if main_open {
                    diags.push(Diag::warn(W_OPEN_CIRCUIT, d.id, d.terminal_base));
                }
            }
        }
    }
    if ev.floating.iter().filter(|f| **f).count() > 0 {
        let n = ev.floating.iter().filter(|f| **f).count();
        diags.push(Diag::info(W_ISOLATED_IGNORED, NO_ID, n as u32));
    }

    // ── 分量信息（供演示页/诊断显示）──
    let mut cd = Dsu::new(node_count);
    for br in &ex.branches {
        cd.union(br.a, br.b);
    }
    let mut root_size: BTreeMap<u32, u32> = BTreeMap::new();
    for n in 0..node_count as u32 {
        let r = cd.find(n);
        *root_size.entry(r).or_insert(0) += 1;
    }
    let mut has_branch = vec![false; node_count];
    for br in &ex.branches {
        has_branch[br.a as usize] = true;
        has_branch[br.b as usize] = true;
    }
    let mut comp_of = vec![2u8; node_count];
    let mut comp_size = vec![1u32; node_count];
    for n in 0..node_count {
        comp_of[n] = if !ev.floating[n] {
            0
        } else if has_branch[n] {
            1
        } else {
            2
        };
        let r = cd.find(n as u32);
        comp_size[n] = *root_size.get(&r).unwrap_or(&1);
    }

    // ── 结果 ──
    let closed_bits = device::states_to_bits(input, &offsets, &states);
    let mut terminals = Vec::new();
    let req_t: Vec<u32> = match &input.requested_terminals {
        Some(v) => v.clone(),
        None => (0..total as u32).collect(),
    };
    for t in req_t {
        if t as usize >= total {
            return err_output(E_TERMINAL_RANGE, NO_ID, t);
        }
        let node = nodes[t as usize] as usize;
        let mut flags = F_HAS_V;
        let v = ev.v[node];
        if ev.floating[node] {
            flags |= F_FLOATING;
        }
        let (i_rms, i_deg) = match ex.term_branch[t as usize] {
            Some((bi, sign)) => {
                flags |= F_HAS_I;
                let cur = if sign >= 0 {
                    currents[bi as usize]
                } else {
                    -currents[bi as usize]
                };
                (cur.abs(), cur.arg_deg())
            }
            None => (0.0, 0.0),
        };
        terminals.push(TerminalResult {
            terminal_id: t,
            flags,
            v_rms: v.abs(),
            v_deg: v.arg_deg(),
            i_rms,
            i_deg,
            node: nodes[t as usize],
            comp: comp_of[node],
            comp_size: comp_size[node],
        });
    }

    let req_d: Vec<usize> = match &input.requested_devices {
        Some(v) => v
            .iter()
            .filter_map(|id| input.devices.iter().position(|d| d.id == *id))
            .collect(),
        None => (0..input.devices.len()).collect(),
    };
    let mut devs = Vec::new();
    for di in req_d {
        let d = input.devices[di];
        let (coil_i, coil_deg, energized) = match ex.coil[di] {
            Some(bi) => {
                let c = currents[bi as usize];
                let en = c.abs() > input.config.i_open_a;
                (c.abs(), c.arg_deg(), en)
            }
            None => (0.0, 0.0, false),
        };
        devs.push(DeviceResult {
            device_id: d.id,
            closed_bits: closed_bits[di],
            flags: if energized { F_DEV_ENERGIZED } else { 0 },
            coil_i_rms: coil_i,
            coil_i_deg: coil_deg,
        });
    }

    Output {
        code: OK,
        node_count: node_count as u32,
        terminals,
        devices: devs,
        diags,
    }
}

fn branch_currents(ex: &Expansion, v: &[C], _node_count: usize) -> Vec<C> {
    ex.branches
        .iter()
        .map(|b| {
            let va = v[b.a as usize];
            let vb = v[b.b as usize];
            b.y * (va - vb) - b.i
        })
        .collect()
}

fn check_short(input: &Input, node_count: usize, ex: &Expansion) -> Option<(u32, u32, u32)> {
    let mut sd = Dsu::new(node_count);
    for br in &ex.branches {
        if br.conductive {
            sd.union(br.a, br.b);
        }
    }
    for (di, d) in input.devices.iter().enumerate() {
        if d.kind != Kind::Power {
            continue;
        }
        if let Some(pn) = ex.power_nodes[di] {
            let r: Vec<u32> = pn.iter().map(|n| sd.find(*n)).collect();
            for i in 0..4 {
                for j in (i + 1)..4 {
                    if r[i] == r[j] {
                        return Some((E_SHORT, d.id, d.terminal_base + i as u32));
                    }
                }
            }
        }
    }
    None
}

fn evaluate(
    input: &Input,
    nodes: &[u32],
    node_count: usize,
    ex: &Expansion,
    diags: &mut Vec<Diag>,
) -> Result<Eval, (u32, u32, u32)> {
    let mut cd = Dsu::new(node_count);
    for br in &ex.branches {
        cd.union(br.a, br.b);
    }
    // 每个节点属于哪个分量
    let mut comp_power: BTreeMap<u32, usize> = BTreeMap::new();
    let mut comp_pe: BTreeMap<u32, Vec<(u32, u32)>> = BTreeMap::new();
    let mut comp_power_dev: BTreeMap<u32, usize> = BTreeMap::new();
    for (di, d) in input.devices.iter().enumerate() {
        if d.kind == Kind::Power {
            if let Some(pn) = ex.power_nodes[di] {
                let r = cd.find(pn[0]);
                *comp_power.entry(r).or_insert(0) += 1;
                comp_power_dev.entry(r).or_insert(di);
            }
        }
        if d.kind == Kind::Pe {
            let t = d.terminal_base as usize;
            if t < nodes.len() {
                let r = cd.find(nodes[t]);
                comp_pe.entry(r).or_default().push((t as u32, d.id));
            }
        }
    }

    let mut v = vec![ZERO; node_count];
    let mut floating = vec![false; node_count];

    for (root, members) in comp_partition(node_count, &mut cd) {
        let has_power = comp_power.get(&root).copied().unwrap_or(0) > 0;
        if !has_power {
            for n in &members {
                floating[*n as usize] = true;
            }
            continue;
        }
        let pe_list = comp_pe.get(&root).cloned().unwrap_or_default();
        let ref_node: u32 = if pe_list.len() == 1 {
            nodes[pe_list[0].0 as usize]
        } else if pe_list.is_empty() {
            if input.strict_reference {
                let di = comp_power_dev.get(&root).copied().unwrap_or(0);
                let d = input.devices.get(di);
                return Err((
                    E_NO_REFERENCE,
                    d.map(|x| x.id).unwrap_or(NO_ID),
                    d.map(|x| x.terminal_base).unwrap_or(NO_ID),
                ));
            }
            // 宽松模式：取该分量内第一台 POWER 的 N 为隐含参考
            let di = comp_power_dev.get(&root).copied().unwrap_or(0);
            let pn = ex.power_nodes[di].ok_or((E_NO_REFERENCE, NO_ID, NO_ID))?;
            diags.push(Diag::warn(
                W_IMPLICIT_REFERENCE,
                input.devices[di].id,
                input.devices[di].terminal_base + 3,
            ));
            pn[3]
        } else {
            return Err((E_MULTI_REFERENCE, pe_list[1].1, pe_list[1].0));
        };

        // 局部编号
        let mut idx = vec![u32::MAX; node_count];
        let mut m = 0usize;
        for n in &members {
            if *n != ref_node {
                idx[*n as usize] = m as u32;
                m += 1;
            }
        }
        let mut g = vec![vec![ZERO; m]; m];
        let mut b = vec![ZERO; m];
        for br in &ex.branches {
            if cd.find(br.a) != root {
                continue;
            }
            let ia = idx[br.a as usize];
            let ib = idx[br.b as usize];
            if ia != u32::MAX {
                g[ia as usize][ia as usize] = g[ia as usize][ia as usize] + br.y;
                b[ia as usize] = b[ia as usize] + br.i;
            }
            if ib != u32::MAX {
                g[ib as usize][ib as usize] = g[ib as usize][ib as usize] + br.y;
                b[ib as usize] = b[ib as usize] - br.i;
            }
            if ia != u32::MAX && ib != u32::MAX {
                g[ia as usize][ib as usize] = g[ia as usize][ib as usize] - br.y;
                g[ib as usize][ia as usize] = g[ib as usize][ia as usize] - br.y;
            }
        }

        let x = mna::solve(g, b, input.config.tol).map_err(|code| {
            (
                code,
                comp_power_dev
                    .get(&root)
                    .and_then(|di| input.devices.get(*di))
                    .map(|d| d.id)
                    .unwrap_or(NO_ID),
                NO_ID,
            )
        })?;

        for n in &members {
            if *n == ref_node {
                v[*n as usize] = ZERO;
            } else {
                v[*n as usize] = x[idx[*n as usize] as usize];
            }
        }
    }

    Ok(Eval { v, floating })
}

fn comp_partition(node_count: usize, dsu: &mut Dsu) -> Vec<(u32, Vec<u32>)> {
    let mut map: BTreeMap<u32, Vec<u32>> = BTreeMap::new();
    for n in 0..node_count as u32 {
        let r = dsu.find(n);
        map.entry(r).or_default().push(n);
    }
    map.into_iter().collect()
}

fn update_states(
    input: &Input,
    offsets: &[usize],
    states: &[bool],
    ex: &Expansion,
    currents: &[C],
) -> Vec<bool> {
    let mut s2 = states.to_vec();
    for (di, d) in input.devices.iter().enumerate() {
        let cs = kind::contacts(d.kind, d.aux);
        let off = offsets[di];
        match d.kind {
            Kind::Km | Kind::Ka => {
                let i = ex.coil[di]
                    .map(|b| currents[b as usize].abs())
                    .unwrap_or(0.0);
                let nc_slot = cs.iter().position(|c| c.pol == Pol::Nc);
                let prev = nc_slot.map(|k| !s2[off + k]).unwrap_or(false);
                let on = if prev {
                    i > d.params[3]
                } else {
                    i >= d.params[2]
                };
                for (k, c) in cs.iter().enumerate() {
                    match c.pol {
                        Pol::No => s2[off + k] = on,
                        Pol::Nc => s2[off + k] = !on,
                        Pol::Perm => s2[off + k] = true,
                        Pol::Absent => {}
                    }
                }
            }
            Kind::Kt => {
                let i = ex.coil[di]
                    .map(|b| currents[b as usize].abs())
                    .unwrap_or(0.0);
                let energized = i > input.config.i_open_a;
                let delay = if d.params[5] > 0.0 {
                    d.params[5]
                } else {
                    consts::KT_DELAY_MS
                };
                let timed = energized && (d.elapsed_ms as f64) >= delay;
                for (k, c) in cs.iter().enumerate() {
                    match c.pol {
                        Pol::No => s2[off + k] = timed,
                        Pol::Nc => s2[off + k] = !timed,
                        _ => {}
                    }
                }
            }
            Kind::Fr => {
                let overload = ex.thermal[di]
                    .iter()
                    .any(|b| currents[*b as usize].abs() > d.params[1]);
                let delay = if d.params[2] > 0.0 {
                    d.params[2]
                } else {
                    consts::FR_DELAY_MS
                };
                let tripped = overload && (d.elapsed_ms as f64) >= delay;
                for (k, c) in cs.iter().enumerate() {
                    match c.pol {
                        Pol::No => s2[off + k] = tripped,
                        Pol::Nc => s2[off + k] = !tripped,
                        _ => {}
                    }
                }
            }
            Kind::Ks => {
                let rpm = d.rpm as f64;
                let pick = if d.params[0] > 0.0 {
                    d.params[0]
                } else {
                    consts::KS_N_PICK
                };
                let drop = if d.params[1] > 0.0 {
                    d.params[1]
                } else {
                    consts::KS_N_DROP
                };
                let fwd = s2[off];
                s2[off] = if rpm >= pick {
                    true
                } else if rpm <= drop {
                    false
                } else {
                    fwd
                };
                let rev = s2[off + 1];
                s2[off + 1] = if rpm <= -pick {
                    true
                } else if rpm >= -drop {
                    false
                } else {
                    rev
                };
            }
            _ => {}
        }
    }
    s2
}
