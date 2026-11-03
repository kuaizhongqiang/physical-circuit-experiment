// pcx.js —— wasm 加载与调用门面（浏览器 / Node 通用）。
// 契约：docs/integration.md §4。电气规则一律在内核，这里只搬字符串。

export function createPcx(bytes) {
  const module = new WebAssembly.Module(bytes);
  const instance = new WebAssembly.Instance(module, {});
  const ex = instance.exports;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function solve(netlist) {
    const text = typeof netlist === "string" ? netlist : JSON.stringify(netlist);
    const input = encoder.encode(text);
    const ptr = ex.pcx_alloc(input.length);
    if (!ptr) throw new Error("pcx_alloc 失败");
    new Uint8Array(ex.memory.buffer, ptr, input.length).set(input);
    const len = ex.pcx_solve_json(ptr, input.length);
    const outPtr = ex.pcx_result_ptr();
    const out = decoder.decode(new Uint8Array(ex.memory.buffer, outPtr, len));
    ex.pcx_free(ptr, input.length);
    return JSON.parse(out);
  }

  return {
    abiVersion: () => ex.pcx_abi_version(),
    terminalCount: (kind, aux) => ex.pcx_terminal_count(kind, aux),
    solve,
  };
}

export async function loadPcx(url = "./pkg/pcx_circuit.wasm") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`加载 wasm 失败：${res.status} ${url}`);
  return createPcx(await res.arrayBuffer());
}
