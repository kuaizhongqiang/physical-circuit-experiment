//! 15 类器件的类型编号、接点数与触点布局。契约见 `docs/domain-model.md` §2 / `docs/api.md` §3。

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Kind {
    Power = 1,
    Qs = 2,
    Fu = 3,
    Km = 4,
    Ka = 5,
    Kt = 6,
    Ks = 7,
    Fr = 8,
    Sb = 9,
    Sq = 10,
    M = 11,
    R = 12,
    El = 13,
    Tb = 14,
    Pe = 15,
}

impl Kind {
    pub fn from_u8(v: u8) -> Option<Kind> {
        Some(match v {
            1 => Kind::Power,
            2 => Kind::Qs,
            3 => Kind::Fu,
            4 => Kind::Km,
            5 => Kind::Ka,
            6 => Kind::Kt,
            7 => Kind::Ks,
            8 => Kind::Fr,
            9 => Kind::Sb,
            10 => Kind::Sq,
            11 => Kind::M,
            12 => Kind::R,
            13 => Kind::El,
            14 => Kind::Tb,
            15 => Kind::Pe,
            _ => return None,
        })
    }

    /// 触点状态由**应用**给定（人在操作 / 机械位置）
    pub fn is_app_given(self) -> bool {
        matches!(self, Kind::Qs | Kind::Sb | Kind::Sq)
    }

    /// 有线圈由电流自解的器件
    pub fn has_coil(self) -> bool {
        matches!(self, Kind::Km | Kind::Ka | Kind::Kt)
    }
}

/// 触点极性
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pol {
    /// 常开：动作后闭合
    No,
    /// 常闭：动作后断开
    Nc,
    /// 恒闭合（熔断器、热元件 —— 导电但不建模熔断）
    Perm,
    /// 该组触点不存在
    Absent,
}

#[derive(Clone, Copy, Debug)]
pub struct Contact {
    pub ta: u8,
    pub tb: u8,
    pub pol: Pol,
}

/// `aux` 解码：`KM` / `KA` 用 `aux_no*4 + aux_nc`，各取 1 或 2；`0` 视为 `(1,1)`。
pub fn aux_contacts(aux: u8) -> (u8, u8) {
    if aux == 0 {
        return (1, 1);
    }
    let no = aux / 4;
    let nc = aux % 4;
    let no = if no == 0 { 1 } else { no };
    let nc = if nc == 0 { 1 } else { nc };
    (no, nc)
}

/// 接点数；`None` 表示参数非法
pub fn terminal_count(kind: Kind, aux: u8) -> Option<u32> {
    Some(match kind {
        Kind::Power => 4,
        Kind::Qs => match aux {
            0 | 3 => 6,
            1 => 2,
            _ => return None,
        },
        Kind::Fu => 2,
        Kind::Km => {
            let (no, nc) = aux_contacts(aux);
            if no > 2 || nc > 2 {
                return None;
            }
            12 + if no == 2 { 2 } else { 0 } + if nc == 2 { 2 } else { 0 }
        }
        Kind::Ka => {
            let (no, nc) = aux_contacts(aux);
            if no > 2 || nc > 2 {
                return None;
            }
            6 + if no == 2 { 2 } else { 0 } + if nc == 2 { 2 } else { 0 }
        }
        Kind::Kt => 6,
        Kind::Ks => 4,
        Kind::Fr => 10,
        Kind::Sb | Kind::Sq => 4,
        Kind::M => 6,
        Kind::R | Kind::El => 2,
        Kind::Tb => {
            if (2..=8).contains(&aux) {
                aux as u32
            } else {
                return None;
            }
        }
        Kind::Pe => 1,
    })
}

/// 触点列表，顺序即 `state_bits` 位序（`docs/api.md` §3）
pub fn contacts(kind: Kind, aux: u8) -> Vec<Contact> {
    let c = |ta, tb, pol| Contact { ta, tb, pol };
    match kind {
        Kind::Power => vec![],
        Kind::Qs => {
            if aux == 1 {
                vec![c(0, 1, Pol::No)]
            } else {
                vec![c(0, 3, Pol::No), c(1, 4, Pol::No), c(2, 5, Pol::No)]
            }
        }
        Kind::Fu => vec![c(0, 1, Pol::Perm)],
        Kind::Km => {
            let (no, nc) = aux_contacts(aux);
            let mut v = vec![
                c(2, 3, Pol::No),
                c(4, 5, Pol::No),
                c(6, 7, Pol::No),
                c(8, 9, Pol::No),   // 13-14
                c(10, 11, Pol::Nc), // 21-22
            ];
            if no == 2 {
                v.push(c(12, 13, Pol::No)); // 43-44
            }
            if nc == 2 {
                v.push(c(14, 15, Pol::Nc)); // 31-32
            }
            v
        }
        Kind::Ka => {
            let (no, nc) = aux_contacts(aux);
            let mut v = vec![c(2, 3, Pol::No), c(4, 5, Pol::Nc)];
            if no == 2 {
                v.push(c(6, 7, Pol::No));
            }
            if nc == 2 {
                v.push(c(8, 9, Pol::Nc));
            }
            v
        }
        Kind::Kt => vec![c(2, 3, Pol::No), c(4, 5, Pol::Nc)], // 55-56 / 67-68
        Kind::Ks => vec![c(0, 1, Pol::No), c(2, 3, Pol::No)], // 13-14 / 23-24
        Kind::Fr => vec![
            c(0, 1, Pol::Perm),
            c(2, 3, Pol::Perm),
            c(4, 5, Pol::Perm),
            c(6, 7, Pol::Nc), // 95-96
            c(8, 9, Pol::No), // 97-98
        ],
        Kind::Sb | Kind::Sq => {
            // aux: 1 = 只有常闭，2 = 只有常开，3 = 复合，0 视为 3
            let both = aux == 0 || aux == 3;
            let nc = both || aux == 1;
            let no = both || aux == 2;
            vec![
                c(0, 1, if nc { Pol::Nc } else { Pol::Absent }),
                c(2, 3, if no { Pol::No } else { Pol::Absent }),
            ]
        }
        Kind::M => vec![c(0, 3, Pol::Perm), c(1, 4, Pol::Perm), c(2, 5, Pol::Perm)],
        Kind::R | Kind::El => vec![c(0, 1, Pol::Perm)],
        Kind::Tb | Kind::Pe => vec![],
    }
}

/// 器件显示名（诊断与演示页共用）
pub fn name_of(kind: Kind) -> &'static str {
    match kind {
        Kind::Power => "三相电源",
        Kind::Qs => "旋钮开关",
        Kind::Fu => "熔断器",
        Kind::Km => "接触器",
        Kind::Ka => "中间继电器",
        Kind::Kt => "时间继电器",
        Kind::Ks => "速度继电器",
        Kind::Fr => "热继电器",
        Kind::Sb => "按钮",
        Kind::Sq => "行程开关",
        Kind::M => "三相电动机",
        Kind::R => "电阻",
        Kind::El => "指示灯",
        Kind::Tb => "端子排",
        Kind::Pe => "接地",
    }
}
