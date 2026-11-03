# TODO — 还没做 / 待拍板

读者：AI / 负责人
类型：台账
权威：**待办与待拍板项的唯一清单**
状态：2026-11-03 建立；当日清零 — **§1 当前无待拍板项**（口径 23 条已全定，见 `DECISION.md`）
依赖：`AGENT.md`（纪律）、`docs/README.md`（文档地图）、`docs/roadmap.md`（里程碑与门禁）、`DECISION.md`（已定口径）

## 0 用法

- **§1 待拍板（P-NN）**：只有负责人能定口径。AI **不得**自行选一个继续往下写；未拍的条目不写进 `DECISION.md`。
- **§2 待办（T-NN）**：我方动作，不需要拍板即可做；括号里是它所属里程碑（见 `docs/roadmap.md`）。
- 做完 / 拍板即**同批删掉**该条（拍板的同时在 `DECISION.md` 追加 `D-YYYYMMDD-NN`）。不写缘由、不写提交号、不留"已完成"。
- 新增待拍板项一律追加到 §1 末尾，**编号不复用**（P-01…P-22 已用尽，从 P-23 起）。

## 1 待拍板

**（无）** 口径已全部拍板：`DECISION.md` D-20261103-01…23。新问题出现时按编号 P-23 起追加于此。

## 2 待办

### M0 骨架与工具链（门禁 G0）

- **T-01** 建立 `.gitignore`：`target/`、`bindings/web/pkg/`、`dist/`、`*.dll`、`*.wasm`、`node_modules/`、C# `bin/ obj/`。
- **T-03** 补装 Web 工具链：`rustup target add wasm32-unknown-unknown` ＋ `wasm-pack`（本机现只有 `x86_64-pc-windows-msvc` / `-gnu`）。
- **T-07** 搭 Rust workspace 骨架（`crates/{core,cabi,wasm}` ＋ `bindings/{csharp,web}` ＋ `fixtures/` ＋ `scripts/`），一个空 `pcx_solve` 导出 ＋ 一个恒等测试，跑通 `cargo build` / `cargo test` / `wasm-pack build`。

### M1 内核最小垂直切片 · 只跑 C3（门禁 G1）

- **T-08** `core::consts` 落地 `solver.md` §5 的 `N-01…N-12`，逐项编号对齐，实现三层覆盖机制。
- **T-09** C3 双开双控单网表全链路：`netlist` → `consts` → `union`（稳定编号）→ `refpoint` → `device`（8 类）→ `mna`（LU ＋ 残差）→ `switch_iter`（滞环 ＋ 振荡检测），跑到 `M` `5.02 A` / `KM` 线圈 `26.3 mA` 断言绿。

### M2 器件与案例铺满（门禁 G2）

- **T-10** 剩余 7 类器件（`FU` / `KA` / `KT` / `KS` / `R` / `EL` / `TB`）＋ 短路拓扑预检接入每轮迭代 ＋ 诊断码 ＋ `fixtures/C1…C10.json`（含 `baseline_source` 与每类一条反例）。

### M3 双端打通（门禁 G3）

- **T-12** `cabi` 定稿（`api.md` 四个函数 / 五个结构体 ＋ 偏移 `static_assert`）＋ `bindings/csharp`（`PcxNative` / `PcxCircuit` / `PcxErrorText` ＋ 启动 `Marshal.SizeOf` 断言）＋ Unity Mono 样例 ＋ `bindings/web/pcx.ts` ＋ `scripts/compare`。

### M4 演示页（门禁 G4）

- **T-11** Canvas 2D 演示页（`bindings/web/demo.*`），严格按 **`docs/demo.md`** 实现：图元层 ＋ 数据层（读 `fixtures/C3.json`）＋ 交互层（增删线 / 操作 `SB·QS·SQ`）＋ **接点悬停浮层（任意接点必有五行数据）** ＋ **工具栏（清空全部导线 / 恢复初始）** ＋ 右侧接点表与诊断栏；验收见 `demo.md` §10 与 §10.1 的 D-1…D-14。

### M5 交付收口（门禁 G5）

- **T-13** `AGENT.md` §4 回填四条实测命令与真实输出；`bindings/{csharp,web}` 与仓库根三份 README 写清接入方式；`RECORD.md` 登记 `R-01` 起；`TODO.md` §2 转入二期清单（B′ / 瞬时值 / 三维 / 移动端 / 教材校准）。
