# .agent — agent 操作目录

读者：AI
类型：索引
权威：agent 的操作流程、技能脚本、样例与踩坑笔记的唯一入口
状态：2026-11-03 建立（M0 之前，脚本为空实现友好）
依赖：`../AGENT.md`（纪律）、`../docs/`（工程内容）、`../TODO.md`（待办台账）

`AGENT.md` 管**纪律**，`docs/` 管**工程内容**，本目录管**怎么动手**：流程怎么走、脚本怎么跑、模板长什么样。

## 1 分工

| 子目录 | 放什么 | 不放什么 |
|---|---|---|
| `workflows/` | 可照着执行的流程（步骤 ＋ 判据） | 工程口径（那在 `docs/`） |
| `skills/` | 能直接跑的脚本 ＋ 一份 `SKILL.md` | 一次性临时脚本 |
| `samples/` | 提交信息、PR、issue、fixture 的**可复制模板** | 真实数据（真实数据在 `fixtures/`） |
| `notes/` | 踩过的坑（一条一个文件） | 设计决策（那在 `DECISION.md`） |

## 2 流程索引

| 场景 | 去哪 |
|---|---|
| 接一个新任务，第一步做什么 | `workflows/00-task-loop.md` |
| 推进里程碑、过门禁 | `workflows/01-milestone.md` |
| 开分支、提交、开 PR、等 CI、squash 合并 | `workflows/02-commit.md` |
| 新增 / 修改一个元器件类型 | `workflows/03-add-device.md` |
| 新增一个黄金案例（fixture） | `workflows/04-add-fixture.md` |
| 产出交付四件套 | `workflows/05-release.md` |

## 3 技能索引

| 技能 | 干什么 | 入口 |
|---|---|---|
| **doc-guard** | 校验文档地图、台账编号、AGENT 索引引用是否自洽；CI 第一个 job 就跑它 | `node .agent/skills/doc-guard/check.mjs` |
| **gh-plan** | 从 `plan.json` 幂等地建立 GitHub 标签 / 里程碑 / issue | `node .agent/skills/gh-plan/apply.mjs` |

两个脚本**零依赖**（只用 Node 内置模块 ＋ `gh` CLI），不需要 `npm install`。

## 4 样例索引

| 样例 | 用途 |
|---|---|
| `samples/commit-message.txt` | 提交信息模板（中文走文件，不进命令行） |
| `samples/pr-body.md` | PR 描述模板（与 `.github/pull_request_template.md` 同源） |
| `samples/issue-task.md` | 任务 issue 正文模板 |
| `samples/fixture.example.json` | 黄金案例 JSON 的**结构样例**（不是真实案例，真实案例在 `fixtures/`） |

## 5 笔记索引

| 笔记 | 记的什么 |
|---|---|
| `notes/powershell-encoding.md` | PowerShell 5.1 的编码与语法坑（`.ps1` 必须 UTF-8 with BOM） |
| `notes/gh-cli.md` | gh CLI 建里程碑 / issue / 中文安全的写法 |

## 6 维护规则

- `workflows/` 与 `skills/` 里的步骤必须**可执行、可判真假**；写"要仔细""要注意"这类话等于没写。
- 新增技能必须同时有 `SKILL.md`（说清何时用、怎么调、输出什么），并在本文件 §3 登记。
- 踩坑笔记一条一个文件，文件名用现象命名（`powershell-encoding.md` 而不是 `坑1.md`）。
- 本目录的内容**不是**工程口径；与 `docs/` 冲突时以 `docs/` 为准，并就地修正本目录。
