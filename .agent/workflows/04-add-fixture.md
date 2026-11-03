# 04 新增一个黄金案例（fixture）

读者：AI
类型：流程
权威：`fixtures/C*.json` 的写法与验收挂钩方式
状态：2026-11-03 建立
依赖：`../../docs/verification.md`、`../../docs/domain-model.md` §4、`../samples/fixture.example.json`

## 1 fixture 是判据，不是数据

一份 fixture 同时服务三个宿主（Rust 单测 / Unity 样例 / 演示页），所以它必须自带**期望值**和**容差**，否则三处各写各的断言，等价性就没法比。

## 2 字段要求

| 字段 | 必填 | 说明 |
|---|---|---|
| `case` | ✅ | `C1…C10`，与 `verification.md` 编号一致 |
| `baseline_source` | ✅ | `自建` 或教材出处；换教材时要能追到源头（`verification.md` §6） |
| `devices[]` | ✅ | `ref`（位号，仅供显示）/ `kind` / `id` / `terminal_base` / `aux` / `params[8]` |
| `wires[]` | ✅ | `{a, b}` 接点 id |
| `requests[]` | 可选 | 按需查询的接点 / 器件 id |
| `cases[]` | ✅ | 每个 case：`name` / `set`（按位号覆盖 `state_bits`·`flags`·`elapsed_ms`·`rpm`）/ `add_wires`·`drop_wires` / `expect_code` / `expect` / `expect_devices` |
| `expect` | ✅ | 键形如 `"M1:0"`（位号 + 局部接点序号），值 `{ "i_rms": 5.016, "tol": 0.01 }`；`tol` 为**相对**容差，小量用 `tol_abs` |

**硬性约定**：

- `terminal_base` 必须等于前面所有器件接点数的前缀和 —— 手写必错，用脚本算。
- 每份 fixture **必须含一个 `PE`**（严格模式规则，`solver.md` §4）。
- `expect` 里优先写关系（`ratio`、`is_zero`），其次才写绝对值 —— 换教材时关系断言不用改。

## 3 步骤

1. 在 `docs/verification.md` 的对应 `C?` 里先写清**断言什么**（不加数字也可以）。
2. 照 `../samples/fixture.example.json` 的结构写 `fixtures/C?.json`。
3. 跑 `cargo test`（fixture 驱动的用例会自动读到它）。
4. 三端比对：Rust / Unity 样例 / wasm（M3 之后有脚本）。
5. 把实测数字回填 `docs/verification.md` §3 的基线列；`baseline_source` 标 `自建`。

## 4 反例也要 fixture

每个 `C?` 至少配一条反例，放在同一文件里用 `expect_error` 表达：

- 删掉 `PE` → 严格模式下 `E_NO_REFERENCE`；
- 电源两相导线直连 → `E_SHORT_CIRCUIT`；
- 星三角两只接触器同时吸合 → `E_SHORT_CIRCUIT`；
- 把某个 `params` 改成负数 → `E_PARAM_RANGE`。

## 5 不许做的事

- **不许为了让断言通过而放宽容差**：容差是 `verification.md` §2 定的，改它属于口径变更。
- **不许把"已知不覆盖"当失败**：C8 的电流恒为 0 是设计结果（`verification.md` §5），只断言接线状态。
- **不许在 fixture 里写绝对路径或平台相关字段**。
