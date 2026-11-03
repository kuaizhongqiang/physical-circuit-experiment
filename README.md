# physical-circuit-experiment

[![ci](https://github.com/kuaizhongqiang/physical-circuit-experiment/actions/workflows/ci.yml/badge.svg)](https://github.com/kuaizhongqiang/physical-circuit-experiment/actions/workflows/ci.yml)

电力拖动电路的**计算内核库**：输入一张电路网表（元器件 ＋ 接线 ＋ 电源参数），输出每个接点的电压 / 电流与每台器件的工作状态。一份 Rust 源码同时产出 **Unity 用的 Windows DLL** 与 **Web 用的 wasm**。

> 你画线，我算电位。

## 为什么单独做一个库

Unity 工程里用 C# 做拓扑电路计算踩过坑，但问题不在语言 —— 稳态电路求解本质是**稀疏线性方程组 ＋ 开关型非线性迭代**，成熟且不依赖语言。真正容易错的是建模与数值口径：等势点合并后的索引映射、接触器自锁的迭代收敛、三相单位与复数混用、拓扑变更后矩阵未重排、缺参考点导致的奇异矩阵。

把这五件事在**一处**用类型和测试钉死，才能保证 Unity 端和 Web 端给出**字节级相同**的结果。详细根因分析见 [`docs/solver.md`](docs/solver.md) §1。

## 两个交付物

| 端 | 四件套 | 覆盖 |
|---|---|---|
| **Unity** | Windows DLL ＋ C# 接口 ＋ Mono 样例 ＋ 接入文档 | 只覆盖 Unity Editor（Windows），不做移动端 / WebGL |
| **Web** | wasm ＋ JS/TS 接口 ＋ 样例 ＋ **Canvas 2D 演示页** | 演示页单文件 HTML，无需本地服务 |

不发布 npm，产物直接拷贝即用。

## 本期电路范围（10 类）

| # | 电路 | 关键器件 |
|---|---|---|
| C1 | 点动（点控） | `SB` `KM` `M` |
| C2 | 单控自锁 | `KM` 辅助常开自锁、`FR` 95-96 |
| C3 | **两地 / 多地点控制（双开双控）** | 两组 `SB` 启停 —— **演示页就是它** |
| C4 | 正反转 | 两只 `KM` ＋ 电气互锁 |
| C5 | 降压启动（星三角） | `KM`×3 ＋ `KT` |
| C6 | 延迟启动 | `KT` |
| C7 | 变速（双速电机） | 两套 `M` 绕组 |
| C8 | 能耗制动 | 制动电阻（复用 `R`） |
| C9 | 反接制动 | **`KS` 速度继电器** |
| C10 | 顺序控制 | **`SQ` 行程开关** |

15 类器件：`POWER` `QS` `FU` `KM` `KA` `KT` `KS` `FR` `SB` `SQ` `M` `R` `EL` `TB` `PE`（导线不是器件，是独立的 `wires` 数组）。

**本期只算电气量**：输出通断与电压电流，不输出转速、转矩、制动时间与启动曲线。因此能耗制动的电流恒为 0（无源回路），这是已声明的设计结果，不是缺陷 —— 见 [`docs/verification.md`](docs/verification.md) §5。

## 现在到哪一步

**口径与设计已完成，代码尚未开始。**

| 项 | 状态 |
|---|---|
| 工程口径 | **27 条已拍板**（编号至 D-20261103-28，[`DECISION.md`](DECISION.md)），待拍板 0 |
| 工程文档 | **9 份首版完成**（[`docs/README.md`](docs/README.md)） |
| 内核 | **已落地**：15 类器件、相量 MNA、开关迭代、短路拓扑预检；10 份 fixture / 28 个 case 全绿 |
| 双端 | DLL 与 wasm 均产出；wasm 侧 28 个 case 与 fixture 期望逐条一致 |
| 演示页 | 已实现并人工验收（Canvas 2D，C3 两地控制）：悬停五行数据、按下/抬起操作、删光重接、导线清单（[`docs/demo.md`](docs/demo.md)） |
| 里程碑 | **M0–M5 全部完成**；二期清单见 [`docs/roadmap.md`](docs/roadmap.md) §6 |

## 目录

```
crates/core/        计算内核（无 IO、无 unsafe、无时钟）
crates/cabi/        C ABI 边界 → pcx_circuit.dll（Unity P/Invoke）
crates/wasm/        wasm32 入口（手写 C ABI，不依赖 wasm-pack）
bindings/csharp/    Unity 四件套（DLL 落位 / 接口 / 样例 / 文档）
bindings/web/       PCX.js 门面 ＋ Canvas 2D 演示页
fixtures/           C1…C10 网表 ＋ 期望值（双端共用的判据）
scripts/            build / compare / serve
docs/               工程内容事实源（9 份设计文档）
.agent/             agent 操作目录（流程 / 技能脚本 / 样例 / 踩坑笔记）
.github/            CI 与 issue、PR 模板
AGENT.md            agent 唯一手册（纪律与索引）
TODO.md / DECISION.md / RECORD.md   三台账
LICENSE             MIT
```

## 快速开始

```bash
# 内核测试：单测 + 10 份 fixture / 28 个 case
cargo test --workspace

# 产出两端：pcx_circuit.dll 与 wasm（并拷到 bindings/web/pkg/）
node scripts/build.mjs

# 双端比对：wasm 侧逐条核对 fixture 期望值
node scripts/compare.mjs

# 演示页（必须走 http，别用 file://）
node scripts/serve.mjs   # → http://localhost:8080/bindings/web/demo.html

# C# 绑定编译校验
dotnet build bindings/csharp -v q

# 文档与台账自洽（CI 第一个 job 也跑它）
node .agent/skills/doc-guard/check.mjs
```

环境：Rust 1.95+（目标 `x86_64-pc-windows-msvc` ＋ `wasm32-unknown-unknown`）、Node ≥ 18；C# 校验需 .NET SDK。
**不需要 wasm-pack** —— wasm 走手写 C ABI ＋ `WebAssembly.instantiate`。

## 怎么读这个仓库

| 你想 | 去 |
|---|---|
| 知道**别做什么**、文档怎么分工、怎么提交 | [`AGENT.md`](AGENT.md) |
| 找某份设计文档 | [`docs/README.md`](docs/README.md) |
| 看范围与"不做"清单 | [`docs/overview.md`](docs/overview.md) |
| 看求解算法与数值口径 | [`docs/solver.md`](docs/solver.md) |
| 看器件接点与参数 | [`docs/domain-model.md`](docs/domain-model.md) |
| 看接口契约与错误码 | [`docs/api.md`](docs/api.md) |
| 看验收案例与基线 | [`docs/verification.md`](docs/verification.md) |
| 看演示页规格 | [`docs/demo.md`](docs/demo.md) |
| 看实施顺序与门禁 | [`docs/roadmap.md`](docs/roadmap.md) |
| 还没做 / 已拍板 | [`TODO.md`](TODO.md) / [`DECISION.md`](DECISION.md) |

## 发布

当前版本 **v0.0.0**（2026-11-03 首发）。版本从 `v0.0.0` 起。**tag 必须与 `Cargo.toml` 的 `version` 一致**，流水线会校验，不一致直接失败。

```bash
gh workflow run release.yml -f version=v0.0.0   # 或 git push origin v0.0.0
```

流水线依次做：版本一致性检查 → fmt / clippy / test → 构建 DLL 与 wasm → 双端比对 → 打包 → 建 Release。
Release 附件：`pcx-unity-<tag>.zip`（DLL ＋ C# ＋ 接口文档）、`pcx-web-<tag>.zip`（wasm ＋ JS ＋ 演示页）、以及两个裸产物。
详见 [`.agent/workflows/05-release.md`](.agent/workflows/05-release.md)。

## 许可

[MIT](LICENSE)
