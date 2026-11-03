# GitHub Actions 自动触发在本仓库未生效（现象与排查）

读者：AI
类型：笔记
权威：本仓库 CI 触发能力的实测结论与当前对策
状态：2026-11-03 建立（实测，未解决；对策见 `../../DECISION.md` D-20261103-27）
依赖：`../../AGENT.md` §3、`../../.github/workflows/ci.yml`

## 1 现象

| 事件 | 是否产生运行 |
|---|---|
| `push`（含 main） | ❌ 0 条 |
| `pull_request`（opened / synchronize） | ❌ 0 条 |
| `workflow_dispatch` | ✅ 正常，三 job 全跑完 |

排查过的项，全部正常：

- 工作流已被识别：`/actions/workflows` 返回 1 条，`state: active`，路径 `.github/workflows/ci.yml`；
- Actions 未被禁用：`/actions/permissions` → `{enabled: true, allowed_actions: "all"}`；
- YAML 可执行：`gh workflow run ci` 成功并跑完 `guard` / `rust` / `wasm` 三个 job；
- 远端分支与 PR head 一致（`57517d1`），不存在"推了但没到"；
- 试过 `on.push` 去掉分支过滤、`on.pull_request` 显式 `types`，仍然 0 条。

## 2 关键坑：dispatch 的运行不算 PR 的状态检查

```bash
gh workflow run ci --ref <branch>     # 跑成功了
gh pr checks <n>                      # 仍然是 "no checks reported"
```

因为 `workflow_dispatch` 的运行不产生挂在 head sha 上的 check run，PR 的 `statusCheckRollup` 依然为空。
**所以"手动 dispatch 一下就能满足必需检查"是行不通的。**

## 3 当前对策

1. 分支保护只保留 **必需 PR ＋ 禁强推 ＋ 禁删除**，去掉必需状态检查（否则 `main` 永远合不进去，实测 `mergeState = BLOCKED`）。
2. **合并前手动跑一次 CI**：

   ```bash
   gh workflow run ci --ref <branch>
   gh run list --limit 3
   gh run watch <run-id>
   ```

3. 把结果贴进 PR 的"分支与检查"一栏（勾选 `guard` 已绿）。
4. 等自动触发恢复后，把 `guard` 加回必需检查，删掉这条对策（`TODO.md` T-14）。

## 4 下次再遇到先查这三条

```bash
gh api repos/{owner}/{repo}/actions/workflows      # 工作流是否 active
gh api "repos/{owner}/{repo}/actions/runs?event=push"        # 有没有 push 运行
gh api "repos/{owner}/{repo}/actions/runs?event=pull_request" # 有没有 PR 运行
```

三条都是 0 且 dispatch 能跑 → 就是本笔记记录的情况，不要再折腾 YAML。
