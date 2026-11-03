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
| 工程口径 | **25 条已拍板**（编号至 D-20261103-26，[`DECISION.md`](DECISION.md)），待拍板 0 |
| 工程文档 | **9 份首版完成**（[`docs/README.md`](docs/README.md)） |
| 代码 | 未开始 —— 从 **M0** 起（[`docs/roadmap.md`](docs/roadmap.md)） |
| 里程碑 | M0 骨架 → M1 内核最小切片 → M2 案例铺满 → M3 双端 → M4 演示页 → M5 收口 |

## 目录

```
AGENT.md            agent 唯一手册（纪律与索引）
docs/               工程内容事实源（9 份设计文档）
.agent/             agent 操作目录（流程 / 技能脚本 / 样例 / 踩坑笔记）
.github/            CI 与 issue、PR 模板
TODO.md             待办与待拍板台账
DECISION.md         已拍板口径台账
RECORD.md           已提交台账
LICENSE             MIT
```

代码落地后会多出：`crates/{core,cabi,wasm}`、`bindings/{csharp,web}`、`fixtures/`、`scripts/`。

## 快速开始

当前仓库只有文档与工具脚本，**还没有可编译的代码**。现在能跑的两条：

```bash
# 校验文档地图、台账编号、AGENT 索引是否自洽（CI 第一个 job 也跑它）
node .agent/skills/doc-guard/check.mjs

# 预览会用 gh 建哪些标签 / 里程碑 / issue（不写远端）
node .agent/skills/gh-plan/apply.mjs --dry-run
```

两者都零依赖，Node ≥ 18。构建命令（`cargo build` / `cargo test` / `wasm-pack build`）在 M0 落地后
才会写进 [`AGENT.md`](AGENT.md) §4 —— 在此之前不写未验证的命令。

环境要求（M0 起）：Rust 1.95+，Windows 目标 `x86_64-pc-windows-msvc`；Web 端需要 `wasm32-unknown-unknown` 与 `wasm-pack`。

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

## 许可

[MIT](LICENSE)
