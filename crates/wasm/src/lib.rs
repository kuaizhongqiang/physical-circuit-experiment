//! wasm32 入口：手写 C ABI（不引 wasm-bindgen，避免额外依赖与工具链）。
//!
//! 契约见 `docs/integration.md` §4：JS 侧只做「拷字符串进来 → 取字符串出去」，
//! 电气规则一律在内核里。

use std::cell::RefCell;

thread_local! {
    static RESULT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

/// 分配输入缓冲（JS 侧写入 JSON）
#[no_mangle]
pub extern "C" fn pcx_alloc(len: usize) -> *mut u8 {
    let mut v: Vec<u8> = Vec::with_capacity(len.max(1));
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// 释放输入缓冲
///
/// # Safety
/// `ptr` 必须来自 [`pcx_alloc`]，且 `len` 与分配时一致。
#[no_mangle]
pub unsafe extern "C" fn pcx_free(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        let _ = Vec::from_raw_parts(ptr, 0, len.max(1));
    }
}

/// 求解：入参是网表 JSON 的 UTF-8 字节，返回结果 JSON 的长度（指针用 [`pcx_result_ptr`] 取）
///
/// # Safety
/// `ptr` / `len` 必须描述一块有效的 UTF-8 缓冲。
#[no_mangle]
pub unsafe extern "C" fn pcx_solve_json(ptr: *const u8, len: usize) -> usize {
    let out = match std::str::from_utf8(std::slice::from_raw_parts(ptr, len)) {
        Ok(s) => match pcx_core::json::parse_input(s) {
            Ok(input) => {
                let res = pcx_core::solver::solve(&input);
                pcx_core::json::output_to_json(&res)
            }
            Err(e) => format!(
                "{{\"code\":{},\"error\":{}}}",
                pcx_core::diag::E_INVALID_ARG,
                pcx_core::json::quote(&e)
            ),
        },
        Err(_) => format!("{{\"code\":{},\"error\":\"utf8\"}}", pcx_core::diag::E_INVALID_ARG),
    };
    RESULT.with(|r| {
        let mut b = r.borrow_mut();
        *b = out.into_bytes();
        b.len()
    })
}

/// 上一次结果 JSON 的指针（仅在上一次 `pcx_solve_json` 之后、下一次调用之前有效）
#[no_mangle]
pub extern "C" fn pcx_result_ptr() -> *const u8 {
    RESULT.with(|r| r.borrow().as_ptr())
}

#[no_mangle]
pub extern "C" fn pcx_abi_version() -> u32 {
    pcx_core::ABI_VERSION
}

/// 接点数查询（演示页用来校验自己的接点几何表是否与内核一致）
#[no_mangle]
pub extern "C" fn pcx_terminal_count(kind: u8, aux: u8) -> u32 {
    pcx_core::terminal_count(kind, aux)
}
