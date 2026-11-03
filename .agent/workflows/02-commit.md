# 02 分支、提交与 PR

读者：AI
类型：流程
权威：从改动到合入 `main` 的固定动作（`main` 受保护，禁止直推）
状态：2026-11-03 建立；2026-11-03 改为 PR 流程
依赖：`../../AGENT.md` §3、`../../DECISION.md`、`../../RECORD.md`

## 0 铁律

**`main` 不能直接推。** 所有改动走 `分支 → PR → CI 绿 → squash merge`。
直推会被 GitHub 拒绝（分支保护：必需 PR ＋ 必需检查 `guard` ＋ 禁强推 ＋ 禁删除）。

唯一例外是**仓库还没有任何提交时的 bootstrap**，之后不再有例外。

## 1 开工前 60 秒

```powershell
git --no-pager status --short          # 确认改动范围
git --no-pager diff --stat             # 确认没混进 target/ pkg/ *.dll
node .agent/skills/doc-guard/check.mjs # 文档与台账自洽
```

`doc-guard` 失败**必须先修**：它查的正是"文档说了但文件不在"这类返工源。

## 2 开分支

```powershell
git switch main
git pull --ff-only
git switch -c docs/repo-init          # feat/… fix/… docs/… chore/…
```

一个逻辑变更一个分支。**不要**在一个分支里混两件不相关的事 —— squash 后会变成一个语义混乱的提交。

## 3 暂存与提交（中文必须走文件）

```powershell
# 只加具体路径，禁止 git add -A / git add .
git add AGENT.md docs/solver.md crates/core/src/mna.rs

# 说明写进 UTF-8 文件（模板见 ../samples/commit-message.txt）
notepad .git\COMMIT_MSG_TMP.txt
git commit -F .git\COMMIT_MSG_TMP.txt

# 回读原始字节复核（控制台回显不可信）
git --no-pager log -1 --format=%B
```

格式：`type(scope): 描述`，type ∈ `feat|fix|chore|refactor|docs|test|build`，
scope ∈ `core|cabi|wasm|csharp|web|contract|docs|ci|repo`，破坏性变更带 `!`。

## 4 推送并开 PR（标题从提交取，中文不进命令行）

```powershell
git push -u origin docs/repo-init

# --fill 用提交信息首行当标题、正文当 body，避免把中文拼进命令参数
gh pr create --fill --base main --head docs/repo-init --body-file .git\PR_BODY.txt
```

- PR body 用 `.github/pull_request_template.md` 的字段；写好放 UTF-8 文件，用 `--body-file` 传。
- **不要**用 `gh pr create --title "中文"`：本机代码页 936，命令行中文会被就地转码。
- 需要改标题时用 `gh pr edit <n> --body-file …` 改 body，标题保持与提交首行一致。

## 5 等 CI 绿再合并

```powershell
gh pr checks --watch          # 三个 job：guard / rust / wasm
```

| 情况 | 处置 |
|---|---|
| `guard` 红 | 本地跑 `node .agent/skills/doc-guard/check.mjs` 修完再推 |
| `rust` / `wasm` 红 | 修代码；M0 之前只会有 notice 跳过，那是预期 |
| **红了还要合** | 不允许。判据不迁就实现（`01-milestone.md` §3） |

## 6 合并

```powershell
gh pr merge --squash --delete-branch
git switch main
git pull --ff-only
git --no-pager log -1 --format='%h %s'   # 取短号写进 RECORD
```

- **squash merge**：`main` 保持线性，历史是一个逻辑变更一个提交。
- 合并后删分支，本地也删：`git branch -d docs/repo-init`（远端已由 `--delete-branch` 删除）。

## 7 台账同步（漏一条等于没做）

| 台账 | 这次要不要动 | 判据 |
|---|---|---|
| `TODO.md` | 完成的 `T-NN` 删除；新歧义登记 `P-NN` | 做完即删，不留"已完成" |
| `DECISION.md` | 有新拍板口径就追加 `D-YYYYMMDD-NN` | 只追加，不改旧条 |
| `RECORD.md` | 合并后登记 `R-NN`（squash 后的短号 ＋ 首行 ＋ 主要路径） | 只追加 |

台账本身也需要一次 PR —— **不能**因为"只是改台账"就直推 `main`。

## 8 常见拒绝与原因

| 报错 | 原因 |
|---|---|
| `GH006: Protected branch update failed` | 试图直推 `main`，改走 PR |
| PR 一直显示 "Expected — Waiting for status to be reported" | CI 没触发：确认改动触及 `.github/workflows/`，或 `guard` job 的 key 被改名了 |
| `gh pr merge` 提示 checks 未通过 | 先 `gh pr checks` 看是哪个 job，别用 `--admin` 绕过 |
