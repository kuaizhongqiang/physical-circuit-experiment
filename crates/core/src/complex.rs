//! 极简复数。内核不引外部依赖，相量运算够用即可。

use core::ops::{Add, Div, Mul, Neg, Sub};

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct C {
    pub re: f64,
    pub im: f64,
}

pub const ZERO: C = C { re: 0.0, im: 0.0 };

impl C {
    pub const fn new(re: f64, im: f64) -> Self {
        C { re, im }
    }
    pub const fn real(re: f64) -> Self {
        C { re, im: 0.0 }
    }
    /// 由极坐标构造：幅值 + 角度（度）
    pub fn polar(mag: f64, deg: f64) -> Self {
        let r = deg.to_radians();
        C {
            re: mag * r.cos(),
            im: mag * r.sin(),
        }
    }
    pub fn abs(&self) -> f64 {
        self.re.hypot(self.im)
    }
    /// 幅角，度，范围 (-180, 180]
    pub fn arg_deg(&self) -> f64 {
        if self.re == 0.0 && self.im == 0.0 {
            return 0.0;
        }
        let d = self.im.atan2(self.re).to_degrees();
        if d <= -180.0 {
            d + 360.0
        } else {
            d
        }
    }
    pub fn conj(&self) -> Self {
        C {
            re: self.re,
            im: -self.im,
        }
    }
    /// 1/z（z 为 0 时返回极大值，避免 panic）
    pub fn inv(&self) -> Self {
        let d = self.re * self.re + self.im * self.im;
        if d == 0.0 {
            return C::real(1e300);
        }
        C {
            re: self.re / d,
            im: -self.im / d,
        }
    }
    pub fn is_finite(&self) -> bool {
        self.re.is_finite() && self.im.is_finite()
    }
}

impl Add for C {
    type Output = C;
    fn add(self, o: C) -> C {
        C::new(self.re + o.re, self.im + o.im)
    }
}
impl Sub for C {
    type Output = C;
    fn sub(self, o: C) -> C {
        C::new(self.re - o.re, self.im - o.im)
    }
}
impl Mul for C {
    type Output = C;
    fn mul(self, o: C) -> C {
        C::new(
            self.re * o.re - self.im * o.im,
            self.re * o.im + self.im * o.re,
        )
    }
}
impl Div for C {
    type Output = C;
    fn div(self, o: C) -> C {
        self.mul(o.inv())
    }
}
impl Neg for C {
    type Output = C;
    fn neg(self) -> C {
        C::new(-self.re, -self.im)
    }
}
