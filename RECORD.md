# RECORD — 已进入仓库的提交

读者：AI / 负责人
类型：台账
权威：已提交变更的唯一清单
状态：2026-11-03 建立；已登记 `R-01`、`R-02`、`R-03`
依赖：`DECISION.md`（口径来源）

## 0 写法

- **只追加，不改旧条**。编号 `R-NN` 顺序递增。
- 一行一条：`R-NN` ＋ 提交哈希短号 ＋ 提交信息首行 ＋ 触及的主要路径。
- 不写待办、不写缘由（缘由在提交信息里）。
- ⚠️ **滞后登记**：squash 合并后的提交号在**合并之后**才产生，所以本次 PR 无法登记自己。
  规则是 **下一个 PR 补登记上一次合并的提交**。只追一条的滞后可以接受，不许形成"永远差两条"。

## 1 记录

| 编号 | 提交 | 信息首行 | 主要路径 |
|---|---|---|---|
| `R-01` | `e349c91` | `chore(repo): 初始化工程手册、设计文档与 agent 工具链` | `AGENT.md` `CODEBUDDY.md` `README.md` `.gitignore` `TODO.md` `DECISION.md` `RECORD.md` `docs/`(10) `.agent/`(19) `.github/`(7) |
| `R-02` | `7d1d13d` | `docs(record): 登记 R-01 并补记 RECORD 的滞后登记规则 (#30)` | `RECORD.md` `.github/workflows/ci.yml`（PR 全流程验证：分支 → PR → squash → 删分支） |
| `R-03` | `7ada698` | `docs(repo): 记录 CI 自动触发未生效的口径与对策 (#31)` | `DECISION.md`（D-27）`AGENT.md` §3 `.agent/notes/github-actions-triggers.md` `.agent/skills/doc-guard/check.mjs` |
