# api — 双端 ABI 契约与错误码

读者：AI / 负责人
类型：契约
权威：C ABI 结构体布局、函数签名、错误码、状态位、版本策略的唯一事实源
状态：2026-11-03 首版（未实现；改本文件必须与 C# / TS 绑定同批提交）
依赖：`../DECISION.md`（D-07/D-12/D-15/D-17）、`domain-model.md`、`solver.md`

## 1 约定

- 导出前缀 `pcx_`，库名 `pcx_circuit`（DLL `pcx_circuit.dll`）。
- 全部 `extern "C"`，`double` 为 `f64`，**禁用 `float`**（D-20261103-13）。
- **无全局状态**：所有函数可并发调用，每次 `solve` 自成一体（D-20261103-12）。
- **库不改任何输入缓冲**（入参全 `const`）。
- **错误不抛异常**：一律返回 `uint32_t` 错误码（D-20261103-07）。
- **文案不进库**：库只回码 ＋ 定位（`device_id` / `terminal_id`），中文说明在 C# / TS 绑定层各一张映射表。

## 2 结构体布局

Unity（C# `[StructLayout(LayoutKind.Sequential)]`）与 wasm（`#[repr(C)]`）必须字节一致。字段顺序即下表顺序，**新增字段只能追加到末尾并同时升 `ABI_VERSION`**。

### 2.1 `pcx_device_t`（88 字节）

| 偏移 | 字段 | 类型 | 含义 |
|---|---|---|---|
| 0 | `params[8]` | `double[8]` | 器件参数，语义见 §2.4 |
| 64 | `id` | `uint32` | 应用给定，全表唯一 |
| 68 | `terminal_base` | `uint32` | 接点前缀和（`domain-model.md` §1） |
| 72 | `elapsed_ms` | `uint32` | `KT` / `FR` 的累积时间，由应用推进 |
| 76 | `reserved0` | `uint32` | 必须为 0 |
| 80 | `state_bits` | `uint16` | 触点状态位，见 §3 |
| 82 | `rpm` | `uint16` | 该器件所在 `shaft_group` 的转速（`KS` / `M` 用） |
| 84 | `kind` | `uint8` | 1…15，见 `domain-model.md` §2 |
| 85 | `shaft_group` | `uint8` | 共轴分组标签，`0` = 不共轴 |
| 86 | `aux` | `uint8` | `QS.poles` / `KM.aux_no·4+aux_nc` / `TB.n` / `SB·SQ.type` |
| 87 | `flags` | `uint8` | bit0 = `state_bits` 语义位（应用给 1 / 库解 0） |

### 2.2 `pcx_wire_t`（8 字节）

| 偏移 | 字段 | 类型 | 含义 |
|---|---|---|---|
| 0 | `a` | `uint32` | 接点 id |
| 4 | `b` | `uint32` | 接点 id |

### 2.3 `pcx_config_t`（64 字节，全部可为 `0` = 用 `solver.md` §5 缺省）

| 偏移 | 字段 | 对应常量 |
|---|---|---|
| 0 | `v_line` | `N-10` |
| 8 | `freq_hz` | `N-10` |
| 16 | `r_src` | `domain-model.md` §4 |
| 24 | `r_contact` | `N-02` |
| 32 | `r_open` | `N-03` |
| 40 | `i_open_a` | `N-04` |
| 48 | `i_over_a` | `N-05` |
| 56 | `tol` | `N-07` |

### 2.4 `params[8]` 的逐器件语义

| kind | `params[0..]` |
|---|---|
| `POWER` | `v_line`, `freq_hz`, `r_src`, `phase_seq`（+1 正序 / -1 负序）, 其余 0 |
| `QS` / `FU` / `SB` / `SQ` | `r_contact`, 其余 0 |
| `KM` / `KA` | `coil_r`, `coil_x`, `pick_current`, `drop_current`, `r_contact`, 其余 0 |
| `KT` | `coil_r`, `coil_x`, `pick_current`, `drop_current`, `r_contact`, `delay_ms`, 其余 0 |
| `KS` | `n_pick`, `n_drop`, `r_contact`, 其余 0 |
| `FR` | `r_thermal`, `set_current`, `delay_ms`, `r_contact`, 其余 0 |
| `M` | `r_phase`, `x_phase`, 其余 0 |
| `R` | `resistance`, 其余 0 |
| `EL` | `rated_voltage`, `power`, 其余 0 |
| `TB` / `PE` | 全 0 |

### 2.5 输入 / 输出

```c
typedef struct {
    const pcx_device_t* devices;   uint32_t device_count;
    const pcx_wire_t*   wires;     uint32_t wire_count;
    const uint32_t*     requested_terminals; uint32_t requested_terminal_count;
    const uint32_t*     requested_devices;   uint32_t requested_device_count;
    const pcx_config_t* config;            /* NULL = 全缺省 */
    uint32_t flags;                        /* bit0 STRICT_REFERENCE, 其余必须 0 */
    uint32_t reserved;                     /* 必须为 0 */
} pcx_input_t;
```

`requested_*` 为 `NULL` 或不填 = **全量返回**；填了则只返回所列 id，返回顺序与请求顺序一致（这是"按需查询"，D-20261103-07）。

`flags`：

| 位 | 名 | 语义 |
|---|---|---|
| bit0 | `STRICT_REFERENCE` | 置位 = 有源分量缺 `PE` 即报 `E_NO_REFERENCE`（**默认，`fixtures/` 与 Unity 样例必须置位**）；清零 = 以该分量 `POWER.N` 为隐含参考并给 `W_IMPLICIT_REFERENCE` 警告（仅演示页编辑中间态使用，D-20261103-25） |

```c
typedef struct {                       /* 40 字节 */
    uint32_t terminal_id;
    uint32_t flags;                    /* bit0 HAS_V, bit1 HAS_I, bit2 FLOATING */
    double   v_rms, v_phase_deg;
    double   i_rms, i_phase_deg;
} pcx_terminal_result_t;

typedef struct {                       /* 24 字节 */
    uint32_t device_id;
    uint16_t closed_bits;              /* 求解后的触点状态位 */
    uint16_t flags;                    /* bit0 吸合/动作 */
    double   coil_i_rms, coil_i_phase_deg;
} pcx_device_result_t;

typedef struct {                       /* 16 字节 */
    uint32_t code, level, device_id, terminal_id;   /* level: 0 info / 1 warn / 2 error */
} pcx_diag_t;

typedef struct {
    pcx_terminal_result_t* terminals;  uint32_t terminal_cap;
    pcx_device_result_t*   devices;    uint32_t device_cap;
    pcx_diag_t*            diags;      uint32_t diag_cap;
    uint32_t terminal_count;   /* out */
    uint32_t device_count;     /* out */
    uint32_t diag_count;       /* out */
} pcx_output_t;
```

**接点结果 `flags` 位**（每个接点必须给齐 4 个 `f64`，不存在"没有数据"的接点）：

| 位 | 名 | 语义 |
|---|---|---|
| bit0 | `HAS_V` | 该接点有电压结果（正常电路里恒为 1，含 `0 V` 的情形） |
| bit1 | `HAS_I` | 该接点所属器件有内部支路；`TB` / `PE` 这类无支路接点为 0，`i_rms` 填 0 |
| bit2 | `FLOATING` | 该接点属**无源孤立分量**，`v_rms` / `i_rms` 恒为 0，电压无物理定义（按约定输出 0，`solver.md` §4） |

## 3 `state_bits` 位映射

第 `k` 位 = 第 `k` 条**可变触点**闭合。位序按 `domain-model.md` §2 接点表顺序，**线圈与热元件不占位**。

| kind | 位序 |
|---|---|
| `QS` | `bit0..bit(poles-1)`：每极 |
| `SB` / `SQ` | `bit0` = `1-2`(NC)，`bit1` = `3-4`(NO) |
| `KM` | `bit0..2` = 主触点 `1-2/3-4/5-6`，`bit3` = `13-14`，`bit4` = `21-22`，`bit5` = `43-44`，`bit6` = `31-32` |
| `KA` | `bit0` = `13-14`，`bit1` = `21-22`，`bit2` = `43-44`，`bit3` = `31-32` |
| `KT` | `bit0` = `55-56`(延时闭合)，`bit1` = `67-68`(延时断开) |
| `KS` | `bit0` = `13-14`(正转)，`bit1` = `23-24`(反转) |
| `FR` | `bit0` = `95-96`(NC)，`bit1` = `97-98`(NO) |
| `FU` / `M` / `R` / `EL` / `TB` / `PE` / `POWER` | 无 |

- `flags.bit0 = 1`：`state_bits` 由**应用**给定（`QS` / `SB` / `SQ`），库按此求解，不推断。
- `flags.bit0 = 0`：`state_bits` 是**提示值**（`KM` / `KA` / `KT` / `KS` / `FR`），库可自解；给对了能加速收敛并延续滞环（`solver.md` §6），给 0 也能算。

## 4 函数

```c
uint32_t    pcx_abi_version(void);              /* 本期 = 1 */
const char* pcx_version(void);                  /* 语义版本串，静态生命周期，无需 free */
uint32_t    pcx_terminal_count(uint8_t kind, uint8_t aux);   /* 非法 kind/aux 返回 0 */
uint32_t    pcx_solve(const pcx_input_t* in, pcx_output_t* out);
```

### 4.1 `pcx_solve` 的两阶段调用（D-20261103-17）

```c
pcx_output_t out = {0};
uint32_t rc = pcx_solve(&in, &out);
/* rc == PCX_NEED_BUFFERS(1)：out.*_count 已填好，缓冲指针仍为 NULL */
term = malloc(out.terminal_count * sizeof(pcx_terminal_result_t));
...
out.terminals = term; out.terminal_cap = out.terminal_count;
out.devices   = dev;  out.device_cap   = out.device_count;
out.diags     = dg;   out.diag_cap     = out.diag_count;
rc = pcx_solve(&in, &out);
/* rc == PCX_OK(0) */
```

- **调用方分配、库只写、不导出 `free`**。
- 容量不足 → `E_BUFFER_TOO_SMALL(50)`，同时把所需数量写回 `*_count`，调用方可扩容重试。
- 库对每块缓冲做长度校验后写入，**绝不按调用方声明长度盲写**。

## 5 错误码

返回码（`pcx_solve` 的返回值）：

| 码 | 名 | 含义 |
|---|---|---|
| 0 | `PCX_OK` | 成功 |
| 1 | `PCX_NEED_BUFFERS` | 非错误：只需先取数量 |
| 10 | `E_INVALID_ARG` | 空指针、`reserved0 != 0`、请求 id 数与指针矛盾 |
| 11 | `E_UNKNOWN_KIND` | `kind` 不在 1…15 |
| 12 | `E_DUPLICATE_ID` | 器件 `id` 重复 |
| 13 | `E_PARAM_RANGE` | 参数越界（负电阻、`aux` 越界等） |
| 14 | `E_TERMINAL_RANGE` | `terminal_base` 与 `pcx_terminal_count` 不符 / 导线端点越界 |
| 15 | `E_TERMINAL_LIMIT` | 接点总数 > 1024 |
| 16 | `E_VERSION` | 绑定层 `ABI_VERSION` 与库不一致 |
| 20 | `E_NO_REFERENCE` | 某连通分量没有 `PE`（`solver.md` §4） |
| 21 | `E_MULTI_REFERENCE` | 同一分量多个 `PE` |
| 30 | `E_SINGULAR_MATRIX` | 矩阵奇异 / 残差超限 |
| 31 | `E_OSCILLATION` | 开关迭代表不收敛 |
| 40 | `E_SHORT_CIRCUIT` | 拓扑短路（`solver.md` §7） |
| 50 | `E_BUFFER_TOO_SMALL` | 缓冲不足 |

诊断码（只出现在 `pcx_output_t.diags`，不影响返回码）：

| 码 | 级 | 名 | 含义 |
|---|---|---|---|
| 100 | warn | `W_OVERCURRENT` | 支路电流 > `i_over_a`（电机启动属正常，不判失败） |
| 101 | warn | `W_OPEN_CIRCUIT` | 期望导通的支路电流 < `i_open_a`（多半是接线漏了） |
| 102 | warn | `W_IMPLICIT_REFERENCE` | 宽松模式下有源分量缺 `PE`，已用该分量 `POWER.N` 作隐含参考（`solver.md` §4） |
| 103 | info | `W_ISOLATED_IGNORED` | 存在 N 个无源孤立分量已跳过（`terminal_id` 填其中一个代表接点，`device_id` 填 `0xFFFFFFFF`） |
| 200 | error | 同返回码 | 失败时把返回码同时写一条 error 诊断并带定位 |

**定位要求**：每条 error 诊断必须能指到 `device_id` ＋ `terminal_id`（找不到具体接点时取 `0xFFFFFFFF`）。这是"报错能告诉人哪根线接错了"的底线。

## 6 版本与兼容策略

- `ABI_VERSION` 单独导出为常量，**不塞进任何结果结构体**（D-20261103-15）。
- **一期采用精确匹配**：绑定层在初始化时比对 `pcx_abi_version()`，不一致直接 `E_VERSION`。因为 DLL 与 C#/TS 封装永远同批发布，"宽容兼容"只会掩盖错误。
- **二期瞬时值**：新增结构体 ＋ 新函数，**不改一期结构体字段语义**；因此二期上线后，只用一期的调用方无需改代码。
- 结构体只允许**末尾追加字段 ＋ 升版本**；已有字段的含义与偏移永不变动。

## 7 并发与确定性

- 无全局状态 → 多个线程可各自调用 `pcx_solve`；同一 `pcx_output_t` 不得并发写。
- 同一输入（字节级相同）必须得到**字节级相同**的输出（`AGENT.md` §2 确定性）；`fixtures/` 回归比对的就是结果数组的字节。
