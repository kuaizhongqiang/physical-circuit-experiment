//! fixture 驱动测试：每份 `fixtures/C*.json` 的 cases 逐条跑，比对期望值。
//! 判据见 `docs/verification.md` §2（相对容差 1%，小量用绝对容差）。

// 期望值块用两层 if-let 读更直观（先判键存在、再判是对象）：见 run_file 上的 allow

use std::collections::BTreeMap;
use std::path::PathBuf;

use pcx_core::diag::*;
use pcx_core::json::{self, Value};
use pcx_core::{solver, Input};

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures")
}

fn code_of(name: &str) -> u32 {
    match name {
        "OK" => OK,
        "E_INVALID_ARG" => E_INVALID_ARG,
        "E_UNKNOWN_KIND" => E_UNKNOWN_KIND,
        "E_DUPLICATE_ID" => E_DUPLICATE_ID,
        "E_PARAM_RANGE" => E_PARAM_RANGE,
        "E_TERMINAL_RANGE" => E_TERMINAL_RANGE,
        "E_TERMINAL_LIMIT" => E_TERMINAL_LIMIT,
        "E_NO_REFERENCE" => E_NO_REFERENCE,
        "E_MULTI_REFERENCE" => E_MULTI_REFERENCE,
        "E_SINGULAR" => E_SINGULAR,
        "E_OSCILLATION" => E_OSCILLATION,
        "E_SHORT_CIRCUIT" => E_SHORT,
        other => panic!("未知错误码 {other}"),
    }
}

#[test]
fn all_fixtures_pass() {
    let dir = fixtures_dir();
    let mut files: Vec<PathBuf> = std::fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("读不到 {}: {e}", dir.display()))
        .filter_map(|e| {
            let p = e.ok()?.path();
            if p.extension().map(|x| x == "json").unwrap_or(false) {
                Some(p)
            } else {
                None
            }
        })
        .collect();
    files.sort();
    assert!(!files.is_empty(), "fixtures/ 里没有 json");

    let mut total = 0usize;
    for f in files {
        total += run_file(&f);
    }
    println!("共跑 {total} 个 case");
}

#[allow(clippy::collapsible_match)]
fn run_file(path: &std::path::Path) -> usize {
    let text =
        std::fs::read_to_string(path).unwrap_or_else(|e| panic!("读不到 {}: {e}", path.display()));
    let v = json::parse(&text).unwrap_or_else(|e| panic!("{} JSON 解析失败: {e}", path.display()));
    let name = path.file_name().unwrap().to_string_lossy().to_string();

    let base_input =
        json::parse_input(&text).unwrap_or_else(|e| panic!("{name} 网表解析失败: {e}"));

    // ref → (id, terminal_base)
    let mut refs: BTreeMap<String, (u32, u32)> = BTreeMap::new();
    if let Some(devs) = v.get("devices").and_then(|x| x.as_arr()) {
        for d in devs {
            let r = d.get("ref").and_then(|x| x.as_str()).unwrap_or("");
            let id = d.get("id").and_then(|x| x.as_u32()).unwrap_or(0);
            let base = d.get("terminal_base").and_then(|x| x.as_u32()).unwrap_or(0);
            if !r.is_empty() {
                refs.insert(r.to_string(), (id, base));
            }
        }
    }

    let cases = match v.get("cases").and_then(|x| x.as_arr()) {
        Some(c) => c.clone(),
        None => vec![Value::Null],
    };

    let mut ran = 0;
    for case in cases {
        let description = if case == Value::Null {
            "默认".to_string()
        } else {
            case.get("name")
                .and_then(|x| x.as_str())
                .unwrap_or("未命名")
                .to_string()
        };
        let mut input: Input = base_input.clone();

        if !case.eq(&Value::Null) {
            // set：按 ref 覆盖 state_bits / flags / elapsed_ms / rpm
            if let Some(Value::Obj(m)) = case.get("set") {
                for (r, ov) in m {
                    let (id, _) = *refs
                        .get(r)
                        .unwrap_or_else(|| panic!("{name}/{description}: 未知 ref {r}"));
                    let d = input
                        .devices
                        .iter_mut()
                        .find(|d| d.id == id)
                        .unwrap_or_else(|| panic!("{name}/{description}: 找不到 id {id}"));
                    if let Some(x) = ov.get("state_bits").and_then(|x| x.as_u32()) {
                        d.state_bits = x as u16;
                    }
                    if let Some(x) = ov.get("flags").and_then(|x| x.as_u32()) {
                        d.flags = x as u8;
                    }
                    if let Some(x) = ov.get("elapsed_ms").and_then(|x| x.as_u32()) {
                        d.elapsed_ms = x;
                    }
                    if let Some(x) = ov.get("rpm").and_then(|x| x.as_u32()) {
                        d.rpm = x as u16;
                    }
                }
            }
            // 加线 / 删线
            if let Some(ws) = case.get("add_wires").and_then(|x| x.as_arr()) {
                for w in ws {
                    let a = w
                        .as_arr()
                        .and_then(|a| a.first())
                        .and_then(|x| x.as_u32())
                        .unwrap();
                    let b = w
                        .as_arr()
                        .and_then(|a| a.get(1))
                        .and_then(|x| x.as_u32())
                        .unwrap();
                    input.wires.push(pcx_core::Wire { a, b });
                }
            }
            if let Some(ds) = case.get("drop_wires").and_then(|x| x.as_arr()) {
                let mut idx: Vec<usize> = ds
                    .iter()
                    .filter_map(|x| x.as_u32())
                    .map(|x| x as usize)
                    .collect();
                idx.sort_unstable_by(|a, b| b.cmp(a));
                for i in idx {
                    if i < input.wires.len() {
                        input.wires.remove(i);
                    }
                }
            }
            if let Some(ds) = case.get("add_devices").and_then(|x| x.as_arr()) {
                for d in ds {
                    let kind_s = d.get("kind").and_then(|x| x.as_str()).unwrap_or("");
                    let kind = match kind_s {
                        "PE" => pcx_core::Kind::Pe,
                        other => panic!("{name}/{description}: add_devices 不支持 kind {other}"),
                    };
                    let base: u32 = input
                        .devices
                        .iter()
                        .map(|d| d.terminal_count().unwrap_or(0))
                        .sum();
                    input.devices.push(pcx_core::Device {
                        kind,
                        id: d.get("id").and_then(|x| x.as_u32()).unwrap_or(999),
                        terminal_base: base,
                        params: [0.0; 8],
                        elapsed_ms: 0,
                        state_bits: 0,
                        rpm: 0,
                        aux: 0,
                        shaft_group: 0,
                        flags: 0,
                    });
                }
            }
        }

        let out = solver::solve(&input);
        let want = match case.get("expect_code").and_then(|x| x.as_str()) {
            Some(s) => code_of(s),
            None => OK,
        };
        assert_eq!(
            out.code, want,
            "{name} / {description}: 返回码 {} 期望 {}；诊断 {:?}",
            out.code, want, out.diags
        );

        if want != OK {
            ran += 1;
            continue;
        }

        if let Some(exp) = case.get("expect") {
            if let Value::Obj(m) = exp {
                for (key, e) in m {
                    let (r, idx) = key.split_once(':').unwrap_or_else(|| {
                        panic!("{name}/{description}: 期望键 {key} 应形如 REF:序号")
                    });
                    let (_, base) = *refs
                        .get(r)
                        .unwrap_or_else(|| panic!("{name}/{description}: 未知 ref {r}"));
                    let tid = base + idx.parse::<u32>().unwrap();
                    let got = out
                        .terminals
                        .iter()
                        .find(|t| t.terminal_id == tid)
                        .unwrap_or_else(|| panic!("{name}/{description}: 结果里没有接点 {tid}"));

                    if let Some(want_i) = e.get("i_rms").and_then(|x| x.as_f64()) {
                        let tol = e.get("tol").and_then(|x| x.as_f64()).unwrap_or(0.01);
                        let tol_abs = e.get("tol_abs").and_then(|x| x.as_f64()).unwrap_or(0.0);
                        assert_close(
                            &name,
                            &description,
                            key,
                            "i_rms",
                            got.i_rms,
                            want_i,
                            tol,
                            tol_abs,
                        );
                    }
                    if let Some(want_v) = e.get("v_rms").and_then(|x| x.as_f64()) {
                        let tol = e.get("v_tol").and_then(|x| x.as_f64()).unwrap_or(0.01);
                        let tol_abs = e.get("v_tol_abs").and_then(|x| x.as_f64()).unwrap_or(0.0);
                        assert_close(
                            &name,
                            &description,
                            key,
                            "v_rms",
                            got.v_rms,
                            want_v,
                            tol,
                            tol_abs,
                        );
                    }
                }
            }
        }

        if let Some(exp) = case.get("expect_devices") {
            if let Value::Obj(m) = exp {
                for (r, e) in m {
                    let (id, _) = *refs
                        .get(r)
                        .unwrap_or_else(|| panic!("{name}/{description}: 未知 ref {r}"));
                    let got = out
                        .devices
                        .iter()
                        .find(|d| d.device_id == id)
                        .unwrap_or_else(|| panic!("{name}/{description}: 结果里没有器件 {id}"));
                    if let Some(want) = e.get("coil_i_rms").and_then(|x| x.as_f64()) {
                        let tol = e.get("tol").and_then(|x| x.as_f64()).unwrap_or(0.01);
                        let tol_abs = e.get("tol_abs").and_then(|x| x.as_f64()).unwrap_or(0.0);
                        assert_close(
                            &name,
                            &description,
                            r,
                            "coil_i_rms",
                            got.coil_i_rms,
                            want,
                            tol,
                            tol_abs,
                        );
                    }
                }
            }
        }

        ran += 1;
    }
    ran
}

#[allow(clippy::too_many_arguments)]
fn assert_close(
    file: &str,
    case: &str,
    key: &str,
    field: &str,
    got: f64,
    want: f64,
    tol_rel: f64,
    tol_abs: f64,
) {
    let ok = if want == 0.0 {
        got.abs() <= tol_abs.max(1e-12)
    } else {
        let denom = want.abs().max(1e-12);
        ((got - want).abs() / denom <= tol_rel) || ((got - want).abs() <= tol_abs)
    };
    assert!(
        ok,
        "{file} / {case}: {key}.{field} 实测 {got:.6} 期望 {want:.6}（相对容差 {tol_rel}，绝对 {tol_abs}）"
    );
}
