# integration — Unity 与 Web 接入、时钟驱动、演示页

读者：AI / 负责人
类型：设计
权威：两端交付物清单、绑定层职责、应用侧时钟契约、演示页规格的唯一事实源
状态：2026-11-03 首版（未实现；演示电路 = C3 两地控制 / 双开双控）
依赖：`../DECISION.md`（D-08/D-12/D-16）、`api.md`、`domain-model.md`

## 1 两端都是"四件套"

| 件 | Unity | Web |
|---|---|---|
| ① 二进制 | `pcx_circuit.dll`（x64，Unity Editor） | `pkg/*.wasm` ＋ `pkg/*.js` |
| ② 接口 | `PcxCircuit.cs`（`DllImport` ＋ 托管门面 ＋ 错误文案表） | `pcx.ts`（结构体填充 ＋ 错误文案表） |
| ③ 样例 | `Samples~/Sample_TwoLocationControl.cs`（Editor 内 Play 即跑） | `demo.html` ＋ `demo.js`（演示页即样例） |
| ④ 文档 | `bindings/csharp/README.md` | `bindings/web/README.md` |

**绑定层只做三件事**：把宿主数据填进 `pcx_*` 结构体、调 `pcx_solve`、把错误码翻译成人话。**一行电气规则都不许写**（`AGENT.md` §2「内核唯一」）。

## 2 应用侧时钟契约（关键）

库不持时钟（D-20261103-12），两端都用**固定步长累加器**，不要直接把帧间隔当 `dt`：

```text
accumulator += (now - last);  last = now;
while (accumulator >= DT) {          // DT = 10 ms
    step(DT);                        // 推进应用侧状态 → 调一次 pcx_solve
    accumulator -= DT;
}
```

| 宿主 | 时钟源 | 备注 |
|---|---|---|
| Unity | `Time.deltaTime`（Editor 下即帧间隔） | 累加器保证 `DT` 恒定，避免 60/144 Hz 下结果不一致 |
| Web | `requestAnimationFrame` 的时间戳 | 同上；标签页切回来时 `accumulator` 需 clamp（单次补算上限 200 ms） |

`step(DT)` 里应用要做的四件事（都是**应用的责任**，库一概不管）：

1. **`KT.elapsed_ms`**：线圈带电 → `+= DT`；失电 → 归零（通电延时型）。
2. **`FR.elapsed_ms`**：上一轮有 `W_OVERCURRENT` → `+= DT`；否则归零（不做冷却曲线）。
3. **`rpm`**（`KS` / `M` 所在 `shaft_group`）：**应用自己算**（得电升速、失电按惯性降速、反接反向）。⚠️ **本期演示页没有消费者**：C3 里没有 `KS`，而 `M` 是恒定阻抗不读 `rpm`。这一条在实现 C9 案例时才落地（边界见 `demo.md` §1）。
4. **`state_bits`**：把上一轮的 `KM`/`KA` 触点状态作为下一轮的提示传回（延续滞环，见 `solver.md` §6）。

> 第 3 条是"库不算转速"（D-20261103-18）的落点：转速是**应用给的输入**，不是库的输出。它是 C9 反接制动能演示的前提，但**本期不做 C9**，故 `demo.md` 的 C3 演示页里没有 `rpm` 控件。

## 3 Unity 侧

### 3.1 使用方工程内的落位

```
Assets/
├── Plugins/x86_64/pcx_circuit.dll        # 由 scripts/ 拷贝，.meta 交给 Unity 生成
└── PcxCircuit/
    ├── PcxCircuit.cs                     # 托管门面（唯一入口）
    ├── PcxNative.cs                      # DllImport 声明 ＋ 结构体
    ├── PcxErrorText.cs                   # 错误码 → 中文
    └── Samples~/Sample_TwoLocationControl.cs
```

- **禁止手写 `.meta`**：DLL 与脚本拷贝后由 Unity 自己导入生成（`AGENT.md` §2）。
- 只在 `UNITY_EDITOR && UNITY_STANDALONE_WIN` 下启用；其他平台编译期报错提示"本库只覆盖 Windows Editor"，不要静默降级。

### 3.2 P/Invoke 写法要点

```csharp
[StructLayout(LayoutKind.Sequential)]
internal struct PcxDevice { public unsafe fixed double Params[8]; /* … 见 api.md §2.1 */ }

[DllImport("pcx_circuit", CallingConvention = CallingConvention.Cdecl)]
internal static extern uint pcx_solve(ref PcxInput input, ref PcxOutput output);
```

- 结构体必须 `LayoutKind.Sequential` 且字段顺序与 `api.md` 完全一致；`Marshal.SizeOf` 与 `api.md` 标注的字节数**在启动时断言一次**，不一致直接抛 —— 这是防"布局漂移"的唯一低成本手段。
- 结果缓冲用 `Marshal.AllocHGlobal` ＋ 用完即 `FreeHGlobal`（库不提供 `free`，D-20261103-17）。
- 只在**交互发生时**调 `pcx_solve`（按 `DT` 步进），不要在 `Update` 里每帧求解。

## 4 Web 侧

### 4.1 产物与调用

```
bindings/web/
├── pkg/            # wasm-pack 输出（不入库）
├── pcx.ts          # 封装：DataView 填结构体、错误文案
├── demo.html       # 单文件演示页
└── demo.js         # 演示页逻辑（Canvas 2D）
```

wasm 内存模型与 C ABI 一致：用 `WebAssembly.Memory` 的 `buffer` 建 `DataView`，自己按 `api.md` 的偏移写字段、按两阶段查询取结果。不要试图在 JS 侧映射结构体对象。

### 4.2 演示页规格

**详见 `demo.md`** —— 电路网表（15 器件 / 30 导线）、布局坐标、接点几何规则、配色、交互状态机、诊断文案、验收清单 D-1…D-9 全部在那份文档里，本节不复述（单一事实源）。

本文件只固定三条不变量：

1. **技术形态**：单文件 HTML ＋ Canvas 2D，不用框架、不用 SVG（D-20261103-16）。
2. **本期只做 C3 一个案例**，不含 `KS` / `rpm`（`demo.md` §1）。
3. **端子 id 与坐标解耦**：`TerminalId → (x, y)` 是一张独立映射表，将来换三维只换这张表。

## 5 交付脚本

```
scripts/build.mjs   # cargo build (core/dll/wasm) + 把 wasm 拷到 bindings/web/pkg/
scripts/compare.mjs # 双端比对：wasm 侧逐条核对 fixtures 的期望值
scripts/serve.mjs   # 本地静态服务（演示页要 http:// 才能 fetch wasm 与 fixture）
```

- Node 脚本（`node scripts/xxx.mjs`），跨平台，不依赖 wasm-pack（wasm 走手写 C ABI ＋ 直载）。
- 产物不入库（`architecture.md` §6）；不做 `git add`。
- 演示页打开方式：`node scripts/serve.mjs` → `http://localhost:8080/bindings/web/demo.html`。**不要用 `file://` 直接打开**（fetch 会被 CORS 挡）。
- Unity 侧 DLL 落位：`target/x86_64-pc-windows-msvc/release/pcx_circuit.dll` → `<工程>/Assets/Plugins/x86_64/`，`.meta` 交给 Unity 生成。

## 6 双端等价的验证入口

同一份 `fixtures/C*.json` 在三个地方跑，结果必须字节一致：
① `cargo test`（直接调 `core`）；② Unity 样例（走 `PcxCircuit.cs`）；③ 演示页旁的 `node scripts/check-web.mjs`（走 wasm）。

比对项：每接点 4 个 `f64` 的**字节值**（不是"差不多"）。判据与容差见 `verification.md` §4。
