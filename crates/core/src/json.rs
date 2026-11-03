//! 极简 JSON：只为本工程的网表 / 结果服务，零依赖。
//! 运行期 ABI 仍是结构体（`docs/api.md`）；JSON 只用于 fixture、测试与 Web 绑定门面。

use crate::kind::Kind;
use crate::netlist::{Config, Device, Input, Wire};
use crate::solver::{DeviceResult, Output, TerminalResult};

#[derive(Clone, Debug, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Value>),
    Obj(Vec<(String, Value)>),
}

impl Value {
    pub fn get(&self, k: &str) -> Option<&Value> {
        match self {
            Value::Obj(m) => m.iter().find(|(kk, _)| kk == k).map(|(_, v)| v),
            _ => None,
        }
    }
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Value::Num(n) => Some(*n),
            _ => None,
        }
    }
    pub fn as_u32(&self) -> Option<u32> {
        self.as_f64().map(|n| n as u32)
    }
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::Str(s) => Some(s),
            _ => None,
        }
    }
    pub fn as_arr(&self) -> Option<&Vec<Value>> {
        match self {
            Value::Arr(a) => Some(a),
            _ => None,
        }
    }
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Value::Bool(b) => Some(*b),
            _ => None,
        }
    }
}

pub fn parse(s: &str) -> Result<Value, String> {
    let b: Vec<char> = s.chars().collect();
    let mut i = 0usize;
    let v = parse_value(&b, &mut i)?;
    skip_ws(&b, &mut i);
    Ok(v)
}

fn skip_ws(b: &[char], i: &mut usize) {
    while *i < b.len() && (b[*i].is_whitespace()) {
        *i += 1;
    }
}

fn parse_value(b: &[char], i: &mut usize) -> Result<Value, String> {
    skip_ws(b, i);
    if *i >= b.len() {
        return Err("意外的结尾".into());
    }
    match b[*i] {
        '{' => parse_obj(b, i),
        '[' => parse_arr(b, i),
        '"' => Ok(Value::Str(parse_str(b, i)?)),
        't' => {
            expect(b, i, "true")?;
            Ok(Value::Bool(true))
        }
        'f' => {
            expect(b, i, "false")?;
            Ok(Value::Bool(false))
        }
        'n' => {
            expect(b, i, "null")?;
            Ok(Value::Null)
        }
        _ => parse_num(b, i),
    }
}

fn expect(b: &[char], i: &mut usize, lit: &str) -> Result<(), String> {
    for c in lit.chars() {
        if *i >= b.len() || b[*i] != c {
            return Err(format!("期望 {}", lit));
        }
        *i += 1;
    }
    Ok(())
}

fn parse_num(b: &[char], i: &mut usize) -> Result<Value, String> {
    let start = *i;
    if *i < b.len() && (b[*i] == '-' || b[*i] == '+') {
        *i += 1;
    }
    while *i < b.len()
        && (b[*i].is_ascii_digit()
            || b[*i] == '.'
            || b[*i] == 'e'
            || b[*i] == 'E'
            || b[*i] == '-'
            || b[*i] == '+')
    {
        *i += 1;
    }
    let s: String = b[start..*i].iter().collect();
    s.parse::<f64>()
        .map(Value::Num)
        .map_err(|_| format!("非法数字 {}", s))
}

fn parse_str(b: &[char], i: &mut usize) -> Result<String, String> {
    if b[*i] != '"' {
        return Err("期望字符串".into());
    }
    *i += 1;
    let mut s = String::new();
    while *i < b.len() {
        let c = b[*i];
        *i += 1;
        match c {
            '"' => return Ok(s),
            '\\' => {
                if *i >= b.len() {
                    break;
                }
                let e = b[*i];
                *i += 1;
                match e {
                    '"' => s.push('"'),
                    '\\' => s.push('\\'),
                    '/' => s.push('/'),
                    'b' => s.push('\u{8}'),
                    'f' => s.push('\u{c}'),
                    'n' => s.push('\n'),
                    'r' => s.push('\r'),
                    't' => s.push('\t'),
                    'u' => {
                        let mut code = 0u32;
                        for _ in 0..4 {
                            if *i >= b.len() {
                                return Err("\\u 转义不完整".into());
                            }
                            code = code * 16 + b[*i].to_digit(16).ok_or("\\u 非十六进制")?;
                            *i += 1;
                        }
                        s.push(char::from_u32(code).unwrap_or('?'));
                    }
                    _ => s.push(e),
                }
            }
            _ => s.push(c),
        }
    }
    Err("字符串未闭合".into())
}

fn parse_arr(b: &[char], i: &mut usize) -> Result<Value, String> {
    *i += 1;
    let mut v = Vec::new();
    loop {
        skip_ws(b, i);
        if *i >= b.len() {
            return Err("数组未闭合".into());
        }
        if b[*i] == ']' {
            *i += 1;
            return Ok(Value::Arr(v));
        }
        v.push(parse_value(b, i)?);
        skip_ws(b, i);
        if *i < b.len() && b[*i] == ',' {
            *i += 1;
        }
    }
}

fn parse_obj(b: &[char], i: &mut usize) -> Result<Value, String> {
    *i += 1;
    let mut m = Vec::new();
    loop {
        skip_ws(b, i);
        if *i >= b.len() {
            return Err("对象未闭合".into());
        }
        if b[*i] == '}' {
            *i += 1;
            return Ok(Value::Obj(m));
        }
        let k = parse_str(b, i)?;
        skip_ws(b, i);
        if *i >= b.len() || b[*i] != ':' {
            return Err("期望冒号".into());
        }
        *i += 1;
        let v = parse_value(b, i)?;
        m.push((k, v));
        skip_ws(b, i);
        if *i < b.len() && b[*i] == ',' {
            *i += 1;
        }
    }
}

fn kind_from_name(s: &str) -> Option<Kind> {
    Some(match s.to_ascii_uppercase().as_str() {
        "POWER" | "P" => Kind::Power,
        "QS" => Kind::Qs,
        "FU" => Kind::Fu,
        "KM" => Kind::Km,
        "KA" => Kind::Ka,
        "KT" => Kind::Kt,
        "KS" => Kind::Ks,
        "FR" => Kind::Fr,
        "SB" => Kind::Sb,
        "SQ" => Kind::Sq,
        "M" => Kind::M,
        "R" => Kind::R,
        "EL" => Kind::El,
        "TB" => Kind::Tb,
        "PE" => Kind::Pe,
        _ => return None,
    })
}

/// fixture / Web 输入的网表 JSON → `Input`
pub fn parse_input(s: &str) -> Result<Input, String> {
    let v = parse(s)?;
    let mut input = Input::default();
    if let Some(c) = v.get("strict_reference").and_then(|x| x.as_bool()) {
        input.strict_reference = c;
    }
    if let Some(cfg) = v.get("config") {
        let mut c = Config::default();
        let g = |k: &str, d: f64| cfg.get(k).and_then(|x| x.as_f64()).unwrap_or(d);
        c = c.with_overrides(&Config {
            v_line: g("v_line", 0.0),
            freq_hz: g("freq_hz", 0.0),
            r_src: g("r_src", 0.0),
            r_contact: g("r_contact", 0.0),
            r_open: g("r_open", 0.0),
            i_open_a: g("i_open_a", 0.0),
            i_over_a: g("i_over_a", 0.0),
            tol: g("tol", 0.0),
        });
        input.config = c;
    }
    let devs = v
        .get("devices")
        .and_then(|x| x.as_arr())
        .ok_or("缺 devices")?;
    for d in devs {
        let kind_s = d
            .get("kind")
            .and_then(|x| x.as_str())
            .ok_or("器件缺 kind")?;
        let kind = kind_from_name(kind_s).ok_or_else(|| format!("未知 kind {kind_s}"))?;
        let mut params = [0.0f64; 8];
        if let Some(ps) = d.get("params").and_then(|x| x.as_arr()) {
            for (i, p) in ps.iter().enumerate().take(8) {
                params[i] = p.as_f64().unwrap_or(0.0);
            }
        }
        input.devices.push(Device {
            kind,
            id: d.get("id").and_then(|x| x.as_u32()).unwrap_or(0),
            terminal_base: d.get("terminal_base").and_then(|x| x.as_u32()).unwrap_or(0),
            params,
            elapsed_ms: d.get("elapsed_ms").and_then(|x| x.as_u32()).unwrap_or(0),
            state_bits: d.get("state_bits").and_then(|x| x.as_u32()).unwrap_or(0) as u16,
            rpm: d.get("rpm").and_then(|x| x.as_u32()).unwrap_or(0) as u16,
            aux: d.get("aux").and_then(|x| x.as_u32()).unwrap_or(0) as u8,
            shaft_group: d.get("shaft_group").and_then(|x| x.as_u32()).unwrap_or(0) as u8,
            flags: d.get("flags").and_then(|x| x.as_u32()).unwrap_or(0) as u8,
        });
    }
    if let Some(ws) = v.get("wires").and_then(|x| x.as_arr()) {
        for w in ws {
            input.wires.push(Wire {
                a: w.get("a").and_then(|x| x.as_u32()).unwrap_or(0),
                b: w.get("b").and_then(|x| x.as_u32()).unwrap_or(0),
            });
        }
    }
    if let Some(t) = v.get("requested_terminals").and_then(|x| x.as_arr()) {
        input.requested_terminals = Some(t.iter().filter_map(|x| x.as_u32()).collect());
    }
    if let Some(t) = v.get("requested_devices").and_then(|x| x.as_arr()) {
        input.requested_devices = Some(t.iter().filter_map(|x| x.as_u32()).collect());
    }
    Ok(input)
}

fn num(v: f64) -> String {
    if !v.is_finite() {
        return "null".into();
    }
    // 保证确定性：定点小数，去掉多余 0
    let s = format!("{:.10}", v);
    let s = s.trim_end_matches('0').trim_end_matches('.').to_string();
    if s.is_empty() || s == "-" {
        "0".into()
    } else {
        s
    }
}

fn esc(s: &str) -> String {
    let mut o = String::new();
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\n' => o.push_str("\\n"),
            '\r' => o.push_str("\\r"),
            '\t' => o.push_str("\\t"),
            _ => o.push(c),
        }
    }
    o
}

/// `Output` → JSON（Web 绑定门面用）
pub fn output_to_json(out: &Output) -> String {
    let mut s = String::new();
    s.push('{');
    s.push_str(&format!("\"code\":{},", out.code));
    s.push_str(&format!("\"node_count\":{},", out.node_count));
    s.push_str("\"terminals\":[");
    for (i, t) in out.terminals.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push_str(&term_json(t));
    }
    s.push_str("],\"devices\":[");
    for (i, d) in out.devices.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push_str(&dev_json(d));
    }
    s.push_str("],\"diags\":[");
    for (i, d) in out.diags.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push_str(&format!(
            "{{\"code\":{},\"level\":{},\"device_id\":{},\"terminal_id\":{}}}",
            d.code, d.level, d.device_id, d.terminal_id
        ));
    }
    s.push_str("]}");
    s
}

fn term_json(t: &TerminalResult) -> String {
    format!(
        "{{\"id\":{},\"flags\":{},\"v_rms\":{},\"v_deg\":{},\"i_rms\":{},\"i_deg\":{},\"node\":{},\"comp\":{},\"comp_size\":{}}}",
        t.terminal_id,
        t.flags,
        num(t.v_rms),
        num(t.v_deg),
        num(t.i_rms),
        num(t.i_deg),
        t.node,
        t.comp,
        t.comp_size
    )
}

fn dev_json(d: &DeviceResult) -> String {
    format!(
        "{{\"id\":{},\"closed_bits\":{},\"flags\":{},\"coil_i_rms\":{},\"coil_i_deg\":{}}}",
        d.device_id,
        d.closed_bits,
        d.flags,
        num(d.coil_i_rms),
        num(d.coil_i_deg)
    )
}

/// 单值转义（诊断文本等）
pub fn quote(s: &str) -> String {
    format!("\"{}\"", esc(s))
}
