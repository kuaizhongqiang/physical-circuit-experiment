//! 稠密复系数 LU（部分主元）＋ 残差校验。选型见 `docs/architecture.md` §5、`docs/solver.md` §9。

// 矩阵运算按行/列下标写最直观，禁用 needless_range_loop 提示
#![allow(clippy::needless_range_loop)]

use crate::complex::{C, ZERO};
use crate::consts;
use crate::diag::E_SINGULAR;

/// 解 `G x = b`。`G` 按行存放。返回节点电压，或 `E_SINGULAR`。
pub fn solve(mut g: Vec<Vec<C>>, mut b: Vec<C>, tol: f64) -> Result<Vec<C>, u32> {
    let n = b.len();
    if n == 0 {
        return Ok(Vec::new());
    }
    let a0 = g.clone();
    let b0 = b.clone();

    let mut max_a: f64 = 0.0;
    for row in g.iter() {
        for v in row.iter() {
            let m = v.abs();
            if m > max_a {
                max_a = m;
            }
        }
    }
    if max_a <= 0.0 || !max_a.is_finite() {
        return Err(E_SINGULAR);
    }
    let pivot_eps = consts::PIVOT_EPS * max_a;

    for k in 0..n {
        // 部分主元
        let mut p = k;
        let mut best = g[k][k].abs();
        for r in (k + 1)..n {
            let m = g[r][k].abs();
            if m > best {
                best = m;
                p = r;
            }
        }
        if !best.is_finite() || best <= pivot_eps {
            return Err(E_SINGULAR);
        }
        if p != k {
            g.swap(p, k);
            b.swap(p, k);
        }
        let pivot = g[k][k];
        for r in (k + 1)..n {
            let f = g[r][k] / pivot;
            if f.re == 0.0 && f.im == 0.0 {
                continue;
            }
            g[r][k] = ZERO;
            for c in (k + 1)..n {
                let t = f * g[k][c];
                g[r][c] = g[r][c] - t;
            }
            let t = f * b[k];
            b[r] = b[r] - t;
        }
    }

    let mut x = vec![ZERO; n];
    for k in (0..n).rev() {
        let mut s = b[k];
        for c in (k + 1)..n {
            s = s - g[k][c] * x[c];
        }
        let d = g[k][k];
        if d.re == 0.0 && d.im == 0.0 {
            return Err(E_SINGULAR);
        }
        x[k] = s / d;
        if !x[k].is_finite() {
            return Err(E_SINGULAR);
        }
    }

    // 残差校验：‖Ax−b‖ / max(‖b‖, ε)
    let mut num = 0.0f64;
    let mut den = 0.0f64;
    for r in 0..n {
        let mut s = ZERO;
        for c in 0..n {
            let t = a0[r][c] * x[c];
            s = s + t;
        }
        let d = s - b0[r];
        num += d.re * d.re + d.im * d.im;
        den += b0[r].re * b0[r].re + b0[r].im * b0[r].im;
    }
    let num = num.sqrt();
    let den = den.sqrt().max(1e-12);
    if num / den > tol {
        return Err(E_SINGULAR);
    }

    Ok(x)
}
