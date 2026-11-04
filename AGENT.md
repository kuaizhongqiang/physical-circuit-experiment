# AGENT.md — 物理电路实验工程（physical-circuit-experiment）

读者：AI
类型：纪律
权威：本工程**唯一**"有内容"的 agent 手册；**只写纪律与索引，不写描述**
状态：2026-11-03 建立（口径已拍板 30 条、编号至 D-20261103-31；`docs/` 9 份文档；**M0–M5 全部完成**，剩余为二期清单，见 `docs/roadmap.md` §6）
依赖：`docs/`（工程内容事实源）、`docs/raw/`（只读原始需求）、`TODO.md` / `DECISION.md` / `RECORD.md`（三份台账）

本文件只写**做什么 / 不许做什么 / 去哪查**。工程是什么、电路怎么算、元器件怎么建模 —— 一律查 `docs/`，本文件**不复述**。

## 1 唯一手册与文档分工

- 本文件是本工程唯一"有内容"的 agent 手册。其它 agent 工具手册（`CODEBUDDY.md` / `CLAUDE.md` / `AGENTS.md` / `.cursorrules` 等，若出现）**只允许写一行指针**指向本文件，不得承载独立内容。
- **四级分工**：`AGENT.md`（纪律与索引）→ `docs/`（工程内容唯一事实源）→ `.agent/`（操作流程 ＋ 技能脚本 ＋ 样例 ＋ 踩坑笔记）→ 代码旁 `README.md`（成员契约）。冲突时 **`AGENT.md` > `docs/` > `.agent/` > 代码旁文档**；发现冲突立即修正低层，同一次提交。
- `.github/` 只放 CI 与 issue / PR 模板，**不放工程内容**；工程口径一律在 `docs/`。
- **三台账各管一件事**，不得互相搅和：

  | 台账 | 只记什么 | 判据 |
  |---|---|---|
  | `TODO.md` | **还没做 / 建议做**；**待拍板项唯一清单在 §1** | 做完或拍板即同批**删掉**该条；不写缘由、不写提交号、不留"已完成" |
  | `DECISION.md` | **负责人已拍板 ＋ 我方应对要点** | 只追加，`D-YYYYMMDD-NN`；不写提交号、不写待办、不写纯技术选型 |
  | `RECORD.md` | **已进入仓库的提交** | 只追加，`R-NN`；不写待办、不写缘由 |

  口诀：**没做的 → TODO，做了的 → RECORD，人定的口径 → DECISION**。每次任务收尾必须同步三份，缺一视为未完成。
- **代码事实 > 文档**：文档与代码冲突以代码为准，就地补齐（只补不删缘由），与本次改动**同一次提交**。
- **读序**：`AGENT.md` → `docs/README.md`（按需取**一份**）→ 该路径 `README.md` → `X.md`（契约）→ 源码；**一个任务 ≤ 3 份，不通读**。
- 纪律变更必须回写本文件，并核对 `docs/` 是否需要同步（内容事实变了改 `docs/`，纪律变了改本文件）。

## 2 开发纪律（红线）

- **先契约后实现**：改字段 / 改语义先改 `docs/` 契约（网表 schema、接点表、错误码），双端消费方**同批次**改完；契约未拍板前不写实现。待拍板项由负责人定，**AI 不得自行选一个口径就开写**。
- **内核唯一**：拓扑求解与电气判定只写在 core 一处；Unity 绑定层、Web 绑定层只做序列化 / 内存 / 生命周期桥接，**禁止**在绑定层写任何电气规则（电压、电流、通断、互锁、延时）。
- **core 无副作用**：`core` 内禁止读时钟 / 文件 / 环境变量、禁止打印、禁止 `unsafe`；内存管理与错误翻译只在 `c-abi` / `wasm` 绑定层。`unsafe` 仅允许出现在 C ABI 边界，且每处必须带 `// SAFETY:` 说明。
- **量纲用类型区分**：电压 / 电流 / 电阻 / 时间不用裸 `f64` 互传，用 newtype（`Volts` / `Amps` / `Ohms` / `Millis`）区分，让"线电压当相电压、弧度当度、ms 当 s"在编译期就被拦住 —— 这三类混用是此前"拓扑计算容易出错"的根因（`DECISION.md` D-20261103-11）。
- **数值一律 `f64`，禁 `f32`**：Rust `f64` = C# `double` = JS `number`，跨端零转换；绑定层**禁止**做 float 截断或精度"优化"。理由与三档常量见 `DECISION.md` D-20261103-13。
- **无状态调用**：求解入口只有"一次调用 = 一个时刻"，**禁止**在库里加会话对象、`advance()`、内部时钟、全局可变状态（`DECISION.md` D-20261103-12）。器件跨时刻状态由应用持有并作为入参传回。
- **每个接点必须有结果**：`solve` 成功后，请求范围内每个接点都要给齐 4 个 `f64` ＋ `flags`；**不存在"该接点无数据"这种返回值** —— 无内部支路用 `HAS_I = 0`，无源孤立用 `FLOATING`（`api.md` §2.5）。上层显示空浮层与算错等价（D-20261103-25）。
- **双端等价**：同一网表在 DLL 侧与 Web 侧必须给出相同结果。内核任何改动同批跑双端黄金案例，**只验一侧视为未完成**。
- **确定性**：输出不得依赖遍历顺序。等势点编号、支路顺序、诊断顺序必须显式排序；同一输入两次运行结果逐字节一致（禁止依赖哈希 / 字典序输出）。
- **参数有出处**：线圈电阻、吸合 / 释放电压、动作延时、空气（漏电）电阻、收敛容差等一切数值集中在一处常量与参数表，并注明来源；**禁止**散落在调用点，**禁止**被测试硬编码第二份。
- **范围外不做**：`docs/overview.md` 的"不做"清单是硬边界；新增范围先走 `TODO.md` §1 拍板。
- **`docs/raw/` 只读**：原始需求不编辑、不润色、不改文件名；解释与推导写在 `docs/` 对应文档里。
- **二进制不进库**：`*.dll` / `*.wasm` / `*.node` / `node_modules/` / 构建输出目录不入库，只提交源码与构建脚本。
- **禁止手写资产元数据**：本仓库不存放 Unity 工程本体（归属见 `TODO.md` §1 P-09）。若日后引入，`.meta` 必须由 Unity 生成并随资产**成对**提交，**绝不手写 GUID**。
- **`.ps1` 必须 UTF-8 with BOM**（PowerShell 5.1 按 ANSI 解码无 BOM 文件，中文字符串会破坏引号配对）。

## 3 提交纪律

- 一次逻辑变更一次提交；**契约文档 ＋ 实现 ＋ 黄金案例 ＋ 三台账**同批，缺一视为未完成。
- `git add <具体路径>`，**禁止 `git add -A` / `git add .`**。
- **中文不进命令行**：说明文字一律走 **UTF-8 文件**（`git commit -F <文件>`），禁止 `-m "中文"` 直接传参。
- 提交信息格式：`type(scope): 描述`。type ∈ `feat` / `fix` / `chore` / `refactor` / `docs` / `test` / `build`；scope ∈ `core` / `cabi` / `wasm` / `csharp` / `web` / `contract` / `docs` / `ci` / `repo`；破坏性变更带 `!`。
- 提交后**回读原始字节复核**：`git --no-pager log -1 --format=%B`。**控制台回显不可信**（本机 ACP=936 会把正确中文显示成乱码，也会把乱码显示成问号）。
- ⚠️ **`main` 受保护，禁止直接提交**（本条是本仓库最硬的流程红线）：
  - 所有改动一律走 **`分支 → PR → merge`**。直推 `main` 会被 GitHub 拒绝（分支保护：**必需 PR** ＋ 禁强推 ＋ 禁删除）。
  - 分支命名 `feat/…` / `fix/…` / `docs/…` / `chore/…`，一句话说清改什么。
  - PR 标题用**提交信息首行**（`gh pr create --fill` 直接从提交取，中文不必进命令行）；body 用 `.github/pull_request_template.md`。
  - **CI 未绿不许合并**。`guard` 是 `main` 的**必需检查**（自动触发已恢复，`DECISION.md` D-20261103-30）。若 PR 上看不到 check，兜底手动跑：`gh workflow run ci --ref <branch>` ＋ `gh run watch`（现象与排查见 `.agent/notes/github-actions-triggers.md`）。
  - 合并方式 **squash merge**：`main` 保持线性，一个逻辑变更一个提交，历史可读。
  - 合并后**删除分支**；`RECORD.md` 登记的是 squash 后的那个提交。
  - **唯一例外**：仓库还没有任何提交记录时的 bootstrap（本次首次提交），之后不再有例外。
- 无分支隔离前**同一时刻只允许一个 agent 写仓库**（有 PR 也一样排队，不许两个 PR 并行改同一份契约）。

## 4 验证与操作命令

- **工具链（2026-11-03 实测）**：`cargo 1.95.0` / `rustc 1.95.0`；目标 `x86_64-pc-windows-msvc` 与 `wasm32-unknown-unknown` 均已安装。**不需要 wasm-pack** —— wasm 侧用手写 C ABI ＋ `WebAssembly.instantiate` 直载，零外部依赖。
- **命令（全部已实测跑通）**：
  - `cargo test --workspace` —— 内核单测（cabi 布局断言 2 个）＋ fixture 驱动测试（10 份 fixture / 28 个 case）
  - `cargo build -p pcx-cabi --release --target x86_64-pc-windows-msvc` → `target/x86_64-pc-windows-msvc/release/pcx_circuit.dll`
  - `cargo build -p pcx-wasm --release --target wasm32-unknown-unknown` → `target/wasm32-unknown-unknown/release/pcx_wasm.wasm`
  - `node scripts/build.mjs` —— 上面两条 ＋ 把 wasm 拷到 `bindings/web/pkg/`
  - 跑单个测试：`cargo test -p pcx-core --test fixtures -- --nocapture`
  - 双端比对：`node scripts/compare.mjs`（wasm 侧 28 个 case 与 fixture 期望逐条比对）
  - 演示页：`node scripts/serve.mjs` → `http://localhost:8080/bindings/web/demo.html`
  - C# 编译校验：`dotnet build bindings/csharp -v q`（netstandard2.1，0 警告 0 错误）
  - **发布**：`gh workflow run release.yml -f version=vX.Y.Z` —— tag 必须等于 `Cargo.toml` 的 `version`，否则流水线报错；产物挂 GitHub Release，不入库（`.agent/workflows/05-release.md`）
- 验收基线：`cargo test --workspace` 全绿 ＋ `node scripts/compare.mjs` 通过 ＋ `dotnet build` 0 错误（见 §2「双端等价」）。
- 仓库操作：
  - `git --no-pager status --short`
  - `git add <具体路径>`
  - `git commit -F <UTF-8 说明文件>`
  - `git --no-pager log -1 --format=%B`（回读复核）
  - `git push origin main`
- **文档与台账自检（改完文档必跑，CI 第一个 job 也跑它）**：`node .agent/skills/doc-guard/check.mjs`。它查：`docs/README.md` 索引里的文件是否存在、`AGENT.md` 引用的 `docs/*.md` 是否存在、`docs/*.md` 五行头、三台账编号重复、`fixtures/` 必填字段与 `PE` 数量、产物是否被跟踪。**零依赖，Node ≥ 18。**
- 里程碑 / issue 同步：`node .agent/skills/gh-plan/apply.mjs --dry-run` 先看，再去掉 `--dry-run` 执行；按标题幂等，可反复跑。

## 5 索引（明细查被指向的文档）

| 要查什么 | 去哪里 |
|---|---|
| 文档地图、写作约定、每份文档状态 | `docs/README.md` |
| 原始需求（只读） | `docs/raw/requirement.txt` |
| 工程定位、10 类电路范围、"不做"清单、术语表 | `docs/overview.md` |
| 模块分层、语言 / 双端复用、构建产物、平台矩阵 | `docs/architecture.md` |
| 元器件接点契约、导线与等势语义、教学典型值表 | `docs/domain-model.md` |
| 求解内核、三相口径、数值常量表、开关迭代、短路判定 | `docs/solver.md` |
| C ABI 结构体布局、错误码、两阶段查询、版本策略 | `docs/api.md` |
| Unity / Web 四件套、应用侧时钟契约、演示页规格 | `docs/integration.md` |
| 黄金案例断言、基线值、容差、已知不覆盖 | `docs/verification.md` |
| 实施顺序、里程碑 M0–M5 与门禁 G0–G5、二期清单 | `docs/roadmap.md` |
| 演示页电路网表、布局坐标、接点几何、配色、交互、验收 D-1…D-9 | `docs/demo.md` |
| 网页实验台（M6）：两个入口、图元几何、样例、交互、参数、判据、tailnet 部署、验收 D-1…D-20 | `docs/playground.md` |
| agent 怎么动手：流程 / 技能脚本 / 样例 / 踩坑笔记 | `.agent/README.md` |
| CI、issue 与 PR 模板 | `.github/workflows/ci.yml`、`.github/ISSUE_TEMPLATE/` |
| 还没做 / 待拍板 | `TODO.md` §1 / §2 |
| 已拍板 | `DECISION.md` |
| 已提交 | `RECORD.md` |
