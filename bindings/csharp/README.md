# bindings/csharp — Unity 侧四件套

DLL ＋ C# 接口 ＋ Mono 样例 ＋ 文档（`docs/integration.md` §3）。

## 1 落位

```
<Unity 工程>/
├── Assets/Plugins/x86_64/pcx_circuit.dll     ← 由 scripts/build.mjs 产出后拷贝
└── Assets/PcxCircuit/
    ├── PcxNative.cs      C ABI 1:1 映射（布局与 docs/api.md §2 逐字节一致）
    ├── PcxCircuit.cs     托管门面：Pcx.Initialize / Pcx.Solve
    ├── ErrorText.cs      错误码 → 中文（文案只在绑定层）
    └── Sample_TwoLocationControl.cs   C3 两地控制样例
```

- **`.meta` 一律交给 Unity 生成**，禁止手写（`AGENT.md` §2）。
- 只覆盖 **Windows Editor**；其他平台编译期就该报错，不要静默降级。

## 2 产出 DLL

```bash
cargo build -p pcx-cabi --release --target x86_64-pc-windows-msvc
# → target/x86_64-pc-windows-msvc/release/pcx_circuit.dll
```

## 3 用法

```csharp
Pcx.Pcx.Initialize();                 // 校验 ABI 版本与结构体字节数，不一致立刻抛

var n = new Pcx.Netlist { VLine = 380, FreqHz = 50, StrictReference = true };
var km = new Pcx.DeviceSpec { Ref = "KM1", Kind = Pcx.Kinds.Km, Id = 7, Aux = 5, Flags = 1 };
km.Params[0] = 12000; km.Params[1] = 8000; km.Params[2] = 0.02; km.Params[3] = 0.012;
n.Devices.Add(km);
n.Wires.Add(new Pcx.Wire(26, 22));

Pcx.SolveResult r = Pcx.Pcx.Solve(n);
if (!r.Ok) Console.WriteLine(Pcx.ErrorText.Of(r.Code));
var t = r.Terminal(38);               // 38 = M1.U1
Console.WriteLine($"{t.VRms:F1} V / {t.IRms * 1000:F2} mA");
```

- `TerminalBase` **由 `Solve` 按接点数前缀和填充**，不要手写。
- 结果里每个接点都有 4 个 `double` ＋ `flags`：`HasI = false` 表示该接点没有内部支路（端子排 / 接地），`Floating = true` 表示它属无源孤立分量（电压按 0 输出）。

## 4 时钟

库**不持时钟**（`DECISION.md` D-20261103-12）。Unity 侧自己按固定步长累加：

```csharp
const float DT = 0.01f;
float acc;
void Update() {
    acc += Time.deltaTime;
    while (acc >= DT) { StepOnce(DT); acc -= DT; }
}
```

`StepOnce` 里做四件事：`KT.elapsed_ms` 累加 / `FR.elapsed_ms` 累加 / `rpm` 由应用算 / 把上一轮 `closed_bits` 作为下一轮提示传回（延续滞环）。

## 5 样例

`Sample_TwoLocationControl.cs` 是 C3 的完整网表（15 器件 / 30 导线）＋ 四个步骤（初始 / 启动 / 自锁 / 停止）。
纯 C#、不依赖 UnityEngine，可直接 `dotnet build` 校验；搬进 Unity 时把 `Console.WriteLine` 换成 `Debug.Log`。

期望输出：启动后 `M1.U1 = 219.4 V / 5.02 A`，`KM1` 线圈 `26.35 mA`、吸合。
