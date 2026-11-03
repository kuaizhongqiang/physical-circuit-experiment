# 05 构建、打包与发布

读者：AI
类型：流程
权威：从源码到"可交付四件套"再到 GitHub Release 的固定动作
状态：2026-11-03 建立；2026-11-03 补 tag 发布流水线
依赖：`../../docs/integration.md` §5、`../../docs/architecture.md` §6、`.github/workflows/release.yml`

## 1 两种交付，别混

| 场景 | 动作 | 产物去向 |
|---|---|---|
| **本地联调** | `node scripts/build.mjs` | `target/…/pcx_circuit.dll`、`bindings/web/pkg/pcx_circuit.wasm`（**不入库**） |
| **对外发布** | 打 tag → `release.yml` 自动跑 | GitHub Release 附件（两个 zip ＋ 两个裸产物） |

**发布不是 `git push`**：产物不入库（`AGENT.md` §2），发布是流水线把产物挂到 Release。

## 2 发布（推荐：一条命令）

```bash
# 版本号必须与 Cargo.toml 的 [workspace.package].version 完全一致
gh workflow run release.yml -f version=v0.0.0
gh run list --workflow release.yml --limit 1
gh run watch <run-id>
```

流水线做六件事：

1. **版本一致性检查**：`tag` 去掉 `v` 后必须等于 `Cargo.toml` 的 `version`，不等直接失败（防止 tag 与产物版本漂移）；
2. `cargo fmt --check` ＋ `cargo clippy -D warnings` ＋ `cargo test --workspace`；
3. 构建 `pcx_circuit.dll`（`x86_64-pc-windows-msvc`）与 `pcx_wasm.wasm`（`wasm32-unknown-unknown`）；
4. `node scripts/compare.mjs` 双端比对（28 个 case）；
5. 打两个 zip：`pcx-unity-<tag>.zip`（DLL ＋ C# ＋ `api.md`/`integration.md`）、`pcx-web-<tag>.zip`（wasm ＋ JS ＋ demo ＋ `C3.json`）；
6. `gh release create --generate-notes --target main`，并附两个裸产物。

## 3 发布（备选：直接推 tag）

```bash
git tag v0.0.1 -m "pcx v0.0.1"
git push origin v0.0.1        # 触发 release.yml 的 push.tags
```

tag 已存在时流水线会自动改为 `gh release upload --clobber`，不会因为重复发布而失败。

## 4 判定成功

- Release 页面挂出 4 个附件（两个 zip ＋ dll ＋ wasm），`--generate-notes` 生成的变更列表非空；
- 下载 `pcx-unity-<tag>.zip` 解压后 `pcx_circuit.dll` 能放进 `<Unity>/Assets/Plugins/x86_64/`；
- 下载 `pcx-web-<tag>.zip` 解压后用任意静态服务器能打开 `demo.html`。

## 5 明文禁止

| 禁止 | 原因 |
|---|---|
| 把 `*.dll` / `*.wasm` / `pkg/` 提交进仓库 | 仓库只放源码与脚本；二进制入库会让 diff 失去意义 |
| 手写 `.meta` 文件 | GUID 由 Unity 生成，手写会导致满屏 Missing Script（`AGENT.md` §2） |
| 发 npm 包 | 本期明确不发（`D-20261103-08`） |
| 用 `--admin` / 强推绕过 `main` 保护去"补一个 tag" | tag 不需要 PR，但**代码**永远要 |
| 手工改 tag 与版本号的一致性 | 版本一致性由流水线守，手工改等于绕过门禁 |
