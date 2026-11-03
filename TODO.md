# TODO — 还没做 / 待拍板

读者：AI / 负责人
类型：台账
权威：**待办与待拍板项的唯一清单**
状态：2026-11-03 — M0–M4 已落地（28 个 fixture case 全绿、双端比对通过）；`§1` 当前无待拍板项
依赖：`AGENT.md`（纪律）、`docs/README.md`（文档地图）、`docs/roadmap.md`（里程碑与门禁）、`DECISION.md`（已定口径）

## 0 用法

- **§1 待拍板（P-NN）**：只有负责人能定口径。AI **不得**自行选一个继续往下写；未拍的条目不写进 `DECISION.md`。
- **§2 待办（T-NN）**：我方动作，不需要拍板即可做；括号里是它所属里程碑。
- 做完 / 拍板即**同批删掉**该条（拍板的同时在 `DECISION.md` 追加 `D-YYYYMMDD-NN`）。不写缘由、不写提交号、不留"已完成"。
- 新增待拍板项一律追加到 §1 末尾，**编号不复用**（P-01…P-22 已用尽，从 P-23 起）。

## 1 待拍板

**（无）** 口径已全部拍板：`DECISION.md` D-20261103-01…28。新问题出现时按编号 P-23 起追加于此。

## 2 待办

### M5 交付收口（门禁 G5）

- **T-13** 三份 README 写清接入方式（`bindings/csharp`、`bindings/web`、仓库根补"已可运行"段落）；`RECORD.md` 补齐 `R-04` 起的登记；演示页按 `docs/demo.md` §10 / §10.1 的人工验收 D-1…D-14 跑一遍并记录结果。

### 仓库流程（无里程碑）

- **T-14** 等 GitHub 侧 push / pull_request 事件能正常产生 Actions 运行后，把 `guard` 加回 `main` 的必需状态检查（`required_status_checks.contexts = ["guard"]`），并删掉 `.agent/notes/github-actions-triggers.md` 里的手动 dispatch 对策。判据：开一个 PR，`gh pr checks` 能看到 `guard` 且能合并。
