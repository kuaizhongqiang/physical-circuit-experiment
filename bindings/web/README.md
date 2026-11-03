# bindings/web — Web 侧四件套

wasm ＋ JS 接口 ＋ 样例 ＋ 演示页（`docs/integration.md` §4、`docs/demo.md`）。

## 1 文件

| 文件 | 作用 |
|---|---|
| `pkg/pcx_circuit.wasm` | 内核产物（**不入库**，由 `node scripts/build.mjs` 生成） |
| `pcx.js` | JS 门面：`loadPcx(url)` / `createPcx(bytes)` → `{ abiVersion, terminalCount, solve }` |
| `demo.html` ＋ `demo.js` | C3 两地控制演示页（Canvas 2D，规格见 `docs/demo.md`） |

## 2 构建

```bash
cargo build -p pcx-wasm --release --target wasm32-unknown-unknown
node scripts/build.mjs          # 顺带把 wasm 拷到 bindings/web/pkg/
```

**不需要 wasm-pack**：wasm 侧导出手写 C ABI（`pcx_alloc` / `pcx_free` / `pcx_solve_json` / `pcx_result_ptr` / `pcx_abi_version` / `pcx_terminal_count`），JS 直接 `WebAssembly.instantiate`。

## 3 跑演示页

```bash
node scripts/serve.mjs          # http://localhost:8080
# 打开 http://localhost:8080/bindings/web/demo.html
```

**不要用 `file://` 打开**：`fetch` 取 wasm 与 fixture 会被 CORS 挡。页面加载失败时顶部红条会写出原因。

## 4 用法

```js
import { loadPcx } from "./pcx.js";

const pcx = await loadPcx("./pkg/pcx_circuit.wasm");

const out = pcx.solve({
  strict_reference: true,
  config: { v_line: 380, freq_hz: 50 },
  devices: [
    { ref: "P1", kind: "POWER", id: 1, terminal_base: 0, params: [380, 50, 0.001, 1, 0, 0, 0, 0] },
    { ref: "PE1", kind: "PE", id: 2, terminal_base: 4, params: [0,0,0,0,0,0,0,0] }
  ],
  wires: [{ a: 3, b: 4 }],
});

// out.code / out.terminals[] / out.devices[] / out.diags[]
```

- 输入输出是 **JSON**（仅绑定层，`DECISION.md` D-20261103-28）；C ABI 仍是结构体。
- 每个接点都返回 `{ id, flags, v_rms, v_deg, i_rms, i_deg, node, comp, comp_size }`，**不存在"无数据"的接点**。
- `flags`：bit0 `HAS_V`、bit1 `HAS_I`、bit2 `FLOATING`。

## 5 演示页要点

- 走**宽松模式**（`strict_reference: false`）：允许把导线全部删光再逐条重接，中途每个接点仍有数。
- 悬停任意接点弹出五行数据（电压 / 电流 / 等势点 / 连通分量 / 导通状态）。
- 点接点 A → 点接点 B 加线；点线删线；点 `SB`/`QS`/`SQ` 操作器件；`Esc` 取消选择。
- 打开时会自检"接点几何表 vs 内核接点数"，不一致直接红条报错（`docs/demo.md` §3.4）。
