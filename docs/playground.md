# playground — 网页电路实验台（M6）契约与设计

读者：AI / 负责人
类型：设计
权威：M6 网页实验台的功能、结构、器件图元、样例、交互、参数、判据、部署与验收的唯一事实源
状态：2026-11-05 定稿（M6 收口）：M6.0…M6.8 已完成；本机自动判据全部通过，D-20「从另一台 tailnet 设备打开」及 D-1…D-19 人工确认待负责人完成后 G6 才算通过。口径见 `DECISION.md` D-20261104-01…11
依赖：`demo.md` §3.4 / §4 / §6 / §8（几何、图元、数值格式、诊断文案）、`domain-model.md` §2 §4（接点表、参数）、`solver.md` §5（数值常量）、`verification.md` §2 §3 §4（容差与断言）、`api.md` §5 §7（错误码、JSON 门面）、`integration.md` §2 §4（应用侧时钟、Web 侧）

## 1 目标与两个入口

把已验收的固定 C3 演示页（`demo.html` / `demo.js` / `demo.md`）升级为**二维电路实验台**：白画布上自由放置 15 类器件、点接点接线、任意改动即时重算；内置 C1…C10 十个电力拖动电路样例，结果与 `fixtures/` 既有期望值一致；最终可从 Tailscale 网内另一台设备打开。**内核、C ABI、wasm、`bindings/web/pcx.js` 全部复用，本期不碰**（D-20261104-01 / 10）。

### 1.1 两个入口

| 入口 | 行为 | 初始状态 |
|---|---|---|
| **① 从样例进入** | 下拉框选 C1…C10 → 读对应 sample（layout ＋ 操作状态）与 `fixtures/C*.json`（网表 ＋ 期望值）→ 渲染并求解 | 该 sample 的 `initial` 指定状态（见 §4） |
| **② 从白画布开始** | 空白实验台，从左侧器件面板放置器件，自行接线、改参数 | 空网表（0 器件 / 0 导线），必须 `solve` 成功并正常出数（`D-20261104-06`） |

两个入口共用同一个状态结构与同一套 reducer；切换入口等价于「加载一个空 sample / 一个真实 sample」，不做第二套数据通路。

### 1.2 与 `demo.md` 的关系

| 对象 | 关系 |
|---|---|
| `demo.html` / `demo.js` / `docs/demo.md` | **已验收，本期不动**（D-20261104-01）。M6 不重构、不复制它的单文件形态 |
| 器件图元几何 | `demo.md` §3.4 的相对偏移是本契约的起点；本文件**扩充**到 15 类＋可变接点数（第二辅助组）后作为 M6 通用契约（D-20261104-03） |
| 图元配色 / 数值格式 / 诊断文案 | 沿用 `demo.md` §4 / §6 / §8，**不复制第二份**；playground 的实现只需与那张表一致 |
| 电路网表 | 一律运行时读 `fixtures/`，**不复制数值**（口径 04） |
| 调用模式 | 编辑中间态一律宽松模式（`strict_reference = false`）；样例可切严格（口径 06）。依据 `D-20261103-25` / `D-20261103-28` |

### 1.3 边界（硬）

- **不改** `crates/core` / `crates/cabi` / `crates/wasm` 既有逻辑、`fixtures/` 期望值与现有 case、`bindings/web/demo.html` / `demo.js` / `docs/demo.md`（D-20261104-10）。
- **不在应用层写任何电气规则**：电压、电流、通断、互锁、延时全部来自内核输出；诊断码由内核给（`AGENT.md` §2「内核唯一」）。
- **不做**：三维、真实拖拽接线（本期只有二维）、评分 / 判题、移动端、字号 / 布局自由定制、多用户协同、持久化存储。
- 页面必须标注「**本期只算电气量**」；C8 制动电流恒为 0 属已声明设计（`verification.md` §5）。

### 1.4 技术形态（口径 02）

零依赖原生 ES modules 静态页，**无框架、无打包器、无 npm**；沿用 `scripts/serve.mjs` 起 http 服务（**不能 `file://` 打开**，要 `fetch` wasm 与 fixtures）。编辑状态用**纯数据 ＋ 纯函数 reducer**，DOM 只负责渲染与事件；因此 `node --test` 可直接单测 reducer 与几何函数。

## 2 应用结构

### 2.1 文件清单

```text
bindings/web/playground/
├── index.html            # 页面骨架：工具栏 ＋ 画布 ＋ 右侧面板 ＋ 诊断栏
├── canvas.js             # Canvas 2D 渲染、命中测试、悬停与拖动预览
├── state.js              # 纯数据模型 ＋ 纯函数 reducer（无 DOM、可在 node 里跑）
├── solve.js              # state → pcx.js 入参 → solve → 结果并入 state
├── device-catalog.js     # 15 类器件的图元元数据（接点、stateBits、参数、默认框、符号）
├── model.js              # 器件增删改与接点 id / terminal_base 分配（纯函数，供 state.js 调用）
├── geometry.js           # terminalPoint / 正交走线 / 框内裁剪（Liang–Barsky）
├── samples.js            # 样例加载、切换、重置；读 sample 与 fixture
├── diag-text.js          # 诊断码 → 中文文案（表见 demo.md §8）
├── selftest.html         # 页面内自检页：10 样例 × 全部 case 的绿/红表
├── samples/C1.json … C10.json   # 每样例一个 layout ＋ 操作状态 sidecar（§4）
├── test/*.test.js        # node --test：reducer / 几何 / catalog / 校验
└── evidence/             # 人工验收截图（before / after / tailnet），单张 ≤300KB
scripts/
├── lib/fixture-compare.mjs      # 比对库：容差与断言逻辑的唯一实现（M6.6 抽出）
├── playground-check.mjs         # 样例复算 ＋ 20 条误接的机器判据（§8）
```

`scripts/compare.mjs` 在 M6.6 改为调用 `scripts/lib/fixture-compare.mjs`，**行为不变**（不允许出现第二份容差）。

`evidence/` 只存人工验收截图（D-1…D-20 的 before / after / tailnet 证据），M6.7 之前的截图保留。仓库体积实测（2026-11-05，主工作区）：`du -sh .git` ≈ 6.8 MB，其中 `bindings/web/playground/evidence/` ≈ 5.6 MB —— **验收截图入库是可接受的体积代价**，换来验收证据可追溯、不依赖外部图床；新增截图必须压到单张 ≤300KB（`AGENT.md` §2）。

### 2.2 模块职责与禁令

| 模块 | 只做 | 不做 |
|---|---|---|
| `state.js` | 纯数据 ＋ reducer：`place` / `select` / `move` / `remove` / `setParam` / `operate` / `pickTerminal` / `completeWire` / `addWire` / `removeWire` / `selectWire` / `clearWires` / `cancel` / `loadSample` / `reset` | 不碰 DOM、不调 `solve`、不读 `Date` |
| `model.js` | 器件增删改与接点 id / `terminal_base` 分配、导线端点重写（纯函数） | 不含布局坐标、不碰 DOM |
| `solve.js` | 把 state 映射成 `{devices, wires, config, strict_reference}`，调 `pcx.solve`，把 `terminals` / `devices` / `diags` 并入 state | 不做任何电气判定、不改输入数值 |
| `device-catalog.js` | 每 kind 的接点表、`stateBits`、可编辑参数定义、默认框尺寸、符号 / 显示名 | 不含布局坐标（坐标是数据） |
| `geometry.js` | `terminalPoint`、接点命中半径、正交走线、框内裁剪 | 不决定器件位置 |
| `samples.js` | 读 `samples/C*.json` 与 `fixtures/C*.json`，生成初始 state；样例切换与重置 | 不复制网表 / 期望值 |
| `canvas.js` | 渲染（§6）、把鼠标事件翻译成 reducer 事件（§5） | 不做状态转换、不直接求解 |
| `diag-text.js` | 诊断码 → 中文文案、诊断栏排序与分级（数据表来自 `demo.md` §8） | 不吞掉错误、不把 error 画成 ok |
| `selftest.html` | 浏览器内用 `scripts/lib/fixture-compare.mjs` 的浏览器版跑同一批判据 | 不另写一套断言 |

### 2.3 数据流（单向）

```text
DOM 事件 ──► reducer(state, event) ──► next state ──► solve(state) ──► result + diags
                    ▲                                              │
                    └──────────── canvas.render(state) ◄───────────┘
```

- 只有「提交型」事件（放置 / 移动松手 / 删除 / 接线 / 删线 / 操作 / 参数变更 / 加载 / 重置）触发 `solve`。
- 拖动中间态、接点悬停、选中变化**不触发** `solve`（§5.3）。
- 连续输入（如参数框输入中）不逐字符求解，合法值提交后才求解（§7）。

### 2.4 接点与 id 规则

沿用 `domain-model.md` §1：`terminal_base` ＝ 按器件数组顺序的接点数前缀和，全局接点 id ＝ `terminal_base + 序号`；接点序号严格按 `domain-model.md` §2 表内顺序（0 起）。

- 放置器件：`allocIds` 追加到末尾，`id` 与 `terminal_base` 连续分配。
- 删除器件：**先级联删掉所有连到它的导线**，再重排 `id` / `terminal_base`，并按「旧接点 id → 新接点 id」映射重写剩余导线的 `a` / `b`；未删器件的接点（`ref` ＋ 接点名）语义不变。
- 参数改变接点数（`QS.poles`、`KM`/`KA` 辅助组数、`TB.n`）：同样先重排、再重写导线；连到已不存在接点的导线删除，并在诊断栏提示「因参数变更删除 N 条导线」。

## 3 器件图元契约

### 3.1 坐标与几何

| 项 | 契约 |
|---|---|
| 逻辑画布 | `1600 × 1000` CSS 像素；按 `devicePixelRatio` 放大重绘；样例 layout 必须落在画布内 |
| 器件盒子 | 数据 `{ x, y, w, h }`（左上角 ＋ 宽高，单位 CSS px）；**位置与尺寸是数据，不是契约** |
| 默认框尺寸 | 从左侧器件面板新放置时使用 `device-catalog.js` 的 `defaultBox`（§3.2）；样例 layout 可覆盖 |
| 接点坐标 | `点 = (x + u × w, y + v × h)`；`边` 只决定接点编号文字的偏移方向，不改变坐标 |
| 接点顺序 | 严格按 `domain-model.md` §2 的表内顺序；`terminal_base + 序号` 即全局接点 id |
| 接点圆点 | 半径 4 px；命中半径 6 px（触屏可放宽到 10 px） |
| 辅助触点与线圈 | 一律画在器件**底边**（`demo.md` §3.4 的理由）；第二辅助组是 M6 扩充，画在**顶边** |

### 3.2 15 类 kind 的符号与默认框尺寸

| kind | 符号 | 默认 `w × h` | 备注 |
|---|---|---|---|
| `POWER` | 三条相线母线 ＋ `N`，右边缘引出 | `100 × 220` | 接点全在右边 |
| `QS` | 刀开关 / 旋钮（每极一条斜杆，闭合时压下） | `80 × 160` | 极数由参数决定 |
| `FU` | 熔断器矩形 | `60 × 80` | 恒闭合 |
| `KM` | 主触点 ＋ 线圈方框 ＋ 辅助触点 | `160 × 200` | 主触点左进右出 |
| `KA` | 线圈方框 ＋ 辅助触点（无主触点） | `160 × 120` | 接点全在底边（第二组在顶边） |
| `KT` | 线圈方框 ＋ 延时触点（`55-56` 延时闭合 / `67-68` 延时断开） | `160 × 120` | 接点全在底边 |
| `KS` | 两组常开触点（速度继电器） | `160 × 100` | 接点全在底边 |
| `FR` | 三相热元件 ＋ 常闭 / 常开辅助 | `140 × 200` | 主回路左右 ＋ 底边 4 个辅助 |
| `SB` | 按钮（常开 / 常闭 / 复合，画出按杆） | `80 × 80` | 1-2 左/右，3-4 左/右 |
| `SQ` | 行程开关（与 `SB` 同符号） | `80 × 80` | 同上 |
| `M` | 圆 ＋ 文字 `M` ＋ `3~`（三个半圆绕组） | `140 × 200` | 上 3 下 3 |
| `R` | 电阻矩形 | `60 × 80` | 制动电阻复用 |
| `EL` | 指示灯圆 | `60 × 80` | 额定电压 ＋ 功率 |
| `TB` | 端子排方块（一排螺钉） | `160 × 60` | `n ≥ 5` 时宽取 `max(160, 30 × n)` |
| `PE` | 接地符号（三条递减横线） | `70 × 70` | 唯一接点在上边 |

> 图元的填充 / 描边 / 文字 / 触点和电机符号画法沿用 `demo.md` §4，**不在此复写**；playground 只需与它一致，允许按画布尺寸微调像素。

### 3.3 接点几何表（M6 通用契约）

接点 = `盒子左上角 + (u × w, v × h)`；接点名按 `domain-model.md` §2。下表是 `demo.md` §3.4 的**扩充**：原有行数值不变，新增 `KM` / `KA` 第二辅助组（顶边）与可变 `TB` 的均分规则。

| kind | 接点 | 边 | `u` | `v` |
|---|---|---|---|---|
| `POWER` | `L1` `L2` `L3` | right | `1.0` | `0.2 / 0.5 / 0.8` |
| `POWER` | `N` | right | `1.0` | `1.0` |
| `QS`（`poles = 1`） | `1` `2` | left / right | `0 / 1` | `0.5` |
| `QS`（`poles = 3`） | `1` `3` `5` | left | `0` | `0.2 / 0.5 / 0.8` |
| `QS`（`poles = 3`） | `2` `4` `6` | right | `1` | `0.2 / 0.5 / 0.8` |
| `FU` / `R` / `EL` | `1` `2` | left / right | `0 / 1` | `0.5` |
| `FR` | `1` `3` `5` | left | `0` | `0.2 / 0.5 / 0.8` |
| `FR` | `2` `4` `6` | right | `1` | `0.2 / 0.5 / 0.8` |
| `FR` | `95` `96` `97` `98` | bottom | `0.20 / 0.35 / 0.65 / 0.80` | `1.0` |
| `KM` | `A1` `A2` | bottom | `0.10 / 0.24` | `1.0` |
| `KM` | `1..6` | left / right | `0 / 1` | `0.2 / 0.5 / 0.8` |
| `KM` | `13` `14` `21` `22` | bottom | `0.42 / 0.54 / 0.74 / 0.86` | `1.0` |
| `KM` | `43` `44`（仅 `aux_no = 2`） | top | `0.30 / 0.45` | `0.0` |
| `KM` | `31` `32`（仅 `aux_nc = 2`） | top | `0.60 / 0.75` | `0.0` |
| `KA` | `A1` `A2` | bottom | `0.10 / 0.24` | `1.0` |
| `KA` | `13` `14` `21` `22` | bottom | `0.42 / 0.54 / 0.74 / 0.86` | `1.0` |
| `KA` | `43` `44`（仅 `aux_no = 2`） | top | `0.30 / 0.45` | `0.0` |
| `KA` | `31` `32`（仅 `aux_nc = 2`） | top | `0.60 / 0.75` | `0.0` |
| `KT` | `A1` `A2` | bottom | `0.10 / 0.24` | `1.0` |
| `KT` | `55` `56` `67` `68` | bottom | `0.45 / 0.60 / 0.74 / 0.86` | `1.0` |
| `KS` | `13` `14` `23` `24` | bottom | `0.30 / 0.45 / 0.70 / 0.85` | `1.0` |
| `SB` / `SQ` | `1` `2`（NC） | left / right | `0 / 1` | `0.40` |
| `SB` / `SQ` | `3` `4`（NO） | left / right | `0 / 1` | `0.60` |
| `M` | `U1` `V1` `W1` | top | `0.2 / 0.5 / 0.8` | `0.0` |
| `M` | `U2` `V2` `W2` | bottom | `0.2 / 0.5 / 0.8` | `1.0` |
| `TB` | `0..n-1` | bottom | 均分：`(k + 0.5) / n` | `1.0` |
| `PE` | `PE` | top | `0.5` | `0.0` |

说明：

- 只有 `KM` / `KA` 的第二辅助组用了顶边，因为第一组辅助触点与线圈已占满底边；这是对 `demo.md` §3.4 的 M6 扩充，`demo.md`（固定 C3）不受影响。
- `SB` / `SQ` 无论 `type` 是 `NC` / `NO` / `BOTH` 都画 4 个接点（缺席组没有内部支路，显示为普通接点，不报错）。
- 几何表是**逐行可断言**的契约：M6.1 的单测按本表每一行逐项核对，不允许「大概一致」。

## 4 样例契约

### 4.1 文件与 schema

`bindings/web/playground/samples/C1.json … C10.json`，每样例一个文件，**只存 layout 与操作状态**（口径 04）；网表与期望值运行时从 `fixtures/` 读，**不复制第二份数值**。

```json
{
  "case": "C3",
  "fixture": "fixtures/C3.json",
  "layout": [
    { "ref": "P1", "x": 40, "y": 60, "w": 70, "h": 300 },
    { "ref": "QS1", "x": 140, "y": 60, "w": 80, "h": 300 }
  ],
  "initial": { "case": 0 },
  "note": "C3 两地控制：两组启停按钮控一台三相电动机"
}
```

> 示例只列两台器件，实际 `layout` 必须覆盖该 fixture 的全部 `ref`（见下表）。

| 字段 | 必填 | 语义 |
|---|---|---|
| `case` | 是 | 样例名，必须等于 `fixtures/` 里对应文件的 `case`（`C1`…`C10`） |
| `fixture` | 是 | 相对仓库根的文件路径，如 `fixtures/C3.json` |
| `layout[]` | 是 | 每台器件的 `ref` / `x` / `y` / `w` / `h`；必须**恰好覆盖** fixture 的全部 `ref`（不重不漏），坐标在画布内且盒子不重叠 |
| `initial.case` | 否 | 进入时套用的 `fixtures` case 下标（缺省 `0`）：用该 case 的 `set` / `add_wires` / `drop_wires` 生成初始操作状态 |
| `initial.rpm` | 否 | `{ "<ref>": number }`，覆盖 `KS` 所在 `shaft_group` 的初始转速；缺省取 case `set` 里的值，否则 `0` |
| `initial.elapsed_ms` | 否 | `{ "<ref>": number }`，覆盖 `KT` / `FR` 的初始累积时间；缺省取 case `set` 里的值，否则 `0` |
| `note` | 是 | 一句话样例说明，显示在样例下拉框旁 |

`layout` 的 `ref` 必须与 fixture `devices[].ref` 一一对应；`w` / `h` 可覆盖 §3.2 的默认框尺寸。

### 4.2 运行时读取规则

1. 读 `samples/C*.json`（layout ＋ initial）；文件缺失或读取失败时**停在入口**，不改变当前画布。
2. 读 `fixture` 指向的 `fixtures/C*.json`：`devices`（含 `id` / `terminal_base` / `aux` / `params` / `state_bits` / `flags` / `elapsed_ms` / `rpm` 原值）、`wires`、`config`、`strict_reference`。**网表与期望值一律以 fixture 为准**，sample 里不得出现第二份。
3. 套 `initial.case`（缺省 `0`）对应的 `set` / `add_wires` / `drop_wires` / `add_devices`，再套 `initial.rpm` / `initial.elapsed_ms`，生成初始操作状态。
4. 套 layout：每台器件只补 `x` / `y` / `w` / `h`；**不改** `id` / `terminal_base` / `aux` / `params` / `state_bits` / `flags`。
5. 调用 `solve`，渲染。

- **样例模式默认宽松**（`strict_reference = false`，口径 06）：编辑中间态必须出数；fixture 的 `strict_reference` 只记录，严格模式由 M6.5 的手动开关切换，两种都显示诊断。
- 样例切换 / 重置等价于重新执行 1–5；切换前不弹确认，重置也不可撤销（撤销功能本期不做）。
- `initial.rpm` 只能指向 `KS`，`initial.elapsed_ms` 只能指向 `KT` / `FR`；越界或未知 `ref` 按 §4.4 报错。

### 4.3 C1…C10 与 fixtures 对照（来自现有 fixture，只读）

| 样例 | fixture | 器件数 | 导线数 | fixture case 数 |
|---|---|---|---|---|
| C1 | `fixtures/C1.json` | 5 | 12 | 2 |
| C2 | `fixtures/C2.json` | 7 | 19 | 2 |
| C3 | `fixtures/C3.json` | 15 | 30 | 7 |
| C4 | `fixtures/C4.json` | 8 | 24 | 3 |
| C5 | `fixtures/C5.json` | 7 | 28 | 3 |
| C6 | `fixtures/C6.json` | 5 | 14 | 2 |
| C7 | `fixtures/C7.json` | 6 | 21 | 2 |
| C8 | `fixtures/C8.json` | 5 | 13 | 2 |
| C9 | `fixtures/C9.json` | 6 | 20 | 3 |
| C10 | `fixtures/C10.json` | 7 | 22 | 2 |
| **合计** | 10 份 | — | — | **28** |

### 4.4 加载失败提示（页面与脚本同一套）

样例加载的纯函数在 `bindings/web/playground/samples.js`；页面把 `SampleLoadError.message` 原样写进顶部红条，`scripts/playground-check.mjs` 逐条打印并以非零码退出。

| 情况 | 错误码 | 提示（示例） |
|---|---|---|
| sample 文件缺失 / 读失败 | `SAMPLE_MISSING` | `样例文件缺失或读取失败：samples/C1.json（HTTP 404）` |
| `fixture` 指向的文件缺失 / 读失败 | `FIXTURE_MISSING` | `fixture 缺失或读取失败：fixtures/C1.json（HTTP 404）` |
| layout 漏了 fixture 的器件 | `LAYOUT_MISSING_REF` | `layout 缺少 ref：PE1` |
| layout 出现 fixture 没有的器件 | `LAYOUT_UNKNOWN_REF` | `layout 含未知 ref：P2` |
| layout 同一 ref 出现两次 | `LAYOUT_DUPLICATE_REF` | `layout 重复 ref：P1` |
| 坐标非数 / 宽高 ≤ 0 / 出画布 | `LAYOUT_INVALID`、`LAYOUT_OUT_OF_CANVAS` | `layout.P1 超出 1600×1000：x=…` |
| 盒子重叠 | `LAYOUT_OVERLAP` | `layout 盒子重叠：P1 与 QS1` |
| sample 里复制了网表 / 期望值 | `SAMPLE_FIELD_UNKNOWN` | `含不允许的字段 devices（只允许 case / fixture / layout / initial / note）` |
| `initial.case` 越界 / `rpm` 给错器件 | `SAMPLE_INITIAL_CASE_RANGE`、`SAMPLE_INITIAL_INVALID` | 见 `samples.js` |

### 4.5 layout 确定性排布规则

10 份 layout 由同一条**确定性两带规则**生成后写入 `samples/C*.json`（不是手调像素，也不在运行时重新排版）：

1. 画布 `1600 × 1000`；器件盒 `w` / `h` 取 §3.2 的默认框尺寸。
2. 分两带：主回路带 = `POWER` / `QS` / `FU` / `FR` / `KM` / `M` / `R`；控制带 = `SB` / `SQ` / `KA` / `KT` / `KS` / `EL` / `TB` / `PE`。
3. 带内保持 fixture `devices[]` 的原顺序；主回路带 `y = 60`，控制带 `y = 520`；同一带内盒间距 `40 px`。
4. 每带水平居中：`x0 = round((1600 - (Σw + 40 × (n - 1))) / 2)`，逐台向右累加。
5. 该规则保证盒子不重叠且全部落在画布内；`scripts/playground-check.mjs` 逐份复核「覆盖完整 / 不重 / 未知 / 越界 / 重叠」。fixture 器件清单变化时按本规则重生成，不手改 fixture。


## 5 交互状态机

### 5.1 状态与事件

state 是纯数据：`{ mode, devices[], wires[], selected, selectedWire, pendingTerminal, drag, sample, result, diags, strictReference }`。模式（`mode`）只有 `IDLE` / `PICK_A` / `DRAG` 三种；参数编辑与操作不引入新模式，直接由事件进 reducer。`selected`（器件 ref）与 `selectedWire`（`wires` 下标）互斥；任何改变 `wires` 下标或网表的提交型事件都会清空 `selectedWire`。

| 事件 | 从 | 到 | 提交型？ | 行为 |
|---|---|---|---|---|
| `place(kind)` | `IDLE` | `IDLE` | 是 | 在面板点击后落到画布空闲位置；分配 `id` / `terminal_base`；`solve` ＋ 重绘 |
| `select(ref)` | `IDLE` | `IDLE` | 否 | 选中器件，属性面板显示其参数 |
| `movePreview(ref, dx, dy)` | `IDLE` | `DRAG` | 否 | 只更新预览坐标，不 `solve` |
| `moveCommit(ref, dx, dy)` | `DRAG` | `IDLE` | 是 | 提交坐标；`solve` ＋ 重绘 |
| `remove(ref)` | `IDLE` / `PICK_A` | `IDLE` | 是 | 级联删线、重排 id / `terminal_base`、重写导线；`solve` |
| `pickTerminal(term)` | `IDLE` | `PICK_A` | 否 | 记下 `pendingTerminal` |
| `completeWire(term)` | `PICK_A` | `IDLE` | 是 | 通过 §5.2 校验后追加 `{a,b}`；拒绝则回 `IDLE` 并给 warn（不 `solve`） |
| `addWire(a, b)` | 任意 | `IDLE` | 是 | 直接按接点 id 加线（与 `completeWire` 共用同一校验）；拒绝规则同 §5.2 |
| `removeWire(index)` | 任意 | 同前 | 是 | 删除该导线并清空 `selectedWire`；`solve` |
| `selectWire(index)` | 任意 | `IDLE` | 否 | 选中 / 取消选中导线（同时清空器件选中与待接线） |
| `cancel()` / `Esc` / 点空白 | `PICK_A` / `DRAG` | `IDLE` | 否 | 取消待接线 / 拖动 / 导线选中，回到提交前状态 |
| `operate(ref, action)` | `IDLE` | `IDLE` | 是 | 按 §5.4 改 `state_bits` / `rpm` / `elapsed_ms`；`solve` |
| `tick(dt_ms)` | 任意 | 不变 | 提交（仅累积量变化时） | 应用侧时钟 10 ms 步进（§5.4）：只推进 `KT` / `FR` 的 `elapsed_ms`，有变化才 `solve`；不启动 / 停止时钟 |
| `setParam(ref, field, value)` | `IDLE` | `IDLE` | 是 | 校验通过才改；接点数变化时按 §2.4 重排；`solve` |
| `clearWires()` | `IDLE` | `IDLE` | 是 | 一次清空 `wires`（先确认）；`solve` |
| `loadSample(case)` | 任意 | `IDLE` | 是 | 按 §4.2 重建 state；`solve` |
| `reset()` | 任意 | `IDLE` | 是 | 当前样例重新加载；白画布则清空到 0 器件 / 0 导线 |
| `hover(term)` | 任意 | 不变 | 否 | 只更新浮层，不 `solve`、不改 state |

### 5.2 接线校验（拒绝规则）

| 情况 | 判定 | 提示 |
|---|---|---|
| `a == b`（自连，同一接点） | **拒绝** | 「不能把接点接到自己」 |
| `{a,b}` 已存在（无序对） | **拒绝** | 「已有此导线」 |
| 端点 id 越界 / 不属于任何器件接点 | **拒绝** | 「接点不存在」 |
| 其余任意接线（可能短路） | 接受，交内核判定（短路 → `E_SHORT_CIRCUIT`） | 诊断栏红字，不预先拦 |

「拒绝」＝ 不入 `wires`、不调 `solve`、诊断栏给一条 warn 提示，且不弹阻塞对话框。

### 5.3 通用规则

1. **每次提交型变更都必须重新 `solve`**，不做增量推断；这是「改一根线，全图重算」的实验台价值。
2. 拖动只画预览（虚线），松手才提交并 `solve`；拖动中不求解。
3. 悬停不改变任何状态、不触发 `solve`（§6.3）。
4. `solve` 返回错误时：保留上一次成功结果用于绘制，诊断栏显示错误，画布顶部叠加红色横条写明原因（避免「图还在但数据是旧的」被误读）。
5. 宽松模式下正常编辑**不应出现 error**；出现即为实现缺陷，必须修。
6. 删除 / 清空 / 重置都不可撤销（本期不做 `Ctrl+Z`）；重置是唯一兜底。
7. 白画布空网表（0 器件 / 0 导线）必须 `solve` 成功、诊断栏不出 error。

### 5.4 操作器件（沿用 D-20261103-29 的应用侧契约）

| 器件 | 操作 | 结果 |
|---|---|---|
| `SB` / `SQ` | **鼠标按下动作、抬起复位**（含画布外松开、窗口失焦） | 按下时 NO 闭合 / NC 断开，抬起复位 |
| `QS` | 点击切换并**保持**（旋钮 / 刀开关的物理行为） | 每极通断翻转 |
| `KM` / `KA` / `KT` / `FR` | 不可人工操作，状态由库自解 | — |
| `KS` | 转速 `rpm` 由人给（滑块 / 数字框，口径 05）；这是应用侧输入，不是操作触点 | 不建惯性模型；`rpm` ≥ `n_pick` 闭合、≤ `n_drop` 释放 |
| `KT` / `FR` | 整定值可改（§7）；累积量 `elapsed_ms` 由应用侧时钟推进 | 见下 |

**应用侧时钟**（沿用 `integration.md` §2）：页面用 `requestAnimationFrame` 时间戳做 **10 ms 固定步长累加器**，只在 `KT` 线圈带电时推进 `KT.elapsed_ms`、只在 `FR` 热元件过载时推进 `FR.elapsed_ms`；页面隐藏时暂停，恢复时单次补算上限 200 ms。`rpm` **不**随时钟推进（口径 05 明确由人给）。时钟在页面**首次提交型操作**（改参数 / 操作器件 / 改线）后启动；加载 / 切换样例、重置、清空后暂停，直到下一次提交型操作 —— 这样样例加载后先停在 fixture 给的初始累积量，不会一进入页面就自行走完延时。`KT.elapsed_ms` 在线圈失电时归零，到点后不再增长；`FR.elapsed_ms` 在上一轮无 `W_OVERCURRENT` 时归零，跳闸后不再增长。

**触点状态回传**（D-20261103-29）：每次 `solve` 成功后，把 `KM` / `KA` / `KT` / `KS` / `FR` 的 `closed_bits` 写回该器件 `state_bits`（`flags.bit0 = 0`）作为下一轮提示；不写回会导致「松开按钮 → 自锁触点复位 → 立即失电」，自锁永远演示不出来。

## 6 显示分层

### 6.1 画布上

- 只显示**接点电压**（10 px，`220.0V` 形式）；电流不画在画布上（信息量太大）。
- 器件框 + 符号 + 位号 + 器件名；接点圆点 + 接点编号（按 §3.1 的边向外偏 6 px）。
- 导线：正交走线；通电（`I ≥ 1 mA`）红色、断电灰色；预览橙色虚线；穿器件框的段落用 Liang–Barsky 裁剪掉（只画框外可见段）。新加的导线额外一层红色光晕 2 秒、下方白色打底（观感按 `demo.md` §4「实现备注」，不复制第二份数值口径）。
- 选中器件高亮边框；接线中第一个接点高亮（橙色）。
- 数值格式、配色沿用 `demo.md` §6 / §4，**不复制第二份**。

### 6.2 右侧面板

| 区域 | 内容 |
|---|---|
| 工具栏 | 样例下拉（C1…C10 ＋「白画布」）、删除选中、`清空全部导线`（先确认）、`重置`、严格模式开关 |
| 顶部摘要 | `案例名 ｜ 器件 N ｜ 接点 N ｜ 导线 N ｜ 诊断 N` |
| 接点表 | 按器件分组、可滚动，行 = 接点：位号 / 接点 / `V` / `I` / 等势点 / 连通分量 / 状态（触点闭合 / 断开；`HAS_I = 0` 显示 `—`） |
| 导线清单 | 序号 / from / to / 电流；新加的在最上并高亮，点行在画布上高亮对应导线 |
| 属性面板 | 选中器件的可编辑参数（§7）＋ 操作控件（`SB` / `SQ` / `QS` / `KS`，§5.4）＋ 只读常量（灰显并标注来源） |

### 6.3 悬停浮层

任意接点移入必须弹出完整数据（电压 / 电流 / 等势点 / 连通分量 / 导通状态 / 触点状态），**不管是否通电、是否成通路**；不得出现空浮层。触发延迟 120 ms，跟随光标 `(+14, +14)`，贴边翻转，`pointer-events: none`。规则与 `demo.md` §5.4 相同。

### 6.4 诊断栏

- 底部固定栏：`error` / `warn` / `info` / `ok` 四种颜色分级；多条诊断按级别排序（error → warn → info），同级按内核返回顺序。
- 文案表**沿用 `demo.md` §8**（同一份枚举，M6 不新增错误码 / 诊断码）；中文只存在于绑定层，内核只回码。
- 错误码到不了中文表时显示「未知诊断码 N」，不得静默吞掉。

## 7 参数编辑子集与只读常量（口径 07）

### 7.1 可编辑参数（唯一子集）

| 器件 | 参数 | 控件 | 合法范围 | 落位 |
|---|---|---|---|---|
| `POWER` | 电压 `v_line` | 数字框（V） | `> 0`，建议 `12…1000` | `params[0]` |
| `POWER` | 频率 `freq_hz` | 数字框（Hz） | `> 0`，建议 `1…100` | `params[1]` |
| `QS` | 极数 `poles` | 单选（1 / 3） | `{1, 3}` | `aux`（1 → 2 接点；3 → 6 接点） |
| `KM` / `KA` | 辅助组数 `aux_no` / `aux_nc` | 单选（1 / 2） | `{1, 2}` | `aux = aux_no × 4 + aux_nc` |
| `SB` / `SQ` | 类型 | 单选（`NC` / `NO` / `BOTH`） | `1 / 2 / 3` | `aux`（1 只有常闭、2 只有常开、3 复合） |
| `FR` | 整定电流 `set_current` | 数字框（A） | `> 0` | `params[1]` |
| `KT` | 延时 `delay_ms` | 数字框（ms） | `≥ 0` | `params[5]` |
| `R` | 阻值 `resistance` | 数字框（Ω） | `> 0` | `params[0]` |
| `TB` | 位数 `n` | 数字框（整数） | `2…8` | `aux` |

- 参数变更属于**提交型事件**：合法值提交后全量重算并重绘；非法值（电压 ≤ 0、负电阻、`n` 越界等）显示行内错误、**不调 solver**。
- 改变接点数的参数（`QS.poles` / `KM`·`KA` 辅助组数 / `TB.n`）会触发重排与导线重写，规则见 §2.4。
- `state_bits` / `flags` / `elapsed_ms` / `rpm` / `shaft_group` 不是参数，由操作与求解回路维护，不出现在参数表单。

### 7.2 只读常量（只显示，不可编辑）

| 常量组 | 来源 |
|---|---|
| 线圈阻抗（`KM` / `KA` / `KT` 的 `Z_coil`）、吸合 / 释放电流 | `domain-model.md` §4 |
| 触点 / 端子接触电阻、开路漏电电阻、开路 / 过流判定阈值、收敛容差 | `solver.md` §5 的 `N-01…N-12`（代码在 `core::consts`） |
| `M` 绕组 `R` / `X`、`EL` 额定电压 / 功率、`KS` 吸合 / 释放转速、`FR` 延时 | `domain-model.md` §4 |
| 电源内阻 `r_src` 等 `POWER` 其余参数 | `domain-model.md` §4 / `api.md` §2.4 |

只读项灰显并标注来源文档；数值**从当前器件的 `params[8]` 读取**（样例来自 fixture，新放置来自 `device-catalog.js` 缺省值），页面不另存一份。**禁止**在 playground 里复制一份参数数值作为默认值之外的第二来源（缺省值由 `device-catalog.js` 引用常量或 fixture 值）。

## 8 正确性判据

三段判据对应 epic 的三段验收；**判据可执行、有命令、有期望值**。

### 8.1 三层

| 层 | 验什么 | 命令 | 通过标准 |
|---|---|---|---|
| 结构 | 样例 / layout / 几何表 / 20 条误接的输入合法性与拒绝规则 | `node scripts/playground-check.mjs` | 全部通过，输出逐条明细 |
| 数值 | 10 样例 × 28 个 fixture case 的接点电压 / 电流、器件线圈电流 | `node scripts/playground-check.mjs`、页面 `selftest.html` | 与 `fixtures/` 期望值一致，容差 = `verification.md` §2 |
| 一致 | 与 Rust 回归同一批判据；`compare.mjs` 行为不变 | `node scripts/compare.mjs`、`cargo test --workspace` | 同一被测版本上两条命令都绿 |

### 8.2 样例复算（机器判据）

- `scripts/lib/fixture-compare.mjs` 是**容差与断言逻辑的唯一实现**：`compare.mjs` 与 `playground-check.mjs` 都调它，页面自检页用它的浏览器版；**禁止**出现第二份容差。
- 复算口径：对每份 fixture 的每个 `case`，按该 case 的 `set` / `add_wires` / `drop_wires` / `add_devices` 生成输入 → 走 wasm（`bindings/web/pcx.js`）→ 逐字段比对；错误 case 只断言 `code`，正常 case 断言 `expect` / `expect_devices`（与 `compare.mjs` 完全同口径）。
- 通过标准：`10 份样例 / 28 个 case` 全绿；每个失败必须打印 `case` / `ref:index` / 字段 / 期望值 / 实际值。
- 页面 `selftest.html`：同样 10 × 28 的绿 / 红表，供人验收与 tailnet 访问；判据与 `playground-check.mjs` **一致**，不允许「脚本绿、页面红」。

### 8.3 20 条典型误接（M-01…M-20）

每一条都给出基线、误接动作、期望结果；`playground-check.mjs` 逐条执行并断言。**「不崩、不静默通过」**：期望 `code` 必须一致，期望诊断必须是返回诊断的**子集**（不禁止额外 info 诊断）。

| 编号 | 基线 | 误接动作 | 期望 code | 期望诊断（必须出现） | 教学点 |
|---|---|---|---|---|---|
| **M-01** | 任意 | 同一接点连自己（`a == b`） | `REJECT`（不入网表） | — | 自连无物理意义，应用层拒绝 |
| **M-02** | C3 | 重复接 `P1.N–PE1`（已存在） | `REJECT`（不入网表） | — | 重复导线不产生第二份效果 |
| **M-03** | C3（严格） | 删 `P1.N–PE1` | `E_NO_REFERENCE`(20) | 20 | 忘了接地 = 接线错误，必须报错 |
| **M-04** | C3（宽松） | 删 `P1.N–PE1` | `OK`(0) | `W_IMPLICIT_REFERENCE`(102) | 编辑中间态以 `P1.N` 为隐含参考 |
| **M-05** | C3 | 加 `PE2` 并把 `PE2.PE` 接到 `P1.L1` | `E_MULTI_REFERENCE`(21) | 21 | 一个电路只允许一个参考点 |
| **M-06** | C3 | 加 `P1.L1–P1.L2` | `E_SHORT_CIRCUIT`(40) | 40 | 相间导线直连 |
| **M-07** | C3 | 加 `P1.L2–P1.N` | `E_SHORT_CIRCUIT`(40) | 40 | 相线对中性线直连 |
| **M-08** | C3 | 加 `FR1.2–FR1.4`（热元件出口相间） | `E_SHORT_CIRCUIT`(40) | 40 | 短路判定看导体通路，不看导线数量 |
| **M-09** | C3 | 加 `QS1.2–QS1.4`（总开关出线相间） | `E_SHORT_CIRCUIT`(40) | 40 | `QS` 闭合触点属导体类 |
| **M-10** | C3 | 按住 `SB2` 启动后加 `KM1.2–KM1.4` | `E_SHORT_CIRCUIT`(40) | 40 | 短路可以经闭合的主触点形成 |
| **M-11** | C5 | 星点与三角同时接通（`add_wires: [[0, 28]]`） | `E_SHORT_CIRCUIT`(40) | 40 | 星三角互锁失效的后果 |
| **M-12** | C3 | 按住 `SB2` 启动后加 `KM1.A1–KM1.A2` | `E_SHORT_CIRCUIT`(40) | 40 | 线圈被短接，控制回路直通电源 |
| **M-13** | C3 | 删 `FR1.96–KM1.A1`，改经 `KM1.21–22` 串入线圈（加 `FR1.96–KM1.21`、`KM1.22–KM1.A1`）后按 `SB2` | `E_OSCILLATION`(31) | 31 | 线圈串自身常闭 → 自激振荡 |
| **M-14** | C1 | 删 3 根 `KM1→M1` 主回路线，按住 `SB1` | `OK`(0) | `W_OPEN_CIRCUIT`(101) | 接触器吸合但主回路没电流 |
| **M-15** | C6 | 删 3 根 `KM1→M1` 主回路线，`KT1.elapsed_ms = 3000` | `OK`(0) | `W_OPEN_CIRCUIT`(101) | 延时到点吸合但电机没接上 |
| **M-16** | C3 | 加一台悬空的 `R2`（不接线） | `OK`(0) | `W_ISOLATED_IGNORED`(103) | 悬空器件不参与求解、不报错 |
| **M-17** | C3 | 加一台悬空的 `TB2`（`n = 4`，不接线） | `OK`(0) | `W_ISOLATED_IGNORED`(103) | 端子排无内部支路，同样按孤立处理 |
| **M-18** | 白画布 | 只放 `M1` + `R1` 接成孤立回路（无 `POWER`） | `OK`(0) | `W_ISOLATED_IGNORED`(103) | 无源孤立分量跳过求解（`solver.md` §4） |
| **M-19** | 白画布 | 空网表（0 器件 / 0 导线） | `OK`(0) | 无 error | 空画布必须能出数 |
| **M-20** | C3 | 删 `FR1.96–KM1.A1`（控制回路少一根线） | `OK`(0) | 无 error（`KM1` 不吸合） | 逻辑错误不一定是内核错误，靠接点表观察 |

- `REJECT` 由 reducer 的校验函数判定（M6.3 起有 `node --test` 单测；M6.4 / M6.6 纳入机器判据），其余走 wasm。
- 误接清单是本文件的契约；实现时**不得增删条目**，除非负责人拍板（进 `TODO.md` §1）。

### 8.4 页面内自检页判据

`bindings/web/playground/selftest.html`：

- 打开即跑（或点「开始自检」）：对 10 样例 × 全部 case 逐条复算，表格逐行绿 / 红，页首汇总 `通过 / 总数`。
- 失败行必须显示：样例、case 名、期望值、实际值、错误码；不允许只显示「失败」。
- 与 `playground-check.mjs` 共用 `fixture-compare` 判据；两者结论不一致视为缺陷。
- 可在 tailnet 另一台设备打开（§9）。

### 8.5 CI 接入

- `.github/workflows/ci.yml` 的 `wasm` job 末尾加一步 `node scripts/playground-check.mjs`（M6.6）。
- **不新增必需检查名称**：`guard` 语义不变，`main` 保护规则不改。
- 本地验收命令：`node scripts/playground-check.mjs`、`node --test bindings/web/playground/test/`、`node scripts/compare.mjs`、`node .agent/skills/doc-guard/check.mjs`。

## 9 部署与 tailnet（口径 09）

### 9.1 启动

| 场景 | 命令 | 说明 |
|---|---|---|
| 本机自用 | `node scripts/serve.mjs 8080` | 不传 `--host` 时行为与以前完全一致：端口、输出、并发都不变 |
| tailnet 访问 | `node scripts/serve.mjs 8080 --host 0.0.0.0` | `--host` 是 M6.7 新增的可选参数；显式绑定 IPv4 任意地址 |

- `--host` 只接受 IPv4 / IPv6 / 主机名；缺地址、非法端口、非法地址、未知 / 多余参数一律以中文「参数错误」结束，退出码 2。
- 启动前先确认 8080 空闲：`ss -ltnp 'sport = :8080'`；被占用时先停占用进程或换端口，不要动 3080 / 3000。
- 页面依赖 `bindings/web/pkg/pcx_circuit.wasm`；未构建时按 `AGENT.md` §4 构建并拷贝到该目录，不能 `file://` 直接打开。

### 9.2 常驻（nohup）

本机未安装 tmux，所以只给 nohup 方式；在仓库根目录执行这一条（可整段复制）：

```bash
cd /home/kuai/src/physical-circuit-experiment
nohup node scripts/serve.mjs 8080 --host 0.0.0.0 > /tmp/playground-8080.log 2>&1 &
```

- 验证：`curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/bindings/web/playground/index.html`，期望 `200`。
- 停止：先用 `ss -ltnp 'sport = :8080'` 找到本服务的 pid，再 `kill <pid>`；不要按 `node` 名字批量杀，以免误停 3080 / 3000 的进程。
- 日志：`/tmp/playground-8080.log`。

### 9.3 访问地址形态（tailnet 内）

已实测的环境事实：本机 tailnet 名 `kuaizhongqiang01`，IP `100.87.60.42`，MagicDNS 开启（`kuaizhongqiang01.tail61fc44.ts.net`）。两种地址等价：

| 页面 | tailnet IP | MagicDNS |
|---|---|---|
| 实验台 | `http://100.87.60.42:8080/bindings/web/playground/index.html` | `http://kuaizhongqiang01.tail61fc44.ts.net:8080/bindings/web/playground/index.html` |
| 自检页 | `http://100.87.60.42:8080/bindings/web/playground/selftest.html` | `http://kuaizhongqiang01.tail61fc44.ts.net:8080/bindings/web/playground/selftest.html` |

本机自用把主机名换成 `127.0.0.1` 即可；MagicDNS 解析失败时改用 IP。

### 9.4 安全边界

- **只用 tailnet 裸端口访问**；**禁止 `tailscale funnel`**（会把页面暴露到公网）。需要远程时用 tailnet，而不是公网隧道。
- **不得占用 / 暴露 3080（DSH 面板）与 3000**；本服务只用 8080，启动前按 §9.1 检查端口。
- 页面上不投放任何凭证 / 私有 Feishu 内容；样例数据只有 `fixtures/` 的电路网表，服务只读仓库内静态文件。
- 停服务时按 §9.2 的 pid 精确停止，不改 tailscale 的 serve / funnel 配置，不整机重启。

## 10 浏览器验收表与验收记录

### 10.1 验收表（M6 门禁 G6 的人工部分）

| # | 操作 | 期望 |
|---|---|---|
| **D-1** | 打开 `index.html`（白画布） | 空网表 `solve` 成功，诊断栏无 error；控制台无未捕获异常 |
| **D-2** | 下拉加载 C3 | 器件 15 ／ 接点 65 ／ 导线 30；初始 `M1` 三相 `0 A`、`KM1` 释放 |
| **D-3** | C3：按住 `SB2` 再松开 | 按下时 `M1` `5.02 A`、`KM1` 线圈 `26.35 mA`；松开仍 `5.02 A`（**自锁成立**） |
| **D-4** | C3：按住 `SB3`（地点 2 停止） | 全部 `0 A`，`KM1` 释放 |
| **D-5** | C3：删 `KM1.13–SB3.2` 后重复 D-3 | 松手后立刻 `0 A` —— 删一根线就失去自锁（等价 `demo.md` D-6） |
| **D-6** | C3：删 `P1.N–PE1`（宽松 → 严格各看一次） | 宽松：黄字「已临时以 `P1.N` 作参考」；严格：红字「缺少接地参考点」（等价 `demo.md` D-7） |
| **D-7** | C3：加 `P1.L1–P1.L2` 导线 | 诊断栏红字「短路」（等价 `demo.md` D-8） |
| **D-8** | C3：清空全部导线（0 条） | `solve` 成功、无 error；`P1` 四点 `0 V`，其余接点 `0 V` ＋ `FLOATING`；有 `W_IMPLICIT_REFERENCE` |
| **D-9** | C3：清空后逐条重接 30 条 | 每接一条都出数；接回 `P1.N–PE1` 时隐含参考警告消失；接齐后回到 D-2 状态 |
| **D-10** | C3：地毯式悬停 65 个接点 | 每个都有电压 / 电流 / 等势点 / 连通分量 / 导通状态五行数据，零空浮层（等价 `demo.md` D-10 / D-11） |
| **D-11** | 白画布：15 类器件各放置 1 台 | 接点数与 `device-catalog` 一致，页面不崩、无未捕获异常 |
| **D-12** | 白画布：拖动一台器件后松手 | 坐标更新、连线保持、重新出数；拖动过程中不求解（导线数不变） |
| **D-13** | 白画布：删除一台带线器件 | 相连导线级联删除，其余器件接点 id 重排后接线仍正确，`solve` 成功 |
| **D-14** | 白画布：放 `POWER` + `PE` + `M` 并接成星形运行 | 出数且相电流约 `5.02 A`（关系类断言，不写死绝对值） |
| **D-15** | 打开 `selftest.html` | 10 样例 × 28 case 全绿，与 `node scripts/playground-check.mjs` 结论一致 |
| **D-16** | C3：`POWER` 电压 380 → 220 V | `M1` 相电流按比例变化（约 `2.9 A`，关系类断言） |
| **D-17** | C6：`KT` 延时 3000 → 0 ms（应用时钟推进） | `55-56` 立即闭合，`M1` 出 `5.02 A` |
| **D-18** | 逐个加载 C1…C10 | 初始态均 `solve` 成功、无 error；页面标注「本期只算电气量」；C8 制动电流 `0` 有说明 |
| **D-19** | 误接抽样：自连 / 重复线 / 未知接点 / 20 条误接 | 应用层误接被拒并给中文提示；20 条误接按 §8.3 的期望码返回、页面不崩 |
| **D-20** | 从 tailnet 另一台设备打开页面 | 能完成 D-1…D-19 的抽样；`selftest.html` 可访问；未用 funnel，3080 / 3000 未暴露 |

> D-5 / D-6 / D-7 / D-10 是**必过项**：分别证明「增删线即时重算」「参考点强制」「短路预检」「每个接点都有数」四件事，缺一条 G6 不算通过。

### 10.2 验收记录

| 日期 | 设备 / 浏览器 | 验收人 | 结论 | 备注 |
|---|---|---|---|---|
| 2026-11-05 | 本机 Linux（`kuaizhongqiang01`，tailnet IP `100.87.60.42`）· Chromium 153 headless（Playwright） | 智能体（本机自测） | 本机项通过：D-1、D-2、D-3、D-4、D-15、D-18；D-19 判据覆盖，页面提示待人工抽样 | 命令、真实输出与截图见 §10.3；8080 测试后已停止，未长期占用 |
| 待负责人 | tailnet 另一台设备 | 负责人 | **待验收：D-20**（含 D-1…D-19 逐项人工确认） | 按 §9.2 常驻后从另一台设备打开 §9.3 地址，按 §10.1 逐项操作 |

**记录规则**：本表由 M6.7（Tailscale 部署与浏览器验收）片回填（2026-11-05）；M6.8 收口只做定稿与索引，不改判据。未留痕的项按未通过处理。**D-20 仍为「待负责人确认」，本片没有把它改成通过**；D-1…D-19 的人工项也随 D-20 一并确认。

### 10.3 M6.7 本机自测记录（2026-11-05）

环境：`main = 373d953`；Node.js `v24.21.0`；`tailscale ip -4` → `100.87.60.42`；MagicDNS `kuaizhongqiang01.tail61fc44.ts.net`；本机未安装 tmux；3080 / 3000 已被其它服务占用，未触碰。开始测试时 8080 已有一个旧的 `node scripts/serve.mjs 8080` 进程（主工作区），先停掉再测；本片测试结束后 8080 保持空闲。

#### 10.3.1 启动与访问（交付 1 / 2）

```text
$ node scripts/serve.mjs 8080 --host 0.0.0.0
静态服务已启动：http://localhost:8080
监听地址：0.0.0.0:8080
演示页：http://localhost:8080/bindings/web/demo.html
（Ctrl+C 停止）

$ ss -ltnp 'sport = :8080'
LISTEN 0  511  0.0.0.0:8080  0.0.0.0:*  users:(("MainThread",pid=204071,fd=21))
```

访问（同一进程，`curl -s -o /dev/null -w '%{http_code} %{content_type} %{size_download} B\n' <url>`）：

| URL | 结果 |
|---|---|
| `http://127.0.0.1:8080/bindings/web/playground/index.html` | `200 text/html; charset=utf-8 46313 B` |
| `http://100.87.60.42:8080/bindings/web/playground/index.html` | `200 text/html; charset=utf-8 46313 B` |
| `http://kuaizhongqiang01.tail61fc44.ts.net:8080/bindings/web/playground/index.html` | `200 text/html; charset=utf-8 46313 B` |
| `http://100.87.60.42:8080/bindings/web/playground/selftest.html` | `200 text/html; charset=utf-8 11525 B` |
| `http://100.87.60.42:8080/bindings/web/pkg/pcx_circuit.wasm` | `200 application/wasm 180192 B` |

无参数默认行为（不传 `--host`）：

```text
$ node scripts/serve.mjs
静态服务已启动：http://localhost:8080
演示页：http://localhost:8080/bindings/web/demo.html
（Ctrl+C 停止）

$ ss -ltnp 'sport = :8080'
LISTEN 0  511  *:8080  *:*  users:(("MainThread",pid=204035,fd=21))

$ curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/bindings/web/playground/index.html
200
```

输出三行与改动前逐字一致，仍走 `listen(PORT)` 默认监听；并发路径未改。

参数校验（均为真实输出，退出码 2）：

| 命令 | 输出 |
|---|---|
| `node scripts/serve.mjs abc` | `参数错误：非法端口 "abc"（需为 1…65535 的整数）` ＋ 用法行 |
| `node scripts/serve.mjs 70000` | `参数错误：非法端口 "70000"（需为 1…65535 的整数）` ＋ 用法行 |
| `node scripts/serve.mjs 8080 --host` | `参数错误：--host 需要一个地址，例如 --host 0.0.0.0` ＋ 用法行 |
| `node scripts/serve.mjs 8080 --host bad_host` | `参数错误：非法主机地址 "bad_host"（需为 IPv4 / IPv6 / 主机名）` ＋ 用法行 |
| `node scripts/serve.mjs 8080 --host 999.1.1.1` | `参数错误：非法主机地址 "999.1.1.1"（需为 IPv4 / IPv6 / 主机名）` ＋ 用法行 |
| `node scripts/serve.mjs --bogus` | `参数错误：未知参数 "--bogus"` ＋ 用法行 |
| `node scripts/serve.mjs 8080 9090` | `参数错误：多余的参数 "9090"` ＋ 用法行 |

#### 10.3.2 浏览器验收（交付 3）

本机用 Chromium 153 headless（Playwright）从 `http://100.87.60.42:8080/...` 打开页面；浏览器控制台无未捕获异常，以下数值为页面接点表实际读数。

| 项 | 本机结论 | 证据 |
|---|---|---|
| **D-1** | 通过：空网表 `器件 0 ｜ 接点 0 ｜ 导线 0 ｜ 诊断 0`，诊断栏「正常」，无红条、无控制台异常 | [m67-empty-canvas-tailnet.jpg](../bindings/web/playground/evidence/m67-empty-canvas-tailnet.jpg) |
| **D-2** | 通过：C3 状态 `器件 15 ｜ 接点 65 ｜ 导线 30`，无 error（仅 1 条 info）；selftest C3「初始」case 通过（M1 三相 0 A、KM1 释放） | [m67-sample-C3-tailnet.jpg](../bindings/web/playground/evidence/m67-sample-C3-tailnet.jpg) |
| **D-3** | 通过（本机浏览器操作，容差内）：按住 SB2 时 M1 三相 `5.00 A`、KM1 线圈 `26.35 mA`；松开后仍为 `5.00 A`，SB2 触点 3-4 已断开（自锁成立）。fixture 期望 `5.0156 A`，差 0.3%，在 `verification.md` §2 的 1% 容差内 | [m67-c3-press-sb2-tailnet.jpg](../bindings/web/playground/evidence/m67-c3-press-sb2-tailnet.jpg)、[m67-c3-selflock-tailnet.jpg](../bindings/web/playground/evidence/m67-c3-selflock-tailnet.jpg) |
| **D-4** | 通过（本机浏览器操作，容差内）：C3 自锁后按住 SB3，M1 三相 `0.22 µA`、KM1 线圈 `0.29 µA`；低于 1 mA 绝对容差，按 0 A 处理 | 接点表实读（无单独截图） |
| **D-5** | 待负责人按 §10.1 操作（删 `KM1.13–SB3.2` 后重复 D-3） | — |
| **D-6** | 待负责人按 §10.1 操作（宽松 / 严格缺 `PE` 的页面文案）；严格模式判据由 selftest C3「删 N→PE」case 覆盖 | selftest 表 C3 |
| **D-7** | 待负责人按 §10.1 操作（页面红字短路）；短路判据由 selftest C3「L1–L2 直连」case 覆盖 | selftest 表 C3 |
| **D-8** | 待负责人按 §10.1 操作（清空 30 条导线） | — |
| **D-9** | 待负责人按 §10.1 操作（逐条重接 30 条） | — |
| **D-10** | 待负责人按 §10.1 操作（悬停 65 个接点） | — |
| **D-11** | 待负责人按 §10.1 操作（15 类器件各放置 1 台） | — |
| **D-12** | 待负责人按 §10.1 操作（拖动器件后松手） | — |
| **D-13** | 待负责人按 §10.1 操作（删除带线器件） | — |
| **D-14** | 待负责人按 §10.1 操作（星形回路） | — |
| **D-15** | 通过：selftest `通过 28 / 28`，0 红行，与 `node scripts/playground-check.mjs` 的 `28/28` 结论一致 | [m67-selftest-tailnet.jpg](../bindings/web/playground/evidence/m67-selftest-tailnet.jpg) |
| **D-16** | 待负责人按 §10.1 操作（380 → 220 V）；M6.5 片有历史截图 `c3-380to220-m1-current.jpg`，本片未重测 | — |
| **D-17** | 待负责人按 §10.1 操作（KT 3000 → 0 ms 的应用时钟）；数值判据由 selftest C6「2990 / 3000 ms」两 case 覆盖 | selftest 表 C6 |
| **D-18** | 通过（本机浏览器逐个加载）：C1…C10 均无红条、控制台无异常；初始态判据另由 `playground-check` 的 `28/28` 覆盖 | 下方实读状态 |
| **D-19** | 判据覆盖：`node scripts/playground-check.mjs` 的 `M-01…M-20` 全过；页面对自连 / 重复线 / 未知接点的中文提示待负责人在 D-20 时抽样确认 | 命令输出 |
| **D-20** | **待负责人人工确认**：本片未从另一台 tailnet 设备代验，不伪造另一台设备的结果 | — |

D-18 逐样例实读状态（均 `bannerHidden=true`、控制台错误 0）：

```text
C1   器件 5   ｜ 接点 27 ｜ 导线 12 ｜ 诊断 1（info）
C2   器件 7   ｜ 接点 41 ｜ 导线 19 ｜ 诊断 1（info）
C3   器件 15 ｜ 接点 65 ｜ 导线 30 ｜ 诊断 1（info）
C4   器件 8   ｜ 接点 47 ｜ 导线 24 ｜ 诊断 1（info）
C5   器件 7   ｜ 接点 53 ｜ 导线 28 ｜ 诊断 1（info）
C6   器件 5   ｜ 接点 29 ｜ 导线 14 ｜ 诊断 1（info）
C7   器件 6   ｜ 接点 41 ｜ 导线 19 ｜ 诊断 1（info）
C8   器件 5   ｜ 接点 25 ｜ 导线 13 ｜ 诊断 1（info）
C9   器件 6   ｜ 接点 39 ｜ 导线 18 ｜ 诊断 1（info）
C10  器件 7   ｜ 接点 45 ｜ 导线 22 ｜ 诊断 1（info）
```

D-15 / D-19 的命令输出：`node scripts/playground-check.mjs` → 结构 `10/10`、几何 `15/15` 类（`32/32` 配置）、复算 `28/28`、误接 `20/20`；`node --test bindings/web/playground/test/` → `122` 项全过。
