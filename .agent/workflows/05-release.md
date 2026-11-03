# 05 交付四件套

读者：AI
类型：流程
权威：把库交付到 Unity 工程与 Web 页面的固定动作
状态：2026-11-03 建立（M3 起生效）
依赖：`../../docs/integration.md`、`../../docs/architecture.md` §6

## 1 交付物清单

| 端 | 四件套 | 来源 |
|---|---|---|
| Unity | `pcx_circuit.dll` ＋ C# 接口 ＋ Mono 样例 ＋ 文档 | `crates/cabi` 构建 ＋ `bindings/csharp` |
| Web | `*.wasm` ＋ JS/TS 接口 ＋ 样例 ＋ 演示页 | `crates/wasm` ＋ `bindings/web` |

**发布不是 `git push`**：产物不入库（`AGENT.md` §2），交付是**跑脚本产出并拷到使用方工程**。

## 2 步骤

```powershell
# 1) 内核先过门禁
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings

# 2) 构建 Windows DLL
cargo build -p pcx-cabi --release --target x86_64-pc-windows-msvc

# 3) 构建 wasm
wasm-pack build crates/wasm --target web --out-dir ../../bindings/web/pkg

# 4) 双端比对（必须字节一致）
node scripts/compare.mjs

# 5) 拷贝到使用方工程（脚本会跳过 .meta，交给 Unity 生成）
powershell -File scripts/copy-unity.ps1 -Target "D:\Path\To\UnityProject"
```

## 3 判据

- `ABI_VERSION` 与 C# / TS 封装的常量一致（不一致会直接 `E_VERSION`）。
- `Marshal.SizeOf` 与 `api.md` 标注的字节数**在启动时断言**，任何一处不符立即抛。
- 同一 `fixtures/C*.json` 在 Rust / Unity / wasm 三处结果**字节一致**。
- 演示页打开即可交互，无需任何本地服务。

## 4 明文禁止

| 禁止 | 原因 |
|---|---|
| 把 `*.dll` / `*.wasm` / `pkg/` 提交进仓库 | 仓库只放源码与脚本；二进制入库会让 diff 失去意义 |
| 手写 `.meta` 文件 | GUID 由 Unity 生成，手写会导致满屏 Missing Script（`AGENT.md` §2） |
| 在拷贝脚本里 `git add` | 交付与版本管理是两件事 |
| 发 npm 包 | 本期明确不发（`D-20261103-08`） |
| 为移动端 / WebGL 打包 | 本期只覆盖 Windows Editor（同上） |
