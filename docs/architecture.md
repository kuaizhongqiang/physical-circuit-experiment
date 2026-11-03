# architecture — 模块分层、构建与仓库

读者：AI / 负责人
类型：设计
权威：仓库结构、crate 边界、构建产物与平台矩阵的唯一事实源
状态：2026-11-03 首版（骨架未落地，见 `../TODO.md` T-07）
依赖：`../DECISION.md`（D-01/D-08/D-12/D-17）、`solver.md`、`api.md`

## 1 为什么单仓 workspace

Unity 与 Web 必须跑**同一份内核**（D-20261103-01、`AGENT.md` §2「双端等价」）。单仓 workspace 让 `cargo test` 一次就能验内核，两个绑定 crate 只是薄壳；若拆成两仓，"两份实现悄悄分叉"必然发生。

## 2 目录结构

```
physical-circuit-experiment/
├── Cargo.toml                  # workspace 根，统一版本与 profile
├── crates/
│   ├── core/                   # 纯计算内核：无 IO、无 unsafe、无平台代码、不读时钟
│   ├── cabi/                   # cdylib，C ABI 边界（唯一允许 unsafe 的地方）
│   └── wasm/                   # wasm-bindgen，wasm32 入口
├── bindings/
│   ├── csharp/                 # Unity 四件套：PcxCircuit.cs、Plugins/、Samples~、README.md
│   └── web/                    # TS 接口、demo.html、demo.js（Canvas 2D 演示页）
├── fixtures/                   # 10 类电路的网表 ＋ 期望结果（JSON，双端共用）
├── scripts/                    # 构建 / 拷贝 / 双端比对脚本
└── docs/
```

`fixtures/` 是**双端等价的唯一判据来源**：Rust 单测、C# 样例、Web 演示页都读同一批 JSON。JSON 只用于测试与演示；ABI 上是结构体（D-20261103-07），不在运行期做 JSON 解析。

## 3 crate 边界与依赖方向

```
cabi ──┐
       ├──► core
wasm ──┘
bindings/* ──► 构建产物（dll / pkg）
```

| crate | 职责 | 硬边界 |
|---|---|---|
| `core` | 网表模型、等势点合并、器件展开、MNA 装配与求解、开关迭代、诊断 | **不读时钟 / 文件 / 环境变量，不打印，无 `unsafe`，无全局可变状态**（`AGENT.md` §2） |
| `cabi` | C ABI：入参校验、调用方缓冲填充、错误码翻译、`u32` 句柄化 | 不写电气规则；`unsafe` 每处带 `// SAFETY:` |
| `wasm` | `wasm-bindgen` 导出，供 TS 调用 | 同上，且不得引入 `std::time` |

`core` 内部模块（按求解顺序）：

| 模块 | 职责 |
|---|---|
| `consts` | 常量表（与 `solver.md` §5 逐项对应、逐项编号） |
| `netlist` | 器件 / 接点 / 导线的内存模型与合法性校验 |
| `device` | 15 类器件的接点表、支路展开、参数校核 |
| `union` | 导线 ＋ 端子排 → 等势点合并（并查集），输出稳定的等势点编号 |
| `refpoint` | 连通分量切分、参考点校验（`E_NO_REFERENCE` / `E_MULTI_REFERENCE`） |
| `mna` | 矩阵装配（含电压源增广行）、稠密 LU 部分主元求解、残差校验 |
| `switch_iter` | 开关状态不动点迭代、滞环、振荡检测 |
| `diag` | 错误码与结构化诊断（短路 / 过流 / 悬空 / 不收敛） |

## 4 求解数据流（一次 `solve`）

```
输入（电源参数 ＋ 器件数组 ＋ 导线数组 ＋ 器件跨时刻状态）
  → 校验（id 唯一、接点存在、参数在域）
  → 接点编号（按器件序 × 接点序，稳定）
  → 等势点合并（并查集，稳定编号）
  → 连通分量 + 参考点校验
  → 短路拓扑预检（导体类路径，见 solver.md §7）
  → 开关迭代：
        展开支路 → 装配 MNA → LU 求解 → 线圈电流 → 更新触点状态
        直到状态向量不变（≤ 100 轮）或触发 E_OSCILLATION
  → 结果填充（按调用方请求的接点 / 支路）+ 诊断
  → 输出（每接点 4 个 f64 ＋ 器件状态 ＋ 诊断列表）
```

**确定性**：接点编号、等势点编号、支路顺序、诊断顺序全部按显式排序规则生成，禁止依赖 `HashMap` 遍历顺序（`AGENT.md` §2）。

## 5 数值求解选型

- **一期用稠密 LU ＋ 部分主元**（自实现，零第三方依赖）。理由：10 类电路最多几十个接点，稠密解远超需求；自实现可完全控制残差校验与奇异判定，也免掉稀疏库的构建与跨平台麻烦。
- **残差校验**：解出后算 `‖Ax−b‖/‖b‖`，超过 `1e-10` 视为病态 → `E_SINGULAR_MATRIX`，不静默返回。
- **换稀疏库的触发条件**：单张网表接点数 > 200。届时换库只需动 `mna` 模块，其余模块不动。
- 电压源用 MNA 标准增广行（每个电源占一行一列），不靠"大电导近似"，避免引入新的数值口径。

## 6 构建与产物

| 目标 | 命令 | 产物 |
|---|---|---|
| 内核测试 | `cargo test` | — |
| Windows DLL | `cargo build -p pcx-cabi --release --target x86_64-pc-windows-msvc` | `target/x86_64-pc-windows-msvc/release/pcx_circuit.dll` |
| Web wasm | `wasm-pack build crates/wasm --target web --out-dir ../../bindings/web/pkg` | `bindings/web/pkg/*.js|*.d.ts|*.wasm` |
| 双端比对 | `scripts/compare.sh`（Windows 下 `.ps1`） | 差异报告 |

**注意**：上述命令需 `TODO.md` T-07（骨架）落地后才成立，且 `wasm32-unknown-unknown` 与 `wasm-pack` 尚未安装（T-03）。在本机实测通过之前，`AGENT.md` §4 不写这四条命令 —— 本表是**目标态**，落地后回填实测输出。

**产物不入库**：`target/`、`dist/`、`bindings/web/pkg/`、`*.dll`、`*.wasm` 全部在 `.gitignore` 内（`AGENT.md` §2「二进制不进库」）。交付靠 `scripts/` 一键产出并拷贝到使用方工程。

## 7 平台矩阵

| 平台 | 本期 | 说明 |
|---|---|---|
| Windows x64（Unity Editor） | ✅ | `cdylib` → `pcx_circuit.dll`，C# `P/Invoke` |
| Web（浏览器） | ✅ | `wasm32-unknown-unknown` ＋ `wasm-bindgen` |
| Android / iOS / macOS / Linux | ❌ | D-20261103-08，后续按需 |
| Unity WebGL（Player） | ❌ | Player 不能 `P/Invoke` 通用 DLL；若将来需要，只能走 Web 侧 wasm 路线 |

## 8 仓库与分支

- 单 `main`，线性提交；无分支隔离前**同一时刻只允许一个 agent 写仓库**（`AGENT.md` §3）。
- 提交信息 `type(scope): 描述`，scope ∈ `core` / `cabi` / `wasm` / `csharp` / `web` / `contract` / `docs`。
- 契约变更（`api.md` / `domain-model.md`）与两个绑定的实现**必须同批提交**，否则两端必然漂移。
- 不使用 Git LFS；工程内不存二进制与 `node_modules`。
