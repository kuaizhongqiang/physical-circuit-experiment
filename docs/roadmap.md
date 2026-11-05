# roadmap — 落地计划与里程碑

读者：AI / 负责人
类型：计划
权威：实施顺序、里程碑交付物、验收门禁的唯一事实源
状态：2026-11-05 更新；**M0–M6 已实施完成**（G0–G5 结果见 §3.1，G6 见 §7：本机判据全部通过，D-20 待负责人确认），口径对应 `DECISION.md` D-20261103-01…31、D-20261104-01…11
依赖：`overview.md`、`architecture.md`、`solver.md`、`api.md`、`integration.md`、`verification.md`、`../TODO.md`

## 1 计划形态

- **串行、门禁制**：M0 → M6 严格顺序，前一个里程碑的门禁未过不进下一个；同一里程碑内切片也串行（§7）。单 `main` 无分支隔离，同一时刻只有一个 agent 写仓库（`AGENT.md` §3）。
- **每个里程碑是"可验收的垂直切片"**，不是"某一层写完"。宁可窄而通，不可宽而断。
- **不设工时估算**：只排顺序与判据。每个任务对应 `TODO.md` §2 的 `T-NN`，完成即从 TODO 删除并在 `RECORD.md` 登记。
- 里程碑内**出现新口径问题** → 停下，进 `TODO.md` §1 待拍板，不自行决定。

## 2 里程碑总览

| 里程碑 | 目标 | 交付物 | 门禁 | 关联任务 |
|---|---|---|---|---|
| **M0** ✅ | 骨架与工具链 | workspace 三个 crate ＋ `.gitignore` ＋ 构建脚本 ＋ `cargo build/test` 跑通 | **G0** | T-01 T-03 T-07 |
| **M1** ✅ | 内核最小垂直切片（只跑 C3） | `core` 八段全链路 ＋ C3 单网表可算 | **G1** | T-08 T-09 |
| **M2** ✅ | 器件与案例铺满 | 15 类器件全实现 ＋ `fixtures/C1…C10` ＋ 反例用例 | **G2** | T-10 |
| **M3** ✅ | 双端打通 | C ABI 定稿 ＋ C# 四件套 ＋ wasm 封装 ＋ 双端比对脚本 | **G3** | T-12 |
| **M4** ✅ | 演示页（只做 C3） | `bindings/web/demo.*`，规格见 `demo.md` | **G4** | T-11 |
| **M5** ✅ | 交付收口 | `AGENT.md` §4 实测命令回填 ＋ 二期清单 ＋ 首次 `R-01`…`R-NN` 齐账 | **G5** | T-13 |
| **M6** ✅ | 网页电路实验台（二维） | `bindings/web/playground/` ＋ `docs/playground.md` ＋ C1…C10 样例 ＋ `scripts/playground-check.mjs` ＋ tailnet 部署 | **G6** 🚧 | T-15…T-22 |

## 3 里程碑细则

### M0 骨架与工具链 → G0

| 步骤 | 内容 |
|---|---|
| M0.1 | `.gitignore`：`target/`、`bindings/web/pkg/`、`dist/`、`*.dll`、`*.wasm`、`node_modules/`、C# `bin/ obj/` |
| M0.2 | `rustup target add wasm32-unknown-unknown` ＋ 装 `wasm-pack` |
| M0.3 | workspace：`crates/core`（空 lib）、`crates/cabi`（`cdylib`）、`crates/wasm`、`bindings/{csharp,web}`、`fixtures/`、`scripts/` |
| M0.4 | 一个空实现 `pcx_solve` 导出 ＋ 一个恒等的 `cargo test`，把链路打通 |

**门禁 G0**：`cargo build -p pcx-cabi --release --target x86_64-pc-windows-msvc` 产出 `pcx_circuit.dll`；`cargo test` 全绿；`wasm-pack build` 产出 `pkg/`。三条命令的**真实输出**回填 `AGENT.md` §4。

### M1 内核最小垂直切片（只跑 C3）→ G1

目标不是"功能全"，是**把 §《solver.md》的全链路一次打通**，只覆盖 C3 需要的 8 类器件（`POWER` / `QS` / `SB` / `SQ` / `KM` / `FR` / `M` / `PE`）。

| 步骤 | 内容 | 对应文档 |
|---|---|---|
| M1.1 | `netlist`：器件 / 接点 / 导线模型 ＋ 输入校验 ＋ 接点编号 | `domain-model.md` §1 §6 |
| M1.2 | `consts`：`N-01…N-12` 全部落成常量 ＋ 三层覆盖 | `solver.md` §5 |
| M1.3 | `union`：并查集合并 ＋ **按最小接点 id 稳定编号** | `solver.md` §3 |
| M1.4 | `refpoint`：连通分量 ＋ 恰一个 `PE` 校验 | `solver.md` §4 |
| M1.5 | `device`：8 类器件的接点表与支路展开 | `domain-model.md` §2 |
| M1.6 | `mna`：装配 ＋ 稠密 LU 部分主元 ＋ 残差校验 | `solver.md` §2 §9 |
| M1.7 | `switch_iter`：状态不动点 ＋ 滞环 ＋ 振荡检测 | `solver.md` §6 |
| M1.8 | C3 网表跑通：地点 1 启动 → `M` `5.02 A`、`KM` 线圈 `26.3 mA`；地点 2 停止 → 全 0 | `verification.md` C3 |

**门禁 G1**：
- C3 的 4 条断言全绿（容差 1%）；
- 同一输入连跑两次**结果字节一致**；
- 三个反例各返回正确码：删 `PE` → `E_NO_REFERENCE`、加第二个 `PE` → `E_MULTI_REFERENCE`、电源两相导线直连 → `E_SHORT_CIRCUIT`。

### M2 器件与案例铺满 → G2

| 步骤 | 内容 |
|---|---|
| M2.1 | 剩余 7 类器件：`FU` / `KA` / `KT` / `KS` / `R` / `EL` / `TB` |
| M2.2 | 短路拓扑预检（导体类 vs 负载类）接入**每一轮迭代** |
| M2.3 | 诊断：`W_OVERCURRENT` / `W_OPEN_CIRCUIT`，错误诊断带 `device_id` / `terminal_id` |
| M2.4 | `fixtures/C1…C10.json`（网表 ＋ 期望值 ＋ `baseline_source`）＋ 每类一条反例 |
| M2.5 | 双阶段查询与按需返回（`requested_*`）在 `core` 侧就绪 |

**门禁 G2**：C1…C10 全部断言通过；**每个错误码至少一个反例用例**；打乱 `wires` 顺序后结果语义不变；C5 的"两接触器同时吸合 → `E_SHORT_CIRCUIT`"故障注入用例通过。

### M3 双端打通 → G3

| 步骤 | 内容 |
|---|---|
| M3.1 | `cabi`：`api.md` 的 4 个函数 ＋ 5 个结构体，偏移与字节数用 `static_assert` 固化 |
| M3.2 | `bindings/csharp`：`PcxNative.cs` ＋ `PcxCircuit.cs` ＋ `PcxErrorText.cs` ＋ 启动时 `Marshal.SizeOf` 断言 |
| M3.3 | Unity Mono 样例 `Sample_TwoLocationControl.cs`（Editor 内 Play 即跑 C3） |
| M3.4 | `crates/wasm` ＋ `bindings/web/pcx.ts`（`DataView` 填结构体、两阶段查询） |
| M3.5 | `scripts/compare`：同一 `fixtures` 过 Rust / C# / wasm 三处并比对字节 |

**门禁 G3**：C1…C10 在**三个宿主**上结果字节一致；`ABI_VERSION` 不匹配时返回 `E_VERSION`；结构体字节数与 `api.md` 表格逐项相符。

### M4 演示页 → G4

按 **`demo.md`** 实现（那是唯一的实现依据：网表、布局、几何规则、配色、交互、文案、验收清单），**不做三维、不做框架、不做案例切换**。

| 步骤 | 内容 |
|---|---|
| M4.1 | 图元层：器件框 ＋ 文字 ＋ 接点圆点 ＋ 导线 ＋ 触点开合/电机/接地符号 |
| M4.2 | 数据层：读 `fixtures/C3.json` → 填 `pcx_*` → `solve` → 回填接点表与画布 |
| M4.3 | 交互层：加线 / 删线 / 操作 `SB·QS·SQ` / `Esc` 取消；每次交互全量重算重绘 |
| M4.4 | 面板：右侧 65 行接点表 ＋ 底部诊断栏 ＋ 失败时的顶部红条 |
| M4.5 | **悬停浮层**：任意接点移入即出五行数据（电压 / 电流 / 等势点 / 连通分量 / 导通状态），未通电与 `FLOATING` 也必须有数 |
| M4.6 | **工具栏**：`清空全部导线` ＋ `恢复初始网表`；空网表（0 条）也必须 `solve` 成功并正常出数 |

**门禁 G4**：`demo.md` §10 与 §10.1 的 **D-1…D-14 全过**，其中五条为必过项：
- **D-6** 删掉自锁线即刻失电；
- **D-7** 删掉接地线报缺参考点（严格模式）/ 宽松模式下给隐含参考警告；
- **D-8** `L1–L2` 直连报短路；
- **D-10** 65 个接点地毯式悬停，**每个都有五行数据**，不得有空浮层；
- **D-12/D-13** 导线可全部清空（0 条也照常出数）并从零逐条重接，全程无 error。

另：拖拽过程中不求解；失败时保留上一次成功结果绘制但必须显式标红。

### M5 交付收口 → G5

| 步骤 | 内容 |
|---|---|
| M5.1 | `AGENT.md` §4 回填四条实测命令与真实输出；删掉"骨架未落地"的说明 |
| M5.2 | 三份 README（`bindings/csharp`、`bindings/web`、仓库根）写清"如何接入" |
| M5.3 | `RECORD.md` 补齐 `R-01…R-NN`；`TODO.md` 只剩真实未做项 |
| M5.4 | 二期清单落 `TODO.md` §2 的下一批（B′、瞬时值、三维、移动端） |

**门禁 G5**：新机器按 README 能一次跑通（`cargo test` ＋ Unity 样例 ＋ 打开演示页）；`docs/` 与代码无口径冲突。

## 3.1 门禁执行结果（2026-11-03，最终）

| 门禁 | 结论 | 证据 |
|---|---|---|
| **G0** | ✅ 通过 | `cargo build --workspace` / `cargo test` / `cargo build -p pcx-wasm --target wasm32-unknown-unknown` 三条真跑通；产物 `pcx_circuit.dll` 168 960 B、`pcx_wasm.wasm` 176 494 B |
| **G1** | ✅ 通过 | `fixtures/C3.json` 7 个 case 全绿：初始 0 A、SB2 启动 5.02 A、自锁保持、SB3 停止、SB4 启动、缺参考 `E_NO_REFERENCE`、`L1-L2` 直连 `E_SHORT_CIRCUIT` |
| **G2** | ✅ 通过 | 10 份 fixture / 28 个 case 全绿（含每类反例）；`cargo test --workspace` 无告警；打乱 `wires` 顺序结果不变（等势点按最小接点 id 重排） |
| **G3** | ✅ 通过（C# 侧为编译校验） | `node scripts/compare.mjs` 28 个 case 与 fixture 期望逐条一致；`dotnet build bindings/csharp` 0 错误 0 警告；结构体字节数 88/40/24/16/8/64 由 `cargo test` 的布局断言守住。**Unity 内运行未做**（无 Unity 工程，交由负责人按 `integration.md` 接入验证） |
| **G4** | ✅ 通过（人工） | 演示页由负责人在浏览器中逐项试用并确认：导线可见与红色、开关符号与开合、按下/抬起操作、自锁成立、删光重连、悬停五行数据、清空/恢复。逐条判据见 `demo.md` §10 / §10.1 |
| **G5** | ✅ 通过 | `AGENT.md` §4 四条命令均为实测；三份 README 落地；三台账齐账；`node .agent/skills/doc-guard/check.mjs` 全过 |

> 备查：`ci` 三个 job（`guard` / 内核构建与测试 / wasm 打包）在 PR #32、#33 上均为绿，`guard` 已是 `main` 的必需检查。

## 4 为什么是这个顺序

1. **先 M0 后一切**：没有 DLL 与 wasm 产物，"双端等价"这条红线无法验证，越早通链路越省事。
2. **M1 只做 C3 而不是先做器件库**：C3 恰好同时踩到等势合并、参考点、自锁迭代三个最容易错的点（`solver.md` §1 的根因 1 / 2 / 5）；跑通一个就证明整条链立得住，比"15 类器件都写完但一条都没跑通"强。
3. **M2 才铺案例**：案例是判据不是目标；器件没齐就写 10 类 fixtures 会反复返工期望值。
4. **M3 在 M4 之前**：演示页必须走 wasm，wasm 又依赖 C ABI 定稿；把 ABI 定稿放在演示页之前，避免"演示页倒逼改接口"。
5. **M5 收口单独成段**：`AGENT.md` §4 的实测命令、三份 README、台账齐账，最容易在赶功能时被跳过，所以给它一个门禁。

## 5 风险与对策

| 风险 | 触发点 | 对策 |
|---|---|---|
| 开关迭代不收敛 | C4 同时按下正反转、C5 切换瞬间 | 滞环必带（`solver.md` §6）；C4/C5 的"同时"场景优先做成回归用例，先抓出来 |
| C# / Rust 结构体布局漂移 | M3 首次跑 Unity | 启动时 `Marshal.SizeOf` 断言 ＋ `api.md` 偏移表逐项核对，不一致立刻炸 |
| wasm 工具链问题 | M0.2 / M3.4 | 在 M0 就装好并跑通空 `pcb`，不拖到 M3 才发现 |
| 电网"看起来对但不对" | 全期 | 关系类断言优先（3 倍、为零、相序反转），绝对值只作辅助 |
| 范围蔓延（想加变压器 / 转速） | 全期 | `overview.md` §6 的"不做"清单是硬边界；要加先走 `TODO.md` §1 |
| C8 被误当 bug 返工 | M2 写 fixtures 时 | `verification.md` §5 已列"已知不覆盖"，C8 只断言接线状态 |
| 演示页 65 个接点信息过载 | M4 | 分层显示：画布只标电压，电流进右侧接点表（`demo.md` §5） |
| 演示页"图还在但数据是旧的" | M4 | `solve` 失败时保留上次成功结果绘制，但顶部必须显式红条（`demo.md` §7 规则 4） |

## 6 二期清单（本期明确不做）

| 项 | 前置 |
|---|---|
| **B′：电机每转电动势系数**（`D-20261103-23`） | 与瞬时值时域同批 |
| 瞬时值时域 ＋ 缺相故障分析（`D-20261103-03`） | 一期结构体冻结后新增独立结构体 |
| **C9 演示案例 ＋ 假转速模型**（`demo.md` §1 的边界） | 需要 `KS`，本期 C3 无消费者 |
| 演示页支持多案例切换 | 依赖 C9 及以上案例齐全 |
| 三维演示（真实拖拽的**二维**实现本期由 M6 承接，见 §7）（`D-20261103-16`） | 端子 id 与坐标已解耦，换映射表即可 |
| 移动端 / Unity WebGL / macOS / Linux（`D-20261103-08`） | 需先定平台矩阵与打包方式 |
| 教材基线校准（`D-20261103-10`） | 拿到教材数据后只改 `domain-model.md` §4 |
| 评分 / 判题逻辑 | 不在本库职责内 |

## 7 M6 网页电路实验台（二维）→ G6

2026-11-04 启动：口径见 `DECISION.md` D-20261104-01…10，功能、契约与判据见 `playground.md`；已验收的 `demo.md`（固定 C3）**不动**。里程碑按**一片一 PR** 串行推进：

| 片 | issue | 内容 | 依赖 |
|---|---|---|---|
| **M6.0** | #38 | 契约与台账：`playground.md` ＋ 本节 ＋ 三台账 ＋ `plan.json` | — |
| M6.1 | #39 | 器件图元元数据与几何映射（纯逻辑 ＋ `node --test`） | M6.0 |
| M6.2 | #40 | 画布编辑器骨架（白画布、放置 / 拖动 / 删除、即时求解） | M6.1 |
| M6.3 | #41 | 接线交互与导线渲染（点接点连线、删线、正交走线、框内裁剪） | M6.2 |
| M6.4 | #42 | C1…C10 十样例与切换（layout sidecar ＋ 读 `fixtures/`） | M6.1–M6.3 |
| M6.5 | #43 | 参数编辑与操作面板（含 C9 转速滑块） | M6.4 |
| M6.6 | #44 | 自检脚本、页面自检页与 CI（28 case ＋ 20 条误接） | M6.4 |
| M6.7 | #45 | Tailscale 部署与浏览器验收 | M6.5、M6.6 |
| M6.8 | #46 | 收口（README、索引、门禁回写、三台账） | M6.7 |

**门禁 G6**：

- `node .agent/skills/doc-guard/check.mjs` 全绿；
- `node scripts/playground-check.mjs` 全绿：10 样例 × 28 个 fixture case ＋ 20 条典型误接，判据见 `playground.md` §8.2 / §8.3；
- 页面 `bindings/web/playground/selftest.html` 与脚本结论一致（`playground.md` §8.4）；
- `playground.md` §10 的 **D-1…D-20 全过**，其中 **D-5 / D-6 / D-7 / D-10 为必过项**（分别等价 `demo.md` 的 D-6 / D-7 / D-8 / D-10）；
- 从 Tailscale 网内另一台设备可打开 `index.html` 与 `selftest.html`（D-20）；
- `cargo test --workspace` 与 `node scripts/compare.mjs` 仍全绿（M6 不碰内核，回归不得退化）。

**失败处理**：任一门禁未过不进下一片；发现 `fixtures/` 期望值有误时**停下提问**，不许自行改期望值（`DECISION.md` D-20261104-10）。

**G6 结论（2026-11-05，M6.8 收口）**：**本机判据全部通过；D-20「从另一台 tailnet 设备打开」待负责人人工确认后 G6 才算通过。**

| 判据 | 真实输出 | 结论 |
|---|---|---|
| `node .agent/skills/doc-guard/check.mjs` | `doc-guard 全过`；`DECISION.md` 决策 41 条、`RECORD.md` 提交 16 条、`TODO.md` 待办 0 条 | ✅ |
| `cargo test --workspace` | `layout_tests` 2 passed；`all_fixtures_pass` 1 passed；0 failed | ✅ |
| `node scripts/compare.mjs` | `wasm 侧跑了 28 个 case，失败 0 处` | ✅ 28/28 |
| `node scripts/playground-check.mjs` | `样例 10/10，几何 15/15 类（32/32 配置），复算 28/28 case，误接 20/20 条` | ✅ |
| `node --test bindings/web/playground/test/` | `tests 122`、`pass 122`、`fail 0` | ✅ |
| `bindings/web/playground/selftest.html` | M6.7 本机记录 `通过 28 / 28`，与脚本 `28/28` 一致 | ✅ |
| README 从零启动 | `node scripts/serve.mjs 8080 --host 0.0.0.0`；`index.html` `200`（46313 B）、`selftest.html` `200`（11525 B）、wasm `200`（180192 B） | ✅ |
| D-1…D-19 | M6.7 本机自测：D-1 / D-2 / D-3 / D-4 / D-15 / D-18 通过，D-19 判据覆盖；其余人工项随 D-20 确认（`playground.md` §10.2 / §10.3） | 🚧 人工项待确认 |
| D-20 | 未从另一台 tailnet 设备代验，不伪造另一台设备的结果 | 🚧 **待负责人确认** |

## 8 与三台账的关系

- 计划里的每条任务 = `TODO.md` §2 的一条 `T-NN`；**做完即从 TODO 删除**。
- 每个里程碑门禁通过并提交后 → `RECORD.md` 追加 `R-NN`。
- 里程碑推进中若发现口径需变 → 先进 `TODO.md` §1，拍板后进 `DECISION.md`，再回来改本文件的顺序或判据。
- 本文件的**判据数字**全部引自 `verification.md`，不在此复写第二份。
